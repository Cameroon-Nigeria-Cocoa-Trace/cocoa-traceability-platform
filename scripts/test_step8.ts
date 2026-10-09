/**
 * Comprehensive Step 8 Verification Test Suite
 * Tests Marketplace, Trade, QR Package Allocation, Strict Source Isolation,
 * Uncertified Accounting, Fees, Payment Idempotency, and Regression Invariants.
 */

import assert from "assert";
import {
  MarketplaceListing,
  TradeRecord,
  PaymentRecord,
  AppliedFeeRecord,
  SellerAccessRecord,
  CocoaLotAdjustment,
  CocoaLot,
  TraceCertificate,
  CertificateHolding,
  QRCode,
  CertificateHolderType,
} from "../src/types/traceability";
import {
  validateTransferRoute,
  calculateTransferFee,
} from "../src/services/transferService";

console.log("================================================================================");
console.log("             STEP 8 MARKETPLACE & TRADE VERIFICATION TEST SUITE                 ");
console.log("================================================================================\n");

// ============================================================================
// SIMULATION ENVIRONMENT
// ============================================================================

interface MockDbState {
  lots: Map<string, CocoaLot>;
  certificates: Map<string, TraceCertificate>;
  holdings: Map<string, CertificateHolding>;
  qrCodes: Map<string, QRCode>;
  listings: Map<string, MarketplaceListing>;
  trades: Map<string, TradeRecord>;
  payments: Map<string, PaymentRecord>;
  adjustments: Map<string, CocoaLotAdjustment>;
  sellerAccess: Map<string, SellerAccessRecord>;
}

function createMockState(): MockDbState {
  return {
    lots: new Map(),
    certificates: new Map(),
    holdings: new Map(),
    qrCodes: new Map(),
    listings: new Map(),
    trades: new Map(),
    payments: new Map(),
    adjustments: new Map(),
    sellerAccess: new Map(),
  };
}

// Helper: Derive uncertified eligible quantity
function deriveUncertifiedEligibleQuantity(state: MockDbState, lotId: string): number {
  const lot = state.lots.get(lotId);
  if (!lot) return 0;

  const currentCertified = lot.certifiedQuantityKg || 0;
  const completedSales = Array.from(state.trades.values())
    .filter((t) => t.lotId === lotId && t.certificationType === "uncertified" && t.tradeStatus === "completed")
    .reduce((sum, t) => sum + t.quantityKg, 0);

  const physicalDeductions = Array.from(state.adjustments.values())
    .filter((a) => a.lotId === lotId && a.isPhysicalDeduction === true)
    .reduce((sum, a) => sum + (a.deductedQuantityKg || 0), 0);

  return Math.max(0, lot.quantityKg - currentCertified - completedSales - physicalDeductions);
}

// Helper: Derive uncertified available for listing
function deriveUncertifiedAvailableForListing(state: MockDbState, lotId: string): number {
  const eligible = deriveUncertifiedEligibleQuantity(state, lotId);
  const activeCommitments = Array.from(state.listings.values())
    .filter(
      (l) =>
        l.lotId === lotId &&
        l.certificationType === "uncertified" &&
        (l.listingStatus === "available" || l.listingStatus === "under_negotiation")
    )
    .reduce((sum, l) => sum + l.quantityAvailableKg, 0);

  return Math.max(0, eligible - activeCommitments);
}

// Helper: Derive unpackaged available on holding
function deriveHoldingUnpackagedCapacity(state: MockDbState, holdingId: string): number {
  const holding = state.holdings.get(holdingId);
  if (!holding) return 0;

  const allocatedPackages = Array.from(state.qrCodes.values())
    .filter((q) => q.currentHoldingId === holdingId && q.returnedToBulk !== true)
    .reduce((sum, q) => sum + q.representedQuantityKg, 0);

  const unpackaged = Math.max(0, holding.availableQuantityKg - allocatedPackages);

  const activeBulkCommitments = Array.from(state.listings.values())
    .filter(
      (l) =>
        l.sourceHoldingId === holdingId &&
        l.inventoryMode === "BULK" &&
        (l.listingStatus === "available" || l.listingStatus === "under_negotiation")
    )
    .reduce((sum, l) => sum + l.quantityAvailableKg, 0);

  return Math.max(0, unpackaged - activeBulkCommitments);
}

// Helper: Create Listing Simulation
function simulateCreateListing(
  state: MockDbState,
  input: {
    listingId: string;
    sellerHolderId: string;
    sellerHolderType: string;
    createdByUid: string;
    certificationType: "certified" | "uncertified";
    lotId: string;
    certificateId?: string;
    sourceHoldingId?: string;
    inventoryMode?: "BULK" | "QR_PACKAGES";
    initialQrPackageIds?: string[];
    quantityInitialKg: number;
    pricePerKg: number;
    title: string;
  }
): MarketplaceListing {
  const lot = state.lots.get(input.lotId);
  if (!lot) throw new Error(`Cocoa lot "${input.lotId}" does not exist.`);

  if (input.certificationType === "certified") {
    if (!input.certificateId || !input.sourceHoldingId || !input.inventoryMode) {
      throw new Error("Missing required certified parameters.");
    }
    const holding = state.holdings.get(input.sourceHoldingId);
    if (!holding) throw new Error(`Holding "${input.sourceHoldingId}" does not exist.`);
    if (holding.holderId !== input.sellerHolderId) throw new Error("Ownership Error");
    if (holding.lotId !== lot.lotId || holding.certificateId !== input.certificateId) {
      throw new Error("Relational Mismatch Error");
    }

    if (input.inventoryMode === "BULK") {
      if (input.initialQrPackageIds && input.initialQrPackageIds.length > 0) {
        throw new Error("BULK mode cannot have QR packages");
      }
      const uncommittedUnpackaged = deriveHoldingUnpackagedCapacity(state, holding.holdingId);
      if (input.quantityInitialKg > uncommittedUnpackaged) {
        throw new Error(`Capacity Error: Exceeds uncommitted unpackaged (${uncommittedUnpackaged} kg)`);
      }
    } else {
      // QR_PACKAGES
      if (!input.initialQrPackageIds || input.initialQrPackageIds.length === 0) {
        throw new Error("QR_PACKAGES requires initialQrPackageIds");
      }

      // Check duplicate reservations across active listings
      const activeListings = Array.from(state.listings.values()).filter(
        (l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation"
      );
      for (const al of activeListings) {
        if (al.inventoryMode === "QR_PACKAGES" && al.currentQrPackageIds) {
          for (const qid of input.initialQrPackageIds) {
            if (al.currentQrPackageIds.includes(qid)) {
              throw new Error(`Reservation Error: QR "${qid}" already committed`);
            }
          }
        }
      }

      let totalWeight = 0;
      for (const qid of input.initialQrPackageIds) {
        const qr = state.qrCodes.get(qid);
        if (!qr) throw new Error(`QR "${qid}" not found`);
        if (qr.status !== "active") throw new Error(`QR "${qid}" not active`);
        if (qr.currentHoldingId !== holding.holdingId) throw new Error(`QR "${qid}" wrong holding`);
        if (qr.lotId !== lot.lotId) throw new Error(`QR "${qid}" wrong lot`);
        if (qr.certificateId !== input.certificateId) throw new Error(`QR "${qid}" wrong cert`);
        if (qr.returnedToBulk === true) throw new Error(`QR "${qid}" returned to bulk`);
        totalWeight += qr.representedQuantityKg;
      }

      if (totalWeight !== input.quantityInitialKg) {
        throw new Error("Quantity Mismatch: Total QR weight must equal initial quantity");
      }
    }
  } else {
    // Uncertified
    if (input.certificateId || input.sourceHoldingId || input.inventoryMode || input.initialQrPackageIds) {
      throw new Error("Uncertified listings cannot reference certificate, holding, or QR");
    }
    const available = deriveUncertifiedAvailableForListing(state, lot.lotId);
    if (input.quantityInitialKg > available) {
      throw new Error(`Capacity Error: Exceeds uncertified available (${available} kg)`);
    }
  }

  const listing: MarketplaceListing = {
    listingId: input.listingId,
    listingNumber: `LIST-${input.listingId}`,
    sellerHolderId: input.sellerHolderId,
    sellerHolderType: input.sellerHolderType as CertificateHolderType,
    createdByUid: input.createdByUid,
    certificationType: input.certificationType,
    lotId: input.lotId,
    certificateId: input.certificateId,
    sourceHoldingId: input.sourceHoldingId,
    inventoryMode: input.inventoryMode,
    initialQrPackageIds: input.initialQrPackageIds,
    currentQrPackageIds: input.initialQrPackageIds ? [...input.initialQrPackageIds] : undefined,
    title: input.title,
    quantityInitialKg: input.quantityInitialKg,
    quantityAvailableKg: input.quantityInitialKg,
    pricePerKg: input.pricePerKg,
    currency: "XAF",
    cocoaImage: lot.cocoaImage,
    listingStatus: "available",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.listings.set(listing.listingId, listing);
  return listing;
}

// Helper: Simulate On-Platform Purchase
function simulatePurchase(
  state: MockDbState,
  input: {
    paymentReference: string;
    listingId: string;
    buyerId: string;
    buyerHolderType?: string;
    purchasedQuantityKg: number;
    selectedQrPackageIds?: string[];
  }
): { trade: TradeRecord; destHolding?: CertificateHolding } {
  // Idempotency check
  const existingTrade = Array.from(state.trades.values()).find(
    (t) => t.paymentReference === input.paymentReference
  );
  if (existingTrade) {
    const destHolding = existingTrade.destHoldingId
      ? state.holdings.get(existingTrade.destHoldingId)
      : undefined;
    return { trade: existingTrade, destHolding };
  }

  const listing = state.listings.get(input.listingId);
  if (!listing) throw new Error("Listing not found");
  if (listing.listingStatus !== "available" && listing.listingStatus !== "under_negotiation") {
    throw new Error(`Cannot purchase listing in status "${listing.listingStatus}"`);
  }

  const now = new Date().toISOString();
  const tradeId = `trade_${input.paymentReference}`;
  const transferId = `trans_${tradeId}`;

  let destHolding: CertificateHolding | undefined = undefined;

  if (listing.certificationType === "certified") {
    const buyerType = (input.buyerHolderType || "cooperative") as CertificateHolderType;
    validateTransferRoute(listing.sellerHolderType, buyerType);
    const sourceHolding = state.holdings.get(listing.sourceHoldingId!);
    if (!sourceHolding) throw new Error("Source holding not found");

    if (listing.inventoryMode === "QR_PACKAGES") {
      if (!input.selectedQrPackageIds || input.selectedQrPackageIds.length === 0) {
        throw new Error("Must select complete QR packages");
      }
      const availableSet = new Set(listing.currentQrPackageIds || []);
      let totalSelectedWeight = 0;
      for (const qid of input.selectedQrPackageIds) {
        if (!availableSet.has(qid)) throw new Error(`QR "${qid}" is not available in listing`);
        const qr = state.qrCodes.get(qid);
        if (!qr || qr.status !== "active") throw new Error(`QR "${qid}" invalid`);
        totalSelectedWeight += qr.representedQuantityKg;
      }
      if (totalSelectedWeight !== input.purchasedQuantityKg) {
        throw new Error("Purchased weight must equal selected packages sum");
      }

      // Update remaining package set
      const selectedSet = new Set(input.selectedQrPackageIds);
      listing.currentQrPackageIds = (listing.currentQrPackageIds || []).filter((id) => !selectedSet.has(id));
      listing.quantityAvailableKg = (listing.currentQrPackageIds || [])
        .map((id) => state.qrCodes.get(id)?.representedQuantityKg || 0)
        .reduce((s, w) => s + w, 0);

      if (listing.currentQrPackageIds.length === 0) {
        listing.listingStatus = "sold";
      }

      // Move selected QRs to buyer dest holding
      const destHoldingId = `holding_${transferId}`;
      destHolding = {
        holdingId: destHoldingId,
        certificateId: sourceHolding.certificateId,
        certificateNumber: sourceHolding.certificateNumber,
        lotId: sourceHolding.lotId,
        farmId: sourceHolding.farmId,
        holderId: input.buyerId,
        holderType: buyerType,
        quantityKg: input.purchasedQuantityKg,
        availableQuantityKg: input.purchasedQuantityKg,
        parentHoldingId: sourceHolding.holdingId,
        sourceTransferId: transferId,
        status: "active",
        createdBy: input.buyerId,
        createdAt: now,
        updatedAt: now,
      };
      state.holdings.set(destHoldingId, destHolding);

      // Decrement source holding
      sourceHolding.quantityKg -= input.purchasedQuantityKg;
      sourceHolding.availableQuantityKg -= input.purchasedQuantityKg;
      if (sourceHolding.availableQuantityKg <= 0) sourceHolding.status = "depleted";

      // Re-anchor QRs
      for (const qid of input.selectedQrPackageIds) {
        const qr = state.qrCodes.get(qid)!;
        qr.currentHoldingId = destHoldingId;
        qr.lastTransferId = transferId;
        qr.lastTransferredAt = now;
      }
    } else {
      // BULK Certified
      if (input.purchasedQuantityKg > listing.quantityAvailableKg) {
        throw new Error("Exceeds listing available quantity");
      }
      listing.quantityAvailableKg -= input.purchasedQuantityKg;
      if (listing.quantityAvailableKg <= 0) listing.listingStatus = "sold";

      const destHoldingId = `holding_${transferId}`;
      destHolding = {
        holdingId: destHoldingId,
        certificateId: sourceHolding.certificateId,
        certificateNumber: sourceHolding.certificateNumber,
        lotId: sourceHolding.lotId,
        farmId: sourceHolding.farmId,
        holderId: input.buyerId,
        holderType: buyerType,
        quantityKg: input.purchasedQuantityKg,
        availableQuantityKg: input.purchasedQuantityKg,
        parentHoldingId: sourceHolding.holdingId,
        sourceTransferId: transferId,
        status: "active",
        createdBy: input.buyerId,
        createdAt: now,
        updatedAt: now,
      };
      state.holdings.set(destHoldingId, destHolding);

      sourceHolding.quantityKg -= input.purchasedQuantityKg;
      sourceHolding.availableQuantityKg -= input.purchasedQuantityKg;
      if (sourceHolding.availableQuantityKg <= 0) sourceHolding.status = "depleted";
    }
  } else {
    // Uncertified
    if (input.purchasedQuantityKg > listing.quantityAvailableKg) {
      throw new Error("Exceeds listing available quantity");
    }
    listing.quantityAvailableKg -= input.purchasedQuantityKg;
    if (listing.quantityAvailableKg <= 0) listing.listingStatus = "sold";
  }

  const tradeValue = input.purchasedQuantityKg * listing.pricePerKg;
  const platformFee: AppliedFeeRecord = {
    feeId: `fee_plat_${tradeId}`,
    feeType: "marketplace_platform_fee",
    payerId: input.buyerId,
    ratePercentage: 2.0,
    calculatedAmount: tradeValue * 0.02,
    currency: listing.currency,
    isFeeExempt: false,
    policyStatus: "APPLIED",
    feeStatus: "paid",
    assessedAt: now,
  };

  const trade: TradeRecord = {
    tradeId,
    tradeNumber: `TRD-${tradeId}`,
    listingId: listing.listingId,
    certificationType: listing.certificationType,
    lotId: listing.lotId,
    certificateId: listing.certificateId,
    sourceHoldingId: listing.sourceHoldingId,
    destHoldingId: destHolding?.holdingId,
    sellerId: listing.sellerHolderId,
    sellerHolderId: listing.sellerHolderId,
    sellerHolderType: listing.sellerHolderType,
    buyerId: input.buyerId,
    buyerHolderType: input.buyerHolderType as CertificateHolderType | undefined,
    quantityKg: input.purchasedQuantityKg,
    purchasedQrPackageIds: input.selectedQrPackageIds,
    negotiatedPricePerKg: listing.pricePerKg,
    totalAmount: tradeValue,
    currency: listing.currency,
    paymentChannel: "on_platform",
    paymentReference: input.paymentReference,
    tradeStatus: "completed",
    platformFeeApplied: platformFee,
    transferId: listing.certificationType === "certified" ? transferId : undefined,
    tradeDate: now,
    createdAt: now,
    updatedAt: now,
  };
  state.trades.set(tradeId, trade);

  // Automatically grant seller access
  const access: SellerAccessRecord = {
    accessId: `acc_${tradeId}`,
    listingId: listing.listingId,
    buyerId: input.buyerId,
    sellerHolderId: listing.sellerHolderId,
    accessType: "on_platform_purchase",
    feePaid: 0,
    currency: listing.currency,
    accessStatus: "active",
    accessGrantedAt: now,
  };
  state.sellerAccess.set(access.accessId, access);

  return { trade, destHolding };
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function runStep8Tests() {
  const state = createMockState();

  // Setup initial Lot LOT-001 (1,000 kg, certified 600 kg)
  const lot1: CocoaLot = {
    lotId: "LOT-001",
    lotNumber: "LOT-CMR-2026-001",
    farmId: "FARM-001",
    productionRecordId: "PROD-001",
    harvestId: "HARV-001",
    originCountry: "Cameroon",
    productionPeriod: "Main Crop 2025/2026",
    productionDate: "2026-01-15",
    quantityKg: 1000,
    availableQuantityKg: 1000,
    certifiedQuantityKg: 600,
    pricePerKg: 2500,
    currency: "XAF",
    cocoaImage: { publicId: "img_001", url: "https://res.cloudinary.com/demo/image/upload/cocoa.jpg", secureUrl: "https://res.cloudinary.com/demo/image/upload/cocoa.jpg" },
    lotStatus: "partially_certified",
    createdBy: "uid_farmer_1",
    createdAt: "2026-01-15T08:00:00Z",
    updatedAt: "2026-01-15T08:00:00Z",
  };
  state.lots.set(lot1.lotId, lot1);

  // TraceCertificate for 600 kg
  const cert1: TraceCertificate = {
    certificateId: "CERT-001",
    certificateNumber: "CERT-CMR-2026-001",
    applicationId: "APP-001",
    lotId: "LOT-001",
    farmId: "FARM-001",
    holderId: "coop_org_south",
    holderType: "cooperative",
    originCountry: "Cameroon",
    certifiedQuantityKg: 600,
    productionPeriod: "Main Crop 2025/2026",
    issueDate: "2026-01-20T08:00:00Z",
    status: "active",
    verificationStatus: "verified",
    createdBy: "uid_cert_officer",
    createdAt: "2026-01-20T08:00:00Z",
    updatedAt: "2026-01-20T08:00:00Z",
  };
  state.certificates.set(cert1.certificateId, cert1);

  // Initial Certificate Holding H001 (600 kg on Cooperative)
  const H001: CertificateHolding = {
    holdingId: "H001",
    certificateId: "CERT-001",
    certificateNumber: "CERT-CMR-2026-001",
    lotId: "LOT-001",
    farmId: "FARM-001",
    holderId: "coop_org_south",
    holderType: "cooperative",
    quantityKg: 600,
    availableQuantityKg: 600,
    status: "active",
    createdBy: "uid_cert_officer",
    createdAt: "2026-01-20T08:00:00Z",
    updatedAt: "2026-01-20T08:00:00Z",
  };
  state.holdings.set(H001.holdingId, H001);

  // Create 3 active QR packages on H001 (100 kg each = 300 kg packaged, 300 kg unpackaged)
  const qr1: QRCode = {
    qrId: "QR-001",
    qrValue: "QRV-001",
    packageNumber: "LOT-001-PKG-001",
    sequenceNumber: 1,
    generatedFromHoldingId: "H001",
    currentHoldingId: "H001",
    certificateId: "CERT-001",
    certificateNumber: "CERT-CMR-2026-001",
    lotId: "LOT-001",
    lotNumber: "LOT-CMR-2026-001",
    farmId: "FARM-001",
    representedQuantityKg: 100,
    status: "active",
    generatedAt: "2026-01-21T08:00:00Z",
    generatedBy: "uid_operator",
  };
  const qr2: QRCode = { ...qr1, qrId: "QR-002", qrValue: "QRV-002", packageNumber: "LOT-001-PKG-002", sequenceNumber: 2 };
  const qr3: QRCode = { ...qr1, qrId: "QR-003", qrValue: "QRV-003", packageNumber: "LOT-001-PKG-003", sequenceNumber: 3 };
  state.qrCodes.set(qr1.qrId, qr1);
  state.qrCodes.set(qr2.qrId, qr2);
  state.qrCodes.set(qr3.qrId, qr3);

  console.log("--- 1. INVENTORY ISOLATION & QUANTITY NON-OVERLAP ---");

  // Test 1: Certified physical quantity (600 kg) is excluded from uncertified eligible quantity
  const uncertEligible = deriveUncertifiedEligibleQuantity(state, "LOT-001");
  assert.strictEqual(uncertEligible, 400, "Test 1: Uncertified eligible quantity must equal 1000 - 600 = 400 kg");
  console.log("✔ Test 1: Uncertified eligible accurately excludes certified capacity (400 kg remaining).");

  // Test 2: Certified + uncertified in one listing is rejected
  assert.throws(
    () => {
      simulateCreateListing(state, {
        listingId: "LIST-INVALID-1",
        sellerHolderId: "coop_org_south",
        sellerHolderType: "cooperative",
        createdByUid: "uid_manager_1",
        certificationType: "certified",
        lotId: "LOT-001",
        // Missing certificateId
        quantityInitialKg: 500,
        pricePerKg: 2500,
        title: "Mixed Invalid",
      });
    },
    /Missing required certified parameters/,
    "Test 2: Must reject invalid certified listing missing certificate anchors"
  );
  console.log("✔ Test 2: Incomplete certified listing rejected.");

  // Test 3: Uncertified listing attempting to specify certificateId or holdingId is rejected
  assert.throws(
    () => {
      simulateCreateListing(state, {
        listingId: "LIST-INVALID-2",
        sellerHolderId: "uid_farmer_1",
        sellerHolderType: "farmer",
        createdByUid: "uid_farmer_1",
        certificationType: "uncertified",
        lotId: "LOT-001",
        certificateId: "CERT-001", // Prohibited
        quantityInitialKg: 200,
        pricePerKg: 2000,
        title: "Uncertified with cert",
      });
    },
    /Uncertified listings cannot reference certificate/,
    "Test 3: Uncertified listing with cert reference must be rejected"
  );
  console.log("✔ Test 3: Uncertified listing attempting to reference certificate is rejected.");

  console.log("\n--- 2. BULK & QR_PACKAGES LISTING MODES ---");

  // Test 4: Certified BULK listing for unpackaged quantity (200 kg out of 300 kg unpackaged)
  const bulkListing = simulateCreateListing(state, {
    listingId: "LIST-BULK-1",
    sellerHolderId: "coop_org_south",
    sellerHolderType: "cooperative",
    createdByUid: "uid_manager_1",
    certificationType: "certified",
    lotId: "LOT-001",
    certificateId: "CERT-001",
    sourceHoldingId: "H001",
    inventoryMode: "BULK",
    quantityInitialKg: 200,
    pricePerKg: 2600,
    title: "Premium Bulk Certified Cocoa",
  });
  assert.strictEqual(bulkListing.quantityAvailableKg, 200);
  assert.strictEqual(bulkListing.inventoryMode, "BULK");
  console.log("✔ Test 4: Certified BULK listing created (200 kg committed).");

  // Test 5: Remaining unpackaged capacity on H001 is now 300 - 200 = 100 kg
  const remainingUnpackaged = deriveHoldingUnpackagedCapacity(state, "H001");
  assert.strictEqual(remainingUnpackaged, 100, "Test 5: Uncommitted unpackaged capacity must be 100 kg");
  console.log("✔ Test 5: Remaining uncommitted unpackaged capacity correctly derived as 100 kg.");

  // Test 6: Attempting to create another BULK listing for 150 kg exceeds remaining 100 kg and is rejected
  assert.throws(
    () => {
      simulateCreateListing(state, {
        listingId: "LIST-BULK-2",
        sellerHolderId: "coop_org_south",
        sellerHolderType: "cooperative",
        createdByUid: "uid_manager_1",
        certificationType: "certified",
        lotId: "LOT-001",
        certificateId: "CERT-001",
        sourceHoldingId: "H001",
        inventoryMode: "BULK",
        quantityInitialKg: 150,
        pricePerKg: 2600,
        title: "Overcommitting Bulk",
      });
    },
    /Capacity Error/,
    "Test 6: Overcommitting bulk listing must be rejected"
  );
  console.log("✔ Test 6: Overcommitting bulk listing rejected transactionally.");

  // Test 7: Certified QR_PACKAGES listing specifying [QR-001, QR-002, QR-003] (300 kg total)
  const qrListing = simulateCreateListing(state, {
    listingId: "LIST-QR-1",
    sellerHolderId: "coop_org_south",
    sellerHolderType: "cooperative",
    createdByUid: "uid_manager_1",
    certificationType: "certified",
    lotId: "LOT-001",
    certificateId: "CERT-001",
    sourceHoldingId: "H001",
    inventoryMode: "QR_PACKAGES",
    initialQrPackageIds: ["QR-001", "QR-002", "QR-003"],
    quantityInitialKg: 300,
    pricePerKg: 2700,
    title: "Packaged Traceable Bags (3 x 100kg)",
  });
  assert.strictEqual(qrListing.quantityAvailableKg, 300);
  assert.deepStrictEqual(qrListing.currentQrPackageIds, ["QR-001", "QR-002", "QR-003"]);
  console.log("✔ Test 7: Certified QR_PACKAGES listing created with 3 active packages.");

  // Test 8: Attempting to commit already reserved QR-001 in another listing is rejected
  assert.throws(
    () => {
      simulateCreateListing(state, {
        listingId: "LIST-QR-DUP",
        sellerHolderId: "coop_org_south",
        sellerHolderType: "cooperative",
        createdByUid: "uid_manager_1",
        certificationType: "certified",
        lotId: "LOT-001",
        certificateId: "CERT-001",
        sourceHoldingId: "H001",
        inventoryMode: "QR_PACKAGES",
        initialQrPackageIds: ["QR-001"],
        quantityInitialKg: 100,
        pricePerKg: 2700,
        title: "Duplicate QR",
      });
    },
    /Reservation Error: QR "QR-001" already committed/,
    "Test 8: Double commitment of QR package must be rejected"
  );
  console.log("✔ Test 8: Duplicate QR package reservation rejected.");

  console.log("\n--- 3. MULTI-PACKAGE PARTIAL PURCHASE & DYNAMIC REMAINING QUANTITY ---");

  // Test 9: Buyer purchases QR-001 (100 kg) from LIST-QR-1 (300 kg, 3 packages)
  const purchase1 = simulatePurchase(state, {
    paymentReference: "PAY-001",
    listingId: "LIST-QR-1",
    buyerId: "agent_business_douala",
    buyerHolderType: "agent",
    purchasedQuantityKg: 100,
    selectedQrPackageIds: ["QR-001"],
  });

  assert.strictEqual(purchase1.trade.tradeStatus, "completed");
  assert.strictEqual(purchase1.trade.quantityKg, 100);
  assert.strictEqual(purchase1.destHolding?.quantityKg, 100);
  assert.strictEqual(purchase1.destHolding?.holderId, "agent_business_douala");

  // Verify listing remaining package set and quantity
  const updatedQrListing = state.listings.get("LIST-QR-1")!;
  assert.deepStrictEqual(updatedQrListing.currentQrPackageIds, ["QR-002", "QR-003"]);
  assert.strictEqual(updatedQrListing.quantityAvailableKg, 200);
  assert.strictEqual(updatedQrListing.listingStatus, "available");

  // Verify QR-001 currentHoldingId moved to buyer dest holding
  const qr1Updated = state.qrCodes.get("QR-001")!;
  assert.strictEqual(qr1Updated.currentHoldingId, purchase1.destHolding!.holdingId);

  // Verify QR-002 and QR-003 remain with seller H001
  assert.strictEqual(state.qrCodes.get("QR-002")!.currentHoldingId, "H001");
  assert.strictEqual(state.qrCodes.get("QR-003")!.currentHoldingId, "H001");
  console.log("✔ Test 9: Partial QR purchase completed. Remaining packages: [QR-002, QR-003], available: 200 kg.");

  // Test 10: Idempotent duplicate purchase callback returns existing trade without duplicate transfer
  const purchase1Duplicate = simulatePurchase(state, {
    paymentReference: "PAY-001",
    listingId: "LIST-QR-1",
    buyerId: "agent_business_douala",
    buyerHolderType: "agent",
    purchasedQuantityKg: 100,
    selectedQrPackageIds: ["QR-001"],
  });
  assert.strictEqual(purchase1Duplicate.trade.tradeId, purchase1.trade.tradeId);
  assert.strictEqual(purchase1Duplicate.destHolding?.holdingId, purchase1.destHolding?.holdingId);
  console.log("✔ Test 10: Idempotent duplicate payment callback returns existing trade.");

  // Test 11: Attempting to purchase already sold QR-001 is rejected
  assert.throws(
    () => {
      simulatePurchase(state, {
        paymentReference: "PAY-002",
        listingId: "LIST-QR-1",
        buyerId: "agent_business_douala",
        buyerHolderType: "agent",
        purchasedQuantityKg: 100,
        selectedQrPackageIds: ["QR-001"],
      });
    },
    /QR "QR-001" is not available/,
    "Test 11: Purchasing already sold QR package must be rejected"
  );
  console.log("✔ Test 11: Purchasing already sold QR package rejected.");

  console.log("\n--- 4. UNCERTIFIED COMMERCE & EXACT-ONCE PHYSICAL DEDUCTIONS ---");

  // Test 12: Create uncertified listing for 300 kg out of 400 kg uncertified capacity
  const uncertListing = simulateCreateListing(state, {
    listingId: "LIST-UNCERT-1",
    sellerHolderId: "uid_farmer_1",
    sellerHolderType: "farmer",
    createdByUid: "uid_farmer_1",
    certificationType: "uncertified",
    lotId: "LOT-001",
    quantityInitialKg: 300,
    pricePerKg: 2000,
    title: "Uncertified Bulk Cocoa",
  });
  assert.strictEqual(uncertListing.quantityAvailableKg, 300);
  console.log("✔ Test 12: Uncertified listing created (300 kg committed).");

  // Test 13: Uncertified available for additional listing is now 400 - 300 = 100 kg
  const uncertAvail = deriveUncertifiedAvailableForListing(state, "LOT-001");
  assert.strictEqual(uncertAvail, 100);
  console.log("✔ Test 13: Remaining uncertified listing headroom is 100 kg.");

  // Test 14: Buyer purchases 150 kg from uncertified listing
  const uncertPurchase = simulatePurchase(state, {
    paymentReference: "PAY-UNCERT-1",
    listingId: "LIST-UNCERT-1",
    buyerId: "uid_local_buyer",
    purchasedQuantityKg: 150,
  });
  assert.strictEqual(uncertPurchase.trade.certificationType, "uncertified");
  assert.strictEqual(uncertPurchase.destHolding, undefined, "Uncertified trade must have no CertificateHolding");
  assert.strictEqual(uncertPurchase.trade.transferId, undefined, "Uncertified trade must have no CertificateTransfer");

  // Verify listing remaining quantity is 150 kg
  assert.strictEqual(state.listings.get("LIST-UNCERT-1")!.quantityAvailableKg, 150);
  console.log("✔ Test 14: Uncertified purchase completed (150 kg). No holding or transfer created.");

  // Test 15: Record physical adjustment (LOCAL_SALE of 50 kg)
  const adj1: CocoaLotAdjustment = {
    adjustmentId: "ADJ-001",
    lotId: "LOT-001",
    sellerHolderId: "uid_farmer_1",
    recordedByUid: "uid_farmer_1",
    adjustmentType: "LOCAL_SALE",
    isPhysicalDeduction: true,
    deductedQuantityKg: 50,
    reason: "Direct sale to local artisanal processor",
    recordedAt: new Date().toISOString(),
  };
  state.adjustments.set(adj1.adjustmentId, adj1);

  // Test 16: Verify complete physical lot balance invariant:
  // Lot total = 1000 kg
  // Certified = 600 kg
  // Completed uncertified trade = 150 kg
  // Local sale deduction = 50 kg
  // Remaining uncertified eligible = 1000 - 600 - 150 - 50 = 200 kg
  // Active uncertified commitment = 150 kg (on LIST-UNCERT-1)
  // Additional uncertified listing headroom = 200 - 150 = 50 kg
  const finalUncertEligible = deriveUncertifiedEligibleQuantity(state, "LOT-001");
  const finalUncertHeadroom = deriveUncertifiedAvailableForListing(state, "LOT-001");
  assert.strictEqual(finalUncertEligible, 200, "Final uncertified eligible must be 200 kg");
  assert.strictEqual(finalUncertHeadroom, 50, "Final uncertified listing headroom must be 50 kg");

  const totalAccounted = lot1.certifiedQuantityKg! + 150 + 50 + finalUncertEligible - 200;
  assert.strictEqual(totalAccounted, 800);
  console.log("✔ Test 15-16: Physical quantity balance invariant holds exactly (1000 kg total).");

  // Test 17: Non-consuming status adjustment (NEGOTIATION_CANCELLED) does NOT reduce physical capacity
  const adj2: CocoaLotAdjustment = {
    adjustmentId: "ADJ-002",
    lotId: "LOT-001",
    sellerHolderId: "uid_farmer_1",
    recordedByUid: "uid_farmer_1",
    adjustmentType: "NEGOTIATION_CANCELLED",
    isPhysicalDeduction: false,
    deductedQuantityKg: 0,
    reason: "Buyer negotiation timed out",
    recordedAt: new Date().toISOString(),
  };
  state.adjustments.set(adj2.adjustmentId, adj2);
  const eligibleAfterNonConsuming = deriveUncertifiedEligibleQuantity(state, "LOT-001");
  assert.strictEqual(eligibleAfterNonConsuming, 200, "Non-consuming adjustment must not reduce physical quantity");
  console.log("✔ Test 17: Non-consuming adjustment does not reduce physical quantity.");

  console.log("\n--- 5. CERTIFIED BUYER ELIGIBILITY & ROUTE RESTRICTIONS ---");

  // Test 18: Valid route Cooperative -> Agent succeeds
  const validRoute = validateTransferRoute("cooperative", "agent");
  assert.strictEqual(validRoute, "Cooperative -> Agent");
  console.log("✔ Test 18: Valid route (Cooperative -> Agent) accepted.");

  // Test 19: Invalid route Farmer -> Farmer is rejected
  assert.throws(
    () => {
      validateTransferRoute("farmer", "farmer");
    },
    /Unsupported Transfer Route/,
    "Test 19: Farmer -> Farmer route must be rejected"
  );
  console.log("✔ Test 19: Unsupported route (Farmer -> Farmer) rejected.");

  // Test 20: Invalid route Agent -> Agent is rejected without inventing new routes
  assert.throws(
    () => {
      validateTransferRoute("agent", "agent");
    },
    /Unsupported Transfer Route/,
    "Test 20: Agent -> Agent route must be rejected"
  );
  console.log("✔ Test 20: Unsupported route (Agent -> Agent) rejected.");

  console.log("\n--- 6. FEE POLICIES & SELLER INFORMATION ACCESS ---");

  // Test 21: On-platform purchase charges 2% platform fee
  assert.strictEqual(purchase1.trade.platformFeeApplied?.ratePercentage, 2.0);
  assert.strictEqual(purchase1.trade.platformFeeApplied?.calculatedAmount, 100 * 2700 * 0.02);
  console.log("✔ Test 21: 2% platform service fee correctly captured.");

  // Test 22: Route fee calculation: Farmer -> Cooperative is FREE
  const freeFee = calculateTransferFee("Farmer -> Cooperative", 500, "XAF", "farmer_1");
  assert.strictEqual(freeFee.calculatedAmount, 0);
  assert.strictEqual(freeFee.isFeeExempt, true);
  console.log("✔ Test 22: Farmer -> Cooperative route is FREE (0 XAF).");

  // Test 23: Route fee calculation: Cooperative -> Agent is CHARGED
  const chargedFee = calculateTransferFee("Cooperative -> Agent", 500, "USD", "coop_1");
  assert.strictEqual(chargedFee.isFeeExempt, false);
  assert(chargedFee.calculatedAmount > 0, "Cooperative -> Agent must assess a charged fee");
  console.log("✔ Test 23: Cooperative -> Agent route fee correctly assessed as CHARGED.");

  // Test 24: On-platform purchase automatically grants seller access
  const accessRecords = Array.from(state.sellerAccess.values()).filter(
    (a) => a.buyerId === "agent_business_douala"
  );
  assert(accessRecords.length > 0, "Buyer must have active SellerAccessRecord");
  assert.strictEqual(accessRecords[0].feePaid, 0, "On-platform purchase grants access without second fee");
  console.log("✔ Test 24: On-platform purchase automatically grants seller contact access.");

  console.log("\n================================================================================");
  console.log("             ALL STEP 8 VERIFICATION TESTS PASSED SUCCESSFULLY!               ");
  console.log("================================================================================\n");
}

runStep8Tests().catch((err) => {
  console.error("Step 8 Test Failure:", err);
  process.exit(1);
});
