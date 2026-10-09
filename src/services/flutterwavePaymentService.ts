/**
 * Flutterwave Payment Service (Role 3 Domain Logic)
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Computes exact 0.5% Math.ceil() seller information access fee for NGN marketplace listings
 * - Manages 15-minute pendingAccessIntent reservation lifecycle
 * - Enforces dual-idempotency (initiation & finalization idempotency)
 * - Recovers initiating and checkout_creation_uncertain states using provider reconciliation
 * - Executes atomic single-transaction metadata persistence and state transitions
 * - Enforces strict exact amount equality (amount_mismatch isolation)
 * - Isolates expired/superseded payments as paid_unfulfillable without granting access
 * - Creates SellerAccessRecord and transitions listing to under_negotiation upon verified success
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
  PaymentRecord,
  SellerAccessRecord,
  PendingAccessIntent,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid } from "./productionService";
import { getMarketplaceListing, COLLECTIONS as MARKETPLACE_COLLECTIONS } from "./marketplaceService";
import {
  createFlutterwaveStandardPayment,
  verifyFlutterwaveTransactionByReference,
  ReconciliationResult,
} from "./flutterwaveService";

export const PAYMENT_COLLECTIONS = {
  PAYMENTS: "payments",
  SELLER_ACCESS_RECORDS: "sellerAccessRecords",
  MARKETPLACE_LISTINGS: "marketplaceListings",
} as const;

export interface InitiateSellerAccessPaymentInput {
  listingId: string;
  buyerUid?: string;
  redirectUrl?: string;
  customerEmail?: string;
  customerName?: string;
}

export interface InitiateSellerAccessPaymentResult {
  checkoutUrl: string;
  paymentReference: string;
  paymentId: string;
  amountCharged: number;
  currency: "NGN";
  expiresAt: string;
  isExistingSession?: boolean;
}

export interface FinalizeSellerAccessPaymentResult {
  success: boolean;
  paymentStatus: PaymentRecord["paymentStatus"];
  paymentRecord: PaymentRecord;
  accessRecord?: SellerAccessRecord;
  statusReason?: string;
}

/**
 * Calculates the exact 0.5% seller information access fee using strict Math.ceil() whole NGN integer rounding.
 * Formula:
 * listingTotalValue = quantityAvailableKg * pricePerKg
 * mathematicalFee = listingTotalValue * 0.005
 * amountCharged = Math.ceil(mathematicalFee)
 */
export function calculateSellerInfoAccessFee(listing: MarketplaceListing): {
  quantityAvailableKgSnapshot: number;
  pricePerKgSnapshot: number;
  listingTotalValueSnapshot: number;
  mathematicalFee: number;
  feePercentage: number;
  amountCharged: number;
} {
  const quantityAvailableKgSnapshot = listing.quantityAvailableKg;
  const pricePerKgSnapshot = listing.pricePerKg;
  const listingTotalValueSnapshot = quantityAvailableKgSnapshot * pricePerKgSnapshot;
  const feePercentage = 0.005; // Exactly 0.5%
  const mathematicalFee = listingTotalValueSnapshot * feePercentage;
  const amountCharged = Math.ceil(mathematicalFee);

  return {
    quantityAvailableKgSnapshot,
    pricePerKgSnapshot,
    listingTotalValueSnapshot,
    mathematicalFee,
    feePercentage,
    amountCharged,
  };
}

/**
 * Generates an immutable, unique payment reference (tx_ref).
 * Format: PAY-ACC-{listingId}-{timestamp}-{random}
 */
export function generatePaymentReference(listingId: string): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `PAY-ACC-${listingId}-${timestamp}-${rand}`;
}

/**
 * Initiates a Seller Information Access payment via Flutterwave.
 * Guarantees initiation idempotency, reservation locking, crash recovery, and atomic metadata persistence.
 */
export async function initiateSellerInfoAccessPayment(
  input: InitiateSellerAccessPaymentInput
): Promise<InitiateSellerAccessPaymentResult> {
  const buyerUid = resolveAuthenticatedUserUid(input.buyerUid);

  if (!input.listingId || !input.listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const cleanListingId = input.listingId.trim();
  const listingRef = doc(db, PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS, cleanListingId);

  // Phase 1: Atomic Reservation & Existing Session Recovery inside Firestore Transaction
  const reservationPhase = await runTransaction(db, async (tx) => {
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists()) {
      throw new Error(`Lookup Error: Marketplace listing "${cleanListingId}" does not exist.`);
    }

    const listing = listingSnap.data() as MarketplaceListing;

    // Invariant 1: Listing must be strictly "available"
    if (listing.listingStatus !== "available") {
      throw new Error(
        `State Error: Cannot initiate payment for listing in "${listing.listingStatus}" status. Listing must be "available".`
      );
    }

    // Invariant 2: Seller cannot buy access to own listing
    if (listing.sellerHolderId === buyerUid || listing.createdByUid === buyerUid) {
      throw new Error("Security Error: Sellers cannot pay access fees for their own listing.");
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Check existing pendingAccessIntent
    const existingIntent = listing.pendingAccessIntent;
    if (existingIntent && new Date(existingIntent.expiresAt).getTime() > now.getTime()) {
      // Listing is currently reserved
      if (existingIntent.buyerUid !== buyerUid) {
        throw new Error(
          "Conflict Error (409): This listing is currently reserved by another buyer under active checkout. Please try again later."
        );
      }

      // Same buyer retrying
      if (existingIntent.status === "pending" && existingIntent.checkoutUrl) {
        return {
          action: "REUSE_EXISTING" as const,
          checkoutUrl: existingIntent.checkoutUrl,
          paymentReference: existingIntent.paymentReference,
          paymentId: existingIntent.paymentId,
          amountCharged: existingIntent.amountCharged,
          expiresAt: existingIntent.expiresAt,
        };
      }

      // State is initiating or checkout_creation_uncertain: Requires reconciliation of existing tx_ref
      return {
        action: "RECONCILE_EXISTING" as const,
        paymentReference: existingIntent.paymentReference,
        paymentId: existingIntent.paymentId,
        expiresAt: existingIntent.expiresAt,
        listing,
      };
    }

    // No active unexpired reservation: Calculate fee & create new reservation
    const feeCalculation = calculateSellerInfoAccessFee(listing);
    const paymentReference = generatePaymentReference(listing.listingId);
    const paymentId = paymentReference;
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15-minute TTL

    const paymentRecord: PaymentRecord = {
      paymentId,
      paymentReference,
      listingId: listing.listingId,
      lotId: listing.lotId,
      buyerUid,
      sellerId: listing.sellerHolderId,
      payerId: buyerUid,
      payeeId: listing.sellerHolderId,
      paymentPurpose: "SELLER_INFORMATION_ACCESS",
      paymentGateway: "FLUTTERWAVE",
      currency: "NGN",
      amount: feeCalculation.amountCharged,
      amountCharged: feeCalculation.amountCharged,
      feePercentage: feeCalculation.feePercentage,
      mathematicalFee: feeCalculation.mathematicalFee,
      quantityAvailableKgSnapshot: feeCalculation.quantityAvailableKgSnapshot,
      pricePerKgSnapshot: feeCalculation.pricePerKgSnapshot,
      listingTotalValueSnapshot: feeCalculation.listingTotalValueSnapshot,
      paymentStatus: "initiating",
      expiresAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const newIntent: PendingAccessIntent = {
      paymentId,
      paymentReference,
      buyerUid,
      amountCharged: feeCalculation.amountCharged,
      currency: "NGN",
      status: "initiating",
      createdAt: nowIso,
      expiresAt,
    };

    const paymentDocRef = doc(db, PAYMENT_COLLECTIONS.PAYMENTS, paymentId);
    tx.set(paymentDocRef, paymentRecord);
    tx.update(listingRef, {
      pendingAccessIntent: newIntent,
      updatedAt: nowIso,
    });

    return {
      action: "CALL_GATEWAY" as const,
      paymentRecord,
      listing,
      feeCalculation,
    };
  });

  // Handle immediate reuse
  if (reservationPhase.action === "REUSE_EXISTING") {
    return {
      checkoutUrl: reservationPhase.checkoutUrl,
      paymentReference: reservationPhase.paymentReference,
      paymentId: reservationPhase.paymentId,
      amountCharged: reservationPhase.amountCharged,
      currency: "NGN",
      expiresAt: reservationPhase.expiresAt,
      isExistingSession: true,
    };
  }

  // Handle crash recovery / reconciliation of existing initiating or uncertain intent
  if (reservationPhase.action === "RECONCILE_EXISTING") {
    const rec = await verifyFlutterwaveTransactionByReference(reservationPhase.paymentReference);

    if (rec.status === "SUCCESSFUL" || (rec.status === "FAILED" && rec.gatewayStatus === "pending")) {
      // Transaction was successfully created at Flutterwave; recover it
      const recoveredCheckoutUrl = rec.raw?.data?.link || `https://checkout.flutterwave.com/v3/hosted/pay/${reservationPhase.paymentReference}`;
      const nowIso = new Date().toISOString();

      await runTransaction(db, async (tx) => {
        const pRef = doc(db, PAYMENT_COLLECTIONS.PAYMENTS, reservationPhase.paymentId);
        const lRef = doc(db, PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS, cleanListingId);

        tx.update(pRef, {
          paymentStatus: "pending",
          checkoutUrl: recoveredCheckoutUrl,
          gatewayTransactionId: rec.gatewayTransactionId || null,
          flw_ref: rec.flw_ref || null,
          updatedAt: nowIso,
        });

        tx.update(lRef, {
          "pendingAccessIntent.status": "pending",
          "pendingAccessIntent.checkoutUrl": recoveredCheckoutUrl,
          updatedAt: nowIso,
        });
      });

      return {
        checkoutUrl: recoveredCheckoutUrl,
        paymentReference: reservationPhase.paymentReference,
        paymentId: reservationPhase.paymentId,
        amountCharged: reservationPhase.listing.pendingAccessIntent?.amountCharged || 0,
        currency: "NGN",
        expiresAt: reservationPhase.expiresAt,
        isExistingSession: true,
      };
    }

    if (rec.status === "RESOLVED_NOT_FOUND") {
      // Flutterwave confirms no transaction exists with this reference: Release reservation and start clean
      const nowIso = new Date().toISOString();
      await runTransaction(db, async (tx) => {
        const pRef = doc(db, PAYMENT_COLLECTIONS.PAYMENTS, reservationPhase.paymentId);
        const lRef = doc(db, PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS, cleanListingId);

        tx.update(pRef, {
          paymentStatus: "checkout_creation_failed",
          statusReason: "Crash recovery confirmed transaction never reached gateway",
          updatedAt: nowIso,
        });

        tx.update(lRef, {
          pendingAccessIntent: null,
          updatedAt: nowIso,
        });
      });

      // Recurse to initiate freshly now that stale intent is released
      return await initiateSellerInfoAccessPayment(input);
    }

    // Reconciliation returned INDETERMINATE: Retain existing tx_ref, do not create duplicate
    throw new Error(
      `Gateway Reconciliation Pending (504): Previous checkout initiation state is uncertain. Please retry in a few moments.`
    );
  }

  // Phase 2: Call Flutterwave standard hosted payment API
  const { paymentRecord, listing, feeCalculation } = reservationPhase;
  const redirectUrl =
    input.redirectUrl ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/payments/flutterwave/verify`;

  const gatewayResult = await createFlutterwaveStandardPayment({
    tx_ref: paymentRecord.paymentReference,
    amount: feeCalculation.amountCharged,
    currency: "NGN",
    redirect_url: redirectUrl,
    customer: {
      email: input.customerEmail || `${buyerUid}@buyer.cocoatrace.cm`,
      name: input.customerName || `Buyer (${buyerUid})`,
    },
    customizations: {
      title: "Seller Information Access",
      description: `Access seller contact details for listing ${listing.listingNumber}`,
    },
    meta: {
      listingId: listing.listingId,
      buyerUid,
      lotId: listing.lotId,
    },
  });

  const nowIso = new Date().toISOString();
  const paymentDocRef = doc(db, PAYMENT_COLLECTIONS.PAYMENTS, paymentRecord.paymentId);

  // Phase 3: Handle Gateway Outcome Atomically
  if (gatewayResult.outcome === "SUCCESS") {
    // ATOMIC Single Transaction: Save metadata to PaymentRecord AND listing.pendingAccessIntent
    await runTransaction(db, async (tx) => {
      tx.update(paymentDocRef, {
        paymentStatus: "pending",
        checkoutUrl: gatewayResult.checkoutUrl,
        gatewayTransactionId: gatewayResult.gatewayTransactionId || null,
        flw_ref: gatewayResult.flw_ref || null,
        gatewayResponseRaw: gatewayResult.raw || null,
        updatedAt: nowIso,
      });

      tx.update(listingRef, {
        "pendingAccessIntent.status": "pending",
        "pendingAccessIntent.checkoutUrl": gatewayResult.checkoutUrl,
        updatedAt: nowIso,
      });
    });

    return {
      checkoutUrl: gatewayResult.checkoutUrl,
      paymentReference: paymentRecord.paymentReference,
      paymentId: paymentRecord.paymentId,
      amountCharged: feeCalculation.amountCharged,
      currency: "NGN",
      expiresAt: paymentRecord.expiresAt!,
    };
  }

  if (gatewayResult.outcome === "DEFINITIVE_FAILURE") {
    // ATOMIC Transaction: Mark PaymentRecord failed and clear reservation immediately
    await runTransaction(db, async (tx) => {
      tx.update(paymentDocRef, {
        paymentStatus: "checkout_creation_failed",
        statusReason: gatewayResult.message,
        gatewayResponseRaw: gatewayResult.raw || null,
        updatedAt: nowIso,
      });

      tx.update(listingRef, {
        pendingAccessIntent: null,
        updatedAt: nowIso,
      });
    });

    throw new Error(`Flutterwave Gateway Error: ${gatewayResult.message}`);
  }

  // INDETERMINATE_TIMEOUT: Retain reservation and mark as uncertain
  await runTransaction(db, async (tx) => {
    tx.update(paymentDocRef, {
      paymentStatus: "checkout_creation_uncertain",
      statusReason: gatewayResult.message,
      updatedAt: nowIso,
    });

    tx.update(listingRef, {
      "pendingAccessIntent.status": "checkout_creation_uncertain",
      updatedAt: nowIso,
    });
  });

  throw new Error(
    `Gateway Timeout (504): Network timeout while contacting Flutterwave. Your checkout reference is "${paymentRecord.paymentReference}". Please retry reconciliation.`
  );
}

/**
 * Reconciles and finalizes a Seller Information Access payment.
 * Invoked by redirect callback, webhook, or explicit verification request.
 * Guarantees finalization idempotency, strict exact amount check, reservation validation,
 * and immutable SellerAccessRecord creation.
 */
export async function verifyAndFinalizeSellerInfoAccessPayment(
  paymentReference: string
): Promise<FinalizeSellerAccessPaymentResult> {
  if (!paymentReference || !paymentReference.trim()) {
    throw new Error("Validation Error: paymentReference is required for verification.");
  }

  const cleanPayRef = paymentReference.trim();

  // 1. Call canonical Flutterwave reconciliation endpoint
  const rec = await verifyFlutterwaveTransactionByReference(cleanPayRef);

  // 2. Fetch associated PaymentRecord
  const paymentDocRef = doc(db, PAYMENT_COLLECTIONS.PAYMENTS, cleanPayRef);
  const paymentSnap = await getDoc(paymentDocRef);

  if (!paymentSnap.exists()) {
    throw new Error(`Lookup Error: PaymentRecord for reference "${cleanPayRef}" was not found.`);
  }

  const paymentRecord = paymentSnap.data() as PaymentRecord;

  // Idempotent Fast-Path: If already completed, return existing access record
  if (paymentRecord.paymentStatus === "completed") {
    const accessId = `SAR-${paymentRecord.listingId}-${paymentRecord.buyerUid}`;
    const accessSnap = await getDoc(doc(db, PAYMENT_COLLECTIONS.SELLER_ACCESS_RECORDS, accessId));
    const accessRecord = accessSnap.exists() ? (accessSnap.data() as SellerAccessRecord) : undefined;

    return {
      success: true,
      paymentStatus: "completed",
      paymentRecord,
      accessRecord,
    };
  }

  const listingRef = doc(db, PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS, paymentRecord.listingId!);
  const nowIso = new Date().toISOString();

  // 3. Evaluate Verification in Atomic Firestore Transaction
  return await runTransaction(db, async (tx) => {
    const currentPaySnap = await tx.get(paymentDocRef);
    if (!currentPaySnap.exists()) {
      throw new Error(`Lookup Error: PaymentRecord "${cleanPayRef}" does not exist.`);
    }
    const currentPayment = currentPaySnap.data() as PaymentRecord;

    if (currentPayment.paymentStatus === "completed") {
      const accessId = `SAR-${currentPayment.listingId}-${currentPayment.buyerUid}`;
      const accessSnap = await tx.get(doc(db, PAYMENT_COLLECTIONS.SELLER_ACCESS_RECORDS, accessId));
      return {
        success: true,
        paymentStatus: "completed",
        paymentRecord: currentPayment,
        accessRecord: accessSnap.exists() ? (accessSnap.data() as SellerAccessRecord) : undefined,
      };
    }

    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists()) {
      throw new Error(`Lookup Error: Listing "${currentPayment.listingId}" does not exist.`);
    }
    const listing = listingSnap.data() as MarketplaceListing;

    // Check Gateway Status
    if (rec.status === "FAILED") {
      tx.update(paymentDocRef, {
        paymentStatus: "failed",
        statusReason: rec.errorMessage || "Payment was declined or cancelled at Flutterwave.",
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      return {
        success: false,
        paymentStatus: "failed",
        paymentRecord: { ...currentPayment, paymentStatus: "failed" },
        statusReason: "Payment failed at gateway.",
      };
    }

    if (rec.status !== "SUCCESSFUL") {
      return {
        success: false,
        paymentStatus: currentPayment.paymentStatus,
        paymentRecord: currentPayment,
        statusReason: rec.errorMessage || "Transaction verification could not be completed.",
      };
    }

    // Invariant Check 1: Currency must strictly be NGN
    if (rec.currency !== "NGN") {
      tx.update(paymentDocRef, {
        paymentStatus: "failed",
        statusReason: `Currency mismatch: Expected NGN, received ${rec.currency}`,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      return {
        success: false,
        paymentStatus: "failed",
        paymentRecord: { ...currentPayment, paymentStatus: "failed" },
        statusReason: `Currency mismatch: Expected NGN, received ${rec.currency}`,
      };
    }

    // Invariant Check 2: Strict Exact Amount Check (even ₦1 difference is rejected)
    const expectedAmount = currentPayment.amountCharged || currentPayment.amount || 0;
    const verifiedAmount = rec.amount || 0;

    if (verifiedAmount !== expectedAmount) {
      tx.update(paymentDocRef, {
        paymentStatus: "amount_mismatch",
        statusReason: `Amount mismatch: Verified ₦${verifiedAmount} does not equal expected ₦${expectedAmount}`,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      return {
        success: false,
        paymentStatus: "amount_mismatch",
        paymentRecord: { ...currentPayment, paymentStatus: "amount_mismatch" },
        statusReason: `Amount mismatch: Verified ₦${verifiedAmount} does not equal expected ₦${expectedAmount}`,
      };
    }

    // Invariant Check 3: Listing Reservation & Intent Validation
    const intent = listing.pendingAccessIntent;
    const isIntentValid =
      intent !== null &&
      intent !== undefined &&
      intent.paymentReference === cleanPayRef &&
      intent.paymentId === currentPayment.paymentId &&
      intent.buyerUid === currentPayment.buyerUid &&
      new Date(intent.expiresAt).getTime() > Date.now() &&
      listing.listingStatus === "available";

    if (!isIntentValid) {
      // Gateway received valid payment, but reservation expired or listing was modified
      tx.update(paymentDocRef, {
        paymentStatus: "paid_unfulfillable",
        statusReason:
          "Payment succeeded at gateway, but the 15-minute listing reservation expired or listing status was changed.",
        gatewayTransactionId: rec.gatewayTransactionId || null,
        flw_ref: rec.flw_ref || null,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      return {
        success: false,
        paymentStatus: "paid_unfulfillable",
        paymentRecord: { ...currentPayment, paymentStatus: "paid_unfulfillable" },
        statusReason:
          "Payment succeeded at gateway, but listing reservation expired or was superseded. Flagged for administrative reconciliation/refund.",
      };
    }

    // All Invariants Passed: Fulfill Seller Information Access Atomically
    const accessId = `SAR-${listing.listingId}-${currentPayment.buyerUid}`;
    const accessRef = doc(db, PAYMENT_COLLECTIONS.SELLER_ACCESS_RECORDS, accessId);

    const accessRecord: SellerAccessRecord = {
      accessId,
      listingId: listing.listingId,
      lotId: listing.lotId,
      buyerId: currentPayment.buyerUid!,
      buyerUid: currentPayment.buyerUid!,
      sellerHolderId: listing.sellerHolderId,
      sellerId: listing.sellerHolderId,
      paymentId: currentPayment.paymentId,
      paymentReference: cleanPayRef,
      accessType: "flutterwave_seller_info_access",
      feePaid: expectedAmount,
      amountPaid: expectedAmount,
      currency: "NGN",
      accessStatus: "active",
      status: "active",
      accessGrantedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(accessRef, accessRecord);

    // Update PaymentRecord to "completed"
    const updatedPayment: PaymentRecord = {
      ...currentPayment,
      paymentStatus: "completed",
      gatewayTransactionId: rec.gatewayTransactionId || currentPayment.gatewayTransactionId,
      flw_ref: rec.flw_ref || currentPayment.flw_ref,
      gatewayResponseRaw: rec.raw || currentPayment.gatewayResponseRaw,
      completedAt: nowIso,
      paidAt: nowIso,
      updatedAt: nowIso,
    };
    tx.set(paymentDocRef, updatedPayment);

    // Transition Listing to "under_negotiation" and clear pendingAccessIntent
    tx.update(listingRef, {
      listingStatus: "under_negotiation",
      pendingAccessIntent: null,
      updatedAt: nowIso,
    });

    return {
      success: true,
      paymentStatus: "completed",
      paymentRecord: updatedPayment,
      accessRecord,
    };
  });
}
