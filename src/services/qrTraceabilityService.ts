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
  CertificateTransfer,
  TraceCertificate,
  CocoaLot,
  ProductionRecord,
  Harvest,
  TradeRecord,
  CocoaLotAdjustment,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";
import { resolveCertificateHoldingHistory } from "./transferService";
import { assertActorCanActForHolder } from "@/lib/certificateAuthorization";
import { buildQRVerificationUrl } from "@/lib/qrUrl";

export const COLLECTIONS = {
  QR_CODES: "qrCodes",
  QR_SCANS: "qrScans",
  LOT_COUNTERS: "lotCounters",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  CERTIFICATES: "certificates",
  CERTIFICATE_TRANSFERS: "certificateTransfers",
  COCOA_LOTS: "cocoaLots",
  FARMS: "farms",
  PRODUCTIONS: "productions",
  PRODUCTION_RECORDS: "productionRecords",
  HARVESTS: "harvests",
  TRADES: "trades",
  COCOA_LOT_ADJUSTMENTS: "cocoaLotAdjustments",
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

    if (
      (holding.status !== "active" && holding.status !== "partially_transferred") ||
      holding.availableQuantityKg <= 0
    ) {
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

    if (
      (holding.status !== "active" && holding.status !== "partially_transferred") ||
      holding.availableQuantityKg <= 0
    ) {
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
 * Retrieves a QRCode by unique qrValue (or fallback packageNumber match for manual portal lookups).
 */
export async function getQRCodeByValue(qrValue: string): Promise<QRCode | null> {
  if (!qrValue || !qrValue.trim()) return null;
  const clean = qrValue.trim();

  const q = query(
    collection(db, COLLECTIONS.QR_CODES),
    where("qrValue", "==", clean)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].data() as QRCode;
  }

  const pkgQuery = query(
    collection(db, COLLECTIONS.QR_CODES),
    where("packageNumber", "==", clean)
  );
  const pkgSnap = await getDocs(pkgQuery);
  if (!pkgSnap.empty) {
    return pkgSnap.docs[0].data() as QRCode;
  }

  return null;
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
 * Encodes the full scannable verification URL pointing to `/traceability/qr/<qrValue>`.
 */
export async function generateQRImage(
  qrValue: string,
  format: "svg" | "png" = "svg",
  baseOrigin?: string
): Promise<{ data: Buffer | string; contentType: string }> {
  if (!qrValue || !qrValue.trim()) {
    throw new Error("Validation Error: qrValue is required to render QR image.");
  }

  const verificationUrl = buildQRVerificationUrl(qrValue.trim(), baseOrigin);

  if (format === "png") {
    const pngBuffer = await QRCodeLib.toBuffer(verificationUrl, {
      type: "png",
      width: 400,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    return { data: pngBuffer, contentType: "image/png" };
  }

  const svgString = await QRCodeLib.toString(verificationUrl, {
    type: "svg",
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return { data: svgString, contentType: "image/svg+xml" };
}

function formatPublicRoleTitle(holderType: string, isOrigin = false): string {
  const t = (holderType || "holder").toLowerCase();
  if (t === "farmer") return isOrigin ? "Origin Farmer" : "Farmer";
  if (t === "cooperative") return "Cooperative Organization";
  if (t === "agent") return "Licensed Export Agent";
  if (t === "warehouse") return "Certified Warehouse Facility";
  if (t === "buyer") return "Verified Cocoa Buyer";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Resolves a public-safe display label for an entity without exposing personal UIDs,
 * phone numbers, or email addresses.
 */
async function resolvePublicEntityLabel(
  holderType: string,
  holderId: string,
  farmData?: Record<string, unknown> | null,
  isOrigin = false,
  cache?: Map<string, string>
): Promise<string> {
  const cacheKey = `${holderType}:${holderId}:${isOrigin ? "origin" : "node"}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;

  const cleanType = (holderType || "").toLowerCase();
  const baseRole = formatPublicRoleTitle(cleanType, isOrigin);

  if (cleanType === "farmer") {
    const farmName =
      typeof farmData?.farmName === "string" && farmData.farmName.trim()
        ? farmData.farmName.trim()
        : undefined;
    const label = isOrigin && farmName ? `Origin Grower (${farmName})` : baseRole;
    cache?.set(cacheKey, label);
    return label;
  }

  if (holderId && holderId.trim()) {
    const cleanId = holderId.trim();
    const orgCollections =
      cleanType === "cooperative"
        ? ["cooperatives", "cooperative_organizations"]
        : cleanType === "warehouse"
          ? ["warehouses", "warehouse_facilities", "warehouse_organizations"]
          : cleanType === "agent"
            ? ["agents", "agent_organizations"]
            : [];

    for (const colName of orgCollections) {
      try {
        const snap = await getDoc(doc(db, colName, cleanId));
        if (snap.exists()) {
          const data = snap.data();
          const orgName =
            data?.name ||
            data?.organizationName ||
            data?.cooperativeName ||
            data?.facilityName ||
            data?.companyName;
          if (typeof orgName === "string" && orgName.trim()) {
            const label = `${baseRole}: ${orgName.trim()}`;
            cache?.set(cacheKey, label);
            return label;
          }
        }
      } catch {
        // Non-blocking public lookup
      }
    }
  }

  cache?.set(cacheKey, baseRole);
  return baseRole;
}

/**
 * Publicly verifies and reconstructs complete bag-level traceability lineage from a QR value.
 *
 * Guarantees:
 * - Resolves full upstream & downstream chain (Farm -> Production -> Harvest -> Lot -> Cert -> Holdings -> Transfers).
 * - Evaluates QR freshness and anti-reuse status (whether this is the latest lot QR or retired after sale/transfer).
 * - Computes exact remaining cocoa balances in the lot (original, sold/transferred, remaining at origin, and per-holder).
 * - Completely sanitizes private Firebase UIDs, fee amounts, contact info, and internal reviewer notes.
 */
export async function resolvePublicQRTraceability(
  qrValue: string
): Promise<PublicQRTraceabilityResult | null> {
  if (!qrValue || !qrValue.trim()) return null;

  const qr = await getQRCodeByValue(qrValue.trim());
  if (!qr) return null;

  const [
    holdingHistory,
    lotSnap,
    certSnap,
    farmSnap,
    allLotQRsSnap,
    allLotHoldingsSnap,
    allLotTransfersSnap,
    allLotTradesSnap,
    allLotAdjustmentsSnap,
  ] = await Promise.all([
    resolveCertificateHoldingHistory(qr.currentHoldingId),
    getDoc(doc(db, COLLECTIONS.COCOA_LOTS, qr.lotId)),
    getDoc(doc(db, COLLECTIONS.CERTIFICATES, qr.certificateId)),
    getDoc(doc(db, COLLECTIONS.FARMS, qr.farmId)),
    getDocs(query(collection(db, COLLECTIONS.QR_CODES), where("lotId", "==", qr.lotId))),
    getDocs(query(collection(db, COLLECTIONS.CERTIFICATE_HOLDINGS), where("lotId", "==", qr.lotId))),
    getDocs(query(collection(db, COLLECTIONS.CERTIFICATE_TRANSFERS), where("lotId", "==", qr.lotId))),
    getDocs(query(collection(db, COLLECTIONS.TRADES), where("lotId", "==", qr.lotId))),
    getDocs(query(collection(db, COLLECTIONS.COCOA_LOT_ADJUSTMENTS), where("lotId", "==", qr.lotId))),
  ]);

  if (!holdingHistory) return null;

  const lot = lotSnap.exists() ? (lotSnap.data() as CocoaLot) : null;
  const cert = certSnap.exists() ? (certSnap.data() as TraceCertificate) : null;
  const farmData = farmSnap.exists() ? (farmSnap.data() as Record<string, unknown>) : null;

  // Resolve upstream Production Season and Harvest event
  let production: ProductionRecord | null = null;
  if (lot?.productionRecordId) {
    const prodSnap1 = await getDoc(doc(db, COLLECTIONS.PRODUCTIONS, lot.productionRecordId));
    if (prodSnap1.exists()) {
      production = prodSnap1.data() as ProductionRecord;
    } else {
      const prodSnap2 = await getDoc(
        doc(db, COLLECTIONS.PRODUCTION_RECORDS, lot.productionRecordId)
      );
      if (prodSnap2.exists()) {
        production = prodSnap2.data() as ProductionRecord;
      }
    }
  }

  let harvest: Harvest | null = null;
  if (lot?.harvestId) {
    const harvSnap = await getDoc(doc(db, COLLECTIONS.HARVESTS, lot.harvestId));
    if (harvSnap.exists()) {
      harvest = harvSnap.data() as Harvest;
    }
  }

  const allLotQRs = allLotQRsSnap.docs
    .map((d) => d.data() as QRCode)
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  const allLotHoldings = allLotHoldingsSnap.docs.map((d) => d.data() as CertificateHolding);
  const allLotTransfers = allLotTransfersSnap.docs
    .map((d) => d.data() as CertificateTransfer)
    .filter((t) => t.transferStatus === "completed")
    .sort((a, b) => (a.completedAt || a.initiatedAt).localeCompare(b.completedAt || b.initiatedAt));

  const allLotTrades = allLotTradesSnap.docs.map((d) => d.data() as TradeRecord);
  const allLotAdjustments = allLotAdjustmentsSnap.docs.map((d) => d.data() as CocoaLotAdjustment);

  const holdingMap = new Map<string, CertificateHolding>(
    allLotHoldings.map((h) => [h.holdingId, h])
  );
  const labelCache = new Map<string, string>();

  // Identify root/origin holding ID
  const rootHolding =
    allLotHoldings.find((h) => !h.parentHoldingId && !h.sourceTransferId) ||
    holdingMap.get(holdingHistory.originalHoldingId) ||
    null;
  const originHoldingId = rootHolding?.holdingId || holdingHistory.originalHoldingId;

  // Evaluate freshness & anti-reuse status across all QRs on this lot
  const qrHolding = holdingMap.get(qr.currentHoldingId);
  const holdingDepleted =
    qrHolding !== undefined &&
    (qrHolding.availableQuantityKg <= 0 || qrHolding.status === "depleted");

  const hasOutgoingAfterQr = allLotTransfers.some(
    (t) =>
      t.sourceHoldingId === qr.currentHoldingId &&
      holdingDepleted &&
      (t.completedAt || t.initiatedAt) >= qr.generatedAt
  );

  const isRetiredAfterSale =
    qr.status === "transferred" ||
    qr.status === "superseded" ||
    qr.retiredOnSale === true ||
    Boolean(qr.supersededByTransferId) ||
    holdingDepleted ||
    hasOutgoingAfterQr;

  const isValidAndActive =
    qr.status === "active" && qr.returnedToBulk !== true && !isRetiredAfterSale;

  // Truly active QRs across the lot (excluding retired/depleted ones)
  const activeLotQRs = allLotQRs.filter((q) => {
    const h = holdingMap.get(q.currentHoldingId);
    const hDepleted = h !== undefined && (h.availableQuantityKg <= 0 || h.status === "depleted");
    return (
      q.status === "active" &&
      q.returnedToBulk !== true &&
      q.retiredOnSale !== true &&
      !q.supersededByTransferId &&
      !hDepleted
    );
  });

  const latestActiveQR =
    activeLotQRs.length > 0 ? activeLotQRs[activeLotQRs.length - 1] : undefined;
  const newerQRsGeneratedCount = allLotQRs.filter(
    (q) => (q.sequenceNumber || 0) > (qr.sequenceNumber || 0)
  ).length;
  const isMostUpdatedForLot = isValidAndActive && newerQRsGeneratedCount === 0;

  // Did the buyer / downstream holder already generate their own replacement QR?
  const downstreamHoldingIds = new Set<string>();
  if (qr.supersededByHoldingId) downstreamHoldingIds.add(qr.supersededByHoldingId);
  allLotTransfers.forEach((t) => {
    if (
      (t.sourceHoldingId === qr.currentHoldingId ||
        t.transferId === qr.supersededByTransferId) &&
      t.destinationHoldingId
    ) {
      downstreamHoldingIds.add(t.destinationHoldingId);
    }
  });
  const buyerReplacementQRs = allLotQRs.filter(
    (q) =>
      q.qrId !== qr.qrId &&
      (downstreamHoldingIds.has(q.generatedFromHoldingId) ||
        downstreamHoldingIds.has(q.currentHoldingId)) &&
      q.status === "active" &&
      q.returnedToBulk !== true
  );
  const buyerHasGeneratedReplacementQR = buyerReplacementQRs.length > 0;

  // Build verdict & explanations
  let verdictCode: NonNullable<PublicQRTraceabilityResult["freshness"]>["verdictCode"];
  let statusHeadline: string;
  let statusDetail: string;

  if (isRetiredAfterSale) {
    verdictCode = "RETIRED_AFTER_SALE";
    statusHeadline = "Retired QR — Cocoa Already Sold or Transferred";
    statusDetail = buyerHasGeneratedReplacementQR
      ? "This batch has changed custody and cannot be reused. The new owner has generated their own replacement QR code for downstream tracking."
      : "This cocoa batch was sold or transferred to another holder, so this QR code is permanently retired and cannot be reused. The buyer must generate their own new QR code from their custody holding.";
  } else if (qr.status !== "active" || qr.returnedToBulk === true) {
    verdictCode = "REVOKED_OR_INACTIVE";
    statusHeadline =
      qr.returnedToBulk === true
        ? "Returned to Bulk — QR Retired"
        : qr.status === "revoked"
          ? "Revoked QR Code"
          : "Inactive QR Code";
    statusDetail =
      qr.revocationReason ||
      "This QR code is no longer active and must not be reused for trade or export verification.";
  } else if (isMostUpdatedForLot) {
    verdictCode = "MOST_UPDATED_ACTIVE";
    statusHeadline = "Most Updated Active QR Code for This Lot";
    statusDetail = `Package #${qr.sequenceNumber} is active, backed by verified cocoa in this lot, and is the most recent QR code generated (${allLotQRs.length} total generated on lot).`;
  } else {
    verdictCode = "OLDER_ACTIVE_LOT_QR";
    statusHeadline = "Valid Active Bag — Newer QR Exists on This Lot";
    statusDetail = `This ${qr.representedQuantityKg} kg bag QR (#${qr.sequenceNumber}) remains active for its custody holding, while ${newerQRsGeneratedCount} newer QR code(s) have subsequently been generated for other cocoa in this lot${
      latestActiveQR ? ` (latest active: ${latestActiveQR.packageNumber})` : ""
    }.`;
  }

  // Format custody chain hops directly leading to this QR's holding (sanitized labels)
  const custodyChain = await Promise.all(
    holdingHistory.chronologicalTransferSequence.map(async (t, idx) => {
      const fromLabel = await resolvePublicEntityLabel(
        t.sourceHolderType,
        t.sourceHolderId,
        farmData,
        t.sourceHoldingId === originHoldingId,
        labelCache
      );
      const toLabel = await resolvePublicEntityLabel(
        t.destinationHolderType,
        t.destinationHolderId,
        farmData,
        t.destinationHoldingId === originHoldingId,
        labelCache
      );
      return {
        stepOrder: idx + 1,
        fromHolderPublicName: fromLabel,
        fromHolderType: t.sourceHolderType,
        toHolderPublicName: toLabel,
        toHolderType: t.destinationHolderType,
        transferredQuantityKg: t.quantityKg,
        transferredAt: t.completedAt || t.initiatedAt,
      };
    })
  );

  // Format complete lot movements across ALL transfers & uncertified sales in this lot
  const thisQrTransferIds = new Set(
    holdingHistory.chronologicalTransferSequence.map((t) => t.transferId)
  );
  const transferIdsInTrades = new Set(
    allLotTrades.filter((t) => t.transferId).map((t) => t.transferId!)
  );

  type RawMovement = {
    eventType: "transfer" | "trade";
    fromType: string;
    fromId: string;
    fromIsOrigin: boolean;
    toType: string;
    toId: string;
    toIsOrigin: boolean;
    destHoldingId?: string;
    quantityKg: number;
    timestamp: string;
    status: string;
    inThisQrLineage: boolean;
  };

  const rawMovements: RawMovement[] = allLotTransfers.map((t) => ({
    eventType: "transfer",
    fromType: t.sourceHolderType,
    fromId: t.sourceHolderId,
    fromIsOrigin: t.sourceHoldingId === originHoldingId,
    toType: t.destinationHolderType,
    toId: t.destinationHolderId,
    toIsOrigin: t.destinationHoldingId === originHoldingId,
    destHoldingId: t.destinationHoldingId,
    quantityKg: t.quantityKg,
    timestamp: t.completedAt || t.initiatedAt,
    status: t.transferStatus,
    inThisQrLineage: thisQrTransferIds.has(t.transferId),
  }));

  for (const tr of allLotTrades) {
    if (tr.tradeStatus === "cancelled" || tr.tradeStatus === "failed") continue;
    if (tr.transferId && transferIdsInTrades.has(tr.transferId)) continue;
    rawMovements.push({
      eventType: "trade",
      fromType: tr.sellerHolderType || "farmer",
      fromId: tr.sellerHolderId || tr.sellerId,
      fromIsOrigin: tr.sourceHoldingId === originHoldingId,
      toType: tr.buyerHolderType || "buyer",
      toId: tr.buyerId,
      toIsOrigin: false,
      destHoldingId: tr.destHoldingId,
      quantityKg: tr.quantityKg,
      timestamp: tr.tradeDate || tr.createdAt,
      status: tr.tradeStatus,
      inThisQrLineage: false,
    });
  }

  rawMovements.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const lotMovements = await Promise.all(
    rawMovements.map(async (m, idx) => {
      const fromHolderLabel = await resolvePublicEntityLabel(
        m.fromType,
        m.fromId,
        farmData,
        m.fromIsOrigin,
        labelCache
      );
      const toHolderLabel = await resolvePublicEntityLabel(
        m.toType,
        m.toId,
        farmData,
        m.toIsOrigin,
        labelCache
      );
      const buyerGeneratedQrCount = m.destHoldingId
        ? allLotQRs.filter(
            (q) =>
              q.generatedFromHoldingId === m.destHoldingId &&
              q.returnedToBulk !== true &&
              q.retiredOnSale !== true
          ).length
        : 0;

      return {
        stepOrder: idx + 1,
        eventType: m.eventType,
        fromHolderLabel,
        fromHolderType: m.fromType,
        toHolderLabel,
        toHolderType: m.toType,
        quantityKg: m.quantityKg,
        timestamp: m.timestamp,
        status: m.status,
        inThisQrLineage: m.inThisQrLineage,
        buyerGeneratedQrCount,
      };
    })
  );

  // Compute remaining cocoa balances in this lot
  const originalLotQuantityKg = lot?.quantityKg || 0;
  const certifiedQuantityKg = cert?.certifiedQuantityKg || lot?.certifiedQuantityKg || 0;

  const remainingAtOriginCertifiedKg = allLotHoldings
    .filter((h) => h.holdingId === originHoldingId || (!h.parentHoldingId && !h.sourceTransferId))
    .reduce((sum, h) => sum + Math.max(0, h.availableQuantityKg || 0), 0);

  const totalActiveCertifiedHoldingKg = allLotHoldings.reduce(
    (sum, h) => sum + Math.max(0, h.availableQuantityKg || 0),
    0
  );

  const soldOrTransferredFromOriginKg = rootHolding
    ? Math.max(0, certifiedQuantityKg - remainingAtOriginCertifiedKg)
    : allLotTransfers
        .filter((t) => t.sourceHoldingId === originHoldingId)
        .reduce((sum, t) => sum + (t.quantityKg || 0), 0);

  const uncertifiedCompletedSalesKg = allLotTrades
    .filter((t) => t.certificationType === "uncertified" && t.tradeStatus === "completed")
    .reduce((sum, t) => sum + (t.quantityKg || 0), 0);

  const physicalDeductionsKg = allLotAdjustments
    .filter((a) => a.isPhysicalDeduction === true)
    .reduce((sum, a) => sum + (a.deductedQuantityKg || 0), 0);

  const uncertifiedRemainingKg = Math.max(
    0,
    originalLotQuantityKg - certifiedQuantityKg - uncertifiedCompletedSalesKg - physicalDeductionsKg
  );

  const totalRemainingInLotKg = totalActiveCertifiedHoldingKg + uncertifiedRemainingKg;

  const currentHoldingQRs = allLotQRs.filter(
    (q) => q.currentHoldingId === qr.currentHoldingId && q.returnedToBulk !== true
  );
  const currentHoldingPackagedKg = currentHoldingQRs.reduce(
    (sum, q) => sum + (q.representedQuantityKg || 0),
    0
  );
  const currentHoldingAvailableKg = qrHolding
    ? Math.max(0, qrHolding.availableQuantityKg || 0)
    : Math.max(0, holdingHistory.availableQuantityKg || 0);
  const currentHoldingUnpackagedKg = Math.max(
    0,
    currentHoldingAvailableKg - currentHoldingPackagedKg
  );

  const lotHolderBalances = await Promise.all(
    [...allLotHoldings]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(async (h) => {
        const isOrigin = h.holdingId === originHoldingId || (!h.parentHoldingId && !h.sourceTransferId);
        const hQRs = allLotQRs.filter(
          (q) => q.currentHoldingId === h.holdingId && q.returnedToBulk !== true
        );
        const packagedKg = hQRs.reduce((sum, q) => sum + (q.representedQuantityKg || 0), 0);
        const availableKg = Math.max(0, h.availableQuantityKg || 0);
        const unpackagedKg = Math.max(0, availableKg - packagedKg);
        const holderLabel = await resolvePublicEntityLabel(
          h.holderType,
          h.holderId,
          farmData,
          isOrigin,
          labelCache
        );
        return {
          holderLabel,
          holderType: h.holderType,
          isOrigin,
          quantityKg: h.quantityKg,
          availableKg,
          packagedKg,
          unpackagedKg,
          status: h.status,
        };
      })
  );

  const publicFarmName =
    typeof farmData?.farmName === "string" && farmData.farmName.trim()
      ? farmData.farmName.trim()
      : `Cameroon Origin Plot`;
  const publicRegion =
    typeof farmData?.region === "string" && farmData.region.trim()
      ? farmData.region.trim()
      : undefined;
  const publicVillage =
    typeof farmData?.village === "string" && farmData.village.trim()
      ? farmData.village.trim()
      : undefined;
  const eudrCompliant = Boolean(farmData?.eudrCompliant);

  const currentHolderPublicName = await resolvePublicEntityLabel(
    holdingHistory.holderType,
    holdingHistory.holderId,
    farmData,
    holdingHistory.holdingId === originHoldingId,
    labelCache
  );

  const supersededTime =
    qr.lastTransferredAt ||
    (qr.status === "transferred" || qr.status === "superseded" ? qr.revokedAt : undefined);

  return {
    package: {
      packageNumber: qr.packageNumber,
      packageQuantityKg: qr.representedQuantityKg,
      status: isRetiredAfterSale && qr.status === "active" ? "transferred" : qr.status,
      generatedAt: qr.generatedAt,
      isPackagedAtOrigin: qr.generatedFromHoldingId === holdingHistory.originalHoldingId,
      revocationReason: qr.revocationReason,
      revokedAt: qr.revokedAt,
    },
    quantities: {
      originalLotQuantityKg,
      certifiedQuantityKg,
      currentHoldingQuantityKg: holdingHistory.currentQuantityKg,
      thisPackageQuantityKg: qr.representedQuantityKg,
    },
    origin: {
      country: "Cameroon",
      farmName: publicFarmName,
      region: publicRegion,
      eudrCompliant,
      lotNumber: qr.lotNumber,
      productionPeriod: cert?.productionPeriod || lot?.productionPeriod || "",
      qualityGrade: lot?.qualityGrade || harvest?.qualityGrade,
      certificateNumber: qr.certificateNumber,
      issueDate: cert?.issueDate || qr.generatedAt,
      cocoaImage: lot?.cocoaImage,
    },
    freshness: {
      qrSequenceNumber: qr.sequenceNumber,
      totalLotQRCodes: allLotQRs.length,
      activeLotQRCodes: activeLotQRs.length,
      isValidAndActive,
      isRetiredAfterSale,
      isMostUpdatedForLot,
      reusable: isValidAndActive,
      verdictCode,
      statusHeadline,
      statusDetail,
      latestActivePackageNumber: latestActiveQR?.packageNumber,
      latestActiveGeneratedAt: latestActiveQR?.generatedAt,
      newerQRsGeneratedCount,
      buyerHasGeneratedReplacementQR,
      supersededAt: supersededTime,
      transferredToHolderType: qr.transferredToHolderType,
    },
    lotBalance: {
      originalLotQuantityKg,
      certifiedQuantityKg,
      uncertifiedRemainingKg,
      soldOrTransferredFromOriginKg,
      remainingAtOriginCertifiedKg,
      totalRemainingInLotKg,
      totalActiveCertifiedHoldingKg,
      currentHoldingQuantityKg: holdingHistory.currentQuantityKg,
      currentHoldingAvailableKg,
      currentHoldingPackagedKg,
      currentHoldingUnpackagedKg,
      lotHolderBalances,
    },
    upstreamChain: {
      farm: {
        farmName: publicFarmName,
        region: publicRegion,
        village: publicVillage,
        country: "Cameroon",
        eudrCompliant,
      },
      ...(production
        ? {
            production: {
              seasonYear: production.seasonYear,
              productionPeriod: production.productionPeriod,
              startDate: production.startDate,
              endDate: production.endDate,
              status: production.status,
            },
          }
        : {}),
      ...(harvest
        ? {
            harvest: {
              harvestDate: harvest.harvestDate,
              quantityKg: harvest.quantityKg,
              qualityGrade: harvest.qualityGrade,
            },
          }
        : {}),
      lot: {
        lotNumber: lot?.lotNumber || qr.lotNumber,
        productionDate: lot?.productionDate || "",
        productionPeriod: lot?.productionPeriod || cert?.productionPeriod || "",
        quantityKg: originalLotQuantityKg,
        qualityGrade: lot?.qualityGrade,
        lotStatus: lot?.lotStatus || "certified",
      },
      certificate: {
        certificateNumber: cert?.certificateNumber || qr.certificateNumber,
        issueDate: cert?.issueDate || qr.generatedAt,
        certifiedQuantityKg,
        verificationStatus: cert?.verificationStatus || "verified",
        status: cert?.status || "active",
      },
    },
    lotMovements,
    custodyChain,
    current: {
      currentHolderPublicName,
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
