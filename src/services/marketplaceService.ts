/**
 * Marketplace Service (Role 3 Domain Logic)
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages Marketplace Listings for Certified and Uncertified Cocoa
 * - Enforces strict 1-to-1 source isolation:
 *   - Certified: Exactly 1 CocoaLot + 1 TraceCertificate + 1 CertificateHolding + 1 inventoryMode (BULK or QR_PACKAGES)
 *   - Uncertified: Exactly 1 CocoaLot (no certificate, holding, or QR packages)
 * - Prohibits mixing certified + uncertified, multiple lots, or multiple holdings
 * - Enforces derived packaging accounting and active listing reservation/commitments
 * - Prohibits duplicate QR package reservations across listings
 * - Supports manual availability adjustments (LOCAL_SALE, INVENTORY_DAMAGE, NEGOTIATION_CANCELLED)
 * - Guarantees zero redundant mutable inventory counters (derived uncertified accounting)
 * - Preserves historical lineage and auditable record keeping
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import {
  MarketplaceListing,
  MarketplaceCertificationType,
  MarketplaceInventoryMode,
  MarketplaceListingStatus,
  CertificateHolderType,
  QRCode,
  CloudinaryImageReference,
  CocoaLotAdjustment,
  PhysicalAdjustmentType,
  NonConsumingAdjustmentType,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";
import { assertActorCanActForHolder } from "@/lib/certificateAuthorization";
import { getCocoaLot } from "./cocoaLotService";
import { getTraceCertificate } from "./certificateService";
import { getCertificateHolding } from "./transferService";

export const COLLECTIONS = {
  MARKETPLACE_LISTINGS: "marketplaceListings",
  COCOA_LOTS: "cocoaLots",
  CERTIFICATES: "certificates",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  QR_CODES: "qrCodes",
  TRADES: "trades",
  COCOA_LOT_ADJUSTMENTS: "cocoaLotAdjustments",
  SELLER_ACCESS_RECORDS: "sellerAccessRecords",
} as const;

export interface CreateMarketplaceListingInput {
  listingId?: string;
  sellerHolderId: string;
  sellerHolderType: CertificateHolderType;
  createdByUid?: string; // Human operator Firebase UID
  certificationType: MarketplaceCertificationType;
  lotId: string;
  certificateId?: string;
  sourceHoldingId?: string;
  inventoryMode?: MarketplaceInventoryMode; // "BULK" or "QR_PACKAGES" (required for certified)
  initialQrPackageIds?: string[]; // Required for QR_PACKAGES mode
  title: string;
  description?: string;
  quantityInitialKg: number;
  pricePerKg: number;
  currency?: string; // Defaults to "XAF"
  qualityGrade?: string;
  cocoaImage?: CloudinaryImageReference;
}

export interface UpdateMarketplaceListingInput {
  listingId: string;
  actorUid?: string;
  title?: string;
  description?: string;
  pricePerKg?: number;
  currency?: string;
  quantityAvailableKg?: number; // Only allowed for BULK or uncertified listings within capacity
}

export interface AdjustAvailabilityInput {
  adjustmentId?: string;
  lotId: string;
  listingId?: string;
  sellerHolderId: string;
  actorUid?: string;
  adjustmentType: PhysicalAdjustmentType | NonConsumingAdjustmentType | (string & {});
  isPhysicalDeduction?: boolean;
  deductedQuantityKg?: number;
  newStatus?: MarketplaceListingStatus;
  newQuantityKg?: number;
  reason: string;
  notes?: string;
}

/**
 * Generates a unique, traceable Marketplace Listing Number.
 * Format: LIST-CMR-YYYY-XXXXXX
 */
export function generateListingNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `LIST-CMR-${year}-${rand}`;
}

/**
 * Derives the legitimate uncertified eligible physical quantity for a CocoaLot.
 * Formula:
 * UncertifiedEligible = Lot.quantityKg - (Lot.certifiedQuantityKg || 0)
 *                     - completedUncertifiedCommercialSales
 *                     - recordedPhysicalDeductions
 */
export async function getUncertifiedEligibleQuantity(lotId: string): Promise<number> {
  if (!lotId || !lotId.trim()) return 0;
  const cleanLotId = lotId.trim();

  const lot = await getCocoaLot(cleanLotId);
  if (!lot) return 0;

  const currentCertifiedKg = lot.certifiedQuantityKg || 0;

  // Completed uncertified commercial trades
  const tradesQuery = query(
    collection(db, COLLECTIONS.TRADES),
    where("lotId", "==", cleanLotId),
    where("certificationType", "==", "uncertified")
  );
  const tradesSnap = await getDocs(tradesQuery);
  const completedSalesKg = tradesSnap.docs
    .map((d) => d.data())
    .filter((t) => t.tradeStatus === "completed")
    .reduce((sum, t) => sum + (t.quantityKg || 0), 0);

  // Recorded physical deductions
  const adjQuery = query(
    collection(db, COLLECTIONS.COCOA_LOT_ADJUSTMENTS),
    where("lotId", "==", cleanLotId)
  );
  const adjSnap = await getDocs(adjQuery);
  const physicalDeductionsKg = adjSnap.docs
    .map((d) => d.data())
    .filter((a) => a.isPhysicalDeduction === true)
    .reduce((sum, a) => sum + (a.deductedQuantityKg || 0), 0);

  return Math.max(0, lot.quantityKg - currentCertifiedKg - completedSalesKg - physicalDeductionsKg);
}

/**
 * Creates a new MarketplaceListing with strict 1-to-1 provenance isolation,
 * zero redundant state, and active listing commitment validation.
 */
export async function createMarketplaceListing(
  input: CreateMarketplaceListingInput
): Promise<MarketplaceListing> {
  const actorUid = resolveAuthenticatedUserUid(input.createdByUid);

  if (!input.sellerHolderId || !input.sellerHolderId.trim()) {
    throw new Error("Validation Error: sellerHolderId is required.");
  }
  if (!input.sellerHolderType || !input.sellerHolderType.trim()) {
    throw new Error("Validation Error: sellerHolderType is required.");
  }
  if (!input.lotId || !input.lotId.trim()) {
    throw new Error("Validation Error: lotId is required.");
  }
  if (!input.title || !input.title.trim()) {
    throw new Error("Validation Error: title is required.");
  }
  if (typeof input.quantityInitialKg !== "number" || isNaN(input.quantityInitialKg) || input.quantityInitialKg <= 0) {
    throw new Error(
      `Validation Error: quantityInitialKg must be a positive number greater than 0, received ${input.quantityInitialKg}.`
    );
  }
  if (typeof input.pricePerKg !== "number" || isNaN(input.pricePerKg) || input.pricePerKg <= 0) {
    throw new Error(
      `Validation Error: pricePerKg must be a positive number greater than 0, received ${input.pricePerKg}.`
    );
  }

  // 1. Authorize Human Operator for Seller Entity
  await assertActorCanActForHolder(
    actorUid,
    input.sellerHolderId,
    input.sellerHolderType,
    "manage"
  );

  // 2. Fetch Backing Cocoa Lot
  const lot = await getCocoaLot(input.lotId);
  if (!lot) {
    throw new Error(`Upstream Lookup Error: Cocoa lot "${input.lotId}" does not exist.`);
  }

  const cocoaImage = input.cocoaImage || lot.cocoaImage;
  if (!cocoaImage || !cocoaImage.publicId) {
    throw new Error("Validation Error: Valid Cloudinary image reference is required for marketplace listing.");
  }

  const listingId = input.listingId?.trim() || doc(collection(db, COLLECTIONS.MARKETPLACE_LISTINGS)).id;
  const listingNumber = generateListingNumber();
  const now = new Date().toISOString();
  const currency = (input.currency || lot.currency || "XAF").toUpperCase();

  // 3. Certified vs. Uncertified Validation & Commitment Checks
  if (input.certificationType === "certified") {
    if (!input.certificateId || !input.certificateId.trim()) {
      throw new Error("Validation Error: certificateId is required for certified listings.");
    }
    if (!input.sourceHoldingId || !input.sourceHoldingId.trim()) {
      throw new Error("Validation Error: sourceHoldingId is required for certified listings.");
    }
    if (!input.inventoryMode || (input.inventoryMode !== "BULK" && input.inventoryMode !== "QR_PACKAGES")) {
      throw new Error(
        'Validation Error: inventoryMode must be explicitly specified as "BULK" or "QR_PACKAGES" for certified listings.'
      );
    }

    const holding = await getCertificateHolding(input.sourceHoldingId);
    if (!holding) {
      throw new Error(`Upstream Lookup Error: Source CertificateHolding "${input.sourceHoldingId}" does not exist.`);
    }
    if (holding.holderId !== input.sellerHolderId.trim()) {
      throw new Error(
        `Ownership Error: Source holding "${holding.holdingId}" belongs to "${holding.holderId}", not seller "${input.sellerHolderId}".`
      );
    }
    if (holding.lotId !== lot.lotId) {
      throw new Error(
        `Relational Mismatch Error: Source holding lotId ("${holding.lotId}") does not match listing lotId ("${lot.lotId}").`
      );
    }
    if (holding.certificateId !== input.certificateId.trim()) {
      throw new Error(
        `Relational Mismatch Error: Source holding certificateId ("${holding.certificateId}") does not match listing certificateId ("${input.certificateId}").`
      );
    }

    const cert = await getTraceCertificate(input.certificateId);
    if (!cert) {
      throw new Error(`Upstream Lookup Error: Trace Certificate "${input.certificateId}" does not exist.`);
    }

    // Query active marketplace listings on this source holding to enforce commitment integrity
    const existingListingsQuery = query(
      collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
      where("sourceHoldingId", "==", holding.holdingId)
    );
    const existingListingsSnap = await getDocs(existingListingsQuery);
    const activeListings = existingListingsSnap.docs
      .map((d) => d.data() as MarketplaceListing)
      .filter((l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation");

    // Fetch existing QRs on source holding
    const qrQuery = query(
      collection(db, COLLECTIONS.QR_CODES),
      where("currentHoldingId", "==", holding.holdingId)
    );
    const qrSnap = await getDocs(qrQuery);
    const existingQRs = qrSnap.docs.map((d) => d.data() as QRCode);

    const allocatedPackageQuantityKg = existingQRs
      .filter((q) => q.returnedToBulk !== true)
      .reduce((sum, q) => sum + q.representedQuantityKg, 0);

    const unpackagedQuantityKg = Math.max(0, holding.availableQuantityKg - allocatedPackageQuantityKg);

    if (input.inventoryMode === "BULK") {
      if (input.initialQrPackageIds && input.initialQrPackageIds.length > 0) {
        throw new Error(
          "Validation Error: BULK inventory mode cannot specify qrPackageIds. Use QR_PACKAGES mode for package-level sales."
        );
      }

      const committedBulkKg = activeListings
        .filter((l) => l.inventoryMode === "BULK")
        .reduce((sum, l) => sum + l.quantityAvailableKg, 0);

      const uncommittedUnpackagedKg = Math.max(0, unpackagedQuantityKg - committedBulkKg);

      if (input.quantityInitialKg > uncommittedUnpackagedKg) {
        throw new Error(
          `Capacity Error: Listing quantity (${input.quantityInitialKg} kg) exceeds uncommitted unpackaged cocoa (${uncommittedUnpackagedKg} kg) in holding "${holding.holdingId}". Source holding has ${committedBulkKg} kg committed to active marketplace listings.`
        );
      }

      const listing: MarketplaceListing = {
        listingId,
        listingNumber,
        sellerHolderId: input.sellerHolderId.trim(),
        sellerHolderType: input.sellerHolderType,
        createdByUid: actorUid,
        certificationType: "certified",
        lotId: lot.lotId,
        certificateId: cert.certificateId,
        sourceHoldingId: holding.holdingId,
        inventoryMode: "BULK",
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        quantityInitialKg: input.quantityInitialKg,
        quantityAvailableKg: input.quantityInitialKg,
        pricePerKg: input.pricePerKg,
        currency,
        qualityGrade: input.qualityGrade || lot.qualityGrade,
        cocoaImage,
        listingStatus: "available",
        createdAt: now,
        updatedAt: now,
      };

      const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, listingId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(listingRef);
        if (snap.exists()) return;
        tx.set(listingRef, listing);
      });

      return listing;
    } else {
      // QR_PACKAGES Mode
      if (!input.initialQrPackageIds || input.initialQrPackageIds.length === 0) {
        throw new Error(
          "Validation Error: initialQrPackageIds is mandatory for QR_PACKAGES inventory mode."
        );
      }

      const requestedIds = input.initialQrPackageIds.map((id) => id.trim());
      const uniqueIds = new Set(requestedIds);
      if (uniqueIds.size !== requestedIds.length) {
        throw new Error("Validation Error: Duplicate QR package IDs specified in listing.");
      }

      // Check for overlapping reservations in other active QR_PACKAGES listings
      for (const activeListing of activeListings) {
        if (activeListing.inventoryMode === "QR_PACKAGES" && activeListing.currentQrPackageIds) {
          for (const qid of requestedIds) {
            if (activeListing.currentQrPackageIds.includes(qid)) {
              throw new Error(
                `Reservation Error: QR package "${qid}" is already committed to active marketplace listing "${activeListing.listingId}". A QR package can belong to only one active listing.`
              );
            }
          }
        }
      }

      const matchedQRs: QRCode[] = [];
      for (const qid of requestedIds) {
        const qr = existingQRs.find((q) => q.qrId === qid);
        if (!qr) {
          throw new Error(
            `Package Lookup Error: QR package "${qid}" was not found or does not belong to source holding "${holding.holdingId}".`
          );
        }
        if (qr.status !== "active") {
          throw new Error(
            `Package Error: QR package "${qid}" has status "${qr.status}". Only active packages can be listed.`
          );
        }
        if (qr.currentHoldingId !== holding.holdingId) {
          throw new Error(
            `Package Error: QR package "${qid}" is in holding "${qr.currentHoldingId}", not source holding "${holding.holdingId}".`
          );
        }
        if (qr.lotId !== lot.lotId) {
          throw new Error(
            `Relational Mismatch Error: QR package "${qid}" lotId ("${qr.lotId}") does not match listing lotId ("${lot.lotId}").`
          );
        }
        if (qr.certificateId !== cert.certificateId) {
          throw new Error(
            `Relational Mismatch Error: QR package "${qid}" certificateId ("${qr.certificateId}") does not match listing certificateId ("${cert.certificateId}").`
          );
        }
        if (qr.returnedToBulk === true) {
          throw new Error(
            `Package Error: QR package "${qid}" has been returned to bulk and cannot be listed as a packaged unit.`
          );
        }
        matchedQRs.push(qr);
      }

      const totalPackageWeightKg = matchedQRs.reduce(
        (sum, q) => sum + q.representedQuantityKg,
        0
      );

      if (totalPackageWeightKg !== input.quantityInitialKg) {
        throw new Error(
          `Quantity Mismatch Error: Selected QR packages total ${totalPackageWeightKg} kg, which does not match quantityInitialKg (${input.quantityInitialKg} kg). For QR_PACKAGES listings, quantity must equal the exact sum of selected packages.`
        );
      }

      const listing: MarketplaceListing = {
        listingId,
        listingNumber,
        sellerHolderId: input.sellerHolderId.trim(),
        sellerHolderType: input.sellerHolderType,
        createdByUid: actorUid,
        certificationType: "certified",
        lotId: lot.lotId,
        certificateId: cert.certificateId,
        sourceHoldingId: holding.holdingId,
        inventoryMode: "QR_PACKAGES",
        initialQrPackageIds: requestedIds,
        currentQrPackageIds: requestedIds,
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        quantityInitialKg: totalPackageWeightKg,
        quantityAvailableKg: totalPackageWeightKg,
        pricePerKg: input.pricePerKg,
        currency,
        qualityGrade: input.qualityGrade || lot.qualityGrade,
        cocoaImage,
        listingStatus: "available",
        createdAt: now,
        updatedAt: now,
      };

      const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, listingId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(listingRef);
        if (snap.exists()) return;
        tx.set(listingRef, listing);
      });

      return listing;
    }
  } else if (input.certificationType === "uncertified") {
    // Uncertified listing validation
    if (input.certificateId || input.sourceHoldingId || input.inventoryMode || input.initialQrPackageIds) {
      throw new Error(
        "Validation Error: Uncertified listings cannot reference certificateId, sourceHoldingId, inventoryMode, or qrPackageIds."
      );
    }

    const uncertifiedEligibleKg = await getUncertifiedEligibleQuantity(lot.lotId);

    // Query active uncertified listings on this lot
    const activeUncertifiedQuery = query(
      collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
      where("lotId", "==", lot.lotId),
      where("certificationType", "==", "uncertified")
    );
    const activeSnap = await getDocs(activeUncertifiedQuery);
    const activeCommittedKg = activeSnap.docs
      .map((d) => d.data() as MarketplaceListing)
      .filter((l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation")
      .reduce((sum, l) => sum + l.quantityAvailableKg, 0);

    const availableUncertifiedKg = Math.max(0, uncertifiedEligibleKg - activeCommittedKg);

    if (input.quantityInitialKg > availableUncertifiedKg) {
      throw new Error(
        `Capacity Error: Listing quantity (${input.quantityInitialKg} kg) exceeds available uncertified cocoa (${availableUncertifiedKg} kg) for Cocoa Lot "${lot.lotId}". Existing active uncertified commitments: ${activeCommittedKg} kg, eligible uncertified capacity: ${uncertifiedEligibleKg} kg.`
      );
    }

    const listing: MarketplaceListing = {
      listingId,
      listingNumber,
      sellerHolderId: input.sellerHolderId.trim(),
      sellerHolderType: input.sellerHolderType,
      createdByUid: actorUid,
      certificationType: "uncertified",
      lotId: lot.lotId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      quantityInitialKg: input.quantityInitialKg,
      quantityAvailableKg: input.quantityInitialKg,
      pricePerKg: input.pricePerKg,
      currency,
      qualityGrade: input.qualityGrade || lot.qualityGrade,
      cocoaImage,
      listingStatus: "available",
      createdAt: now,
      updatedAt: now,
    };

    const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, listingId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(listingRef);
      if (snap.exists()) return;
      tx.set(listingRef, listing);
    });

    return listing;
  } else {
    throw new Error(`Validation Error: Invalid certificationType "${input.certificationType}". Must be "certified" or "uncertified".`);
  }
}

/**
 * Retrieves a MarketplaceListing by its listingId.
 */
export async function getMarketplaceListing(
  listingId: string
): Promise<MarketplaceListing | null> {
  if (!listingId || !listingId.trim()) return null;
  const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, listingId.trim());
  try {
    const snap = await getDoc(listingRef);
    if (!snap.exists()) return null;
    return snap.data() as MarketplaceListing;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.MARKETPLACE_LISTINGS}/${listingId}`);
    return null;
  }
}

export interface MarketplaceFilterOptions {
  certificationType?: MarketplaceCertificationType;
  sellerHolderId?: string;
  lotId?: string;
  listingStatus?: MarketplaceListingStatus;
  inventoryMode?: MarketplaceInventoryMode;
}

/**
 * Lists marketplace listings with optional filters.
 */
export async function listMarketplaceListings(
  filters?: MarketplaceFilterOptions
): Promise<MarketplaceListing[]> {
  const colRef = collection(db, COLLECTIONS.MARKETPLACE_LISTINGS);
  const snap = await getDocs(colRef);
  let listings = snap.docs.map((d) => d.data() as MarketplaceListing);

  if (filters) {
    if (filters.certificationType) {
      listings = listings.filter((l) => l.certificationType === filters.certificationType);
    }
    if (filters.sellerHolderId) {
      listings = listings.filter((l) => l.sellerHolderId === filters.sellerHolderId);
    }
    if (filters.lotId) {
      listings = listings.filter((l) => l.lotId === filters.lotId);
    }
    if (filters.listingStatus) {
      listings = listings.filter((l) => l.listingStatus === filters.listingStatus);
    }
    if (filters.inventoryMode) {
      listings = listings.filter((l) => l.inventoryMode === filters.inventoryMode);
    }
  }

  return listings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Updates an active marketplace listing.
 */
export async function updateMarketplaceListing(
  input: UpdateMarketplaceListingInput
): Promise<MarketplaceListing> {
  const actorUid = resolveAuthenticatedUserUid(input.actorUid);
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error(`Listing Error: Marketplace listing "${input.listingId}" does not exist.`);
  }

  await assertActorCanActForHolder(
    actorUid,
    listing.sellerHolderId,
    listing.sellerHolderType,
    "manage"
  );

  if (listing.listingStatus !== "available" && listing.listingStatus !== "under_negotiation") {
    throw new Error(
      `State Error: Cannot update listing in "${listing.listingStatus}" status. Only available or under_negotiation listings can be edited.`
    );
  }

  // For QR_PACKAGES, manual editing of quantityAvailableKg is strictly prohibited
  if (input.quantityAvailableKg !== undefined && listing.inventoryMode === "QR_PACKAGES") {
    throw new Error(
      "Validation Error: Manual quantity editing is prohibited for QR_PACKAGES listings. Quantity is dynamically derived from currentQrPackageIds."
    );
  }

  const now = new Date().toISOString();
  const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, listing.listingId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(listingRef);
    if (!snap.exists()) {
      throw new Error(`Listing Error: Marketplace listing "${input.listingId}" does not exist.`);
    }
    const current = snap.data() as MarketplaceListing;

    const updated: MarketplaceListing = {
      ...current,
      title: input.title?.trim() || current.title,
      description: input.description !== undefined ? input.description.trim() || undefined : current.description,
      pricePerKg: input.pricePerKg !== undefined && input.pricePerKg > 0 ? input.pricePerKg : current.pricePerKg,
      currency: input.currency?.trim().toUpperCase() || current.currency,
      quantityAvailableKg:
        input.quantityAvailableKg !== undefined && input.quantityAvailableKg >= 0
          ? input.quantityAvailableKg
          : current.quantityAvailableKg,
      updatedAt: now,
    };

    tx.set(listingRef, updated);
    return updated;
  });
}

/**
 * Cancels an active or under_negotiation marketplace listing and releases commitments.
 */
export async function cancelMarketplaceListing(
  listingId: string,
  actorUid?: string,
  reason?: string
): Promise<MarketplaceListing> {
  const verifiedActor = resolveAuthenticatedUserUid(actorUid);
  const listing = await getMarketplaceListing(listingId);
  if (!listing) {
    throw new Error(`Listing Error: Marketplace listing "${listingId}" does not exist.`);
  }

  await assertActorCanActForHolder(
    verifiedActor,
    listing.sellerHolderId,
    listing.sellerHolderType,
    "manage"
  );

  if (listing.listingStatus === "cancelled") {
    return listing;
  }
  if (listing.listingStatus === "sold") {
    throw new Error(`State Error: Cannot cancel sold listing "${listingId}".`);
  }

  const now = new Date().toISOString();
  const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, listing.listingId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(listingRef);
    if (!snap.exists()) {
      throw new Error(`Listing Error: Marketplace listing "${listingId}" does not exist.`);
    }
    const current = snap.data() as MarketplaceListing;

    const updated: MarketplaceListing = {
      ...current,
      listingStatus: "cancelled",
      updatedAt: now,
    };

    tx.set(listingRef, updated);

    // Record adjustment audit
    const adjId = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const adjRef = doc(db, COLLECTIONS.COCOA_LOT_ADJUSTMENTS, adjId);
    const adjustment: CocoaLotAdjustment = {
      adjustmentId: adjId,
      lotId: current.lotId,
      listingId: current.listingId,
      sellerHolderId: current.sellerHolderId,
      recordedByUid: verifiedActor,
      adjustmentType: "MANUAL_STATUS_CHANGE",
      isPhysicalDeduction: false,
      deductedQuantityKg: 0,
      previousStatus: current.listingStatus,
      newStatus: "cancelled",
      previousQuantityKg: current.quantityAvailableKg,
      newQuantityKg: current.quantityAvailableKg,
      quantityDeltaKg: 0,
      reason: reason?.trim() || "Listing cancelled by seller",
      recordedAt: now,
    };
    tx.set(adjRef, adjustment);

    return updated;
  });
}

/**
 * Records a manual availability adjustment or physical deduction (LOCAL_SALE, INVENTORY_DAMAGE, etc.)
 */
export async function adjustMarketplaceAvailability(
  input: AdjustAvailabilityInput
): Promise<CocoaLotAdjustment> {
  const actorUid = resolveAuthenticatedUserUid(input.actorUid);

  if (!input.lotId || !input.lotId.trim()) {
    throw new Error("Validation Error: lotId is required.");
  }
  if (!input.sellerHolderId || !input.sellerHolderId.trim()) {
    throw new Error("Validation Error: sellerHolderId is required.");
  }
  if (!input.reason || !input.reason.trim()) {
    throw new Error("Validation Error: reason is required.");
  }

  await assertActorCanActForHolder(
    actorUid,
    input.sellerHolderId,
    "farmer", // Default baseline holder check
    "manage"
  );

  const lot = await getCocoaLot(input.lotId);
  if (!lot) {
    throw new Error(`Upstream Lookup Error: Cocoa lot "${input.lotId}" does not exist.`);
  }

  const isPhysical =
    input.isPhysicalDeduction ??
    (input.adjustmentType === "LOCAL_SALE" ||
      input.adjustmentType === "INVENTORY_DAMAGE" ||
      input.adjustmentType === "OTHER_PHYSICAL_DEDUCTION");

  const deductedQty = isPhysical ? (input.deductedQuantityKg || 0) : 0;
  if (isPhysical && deductedQty <= 0) {
    throw new Error(
      `Validation Error: deductedQuantityKg must be greater than 0 for physical adjustment type "${input.adjustmentType}".`
    );
  }

  // Validate physical headroom against uncertified capacity and active listings
  if (isPhysical) {
    const uncertifiedEligible = await getUncertifiedEligibleQuantity(lot.lotId);
    if (deductedQty > uncertifiedEligible) {
      throw new Error(
        `Capacity Error: Deducted quantity (${deductedQty} kg) exceeds remaining uncertified eligible capacity (${uncertifiedEligible} kg) for Cocoa Lot "${lot.lotId}".`
      );
    }

    // Check if deduction would leave active listings overcommitted
    const activeQuery = query(
      collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
      where("lotId", "==", lot.lotId),
      where("certificationType", "==", "uncertified")
    );
    const activeSnap = await getDocs(activeQuery);
    const committedKg = activeSnap.docs
      .map((d) => d.data() as MarketplaceListing)
      .filter((l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation")
      .reduce((sum, l) => sum + l.quantityAvailableKg, 0);

    const remainingAfterDeduction = uncertifiedEligible - deductedQty;
    if (remainingAfterDeduction < committedKg) {
      throw new Error(
        `Commitment Error: Cannot deduct ${deductedQty} kg. Active marketplace listings commit ${committedKg} kg out of ${uncertifiedEligible} kg remaining. Maximum allowed deduction is ${uncertifiedEligible - committedKg} kg.`
      );
    }
  }

  const adjId = input.adjustmentId?.trim() || `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const adjRef = doc(db, COLLECTIONS.COCOA_LOT_ADJUSTMENTS, adjId);

  const adjustment: CocoaLotAdjustment = {
    adjustmentId: adjId,
    lotId: lot.lotId,
    listingId: input.listingId?.trim() || undefined,
    sellerHolderId: input.sellerHolderId.trim(),
    recordedByUid: actorUid,
    adjustmentType: input.adjustmentType,
    isPhysicalDeduction: isPhysical,
    deductedQuantityKg: deductedQty,
    newStatus: input.newStatus,
    newQuantityKg: input.newQuantityKg,
    reason: input.reason.trim(),
    notes: input.notes?.trim() || undefined,
    recordedAt: now,
  };

  await runTransaction(db, async (tx) => {
    tx.set(adjRef, adjustment);

    // If an associated listing is provided, update its status or quantity
    if (input.listingId) {
      const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, input.listingId.trim());
      const listingSnap = await tx.get(listingRef);
      if (listingSnap.exists()) {
        const updates: Partial<MarketplaceListing> = { updatedAt: now };
        if (input.newStatus) updates.listingStatus = input.newStatus;
        if (input.newQuantityKg !== undefined) {
          updates.quantityAvailableKg = input.newQuantityKg;
          if (input.newQuantityKg <= 0) updates.listingStatus = "sold";
        }
        tx.update(listingRef, updates);
      }
    }
  });

  return adjustment;
}

/**
 * Sanitizes a MarketplaceListing for safe public browsing.
 * Excludes internal Firebase UIDs, private operator identifiers, and unverified credentials.
 */
export function sanitizePublicListing(listing: MarketplaceListing) {
  return {
    listingId: listing.listingId,
    listingNumber: listing.listingNumber,
    sellerHolderType: listing.sellerHolderType,
    certificationType: listing.certificationType,
    inventoryMode: listing.inventoryMode,
    title: listing.title,
    description: listing.description,
    quantityAvailableKg: listing.quantityAvailableKg,
    pricePerKg: listing.pricePerKg,
    currency: listing.currency,
    qualityGrade: listing.qualityGrade,
    cocoaImage: listing.cocoaImage,
    listingStatus: listing.listingStatus,
    createdAt: listing.createdAt,
  };
}
