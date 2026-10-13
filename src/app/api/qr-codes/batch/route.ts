
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

const MAX_BATCH_SIZE = 100;

const ALLOWED_FIELDS = new Set([
  "holdingId",
  "packageQuantitiesKg",
  "qrGroupId",
]);

function getErrorStatus(message: string): number {
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

  const unexpectedFields = Object.keys(body).filter(
    (key) => !ALLOWED_FIELDS.has(key)
  );

  if (unexpectedFields.length > 0) {
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

  if (
    !Array.isArray(body.packageQuantitiesKg) ||
    body.packageQuantitiesKg.length === 0 ||
    body.packageQuantitiesKg.length > MAX_BATCH_SIZE
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `Validation Error: Provide between 1 and ${MAX_BATCH_SIZE} package quantities.`,
      },
      { status: 400 }
    );
  }

  const packageQuantitiesKg = body.packageQuantitiesKg as unknown[];

  if (
    !packageQuantitiesKg.every(
      (quantity) =>
        typeof quantity === "number" &&
        Number.isFinite(quantity) &&
        quantity > 0
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation Error: Every package quantity must be a finite positive number.",
      },
      { status: 400 }
    );
  }

  const quantities = packageQuantitiesKg as number[];
  const batchTotalKg = quantities.reduce((total, quantity) => total + quantity, 0);

  if (!Number.isFinite(batchTotalKg)) {
    return NextResponse.json(
      { success: false, error: "Validation Error: Total package quantity is invalid." },
      { status: 400 }
    );
  }

  if (
    body.qrGroupId !== undefined &&
    (typeof body.qrGroupId !== "string" || body.qrGroupId.length > 128)
  ) {
    return NextResponse.json(
      { success: false, error: "Validation Error: qrGroupId must be a string of at most 128 characters." },
      { status: 400 }
    );
  }

  const holdingId = body.holdingId.trim();
  const qrGroupId =
    typeof body.qrGroupId === "string" ? body.qrGroupId.trim() : "";

  try {
    // Only a trusted Firebase Admin custom claim grants platform-wide
    // administrator authority.
    const authUser = await firebaseAdminAuth.getUser(user.userId);
    const isAdmin = authUser.customClaims?.admin === true;

    const createdQRs = await firebaseAdminDb.runTransaction(async (tx) => {
      const holdingRef = firebaseAdminDb
        .collection("certificateHoldings")
        .doc(holdingId);

      const holdingSnap = await tx.get(holdingRef);

      if (!holdingSnap.exists) {
        throw new Error(`Holding Error: CertificateHolding "${holdingId}" does not exist.`);
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

      // Organizational authorization is deliberately fail-closed:
      // no trusted server-side membership verifier has been registered.
      if (!isAdmin) {
        const holderType = holding.holderType.toLowerCase();

        if (holderType !== "farmer" || holding.holderId !== user.userId) {
          throw new Error(
            "Authorization Error: You are not authorized to manage this holding."
          );
        }
      }

      if (holding.status !== "active") {
        throw new Error(
          `Holding Error: Holding "${holdingId}" is not active.`
        );
      }

      if (
        typeof holding.availableQuantityKg !== "number" ||
        !Number.isFinite(holding.availableQuantityKg) ||
        holding.availableQuantityKg <= 0
      ) {
        throw new Error(
          "Holding Error: The holding has no valid available balance."
        );
      }

      const certificateRef = firebaseAdminDb
        .collection("certificates")
        .doc(holding.certificateId);

      const lotRef = firebaseAdminDb
        .collection("cocoaLots")
        .doc(holding.lotId);

      const certSnap = await tx.get(certificateRef);
      const lotSnap = await tx.get(lotRef);

      if (!certSnap.exists) {
        throw new Error(
          `Certificate Error: Certificate "${holding.certificateId}" does not exist.`
        );
      }

      if (!lotSnap.exists) {
        throw new Error(`Lot Error: Lot "${holding.lotId}" does not exist.`);
      }

      const lot = lotSnap.data() as CocoaLot;

      if (
        lot.lotId !== holding.lotId ||
        !lot.lotNumber
      ) {
        throw new Error("Lot Error: The lot record is incomplete or inconsistent.");
      }

      const currentHoldingQRQuery = firebaseAdminDb
        .collection("qrCodes")
        .where("currentHoldingId", "==", holdingId);

      // Read every QR on this lot as well. This lets the route recover
      // a sequence number if the counter is missing or behind legacy records.
      const allLotQRQuery = firebaseAdminDb
        .collection("qrCodes")
        .where("lotId", "==", holding.lotId);

      const bulkListingsQuery = firebaseAdminDb
        .collection("marketplaceListings")
        .where("sourceHoldingId", "==", holdingId);

      const counterRef = firebaseAdminDb
        .collection("lotCounters")
        .doc(lot.lotId);

      // All transaction reads are completed before any writes.
      const [
        currentQrSnap,
        lotQrSnap,
        bulkListingsSnap,
        counterSnap,
      ] = await Promise.all([
        tx.get(currentHoldingQRQuery),
        tx.get(allLotQRQuery),
        tx.get(bulkListingsQuery),
        tx.get(counterRef),
      ]);

      let allocatedPackageQuantityKg = 0;

      for (const qrDoc of currentQrSnap.docs) {
        const qr = qrDoc.data() as QRCode;

        if (qr.returnedToBulk === true) continue;

        if (
          typeof qr.representedQuantityKg !== "number" ||
          !Number.isFinite(qr.representedQuantityKg) ||
          qr.representedQuantityKg < 0
        ) {
          throw new Error(
            "Capacity Error: An existing QR record has an invalid package quantity."
          );
        }

        allocatedPackageQuantityKg += qr.representedQuantityKg;
      }

      const unpackagedQuantityKg =
        holding.availableQuantityKg - allocatedPackageQuantityKg;

      if (unpackagedQuantityKg < -1e-9) {
        throw new Error(
          "Capacity Error: Existing QR allocations exceed the holding's available balance."
        );
      }

      let committedBulkKg = 0;

      for (const listingDoc of bulkListingsSnap.docs) {
        const listing = listingDoc.data();

        const isActiveBulkListing =
          listing.inventoryMode === "BULK" &&
          (
            listing.listingStatus === "available" ||
            listing.listingStatus === "under_negotiation"
          );

        if (!isActiveBulkListing) continue;

        const quantity = listing.quantityAvailableKg;

        if (
          typeof quantity !== "number" ||
          !Number.isFinite(quantity) ||
          quantity < 0
        ) {
          throw new Error(
            "Capacity Error: An active bulk listing has an invalid available quantity."
          );
        }

        committedBulkKg += quantity;
      }

      const uncommittedUnpackagedKg = Math.max(
        0,
        unpackagedQuantityKg - committedBulkKg
      );

      if (batchTotalKg > uncommittedUnpackagedKg + 1e-9) {
        throw new Error(
          `Capacity Error: Requested ${batchTotalKg} kg, but only ${uncommittedUnpackagedKg} kg is available for packaging.`
        );
      }

      let highestExistingSequence = 0;
      const qrIdPrefix = `qr_${lot.lotId}_`;

      for (const existingDoc of lotQrSnap.docs) {
        const existing = existingDoc.data() as Partial<QRCode>;

        if (
          typeof existing.sequenceNumber === "number" &&
          Number.isSafeInteger(existing.sequenceNumber) &&
          existing.sequenceNumber > highestExistingSequence
        ) {
          highestExistingSequence = existing.sequenceNumber;
        }

        // Also inspect the document ID in case a legacy record's
        // sequenceNumber field is absent or incorrect.
        if (existingDoc.id.startsWith(qrIdPrefix)) {
          const suffix = existingDoc.id.slice(qrIdPrefix.length);

          if (/^\d+$/.test(suffix)) {
            const idSequence = Number(suffix);

            if (
              Number.isSafeInteger(idSequence) &&
              idSequence > highestExistingSequence
            ) {
              highestExistingSequence = idSequence;
            }
          }
        }
      }

      let lastSequence = 0;

      if (counterSnap.exists) {
        const storedSequence = counterSnap.get("lastSequence");

        if (
          typeof storedSequence !== "number" ||
          !Number.isSafeInteger(storedSequence) ||
          storedSequence < 0
        ) {
          throw new Error(
            "Sequence Error: The lot sequence counter is invalid."
          );
        }

        lastSequence = storedSequence;
      }

      const startSequence =
        Math.max(lastSequence, highestExistingSequence) + 1;

      const endSequence = startSequence + quantities.length - 1;

      if (
        !Number.isSafeInteger(startSequence) ||
        !Number.isSafeInteger(endSequence)
      ) {
        throw new Error("Sequence Error: The next QR sequence is out of range.");
      }

      const now = new Date().toISOString();
      const created: QRCode[] = [];

      const qrRecords = quantities.map((quantity, index): QRCode => {
        const sequenceNumber = startSequence + index;
        const paddedSequence = String(sequenceNumber).padStart(3, "0");

        const qrId = `qr_${lot.lotId}_${sequenceNumber}`;
        const packageNumber = `${lot.lotNumber}-PKG-${paddedSequence}`;
        const entropy = randomBytes(8).toString("hex").toUpperCase();
        const qrValue =
          `QRV-${lot.lotNumber}-${paddedSequence}-${entropy}`;

        return {
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
      });

      // Reserve the sequence range. Concurrent QR creation for this lot
      // must contend on the same counter document.
      tx.set(
        counterRef,
        {
          lotId: lot.lotId,
          lastSequence: endSequence,
          updatedAt: now,
        },
        { merge: true }
      );

      // create(), unlike set(), refuses to overwrite an existing QR document.
      for (const qrRecord of qrRecords) {
        tx.create(
          firebaseAdminDb.collection("qrCodes").doc(qrRecord.qrId),
          qrRecord
        );
        created.push(qrRecord);
      }

      return created;
    });

    return NextResponse.json({
      success: true,
      count: createdQRs.length,
      qrCodes: createdQRs,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status = getErrorStatus(message);

    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? "Internal Server Error" : message,
      },
      { status }
    );
  }
}
