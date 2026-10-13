
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminAuth, firebaseAdminDb } from "@/lib/firebaseAdmin";
import type {
  CertificateHolding,
  CocoaLot,
  QRCode,
} from "@/types/traceability";

export const runtime = "nodejs";

const ALLOWED_POST_FIELDS = new Set([
  "holdingId",
  "representedQuantityKg",
  "qrGroupId",
]);

function statusForError(message: string): number {
  if (message.startsWith("Validation Error")) return 400;
  if (message.startsWith("Authorization Error")) return 403;
  if (message.startsWith("Holding Error") && message.includes("does not exist")) {
    return 404;
  }

  if (
    message.startsWith("Holding Error") ||
    message.startsWith("Certificate Error") ||
    message.startsWith("Lot Error") ||
    message.startsWith("Capacity Error") ||
    message.startsWith("Sequence Error")
  ) {
    return 409;
  }

  return 500;
}

function assertHoldingAccess(
  holding: CertificateHolding,
  uid: string,
  isAdmin: boolean
): void {
  if (isAdmin) return;

  // Until a trusted server-side organization membership verifier exists,
  // organizational holdings are deliberately denied to non-admin users.
  if (
    holding.holderType?.toLowerCase() === "farmer" &&
    holding.holderId === uid
  ) {
    return;
  }

  throw new Error(
    "Authorization Error: You are not authorized to access this holding."
  );
}

async function getAdminStatus(uid: string): Promise<boolean> {
  const userRecord = await firebaseAdminAuth.getUser(uid);
  return userRecord.customClaims?.admin === true;
}

export async function POST(req: NextRequest) {
  let user: { userId: string };

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required" },
      { status: 401 }
    );
  }

  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Validation Error: Invalid JSON body." },
      { status: 400 }
    );
  }

  if (
    rawBody === null ||
    typeof rawBody !== "object" ||
    Array.isArray(rawBody)
  ) {
    return NextResponse.json(
      { success: false, error: "Validation Error: A JSON object is required." },
      { status: 400 }
    );
  }

  const body = rawBody as Record<string, unknown>;

  if (Object.keys(body).some((key) => !ALLOWED_POST_FIELDS.has(key))) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation Error: The request contains unsupported fields.",
      },
      { status: 400 }
    );
  }

  if (
    typeof body.holdingId !== "string" ||
    !body.holdingId.trim() ||
    body.holdingId.length > 256
  ) {
    return NextResponse.json(
      { success: false, error: "Validation Error: A valid holdingId is required." },
      { status: 400 }
    );
  }

  const quantity = body.representedQuantityKg;

  if (
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation Error: representedQuantityKg must be a finite positive number.",
      },
      { status: 400 }
    );
  }

  if (
    body.qrGroupId !== undefined &&
    (typeof body.qrGroupId !== "string" || body.qrGroupId.length > 128)
  ) {
    return NextResponse.json(
      { success: false, error: "Validation Error: Invalid qrGroupId." },
      { status: 400 }
    );
  }

  const holdingId = body.holdingId.trim();
  const qrGroupId =
    typeof body.qrGroupId === "string" ? body.qrGroupId.trim() : "";

  try {
    const isAdmin = await getAdminStatus(user.userId);

    const qrRecord = await firebaseAdminDb.runTransaction(async (tx) => {
      const holdingRef = firebaseAdminDb
        .collection("certificateHoldings")
        .doc(holdingId);

      const holdingSnap = await tx.get(holdingRef);

      if (!holdingSnap.exists) {
        throw new Error(
          `Holding Error: CertificateHolding "${holdingId}" does not exist.`
        );
      }

      const holding = holdingSnap.data() as CertificateHolding;

      if (
        holding.holdingId !== holdingId ||
        !holding.holderId ||
        !holding.holderType ||
        !holding.certificateId ||
        !holding.lotId
      ) {
        throw new Error("Holding Error: The holding record is incomplete or inconsistent.");
      }

      assertHoldingAccess(holding, user.userId, isAdmin);

      if (holding.status !== "active") {
        throw new Error("Holding Error: Only active holdings can be packaged.");
      }

      if (
        typeof holding.availableQuantityKg !== "number" ||
        !Number.isFinite(holding.availableQuantityKg) ||
        holding.availableQuantityKg <= 0
      ) {
        throw new Error("Holding Error: The holding has no valid available balance.");
      }

      const certificateRef = firebaseAdminDb
        .collection("certificates")
        .doc(holding.certificateId);

      const lotRef = firebaseAdminDb
        .collection("cocoaLots")
        .doc(holding.lotId);

      const currentHoldingQRQuery = firebaseAdminDb
        .collection("qrCodes")
        .where("currentHoldingId", "==", holdingId);

      const lotQRQuery = firebaseAdminDb
        .collection("qrCodes")
        .where("lotId", "==", holding.lotId);

      const bulkListingsQuery = firebaseAdminDb
        .collection("marketplaceListings")
        .where("sourceHoldingId", "==", holdingId);

      const counterRef = firebaseAdminDb
        .collection("lotCounters")
        .doc(holding.lotId);

      // Complete all reads before writing.
      const [
        certificateSnap,
        lotSnap,
        currentQrSnap,
        lotQrSnap,
        listingsSnap,
        counterSnap,
      ] = await Promise.all([
        tx.get(certificateRef),
        tx.get(lotRef),
        tx.get(currentHoldingQRQuery),
        tx.get(lotQRQuery),
        tx.get(bulkListingsQuery),
        tx.get(counterRef),
      ]);

      if (!certificateSnap.exists) {
        throw new Error("Certificate Error: The backing certificate does not exist.");
      }

      if (!lotSnap.exists) {
        throw new Error("Lot Error: The backing cocoa lot does not exist.");
      }

      const lot = lotSnap.data() as CocoaLot;

      if (
        lot.lotId !== holding.lotId ||
        !lot.lotNumber
      ) {
        throw new Error("Lot Error: The backing lot record is inconsistent.");
      }

      let allocatedPackageQuantityKg = 0;

      for (const qrDoc of currentQrSnap.docs) {
        const qr = qrDoc.data() as QRCode;

        // Only formally repackaged packages release packaging capacity.
        if (qr.returnedToBulk === true) continue;

        if (
          typeof qr.representedQuantityKg !== "number" ||
          !Number.isFinite(qr.representedQuantityKg) ||
          qr.representedQuantityKg < 0
        ) {
          throw new Error("Capacity Error: An existing QR record has an invalid quantity.");
        }

        allocatedPackageQuantityKg += qr.representedQuantityKg;
      }

      const unpackagedQuantityKg =
        holding.availableQuantityKg - allocatedPackageQuantityKg;

      if (unpackagedQuantityKg < -1e-9) {
        throw new Error("Capacity Error: Existing package allocations exceed the holding balance.");
      }

      let committedBulkKg = 0;

      for (const listingDoc of listingsSnap.docs) {
        const listing = listingDoc.data();

        if (
          listing.inventoryMode !== "BULK" ||
          !["available", "under_negotiation"].includes(listing.listingStatus)
        ) {
          continue;
        }

        const available = listing.quantityAvailableKg;

        if (
          typeof available !== "number" ||
          !Number.isFinite(available) ||
          available < 0
        ) {
          throw new Error("Capacity Error: An active bulk listing has an invalid quantity.");
        }

        committedBulkKg += available;
      }

      const availableForPackaging = Math.max(
        0,
        unpackagedQuantityKg - committedBulkKg
      );

      if (quantity > availableForPackaging + 1e-9) {
        throw new Error(
          `Capacity Error: Requested package quantity exceeds the ${availableForPackaging} kg currently available for packaging.`
        );
      }

      // Recover from a missing or outdated counter using permanent QR records.
      let highestExistingSequence = 0;
      const idPrefix = `qr_${lot.lotId}_`;

      for (const existingDoc of lotQrSnap.docs) {
        const existing = existingDoc.data() as Partial<QRCode>;

        if (
          typeof existing.sequenceNumber === "number" &&
          Number.isSafeInteger(existing.sequenceNumber) &&
          existing.sequenceNumber > highestExistingSequence
        ) {
          highestExistingSequence = existing.sequenceNumber;
        }

        if (existingDoc.id.startsWith(idPrefix)) {
          const suffix = existingDoc.id.slice(idPrefix.length);

          if (/^\d+$/.test(suffix)) {
            const sequence = Number(suffix);

            if (
              Number.isSafeInteger(sequence) &&
              sequence > highestExistingSequence
            ) {
              highestExistingSequence = sequence;
            }
          }
        }
      }

      let counterSequence = 0;

      if (counterSnap.exists) {
        const stored = counterSnap.get("lastSequence");

        if (
          typeof stored !== "number" ||
          !Number.isSafeInteger(stored) ||
          stored < 0
        ) {
          throw new Error("Sequence Error: The lot sequence counter is invalid.");
        }

        counterSequence = stored;
      }

      const sequenceNumber =
        Math.max(counterSequence, highestExistingSequence) + 1;

      if (!Number.isSafeInteger(sequenceNumber)) {
        throw new Error("Sequence Error: The next QR sequence is invalid.");
      }

      const sequenceText = String(sequenceNumber).padStart(3, "0");
      const qrId = `qr_${lot.lotId}_${sequenceNumber}`;
      const packageNumber = `${lot.lotNumber}-PKG-${sequenceText}`;
      const entropy = randomBytes(8).toString("hex").toUpperCase();
      const qrValue = `QRV-${lot.lotNumber}-${sequenceText}-${entropy}`;
      const now = new Date().toISOString();

      const record: QRCode = {
        qrId,
        qrValue,
        packageNumber,
        sequenceNumber,
        generatedFromHoldingId: holdingId,
        currentHoldingId: holdingId,
        certificateId: holding.certificateId,
        certificateNumber: holding.certificateNumber,
        lotId: lot.lotId,
        lotNumber: lot.lotNumber,
        farmId: holding.farmId,
        representedQuantityKg: quantity,
        ...(qrGroupId ? { qrGroupId } : {}),
        status: "active",
        generatedAt: now,
        activatedAt: now,
        returnedToBulk: false,
        generatedBy: user.userId,
      };

      tx.set(
        counterRef,
        {
          lotId: lot.lotId,
          lastSequence: sequenceNumber,
          updatedAt: now,
        },
        { merge: true }
      );

      // Do not overwrite an existing permanent QR record.
      tx.create(
        firebaseAdminDb.collection("qrCodes").doc(qrId),
        record
      );

      return record;
    });

    return NextResponse.json({
      success: true,
      qrCode: qrRecord,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    const status = statusForError(message);

    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? "Internal Server Error" : message,
      },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  let user: { userId: string };

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required" },
      { status: 401 }
    );
  }

  try {
    const params = new URL(req.url).searchParams;

    const holdingId = params.get("holdingId")?.trim() || "";
    const lotId = params.get("lotId")?.trim() || "";
    const certificateId = params.get("certificateId")?.trim() || "";

    const filterCount = [holdingId, lotId, certificateId].filter(Boolean).length;

    if (filterCount > 1) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Supply only one of holdingId, lotId, or certificateId.",
        },
        { status: 400 }
      );
    }

    const isAdmin = await getAdminStatus(user.userId);
    const qrCollection = firebaseAdminDb.collection("qrCodes");

    let qrSnapshot;

    if (holdingId) {
      const holdingSnap = await firebaseAdminDb
        .collection("certificateHoldings")
        .doc(holdingId)
        .get();

      if (!holdingSnap.exists) {
        return NextResponse.json(
          { success: false, error: "Holding Error: Holding not found." },
          { status: 404 }
        );
      }

      const holding = holdingSnap.data() as CertificateHolding;
      assertHoldingAccess(holding, user.userId, isAdmin);

      qrSnapshot = await qrCollection
        .where("currentHoldingId", "==", holdingId)
        .get();
    } else if (lotId) {
      qrSnapshot = await qrCollection.where("lotId", "==", lotId).get();
    } else if (certificateId) {
      qrSnapshot = await qrCollection
        .where("certificateId", "==", certificateId)
        .get();
    } else {
      // Never return the entire QR collection to any authenticated user.
      qrSnapshot = await qrCollection
        .where("generatedBy", "==", user.userId)
        .get();
    }

    const records = qrSnapshot.docs.map((snapshot) => {
      const data = snapshot.data() as QRCode;
      return { ...data, qrId: snapshot.id };
    });

    let qrCodes: QRCode[];

    if (holdingId || isAdmin) {
      qrCodes = records;
    } else {
      // For lot/certificate queries or the user's own generated QR records,
      // return only packages currently held by an entity they can access.
      const uniqueHoldingIds = [
        ...new Set(records.map((record) => record.currentHoldingId).filter(Boolean)),
      ];

      const holdingSnapshots = await Promise.all(
        uniqueHoldingIds.map((id) =>
          firebaseAdminDb.collection("certificateHoldings").doc(id).get()
        )
      );

      const accessibleHoldingIds = new Set<string>();

      for (const snapshot of holdingSnapshots) {
        if (!snapshot.exists) continue;

        const holding = snapshot.data() as CertificateHolding;

        if (
          holding.holderType?.toLowerCase() === "farmer" &&
          holding.holderId === user.userId
        ) {
          accessibleHoldingIds.add(snapshot.id);
        }
      }

      qrCodes = records.filter((record) =>
        accessibleHoldingIds.has(record.currentHoldingId)
      );
    }

    let packagingState = null;

    if (holdingId) {
      const holdingSnap = await firebaseAdminDb
        .collection("certificateHoldings")
        .doc(holdingId)
        .get();

      const holding = holdingSnap.data() as CertificateHolding;

      const allocated = qrCodes
        .filter((qr) => qr.returnedToBulk !== true)
        .reduce((sum, qr) => sum + qr.representedQuantityKg, 0);

      packagingState = {
        holdingId,
        totalHoldingQuantityKg: holding.quantityKg,
        availableQuantityKg: holding.availableQuantityKg,
        allocatedPackageQuantityKg: allocated,
        unpackagedQuantityKg: Math.max(0, holding.availableQuantityKg - allocated),
        activePackageCount: qrCodes.filter((qr) => qr.status === "active").length,
        allocatedPackageCount: qrCodes.filter((qr) => qr.returnedToBulk !== true).length,
      };
    }

    return NextResponse.json({
      success: true,
      ...(packagingState ? { packagingState } : {}),
      qrCodes,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    const status = statusForError(message);

    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? "Internal Server Error" : message,
      },
      { status }
    );
  }
}
