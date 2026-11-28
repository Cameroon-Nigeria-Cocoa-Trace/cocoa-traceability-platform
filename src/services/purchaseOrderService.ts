/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Post-Unlock Commercial Trade Workflow Service
 * Purchase Order -> Seller Sign & Auto-Invoice -> On-Platform (1.5% Escrow/Split) OR Off-Platform (Receipt + 0.5% Transfer Fee)
 * -> Atomic Certificate Transfer & Delivery Note -> Buyer Delivery Confirmation & Remainder Return to Marketplace
 */

import { randomBytes } from "node:crypto";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  AppliedFeeRecord,
  BuyerLetterhead,
  CertificateHolderType,
  CertificateHolding,
  CertificateHoldingStatus,
  CertificateTransfer,
  DeliveryNote,
  MarketplaceListing,
  OnPlatformPaymentMode,
  PaymentRecord,
  PurchaseOrder,
  PurchaseOrderBundle,
  QRCode,
  TradeInvoice,
  TradePartySignature,
  TradeRecord,
} from "@/types/traceability";
import { cleanData, generateTradeNumber, hasPaidSellerInfoAccess } from "./tradeService";
import { validateTransferRoute } from "./transferService";
import { getNgnExchangeRate } from "./exchangeRateService";
import {
  createFlutterwaveStandardPayment,
  verifyFlutterwaveTransactionByReference,
} from "./flutterwaveService";

export const PO_COLLECTIONS = {
  PURCHASE_ORDERS: "purchaseOrders",
  TRADE_INVOICES: "tradeInvoices",
  DELIVERY_NOTES: "deliveryNotes",
  MARKETPLACE_LISTINGS: "marketplaceListings",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  CERTIFICATE_TRANSFERS: "certificateTransfers",
  CERTIFICATES: "certificates",
  QR_CODES: "qrCodes",
  TRADES: "trades",
  PAYMENTS: "payments",
  SELLER_ACCESS_RECORDS: "sellerAccessRecords",
} as const;

export const ON_PLATFORM_SERVICE_FEE_PERCENT = 1.5;
export const OFF_PLATFORM_TRANSFER_FEE_PERCENT = 0.5;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function generateDocumentNumber(prefix: "PO" | "INV" | "DN"): string {
  const year = new Date().getFullYear();
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-TTN-${year}-${rand}`;
}

function generateTxRef(prefix: "PAY-INV" | "PAY-TRF"): string {
  return `${prefix}-${Date.now()}-${randomBytes(10).toString("hex").toUpperCase()}`;
}

function getValidatedCallbackUrl(): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredAppUrl) {
    throw new Error(
      "Configuration Error: NEXT_PUBLIC_APP_URL must be configured for payment callbacks."
    );
  }
  let appUrl: URL;
  try {
    appUrl = new URL(configuredAppUrl);
  } catch {
    throw new Error("Configuration Error: NEXT_PUBLIC_APP_URL is not a valid URL.");
  }
  const isLocalhost = ["localhost", "127.0.0.1"].includes(appUrl.hostname);
  if (
    (appUrl.protocol !== "https:" && !(appUrl.protocol === "http:" && isLocalhost)) ||
    appUrl.username ||
    appUrl.password
  ) {
    throw new Error("Configuration Error: Payment callback URL must use HTTPS.");
  }
  return `${appUrl.origin}/payments/flutterwave/verify`;
}

function assertSafeHttpsUrl(url: string | undefined, fieldLabel: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Validation Error: ${fieldLabel} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Validation Error: ${fieldLabel} must use HTTPS.`);
  }
  return parsed.toString();
}

async function resolveSellerContactSnapshot(listing: MarketplaceListing): Promise<{
  contactName: string;
  phone: string;
  email: string;
  location: string;
}> {
  let contactName = "";
  let phone = "";
  let email = "";
  let location = "Cameroon";

  try {
    if (listing.lotId) {
      const lotSnap = await firebaseAdminDb.collection("cocoaLots").doc(listing.lotId).get();
      const lot = lotSnap.exists ? lotSnap.data() : null;
      if (lot && typeof lot.farmId === "string" && lot.farmId) {
        const farmSnap = await firebaseAdminDb.collection("farms").doc(lot.farmId).get();
        if (farmSnap.exists) {
          const farm = farmSnap.data() || {};
          contactName = typeof farm.farmerName === "string" ? farm.farmerName.trim() : "";
          phone = typeof farm.farmerPhone === "string" ? farm.farmerPhone.trim() : "";
          email = typeof farm.farmerEmail === "string" ? farm.farmerEmail.trim() : "";
          const parts = [
            typeof farm.village === "string" ? farm.village.trim() : "",
            typeof farm.region === "string" ? farm.region.trim() : "",
            "Cameroon",
          ].filter(Boolean);
          if (parts.length > 0) location = parts.join(", ");
        }
      }
    }
  } catch {
    // Fall through to users collection
  }

  if (!contactName || (!phone && !email)) {
    try {
      const userSnap = await firebaseAdminDb.collection("users").doc(listing.sellerHolderId).get();
      if (userSnap.exists) {
        const u = userSnap.data() || {};
        if (!contactName) {
          contactName =
            typeof u.displayName === "string" && u.displayName.trim()
              ? u.displayName.trim()
              : typeof u.name === "string"
                ? u.name.trim()
                : "";
        }
        if (!phone) {
          phone =
            typeof u.phone === "string" && u.phone.trim()
              ? u.phone.trim()
              : typeof u.phoneNumber === "string"
                ? u.phoneNumber.trim()
                : "";
        }
        if (!email && typeof u.email === "string") {
          email = u.email.trim();
        }
      }
    } catch {
      // Continue
    }
  }

  return {
    contactName: contactName || `Verified Seller (${listing.sellerHolderId.slice(-6)})`,
    phone,
    email,
    location,
  };
}

/**
 * Atomic helper executed inside a firebaseAdminDb transaction to perform
 * certificate custody transfer (or uncertified holding provisioning) once payment is confirmed.
 */
async function executeCustodyTransferInAdminTx(params: {
  tx: FirebaseFirestore.Transaction;
  po: PurchaseOrder;
  listing: MarketplaceListing;
  transferId: string;
  tradeId: string;
  feeRecord: AppliedFeeRecord;
  actorUid: string;
  sourceHolding: CertificateHolding | null;
  sourceQRs: QRCode[];
  now: string;
}): Promise<{ destHoldingId: string; transferRecord?: CertificateTransfer }> {
  const { tx, po, listing, transferId, tradeId, feeRecord, actorUid, sourceHolding, sourceQRs, now } =
    params;

  if (listing.certificationType === "certified" && sourceHolding) {
    const qtyToTransfer = Math.min(po.quantityKg, sourceHolding.availableQuantityKg);
    const destHoldingId = `holding_${transferId}`;
    const destHoldingRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.CERTIFICATE_HOLDINGS)
      .doc(destHoldingId);

    const route = (() => {
      try {
        return validateTransferRoute(sourceHolding.holderType, po.buyerHolderType);
      } catch {
        return "Farmer -> Cooperative" as const;
      }
    })();

    const remainingSourceQty = Math.max(0, sourceHolding.availableQuantityKg - qtyToTransfer);
    const newSourceStatus: CertificateHoldingStatus =
      remainingSourceQty <= 0 ? "depleted" : "partially_transferred";

    const destHolding: CertificateHolding = {
      holdingId: destHoldingId,
      certificateId: sourceHolding.certificateId,
      certificateNumber: sourceHolding.certificateNumber,
      lotId: sourceHolding.lotId,
      farmId: sourceHolding.farmId,
      holderId: po.buyerId,
      holderType: po.buyerHolderType,
      quantityKg: qtyToTransfer,
      availableQuantityKg: qtyToTransfer,
      parentHoldingId: sourceHolding.holdingId,
      sourceTransferId: transferId,
      sourceTransferIds: [transferId],
      status: "active",
      certificationType: "certified",
      isUncertified: false,
      createdBy: actorUid,
      createdAt: now,
      updatedAt: now,
    };

    const transferRecord: CertificateTransfer = {
      transferId,
      certificateId: sourceHolding.certificateId,
      certificateNumber: sourceHolding.certificateNumber,
      lotId: sourceHolding.lotId,
      sourceHoldingId: sourceHolding.holdingId,
      destinationHoldingId: destHoldingId,
      sourceHolderId: sourceHolding.holderId,
      sourceHolderType: sourceHolding.holderType,
      destinationHolderId: po.buyerId,
      destinationHolderType: po.buyerHolderType,
      route,
      quantityKg: qtyToTransfer,
      isPartialTransfer: remainingSourceQty > 0,
      sourceRemainingQuantityKg: remainingSourceQty,
      feeApplied: feeRecord,
      transferStatus: "completed",
      initiatedBy: actorUid,
      completedBy: actorUid,
      initiatedAt: po.transferInitializedAt || now,
      completedAt: now,
    };

    const sourceHoldingRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.CERTIFICATE_HOLDINGS)
      .doc(sourceHolding.holdingId);
    const transferRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.CERTIFICATE_TRANSFERS)
      .doc(transferId);

    tx.update(
      sourceHoldingRef,
      cleanData({
        availableQuantityKg: remainingSourceQty,
        status: newSourceStatus,
        updatedAt: now,
      })
    );
    tx.set(destHoldingRef, cleanData(destHolding));
    tx.set(transferRef, cleanData(transferRecord));

    if (sourceHolding.certificateId) {
      const certRef = firebaseAdminDb
        .collection(PO_COLLECTIONS.CERTIFICATES)
        .doc(sourceHolding.certificateId);
      tx.set(
        certRef,
        {
          status: "partially_transferred",
          updatedAt: now,
        },
        { merge: true }
      );
    }

    // Retire active QRs if entire holding was depleted
    if (remainingSourceQty <= 0 && sourceQRs.length > 0) {
      for (const qr of sourceQRs) {
        if (qr.status === "active" && qr.returnedToBulk !== true) {
          const qrRef = firebaseAdminDb.collection(PO_COLLECTIONS.QR_CODES).doc(qr.qrId);
          tx.update(
            qrRef,
            cleanData({
              status: "superseded",
              retiredOnSale: true,
              supersededByTransferId: transferId,
              supersededByHoldingId: destHoldingId,
              transferredToHolderId: po.buyerId,
              transferredToHolderType: po.buyerHolderType,
              lastTransferId: transferId,
              lastTransferredAt: now,
              updatedAt: now,
            })
          );
        }
      }
    }

    return { destHoldingId, transferRecord };
  }

  // Uncertified holding creation for buyer custody visibility
  const destHoldingId = `hold_trade_${tradeId}`;
  const destHoldingRef = firebaseAdminDb
    .collection(PO_COLLECTIONS.CERTIFICATE_HOLDINGS)
    .doc(destHoldingId);

  tx.set(
    destHoldingRef,
    cleanData({
      holdingId: destHoldingId,
      certificateId: "uncertified",
      certificateNumber: "UNCERTIFIED COCOA",
      lotId: listing.lotId,
      farmId: listing.sellerHolderId,
      holderId: po.buyerId,
      holderType: po.buyerHolderType,
      quantityKg: po.quantityKg,
      availableQuantityKg: po.quantityKg,
      sourceTransferId: tradeId,
      status: "active",
      certificationType: "uncertified",
      isUncertified: true,
      createdBy: actorUid,
      createdAt: now,
      updatedAt: now,
    }),
    { merge: true }
  );

  return { destHoldingId };
}

// ============================================================================
// 1. LIST PURCHASE ORDER BUNDLES FOR AUTHENTICATED USER (BUYER OR SELLER)
// ============================================================================

export async function listPurchaseOrderBundlesForUser(
  userId: string
): Promise<PurchaseOrderBundle[]> {
  const cleanUid = userId.trim();
  if (!cleanUid) return [];

  const [buyerSnap, sellerSnap] = await Promise.all([
    firebaseAdminDb
      .collection(PO_COLLECTIONS.PURCHASE_ORDERS)
      .where("buyerId", "==", cleanUid)
      .get(),
    firebaseAdminDb
      .collection(PO_COLLECTIONS.PURCHASE_ORDERS)
      .where("sellerId", "==", cleanUid)
      .get(),
  ]);

  const poMap = new Map<string, PurchaseOrder>();
  for (const d of [...buyerSnap.docs, ...sellerSnap.docs]) {
    poMap.set(d.id, d.data() as PurchaseOrder);
  }

  const purchaseOrders = Array.from(poMap.values()).sort((a, b) =>
    (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
  );

  const bundles: PurchaseOrderBundle[] = await Promise.all(
    purchaseOrders.map(async (po) => {
      const [invoiceSnap, deliveryNoteSnap] = await Promise.all([
        po.invoiceId
          ? firebaseAdminDb.collection(PO_COLLECTIONS.TRADE_INVOICES).doc(po.invoiceId).get()
          : Promise.resolve(null),
        po.deliveryNoteId
          ? firebaseAdminDb.collection(PO_COLLECTIONS.DELIVERY_NOTES).doc(po.deliveryNoteId).get()
          : Promise.resolve(null),
      ]);

      return {
        purchaseOrder: po,
        invoice: invoiceSnap && invoiceSnap.exists ? (invoiceSnap.data() as TradeInvoice) : null,
        deliveryNote:
          deliveryNoteSnap && deliveryNoteSnap.exists
            ? (deliveryNoteSnap.data() as DeliveryNote)
            : null,
      };
    })
  );

  return bundles;
}

// ============================================================================
// 2. STAGE 1: BUYER GENERATES PURCHASE ORDER
// ============================================================================

export interface CreatePurchaseOrderInput {
  listingId: string;
  buyerId: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerHolderType: CertificateHolderType;
  quantityKg: number;
  unitPricePerKg: number;
  buyerLetterhead: BuyerLetterhead;
  buyerSignature: Omit<TradePartySignature, "signedAt">;
  notes?: string;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const buyerUid = input.buyerId.trim();
  const listingId = input.listingId.trim();

  if (!listingId) {
    throw new Error("Validation Error: listingId is required.");
  }

  const qty = Number(input.quantityKg);
  const unitPrice = Number(input.unitPricePerKg);

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Validation Error: Agreed purchase quantity must be greater than 0 kg.");
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Validation Error: Agreed unit price per kg must be greater than 0.");
  }

  const companyName = input.buyerLetterhead?.companyName?.trim() || "";
  const address = input.buyerLetterhead?.address?.trim() || "";
  const regNumber = input.buyerLetterhead?.businessRegistrationNumber?.trim() || "";

  if (!companyName) {
    throw new Error("Validation Error: Buyer letterhead company/organization name is required.");
  }
  if (!address) {
    throw new Error("Validation Error: Buyer letterhead business address is required.");
  }
  if (!regNumber) {
    throw new Error("Validation Error: Business registration number is required on the letterhead.");
  }

  const logoUrl = assertSafeHttpsUrl(input.buyerLetterhead?.logoUrl, "Letterhead logo URL");
  const signatureImageUrl = assertSafeHttpsUrl(
    input.buyerSignature?.signatureImageUrl,
    "Buyer signature image URL"
  );

  const signerName = input.buyerSignature?.signerName?.trim() || "";
  if (!signerName) {
    throw new Error("Validation Error: Buyer authorized signer name is required.");
  }

  const listingRef = firebaseAdminDb
    .collection(PO_COLLECTIONS.MARKETPLACE_LISTINGS)
    .doc(listingId);
  const listingSnap = await listingRef.get();

  if (!listingSnap.exists) {
    throw new Error(`Lookup Error: Marketplace listing "${listingId}" does not exist.`);
  }

  const listing = listingSnap.data() as MarketplaceListing;

  if (listing.sellerHolderId === buyerUid || listing.createdByUid === buyerUid) {
    throw new Error("Authorization Error: Sellers cannot create a purchase order on their own listing.");
  }

  if (listing.listingStatus === "sold" || listing.listingStatus === "cancelled" || listing.listingStatus === "expired") {
    throw new Error(`State Error: Listing is "${listing.listingStatus}" and no longer open for purchase orders.`);
  }

  // Strictly enforce paid seller info prerequisite!
  const accessCheck = await hasPaidSellerInfoAccess(buyerUid, listing.sellerHolderId, listingId);
  if (!accessCheck.hasAccess) {
    throw new Error(
      "Authorization Error: You must pay for seller information access before generating a purchase order."
    );
  }

  // Verify buyer is specifically authorized on THIS listing:
  // Either they paid for this exact listing, OR the seller confirmed their "Start Trade" request on it.
  const listingAccessSnap = await firebaseAdminDb
    .collection(PO_COLLECTIONS.SELLER_ACCESS_RECORDS)
    .where("listingId", "==", listingId)
    .get();

  const listingAccessRecords = listingAccessSnap.docs.map(
    (d) => d.data() as { buyerId?: string; buyerUid?: string; accessStatus?: string; status?: string; accessType?: string }
  );

  const buyerDirectRecord = listingAccessRecords.find(
    (r) =>
      (r.buyerUid === buyerUid || r.buyerId === buyerUid) &&
      r.accessStatus !== "revoked" &&
      r.status !== "revoked" &&
      r.accessStatus !== "declined" &&
      r.accessStatus !== "deal_fell_through"
  );

  const hasDirectListingAuth =
    Boolean(buyerDirectRecord) &&
    buyerDirectRecord?.accessStatus !== "pending_seller_confirmation";

  if (!hasDirectListingAuth) {
    if (buyerDirectRecord?.accessStatus === "pending_seller_confirmation") {
      throw new Error(
        "Authorization Error: Your trade request for this listing is still awaiting seller confirmation before you can create a Purchase Order."
      );
    }
    throw new Error(
      "Authorization Error: Please click 'Start Trade' on this listing and wait for the seller to confirm before generating a Purchase Order."
    );
  }

  if (qty > listing.quantityAvailableKg) {
    throw new Error(
      `Validation Error: Agreed quantity (${qty} kg) exceeds available listing quantity (${listing.quantityAvailableKg} kg).`
    );
  }

  // Validate transfer route if certified
  const validBuyerHolderType: CertificateHolderType = (
    input.buyerHolderType || "cooperative"
  ).trim() as CertificateHolderType;

  const sellerContact = await resolveSellerContactSnapshot(listing);

  const now = new Date().toISOString();
  const poNumber = generateDocumentNumber("PO");
  const poId = `po_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const purchasePrice = round2(qty * unitPrice);

  const purchaseOrder: PurchaseOrder = {
    poId,
    poNumber,
    listingId: listing.listingId,
    listingNumber: listing.listingNumber,
    listingTitle: listing.title,
    lotId: listing.lotId,
    certificateId: listing.certificateId,
    sourceHoldingId: listing.sourceHoldingId,
    certificationType: listing.certificationType,
    qualityGrade: listing.qualityGrade,

    buyerId: buyerUid,
    buyerName: input.buyerName?.trim() || companyName,
    buyerEmail: input.buyerEmail?.trim() || undefined,
    buyerHolderType: validBuyerHolderType,

    sellerId: listing.sellerHolderId,
    sellerHolderType: listing.sellerHolderType,
    sellerContactName: sellerContact.contactName,
    sellerContactPhone: sellerContact.phone,
    sellerContactEmail: sellerContact.email,
    sellerLocation: sellerContact.location,

    quantityKg: qty,
    unitPricePerKg: unitPrice,
    purchasePrice,
    currency: (listing.currency || "XAF").toUpperCase(),

    buyerLetterhead: {
      companyName,
      address,
      businessRegistrationNumber: regNumber,
      logoUrl,
      logoPublicId: input.buyerLetterhead?.logoPublicId,
    },
    buyerSignature: {
      signerName,
      signerTitle: input.buyerSignature?.signerTitle?.trim() || undefined,
      signatureImageUrl,
      signaturePublicId: input.buyerSignature?.signaturePublicId,
      signedAt: now,
    },
    notes: input.notes?.trim() || undefined,
    status: "po_submitted",
    createdAt: now,
    updatedAt: now,
  };

  await firebaseAdminDb.runTransaction(async (tx) => {
    const freshListingSnap = await tx.get(listingRef);
    if (!freshListingSnap.exists) {
      throw new Error(`Lookup Error: Listing "${listingId}" does not exist.`);
    }
    const freshListing = freshListingSnap.data() as MarketplaceListing;
    if (qty > freshListing.quantityAvailableKg) {
      throw new Error(
        `Validation Error: Agreed quantity (${qty} kg) exceeds available quantity (${freshListing.quantityAvailableKg} kg).`
      );
    }

    const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);
    tx.set(poRef, cleanData(purchaseOrder));

    if (freshListing.listingStatus === "available") {
      tx.update(listingRef, {
        listingStatus: "under_negotiation",
        updatedAt: now,
      });
    }
  });

  return purchaseOrder;
}

// ============================================================================
// 3. STAGE 2: SELLER VIEWS, SIGNS & CONFIRMS PO -> AUTO-GENERATES INVOICE
// ============================================================================

export interface ConfirmPurchaseOrderInput {
  poId: string;
  sellerUid: string;
  sellerSignature: Omit<TradePartySignature, "signedAt">;
  sellerNotes?: string;
  sellerBankInstructions?: string;
}

export async function confirmPurchaseOrderBySeller(
  input: ConfirmPurchaseOrderInput
): Promise<{ purchaseOrder: PurchaseOrder; invoice: TradeInvoice }> {
  const poId = input.poId.trim();
  const sellerUid = input.sellerUid.trim();
  const signerName = input.sellerSignature?.signerName?.trim() || "";

  if (!signerName) {
    throw new Error("Validation Error: Seller authorized signer name is required.");
  }

  const signatureImageUrl = assertSafeHttpsUrl(
    input.sellerSignature?.signatureImageUrl,
    "Seller signature image URL"
  );

  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) {
      throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
    }
    const po = poSnap.data() as PurchaseOrder;

    if (po.sellerId !== sellerUid) {
      throw new Error("Authorization Error: Only the listing seller can sign and confirm this Purchase Order.");
    }

    if (po.status !== "po_submitted") {
      throw new Error(
        `State Error: Purchase Order is already in "${po.status}" status and cannot be confirmed again.`
      );
    }

    const now = new Date().toISOString();
    const invoiceNumber = generateDocumentNumber("INV");
    const invoiceId = `inv_${po.poId}`;
    const invoiceRef = firebaseAdminDb.collection(PO_COLLECTIONS.TRADE_INVOICES).doc(invoiceId);

    const onPlatformServiceFeeAmount = round2(
      po.purchasePrice * (ON_PLATFORM_SERVICE_FEE_PERCENT / 100)
    );
    const onPlatformTotalAmount = round2(po.purchasePrice + onPlatformServiceFeeAmount);
    const offPlatformTransferFeeAmount = round2(
      po.purchasePrice * (OFF_PLATFORM_TRANSFER_FEE_PERCENT / 100)
    );

    const invoice: TradeInvoice = {
      invoiceId,
      invoiceNumber,
      poId: po.poId,
      poNumber: po.poNumber,
      listingId: po.listingId,
      listingNumber: po.listingNumber,
      listingTitle: po.listingTitle,
      lotId: po.lotId,
      certificateId: po.certificateId,
      certificationType: po.certificationType,

      buyerId: po.buyerId,
      buyerCompanyName: po.buyerLetterhead.companyName,
      buyerAddress: po.buyerLetterhead.address,
      buyerRegistrationNumber: po.buyerLetterhead.businessRegistrationNumber,
      sellerId: po.sellerId,
      sellerContactName: po.sellerContactName,
      sellerLocation: po.sellerLocation,

      quantityKg: po.quantityKg,
      unitPricePerKg: po.unitPricePerKg,
      purchasePrice: po.purchasePrice,
      currency: po.currency,

      onPlatformServiceFeePercent: ON_PLATFORM_SERVICE_FEE_PERCENT,
      onPlatformServiceFeeAmount,
      onPlatformTotalAmount,
      offPlatformTransferFeePercent: OFF_PLATFORM_TRANSFER_FEE_PERCENT,
      offPlatformTransferFeeAmount,

      status: "awaiting_payment_choice",
      issuedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const sellerSignature: TradePartySignature = {
      signerName,
      signerTitle: input.sellerSignature?.signerTitle?.trim() || undefined,
      signatureImageUrl,
      signaturePublicId: input.sellerSignature?.signaturePublicId,
      signedAt: now,
    };

    const updatedPo: PurchaseOrder = {
      ...po,
      sellerSignature,
      sellerNotes: input.sellerNotes?.trim() || po.sellerNotes,
      sellerBankInstructions: input.sellerBankInstructions?.trim() || po.sellerBankInstructions,
      sellerConfirmedAt: now,
      invoiceId,
      invoiceNumber,
      status: "invoice_issued",
      updatedAt: now,
    };

    tx.set(invoiceRef, cleanData(invoice));
    tx.set(poRef, cleanData(updatedPo));

    return { purchaseOrder: updatedPo, invoice };
  });
}

// ============================================================================
// 4. STAGE 3A: ON-PLATFORM PAYMENT (1.5% SERVICE FEE — ESCROW OR DIRECT SPLIT)
// ============================================================================

export async function initiateOnPlatformInvoicePayment(input: {
  poId: string;
  buyerUid: string;
  onPlatformMode: OnPlatformPaymentMode;
  customerEmail?: string;
  customerName?: string;
}): Promise<{
  checkoutUrl: string;
  paymentReference: string;
  amountChargedNgn: number;
  serviceFeeAmount: number;
  totalAmountOriginal: number;
  currency: string;
  onPlatformMode: OnPlatformPaymentMode;
}> {
  const poId = input.poId.trim();
  const buyerUid = input.buyerUid.trim();
  const mode = input.onPlatformMode;

  if (mode !== "platform_escrow" && mode !== "direct_split") {
    throw new Error("Validation Error: Select either platform_escrow or direct_split mode.");
  }

  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);
  const poSnap = await poRef.get();
  if (!poSnap.exists) {
    throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
  }
  const po = poSnap.data() as PurchaseOrder;

  if (po.buyerId !== buyerUid) {
    throw new Error("Authorization Error: Only the buyer on this Purchase Order can pay the invoice.");
  }
  if (po.status !== "invoice_issued" || !po.invoiceId) {
    throw new Error(`State Error: Invoice is not awaiting payment (current PO status: ${po.status}).`);
  }

  const invoiceRef = firebaseAdminDb.collection(PO_COLLECTIONS.TRADE_INVOICES).doc(po.invoiceId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) {
    throw new Error("Lookup Error: Associated invoice was not found.");
  }
  const invoice = invoiceSnap.data() as TradeInvoice;

  const serviceFeeAmount = round2(po.purchasePrice * (ON_PLATFORM_SERVICE_FEE_PERCENT / 100));
  const totalAmountOriginal = round2(po.purchasePrice + serviceFeeAmount);

  const exchangeRate = await getNgnExchangeRate(po.currency);
  const totalNgnExact = totalAmountOriginal * exchangeRate.rate;
  const amountChargedNgn = Math.max(1, Math.ceil(totalNgnExact));
  const platformFeeNgn = Math.max(1, Math.ceil(serviceFeeAmount * exchangeRate.rate));

  const redirectUrl = getValidatedCallbackUrl();
  const paymentReference = generateTxRef("PAY-INV");
  const nowIso = new Date().toISOString();

  // Check if seller has a Flutterwave subaccount for automatic direct split
  let sellerSubaccountId: string | undefined;
  if (mode === "direct_split") {
    try {
      const sellerUserSnap = await firebaseAdminDb.collection("users").doc(po.sellerId).get();
      if (sellerUserSnap.exists) {
        const sData = sellerUserSnap.data() || {};
        if (typeof sData.flutterwaveSubaccountId === "string" && sData.flutterwaveSubaccountId.trim()) {
          sellerSubaccountId = sData.flutterwaveSubaccountId.trim();
        }
      }
    } catch {
      // Optional subaccount lookup
    }
    if (!sellerSubaccountId && process.env.FLUTTERWAVE_DEFAULT_SELLER_SUBACCOUNT_ID?.trim()) {
      sellerSubaccountId = process.env.FLUTTERWAVE_DEFAULT_SELLER_SUBACCOUNT_ID.trim();
    }
  }

  const paymentRecord: PaymentRecord & {
    poId: string;
    invoiceId: string;
    onPlatformMode: OnPlatformPaymentMode;
    basePurchasePriceOriginal: number;
    serviceFeeOriginal: number;
    totalAmountOriginal: number;
    originalCurrency: string;
  } = {
    paymentId: paymentReference,
    paymentReference,
    listingId: po.listingId,
    lotId: po.lotId,
    poId: po.poId,
    invoiceId: invoice.invoiceId,
    buyerUid,
    payerId: buyerUid,
    payeeId: mode === "platform_escrow" ? "platform_escrow" : po.sellerId,
    sellerId: po.sellerId,
    paymentPurpose: "TRADE_INVOICE_ON_PLATFORM",
    paymentGateway: "FLUTTERWAVE",
    paymentType: "marketplace_purchase",
    paymentMethod: "FLUTTERWAVE",
    onPlatformMode: mode,
    currency: "NGN",
    amount: amountChargedNgn,
    amountCharged: amountChargedNgn,
    feePercentage: ON_PLATFORM_SERVICE_FEE_PERCENT / 100,
    basePurchasePriceOriginal: po.purchasePrice,
    serviceFeeOriginal: serviceFeeAmount,
    totalAmountOriginal,
    originalCurrency: po.currency,
    exchangeRateToNgnSnapshot: exchangeRate.rate,
    exchangeRateTimestampSnapshot: exchangeRate.rateTimestamp,
    exchangeRateProviderSnapshot: exchangeRate.provider,
    paymentStatus: "initiating",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const paymentRef = firebaseAdminDb.collection(PO_COLLECTIONS.PAYMENTS).doc(paymentReference);
  await paymentRef.set(cleanData(paymentRecord));

  const gatewayResult = await createFlutterwaveStandardPayment({
    tx_ref: paymentReference,
    amount: amountChargedNgn,
    currency: "NGN",
    redirect_url: redirectUrl,
    customer: {
      email: input.customerEmail || po.buyerEmail || `${buyerUid}@buyer.tracetradenetwork.com`,
      name: input.customerName || po.buyerLetterhead.companyName,
    },
    customizations: {
      title:
        mode === "platform_escrow"
          ? `TraceTradeNetwork Escrow — ${invoice.invoiceNumber}`
          : `TraceTradeNetwork Direct Split — ${invoice.invoiceNumber}`,
      description: `Cocoa Purchase ${po.quantityKg} kg (${po.poNumber}) incl. 1.5% platform service fee`,
    },
    ...(mode === "direct_split" && sellerSubaccountId
      ? {
          subaccounts: [
            {
              id: sellerSubaccountId,
              transaction_charge_type: "flat_subaccount",
              transaction_charge: platformFeeNgn,
            },
          ],
        }
      : {}),
    meta: {
      paymentPurpose: "TRADE_INVOICE_ON_PLATFORM",
      poId: po.poId,
      invoiceId: invoice.invoiceId,
      listingId: po.listingId,
      buyerUid,
      sellerId: po.sellerId,
      onPlatformMode: mode,
    },
  });

  if (gatewayResult.outcome !== "SUCCESS") {
    await paymentRef.update({
      paymentStatus:
        gatewayResult.outcome === "DEFINITIVE_FAILURE"
          ? "checkout_creation_failed"
          : "checkout_creation_uncertain",
      statusReason: gatewayResult.message,
      updatedAt: new Date().toISOString(),
    });
    throw new Error(`Flutterwave Checkout Error: ${gatewayResult.message}`);
  }

  const updatedIso = new Date().toISOString();
  await Promise.all([
    paymentRef.update({
      paymentStatus: "pending",
      checkoutUrl: gatewayResult.checkoutUrl,
      gatewayTransactionId: gatewayResult.gatewayTransactionId || null,
      flw_ref: gatewayResult.flw_ref || null,
      updatedAt: updatedIso,
    }),
    invoiceRef.update({
      chosenPaymentChannel: "on_platform",
      onPlatformMode: mode,
      status: "on_platform_pending",
      updatedAt: updatedIso,
    }),
  ]);

  return {
    checkoutUrl: gatewayResult.checkoutUrl,
    paymentReference,
    amountChargedNgn,
    serviceFeeAmount,
    totalAmountOriginal,
    currency: po.currency,
    onPlatformMode: mode,
  };
}

export async function verifyAndFinalizeOnPlatformInvoicePayment(
  paymentReference: string,
  authenticatedBuyerUid: string
): Promise<{
  success: boolean;
  paymentStatus: PaymentRecord["paymentStatus"];
  paymentRecord: PaymentRecord;
  poId?: string;
  invoiceNumber?: string;
  deliveryNoteNumber?: string;
  statusReason?: string;
}> {
  const cleanRef = paymentReference.trim();
  const buyerUid = authenticatedBuyerUid.trim();
  const paymentRef = firebaseAdminDb.collection(PO_COLLECTIONS.PAYMENTS).doc(cleanRef);

  const initialSnap = await paymentRef.get();
  if (!initialSnap.exists) {
    throw new Error(`Lookup Error: Payment "${cleanRef}" not found.`);
  }
  const initialPayment = initialSnap.data() as any;

  if (initialPayment.buyerUid !== buyerUid) {
    throw new Error("Authorization Error: You cannot verify another buyer's payment.");
  }

  const poId = String(initialPayment.poId || "").trim();
  if (!poId) {
    throw new Error("Security Error: Payment record is missing Purchase Order reference.");
  }

  if (initialPayment.paymentStatus === "completed") {
    const poSnap = await firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId).get();
    const po = poSnap.exists ? (poSnap.data() as PurchaseOrder) : null;
    return {
      success: true,
      paymentStatus: "completed",
      paymentRecord: initialPayment,
      poId,
      invoiceNumber: po?.invoiceNumber,
      deliveryNoteNumber: po?.deliveryNoteNumber,
    };
  }

  const rec = await verifyFlutterwaveTransactionByReference(cleanRef);
  const nowIso = new Date().toISOString();

  if (rec.status === "FAILED") {
    await paymentRef.update({
      paymentStatus: "failed",
      statusReason: rec.errorMessage || "Flutterwave confirmed payment failed.",
      gatewayTransactionId: rec.gatewayTransactionId || null,
      flw_ref: rec.flw_ref || null,
      updatedAt: nowIso,
    });
    return {
      success: false,
      paymentStatus: "failed",
      paymentRecord: { ...initialPayment, paymentStatus: "failed" },
      poId,
      statusReason: rec.errorMessage || "Payment failed at gateway.",
    };
  }

  if (rec.status !== "SUCCESSFUL") {
    return {
      success: false,
      paymentStatus: "pending",
      paymentRecord: initialPayment,
      poId,
      statusReason: rec.errorMessage || "Payment is still pending confirmation at Flutterwave.",
    };
  }

  const expectedAmount = Number(initialPayment.amountCharged ?? initialPayment.amount ?? 0);
  if (rec.currency !== "NGN" || rec.amount !== expectedAmount) {
    await paymentRef.update({
      paymentStatus: "amount_mismatch",
      statusReason: `Expected ${expectedAmount} NGN, verified ${rec.amount} ${rec.currency}.`,
      gatewayTransactionId: rec.gatewayTransactionId || null,
      flw_ref: rec.flw_ref || null,
      updatedAt: nowIso,
    });
    return {
      success: false,
      paymentStatus: "amount_mismatch",
      paymentRecord: { ...initialPayment, paymentStatus: "amount_mismatch" },
      poId,
      statusReason: "Verified payment amount or currency did not match invoice total.",
    };
  }

  // Prefetch PO & source holding QRs outside transaction
  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);
  const prePoSnap = await poRef.get();
  if (!prePoSnap.exists) {
    throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
  }
  const prePo = prePoSnap.data() as PurchaseOrder;
  let preSourceQRs: QRCode[] = [];
  if (prePo.certificationType === "certified" && prePo.sourceHoldingId) {
    const qrSnap = await firebaseAdminDb
      .collection(PO_COLLECTIONS.QR_CODES)
      .where("currentHoldingId", "==", prePo.sourceHoldingId)
      .get();
    preSourceQRs = qrSnap.docs.map((d) => d.data() as QRCode);
  }

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const listingRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.MARKETPLACE_LISTINGS)
      .doc(prePo.listingId);
    const invoiceRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.TRADE_INVOICES)
      .doc(prePo.invoiceId || `inv_${poId}`);
    const sourceHoldingRef =
      prePo.certificationType === "certified" && prePo.sourceHoldingId
        ? firebaseAdminDb
            .collection(PO_COLLECTIONS.CERTIFICATE_HOLDINGS)
            .doc(prePo.sourceHoldingId)
        : null;

    const [paySnap, poSnap, listingSnap, invoiceSnap, sourceHoldingSnap] = await Promise.all([
      tx.get(paymentRef),
      tx.get(poRef),
      tx.get(listingRef),
      tx.get(invoiceRef),
      sourceHoldingRef ? tx.get(sourceHoldingRef) : Promise.resolve(null),
    ]);

    const currentPay = paySnap.data() as any;
    const po = poSnap.data() as PurchaseOrder;
    if (currentPay.paymentStatus === "completed") {
      return {
        success: true,
        paymentStatus: "completed" as const,
        paymentRecord: currentPay,
        poId: po.poId,
        invoiceNumber: po.invoiceNumber,
        deliveryNoteNumber: po.deliveryNoteNumber,
      };
    }

    if (!listingSnap.exists) {
      throw new Error(`Lookup Error: Listing "${po.listingId}" not found.`);
    }
    const listing = listingSnap.data() as MarketplaceListing;
    const invoice = invoiceSnap.exists ? (invoiceSnap.data() as TradeInvoice) : null;
    const sourceHolding =
      sourceHoldingSnap && sourceHoldingSnap.exists
        ? (sourceHoldingSnap.data() as CertificateHolding)
        : null;

    const tradeId = `trade_${po.poId}`;
    const tradeNumber = generateTradeNumber();
    const transferId = `trans_${po.poId}`;
    const deliveryNoteId = `dn_${po.poId}`;
    const deliveryNoteNumber = generateDocumentNumber("DN");

    const serviceFeeAmount = round2(po.purchasePrice * (ON_PLATFORM_SERVICE_FEE_PERCENT / 100));
    const totalPaidOriginal = round2(po.purchasePrice + serviceFeeAmount);
    const onPlatformMode: OnPlatformPaymentMode =
      currentPay.onPlatformMode === "direct_split" ? "direct_split" : "platform_escrow";

    const platformFeeRecord: AppliedFeeRecord = {
      feeId: `fee_plat_${tradeId}`,
      feeType: "marketplace_platform_fee",
      payerId: buyerUid,
      ratePercentage: ON_PLATFORM_SERVICE_FEE_PERCENT,
      calculatedAmount: serviceFeeAmount,
      currency: po.currency,
      isFeeExempt: false,
      policyStatus: "APPLIED",
      feeStatus: "paid",
      policyNotes:
        onPlatformMode === "platform_escrow"
          ? "1.5% on-platform service fee (Platform Escrow with refund protection)"
          : "1.5% on-platform service fee (Direct to Seller with automated service fee split)",
      assessedAt: nowIso,
    };

    // 1. Automatic Certificate Transfer
    const custodyResult = await executeCustodyTransferInAdminTx({
      tx,
      po,
      listing,
      transferId,
      tradeId,
      feeRecord: platformFeeRecord,
      actorUid: buyerUid,
      sourceHolding,
      sourceQRs: preSourceQRs,
      now: nowIso,
    });

    // 2. Trade Record (in_delivery until buyer confirms receipt)
    const tradeRecord: TradeRecord = {
      tradeId,
      tradeNumber,
      listingId: listing.listingId,
      certificationType: listing.certificationType,
      lotId: listing.lotId,
      certificateId: listing.certificateId,
      sourceHoldingId: listing.sourceHoldingId,
      destHoldingId: custodyResult.destHoldingId,
      sellerId: listing.sellerHolderId,
      sellerHolderId: listing.sellerHolderId,
      sellerHolderType: listing.sellerHolderType,
      buyerId: po.buyerId,
      buyerHolderType: po.buyerHolderType,
      quantityKg: po.quantityKg,
      negotiatedPricePerKg: po.unitPricePerKg,
      totalAmount: po.purchasePrice,
      currency: po.currency,
      paymentChannel: "on_platform",
      paymentReference: cleanRef,
      tradeStatus: "confirmed",
      requiresBuyerConfirmation: false,
      buyerConfirmed: false,
      platformFeeApplied: platformFeeRecord,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      notes: `On-platform (${onPlatformMode === "platform_escrow" ? "Platform Escrow" : "Direct Split"}) via PO ${po.poNumber}`,
      tradeDate: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // 3. Delivery Note Initialization
    const deliveryNote: DeliveryNote = {
      deliveryNoteId,
      deliveryNoteNumber,
      poId: po.poId,
      poNumber: po.poNumber,
      invoiceId: invoice?.invoiceId || `inv_${po.poId}`,
      invoiceNumber: invoice?.invoiceNumber || po.invoiceNumber || "",
      tradeId,
      tradeNumber,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      listingId: listing.listingId,
      listingTitle: listing.title,
      lotId: listing.lotId,
      certificateId: listing.certificateId,
      qualityGrade: listing.qualityGrade,
      buyerId: po.buyerId,
      buyerCompanyName: po.buyerLetterhead.companyName,
      buyerAddress: po.buyerLetterhead.address,
      sellerId: po.sellerId,
      sellerContactName: po.sellerContactName,
      sellerLocation: po.sellerLocation,
      quantityKg: po.quantityKg,
      status: "in_transit",
      initializedBy: "platform_auto",
      initializedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedPayment: PaymentRecord = {
      ...currentPay,
      tradeId,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      paymentStatus: "completed",
      gatewayTransactionId: rec.gatewayTransactionId || currentPay.gatewayTransactionId,
      flw_ref: rec.flw_ref || currentPay.flw_ref,
      paidAt: nowIso,
      completedAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(paymentRef, cleanData(updatedPayment));
    tx.set(firebaseAdminDb.collection(PO_COLLECTIONS.TRADES).doc(tradeId), cleanData(tradeRecord));
    tx.set(
      firebaseAdminDb.collection(PO_COLLECTIONS.DELIVERY_NOTES).doc(deliveryNoteId),
      cleanData(deliveryNote)
    );

    if (invoice) {
      tx.update(
        invoiceRef,
        cleanData({
          status: "paid",
          chosenPaymentChannel: "on_platform",
          onPlatformMode,
          paymentReference: cleanRef,
          paidAmount: totalPaidOriginal,
          paidAt: nowIso,
          updatedAt: nowIso,
        })
      );
    }

    tx.update(
      poRef,
      cleanData({
        status: "delivery_initialized",
        paymentChannel: "on_platform",
        onPlatformMode,
        onPlatformPaymentId: cleanRef,
        onPlatformPaymentReference: cleanRef,
        onPlatformServiceFeeAmount: serviceFeeAmount,
        onPlatformTotalPaid: totalPaidOriginal,
        onPlatformPaidAt: nowIso,
        transferId: listing.certificationType === "certified" ? transferId : undefined,
        destHoldingId: custodyResult.destHoldingId,
        tradeId,
        tradeNumber,
        deliveryNoteId,
        deliveryNoteNumber,
        transferInitializedAt: nowIso,
        transferCompletedAt: nowIso,
        updatedAt: nowIso,
      })
    );

    return {
      success: true,
      paymentStatus: "completed" as const,
      paymentRecord: updatedPayment,
      poId: po.poId,
      invoiceNumber: invoice?.invoiceNumber || po.invoiceNumber,
      deliveryNoteNumber,
    };
  });
}

// ============================================================================
// 5. STAGE 3B (OFF-PLATFORM): BUYER UPLOADS RECEIPT & MARKS AS PAID
// ============================================================================

export async function markOffPlatformPaymentByBuyer(input: {
  poId: string;
  buyerUid: string;
  receiptUrl: string;
  receiptPublicId?: string;
  fileName?: string;
  mimeType?: string;
  paymentReferenceNote?: string;
  paymentMethodNote?: string;
}): Promise<{ purchaseOrder: PurchaseOrder; invoice: TradeInvoice | null }> {
  const poId = input.poId.trim();
  const buyerUid = input.buyerUid.trim();
  const receiptUrl = assertSafeHttpsUrl(input.receiptUrl, "Payment receipt URL");

  if (!receiptUrl) {
    throw new Error("Validation Error: Please upload your off-platform payment receipt.");
  }

  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) {
      throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
    }
    const po = poSnap.data() as PurchaseOrder;

    if (po.buyerId !== buyerUid) {
      throw new Error("Authorization Error: Only the buyer can upload a payment receipt for this order.");
    }
    if (po.status !== "invoice_issued") {
      throw new Error(
        `State Error: Cannot submit off-platform payment receipt when PO is in "${po.status}" status.`
      );
    }

    const invoiceRef = po.invoiceId
      ? firebaseAdminDb.collection(PO_COLLECTIONS.TRADE_INVOICES).doc(po.invoiceId)
      : null;
    const invoiceSnap = invoiceRef ? await tx.get(invoiceRef) : null;
    const invoice = invoiceSnap && invoiceSnap.exists ? (invoiceSnap.data() as TradeInvoice) : null;

    const now = new Date().toISOString();

    const offPlatformReceipt = {
      receiptUrl,
      receiptPublicId: input.receiptPublicId,
      fileName: input.fileName?.trim() || "payment-receipt",
      mimeType: input.mimeType?.trim() || undefined,
      paymentReferenceNote: input.paymentReferenceNote?.trim() || undefined,
      paymentMethodNote: input.paymentMethodNote?.trim() || "Bank Transfer / Off-Platform",
      uploadedAt: now,
      uploadedBy: buyerUid,
    };

    const updatedPo: PurchaseOrder = {
      ...po,
      paymentChannel: "off_platform",
      offPlatformReceipt,
      status: "off_platform_paid_pending_seller",
      updatedAt: now,
    };

    tx.set(poRef, cleanData(updatedPo));

    let updatedInvoice: TradeInvoice | null = invoice;
    if (invoice && invoiceRef) {
      updatedInvoice = {
        ...invoice,
        chosenPaymentChannel: "off_platform",
        status: "off_platform_receipt_uploaded",
        paymentReference: offPlatformReceipt.paymentReferenceNote || "OFF-PLATFORM-RECEIPT",
        updatedAt: now,
      };
      tx.set(invoiceRef, cleanData(updatedInvoice));
    }

    return { purchaseOrder: updatedPo, invoice: updatedInvoice };
  });
}

// ============================================================================
// 6. STAGE 3B (OFF-PLATFORM): SELLER CONFIRMS PAYMENT & INITIALIZES TRANSFER + DELIVERY NOTE
// ============================================================================

export async function confirmOffPlatformPaymentBySeller(input: {
  poId: string;
  sellerUid: string;
  deliveryNotes?: string;
}): Promise<{
  purchaseOrder: PurchaseOrder;
  invoice: TradeInvoice | null;
  deliveryNote: DeliveryNote;
}> {
  const poId = input.poId.trim();
  const sellerUid = input.sellerUid.trim();
  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) {
      throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
    }
    const po = poSnap.data() as PurchaseOrder;

    if (po.sellerId !== sellerUid) {
      throw new Error(
        "Authorization Error: Only the seller can confirm off-platform payment and initialize transfer."
      );
    }
    if (po.status !== "off_platform_paid_pending_seller") {
      throw new Error(
        `State Error: Order is in "${po.status}" status and not awaiting seller payment confirmation.`
      );
    }

    const invoiceRef = po.invoiceId
      ? firebaseAdminDb.collection(PO_COLLECTIONS.TRADE_INVOICES).doc(po.invoiceId)
      : null;
    const invoiceSnap = invoiceRef ? await tx.get(invoiceRef) : null;
    const invoice = invoiceSnap && invoiceSnap.exists ? (invoiceSnap.data() as TradeInvoice) : null;

    const now = new Date().toISOString();
    const transferId = `trans_${po.poId}`;
    const deliveryNoteId = `dn_${po.poId}`;
    const deliveryNoteNumber = generateDocumentNumber("DN");
    const transferFeeAmount = round2(po.purchasePrice * (OFF_PLATFORM_TRANSFER_FEE_PERCENT / 100));

    const deliveryNote: DeliveryNote = {
      deliveryNoteId,
      deliveryNoteNumber,
      poId: po.poId,
      poNumber: po.poNumber,
      invoiceId: invoice?.invoiceId || po.invoiceId || `inv_${po.poId}`,
      invoiceNumber: invoice?.invoiceNumber || po.invoiceNumber || "",
      transferId,
      listingId: po.listingId,
      listingTitle: po.listingTitle,
      lotId: po.lotId,
      certificateId: po.certificateId,
      qualityGrade: po.qualityGrade,
      buyerId: po.buyerId,
      buyerCompanyName: po.buyerLetterhead.companyName,
      buyerAddress: po.buyerLetterhead.address,
      sellerId: po.sellerId,
      sellerContactName: po.sellerContactName,
      sellerLocation: po.sellerLocation,
      quantityKg: po.quantityKg,
      status: "awaiting_transfer_fee",
      deliveryNotes: input.deliveryNotes?.trim() || undefined,
      initializedBy: sellerUid,
      initializedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const updatedPo: PurchaseOrder = {
      ...po,
      offPlatformReceipt: po.offPlatformReceipt
        ? {
            ...po.offPlatformReceipt,
            confirmedBySellerAt: now,
            confirmedBySellerUid: sellerUid,
          }
        : undefined,
      transferId,
      transferFeeAmount,
      deliveryNoteId,
      deliveryNoteNumber,
      transferInitializedAt: now,
      status: "transfer_fee_pending",
      updatedAt: now,
    };

    tx.set(
      firebaseAdminDb.collection(PO_COLLECTIONS.DELIVERY_NOTES).doc(deliveryNoteId),
      cleanData(deliveryNote)
    );
    tx.set(poRef, cleanData(updatedPo));

    let updatedInvoice: TradeInvoice | null = invoice;
    if (invoice && invoiceRef) {
      updatedInvoice = {
        ...invoice,
        status: "paid",
        paidAmount: po.purchasePrice,
        paidAt: now,
        updatedAt: now,
      };
      tx.set(invoiceRef, cleanData(updatedInvoice));
    }

    return { purchaseOrder: updatedPo, invoice: updatedInvoice, deliveryNote };
  });
}

// ============================================================================
// 7. STAGE 3B (OFF-PLATFORM): BUYER PAYS 0.5% CERTIFICATE TRANSFER FEE
// ============================================================================

export async function initiateOffPlatformTransferFeePayment(input: {
  poId: string;
  buyerUid: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<{
  checkoutUrl: string;
  paymentReference: string;
  amountChargedNgn: number;
  transferFeeOriginal: number;
  currency: string;
}> {
  const poId = input.poId.trim();
  const buyerUid = input.buyerUid.trim();
  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);
  const poSnap = await poRef.get();

  if (!poSnap.exists) {
    throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
  }
  const po = poSnap.data() as PurchaseOrder;

  if (po.buyerId !== buyerUid) {
    throw new Error("Authorization Error: Only the buyer can pay the 0.5% certificate transfer fee.");
  }
  if (po.status !== "transfer_fee_pending") {
    throw new Error(
      `State Error: Certificate transfer fee is not pending (current status: ${po.status}).`
    );
  }

  const transferFeeOriginal = round2(po.purchasePrice * (OFF_PLATFORM_TRANSFER_FEE_PERCENT / 100));
  const exchangeRate = await getNgnExchangeRate(po.currency);
  const amountChargedNgn = Math.max(1, Math.ceil(transferFeeOriginal * exchangeRate.rate));
  const redirectUrl = getValidatedCallbackUrl();
  const paymentReference = generateTxRef("PAY-TRF");
  const nowIso = new Date().toISOString();

  const paymentRecord = {
    paymentId: paymentReference,
    paymentReference,
    listingId: po.listingId,
    lotId: po.lotId,
    poId: po.poId,
    invoiceId: po.invoiceId,
    transferId: po.transferId,
    buyerUid,
    payerId: buyerUid,
    payeeId: "platform",
    sellerId: po.sellerId,
    paymentPurpose: "OFF_PLATFORM_TRANSFER_FEE",
    paymentGateway: "FLUTTERWAVE",
    paymentType: "certificate_transfer_fee",
    paymentMethod: "FLUTTERWAVE",
    currency: "NGN",
    amount: amountChargedNgn,
    amountCharged: amountChargedNgn,
    feePercentage: OFF_PLATFORM_TRANSFER_FEE_PERCENT / 100,
    transferFeeOriginal,
    originalCurrency: po.currency,
    exchangeRateToNgnSnapshot: exchangeRate.rate,
    exchangeRateTimestampSnapshot: exchangeRate.rateTimestamp,
    exchangeRateProviderSnapshot: exchangeRate.provider,
    paymentStatus: "initiating",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const paymentRef = firebaseAdminDb.collection(PO_COLLECTIONS.PAYMENTS).doc(paymentReference);
  await paymentRef.set(cleanData(paymentRecord));

  const gatewayResult = await createFlutterwaveStandardPayment({
    tx_ref: paymentReference,
    amount: amountChargedNgn,
    currency: "NGN",
    redirect_url: redirectUrl,
    customer: {
      email: input.customerEmail || po.buyerEmail || `${buyerUid}@buyer.tracetradenetwork.com`,
      name: input.customerName || po.buyerLetterhead.companyName,
    },
    customizations: {
      title: `Certificate Transfer Fee (0.5%) — ${po.poNumber}`,
      description: `0.5% transfer fee for ${po.quantityKg} kg cocoa lot ${po.lotId}`,
    },
    meta: {
      paymentPurpose: "OFF_PLATFORM_TRANSFER_FEE",
      poId: po.poId,
      invoiceId: po.invoiceId,
      listingId: po.listingId,
      buyerUid,
    },
  });

  if (gatewayResult.outcome !== "SUCCESS") {
    await paymentRef.update({
      paymentStatus:
        gatewayResult.outcome === "DEFINITIVE_FAILURE"
          ? "checkout_creation_failed"
          : "checkout_creation_uncertain",
      statusReason: gatewayResult.message,
      updatedAt: new Date().toISOString(),
    });
    throw new Error(`Flutterwave Checkout Error: ${gatewayResult.message}`);
  }

  await paymentRef.update({
    paymentStatus: "pending",
    checkoutUrl: gatewayResult.checkoutUrl,
    gatewayTransactionId: gatewayResult.gatewayTransactionId || null,
    flw_ref: gatewayResult.flw_ref || null,
    updatedAt: new Date().toISOString(),
  });

  return {
    checkoutUrl: gatewayResult.checkoutUrl,
    paymentReference,
    amountChargedNgn,
    transferFeeOriginal,
    currency: po.currency,
  };
}

export async function verifyAndFinalizeOffPlatformTransferFeePayment(
  paymentReference: string,
  authenticatedBuyerUid: string
): Promise<{
  success: boolean;
  paymentStatus: PaymentRecord["paymentStatus"];
  paymentRecord: PaymentRecord;
  poId?: string;
  deliveryNoteNumber?: string;
  statusReason?: string;
}> {
  const cleanRef = paymentReference.trim();
  const buyerUid = authenticatedBuyerUid.trim();
  const paymentRef = firebaseAdminDb.collection(PO_COLLECTIONS.PAYMENTS).doc(cleanRef);

  const initialSnap = await paymentRef.get();
  if (!initialSnap.exists) {
    throw new Error(`Lookup Error: Payment "${cleanRef}" not found.`);
  }
  const initialPayment = initialSnap.data() as any;

  if (initialPayment.buyerUid !== buyerUid) {
    throw new Error("Authorization Error: You cannot verify another buyer's payment.");
  }

  const poId = String(initialPayment.poId || "").trim();
  if (!poId) {
    throw new Error("Security Error: Payment record is missing Purchase Order reference.");
  }

  if (initialPayment.paymentStatus === "completed") {
    const poSnap = await firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId).get();
    const po = poSnap.exists ? (poSnap.data() as PurchaseOrder) : null;
    return {
      success: true,
      paymentStatus: "completed",
      paymentRecord: initialPayment,
      poId,
      deliveryNoteNumber: po?.deliveryNoteNumber,
    };
  }

  const rec = await verifyFlutterwaveTransactionByReference(cleanRef);
  const nowIso = new Date().toISOString();

  if (rec.status === "FAILED") {
    await paymentRef.update({
      paymentStatus: "failed",
      statusReason: rec.errorMessage || "Flutterwave confirmed payment failed.",
      gatewayTransactionId: rec.gatewayTransactionId || null,
      flw_ref: rec.flw_ref || null,
      updatedAt: nowIso,
    });
    return {
      success: false,
      paymentStatus: "failed",
      paymentRecord: { ...initialPayment, paymentStatus: "failed" },
      poId,
      statusReason: rec.errorMessage || "Payment failed at gateway.",
    };
  }

  if (rec.status !== "SUCCESSFUL") {
    return {
      success: false,
      paymentStatus: "pending",
      paymentRecord: initialPayment,
      poId,
      statusReason: rec.errorMessage || "Transfer fee payment is still pending confirmation.",
    };
  }

  const expectedAmount = Number(initialPayment.amountCharged ?? initialPayment.amount ?? 0);
  if (rec.currency !== "NGN" || rec.amount !== expectedAmount) {
    await paymentRef.update({
      paymentStatus: "amount_mismatch",
      statusReason: `Expected ${expectedAmount} NGN, verified ${rec.amount} ${rec.currency}.`,
      gatewayTransactionId: rec.gatewayTransactionId || null,
      flw_ref: rec.flw_ref || null,
      updatedAt: nowIso,
    });
    return {
      success: false,
      paymentStatus: "amount_mismatch",
      paymentRecord: { ...initialPayment, paymentStatus: "amount_mismatch" },
      poId,
      statusReason: "Verified transfer fee amount did not match expected amount.",
    };
  }

  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);
  const prePoSnap = await poRef.get();
  if (!prePoSnap.exists) {
    throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
  }
  const prePo = prePoSnap.data() as PurchaseOrder;
  let preSourceQRs: QRCode[] = [];
  if (prePo.certificationType === "certified" && prePo.sourceHoldingId) {
    const qrSnap = await firebaseAdminDb
      .collection(PO_COLLECTIONS.QR_CODES)
      .where("currentHoldingId", "==", prePo.sourceHoldingId)
      .get();
    preSourceQRs = qrSnap.docs.map((d) => d.data() as QRCode);
  }

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const listingRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.MARKETPLACE_LISTINGS)
      .doc(prePo.listingId);
    const dnRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.DELIVERY_NOTES)
      .doc(prePo.deliveryNoteId || `dn_${poId}`);
    const sourceHoldingRef =
      prePo.certificationType === "certified" && prePo.sourceHoldingId
        ? firebaseAdminDb
            .collection(PO_COLLECTIONS.CERTIFICATE_HOLDINGS)
            .doc(prePo.sourceHoldingId)
        : null;

    const [paySnap, poSnap, listingSnap, dnSnap, sourceHoldingSnap] = await Promise.all([
      tx.get(paymentRef),
      tx.get(poRef),
      tx.get(listingRef),
      tx.get(dnRef),
      sourceHoldingRef ? tx.get(sourceHoldingRef) : Promise.resolve(null),
    ]);

    const currentPay = paySnap.data() as any;
    const po = poSnap.data() as PurchaseOrder;

    if (currentPay.paymentStatus === "completed") {
      return {
        success: true,
        paymentStatus: "completed" as const,
        paymentRecord: currentPay,
        poId: po.poId,
        deliveryNoteNumber: po.deliveryNoteNumber,
      };
    }

    if (!listingSnap.exists) {
      throw new Error(`Lookup Error: Listing "${po.listingId}" not found.`);
    }
    const listing = listingSnap.data() as MarketplaceListing;
    const sourceHolding =
      sourceHoldingSnap && sourceHoldingSnap.exists
        ? (sourceHoldingSnap.data() as CertificateHolding)
        : null;

    const tradeId = `trade_${po.poId}`;
    const tradeNumber = generateTradeNumber();
    const transferId = po.transferId || `trans_${po.poId}`;
    const transferFeeOriginal = round2(po.purchasePrice * (OFF_PLATFORM_TRANSFER_FEE_PERCENT / 100));

    const transferFeeRecord: AppliedFeeRecord = {
      feeId: `fee_trf_${tradeId}`,
      feeType: "certificate_transfer_fee",
      payerId: buyerUid,
      ratePercentage: OFF_PLATFORM_TRANSFER_FEE_PERCENT,
      calculatedAmount: transferFeeOriginal,
      currency: po.currency,
      isFeeExempt: false,
      policyStatus: "APPLIED",
      feeStatus: "paid",
      policyNotes: "0.5% certificate transfer fee for off-platform cocoa purchase",
      assessedAt: nowIso,
    };

    const custodyResult = await executeCustodyTransferInAdminTx({
      tx,
      po,
      listing,
      transferId,
      tradeId,
      feeRecord: transferFeeRecord,
      actorUid: buyerUid,
      sourceHolding,
      sourceQRs: preSourceQRs,
      now: nowIso,
    });

    const tradeRecord: TradeRecord = {
      tradeId,
      tradeNumber,
      listingId: listing.listingId,
      certificationType: listing.certificationType,
      lotId: listing.lotId,
      certificateId: listing.certificateId,
      sourceHoldingId: listing.sourceHoldingId,
      destHoldingId: custodyResult.destHoldingId,
      sellerId: listing.sellerHolderId,
      sellerHolderId: listing.sellerHolderId,
      sellerHolderType: listing.sellerHolderType,
      buyerId: po.buyerId,
      buyerHolderType: po.buyerHolderType,
      quantityKg: po.quantityKg,
      negotiatedPricePerKg: po.unitPricePerKg,
      totalAmount: po.purchasePrice,
      currency: po.currency,
      paymentChannel: "off_platform",
      paymentReference: cleanRef,
      tradeStatus: "confirmed",
      requiresBuyerConfirmation: false,
      buyerConfirmed: false,
      transferFeeApplied: transferFeeRecord,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      notes: `Off-platform payment confirmed by seller + 0.5% transfer fee verified via PO ${po.poNumber}`,
      tradeDate: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedPayment: PaymentRecord = {
      ...currentPay,
      tradeId,
      transferId: listing.certificationType === "certified" ? transferId : undefined,
      paymentStatus: "completed",
      gatewayTransactionId: rec.gatewayTransactionId || currentPay.gatewayTransactionId,
      flw_ref: rec.flw_ref || currentPay.flw_ref,
      paidAt: nowIso,
      completedAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(paymentRef, cleanData(updatedPayment));
    tx.set(firebaseAdminDb.collection(PO_COLLECTIONS.TRADES).doc(tradeId), cleanData(tradeRecord));

    if (dnSnap.exists) {
      tx.update(
        dnRef,
        cleanData({
          tradeId,
          tradeNumber,
          transferId: listing.certificationType === "certified" ? transferId : undefined,
          status: "in_transit",
          updatedAt: nowIso,
        })
      );
    }

    tx.update(
      poRef,
      cleanData({
        status: "delivery_initialized",
        transferFeePaymentId: cleanRef,
        transferFeePaymentReference: cleanRef,
        transferFeeAmount: transferFeeOriginal,
        transferFeePaidAt: nowIso,
        destHoldingId: custodyResult.destHoldingId,
        tradeId,
        tradeNumber,
        transferCompletedAt: nowIso,
        updatedAt: nowIso,
      })
    );

    return {
      success: true,
      paymentStatus: "completed" as const,
      paymentRecord: updatedPayment,
      poId: po.poId,
      deliveryNoteNumber: po.deliveryNoteNumber,
    };
  });
}

// ============================================================================
// 8. STAGE 4: BUYER MARKS DELIVERY SUCCESSFUL -> CLOSES TRADE & RESTORES REMAINDER
// ============================================================================

export async function confirmDeliveryByBuyer(input: {
  poId: string;
  buyerUid: string;
  deliveryNotes?: string;
}): Promise<{
  purchaseOrder: PurchaseOrder;
  deliveryNote: DeliveryNote | null;
  remainingListingQuantityKg: number;
  listingStatusAfter: string;
}> {
  const poId = input.poId.trim();
  const buyerUid = input.buyerUid.trim();
  const poRef = firebaseAdminDb.collection(PO_COLLECTIONS.PURCHASE_ORDERS).doc(poId);

  return await firebaseAdminDb.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) {
      throw new Error(`Lookup Error: Purchase Order "${poId}" does not exist.`);
    }
    const po = poSnap.data() as PurchaseOrder;

    if (po.buyerId !== buyerUid) {
      throw new Error("Authorization Error: Only the buyer can confirm cocoa delivery.");
    }
    if (po.status !== "delivery_initialized") {
      throw new Error(
        `State Error: Delivery cannot be confirmed while order is in "${po.status}" status.`
      );
    }

    const listingRef = firebaseAdminDb
      .collection(PO_COLLECTIONS.MARKETPLACE_LISTINGS)
      .doc(po.listingId);
    const dnRef = po.deliveryNoteId
      ? firebaseAdminDb.collection(PO_COLLECTIONS.DELIVERY_NOTES).doc(po.deliveryNoteId)
      : null;
    const tradeRef = po.tradeId
      ? firebaseAdminDb.collection(PO_COLLECTIONS.TRADES).doc(po.tradeId)
      : null;
    const accRef1 = firebaseAdminDb
      .collection(PO_COLLECTIONS.SELLER_ACCESS_RECORDS)
      .doc(`SAR-${po.listingId}-${buyerUid}`);
    const accRef2 = firebaseAdminDb
      .collection(PO_COLLECTIONS.SELLER_ACCESS_RECORDS)
      .doc(`acc_${po.listingId}_${buyerUid}`);

    const [listingSnap, dnSnap, tradeSnap, accSnap1, accSnap2] = await Promise.all([
      tx.get(listingRef),
      dnRef ? tx.get(dnRef) : Promise.resolve(null),
      tradeRef ? tx.get(tradeRef) : Promise.resolve(null),
      tx.get(accRef1),
      tx.get(accRef2),
    ]);

    const now = new Date().toISOString();

    let remainingListingQuantityKg = 0;
    let listingStatusAfter = "sold";

    if (listingSnap.exists) {
      const listing = listingSnap.data() as MarketplaceListing;
      remainingListingQuantityKg = Math.max(0, round2(listing.quantityAvailableKg - po.quantityKg));
      listingStatusAfter = remainingListingQuantityKg > 0 ? "available" : "sold";

      tx.update(
        listingRef,
        cleanData({
          quantityAvailableKg: remainingListingQuantityKg,
          listingStatus: listingStatusAfter,
          pendingAccessIntent: null,
          updatedAt: now,
        })
      );
    }

    let updatedDn: DeliveryNote | null = null;
    if (dnSnap && dnSnap.exists && dnRef) {
      const dn = dnSnap.data() as DeliveryNote;
      updatedDn = {
        ...dn,
        status: "delivered",
        deliveryNotes: input.deliveryNotes?.trim() || dn.deliveryNotes,
        deliveredAt: now,
        confirmedByBuyerUid: buyerUid,
        remainingListingQuantityRestoredKg: remainingListingQuantityKg,
        updatedAt: now,
      };
      tx.set(dnRef, cleanData(updatedDn));
    }

    if (tradeSnap && tradeSnap.exists && tradeRef) {
      tx.update(
        tradeRef,
        cleanData({
          tradeStatus: "completed",
          buyerConfirmed: true,
          buyerConfirmedAt: now,
          confirmedByBuyerUid: buyerUid,
          updatedAt: now,
        })
      );
    }

    for (const [accRef, accSnap] of [
      [accRef1, accSnap1],
      [accRef2, accSnap2],
    ] as const) {
      if (accSnap.exists) {
        tx.update(
          accRef,
          cleanData({
            accessStatus: "concluded_sold",
            dealOutcome: "sold",
            soldQuantityKg: po.quantityKg,
            agreedPricePerKg: po.unitPricePerKg,
            tradeId: po.tradeId,
            concludedAt: now,
            updatedAt: now,
          })
        );
      }
    }

    const updatedPo: PurchaseOrder = {
      ...po,
      status: "completed",
      deliveredAt: now,
      completedAt: now,
      updatedAt: now,
    };
    tx.set(poRef, cleanData(updatedPo));

    return {
      purchaseOrder: updatedPo,
      deliveryNote: updatedDn,
      remainingListingQuantityKg,
      listingStatusAfter,
    };
  });
}
