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
import { firebaseAdminAuth, firebaseAdminDb } from "@/lib/firebaseAdmin";
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
  CocoaLot,
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
  const actorUid =
    typeof input.createdByUid === "string"
      ? input.createdByUid.trim()
      : "";

  if (!actorUid) {
    throw new Error(
      "Authentication Required: A verified actor UID is required."
    );
  }

  const sellerHolderId =
    typeof input.sellerHolderId === "string"
      ? input.sellerHolderId.trim()
      : "";

  const lotId =
    typeof input.lotId === "string" ? input.lotId.trim() : "";

  const title =
    typeof input.title === "string" ? input.title.trim() : "";

  if (!sellerHolderId || sellerHolderId.length > 256) {
    throw new Error("Validation Error: A valid sellerHolderId is required.");
  }

  if (!lotId || lotId.length > 256) {
    throw new Error("Validation Error: A valid lotId is required.");
  }

  if (!title || title.length > 150) {
    throw new Error("Validation Error: Title must contain 1–150 characters.");
  }

  if (
    input.description !== undefined &&
    (typeof input.description !== "string" ||
      input.description.length > 3000)
  ) {
    throw new Error("Validation Error: Description cannot exceed 3000 characters.");
  }

  if (
    typeof input.quantityInitialKg !== "number" ||
    !Number.isFinite(input.quantityInitialKg) ||
    input.quantityInitialKg <= 0
  ) {
    throw new Error(
      "Validation Error: quantityInitialKg must be finite and positive."
    );
  }

  if (
    typeof input.pricePerKg !== "number" ||
    !Number.isFinite(input.pricePerKg) ||
    input.pricePerKg <= 0
  ) {
    throw new Error(
      "Validation Error: pricePerKg must be finite and positive."
    );
  }

  if (
    typeof input.sellerHolderType !== "string" ||
    !["farmer", "cooperative", "agent", "warehouse"].includes(
      input.sellerHolderType.trim().toLowerCase()
    )
  ) {
    throw new Error("Validation Error: Unsupported seller holder type.");
  }

  if (
    input.certificationType !== "certified" &&
    input.certificationType !== "uncertified"
  ) {
    throw new Error(
      'Validation Error: certificationType must be "certified" or "uncertified".'
    );
  }

  if (
    input.listingId !== undefined &&
    (
      typeof input.listingId !== "string" ||
      !input.listingId.trim() ||
      input.listingId.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(input.listingId.trim())
    )
  ) {
    throw new Error("Validation Error: Invalid listingId.");
  }

  if (
    input.currency !== undefined &&
    (
      typeof input.currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(input.currency.trim())
    )
  ) {
    throw new Error("Validation Error: Currency must be a three-letter code.");
  }

  const sellerHolderType = input.sellerHolderType.trim();
  const normalizedSellerType = sellerHolderType.toLowerCase();

  // An organizational membership verifier has not yet been implemented.
  // Only trusted administrators can currently operate organizational listings.
  const authRecord = await firebaseAdminAuth.getUser(actorUid);
  const isAdmin = authRecord.customClaims?.admin === true;

  const marketplaceCollection =
    firebaseAdminDb.collection("marketplaceListings");

  const listingId =
    input.listingId?.trim() || marketplaceCollection.doc().id;

  const listingRef = marketplaceCollection.doc(listingId);
  const lotRef = firebaseAdminDb.collection("cocoaLots").doc(lotId);

  const now = new Date().toISOString();

  const currencyInput =
    typeof input.currency === "string"
      ? input.currency.trim().toUpperCase()
      : "";

  const requestedCurrency = currencyInput || undefined;

  const requestedQrIds: string[] = [];

  if (input.initialQrPackageIds !== undefined) {
    if (
      !Array.isArray(input.initialQrPackageIds) ||
      input.initialQrPackageIds.length === 0 ||
      input.initialQrPackageIds.length > 100
    ) {
      throw new Error(
        "Validation Error: Provide between 1 and 100 QR package IDs when using QR_PACKAGES mode."
      );
    }

    for (const id of input.initialQrPackageIds) {
      if (
        typeof id !== "string" ||
        !id.trim() ||
        id.length > 256
      ) {
        throw new Error("Validation Error: An invalid QR package ID was supplied.");
      }

      requestedQrIds.push(id.trim());
    }

    if (new Set(requestedQrIds).size !== requestedQrIds.length) {
      throw new Error("Validation Error: Duplicate QR package IDs are not allowed.");
    }
  }

  const certificationType = input.certificationType;

  let sourceHoldingId = "";
  let certificateId = "";
  let inventoryMode: MarketplaceInventoryMode | undefined;
  let finalQuantityKg = input.quantityInitialKg;
  let currentQrPackageIds: string[] | undefined;
  let cocoaImage: CloudinaryImageReference | undefined;
  let qualityGrade = input.qualityGrade;

  if (certificationType === "certified") {
    if (
      typeof input.certificateId !== "string" ||
      !input.certificateId.trim() ||
      input.certificateId.length > 256
    ) {
      throw new Error("Validation Error: certificateId is required.");
    }

    if (
      typeof input.sourceHoldingId !== "string" ||
      !input.sourceHoldingId.trim() ||
      input.sourceHoldingId.length > 256
    ) {
      throw new Error("Validation Error: sourceHoldingId is required.");
    }

    if (
      input.inventoryMode !== "BULK" &&
      input.inventoryMode !== "QR_PACKAGES"
    ) {
      throw new Error(
        'Validation Error: Certified listings require inventoryMode "BULK" or "QR_PACKAGES".'
      );
    }

    if (input.inventoryMode === "BULK" && input.initialQrPackageIds !== undefined) {
      throw new Error(
        "Validation Error: BULK listings must not specify QR package IDs."
      );
    }

    if (
      input.inventoryMode === "QR_PACKAGES" &&
      requestedQrIds.length === 0
    ) {
      throw new Error(
        "Validation Error: QR_PACKAGES listings require package IDs."
      );
    }

    sourceHoldingId = input.sourceHoldingId.trim();
    certificateId = input.certificateId.trim();
    inventoryMode = input.inventoryMode;
  } else {
    if (
      input.certificateId !== undefined ||
      input.sourceHoldingId !== undefined ||
      input.inventoryMode !== undefined ||
      input.initialQrPackageIds !== undefined
    ) {
      throw new Error(
        "Validation Error: Uncertified listings cannot reference certificates, source holdings, inventory modes, or QR packages."
      );
    }

    if (normalizedSellerType !== "farmer") {
      throw new Error(
        "Validation Error: Uncertified listings must identify the farmer who owns the source farm."
      );
    }
  }

  return await firebaseAdminDb.runTransaction(async (tx) => {
    // All reads are performed before any transaction writes.
    const [existingListingSnap, lotSnap] = await Promise.all([
      tx.get(listingRef),
      tx.get(lotRef),
    ]);

    if (existingListingSnap.exists) {
      throw new Error(
        `Listing Error: Listing ID "${listingId}" already exists.`
      );
    }

    if (!lotSnap.exists) {
      throw new Error(`Upstream Lookup Error: Cocoa lot "${lotId}" does not exist.`);
    }

    const lotData = lotSnap.data() as Record<string, unknown>;
    const lot = lotData as unknown as CocoaLot;

    if (lot.lotId !== lotId) {
      throw new Error("Relational Mismatch: Lot document ID does not match lotId.");
    }

    if (
      typeof lot.quantityKg !== "number" ||
      !Number.isFinite(lot.quantityKg) ||
      lot.quantityKg < 0
    ) {
      throw new Error("Capacity Error: The cocoa lot has an invalid quantity.");
    }

    if (
      typeof lot.certifiedQuantityKg !== "undefined" &&
      (
        typeof lot.certifiedQuantityKg !== "number" ||
        !Number.isFinite(lot.certifiedQuantityKg) ||
        lot.certifiedQuantityKg < 0 ||
        lot.certifiedQuantityKg > lot.quantityKg
      )
    ) {
      throw new Error("Capacity Error: The lot's certified quantity is invalid.");
    }

    if (
      typeof lot.farmId !== "string" ||
      !lot.farmId.trim()
    ) {
      throw new Error(
        "Relational Mismatch: The cocoa lot must reference its registered origin farm."
      );
    }

    const farmRef = firebaseAdminDb.collection("farms").doc(lot.farmId);
    const farmSnap = await tx.get(farmRef);

    if (!farmSnap.exists) {
      throw new Error(
        `Relational Mismatch: Origin farm "${lot.farmId}" does not exist.`
      );
    }

    const farmData = farmSnap.data() as Record<string, unknown>;

    const imageCandidate = input.cocoaImage || lot.cocoaImage;

    if (
      !imageCandidate ||
      typeof imageCandidate.publicId !== "string" ||
      !imageCandidate.publicId.trim()
    ) {
      throw new Error(
        "Validation Error: A valid Cloudinary cocoa image reference is required."
      );
    }

    cocoaImage = imageCandidate;
    qualityGrade = input.qualityGrade || lot.qualityGrade;

    const baseListing = {
      listingId,
      listingNumber: generateListingNumber(),
      sellerHolderId,
      sellerHolderType: sellerHolderType as CertificateHolderType,
      createdByUid: actorUid,
      certificationType,
      lotId: lot.lotId,
      title,
      description: input.description?.trim() || undefined,
      pricePerKg: input.pricePerKg,
      currency:
        requestedCurrency ||
        (typeof lot.currency === "string" ? lot.currency.toUpperCase() : "XAF"),
      qualityGrade,
      cocoaImage,
      listingStatus: "available" as const,
      createdAt: now,
      updatedAt: now,
    };

    if (certificationType === "certified") {
      const holdingRef = firebaseAdminDb
        .collection("certificateHoldings")
        .doc(sourceHoldingId);

      const certificateRef = firebaseAdminDb
        .collection("certificates")
        .doc(certificateId);

      const holdingListingsQuery = marketplaceCollection
        .where("sourceHoldingId", "==", sourceHoldingId);

      const holdingQrQuery = firebaseAdminDb
        .collection("qrCodes")
        .where("currentHoldingId", "==", sourceHoldingId);

      const [
        holdingSnap,
        certificateSnap,
        activeListingsSnap,
        qrSnap,
      ] = await Promise.all([
        tx.get(holdingRef),
        tx.get(certificateRef),
        tx.get(holdingListingsQuery),
        tx.get(holdingQrQuery),
      ]);

      if (!holdingSnap.exists) {
        throw new Error(
          `Upstream Lookup Error: Certificate holding "${sourceHoldingId}" does not exist.`
        );
      }

      if (!certificateSnap.exists) {
        throw new Error(
          `Upstream Lookup Error: Certificate "${certificateId}" does not exist.`
        );
      }

      const holding = holdingSnap.data() as Record<string, unknown>;
      const certificate = certificateSnap.data() as Record<string, unknown>;

      if (
        holding.holdingId !== sourceHoldingId ||
        holding.holderId !== sellerHolderId ||
        holding.holderType !== sellerHolderType ||
        holding.lotId !== lotId ||
        holding.certificateId !== certificateId
      ) {
        throw new Error(
          "Relational Mismatch: Source holding, seller, lot, and certificate must match."
        );
      }

      if (
        certificate.certificateId !== certificateId ||
        (certificate.lotId !== undefined && certificate.lotId !== lotId)
      ) {
        throw new Error(
          "Relational Mismatch: Certificate does not match the selected cocoa lot."
        );
      }

      if (
        holding.status !== "active" ||
        typeof holding.availableQuantityKg !== "number" ||
        !Number.isFinite(holding.availableQuantityKg) ||
        holding.availableQuantityKg <= 0
      ) {
        throw new Error(
          "Capacity Error: The source holding must be active and have a valid balance."
        );
      }

      if (!isAdmin) {
        if (
          normalizedSellerType !== "farmer" ||
          sellerHolderId !== actorUid
        ) {
          throw new Error(
            "Authorization Error: You are not authorized to list inventory for this holder."
          );
        }
      }

      const activeListings = activeListingsSnap.docs
        .map((snapshot) => snapshot.data() as MarketplaceListing)
        .filter(
          (listing) =>
            listing.listingStatus === "available" ||
            listing.listingStatus === "under_negotiation"
        );

      const existingQrs = qrSnap.docs.map((snapshot) => ({
        id: snapshot.id,
        qr: snapshot.data() as QRCode,
      }));

      for (const { qr } of existingQrs) {
        if (
          typeof qr.representedQuantityKg !== "number" ||
          !Number.isFinite(qr.representedQuantityKg) ||
          qr.representedQuantityKg < 0
        ) {
          throw new Error(
            "Capacity Error: An existing QR package has an invalid quantity."
          );
        }
      }

      const allocatedPackageQuantityKg = existingQrs
        .filter(({ qr }) => qr.returnedToBulk !== true)
        .reduce(
          (sum, { qr }) => sum + qr.representedQuantityKg,
          0
        );

      const unpackagedQuantityKg = Math.max(
        0,
        holding.availableQuantityKg - allocatedPackageQuantityKg
      );

      if (inventoryMode === "BULK") {
        const committedBulkKg = activeListings
          .filter((listing) => listing.inventoryMode === "BULK")
          .reduce((sum, listing) => {
            if (
              typeof listing.quantityAvailableKg !== "number" ||
              !Number.isFinite(listing.quantityAvailableKg) ||
              listing.quantityAvailableKg < 0
            ) {
              throw new Error(
                "Capacity Error: An active bulk listing has an invalid quantity."
              );
            }

            return sum + listing.quantityAvailableKg;
          }, 0);

        const availableBulkKg = Math.max(
          0,
          unpackagedQuantityKg - committedBulkKg
        );

        if (input.quantityInitialKg > availableBulkKg + 1e-9) {
          throw new Error(
            `Capacity Error: Requested ${input.quantityInitialKg} kg, but only ${availableBulkKg} kg is available for a new bulk listing.`
          );
        }

        const listing: MarketplaceListing = {
          ...baseListing,
          certificationType: "certified",
          certificateId,
          sourceHoldingId,
          inventoryMode: "BULK",
          quantityInitialKg: input.quantityInitialKg,
          quantityAvailableKg: input.quantityInitialKg,
        };

        // Shared serialization point. QR creation and other certified
        // inventory operations must increment this same revision as well.
        const currentRevision = holding.inventoryRevision;

        if (
          currentRevision !== undefined &&
          (
            typeof currentRevision !== "number" ||
            !Number.isSafeInteger(currentRevision) ||
            currentRevision < 0
          )
        ) {
          throw new Error("Capacity Error: The holding inventory revision is invalid.");
        }

        tx.update(holdingRef, {
          inventoryRevision: (currentRevision as number | undefined ?? 0) + 1,
        });

        tx.create(listingRef, listing);

        return listing;
      }

      // QR_PACKAGES: reserve exact active QR records without changing their
      // identities or represented quantities.
      const activeQrIdsInListings = new Set<string>();

      for (const listing of activeListings) {
        if (listing.inventoryMode !== "QR_PACKAGES") continue;

        for (const id of listing.currentQrPackageIds || []) {
          activeQrIdsInListings.add(id);
        }
      }

      const matchedQrs: QRCode[] = [];

      for (const qrId of requestedQrIds) {
        const entry = existingQrs.find(
          ({ id, qr }) => id === qrId || qr.qrId === qrId
        );

        if (!entry) {
          throw new Error(
            `Package Lookup Error: QR package "${qrId}" does not belong to the source holding.`
          );
        }

        const qr = entry.qr;

        if (
          qr.status !== "active" ||
          qr.currentHoldingId !== sourceHoldingId ||
          qr.lotId !== lotId ||
          qr.certificateId !== certificateId ||
          qr.returnedToBulk === true
        ) {
          throw new Error(
            `Package Error: QR package "${qrId}" is not eligible for this listing.`
          );
        }

        if (
          activeQrIdsInListings.has(qrId) ||
          activeQrIdsInListings.has(qr.qrId) ||
          activeQrIdsInListings.has(entry.id)
        ) {
          throw new Error(
            `Reservation Error: QR package "${qrId}" is already reserved by an active listing.`
          );
        }

        matchedQrs.push(qr);
      }

      const totalPackageWeightKg = matchedQrs.reduce(
        (sum, qr) => sum + qr.representedQuantityKg,
        0
      );

      if (Math.abs(totalPackageWeightKg - input.quantityInitialKg) > 1e-6) {
        throw new Error(
          `Quantity Mismatch Error: Selected packages total ${totalPackageWeightKg} kg, but ${input.quantityInitialKg} kg was requested.`
        );
      }

      finalQuantityKg = totalPackageWeightKg;
      currentQrPackageIds = requestedQrIds;

      const listing: MarketplaceListing = {
        ...baseListing,
        certificationType: "certified",
        certificateId,
        sourceHoldingId,
        inventoryMode: "QR_PACKAGES",
        initialQrPackageIds: requestedQrIds,
        currentQrPackageIds,
        quantityInitialKg: finalQuantityKg,
        quantityAvailableKg: finalQuantityKg,
      };

      const currentRevision = holding.inventoryRevision;

      if (
        currentRevision !== undefined &&
        (
          typeof currentRevision !== "number" ||
          !Number.isSafeInteger(currentRevision) ||
          currentRevision < 0
        )
      ) {
        throw new Error("Capacity Error: The holding inventory revision is invalid.");
      }

      tx.update(holdingRef, {
        inventoryRevision: (currentRevision as number | undefined ?? 0) + 1,
      });

      tx.create(listingRef, listing);

      return listing;
    }

    // Uncertified inventory: it must belong to the registered source farm.
    if (farmData.farmerId !== sellerHolderId) {
      throw new Error(
        "Ownership Error: The seller does not match the registered farm owner."
      );
    }

    if (!isAdmin && actorUid !== sellerHolderId) {
      throw new Error(
        "Authorization Error: You are not authorized to list this farm's inventory."
      );
    }

    const tradesQuery = firebaseAdminDb
      .collection("trades")
      .where("lotId", "==", lotId)
      .where("certificationType", "==", "uncertified");

    const adjustmentsQuery = firebaseAdminDb
      .collection("cocoaLotAdjustments")
      .where("lotId", "==", lotId);

    const activeUncertifiedListingsQuery = marketplaceCollection
      .where("lotId", "==", lotId)
      .where("certificationType", "==", "uncertified");

    const [
      tradesSnap,
      adjustmentsSnap,
      activeUncertifiedListingsSnap,
    ] = await Promise.all([
      tx.get(tradesQuery),
      tx.get(adjustmentsQuery),
      tx.get(activeUncertifiedListingsQuery),
    ]);

    let completedSalesKg = 0;

    for (const snapshot of tradesSnap.docs) {
      const trade = snapshot.data();

      if (trade.tradeStatus !== "completed") continue;

      if (
        typeof trade.quantityKg !== "number" ||
        !Number.isFinite(trade.quantityKg) ||
        trade.quantityKg < 0
      ) {
        throw new Error("Capacity Error: An existing trade has an invalid quantity.");
      }

      completedSalesKg += trade.quantityKg;
    }

    let physicalDeductionsKg = 0;

    for (const snapshot of adjustmentsSnap.docs) {
      const adjustment = snapshot.data();

      if (adjustment.isPhysicalDeduction !== true) continue;

      if (
        typeof adjustment.deductedQuantityKg !== "number" ||
        !Number.isFinite(adjustment.deductedQuantityKg) ||
        adjustment.deductedQuantityKg <= 0
      ) {
        throw new Error(
          "Capacity Error: An existing physical deduction has an invalid quantity."
        );
      }

      physicalDeductionsKg += adjustment.deductedQuantityKg;
    }

    const eligibleUncertifiedKg =
      lot.quantityKg -
      (lot.certifiedQuantityKg || 0) -
      completedSalesKg -
      physicalDeductionsKg;

    if (eligibleUncertifiedKg < -1e-9) {
      throw new Error(
        "Capacity Error: Existing sales and deductions exceed eligible lot inventory."
      );
    }

    let activeCommittedKg = 0;

    for (const snapshot of activeUncertifiedListingsSnap.docs) {
      const listing = snapshot.data() as MarketplaceListing;

      if (
        listing.listingStatus !== "available" &&
        listing.listingStatus !== "under_negotiation"
      ) {
        continue;
      }

      if (
        typeof listing.quantityAvailableKg !== "number" ||
        !Number.isFinite(listing.quantityAvailableKg) ||
        listing.quantityAvailableKg < 0
      ) {
        throw new Error(
          "Capacity Error: An existing uncertified listing has an invalid quantity."
        );
      }

      activeCommittedKg += listing.quantityAvailableKg;
    }

    const availableUncertifiedKg = Math.max(
      0,
      eligibleUncertifiedKg - activeCommittedKg
    );

    if (input.quantityInitialKg > availableUncertifiedKg + 1e-9) {
      throw new Error(
        `Capacity Error: Requested ${input.quantityInitialKg} kg, but only ${availableUncertifiedKg} kg is available for a new uncertified listing.`
      );
    }

    const listing: MarketplaceListing = {
      ...baseListing,
      certificationType: "uncertified",
      quantityInitialKg: input.quantityInitialKg,
      quantityAvailableKg: input.quantityInitialKg,
    };

    const currentRevision = lotData.inventoryRevision;

    if (
      currentRevision !== undefined &&
      (
        typeof currentRevision !== "number" ||
        !Number.isSafeInteger(currentRevision) ||
        currentRevision < 0
      )
    ) {
      throw new Error("Capacity Error: The lot inventory revision is invalid.");
    }

    // Serialize uncertified listings and adjustments that use the same lot.
    tx.update(lotRef, {
      inventoryRevision: (currentRevision as number | undefined ?? 0) + 1,
    });

    tx.create(listingRef, listing);

    return listing;
  });
}

/**
 * Retrieves a MarketplaceListing by its listingId.
 */
export async function getMarketplaceListing(
  listingId: string
): Promise<MarketplaceListing | null> {
  if (!listingId || !listingId.trim()) return null;
  const cleanId = listingId.trim();

  if (typeof window === "undefined") {
    try {
      const docSnap = await firebaseAdminDb.collection(COLLECTIONS.MARKETPLACE_LISTINGS).doc(cleanId).get();
      if (!docSnap.exists) return null;
      return {
        ...(docSnap.data() as MarketplaceListing),
        listingId: docSnap.id,
      };
    } catch {
      // fallback to client db
    }
  }

  const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, cleanId);
  try {
    const snap = await getDoc(listingRef);
    if (!snap.exists()) return null;
    return snap.data() as MarketplaceListing;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.MARKETPLACE_LISTINGS}/${cleanId}`);
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
  let listings: MarketplaceListing[] = [];

  if (typeof window === "undefined") {
    try {
      const snap = await firebaseAdminDb.collection(COLLECTIONS.MARKETPLACE_LISTINGS).get();
      listings = snap.docs.map((d) => ({
        ...(d.data() as MarketplaceListing),
        listingId: d.id,
      }));
    } catch (adminErr) {
      console.warn("Admin SDK listing fetch fallback to client DB:", adminErr);
      try {
        const colRef = collection(db, COLLECTIONS.MARKETPLACE_LISTINGS);
        const snap = await getDocs(colRef);
        listings = snap.docs.map((d) => d.data() as MarketplaceListing);
      } catch (clientErr) {
        console.warn("Client DB listing fetch failed, returning empty listings list:", clientErr);
        listings = [];
      }
    }
  } else {
    try {
      const colRef = collection(db, COLLECTIONS.MARKETPLACE_LISTINGS);
      const snap = await getDocs(colRef);
      listings = snap.docs.map((d) => d.data() as MarketplaceListing);
    } catch (clientErr) {
      console.warn("Client DB listing fetch failed:", clientErr);
      listings = [];
    }
  }

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
  const actorUid =
    typeof input.actorUid === "string" ? input.actorUid.trim() : "";

  if (!actorUid) {
    throw new Error("Authentication Required: A verified actor UID is required.");
  }

  if (
    typeof input.listingId !== "string" ||
    !input.listingId.trim() ||
    input.listingId.length > 256
  ) {
    throw new Error("Validation Error: A valid listingId is required.");
  }

  // Inventory changes need a dedicated inventory-safe workflow.
  if (input.quantityAvailableKg !== undefined) {
    throw new Error(
      "Validation Error: Manual quantity edits are disabled. Use the inventory-safe listing workflow."
    );
  }

  if (
    input.title !== undefined &&
    (typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.trim().length > 150)
  ) {
    throw new Error(
      "Validation Error: Title must contain 1–150 characters."
    );
  }

  if (
    input.description !== undefined &&
    (typeof input.description !== "string" ||
      input.description.length > 3000)
  ) {
    throw new Error(
      "Validation Error: Description must not exceed 3000 characters."
    );
  }

  if (
    input.pricePerKg !== undefined &&
    (typeof input.pricePerKg !== "number" ||
      !Number.isFinite(input.pricePerKg) ||
      input.pricePerKg <= 0)
  ) {
    throw new Error(
      "Validation Error: pricePerKg must be a finite positive number."
    );
  }

  if (
    input.currency !== undefined &&
    (typeof input.currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(input.currency.trim()))
  ) {
    throw new Error(
      "Validation Error: Currency must be a three-letter currency code."
    );
  }

  // Verify that the actor exists and obtain administrator privileges
  // only from a trusted Firebase custom claim.
  const actorRecord = await firebaseAdminAuth.getUser(actorUid);
  const isAdmin = actorRecord.customClaims?.admin === true;

  const listingId = input.listingId.trim();
  const listingRef = firebaseAdminDb
    .collection("marketplaceListings")
    .doc(listingId);

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(listingRef);

    if (!snapshot.exists) {
      throw new Error(
        `Listing Error: Marketplace listing "${listingId}" does not exist.`
      );
    }

    const current = snapshot.data() as MarketplaceListing;

    if (current.listingId !== listingId) {
      throw new Error(
        "Validation Error: Listing document ID does not match its record."
      );
    }

    // Fail closed for organizational holders until trusted server-side
    // organization membership verification is available.
    const ownsFarmerListing =
      current.sellerHolderType?.toLowerCase() === "farmer" &&
      current.sellerHolderId === actorUid;

    if (!isAdmin && !ownsFarmerListing) {
      throw new Error(
        "Authorization Error: You are not authorized to edit this listing."
      );
    }

    if (
      current.listingStatus !== "available" &&
      current.listingStatus !== "under_negotiation"
    ) {
      throw new Error(
        `State Error: Cannot update a listing in "${current.listingStatus}" status.`
      );
    }

    const now = new Date().toISOString();

    const updates: Partial<MarketplaceListing> = {
      updatedAt: now,
    };

    if (input.title !== undefined) {
      updates.title = input.title.trim();
    }

    if (input.description !== undefined) {
      updates.description = input.description.trim() || undefined;
    }

    if (input.pricePerKg !== undefined) {
      updates.pricePerKg = input.pricePerKg;
    }

    if (input.currency !== undefined) {
      updates.currency = input.currency.trim().toUpperCase();
    }

    // Update only editable metadata. Inventory references, seller identity,
    // certification data, QR package IDs, quantities, and listing status
    // remain unchanged.
    tx.update(listingRef, updates);

    return {
      ...current,
      ...updates,
    };
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
  const verifiedActor =
    typeof actorUid === "string" ? actorUid.trim() : "";

  if (!verifiedActor) {
    throw new Error(
      "Authentication Required: A verified actor UID is required."
    );
  }

  if (
    typeof listingId !== "string" ||
    !listingId.trim() ||
    listingId.length > 256
  ) {
    throw new Error("Validation Error: A valid listingId is required.");
  }

  if (
    reason !== undefined &&
    (typeof reason !== "string" || reason.length > 500)
  ) {
    throw new Error(
      "Validation Error: Cancellation reason must not exceed 500 characters."
    );
  }

  const normalizedListingId = listingId.trim();

  // Check administrator privileges using trusted Firebase custom claims.
  const authRecord = await firebaseAdminAuth.getUser(verifiedActor);
  const isAdmin = authRecord.customClaims?.admin === true;

  const listingRef = firebaseAdminDb
    .collection("marketplaceListings")
    .doc(normalizedListingId);

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(listingRef);

    if (!snapshot.exists) {
      throw new Error(
        `Listing Error: Marketplace listing "${normalizedListingId}" does not exist.`
      );
    }

    const current = snapshot.data() as MarketplaceListing;

    if (current.listingId !== normalizedListingId) {
      throw new Error(
        "Validation Error: Listing document ID does not match its record."
      );
    }

    // Until trusted server-side organization membership verification exists,
    // non-admin access is restricted to the user's own farmer listings.
    const ownsFarmerListing =
      current.sellerHolderType?.toLowerCase() === "farmer" &&
      current.sellerHolderId === verifiedActor;

    if (!isAdmin && !ownsFarmerListing) {
      throw new Error(
        "Authorization Error: You are not authorized to cancel this listing."
      );
    }

    // Idempotency: a repeated cancellation does not create another audit entry.
    if (current.listingStatus === "cancelled") {
      return current;
    }

    if (current.listingStatus === "sold") {
      throw new Error(
        `State Error: Cannot cancel sold listing "${normalizedListingId}".`
      );
    }

    const now = new Date().toISOString();

    const updated: MarketplaceListing = {
      ...current,
      listingStatus: "cancelled",
      updatedAt: now,
    };

    const adjustmentRef = firebaseAdminDb
      .collection("cocoaLotAdjustments")
      .doc();

    const adjustment: CocoaLotAdjustment = {
      adjustmentId: adjustmentRef.id,
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

    // Atomic cancellation and audit: either both writes succeed or neither does.
    tx.update(listingRef, {
      listingStatus: "cancelled",
      updatedAt: now,
    });

    tx.create(adjustmentRef, adjustment);

    return updated;
  });
}

/**
 * Records a manual availability adjustment or physical deduction (LOCAL_SALE, INVENTORY_DAMAGE, etc.)
 */

export async function adjustMarketplaceAvailability(
  input: AdjustAvailabilityInput
): Promise<CocoaLotAdjustment> {
  const actorUid =
    typeof input.actorUid === "string" ? input.actorUid.trim() : "";

  if (!actorUid) {
    throw new Error(
      "Authentication Required: A verified actor UID is required."
    );
  }

  const lotId =
    typeof input.lotId === "string" ? input.lotId.trim() : "";
  const sellerHolderId =
    typeof input.sellerHolderId === "string"
      ? input.sellerHolderId.trim()
      : "";
  const listingId =
    typeof input.listingId === "string"
      ? input.listingId.trim()
      : "";

  if (!lotId || lotId.length > 256) {
    throw new Error("Validation Error: A valid lotId is required.");
  }

  if (!sellerHolderId || sellerHolderId.length > 256) {
    throw new Error("Validation Error: A valid sellerHolderId is required.");
  }

  if (
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.trim().length > 500
  ) {
    throw new Error(
      "Validation Error: Reason must contain 1–500 characters."
    );
  }

  if (
    input.notes !== undefined &&
    (typeof input.notes !== "string" || input.notes.length > 1000)
  ) {
    throw new Error(
      "Validation Error: Notes must not exceed 1000 characters."
    );
  }

  const physicalTypes = new Set([
    "LOCAL_SALE",
    "INVENTORY_DAMAGE",
    "OTHER_PHYSICAL_DEDUCTION",
  ]);

  const nonConsumingTypes = new Set([
    "NEGOTIATION_CANCELLED",
    "MANUAL_STATUS_CHANGE",
    "PRICE_UPDATE",
  ]);

  const adjustmentType = input.adjustmentType;

  if (
    !physicalTypes.has(adjustmentType) &&
    !nonConsumingTypes.has(adjustmentType)
  ) {
    throw new Error(
      "Validation Error: Unsupported adjustment type."
    );
  }

  const isPhysical = physicalTypes.has(adjustmentType);

  if (
    input.isPhysicalDeduction !== undefined &&
    input.isPhysicalDeduction !== isPhysical
  ) {
    throw new Error(
      "Validation Error: The physical-deduction flag does not match the adjustment type."
    );
  }

  const deductedQty = isPhysical
    ? input.deductedQuantityKg
    : 0;

  if (
    isPhysical &&
    (
      typeof deductedQty !== "number" ||
      !Number.isFinite(deductedQty) ||
      deductedQty <= 0
    )
  ) {
    throw new Error(
      "Validation Error: Physical deductions require a finite positive deductedQuantityKg."
    );
  }

  if (
    !isPhysical &&
    input.deductedQuantityKg !== undefined &&
    (
      typeof input.deductedQuantityKg !== "number" ||
      !Number.isFinite(input.deductedQuantityKg) ||
      input.deductedQuantityKg !== 0
    )
  ) {
    throw new Error(
      "Validation Error: Non-consuming adjustments must deduct zero kilograms."
    );
  }

  const allowedStatuses = new Set([
    "available",
    "under_negotiation",
    "cancelled",
    "expired",
  ]);

  if (
    input.newStatus !== undefined &&
    !allowedStatuses.has(input.newStatus)
  ) {
    throw new Error(
      "Validation Error: Unsupported status transition. A listing cannot be marked sold by a manual adjustment."
    );
  }

  if (
    input.newQuantityKg !== undefined &&
    (
      typeof input.newQuantityKg !== "number" ||
      !Number.isFinite(input.newQuantityKg) ||
      input.newQuantityKg < 0
    )
  ) {
    throw new Error(
      "Validation Error: newQuantityKg must be a finite non-negative number."
    );
  }

  if (
    (input.newStatus !== undefined ||
      input.newQuantityKg !== undefined) &&
    !listingId
  ) {
    throw new Error(
      "Validation Error: Listing status or quantity changes require listingId."
    );
  }

  if (
    adjustmentType === "NEGOTIATION_CANCELLED" &&
    (
      !listingId ||
      (input.newStatus !== undefined &&
        input.newStatus !== "available") ||
      input.newQuantityKg !== undefined
    )
  ) {
    throw new Error(
      "Validation Error: NEGOTIATION_CANCELLED must restore an existing negotiation to available status."
    );
  }

  if (
    adjustmentType === "MANUAL_STATUS_CHANGE" &&
    (
      !listingId ||
      (
        input.newStatus === undefined &&
        input.newQuantityKg === undefined
      )
    )
  ) {
    throw new Error(
      "Validation Error: MANUAL_STATUS_CHANGE requires a listing and a requested status or quantity change."
    );
  }

  if (
    adjustmentType === "PRICE_UPDATE" &&
    (
      input.newStatus !== undefined ||
      input.newQuantityKg !== undefined
    )
  ) {
    throw new Error(
      "Validation Error: PRICE_UPDATE cannot modify status or inventory quantity through this operation."
    );
  }

  if (
    input.adjustmentId !== undefined &&
    (
      typeof input.adjustmentId !== "string" ||
      !input.adjustmentId.trim() ||
      input.adjustmentId.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(input.adjustmentId.trim())
    )
  ) {
    throw new Error("Validation Error: Invalid adjustmentId.");
  }

  const authRecord = await firebaseAdminAuth.getUser(actorUid);
  const isAdmin = authRecord.customClaims?.admin === true;

  const lotRef = firebaseAdminDb
    .collection(COLLECTIONS.COCOA_LOTS)
    .doc(lotId);

  const listingRef = listingId
    ? firebaseAdminDb
        .collection(COLLECTIONS.MARKETPLACE_LISTINGS)
        .doc(listingId)
    : null;

  const adjustmentCollection = firebaseAdminDb
    .collection(COLLECTIONS.COCOA_LOT_ADJUSTMENTS);

  // create(), not set(), ensures a caller-supplied audit ID cannot overwrite
  // an existing adjustment record.
  const adjustmentRef = input.adjustmentId
    ? adjustmentCollection.doc(input.adjustmentId.trim())
    : adjustmentCollection.doc();

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const lotSnapshot = await tx.get(lotRef);

    if (!lotSnapshot.exists) {
      throw new Error(
        `Upstream Lookup Error: Cocoa lot "${lotId}" does not exist.`
      );
    }

    const lotData = lotSnapshot.data() as Record<string, unknown>;
    const lot = lotData as unknown as CocoaLot;

    if (
      typeof lot.quantityKg !== "number" ||
      !Number.isFinite(lot.quantityKg) ||
      lot.quantityKg < 0
    ) {
      throw new Error(
        "Capacity Error: The source lot has an invalid quantity."
      );
    }

    const listingSnapshot = listingRef
      ? await tx.get(listingRef)
      : null;

    if (listingRef && !listingSnapshot?.exists) {
      throw new Error(
        `Listing Error: Marketplace listing "${listingId}" does not exist.`
      );
    }

    const currentListing = listingSnapshot?.exists
      ? (listingSnapshot.data() as MarketplaceListing)
      : undefined;

    if (currentListing) {
      if (
        currentListing.listingId !== listingId ||
        currentListing.lotId !== lotId ||
        currentListing.sellerHolderId !== sellerHolderId
      ) {
        throw new Error(
          "Relational Mismatch: The listing, lot, and seller must match the adjustment."
        );
      }

      // This operation is restricted to uncertified inventory.
      // Certified balances and QR package allocations need their own
      // coordinated inventory workflow.
      if (
        currentListing.certificationType !== "uncertified" ||
        currentListing.inventoryMode === "QR_PACKAGES"
      ) {
        throw new Error(
          "Validation Error: This adjustment operation supports uncertified inventory only. Certified and QR-package inventory require their dedicated workflow."
        );
      }

      if (currentListing.listingStatus === "sold") {
        throw new Error(
          "State Error: A sold listing cannot be adjusted through this operation."
        );
      }

      if (
        adjustmentType === "NEGOTIATION_CANCELLED" &&
        currentListing.listingStatus !== "under_negotiation"
      ) {
        throw new Error(
          "State Error: Only a listing under negotiation can be restored by NEGOTIATION_CANCELLED."
        );
      }
    } else if (listingId) {
      throw new Error("Listing Error: The target listing could not be verified.");
    }

    // Confirm the lot's farm association and verify farmer ownership.
    const farmId =
      typeof lotData.farmId === "string" ? lotData.farmId : "";

    const farmRef = farmId
      ? firebaseAdminDb.collection("farms").doc(farmId)
      : null;

    const farmSnapshot = farmRef
      ? await tx.get(farmRef)
      : null;

    if (!isAdmin) {
      const ownsFarm =
        farmSnapshot?.exists === true &&
        farmSnapshot.get("farmerId") === actorUid;

      const ownsFarmerListing =
        currentListing?.sellerHolderType?.toLowerCase() === "farmer" &&
        currentListing.sellerHolderId === actorUid;

      if (
        !ownsFarm ||
        sellerHolderId !== actorUid ||
        (currentListing && !ownsFarmerListing)
      ) {
        throw new Error(
          "Authorization Error: You are not authorized to adjust this inventory."
        );
      }
    }

    const certifiedQty = lotData.certifiedQuantityKg ?? 0;

    if (
      typeof certifiedQty !== "number" ||
      !Number.isFinite(certifiedQty) ||
      certifiedQty < 0 ||
      certifiedQty > lot.quantityKg
    ) {
      throw new Error(
        "Capacity Error: The lot's certified quantity is invalid."
      );
    }

    // All queries participate in this transaction. The lot document is also
    // updated below so concurrent adjustments through this function contend
    // on the same inventory document.
    const tradesQuery = firebaseAdminDb
      .collection(COLLECTIONS.TRADES)
      .where("lotId", "==", lotId)
      .where("certificationType", "==", "uncertified");

    const adjustmentsQuery = adjustmentCollection
      .where("lotId", "==", lotId);

    const activeListingsQuery = firebaseAdminDb
      .collection(COLLECTIONS.MARKETPLACE_LISTINGS)
      .where("lotId", "==", lotId)
      .where("certificationType", "==", "uncertified");

    const [
      tradesSnapshot,
      adjustmentsSnapshot,
      listingsSnapshot,
    ] = await Promise.all([
      tx.get(tradesQuery),
      tx.get(adjustmentsQuery),
      tx.get(activeListingsQuery),
    ]);

    let completedSalesKg = 0;

    for (const tradeDoc of tradesSnapshot.docs) {
      const trade = tradeDoc.data();

      if (trade.tradeStatus !== "completed") continue;

      if (
        typeof trade.quantityKg !== "number" ||
        !Number.isFinite(trade.quantityKg) ||
        trade.quantityKg < 0
      ) {
        throw new Error(
          "Capacity Error: A completed trade has an invalid quantity."
        );
      }

      completedSalesKg += trade.quantityKg;
    }

    let priorPhysicalDeductionsKg = 0;

    for (const adjustmentDoc of adjustmentsSnapshot.docs) {
      const previous = adjustmentDoc.data();

      if (previous.isPhysicalDeduction !== true) continue;

      if (
        typeof previous.deductedQuantityKg !== "number" ||
        !Number.isFinite(previous.deductedQuantityKg) ||
        previous.deductedQuantityKg <= 0
      ) {
        throw new Error(
          "Capacity Error: An existing physical adjustment has an invalid quantity."
        );
      }

      priorPhysicalDeductionsKg += previous.deductedQuantityKg;
    }

    const eligibleBeforeDeduction =
      lot.quantityKg -
      certifiedQty -
      completedSalesKg -
      priorPhysicalDeductionsKg;

    if (eligibleBeforeDeduction < -1e-9) {
      throw new Error(
        "Capacity Error: Existing sales and deductions exceed the lot's eligible inventory."
      );
    }

    const eligibleAfterDeduction =
      eligibleBeforeDeduction - (deductedQty ?? 0);

    if (eligibleAfterDeduction < -1e-9) {
      throw new Error(
        `Capacity Error: The requested deduction exceeds the ${Math.max(0, eligibleBeforeDeduction)} kg of eligible inventory remaining.`
      );
    }

    let nextStatus = currentListing?.listingStatus;
    let nextQuantity = currentListing?.quantityAvailableKg;

    if (currentListing && adjustmentType === "NEGOTIATION_CANCELLED") {
      nextStatus = "available";
    } else if (input.newStatus !== undefined) {
      nextStatus = input.newStatus;
    }

    if (input.newQuantityKg !== undefined) {
      nextQuantity = input.newQuantityKg;

      // Zero offered quantity means the offer is no longer available.
      // It does not mean a completed sale occurred.
      if (input.newQuantityKg === 0) {
        if (
          input.newStatus !== undefined &&
          input.newStatus !== "cancelled"
        ) {
          throw new Error(
            "Validation Error: A zero-quantity listing must be cancelled, not marked available or sold."
          );
        }

        nextStatus = "cancelled";
      }
    }

    let committedKg = 0;

    for (const listingDoc of listingsSnapshot.docs) {
      const listing = listingDoc.data() as MarketplaceListing;
      const isTarget = listingDoc.id === listingId && !!currentListing;

      const projectedStatus = isTarget
        ? nextStatus
        : listing.listingStatus;

      const projectedQuantity = isTarget
        ? nextQuantity
        : listing.quantityAvailableKg;

      if (
        projectedStatus !== "available" &&
        projectedStatus !== "under_negotiation"
      ) {
        continue;
      }

      if (
        typeof projectedQuantity !== "number" ||
        !Number.isFinite(projectedQuantity) ||
        projectedQuantity < 0
      ) {
        throw new Error(
          "Capacity Error: An active listing has an invalid available quantity."
        );
      }

      committedKg += projectedQuantity;
    }

    if (committedKg > Math.max(0, eligibleAfterDeduction) + 1e-9) {
      throw new Error(
        `Commitment Error: Active uncertified listings commit ${committedKg} kg, exceeding the ${Math.max(0, eligibleAfterDeduction)} kg available after this adjustment.`
      );
    }

    const now = new Date().toISOString();

    const adjustment: CocoaLotAdjustment = {
      adjustmentId: adjustmentRef.id,
      lotId,
      ...(currentListing ? { listingId: currentListing.listingId } : {}),
      sellerHolderId,
      recordedByUid: actorUid,
      adjustmentType,
      isPhysicalDeduction: isPhysical,
      deductedQuantityKg: deductedQty ?? 0,
      ...(currentListing
        ? {
            previousStatus: currentListing.listingStatus,
            previousQuantityKg: currentListing.quantityAvailableKg,
            newStatus: nextStatus,
            newQuantityKg: nextQuantity,
          }
        : {}),
      quantityDeltaKg: isPhysical
        ? -(deductedQty ?? 0)
        : currentListing &&
            nextQuantity !== undefined &&
            nextQuantity !== currentListing.quantityAvailableKg
          ? nextQuantity - currentListing.quantityAvailableKg
          : 0,
      reason: input.reason.trim(),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      recordedAt: now,
    };

    // Inventory revision serializes adjustments made through this function.
    // Other inventory-changing workflows must also coordinate on this
    // document before global race-safety can be claimed.
    const currentRevision = lotData.inventoryRevision;
    const revision =
      typeof currentRevision === "number" &&
      Number.isSafeInteger(currentRevision) &&
      currentRevision >= 0
        ? currentRevision
        : 0;

    tx.update(lotRef, {
      inventoryRevision: revision + 1,
    });

    if (
      currentListing &&
      listingRef &&
      (
        nextStatus !== currentListing.listingStatus ||
        nextQuantity !== currentListing.quantityAvailableKg
      )
    ) {
      tx.update(listingRef, {
        ...(nextStatus !== undefined
          ? { listingStatus: nextStatus }
          : {}),
        ...(nextQuantity !== undefined
          ? { quantityAvailableKg: nextQuantity }
          : {}),
        updatedAt: now,
      });
    }

    tx.create(adjustmentRef, adjustment);

    return adjustment;
  });
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
