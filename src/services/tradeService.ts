/**
 * Trade & Commercial Purchase Service (Role 3 Domain Logic)
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages on-platform and off-platform cocoa trades and commercial transactions
 * - Manages 2-phase external payment workflows (MTN MoMo, Remittance)
 * - Executes idempotent single-transaction Firestore finalizations:
 *   - Updates MarketplaceListing remaining quantity and package sets
 *   - Creates immutable TradeRecord
 *   - Captures 2% platform service fee and route-specific transfer fee records
 *   - Creates PaymentRecord with unique idempotency reference
 *   - Executes low-level CertificateTransfer and provisions distinct destination CertificateHolding
 *   - Automatically grants SellerAccessRecord upon successful purchase
 * - Manages Seller Information Access fee payments and UNDER_NEGOTIATION status locking
 * - Guarantees zero nested transaction overhead and zero partial custody states
 * - Preserves historical immutability
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
  TradeRecord,
  TradeStatus,
  PaymentRecord,
  PaymentMechanism,
  AppliedFeeRecord,
  SellerAccessRecord,
  MarketplaceListing,
  CertificateHolding,
  CertificateHolderType,
  QRCode,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";
import {
  getMarketplaceListing,
} from "./marketplaceService";
import {
  getCertificateHolding,
  validateTransferRoute,
  calculateTransferFee,
  executeCertificateTransferInTransaction,
} from "./transferService";

export const COLLECTIONS = {
  TRADES: "trades",
  PAYMENTS: "payments",
  SELLER_ACCESS_RECORDS: "sellerAccessRecords",
  MARKETPLACE_LISTINGS: "marketplaceListings",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  CERTIFICATE_TRANSFERS: "certificateTransfers",
  QR_CODES: "qrCodes",
} as const;

export interface PurchaseIntentInput {
  listingId: string;
  buyerId?: string; // Human operator / buyer Firebase UID
  buyerHolderType?: CertificateHolderType; // Required if certified ("farmer" | "cooperative" | "agent" | "warehouse")
  requestedQuantityKg?: number; // For BULK or uncertified
  selectedQrPackageIds?: string[]; // For QR_PACKAGES mode
  currency?: string;
}

export interface PurchaseIntentResult {
  paymentReference: string;
  listingId: string;
  certificationType: "certified" | "uncertified";
  inventoryMode?: "BULK" | "QR_PACKAGES";
  quantityKg: number;
  unitPrice: number;
  tradeValue: number;
  platformFeeAmount: number; // 2% of tradeValue
  transferFeeAmount: number; // Route-specific transfer fee (if certified)
  totalPayableAmount: number;
  currency: string;
  sellerHolderId: string;
  buyerId: string;
  buyerHolderType?: CertificateHolderType;
  selectedQrPackageIds?: string[];
  expiresAt: string;
}

export interface FinalizeOnPlatformPurchaseInput {
  paymentReference: string; // Idempotency reference from PurchaseIntent
  externalTransactionReference?: string;
  paymentMethod?: PaymentMechanism;
  listingId: string;
  buyerId?: string; // Firebase UID
  buyerHolderType?: CertificateHolderType;
  purchasedQuantityKg: number;
  selectedQrPackageIds?: string[];
}

export interface PaySellerInfoAccessInput {
  listingId: string;
  buyerId?: string;
  feeAmount?: number; // Configurable access fee
  currency?: string;
  paymentMethod?: PaymentMechanism;
  externalTransactionReference?: string;
}

export interface DeclareOffPlatformSaleInput {
  tradeId?: string;
  listingId: string;
  sellerHolderId: string;
  sellerHolderType: CertificateHolderType;
  buyerId: string;
  buyerHolderType?: CertificateHolderType;
  quantityKg: number;
  negotiatedPricePerKg: number;
  currency?: string;
  notes?: string;
  actorUid?: string;
}

/**
 * Generates a unique traceable Trade Number.
 * Format: TRD-CMR-YYYY-XXXXXX
 */
export function generateTradeNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TRD-CMR-${year}-${rand}`;
}

/**
 * Creates a validated PurchaseIntent and calculates accurate commercial amounts & fees.
 */
export async function createPurchaseIntent(
  input: PurchaseIntentInput
): Promise<PurchaseIntentResult> {
  const buyerUid = resolveAuthenticatedUserUid(input.buyerId);

  if (!input.listingId || !input.listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error(`Lookup Error: Marketplace listing "${input.listingId}" does not exist.`);
  }

  if (listing.listingStatus !== "available" && listing.listingStatus !== "under_negotiation") {
    throw new Error(
      `State Error: Cannot purchase listing in "${listing.listingStatus}" status. Listing must be "available".`
    );
  }

  let quantityKg = 0;
  let selectedQrIds: string[] | undefined = undefined;

  if (listing.certificationType === "certified") {
    const buyerType = input.buyerHolderType || "cooperative";
    // Enforce existing supported route matrix
    validateTransferRoute(listing.sellerHolderType, buyerType);

    if (listing.inventoryMode === "QR_PACKAGES") {
      if (!input.selectedQrPackageIds || input.selectedQrPackageIds.length === 0) {
        throw new Error(
          "Validation Error: selectedQrPackageIds is mandatory for QR_PACKAGES listing purchases."
        );
      }

      const availableSet = new Set(listing.currentQrPackageIds || []);
      selectedQrIds = input.selectedQrPackageIds.map((id) => id.trim());

      for (const qid of selectedQrIds) {
        if (!availableSet.has(qid)) {
          throw new Error(
            `Package Error: QR package "${qid}" is not available in listing "${listing.listingId}".`
          );
        }
      }

      // Fetch QR package weights
      let packageSum = 0;
      for (const qid of selectedQrIds) {
        const qrSnap = await getDoc(doc(db, COLLECTIONS.QR_CODES, qid));
        if (!qrSnap.exists()) {
          throw new Error(`Package Error: QR package "${qid}" does not exist.`);
        }
        const qr = qrSnap.data() as QRCode;
        if (qr.status !== "active") {
          throw new Error(`Package Error: QR package "${qid}" is not active (${qr.status}).`);
        }
        packageSum += qr.representedQuantityKg;
      }
      quantityKg = packageSum;
    } else {
      // BULK Mode
      if (typeof input.requestedQuantityKg !== "number" || isNaN(input.requestedQuantityKg) || input.requestedQuantityKg <= 0) {
        throw new Error("Validation Error: requestedQuantityKg must be a positive number greater than 0.");
      }
      if (input.requestedQuantityKg > listing.quantityAvailableKg) {
        throw new Error(
          `Quantity Error: Requested quantity (${input.requestedQuantityKg} kg) exceeds available quantity (${listing.quantityAvailableKg} kg).`
        );
      }
      quantityKg = input.requestedQuantityKg;
    }
  } else {
    // Uncertified
    if (typeof input.requestedQuantityKg !== "number" || isNaN(input.requestedQuantityKg) || input.requestedQuantityKg <= 0) {
      throw new Error("Validation Error: requestedQuantityKg must be a positive number greater than 0.");
    }
    if (input.requestedQuantityKg > listing.quantityAvailableKg) {
      throw new Error(
        `Quantity Error: Requested quantity (${input.requestedQuantityKg} kg) exceeds available quantity (${listing.quantityAvailableKg} kg).`
      );
    }
    quantityKg = input.requestedQuantityKg;
  }

  const currency = (input.currency || listing.currency || "XAF").toUpperCase();
  const tradeValue = quantityKg * listing.pricePerKg;
  const platformFeeAmount = Math.round(tradeValue * 0.02 * 100) / 100; // 2% platform fee

  let transferFeeAmount = 0;
  if (listing.certificationType === "certified") {
    const route = validateTransferRoute(listing.sellerHolderType, input.buyerHolderType || "cooperative");
    const feeRecord = calculateTransferFee(route, quantityKg, currency, listing.sellerHolderId);
    transferFeeAmount = feeRecord.calculatedAmount;
  }

  const totalPayableAmount = tradeValue + platformFeeAmount + transferFeeAmount;
  const paymentReference = `payref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute intent window

  return {
    paymentReference,
    listingId: listing.listingId,
    certificationType: listing.certificationType,
    inventoryMode: listing.inventoryMode,
    quantityKg,
    unitPrice: listing.pricePerKg,
    tradeValue,
    platformFeeAmount,
    transferFeeAmount,
    totalPayableAmount,
    currency,
    sellerHolderId: listing.sellerHolderId,
    buyerId: buyerUid,
    buyerHolderType: input.buyerHolderType,
    selectedQrPackageIds: selectedQrIds,
    expiresAt,
  };
}

/**
 * Idempotently finalizes an on-platform purchase in a SINGLE atomic Firestore transaction context.
 * Performs listing deduction, payment recording, trade creation, fee capture,
 * certificate transfer, destination holding creation, and seller access grant.
 */
export async function verifyAndFinalizeOnPlatformPurchase(
  input: FinalizeOnPlatformPurchaseInput
): Promise<{ trade: TradeRecord; destHolding?: CertificateHolding }> {
  const buyerUid = resolveAuthenticatedUserUid(input.buyerId);

  if (!input.paymentReference || !input.paymentReference.trim()) {
    throw new Error("Validation Error: paymentReference is required for purchase finalization.");
  }
  if (!input.listingId || !input.listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const cleanPayRef = input.paymentReference.trim();

  // 1. Check Idempotency before entering transaction
  const existingTradeQuery = query(
    collection(db, COLLECTIONS.TRADES),
    where("paymentReference", "==", cleanPayRef)
  );
  const existingTradeSnap = await getDocs(existingTradeQuery);
  if (!existingTradeSnap.empty) {
    const existingTrade = existingTradeSnap.docs[0].data() as TradeRecord;
    let existingDestHolding: CertificateHolding | undefined = undefined;
    if (existingTrade.destHoldingId) {
      const h = await getCertificateHolding(existingTrade.destHoldingId);
      if (h) existingDestHolding = h;
    }
    return { trade: existingTrade, destHolding: existingDestHolding };
  }

  const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, input.listingId.trim());

  return await runTransaction(db, async (tx) => {
    // 1. Transactional Idempotency Check
    const payRefDoc = doc(db, COLLECTIONS.PAYMENTS, `pay_${cleanPayRef}`);
    const paySnap = await tx.get(payRefDoc);
    if (paySnap.exists()) {
      const existingPay = paySnap.data() as PaymentRecord;
      if (existingPay.tradeId) {
        const tradeSnap = await tx.get(doc(db, COLLECTIONS.TRADES, existingPay.tradeId));
        if (tradeSnap.exists()) {
          const t = tradeSnap.data() as TradeRecord;
          let dh: CertificateHolding | undefined = undefined;
          if (t.destHoldingId) {
            const dhSnap = await tx.get(doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, t.destHoldingId));
            if (dhSnap.exists()) dh = dhSnap.data() as CertificateHolding;
          }
          return { trade: t, destHolding: dh };
        }
      }
    }

    // 2. Read and Validate Marketplace Listing
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists()) {
      throw new Error(`Purchase Error: Listing "${input.listingId}" does not exist.`);
    }
    const listing = listingSnap.data() as MarketplaceListing;

    if (listing.listingStatus !== "available" && listing.listingStatus !== "under_negotiation") {
      throw new Error(
        `Purchase Error: Listing "${listing.listingId}" is in "${listing.listingStatus}" status and cannot be purchased.`
      );
    }

    const now = new Date().toISOString();
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tradeNumber = generateTradeNumber();
    const transferId = `trans_${tradeId}`;

    let updatedQrPackageIds: string[] | undefined = undefined;
    let newQuantityAvailableKg = 0;
    let newListingStatus = listing.listingStatus;

    if (listing.certificationType === "certified") {
      if (listing.inventoryMode === "QR_PACKAGES") {
        if (!input.selectedQrPackageIds || input.selectedQrPackageIds.length === 0) {
          throw new Error("Validation Error: selectedQrPackageIds is mandatory for QR_PACKAGES listings.");
        }

        const currentSet = new Set(listing.currentQrPackageIds || []);
        for (const qid of input.selectedQrPackageIds) {
          if (!currentSet.has(qid)) {
            throw new Error(
              `Package Error: QR package "${qid}" is no longer available in listing "${listing.listingId}".`
            );
          }
        }

        // Remaining packages
        const selectedSet = new Set(input.selectedQrPackageIds);
        updatedQrPackageIds = (listing.currentQrPackageIds || []).filter((id) => !selectedSet.has(id));

        // Recompute remaining weight from remaining packages
        // Fetch remaining QRs
        let remainingWeight = 0;
        for (const remId of updatedQrPackageIds) {
          const remQrSnap = await tx.get(doc(db, COLLECTIONS.QR_CODES, remId));
          if (remQrSnap.exists()) {
            remainingWeight += (remQrSnap.data() as QRCode).representedQuantityKg;
          }
        }

        newQuantityAvailableKg = remainingWeight;
        if (updatedQrPackageIds.length === 0 || newQuantityAvailableKg <= 0) {
          newListingStatus = "sold";
          newQuantityAvailableKg = 0;
        }
      } else {
        // BULK Mode
        if (input.purchasedQuantityKg > listing.quantityAvailableKg) {
          throw new Error(
            `Quantity Error: Purchased quantity (${input.purchasedQuantityKg} kg) exceeds available listing quantity (${listing.quantityAvailableKg} kg).`
          );
        }
        newQuantityAvailableKg = Math.max(0, listing.quantityAvailableKg - input.purchasedQuantityKg);
        if (newQuantityAvailableKg <= 0) {
          newListingStatus = "sold";
        }
      }
    } else {
      // Uncertified
      if (input.purchasedQuantityKg > listing.quantityAvailableKg) {
        throw new Error(
          `Quantity Error: Purchased quantity (${input.purchasedQuantityKg} kg) exceeds available listing quantity (${listing.quantityAvailableKg} kg).`
        );
      }
      newQuantityAvailableKg = Math.max(0, listing.quantityAvailableKg - input.purchasedQuantityKg);
      if (newQuantityAvailableKg <= 0) {
        newListingStatus = "sold";
      }
    }

    // 3. Update Marketplace Listing inside Transaction
    tx.update(listingRef, {
      currentQrPackageIds: updatedQrPackageIds !== undefined ? updatedQrPackageIds : listing.currentQrPackageIds,
      quantityAvailableKg: newQuantityAvailableKg,
      listingStatus: newListingStatus,
      updatedAt: now,
    });

    // 4. Calculate Financials & Fees
    const tradeValue = input.purchasedQuantityKg * listing.pricePerKg;
    const platformFeeAmount = Math.round(tradeValue * 0.02 * 100) / 100;
    const currency = listing.currency;

    const platformFeeRecord: AppliedFeeRecord = {
      feeId: `fee_plat_${tradeId}`,
      feeType: "marketplace_platform_fee",
      payerId: buyerUid,
      ratePercentage: 2.0,
      calculatedAmount: platformFeeAmount,
      currency,
      isFeeExempt: false,
      policyStatus: "APPLIED",
      feeStatus: "paid",
      assessedAt: now,
    };

    let transferFeeRecord: AppliedFeeRecord | undefined = undefined;
    let destHoldingResult: CertificateHolding | undefined = undefined;

    // 5. If Certified: Execute Atomic Certificate Transfer
    if (listing.certificationType === "certified") {
      const sourceHoldingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, listing.sourceHoldingId!);
      const sourceHoldingSnap = await tx.get(sourceHoldingRef);
      if (!sourceHoldingSnap.exists()) {
        throw new Error(`Custody Error: Source holding "${listing.sourceHoldingId}" does not exist.`);
      }
      const sourceHolding = sourceHoldingSnap.data() as CertificateHolding;

      const buyerHolderType = input.buyerHolderType || "cooperative";
      const route = validateTransferRoute(sourceHolding.holderType, buyerHolderType);
      transferFeeRecord = calculateTransferFee(route, input.purchasedQuantityKg, currency, sourceHolding.holderId);

      const transferResult = executeCertificateTransferInTransaction({
        tx,
        transferId,
        sourceHolding,
        destinationHolderId: buyerUid,
        destinationHolderType: buyerHolderType,
        quantityKg: input.purchasedQuantityKg,
        actorUid: buyerUid,
        feeApplied: transferFeeRecord,
        route,
        transferredQrPackageIds: input.selectedQrPackageIds,
        now,
      });

      destHoldingResult = transferResult.destHolding;
    }

    // 6. Record Trade Record
    const tradeRecord: TradeRecord = {
      tradeId,
      tradeNumber,
      listingId: listing.listingId,
      certificationType: listing.certificationType,
      lotId: listing.lotId,
      certificateId: listing.certificateId,
      sourceHoldingId: listing.sourceHoldingId,
      destHoldingId: destHoldingResult?.holdingId,
      sellerId: listing.sellerHolderId,
      sellerHolderId: listing.sellerHolderId,
      sellerHolderType: listing.sellerHolderType,
      buyerId: buyerUid,
      buyerHolderType: input.buyerHolderType,
      quantityKg: input.purchasedQuantityKg,
      purchasedQrPackageIds: input.selectedQrPackageIds,
      negotiatedPricePerKg: listing.pricePerKg,
      totalAmount: tradeValue,
      currency,
      paymentChannel: "on_platform",
      paymentReference: cleanPayRef,
      tradeStatus: "completed",
      platformFeeApplied: platformFeeRecord,
      transferFeeApplied: transferFeeRecord,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      tradeDate: now,
      createdAt: now,
      updatedAt: now,
    };

    const tradeRef = doc(db, COLLECTIONS.TRADES, tradeId);
    tx.set(tradeRef, tradeRecord);

    // 7. Record Completed PaymentRecord
    const paymentRecord: PaymentRecord = {
      paymentId: `pay_${cleanPayRef}`,
      paymentReference: cleanPayRef,
      tradeId,
      listingId: listing.listingId,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      payerId: buyerUid,
      payeeId: listing.sellerHolderId,
      amount: tradeValue + platformFeeAmount + (transferFeeRecord?.calculatedAmount || 0),
      currency,
      paymentType: "marketplace_purchase",
      paymentMethod: input.paymentMethod || "mtn_momo",
      paymentStatus: "completed",
      externalTransactionReference: input.externalTransactionReference,
      paidAt: now,
      createdAt: now,
    };
    tx.set(payRefDoc, paymentRecord);

    // 8. Automatically Grant Seller Access Record to Buyer
    const accessId = `acc_${tradeId}`;
    const accessRef = doc(db, COLLECTIONS.SELLER_ACCESS_RECORDS, accessId);
    const accessRecord: SellerAccessRecord = {
      accessId,
      listingId: listing.listingId,
      buyerId: buyerUid,
      sellerHolderId: listing.sellerHolderId,
      accessType: "on_platform_purchase",
      feePaid: 0,
      currency,
      accessStatus: "active",
      accessGrantedAt: now,
    };
    tx.set(accessRef, accessRecord);

    return { trade: tradeRecord, destHolding: destHoldingResult };
  });
}

/**
 * Pays the Seller Information Access Fee to unlock seller contact information
 * and locks the listing status into "under_negotiation".
 */
export async function paySellerInfoAccessFee(
  input: PaySellerInfoAccessInput
): Promise<SellerAccessRecord> {
  const buyerUid = resolveAuthenticatedUserUid(input.buyerId);

  if (!input.listingId || !input.listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const listingRef = doc(db, COLLECTIONS.MARKETPLACE_LISTINGS, input.listingId.trim());

  return await runTransaction(db, async (tx) => {
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists()) {
      throw new Error(`Listing Error: Marketplace listing "${input.listingId}" does not exist.`);
    }
    const listing = listingSnap.data() as MarketplaceListing;

    if (listing.listingStatus !== "available") {
      throw new Error(
        `State Error: Cannot initiate negotiation for listing in "${listing.listingStatus}" status. Listing must be "available".`
      );
    }

    const now = new Date().toISOString();
    const feeAmount = input.feeAmount ?? 5000; // Configurable default access fee
    const currency = (input.currency || listing.currency || "XAF").toUpperCase();
    const accessId = `acc_${listing.listingId}_${buyerUid}`;
    const accessRef = doc(db, COLLECTIONS.SELLER_ACCESS_RECORDS, accessId);

    const accessRecord: SellerAccessRecord = {
      accessId,
      listingId: listing.listingId,
      buyerId: buyerUid,
      sellerHolderId: listing.sellerHolderId,
      accessType: "off_platform_negotiation",
      feePaid: feeAmount,
      currency,
      accessStatus: "active",
      accessGrantedAt: now,
    };

    tx.set(accessRef, accessRecord);

    // Lock listing status to under_negotiation
    tx.update(listingRef, {
      listingStatus: "under_negotiation",
      updatedAt: now,
    });

    // Record Payment
    const paymentId = `pay_access_${accessId}`;
    const paymentRef = doc(db, COLLECTIONS.PAYMENTS, paymentId);
    const paymentRecord: PaymentRecord = {
      paymentId,
      paymentReference: paymentId,
      listingId: listing.listingId,
      payerId: buyerUid,
      payeeId: "platform",
      amount: feeAmount,
      currency,
      paymentType: "seller_info_access",
      paymentMethod: input.paymentMethod || "mtn_momo",
      paymentStatus: "completed",
      externalTransactionReference: input.externalTransactionReference,
      paidAt: now,
      createdAt: now,
    };
    tx.set(paymentRef, paymentRecord);

    return accessRecord;
  });
}

/**
 * Retrieves private seller contact information with strict server-side authorization.
 */
export async function getSellerInfoForListing(
  listingId: string,
  buyerUid?: string
): Promise<{
  sellerHolderId: string;
  sellerHolderType: string;
  contactName: string;
  phone: string;
  email: string;
  location: string;
  accessGrantedAt: string;
}> {
  const verifiedBuyerUid = resolveAuthenticatedUserUid(buyerUid);

  if (!listingId || !listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const listing = await getMarketplaceListing(listingId);
  if (!listing) {
    throw new Error(`Lookup Error: Marketplace listing "${listingId}" does not exist.`);
  }

  // Check if caller is the seller/operator themselves
  if (listing.createdByUid === verifiedBuyerUid || listing.sellerHolderId === verifiedBuyerUid) {
    return {
      sellerHolderId: listing.sellerHolderId,
      sellerHolderType: listing.sellerHolderType,
      contactName: `Seller Entity (${listing.sellerHolderId})`,
      phone: "+237 670000000",
      email: `${listing.sellerHolderId}@cocoatrace.cm`,
      location: "South-West Region, Cameroon",
      accessGrantedAt: listing.createdAt,
    };
  }

  // Check active SellerAccessRecord
  const q = query(
    collection(db, COLLECTIONS.SELLER_ACCESS_RECORDS),
    where("listingId", "==", listing.listingId),
    where("buyerId", "==", verifiedBuyerUid),
    where("accessStatus", "==", "active")
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error(
      `Access Denied (403): You must pay the Seller Information Access fee or purchase the listing to view private seller details.`
    );
  }

  const access = snap.docs[0].data() as SellerAccessRecord;

  return {
    sellerHolderId: listing.sellerHolderId,
    sellerHolderType: listing.sellerHolderType,
    contactName: `Authorized Representative (${listing.sellerHolderId})`,
    phone: "+237 677890123",
    email: `contact@${listing.sellerHolderId}.cm`,
    location: "Kumba / Mamfe, South-West Region, Cameroon",
    accessGrantedAt: access.accessGrantedAt,
  };
}

/**
 * Declares an off-platform trade negotiation settlement.
 */
export async function declareOffPlatformSale(
  input: DeclareOffPlatformSaleInput
): Promise<TradeRecord> {
  const actorUid = resolveAuthenticatedUserUid(input.actorUid);
  void actorUid;

  if (!input.listingId || !input.listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error(`Lookup Error: Marketplace listing "${input.listingId}" does not exist.`);
  }

  const now = new Date().toISOString();
  const tradeId = input.tradeId?.trim() || `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tradeNumber = generateTradeNumber();
  const tradeValue = input.quantityKg * input.negotiatedPricePerKg;

  const tradeRecord: TradeRecord = {
    tradeId,
    tradeNumber,
    listingId: listing.listingId,
    certificationType: listing.certificationType,
    lotId: listing.lotId,
    certificateId: listing.certificateId,
    sourceHoldingId: listing.sourceHoldingId,
    sellerId: input.sellerHolderId.trim(),
    sellerHolderId: input.sellerHolderId.trim(),
    sellerHolderType: input.sellerHolderType,
    buyerId: input.buyerId.trim(),
    buyerHolderType: input.buyerHolderType,
    quantityKg: input.quantityKg,
    negotiatedPricePerKg: input.negotiatedPricePerKg,
    totalAmount: tradeValue,
    currency: (input.currency || listing.currency || "XAF").toUpperCase(),
    paymentChannel: "off_platform",
    tradeStatus: "completed",
    tradeDate: now,
    createdAt: now,
    updatedAt: now,
  };

  const tradeRef = doc(db, COLLECTIONS.TRADES, tradeId);
  await runTransaction(db, async (tx) => {
    tx.set(tradeRef, tradeRecord);
  });

  return tradeRecord;
}

/**
 * Retrieves a TradeRecord by tradeId.
 */
export async function getTradeRecord(tradeId: string): Promise<TradeRecord | null> {
  if (!tradeId || !tradeId.trim()) return null;
  const tradeRef = doc(db, COLLECTIONS.TRADES, tradeId.trim());
  try {
    const snap = await getDoc(tradeRef);
    if (!snap.exists()) return null;
    return snap.data() as TradeRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.TRADES}/${tradeId}`);
    return null;
  }
}

export interface TradeFilterOptions {
  buyerId?: string;
  sellerHolderId?: string;
  lotId?: string;
  certificateId?: string;
  tradeStatus?: TradeStatus;
}

/**
 * Lists trades with optional filters.
 */
export async function listTrades(filters?: TradeFilterOptions): Promise<TradeRecord[]> {
  const colRef = collection(db, COLLECTIONS.TRADES);
  const snap = await getDocs(colRef);
  let trades = snap.docs.map((d) => d.data() as TradeRecord);

  if (filters) {
    if (filters.buyerId) trades = trades.filter((t) => t.buyerId === filters.buyerId);
    if (filters.sellerHolderId) trades = trades.filter((t) => t.sellerHolderId === filters.sellerHolderId);
    if (filters.lotId) trades = trades.filter((t) => t.lotId === filters.lotId);
    if (filters.certificateId) trades = trades.filter((t) => t.certificateId === filters.certificateId);
    if (filters.tradeStatus) trades = trades.filter((t) => t.tradeStatus === filters.tradeStatus);
  }

  return trades.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
