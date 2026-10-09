/**
 * Certificate Holdings & Transfer Service (Role 3 Domain Logic)
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages certified quantity holdings per eligible holder (CertificateHolding)
 * - Provisions initial holding upon certificate issuance
 * - Enforces the 6 supported transfer routes and rejects unsupported routes
 * - Implements atomic partial and full certificate transfers via Firestore transactions
 * - Calculates and captures immutable fee policy snapshots (AppliedFeeRecord)
 * - Enforces actor vs. holding entity authorization boundaries
 * - Preserves complete historical chain of custody without deleting holdings or transfers
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  Transaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  CertificateHolding,
  CertificateHoldingStatus,
  CertificateTransfer,
  SupportedTransferRoute,
  CertificateHolderType,
  AppliedFeeRecord,
  TraceCertificate,
  CertificateHoldingTraceHistory,
  UpstreamHolderSummary,
  QRCode,
  MarketplaceListing,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";
import {
  assertActorCanActForHolder,
  assertDestinationEntityValid,
} from "@/lib/certificateAuthorization";

export const COLLECTIONS = {
  CERTIFICATES: "certificates",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  CERTIFICATE_TRANSFERS: "certificateTransfers",
  COCOA_LOTS: "cocoaLots",
  QR_CODES: "qrCodes",
  QR_SCANS: "qrScans",
  LOT_COUNTERS: "lotCounters",
  MARKETPLACE_LISTINGS: "marketplaceListings",
};

/**
 * The 6 strictly confirmed direct certificate transfer routes.
 */
export const SUPPORTED_ROUTES: readonly SupportedTransferRoute[] = [
  "Farmer -> Cooperative",
  "Farmer -> Agent",
  "Farmer -> Warehouse",
  "Cooperative -> Agent",
  "Cooperative -> Warehouse",
  "Agent -> Warehouse",
] as const;

/**
 * Default configurable fee rate per kg for charged routes (in XAF / USD base currency).
 * Kept configurable to avoid hardcoded unfinalized business rates.
 */
let configurableRatePerKg = 0.05; // 0.05 USD / ~30 XAF per kg as configurable default

export function setConfigurableTransferFeeRate(rate: number): void {
  if (rate >= 0) {
    configurableRatePerKg = rate;
  }
}

export function getConfigurableTransferFeeRate(): number {
  return configurableRatePerKg;
}

/**
 * Validates whether the proposed transfer route is one of the 6 allowed routes.
 * Throws an explicit error if unsupported.
 */
export function validateTransferRoute(
  sourceHolderType: string,
  destinationHolderType: string
): SupportedTransferRoute {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const routeCandidate = `${capitalize(sourceHolderType)} -> ${capitalize(destinationHolderType)}` as SupportedTransferRoute;

  if (SUPPORTED_ROUTES.includes(routeCandidate)) {
    return routeCandidate;
  }

  throw new Error(
    `Unsupported Transfer Route: Direct transfer from "${sourceHolderType}" to "${destinationHolderType}" is not permitted. Only the 6 confirmed routes are supported: ${SUPPORTED_ROUTES.join(", ")}.`
  );
}

/**
 * Assesses the transfer fee and returns an immutable AppliedFeeRecord snapshot.
 */
export function calculateTransferFee(
  route: SupportedTransferRoute,
  quantityKg: number,
  currency = "USD",
  payerId = "system"
): AppliedFeeRecord {
  const feeId = `fee_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  switch (route) {
    case "Farmer -> Cooperative":
    case "Agent -> Warehouse":
      return {
        feeId,
        feeType: "certificate_transfer_fee",
        payerId,
        calculatedAmount: 0,
        currency,
        isFeeExempt: true,
        policyStatus: "EXEMPT",
        feeStatus: "waived",
        policyNotes: `Transfer route "${route}" is confirmed zero-fee exempt.`,
        assessedAt: now,
      };

    case "Farmer -> Agent":
    case "Cooperative -> Agent": {
      const calculatedAmount = Math.round(quantityKg * configurableRatePerKg * 100) / 100;
      return {
        feeId,
        feeType: "certificate_transfer_fee",
        payerId,
        flatRateAmount: configurableRatePerKg,
        calculatedAmount,
        currency,
        isFeeExempt: false,
        policyStatus: "APPLIED",
        feeStatus: "assessed",
        policyNotes: `Transfer route "${route}" charged at configurable rate of ${configurableRatePerKg} ${currency}/kg.`,
        assessedAt: now,
      };
    }

    case "Farmer -> Warehouse":
    case "Cooperative -> Warehouse":
      return {
        feeId,
        feeType: "certificate_transfer_fee",
        payerId,
        calculatedAmount: 0,
        currency,
        isFeeExempt: false,
        policyStatus: "PENDING_BUSINESS_CONFIRMATION",
        feeStatus: "pending_policy",
        policyNotes: `Transfer fee policy for route "${route}" is pending business confirmation. Neither zero-fee exempt nor active fee assessed. Downstream settlement must not interpret this as a confirmed exemption.`,
        assessedAt: now,
      };

    default:
      throw new Error(`Fee Error: Unknown transfer route "${route}".`);
  }
}

/**
 * Creates the initial CertificateHolding for a newly issued TraceCertificate.
 * Idempotent: If an initial holding already exists for this certificate, returns it cleanly.
 */
export async function createInitialCertificateHolding(
  certificate: TraceCertificate,
  actorUid?: string
): Promise<CertificateHolding> {
  const issuerUid = resolveAuthenticatedUserUid(actorUid || certificate.createdBy);
  const holdingId = `holding_init_${certificate.certificateId}`;
  const holdingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, holdingId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(holdingRef);
    if (snap.exists()) {
      return snap.data() as CertificateHolding;
    }

    const holderId = certificate.holderId || certificate.createdBy;
    const holderType = (certificate.holderType || "farmer") as CertificateHolderType;
    const now = new Date().toISOString();

    const holding: CertificateHolding = {
      holdingId,
      certificateId: certificate.certificateId,
      certificateNumber: certificate.certificateNumber,
      lotId: certificate.lotId,
      farmId: certificate.farmId,
      holderId,
      holderType,
      quantityKg: certificate.certifiedQuantityKg,
      availableQuantityKg: certificate.certifiedQuantityKg,
      sourceTransferIds: [],
      status: "active",
      createdBy: issuerUid,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(holdingRef, holding);
    return holding;
  });
}

/**
 * Retrieves a CertificateHolding by holdingId.
 */
export async function getCertificateHolding(holdingId: string): Promise<CertificateHolding | null> {
  if (!holdingId || !holdingId.trim()) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, holdingId.trim()));
  return snap.exists() ? (snap.data() as CertificateHolding) : null;
}

/**
 * Lists all active and historical holdings associated with a certificateId.
 */
export async function listCertificateHoldingsByCertificate(
  certificateId: string
): Promise<CertificateHolding[]> {
  if (!certificateId || !certificateId.trim()) return [];
  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_HOLDINGS),
    where("certificateId", "==", certificateId.trim())
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CertificateHolding);
}

/**
 * Lists all active holdings held by a specific entity (holderId).
 * May return multiple distinct holdings for the same holder.
 */
export async function listCertificateHoldingsByHolder(
  holderId: string
): Promise<CertificateHolding[]> {
  if (!holderId || !holderId.trim()) return [];
  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_HOLDINGS),
    where("holderId", "==", holderId.trim())
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CertificateHolding);
}

/**
 * Lists all distinct holdings for a specific holder under a specific certificate.
 * Returns an array of distinct custody units (never merges them into a single record).
 */
export async function listCertificateHoldingsByCertificateAndHolder(
  certificateId: string,
  holderId: string
): Promise<CertificateHolding[]> {
  if (!certificateId || !certificateId.trim() || !holderId || !holderId.trim()) return [];
  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_HOLDINGS),
    where("certificateId", "==", certificateId.trim()),
    where("holderId", "==", holderId.trim())
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CertificateHolding);
}

export interface InitiateTransferInput {
  transferId?: string; // Optional client-supplied idempotent ID
  sourceHoldingId: string;
  destinationHolderId: string;
  destinationHolderType: CertificateHolderType;
  quantityKg: number;
  transferredQrPackageIds?: string[]; // Specific physical QR packages transferred in package-aware transfer
  actorUid?: string; // Firebase UID of the human initiating the transfer
  currency?: string;
}

/**
 * Atomically executes a Certificate Transfer (partial or full).
 *
 * Guaranteed atomic sequence:
 * 1. Verifies caller authorization to act for the source holding entity.
 * 2. Reads source holding and checks available quantity.
 * 3. Enforces unified packaging accounting:
 *    - Mode A (Package-aware transfer): explicitly selected QR packages must be active,
 *      belong to the source holding, and their sum must exactly equal quantityKg.
 *    - Mode B (Pure bulk transfer): no QR package IDs specified; transfer quantity cannot
 *      exceed derived unpackaged quantity.
 *    - Mode C (Mixed transfer): strictly rejected.
 * 4. Validates the transfer route.
 * 5. Determines fee snapshot.
 * 6. Creates distinct destination holding for this transfer.
 * 7. Decrements source holding (status becomes "depleted" if balance reaches 0).
 * 8. Re-anchors selected QR packages to destination holding (generatedFromHoldingId remains unchanged).
 * 9. Updates parent certificate lifecycle status if appropriate.
 * 10. Commits permanent CertificateTransfer record with transferredQrPackageIds.
 */
export async function initiateCertificateTransfer(
  input: InitiateTransferInput
): Promise<CertificateTransfer> {
  const actorUid = resolveAuthenticatedUserUid(input.actorUid);

  if (!input.sourceHoldingId || !input.sourceHoldingId.trim()) {
    throw new Error("Validation Error: sourceHoldingId is required.");
  }
  if (!input.destinationHolderId || !input.destinationHolderId.trim()) {
    throw new Error("Validation Error: destinationHolderId is required.");
  }
  if (!input.destinationHolderType || !input.destinationHolderType.trim()) {
    throw new Error("Validation Error: destinationHolderType is required.");
  }
  if (typeof input.quantityKg !== "number" || isNaN(input.quantityKg) || input.quantityKg <= 0) {
    throw new Error(
      `Validation Error: quantityKg must be a positive number greater than 0, received ${input.quantityKg}.`
    );
  }

  // Pre-fetch QR packages for source holding to validate packaging accounting
  const qrQuery = query(
    collection(db, COLLECTIONS.QR_CODES),
    where("currentHoldingId", "==", input.sourceHoldingId.trim())
  );
  const qrSnap = await getDocs(qrQuery);
  const existingQRs = qrSnap.docs.map((d) => d.data() as QRCode);

  // Pre-fetch active marketplace listings on this source holding to enforce commitment protections
  const listingsQuery = query(
    collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
    where("sourceHoldingId", "==", input.sourceHoldingId.trim())
  );
  const listingsSnap = await getDocs(listingsQuery);
  const activeListings = listingsSnap.docs
    .map((d) => d.data() as MarketplaceListing)
    .filter((l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation");

  const transferId = input.transferId?.trim() || doc(collection(db, COLLECTIONS.CERTIFICATE_TRANSFERS)).id;
  const transferRef = doc(db, COLLECTIONS.CERTIFICATE_TRANSFERS, transferId);
  const sourceHoldingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, input.sourceHoldingId.trim());

  return await runTransaction(db, async (tx) => {
    // 1. Idempotency Check
    const existingTransferSnap = await tx.get(transferRef);
    if (existingTransferSnap.exists()) {
      return existingTransferSnap.data() as CertificateTransfer;
    }

    // 2. Fetch and Validate Source Holding
    const sourceSnap = await tx.get(sourceHoldingRef);
    if (!sourceSnap.exists()) {
      throw new Error(`Transfer Error: Source holding "${input.sourceHoldingId}" does not exist.`);
    }
    const sourceHolding = sourceSnap.data() as CertificateHolding;

    if (sourceHolding.status !== "active" && sourceHolding.availableQuantityKg <= 0) {
      throw new Error(
        `Transfer Error: Source holding "${sourceHolding.holdingId}" has no available balance to transfer.`
      );
    }

    // 3. Authorization Boundary Checks (Source Actor & Destination Entity)
    await assertActorCanActForHolder(
      actorUid,
      sourceHolding.holderId,
      sourceHolding.holderType,
      "transfer"
    );

    await assertDestinationEntityValid(
      input.destinationHolderId,
      input.destinationHolderType
    );

    // 4. Validate Transfer Route
    const route = validateTransferRoute(sourceHolding.holderType, input.destinationHolderType);

    // 5. Quantity Integrity Checks
    if (input.quantityKg > sourceHolding.availableQuantityKg) {
      throw new Error(
        `Quantity Error: Requested transfer quantity (${input.quantityKg} kg) exceeds available quantity (${sourceHolding.availableQuantityKg} kg) in holding "${sourceHolding.holdingId}".`
      );
    }

    // 5.5 Unified Packaging Accounting & Transfer Validation
    // Formula: allocatedPackageQuantityKg = SUM(qr.representedQuantityKg WHERE returnedToBulk !== true)
    // unpackagedQuantityKg = sourceHolding.availableQuantityKg - allocatedPackageQuantityKg
    const allocatedPackageQuantityKg = existingQRs
      .filter((q) => q.returnedToBulk !== true)
      .reduce((sum, q) => sum + q.representedQuantityKg, 0);

    const unpackagedQuantityKg = sourceHolding.availableQuantityKg - allocatedPackageQuantityKg;

    const isPackageAwareTransfer = Boolean(
      input.transferredQrPackageIds && input.transferredQrPackageIds.length > 0
    );

    const selectedQRsToUpdate: QRCode[] = [];

    if (isPackageAwareTransfer) {
      const requestedIds = input.transferredQrPackageIds!;
      const uniqueIds = new Set(requestedIds);
      if (uniqueIds.size !== requestedIds.length) {
        throw new Error(
          `Package Transfer Error: Duplicate QR package IDs specified in transfer request.`
        );
      }

      // Check if any requested QR package is currently committed in an active marketplace listing
      for (const listing of activeListings) {
        if (listing.inventoryMode === "QR_PACKAGES" && listing.currentQrPackageIds) {
          for (const qid of requestedIds) {
            if (listing.currentQrPackageIds.includes(qid)) {
              throw new Error(
                `Package Transfer Error: QR package "${qid}" is currently committed to active marketplace listing "${listing.listingId}". Cancel or adjust listing before transferring.`
              );
            }
          }
        }
      }

      for (const qid of requestedIds) {
        const matchedQR = existingQRs.find((q) => q.qrId === qid);
        if (!matchedQR) {
          throw new Error(
            `Package Transfer Error: QR package "${qid}" was not found or does not belong to source holding "${sourceHolding.holdingId}".`
          );
        }
        if (matchedQR.status !== "active") {
          throw new Error(
            `Package Transfer Error: QR package "${qid}" has status "${matchedQR.status}". Only active packages can be transferred.`
          );
        }
        if (matchedQR.currentHoldingId !== sourceHolding.holdingId) {
          throw new Error(
            `Package Transfer Error: QR package "${qid}" is not currently in source holding "${sourceHolding.holdingId}".`
          );
        }
        if (matchedQR.returnedToBulk === true) {
          throw new Error(
            `Package Transfer Error: QR package "${qid}" has been returned to bulk and cannot be transferred.`
          );
        }
        selectedQRsToUpdate.push(matchedQR);
      }

      const selectedTotalKg = selectedQRsToUpdate.reduce(
        (sum, q) => sum + q.representedQuantityKg,
        0
      );
      if (selectedTotalKg !== input.quantityKg) {
        throw new Error(
          `Package Transfer Error: Selected QR packages total ${selectedTotalKg} kg, which does not match transfer quantity (${input.quantityKg} kg). Mixed transfers are prohibited.`
        );
      }
    } else {
      // Pure bulk / unpackaged transfer
      // Check active BULK marketplace commitments on this holding
      const committedBulkQuantityKg = activeListings
        .filter((l) => l.inventoryMode === "BULK")
        .reduce((sum, l) => sum + l.quantityAvailableKg, 0);

      const uncommittedUnpackagedKg = Math.max(0, unpackagedQuantityKg - committedBulkQuantityKg);

      if (input.quantityKg > uncommittedUnpackagedKg) {
        throw new Error(
          `Transfer Error: Requested bulk transfer quantity (${input.quantityKg} kg) exceeds uncommitted unpackaged cocoa (${uncommittedUnpackagedKg} kg) in holding "${sourceHolding.holdingId}". Source holding has ${committedBulkQuantityKg} kg committed to active marketplace listings.`
        );
      }
    }

    // 6. Assess Fee
    const feeRecord = calculateTransferFee(
      route,
      input.quantityKg,
      input.currency || "USD",
      sourceHolding.holderId
    );

    // 7. Execute Transfer using single transaction helper
    const { transfer } = executeCertificateTransferInTransaction({
      tx,
      transferId,
      sourceHolding,
      destinationHolderId: input.destinationHolderId,
      destinationHolderType: input.destinationHolderType,
      quantityKg: input.quantityKg,
      actorUid,
      feeApplied: feeRecord,
      route,
      transferredQrPackageIds: isPackageAwareTransfer ? input.transferredQrPackageIds : undefined,
    });

    return transfer;
  });
}

export interface ExecuteTransferInTxContext {
  tx: Transaction;
  transferId: string;
  sourceHolding: CertificateHolding;
  destinationHolderId: string;
  destinationHolderType: CertificateHolderType;
  quantityKg: number;
  actorUid: string;
  feeApplied: AppliedFeeRecord;
  route: SupportedTransferRoute;
  transferredQrPackageIds?: string[];
  now?: string;
}

/**
 * Executes a Certificate Transfer (holding deduction, destination holding creation,
 * QR re-anchoring, certificate status update, and transfer record creation)
 * directly within an existing Firestore transaction context.
 *
 * Guarantees zero nested transaction overhead when called from marketplace finalization.
 */
export function executeCertificateTransferInTransaction(
  ctx: ExecuteTransferInTxContext
): { transfer: CertificateTransfer; destHolding: CertificateHolding } {
  const {
    tx,
    transferId,
    sourceHolding,
    destinationHolderId,
    destinationHolderType,
    quantityKg,
    actorUid,
    feeApplied,
    route,
    transferredQrPackageIds,
  } = ctx;

  const now = ctx.now || new Date().toISOString();
  const destHoldingId = `holding_${transferId}`;
  const destHoldingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, destHoldingId);
  const sourceHoldingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, sourceHolding.holdingId);
  const transferRef = doc(db, COLLECTIONS.CERTIFICATE_TRANSFERS, transferId);

  const isFullTransfer = (sourceHolding.availableQuantityKg - quantityKg) <= 0;
  const newSourceQuantity = sourceHolding.quantityKg - quantityKg;
  const newSourceAvailable = Math.max(0, sourceHolding.availableQuantityKg - quantityKg);
  const newSourceStatus: CertificateHoldingStatus = isFullTransfer ? "depleted" : "partially_transferred";

  const destHolding: CertificateHolding = {
    holdingId: destHoldingId,
    certificateId: sourceHolding.certificateId,
    certificateNumber: sourceHolding.certificateNumber,
    lotId: sourceHolding.lotId,
    farmId: sourceHolding.farmId,
    holderId: destinationHolderId.trim(),
    holderType: destinationHolderType,
    quantityKg,
    availableQuantityKg: quantityKg,
    parentHoldingId: sourceHolding.holdingId,
    sourceTransferId: transferId,
    status: "active",
    createdBy: actorUid,
    createdAt: now,
    updatedAt: now,
  };

  const transfer: CertificateTransfer = {
    transferId,
    certificateId: sourceHolding.certificateId,
    certificateNumber: sourceHolding.certificateNumber,
    lotId: sourceHolding.lotId,
    sourceHoldingId: sourceHolding.holdingId,
    destinationHoldingId: destHoldingId,
    sourceHolderId: sourceHolding.holderId,
    sourceHolderType: sourceHolding.holderType,
    destinationHolderId: destinationHolderId.trim(),
    destinationHolderType,
    route,
    quantityKg,
    isPartialTransfer: !isFullTransfer,
    sourceRemainingQuantityKg: newSourceAvailable,
    feeApplied,
    transferStatus: "completed",
    transferredQrPackageIds: transferredQrPackageIds && transferredQrPackageIds.length > 0 ? transferredQrPackageIds : undefined,
    initiatedBy: actorUid,
    completedBy: actorUid,
    initiatedAt: now,
    completedAt: now,
  };

  tx.set(destHoldingRef, destHolding);
  tx.update(sourceHoldingRef, {
    quantityKg: newSourceQuantity,
    availableQuantityKg: newSourceAvailable,
    status: newSourceStatus,
    updatedAt: now,
  });

  if (transferredQrPackageIds && transferredQrPackageIds.length > 0) {
    for (const qid of transferredQrPackageIds) {
      const qrRef = doc(db, COLLECTIONS.QR_CODES, qid);
      tx.update(qrRef, {
        currentHoldingId: destHoldingId,
        lastTransferId: transferId,
        lastTransferredAt: now,
        updatedAt: now,
      });
    }
  }

  // Update certificate status to partially_transferred
  const certRef = doc(db, COLLECTIONS.CERTIFICATES, sourceHolding.certificateId);
  tx.update(certRef, {
    status: "partially_transferred",
    updatedAt: now,
  });

  tx.set(transferRef, transfer);
  return { transfer, destHolding };
}

/**
 * Retrieves a CertificateTransfer by transferId.
 */
export async function getCertificateTransfer(
  transferId: string
): Promise<CertificateTransfer | null> {
  if (!transferId || !transferId.trim()) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.CERTIFICATE_TRANSFERS, transferId.trim()));
  return snap.exists() ? (snap.data() as CertificateTransfer) : null;
}

/**
 * Lists all transfers for a specific certificate.
 */
export async function listCertificateTransfersByCertificate(
  certificateId: string
): Promise<CertificateTransfer[]> {
  if (!certificateId || !certificateId.trim()) return [];
  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_TRANSFERS),
    where("certificateId", "==", certificateId.trim())
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CertificateTransfer);
}

/**
 * Lists all completed incoming transfers received by a specific CertificateHolding.
 */
export async function listIncomingTransfersForHolding(
  holdingId: string
): Promise<CertificateTransfer[]> {
  if (!holdingId || !holdingId.trim()) return [];
  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_TRANSFERS),
    where("destinationHoldingId", "==", holdingId.trim())
  );
  const snap = await getDocs(q);
  const transfers = snap.docs
    .map((d) => d.data() as CertificateTransfer)
    .filter((t) => t.transferStatus === "completed");
  return transfers.sort((a, b) =>
    (a.completedAt || a.initiatedAt).localeCompare(b.completedAt || b.initiatedAt)
  );
}

/**
 * Lists all completed outgoing transfers dispatched from a specific CertificateHolding.
 */
export async function listOutgoingTransfersForHolding(
  holdingId: string
): Promise<CertificateTransfer[]> {
  if (!holdingId || !holdingId.trim()) return [];
  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_TRANSFERS),
    where("sourceHoldingId", "==", holdingId.trim())
  );
  const snap = await getDocs(q);
  const transfers = snap.docs
    .map((d) => d.data() as CertificateTransfer)
    .filter((t) => t.transferStatus === "completed");
  return transfers.sort((a, b) =>
    (a.completedAt || a.initiatedAt).localeCompare(b.completedAt || b.initiatedAt)
  );
}

/**
 * Recursively resolves the complete holding-specific trace history for a given holdingId.
 *
 * Traceability Guarantees:
 * - Follows the exact provenance lineage of this specific holding unit (sourceTransferId -> sourceHoldingId -> ... -> root initial holding).
 * - Excludes unrelated holdings and transfers belonging to other branches of the certificate.
 * - Detects circular references and fails safely.
 * - Serves as the authoritative provenance anchor for subsequent QR package allocations in Step 7.
 */
export async function resolveCertificateHoldingHistory(
  holdingId: string
): Promise<CertificateHoldingTraceHistory | null> {
  if (!holdingId || !holdingId.trim()) return null;

  const targetHolding = await getCertificateHolding(holdingId.trim());
  if (!targetHolding) return null;

  // 1. Direct incoming transfer(s) into this holding unit
  let incomingTransfers: CertificateTransfer[] = [];
  if (targetHolding.sourceTransferId) {
    const directTransfer = await getCertificateTransfer(targetHolding.sourceTransferId);
    if (directTransfer) {
      incomingTransfers = [directTransfer];
    }
  }
  if (incomingTransfers.length === 0) {
    incomingTransfers = await listIncomingTransfersForHolding(targetHolding.holdingId);
  }

  // 2. Direct outgoing transfers dispatched from this specific holding unit
  const outgoingTransfers = await listOutgoingTransfersForHolding(targetHolding.holdingId);

  // 3. Upstream provenance tracking
  const upstreamHoldingsMap = new Map<string, CertificateHolding>();
  const upstreamTransfersMap = new Map<string, CertificateTransfer>();
  const upstreamHolders: UpstreamHolderSummary[] = [];

  let originalHoldingId = targetHolding.holdingId;
  let originalHolderId = targetHolding.holderId;
  let originalHolderType = targetHolding.holderType;

  // Recursive upstream traversal function following exact source transfer provenance
  async function traverseUpstream(
    currentHolding: CertificateHolding,
    currentPath: Set<string>
  ): Promise<void> {
    if (currentPath.has(currentHolding.holdingId)) {
      throw new Error(
        `Circular Reference Error: Circular holding dependency detected at holdingId "${currentHolding.holdingId}".`
      );
    }
    currentPath.add(currentHolding.holdingId);

    // If currentHolding is root origin holding (no sourceTransferId)
    if (!currentHolding.sourceTransferId) {
      originalHoldingId = currentHolding.holdingId;
      originalHolderId = currentHolding.holderId;
      originalHolderType = currentHolding.holderType;
      if (!upstreamHoldingsMap.has(currentHolding.holdingId)) {
        upstreamHoldingsMap.set(currentHolding.holdingId, currentHolding);
      }
      return;
    }

    const transfer = await getCertificateTransfer(currentHolding.sourceTransferId);
    if (!transfer) {
      return;
    }

    if (!upstreamTransfersMap.has(transfer.transferId)) {
      upstreamTransfersMap.set(transfer.transferId, transfer);
      upstreamHolders.push({
        holderId: transfer.sourceHolderId,
        holderType: transfer.sourceHolderType,
        holdingId: transfer.sourceHoldingId,
        transferredQuantityKg: transfer.quantityKg,
        transferredAt: transfer.completedAt || transfer.initiatedAt,
      });
    }

    const srcHolding = await getCertificateHolding(transfer.sourceHoldingId);
    if (srcHolding) {
      if (!upstreamHoldingsMap.has(srcHolding.holdingId)) {
        upstreamHoldingsMap.set(srcHolding.holdingId, srcHolding);
      }
      const branchPath = new Set(currentPath);
      await traverseUpstream(srcHolding, branchPath);
    }
  }

  // Traverse upstream from target holding
  const initialPath = new Set<string>();
  await traverseUpstream(targetHolding, initialPath);

  // Form chronological transfer sequence combining all upstream contributing transfers and outgoing transfers
  const allContributingTransfersMap = new Map<string, CertificateTransfer>();
  for (const t of upstreamTransfersMap.values()) {
    allContributingTransfersMap.set(t.transferId, t);
  }
  for (const t of incomingTransfers) {
    allContributingTransfersMap.set(t.transferId, t);
  }
  for (const t of outgoingTransfers) {
    allContributingTransfersMap.set(t.transferId, t);
  }

  const chronologicalTransferSequence = Array.from(allContributingTransfersMap.values()).sort(
    (a, b) => (a.completedAt || a.initiatedAt).localeCompare(b.completedAt || b.initiatedAt)
  );

  return {
    holdingId: targetHolding.holdingId,
    certificateId: targetHolding.certificateId,
    certificateNumber: targetHolding.certificateNumber,
    lotId: targetHolding.lotId,
    farmId: targetHolding.farmId,
    holderId: targetHolding.holderId,
    holderType: targetHolding.holderType,
    currentQuantityKg: targetHolding.quantityKg,
    availableQuantityKg: targetHolding.availableQuantityKg,
    status: targetHolding.status,
    incomingTransfers,
    outgoingTransfers,
    upstreamHoldings: Array.from(upstreamHoldingsMap.values()),
    upstreamHolders,
    upstreamTransfers: Array.from(upstreamTransfersMap.values()),
    chronologicalTransferSequence,
    originalHoldingId,
    originalHolderId,
    originalHolderType,
    resolvedAt: new Date().toISOString(),
  };
}
