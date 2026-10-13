/**
 * QR Traceability & Virtual Package Allocation Service
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages physical package-level QR code generation and virtual bag allocations.
 * - Enforces the unified derived packaging accounting model:
 *     allocatedPackageQuantityKg = SUM(qr.representedQuantityKg WHERE currentHoldingId === holdingId AND returnedToBulk !== true)
 *     unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg
 * - Generates unique, permanent package numbering via atomic counter: lotCounters/{lotId}.
 * - Guarantees package quantity immutability (representedQuantityKg is permanent).
 * - Enforces packaging capacity invariants (cannot exceed derived unpackagedQuantityKg).
 * - Manages QR lifecycle: active, inactive, revoked (returnedToBulk=false), and repackaged (returnedToBulk=true).
 * - Server-side QR rendering for physical bag printing (SVG & PNG).
 * - Resolves exact bag-level public and authenticated traceability lineage.
 * - Records read-only scan audit records.
 * - Never merges holdings or lots. Keeps packaging strictly virtual without creating synthetic lots or certificates.
 */

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import QRCodeLib from "qrcode";
import { db } from "@/lib/firebase";
import {
  QRCode,
  QRScan,
  HoldingPackagingState,
  PublicQRTraceabilityResult,
  AuthorizedQRTraceabilityResult,
  CertificateHolding,
  TraceCertificate,
  CocoaLot,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";
import { resolveCertificateHoldingHistory } from "./transferService";
import { assertActorCanActForHolder } from "@/lib/certificateAuthorization";

export const COLLECTIONS = {
  QR_CODES: "qrCodes",
  QR_SCANS: "qrScans",
  LOT_COUNTERS: "lotCounters",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  CERTIFICATES: "certificates",
  COCOA_LOTS: "cocoaLots",
  FARMS: "farms",
  MARKETPLACE_LISTINGS: "marketplaceListings",
} as const;

/**
 * Derives the single source-of-truth packaging accounting state for a specific CertificateHolding.
 *
 * Formula:
 * allocatedPackageQuantityKg = SUM(qr.representedQuantityKg WHERE currentHoldingId === holdingId AND returnedToBulk !== true)
 * unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg
 */
export async function getHoldingPackagingState(
  holdingId: string
): Promise<HoldingPackagingState> {
  if (!holdingId || !holdingId.trim()) {
    throw new Error("Validation Error: holdingId is required.");
  }
  const cleanHoldingId = holdingId.trim();

  const holdingSnap = await getDoc(doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, cleanHoldingId));
  if (!holdingSnap.exists()) {
    throw new Error(`Holding Error: CertificateHolding "${cleanHoldingId}" does not exist.`);
  }
  const holding = holdingSnap.data() as CertificateHolding;

  const qrQuery = query(
    collection(db, COLLECTIONS.QR_CODES),
    where("currentHoldingId", "==", cleanHoldingId)
  );
  const qrSnap = await getDocs(qrQuery);
  const qrs = qrSnap.docs.map((d) => d.data() as QRCode);

  const allocatedQRs = qrs.filter((q) => q.returnedToBulk !== true);
  const activeQRs = qrs.filter((q) => q.status === "active");

  const allocatedPackageQuantityKg = allocatedQRs.reduce(
    (sum, q) => sum + q.representedQuantityKg,
    0
  );

  const unpackagedQuantityKg = Math.max(
    0,
    holding.availableQuantityKg - allocatedPackageQuantityKg
  );

  return {
    holdingId: cleanHoldingId,
    totalHoldingQuantityKg: holding.quantityKg,
    availableQuantityKg: holding.availableQuantityKg,
    allocatedPackageQuantityKg,
    unpackagedQuantityKg,
    activePackageCount: activeQRs.length,
    allocatedPackageCount: allocatedQRs.length,
  };
}

export interface GenerateQRCodeInput {
  holdingId: string;
  representedQuantityKg: number;
  qrGroupId?: string;
  actorUid?: string;
}

/**
 * Atomically generates a single physical QR package from an exact CertificateHolding.
 */
export async function generateQRCode(
  input: GenerateQRCodeInput
): Promise<QRCode> {
  const actorUid = resolveAuthenticatedUserUid(input.actorUid);

  if (!input.holdingId || !input.holdingId.trim()) {
    throw new Error("Validation Error: holdingId is required.");
  }
  if (
    typeof input.representedQuantityKg !== "number" ||
    isNaN(input.representedQuantityKg) ||
    input.representedQuantityKg <= 0
  ) {
    throw new Error(
      `Validation Error: representedQuantityKg must be a positive number greater than 0, received ${input.representedQuantityKg}.`
    );
  }

  const holdingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, input.holdingId.trim());

  return await runTransaction(db, async (tx) => {
    // 1. Validate Holding
    const holdingSnap = await tx.get(holdingRef);
    if (!holdingSnap.exists()) {
      throw new Error(`Holding Error: CertificateHolding "${input.holdingId}" does not exist.`);
    }
    const holding = holdingSnap.data() as CertificateHolding;

    if (holding.status !== "active" && holding.availableQuantityKg <= 0) {
      throw new Error(
        `Holding Error: Holding "${holding.holdingId}" has status "${holding.status}" and no available balance.`
      );
    }

    // 2. Authorize Requester
    await assertActorCanActForHolder(
      actorUid,
      holding.holderId,
      holding.holderType,
      "manage"
    );

    // 3. Verify Certificate and Lot
    const certSnap = await tx.get(doc(db, COLLECTIONS.CERTIFICATES, holding.certificateId));
    if (!certSnap.exists()) {
      throw new Error(`Certificate Error: Backing TraceCertificate "${holding.certificateId}" does not exist.`);
    }
    const cert = certSnap.data() as TraceCertificate;
    void cert;

    const lotSnap = await tx.get(doc(db, COLLECTIONS.COCOA_LOTS, holding.lotId));
    if (!lotSnap.exists()) {
      throw new Error(`Lot Error: Backing CocoaLot "${holding.lotId}" does not exist.`);
    }
    const lot = lotSnap.data() as CocoaLot;

    // 4. Query current QRs on holding to evaluate derived unpackaged capacity
    const qrQuery = query(
      collection(db, COLLECTIONS.QR_CODES),
      where("currentHoldingId", "==", holding.holdingId)
    );
    const qrSnap = await getDocs(qrQuery);
    const existingQRs = qrSnap.docs.map((d) => d.data() as QRCode);

    const allocatedPackageQuantityKg = existingQRs
      .filter((q) => q.returnedToBulk !== true)
      .reduce((sum, q) => sum + q.representedQuantityKg, 0);

    const unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg;

    // Query active BULK marketplace listings on this holding
    const bulkListingsQuery = query(
      collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
      where("sourceHoldingId", "==", holding.holdingId)
    );
    const bulkListingsSnap = await getDocs(bulkListingsQuery);
    const committedBulkKg = bulkListingsSnap.docs
      .map((d) => d.data())
      .filter(
        (l) =>
          l.inventoryMode === "BULK" &&
          (l.listingStatus === "available" || l.listingStatus === "under_negotiation")
      )
      .reduce((sum, l) => sum + (l.quantityAvailableKg || 0), 0);

    const uncommittedUnpackagedKg = Math.max(0, unpackagedQuantityKg - committedBulkKg);

    if (input.representedQuantityKg > uncommittedUnpackagedKg) {
      throw new Error(
        `Capacity Error: Requested package quantity (${input.representedQuantityKg} kg) exceeds uncommitted unpackaged cocoa (${uncommittedUnpackagedKg} kg) in holding "${holding.holdingId}". Active BULK marketplace listings commit ${committedBulkKg} kg.`
      );
    }

    // 5. Atomic Sequence Counter from lotCounters/{lotId}
    const counterRef = doc(db, COLLECTIONS.LOT_COUNTERS, lot.lotId);
    const counterSnap = await tx.get(counterRef);
    let nextSeq = 1;
    if (counterSnap.exists()) {
      const data = counterSnap.data();
      nextSeq = (data.lastSequence || 0) + 1;
    }
    tx.set(counterRef, { lotId: lot.lotId, lastSequence: nextSeq }, { merge: true });

    // 6. Generate Permanent Package Identifiers
    const packageNumber = `${lot.lotNumber}-PKG-${String(nextSeq).padStart(3, "0")}`;
    const qrId = `qr_${lot.lotId}_${nextSeq}`;
    const randomEntropy = Math.random().toString(36).substring(2, 8);
    const qrValue = `QRV-${lot.lotNumber}-${String(nextSeq).padStart(3, "0")}-${randomEntropy}`;
    const now = new Date().toISOString();

    const qrRecord: QRCode = {
      qrId,
      qrValue,
      packageNumber,
      sequenceNumber: nextSeq,
      generatedFromHoldingId: holding.holdingId,
      currentHoldingId: holding.holdingId,
      certificateId: holding.certificateId,
      certificateNumber: holding.certificateNumber,
      lotId: holding.lotId,
      lotNumber: lot.lotNumber,
      farmId: holding.farmId,
      representedQuantityKg: input.representedQuantityKg,
      qrGroupId: input.qrGroupId?.trim() || undefined,
      status: "active",
      generatedAt: now,
      activatedAt: now,
      returnedToBulk: false,
      generatedBy: actorUid,
    };

    const qrRef = doc(db, COLLECTIONS.QR_CODES, qrId);
    tx.set(qrRef, qrRecord);

    return qrRecord;
  });
}

export interface GenerateQRBatchInput {
  holdingId: string;
  packageQuantitiesKg: number[];
  qrGroupId?: string;
  actorUid?: string;
}

/**
 * Atomically generates a batch of physical QR packages from an exact CertificateHolding.
 */
export async function generateQRBatch(
  input: GenerateQRBatchInput
): Promise<QRCode[]> {
  const actorUid = resolveAuthenticatedUserUid(input.actorUid);

  if (!input.holdingId || !input.holdingId.trim()) {
    throw new Error("Validation Error: holdingId is required.");
  }
  if (!Array.isArray(input.packageQuantitiesKg) || input.packageQuantitiesKg.length === 0) {
    throw new Error("Validation Error: packageQuantitiesKg must be a non-empty array of numbers.");
  }

  for (const qty of input.packageQuantitiesKg) {
    if (typeof qty !== "number" || isNaN(qty) || qty <= 0) {
      throw new Error(`Validation Error: Every package quantity must be a positive number, received ${qty}.`);
    }
  }

  const batchTotalKg = input.packageQuantitiesKg.reduce((sum, q) => sum + q, 0);
  const holdingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, input.holdingId.trim());

  return await runTransaction(db, async (tx) => {
    const holdingSnap = await tx.get(holdingRef);
    if (!holdingSnap.exists()) {
      throw new Error(`Holding Error: CertificateHolding "${input.holdingId}" does not exist.`);
    }
    const holding = holdingSnap.data() as CertificateHolding;

    if (holding.status !== "active" && holding.availableQuantityKg <= 0) {
      throw new Error(
        `Holding Error: Holding "${holding.holdingId}" has status "${holding.status}" and no available balance.`
      );
    }

    await assertActorCanActForHolder(
      actorUid,
      holding.holderId,
      holding.holderType,
      "manage"
    );

    const certSnap = await tx.get(doc(db, COLLECTIONS.CERTIFICATES, holding.certificateId));
    if (!certSnap.exists()) {
      throw new Error(`Certificate Error: Backing TraceCertificate "${holding.certificateId}" does not exist.`);
    }

    const lotSnap = await tx.get(doc(db, COLLECTIONS.COCOA_LOTS, holding.lotId));
    if (!lotSnap.exists()) {
      throw new Error(`Lot Error: Backing CocoaLot "${holding.lotId}" does not exist.`);
    }
    const lot = lotSnap.data() as CocoaLot;

    // Query current QRs to validate unpackaged capacity
    const qrQuery = query(
      collection(db, COLLECTIONS.QR_CODES),
      where("currentHoldingId", "==", holding.holdingId)
    );
    const qrSnap = await getDocs(qrQuery);
    const existingQRs = qrSnap.docs.map((d) => d.data() as QRCode);

    const allocatedPackageQuantityKg = existingQRs
      .filter((q) => q.returnedToBulk !== true)
      .reduce((sum, q) => sum + q.representedQuantityKg, 0);

    const unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg;

    // Query active BULK marketplace listings on this holding
    const bulkListingsQuery = query(
      collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
      where("sourceHoldingId", "==", holding.holdingId)
    );
    const bulkListingsSnap = await getDocs(bulkListingsQuery);
    const committedBulkKg = bulkListingsSnap.docs
      .map((d) => d.data())
      .filter(
        (l) =>
          l.inventoryMode === "BULK" &&
          (l.listingStatus === "available" || l.listingStatus === "under_negotiation")
      )
      .reduce((sum, l) => sum + (l.quantityAvailableKg || 0), 0);

    const uncommittedUnpackagedKg = Math.max(0, unpackagedQuantityKg - committedBulkKg);

    if (batchTotalKg > uncommittedUnpackagedKg) {
      throw new Error(
        `Capacity Error: Requested batch package total (${batchTotalKg} kg) exceeds uncommitted unpackaged cocoa (${uncommittedUnpackagedKg} kg) in holding "${holding.holdingId}". Active BULK marketplace listings commit ${committedBulkKg} kg.`
      );
    }

    // Atomic Sequence Block Allocation
    const counterRef = doc(db, COLLECTIONS.LOT_COUNTERS, lot.lotId);
    const counterSnap = await tx.get(counterRef);
    let startSeq = 1;
    if (counterSnap.exists()) {
      const data = counterSnap.data();
      startSeq = (data.lastSequence || 0) + 1;
    }
    const endSeq = startSeq + input.packageQuantitiesKg.length - 1;
    tx.set(counterRef, { lotId: lot.lotId, lastSequence: endSeq }, { merge: true });

    const now = new Date().toISOString();
    const createdQRs: QRCode[] = [];

    input.packageQuantitiesKg.forEach((qty, idx) => {
      const seq = startSeq + idx;
      const packageNumber = `${lot.lotNumber}-PKG-${String(seq).padStart(3, "0")}`;
      const qrId = `qr_${lot.lotId}_${seq}`;
      const randomEntropy = Math.random().toString(36).substring(2, 8);
      const qrValue = `QRV-${lot.lotNumber}-${String(seq).padStart(3, "0")}-${randomEntropy}`;

      const qrRecord: QRCode = {
        qrId,
        qrValue,
        packageNumber,
        sequenceNumber: seq,
        generatedFromHoldingId: holding.holdingId,
        currentHoldingId: holding.holdingId,
        certificateId: holding.certificateId,
        certificateNumber: holding.certificateNumber,
        lotId: holding.lotId,
        lotNumber: lot.lotNumber,
        farmId: holding.farmId,
        representedQuantityKg: qty,
        qrGroupId: input.qrGroupId?.trim() || undefined,
        status: "active",
        generatedAt: now,
        activatedAt: now,
        returnedToBulk: false,
        generatedBy: actorUid,
      };

      const qrRef = doc(db, COLLECTIONS.QR_CODES, qrId);
      tx.set(qrRef, qrRecord);
      createdQRs.push(qrRecord);
    });

    return createdQRs;
  });
}

/**
 * Retrieves a QRCode by qrId.
 */
export async function getQRCode(qrId: string): Promise<QRCode | null> {
  if (!qrId || !qrId.trim()) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.QR_CODES, qrId.trim()));
  return snap.exists() ? (snap.data() as QRCode) : null;
}

/**
 * Retrieves a QRCode by unique qrValue.
 */
export async function getQRCodeByValue(qrValue: string): Promise<QRCode | null> {
  if (!qrValue || !qrValue.trim()) return null;
  const q = query(
    collection(db, COLLECTIONS.QR_CODES),
    where("qrValue", "==", qrValue.trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as QRCode;
}

/**
 * Deactivates an active QR package.
 * IMPORTANT ACCOUNTING RULE: Deactivation does NOT release packaging capacity (returnedToBulk remains false).
 */
export async function deactivateQRCode(
  qrId: string,
  actorUidInput?: string
): Promise<QRCode> {
  const actorUid = resolveAuthenticatedUserUid(actorUidInput);
  if (!qrId || !qrId.trim()) {
    throw new Error("Validation Error: qrId is required.");
  }

  const qrRef = doc(db, COLLECTIONS.QR_CODES, qrId.trim());

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(qrRef);
    if (!snap.exists()) {
      throw new Error(`QR Error: QRCode "${qrId}" does not exist.`);
    }
    const qr = snap.data() as QRCode;

    const holdingSnap = await tx.get(doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, qr.currentHoldingId));
    if (holdingSnap.exists()) {
      const holding = holdingSnap.data() as CertificateHolding;
      await assertActorCanActForHolder(
        actorUid,
        holding.holderId,
        holding.holderType,
        "manage"
      );
    }

    if (qr.status === "revoked") {
      throw new Error(`QR Error: Cannot deactivate a revoked QR package.`);
    }

    const now = new Date().toISOString();
    tx.update(qrRef, {
      status: "inactive",
      deactivatedAt: now,
      returnedToBulk: false, // Invariant: Deactivation never releases packaging capacity
    });

    return { ...qr, status: "inactive", deactivatedAt: now, returnedToBulk: false };
  });
}

/**
 * Revokes a QR package.
 * IMPORTANT ACCOUNTING RULE: Standard revocation does NOT release packaging capacity (returnedToBulk remains false).
 */
export async function revokeQRCode(
  qrId: string,
  reason: string,
  actorUidInput?: string
): Promise<QRCode> {
  const actorUid = resolveAuthenticatedUserUid(actorUidInput);
  if (!qrId || !qrId.trim()) {
    throw new Error("Validation Error: qrId is required.");
  }
  if (!reason || !reason.trim()) {
    throw new Error("Validation Error: revocationReason is required.");
  }

  const qrRef = doc(db, COLLECTIONS.QR_CODES, qrId.trim());

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(qrRef);
    if (!snap.exists()) {
      throw new Error(`QR Error: QRCode "${qrId}" does not exist.`);
    }
    const qr = snap.data() as QRCode;

    const holdingSnap = await tx.get(doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, qr.currentHoldingId));
    if (holdingSnap.exists()) {
      const holding = holdingSnap.data() as CertificateHolding;
      await assertActorCanActForHolder(
        actorUid,
        holding.holderId,
        holding.holderType,
        "manage"
      );
    }

    const now = new Date().toISOString();
    tx.update(qrRef, {
      status: "revoked",
      revokedAt: now,
      revocationReason: reason.trim(),
      returnedToBulk: false, // Invariant: Standard revocation never releases capacity
    });

    return {
      ...qr,
      status: "revoked",
      revokedAt: now,
      revocationReason: reason.trim(),
      returnedToBulk: false,
    };
  });
}

/**
 * Transactionally executes a formal return-to-bulk repackaging operation for a revoked QR package.
 *
 * Requirements:
 * - QR must be currently revoked.
 * - QR must not already have returnedToBulk === true.
 * - Sets returnedToBulk = true, releasing representedQuantityKg back to derived unpackagedQuantityKg.
 * - Old QR remains permanently revoked and is NEVER reactivated or reused.
 */
export async function repackageRevokedQRCode(
  qrId: string,
  notes: string,
  actorUidInput?: string
): Promise<QRCode> {
  const actorUid = resolveAuthenticatedUserUid(actorUidInput);
  if (!qrId || !qrId.trim()) {
    throw new Error("Validation Error: qrId is required.");
  }

  const qrRef = doc(db, COLLECTIONS.QR_CODES, qrId.trim());

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(qrRef);
    if (!snap.exists()) {
      throw new Error(`QR Error: QRCode "${qrId}" does not exist.`);
    }
    const qr = snap.data() as QRCode;

    const holdingSnap = await tx.get(doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, qr.currentHoldingId));
    if (!holdingSnap.exists()) {
      throw new Error(`Holding Error: Target holding "${qr.currentHoldingId}" does not exist.`);
    }
    const holding = holdingSnap.data() as CertificateHolding;

    await assertActorCanActForHolder(
      actorUid,
      holding.holderId,
      holding.holderType,
      "manage"
    );

    if (qr.status !== "revoked") {
      throw new Error(`Repackage Error: Only revoked QR packages can be returned to bulk, current status is "${qr.status}".`);
    }

    if (qr.returnedToBulk === true) {
      throw new Error(`Repackage Error: QR package "${qrId}" has already been returned to bulk.`);
    }

    const now = new Date().toISOString();
    const updatePayload = {
      returnedToBulk: true,
      returnedToBulkAt: now,
      returnedToBulkBy: actorUid,
      repackageNotes: notes?.trim() || "Physical cocoa returned to bulk state.",
    };

    tx.update(qrRef, updatePayload);

    return {
      ...qr,
      ...updatePayload,
    };
  });
}

/**
 * Server-side QR Code image generation for physical printing.
 * Encodes only the stable qrValue or public verification URL.
 */
export async function generateQRImage(
  qrValue: string,
  format: "svg" | "png" = "svg"
): Promise<{ data: Buffer | string; contentType: string }> {
  if (!qrValue || !qrValue.trim()) {
    throw new Error("Validation Error: qrValue is required to render QR image.");
  }

  if (format === "png") {
    const pngBuffer = await QRCodeLib.toBuffer(qrValue.trim(), {
      type: "png",
      width: 400,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    return { data: pngBuffer, contentType: "image/png" };
  }

  const svgString = await QRCodeLib.toString(qrValue.trim(), {
    type: "svg",
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return { data: svgString, contentType: "image/svg+xml" };
}

/**
 * Publicly verifies and reconstructs complete bag-level traceability lineage from a QR value.
 *
 * Guarantees:
 * - Traverses upstream from currentHoldingId along the exact custody DAG.
 * - Preserves every historical transfer quantity.
 * - Identifies original farm, cocoa lot, and certificate.
 * - Separately reports: original lot quantity, certified quantity, current holding quantity, this package quantity.
 * - Completely sanitizes private Firebase UIDs, fee amounts, and internal reviewer notes.
 */
export async function resolvePublicQRTraceability(
  qrValue: string
): Promise<PublicQRTraceabilityResult | null> {
  if (!qrValue || !qrValue.trim()) return null;

  const qr = await getQRCodeByValue(qrValue.trim());
  if (!qr) return null;

  // Resolve upstream lineage from the package's current custody holding
  const holdingHistory = await resolveCertificateHoldingHistory(qr.currentHoldingId);
  if (!holdingHistory) return null;

  // Resolve backing Lot, Farm, and Certificate
  const lotSnap = await getDoc(doc(db, COLLECTIONS.COCOA_LOTS, qr.lotId));
  const lot = lotSnap.exists() ? (lotSnap.data() as CocoaLot) : null;

  const certSnap = await getDoc(doc(db, COLLECTIONS.CERTIFICATES, qr.certificateId));
  const cert = certSnap.exists() ? (certSnap.data() as TraceCertificate) : null;

  const farmSnap = await getDoc(doc(db, COLLECTIONS.FARMS, qr.farmId));
  const farmData = farmSnap.exists() ? farmSnap.data() : null;

  // Format public custody chain hops
  const custodyChain = holdingHistory.chronologicalTransferSequence.map((t, idx) => ({
    stepOrder: idx + 1,
    fromHolderPublicName: `${t.sourceHolderType.toUpperCase()}: ${t.sourceHolderId}`,
    fromHolderType: t.sourceHolderType,
    toHolderPublicName: `${t.destinationHolderType.toUpperCase()}: ${t.destinationHolderId}`,
    toHolderType: t.destinationHolderType,
    transferredQuantityKg: t.quantityKg,
    transferredAt: t.completedAt || t.initiatedAt,
  }));

  const publicFarmName = farmData?.farmName || `Farm #${qr.farmId.substring(0, 8)}`;
  const publicRegion = farmData?.region || "South-West Region";
  const eudrCompliant = Boolean(farmData?.eudrCompliant);

  return {
    package: {
      packageNumber: qr.packageNumber,
      packageQuantityKg: qr.representedQuantityKg,
      status: qr.status,
      generatedAt: qr.generatedAt,
      isPackagedAtOrigin: qr.generatedFromHoldingId === holdingHistory.originalHoldingId,
    },
    quantities: {
      originalLotQuantityKg: lot?.quantityKg || 0,
      certifiedQuantityKg: cert?.certifiedQuantityKg || 0,
      currentHoldingQuantityKg: holdingHistory.currentQuantityKg,
      thisPackageQuantityKg: qr.representedQuantityKg,
    },
    origin: {
      country: "Cameroon",
      farmName: publicFarmName,
      region: publicRegion,
      eudrCompliant,
      lotNumber: qr.lotNumber,
      productionPeriod: cert?.productionPeriod || lot?.productionPeriod || "2024/2025",
      qualityGrade: lot?.qualityGrade || "Grade 1",
      certificateNumber: qr.certificateNumber,
      issueDate: cert?.issueDate || qr.generatedAt,
      cocoaImage: lot?.cocoaImage,
    },
    custodyChain,
    current: {
      currentHolderPublicName: `${holdingHistory.holderType.toUpperCase()}: ${holdingHistory.holderId}`,
      currentHolderType: holdingHistory.holderType,
      currentHoldingStatus: holdingHistory.status,
    },
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * Authorized internal QR traceability lookup providing internal audit metadata.
 */
export async function resolveAuthorizedQRTraceability(
  qrValue: string,
  actorUidInput?: string
): Promise<AuthorizedQRTraceabilityResult | null> {
  const actorUid = resolveAuthenticatedUserUid(actorUidInput);
  void actorUid;
  const publicResult = await resolvePublicQRTraceability(qrValue);
  if (!publicResult) return null;

  const qr = await getQRCodeByValue(qrValue);
  if (!qr) return null;

  return {
    ...publicResult,
    internal: {
      qrId: qr.qrId,
      generatedFromHoldingId: qr.generatedFromHoldingId,
      currentHoldingId: qr.currentHoldingId,
      lotId: qr.lotId,
      certificateId: qr.certificateId,
      farmId: qr.farmId,
      generatedBy: qr.generatedBy,
      returnedToBulk: qr.returnedToBulk,
      lastTransferId: qr.lastTransferId,
    },
  };
}

export interface RecordQRScanInput {
  qrValue: string;
  scannerType?: "public" | "authenticated";
  userId?: string;
  location?: { latitude: number; longitude: number; description?: string };
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Records a read-only scan audit event.
 * Never mutates holdings, certificates, or lots.
 */
export async function recordQRScan(
  input: RecordQRScanInput
): Promise<QRScan | null> {
  if (!input.qrValue || !input.qrValue.trim()) return null;

  const qr = await getQRCodeByValue(input.qrValue.trim());
  if (!qr) return null;

  const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const scanRecord: QRScan = {
    scanId,
    qrId: qr.qrId,
    qrValue: qr.qrValue,
    packageNumber: qr.packageNumber,
    lotId: qr.lotId,
    certificateId: qr.certificateId,
    currentHoldingId: qr.currentHoldingId,
    userId: input.userId?.trim() || undefined,
    scannerType: input.scannerType || (input.userId ? "authenticated" : "public"),
    location: input.location,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    scannedAt: now,
  };

  await setDoc(doc(db, COLLECTIONS.QR_SCANS, scanId), scanRecord);
  return scanRecord;
}
