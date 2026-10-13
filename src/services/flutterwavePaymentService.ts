/* eslint-disable @typescript-eslint/no-unused-vars */
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
  getNgnExchangeRate,
  type NgnExchangeRateQuote,
} from "./exchangeRateService";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  MarketplaceListing,
  PaymentRecord,
  SellerAccessRecord,
  PendingAccessIntent,
} from "@/types/traceability";
import { randomBytes } from "node:crypto";
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
 * Calculates the 0.5% seller-information access fee in NGN.
 *
 * The listing value is first converted to NGN using a trusted
 * server-side exchange-rate quote. The final fee is rounded up
 * to the next whole NGN.
 */
export function calculateSellerInfoAccessFee(
  listing: MarketplaceListing,
  exchangeRateQuote: NgnExchangeRateQuote
): {
  quantityAvailableKgSnapshot: number;
  pricePerKgSnapshot: number;
  listingTotalValueSnapshot: number;
  listingCurrencySnapshot: string;
  listingTotalValueNgnSnapshot: number;
  exchangeRateToNgnSnapshot: number;
  exchangeRateTimestampSnapshot: string;
  exchangeRateProviderSnapshot: "ExchangeRate-API" | "identity";
  mathematicalFee: number;
  feePercentage: number;
  amountCharged: number;
} {
  const quantityAvailableKgSnapshot = listing.quantityAvailableKg;
  const pricePerKgSnapshot = listing.pricePerKg;
  const listingCurrencySnapshot = listing.currency?.trim().toUpperCase();

  if (
    typeof quantityAvailableKgSnapshot !== "number" ||
    !Number.isFinite(quantityAvailableKgSnapshot) ||
    quantityAvailableKgSnapshot <= 0
  ) {
    throw new Error("Validation Error: Listing quantity must be positive and finite.");
  }

  if (
    typeof pricePerKgSnapshot !== "number" ||
    !Number.isFinite(pricePerKgSnapshot) ||
    pricePerKgSnapshot <= 0
  ) {
    throw new Error("Validation Error: Listing price must be positive and finite.");
  }

  if (
    !listingCurrencySnapshot ||
    listingCurrencySnapshot !== exchangeRateQuote.sourceCurrency ||
    exchangeRateQuote.targetCurrency !== "NGN"
  ) {
    throw new Error(
      "Conflict Error (409): Listing currency changed during fee calculation. Please retry."
    );
  }

  if (
    !Number.isFinite(exchangeRateQuote.rate) ||
    exchangeRateQuote.rate <= 0
  ) {
    throw new Error("Validation Error: Exchange rate is invalid.");
  }

  // Total value in the currency originally used by the listing.
  const listingTotalValueSnapshot =
    quantityAvailableKgSnapshot * pricePerKgSnapshot;

  if (
    !Number.isFinite(listingTotalValueSnapshot) ||
    listingTotalValueSnapshot <= 0
  ) {
    throw new Error("Validation Error: Total listing value is invalid.");
  }

  // Convert the total value into NGN and round the value to two decimals.
  const unroundedNgnValue =
    listingTotalValueSnapshot * exchangeRateQuote.rate;

  if (!Number.isFinite(unroundedNgnValue) || unroundedNgnValue <= 0) {
    throw new Error("Validation Error: Converted NGN listing value is invalid.");
  }

  const listingTotalValueNgnSnapshot =
    Math.round((unroundedNgnValue + Number.EPSILON) * 100) / 100;

  // The fee is 0.5% of the NGN-converted listing value.
  const feePercentage = 0.005;
  const mathematicalFee =
    listingTotalValueNgnSnapshot * feePercentage;
  const amountCharged = Math.ceil(mathematicalFee);

  if (
    !Number.isFinite(mathematicalFee) ||
    !Number.isSafeInteger(amountCharged) ||
    amountCharged < 1
  ) {
    throw new Error("Validation Error: Calculated access fee is invalid.");
  }

  return {
    quantityAvailableKgSnapshot,
    pricePerKgSnapshot,
    listingTotalValueSnapshot,
    listingCurrencySnapshot,
    listingTotalValueNgnSnapshot,
    exchangeRateToNgnSnapshot: exchangeRateQuote.rate,
    exchangeRateTimestampSnapshot: exchangeRateQuote.rateTimestamp,
    exchangeRateProviderSnapshot: exchangeRateQuote.provider,
    mathematicalFee,
    feePercentage,
    amountCharged,
  };
}

/**
 * Generates an immutable, unique payment reference (tx_ref).
 * Format: PAY-ACC-{listingId}-{timestamp}-{random}
 */
export function generatePaymentReference(): string {
  const timestamp = Date.now();
  const randomPart = randomBytes(16).toString("hex").toUpperCase();

  return `PAY-ACC-${timestamp}-${randomPart}`;
}

/**
 * Initiates a Seller Information Access payment via Flutterwave.
 * Guarantees initiation idempotency, reservation locking, crash recovery, and atomic metadata persistence.
 */
export async function initiateSellerInfoAccessPayment(
  input: InitiateSellerAccessPaymentInput
): Promise<InitiateSellerAccessPaymentResult> {
  if (
    typeof input.buyerUid !== "string" ||
    !input.buyerUid.trim()
  ) {
    throw new Error(
      "Authentication Error: A verified buyer UID is required."
    );
  }

  const buyerUid = input.buyerUid.trim();

  if (!input.listingId || !input.listingId.trim()) {
    throw new Error("Validation Error: listingId is required.");
  }

  const cleanListingId = input.listingId.trim();
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
    throw new Error(
      "Configuration Error: NEXT_PUBLIC_APP_URL is not a valid URL."
    );
  }

  const isLocalhost = ["localhost", "127.0.0.1"].includes(appUrl.hostname);

  if (
    (appUrl.protocol !== "https:" &&
      !(appUrl.protocol === "http:" && isLocalhost)) ||
    appUrl.username ||
    appUrl.password
  ) {
    throw new Error(
      "Configuration Error: Payment callback URL must use HTTPS, except for local development."
    );
  }

  const redirectUrl = `${appUrl.origin}/payments/flutterwave/verify`;
  const listingRef = firebaseAdminDb
  .collection(PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS)
  .doc(cleanListingId);

  // Read the listing before the transaction so that network requests
  // to the exchange-rate provider are not made inside a Firestore transaction.
  const preflightListingSnap = await listingRef.get();

  if (!preflightListingSnap.exists) {
    throw new Error(
      `Lookup Error: Marketplace listing "${cleanListingId}" does not exist.`
    );
  }

  const preflightListing =
    preflightListingSnap.data() as MarketplaceListing;

  const preflightIntentExpiry = preflightListing.pendingAccessIntent?.expiresAt;
  const preflightExpiryMs = preflightIntentExpiry
    ? Date.parse(preflightIntentExpiry)
    : Number.NaN;

  const hasLivePreflightIntent =
    Number.isFinite(preflightExpiryMs) && preflightExpiryMs > Date.now();

  // An existing checkout has already locked in its payment amount.
  // Fetch a quote only when we expect to create a new payment.
  const exchangeRateQuote: NgnExchangeRateQuote | null =
    hasLivePreflightIntent
      ? null
      : await getNgnExchangeRate(preflightListing.currency);

  // Phase 1: Atomic Reservation & Existing Session Recovery inside Firestore Transaction
  const reservationPhase = await firebaseAdminDb.runTransaction(async (tx) => {
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists) {
      throw new Error(
        `Lookup Error: Marketplace listing "${cleanListingId}" does not exist.`
      );
    }

    const listing = listingSnap.data() as MarketplaceListing;
    
    if (listing.sellerHolderType !== "farmer") {
      throw new Error(
        "State Error: Seller information payments are unavailable for this seller type until a verified contact profile is configured."
      );
    }
    
    if (!listing.lotId) {
      throw new Error(
        "Lookup Error: The listing has no backing cocoa lot."
      );
    }

    const lotRef = firebaseAdminDb
      .collection("cocoaLots")
      .doc(listing.lotId);

    const lotSnap = await tx.get(lotRef);

    if (!lotSnap.exists) {
      throw new Error(
        "Lookup Error: The listing's cocoa lot was not found."
      );
    }

    const lot = lotSnap.data();

    if (
      lot?.originCountry !== "Cameroon" ||
      typeof lot?.farmId !== "string" ||
      !lot.farmId
    ) {
      throw new Error(
        "Security Error: The listing does not reference a valid Cameroon-origin farm."
      );
    }

    const farmRef = firebaseAdminDb
      .collection("farms")
      .doc(lot.farmId);

    const farmSnap = await tx.get(farmRef);

    if (!farmSnap.exists) {
      throw new Error(
        "Lookup Error: The registered origin farm was not found."
      );
    }

    const farm = farmSnap.data();

    if (
      typeof farm?.farmerId !== "string" ||
      farm.farmerId !== listing.sellerHolderId
    ) {
      throw new Error(
        "Security Error: The listing seller does not match the farm owner."
      );
    }

    const hasPhone =
      typeof farm.farmerPhone === "string" &&
      farm.farmerPhone.trim().length > 0;

    const hasEmail =
      typeof farm.farmerEmail === "string" &&
      farm.farmerEmail.trim().length > 0;

    if (!hasPhone && !hasEmail) {
      throw new Error(
        "Lookup Error: The registered farm has no usable seller contact details."
      );
    }

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
    if (!exchangeRateQuote) {
      throw new Error(
        "Conflict Error (409): The listing reservation changed while preparing payment. Please retry."
      );
    }

    const feeCalculation = calculateSellerInfoAccessFee(
      listing,
      exchangeRateQuote
    );
    const paymentReference = generatePaymentReference();
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
      listingTotalValueNgnSnapshot:
        feeCalculation.listingTotalValueNgnSnapshot,
      exchangeRateToNgnSnapshot:
        feeCalculation.exchangeRateToNgnSnapshot,
      exchangeRateTimestampSnapshot:
        feeCalculation.exchangeRateTimestampSnapshot,
      exchangeRateProviderSnapshot:
        feeCalculation.exchangeRateProviderSnapshot,
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

    const paymentDocRef = firebaseAdminDb
      .collection(PAYMENT_COLLECTIONS.PAYMENTS)
      .doc(paymentId);
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
    // Reconcile an existing payment before returning its checkout URL.
    const rec = await verifyFlutterwaveTransactionByReference(
      reservationPhase.paymentReference
    );

    const verificationUrlForExistingPayment = () => {
      const url = new URL(redirectUrl);
      url.searchParams.set("tx_ref", reservationPhase.paymentReference);
      return url.toString();
    };

    // Flutterwave confirms payment: send the buyer to verification,
    // not back to checkout.
    if (rec.status === "SUCCESSFUL") {
      return {
        checkoutUrl: verificationUrlForExistingPayment(),
        paymentReference: reservationPhase.paymentReference,
        paymentId: reservationPhase.paymentId,
        amountCharged: reservationPhase.amountCharged,
        currency: "NGN",
        expiresAt: reservationPhase.expiresAt,
        isExistingSession: true,
      };
    }
    
    if (rec.status === "FAILED") {
      const failedRecovery = await firebaseAdminDb.runTransaction(
        async (tx) => {
          const pRef = firebaseAdminDb
            .collection(PAYMENT_COLLECTIONS.PAYMENTS)
            .doc(reservationPhase.paymentId);

          const lRef = firebaseAdminDb
            .collection(PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS)
            .doc(cleanListingId);

          // Read all documents before making any writes.
          const [pSnap, lSnap] = await Promise.all([
            tx.get(pRef),
            tx.get(lRef),
          ]);

          if (!pSnap.exists || !lSnap.exists) {
            return "reservation_lost" as const;
          }

          const currentPayment = pSnap.data() as PaymentRecord;
          const currentListing = lSnap.data() as MarketplaceListing;
          const intent = currentListing.pendingAccessIntent;

          if (currentPayment.paymentStatus === "completed") {
            return "completed" as const;
          }

          const ownsReservation =
            currentPayment.paymentId === reservationPhase.paymentId &&
            currentPayment.paymentReference ===
              reservationPhase.paymentReference &&
            currentPayment.buyerUid === buyerUid &&
            currentPayment.listingId === cleanListingId &&
            intent?.paymentId === reservationPhase.paymentId &&
            intent.paymentReference === reservationPhase.paymentReference &&
            intent.buyerUid === buyerUid &&
            currentListing.listingStatus === "available";

          if (!ownsReservation) {
            return "reservation_lost" as const;
          }

          const failedAt = new Date().toISOString();

          tx.update(pRef, {
            paymentStatus: "failed",
            statusReason:
              rec.errorMessage ||
              "Flutterwave confirmed that the transaction failed or was cancelled.",
            gatewayTransactionId: rec.gatewayTransactionId || null,
            flw_ref: rec.flw_ref || null,
            gatewayResponseRaw: rec.raw || null,
            updatedAt: failedAt,
          });

          tx.update(lRef, {
            pendingAccessIntent: null,
            updatedAt: failedAt,
          });

          return "released" as const;
        }
      );

      if (failedRecovery === "completed") {
        const verificationUrl = new URL(redirectUrl);
        verificationUrl.searchParams.set(
          "tx_ref",
          reservationPhase.paymentReference
        );

        return {
          checkoutUrl: verificationUrl.toString(),
          paymentReference: reservationPhase.paymentReference,
          paymentId: reservationPhase.paymentId,
          amountCharged:
            reservationPhase.listing.pendingAccessIntent?.amountCharged ?? 0,
          currency: "NGN",
          expiresAt: reservationPhase.expiresAt,
          isExistingSession: true,
        };
      }

      if (failedRecovery !== "released") {
        throw new Error(
          "Conflict Error (409): The previous checkout no longer owns the listing reservation. Reconciliation is required."
        );
      }

      // The old transaction definitively failed and its reservation
      // was safely released. A new checkout can now be initiated.
      return await initiateSellerInfoAccessPayment(input);
    }


    // An unresolved gateway response must not cause a second checkout
    // session to be created or be treated as a definitive payment failure.
    if (
      rec.status !== "RESOLVED_NOT_FOUND"
    ) {
      throw new Error(
        "Gateway Reconciliation Pending (504): The existing payment could not be resolved. Keep the current payment reference and retry verification."
      );
    }

    // Flutterwave has definitively failed the transaction or confirmed
    // that the reference does not exist. Release only this payment's
    // reservation, after verifying that it still owns the listing.
    const paymentRef = firebaseAdminDb
      .collection(PAYMENT_COLLECTIONS.PAYMENTS)
      .doc(reservationPhase.paymentId);

    const recoveryResult = await firebaseAdminDb.runTransaction(
      async (tx) => {
        const [paymentSnap, listingSnap] = await Promise.all([
          tx.get(paymentRef),
          tx.get(listingRef),
        ]);

        if (!paymentSnap.exists || !listingSnap.exists) {
          return "reservation_lost" as const;
        }

        const currentPayment = paymentSnap.data() as PaymentRecord;
        const currentListing = listingSnap.data() as MarketplaceListing;
        const intent = currentListing.pendingAccessIntent;

        if (currentPayment.paymentStatus === "completed") {
          return "completed" as const;
        }

        const stillOwnsReservation =
          currentPayment.paymentId === reservationPhase.paymentId &&
          currentPayment.paymentReference === reservationPhase.paymentReference &&
          currentPayment.buyerUid === buyerUid &&
          currentPayment.listingId === cleanListingId &&
          intent?.paymentId === reservationPhase.paymentId &&
          intent.paymentReference === reservationPhase.paymentReference &&
          intent.buyerUid === buyerUid &&
          currentListing.listingStatus === "available";

        if (!stillOwnsReservation) {
          return "reservation_lost" as const;
        }

        const failedAt = new Date().toISOString();
        const paymentStatus =
          rec.status === "FAILED"
            ? "failed"
            : "checkout_creation_failed";

        tx.update(paymentRef, {
          paymentStatus,
          statusReason:
            rec.status === "FAILED"
              ? rec.errorMessage ||
                "Flutterwave confirmed the transaction failed."
              : "Flutterwave confirmed that this payment reference was not found.",
          gatewayTransactionId: rec.gatewayTransactionId || null,
          flw_ref: rec.flw_ref || null,
          gatewayResponseRaw: rec.raw || null,
          updatedAt: failedAt,
        });

        tx.update(listingRef, {
          pendingAccessIntent: null,
          updatedAt: failedAt,
        });

        return "released" as const;
      }
    );

    if (recoveryResult === "completed") {
      return {
        checkoutUrl: verificationUrlForExistingPayment(),
        paymentReference: reservationPhase.paymentReference,
        paymentId: reservationPhase.paymentId,
        amountCharged: reservationPhase.amountCharged,
        currency: "NGN",
        expiresAt: reservationPhase.expiresAt,
        isExistingSession: true,
      };
    }

    if (recoveryResult !== "released") {
      throw new Error(
        "Conflict Error (409): The existing payment no longer owns the listing reservation. Reconciliation is required."
      );
    }

    // Start a fresh checkout only after the old reservation has been
    // safely released.
    return await initiateSellerInfoAccessPayment(input);
  }


  // Handle crash recovery / reconciliation of existing initiating or uncertain intent
  if (reservationPhase.action === "RECONCILE_EXISTING") {
    const rec = await verifyFlutterwaveTransactionByReference(reservationPhase.paymentReference);
    
    if (rec.status === "SUCCESSFUL") {
      // The gateway already confirms payment. Send the buyer to the
      // verification page, never to a fabricated or reopened checkout URL.
      const verificationUrl = new URL(redirectUrl);
      verificationUrl.searchParams.set(
        "tx_ref",
        reservationPhase.paymentReference
      );

      return {
        checkoutUrl: verificationUrl.toString(),
        paymentReference: reservationPhase.paymentReference,
        paymentId: reservationPhase.paymentId,
        amountCharged:
          reservationPhase.listing.pendingAccessIntent?.amountCharged ?? 0,
        currency: "NGN",
        expiresAt: reservationPhase.expiresAt,
        isExistingSession: true,
      };
    }

    if (rec.status === "RESOLVED_NOT_FOUND") {
      // Flutterwave confirms no transaction exists with this reference: Release reservation and start clean 
      const reservationReleased = await firebaseAdminDb.runTransaction(
        async (tx) => {
          const pRef = firebaseAdminDb
            .collection(PAYMENT_COLLECTIONS.PAYMENTS)
            .doc(reservationPhase.paymentId);

          const lRef = firebaseAdminDb
            .collection(PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS)
            .doc(cleanListingId);

          // All reads must happen before transaction writes.
          const [pSnap, lSnap] = await Promise.all([
            tx.get(pRef),
            tx.get(lRef),
          ]);

          if (!pSnap.exists || !lSnap.exists) {
            return false;
          }

          const currentPayment = pSnap.data() as PaymentRecord;
          const currentListing = lSnap.data() as MarketplaceListing;
          const currentIntent = currentListing.pendingAccessIntent;

          // Never downgrade a payment already confirmed as completed.
          if (currentPayment.paymentStatus === "completed") {
            return false;
          }

          const stillOwnsReservation =
            currentPayment.paymentId === reservationPhase.paymentId &&
            currentPayment.paymentReference === reservationPhase.paymentReference &&
            currentIntent?.paymentId === reservationPhase.paymentId &&
            currentIntent.paymentReference === reservationPhase.paymentReference &&
            currentIntent.buyerUid === buyerUid;

          tx.update(pRef, {
            paymentStatus: "checkout_creation_failed",
            statusReason:
              "Flutterwave reconciliation confirmed that the transaction does not exist.",
            updatedAt: new Date().toISOString(),
          });

          // Only clear a reservation that still belongs to this exact payment.
          if (stillOwnsReservation) {
            tx.update(lRef, {
              pendingAccessIntent: null,
              updatedAt: new Date().toISOString(),
            });
          }

          return stillOwnsReservation;
        }
      );

      if (!reservationReleased) {
        throw new Error(
          "Conflict Error (409): The previous checkout no longer owns this listing reservation. Please retry the payment request."
        );
      }

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
  const paymentDocRef = firebaseAdminDb
    .collection(PAYMENT_COLLECTIONS.PAYMENTS)
    .doc(paymentRecord.paymentId);

  
  // Phase 3: Handle Gateway Outcome Atomically
  const buildVerificationUrl = () => {
    const verificationUrl = new URL(redirectUrl);
    verificationUrl.searchParams.set(
      "tx_ref",
      paymentRecord.paymentReference
    );
    return verificationUrl.toString();
  };

  type GatewayCommitResult =
    | "owned"
    | "reservation_lost"
    | "completed";

  const commitResult = async (
    outcome: "SUCCESS" | "DEFINITIVE_FAILURE" | "INDETERMINATE_TIMEOUT"
  ): Promise<GatewayCommitResult> => {
    return firebaseAdminDb.runTransaction(async (tx) => {
      // All reads must happen before any writes.
      const [paymentSnap, listingSnap] = await Promise.all([
        tx.get(paymentDocRef),
        tx.get(listingRef),
      ]);

      if (!paymentSnap.exists || !listingSnap.exists) {
        throw new Error(
          "Lookup Error: Payment or listing disappeared during checkout."
        );
      }

      const currentPayment = paymentSnap.data() as PaymentRecord;
      const currentListing = listingSnap.data() as MarketplaceListing;
      const intent = currentListing.pendingAccessIntent;

      if (
        currentPayment.paymentId !== paymentRecord.paymentId ||
        currentPayment.paymentReference !== paymentRecord.paymentReference ||
        currentPayment.buyerUid !== buyerUid ||
        currentPayment.listingId !== cleanListingId
      ) {
        throw new Error(
          "Security Error: Checkout response does not match its payment record."
        );
      }

      if (currentPayment.paymentStatus === "completed") {
        return "completed";
      }

      const reservationMatches =
        intent?.paymentId === paymentRecord.paymentId &&
        intent.paymentReference === paymentRecord.paymentReference &&
        intent.buyerUid === buyerUid;

      const now = new Date();
      const transactionNow = now.toISOString();

      if (outcome === "SUCCESS") {
        if (gatewayResult.outcome !== "SUCCESS") {
          throw new Error("Unexpected gateway outcome.");
        }

        const reservationStillValid =
          reservationMatches &&
          currentListing.listingStatus === "available" &&
          typeof intent?.expiresAt === "string" &&
          new Date(intent.expiresAt).getTime() > now.getTime();

        tx.update(paymentDocRef, {
          paymentStatus: reservationStillValid
            ? "pending"
            : "checkout_creation_uncertain",
          checkoutUrl: gatewayResult.checkoutUrl,
          gatewayTransactionId:
            gatewayResult.gatewayTransactionId || null,
          flw_ref: gatewayResult.flw_ref || null,
          gatewayResponseRaw: gatewayResult.raw || null,
          ...(!reservationStillValid
            ? {
                statusReason:
                  "Flutterwave created checkout, but this payment no longer owns a valid listing reservation. Reconciliation is required.",
              }
            : {}),
          updatedAt: transactionNow,
        });

        if (reservationStillValid) {
          tx.update(listingRef, {
            "pendingAccessIntent.status": "pending",
            "pendingAccessIntent.checkoutUrl": gatewayResult.checkoutUrl,
            updatedAt: transactionNow,
          });

          return "owned";
        }

        // Keep the payment record for reconciliation. Never clear a
        // reservation that now belongs to another payment.
        return "reservation_lost";
      }

      if (outcome === "DEFINITIVE_FAILURE") {
        if (gatewayResult.outcome !== "DEFINITIVE_FAILURE") {
          throw new Error("Unexpected gateway outcome.");
        }

        tx.update(paymentDocRef, {
          paymentStatus: "checkout_creation_failed",
          statusReason: gatewayResult.message,
          gatewayResponseRaw: gatewayResult.raw || null,
          updatedAt: transactionNow,
        });

        if (reservationMatches) {
          tx.update(listingRef, {
            pendingAccessIntent: null,
            updatedAt: transactionNow,
          });

          return "owned";
        }

        return "reservation_lost";
      }

      if (gatewayResult.outcome !== "INDETERMINATE_TIMEOUT") {
        throw new Error("Unexpected gateway outcome.");
      }

      // An uncertain request must retain its reference for reconciliation.
      tx.update(paymentDocRef, {
        paymentStatus: "checkout_creation_uncertain",
        statusReason: gatewayResult.message,
        updatedAt: transactionNow,
      });

      if (reservationMatches) {
        tx.update(listingRef, {
          "pendingAccessIntent.status": "checkout_creation_uncertain",
          updatedAt: transactionNow,
        });

        return "owned";
      }

      return "reservation_lost";
    });
  };

  if (gatewayResult.outcome === "SUCCESS") {
    const result = await commitResult("SUCCESS");

    if (result === "completed") {
      return {
        checkoutUrl: buildVerificationUrl(),
        paymentReference: paymentRecord.paymentReference,
        paymentId: paymentRecord.paymentId,
        amountCharged: paymentRecord.amountCharged,
        currency: "NGN",
        expiresAt: paymentRecord.expiresAt!,
        isExistingSession: true,
      };
    }

    if (result === "reservation_lost") {
      throw new Error(
        "Conflict Error (409): Checkout was created, but this payment no longer owns a valid listing reservation. Reconciliation is required."
      );
    }

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
    const result = await commitResult("DEFINITIVE_FAILURE");

    if (result === "completed") {
      return {
        checkoutUrl: buildVerificationUrl(),
        paymentReference: paymentRecord.paymentReference,
        paymentId: paymentRecord.paymentId,
        amountCharged: paymentRecord.amountCharged,
        currency: "NGN",
        expiresAt: paymentRecord.expiresAt!,
        isExistingSession: true,
      };
    }

    if (result === "reservation_lost") {
      throw new Error(
        "Conflict Error (409): Checkout failed, but the listing reservation now belongs to another payment."
      );
    }

    throw new Error(
      `Flutterwave Gateway Error: ${gatewayResult.message}`
    );
  }

  const result = await commitResult("INDETERMINATE_TIMEOUT");

  if (result === "completed") {
    return {
      checkoutUrl: buildVerificationUrl(),
      paymentReference: paymentRecord.paymentReference,
      paymentId: paymentRecord.paymentId,
      amountCharged: paymentRecord.amountCharged,
      currency: "NGN",
      expiresAt: paymentRecord.expiresAt!,
      isExistingSession: true,
    };
  }

  if (result === "reservation_lost") {
    throw new Error(
      "Conflict Error (409): Checkout status is uncertain, and this payment no longer owns the listing reservation. Reconciliation is required."
    );
  }

  throw new Error(
    `Gateway Timeout (504): ${gatewayResult.message}. Keep payment reference "${paymentRecord.paymentReference}" for reconciliation.`
  );
}

/**
 * Reconciles and finalizes a Seller Information Access payment.
 * Invoked by redirect callback, webhook, or explicit verification request.
 * Guarantees finalization idempotency, strict exact amount check, reservation validation,
 * and immutable SellerAccessRecord creation.
 */

export async function verifyAndFinalizeSellerInfoAccessPayment(
  paymentReference: string,
  authenticatedBuyerUid: string
): Promise<FinalizeSellerAccessPaymentResult> {
  if (
    typeof paymentReference !== "string" ||
    !paymentReference.trim()
  ) {
    throw new Error(
      "Validation Error: paymentReference is required for verification."
    );
  }

  if (
    typeof authenticatedBuyerUid !== "string" ||
    !authenticatedBuyerUid.trim()
  ) {
    throw new Error(
      "Authentication Error: An authenticated buyer is required."
    );
  }

  const cleanPayRef = paymentReference.trim();
  const buyerUid = authenticatedBuyerUid.trim();

  const paymentDocRef = firebaseAdminDb
    .collection(PAYMENT_COLLECTIONS.PAYMENTS)
    .doc(cleanPayRef);

  // Read the payment before contacting Flutterwave.
  const initialPaymentSnap = await paymentDocRef.get();

  if (!initialPaymentSnap.exists) {
    throw new Error(
      `Lookup Error: PaymentRecord for reference "${cleanPayRef}" was not found.`
    );
  }

  const initialPayment =
    initialPaymentSnap.data() as PaymentRecord;

  // Enforce ownership and payment purpose before contacting the gateway.
  if (initialPayment.buyerUid !== buyerUid) {
    throw new Error(
      "Authorization Error: You cannot verify another buyer's payment."
    );
  }

  if (
    initialPayment.paymentId !== cleanPayRef ||
    initialPayment.paymentReference !== cleanPayRef ||
    initialPayment.paymentPurpose !== "SELLER_INFORMATION_ACCESS" ||
    initialPayment.paymentGateway !== "FLUTTERWAVE" ||
    initialPayment.currency !== "NGN" ||
    typeof initialPayment.listingId !== "string" ||
    !initialPayment.listingId.trim()
  ) {
    throw new Error(
      "Security Error: Invalid seller-information payment record."
    );
  }

  const listingId = initialPayment.listingId;

  const listingRef = firebaseAdminDb
    .collection(PAYMENT_COLLECTIONS.MARKETPLACE_LISTINGS)
    .doc(listingId);

  const accessId = `SAR-${listingId}-${buyerUid}`;

  const accessRef = firebaseAdminDb
    .collection(PAYMENT_COLLECTIONS.SELLER_ACCESS_RECORDS)
    .doc(accessId);

  // Reconcile against Flutterwave using the trusted server-side service.
  // An indeterminate response must never grant access.
  const rec =
    await verifyFlutterwaveTransactionByReference(cleanPayRef);

  const nowIso = new Date().toISOString();

  return firebaseAdminDb.runTransaction(async (tx) => {
    // Read every document needed by this transaction before any writes.
    const [paymentSnap, listingSnap, accessSnap] =
      await Promise.all([
        tx.get(paymentDocRef),
        tx.get(listingRef),
        tx.get(accessRef),
      ]);

    if (!paymentSnap.exists) {
      throw new Error(
        `Lookup Error: PaymentRecord "${cleanPayRef}" does not exist.`
      );
    }

    const currentPayment =
      paymentSnap.data() as PaymentRecord;

    if (
      currentPayment.buyerUid !== buyerUid ||
      currentPayment.paymentId !== cleanPayRef ||
      currentPayment.paymentReference !== cleanPayRef ||
      currentPayment.listingId !== listingId ||
      currentPayment.paymentPurpose !== "SELLER_INFORMATION_ACCESS" ||
      currentPayment.paymentGateway !== "FLUTTERWAVE" ||
      currentPayment.currency !== "NGN"
    ) {
      throw new Error(
        "Authorization Error: Payment ownership or payment details changed."
      );
    }

    const currentListing = listingSnap.exists
      ? (listingSnap.data() as MarketplaceListing)
      : null;

    const existingAccess = accessSnap.exists
      ? (accessSnap.data() as SellerAccessRecord)
      : null;

    const accessMatchesPayment = (
      access: SellerAccessRecord
    ): boolean =>
      access.accessId === accessId &&
      access.listingId === listingId &&
      (access.buyerUid ?? access.buyerId) === buyerUid &&
      access.paymentId === cleanPayRef &&
      access.paymentReference === cleanPayRef &&
      access.accessStatus === "active" &&
      access.currency === "NGN";

    // Idempotent recovery: completed payments must have the
    // corresponding access record. Never create a replacement silently.
    if (currentPayment.paymentStatus === "completed") {
      if (!existingAccess || !accessMatchesPayment(existingAccess)) {
        throw new Error(
          "State Error: The payment is completed but its matching access record is missing or inconsistent. Administrative reconciliation is required."
        );
      }

      return {
        success: true,
        paymentStatus: "completed",
        paymentRecord: currentPayment,
        accessRecord: existingAccess,
      };
    }

    if (!currentListing) {
      throw new Error(
        `Lookup Error: Listing "${listingId}" does not exist.`
      );
    }

    const currentIntent =
      currentListing.pendingAccessIntent ?? null;

    const reservationMatches =
      currentIntent !== null &&
      currentIntent.paymentReference === cleanPayRef &&
      currentIntent.paymentId === cleanPayRef &&
      currentIntent.buyerUid === buyerUid;

    // Only release the reservation belonging to this exact payment.
    const releaseOwnReservation = () => {
      if (
        reservationMatches &&
        currentListing.listingStatus === "available"
      ) {
        tx.update(listingRef, {
          pendingAccessIntent: null,
          updatedAt: nowIso,
        });
      }
    };

    // A verified failure can be recorded, but it must not clear
    // another payment's reservation.
    if (rec.status === "FAILED") {
      tx.update(paymentDocRef, {
        paymentStatus: "failed",
        statusReason:
          rec.errorMessage ||
          "Flutterwave confirmed that the payment failed or was cancelled.",
        gatewayTransactionId:
          rec.gatewayTransactionId || null,
        flw_ref: rec.flw_ref || null,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      releaseOwnReservation();

      return {
        success: false,
        paymentStatus: "failed",
        paymentRecord: {
          ...currentPayment,
          paymentStatus: "failed",
        },
        statusReason: "Payment failed at the gateway.",
      };
    }

    // Pending, not-found, and indeterminate results do not grant access.
    if (rec.status !== "SUCCESSFUL") {
      return {
        success: false,
        paymentStatus: currentPayment.paymentStatus,
        paymentRecord: currentPayment,
        statusReason:
          rec.errorMessage ||
          "Payment has not been confirmed successful. Please retry verification later.",
      };
    }

    // Verify currency before considering fulfillment.
    if (rec.currency !== "NGN") {
      const reason =
        `Currency mismatch: Expected NGN, received ${rec.currency ?? "unknown"}.`;

      tx.update(paymentDocRef, {
        paymentStatus: "failed",
        statusReason: reason,
        gatewayTransactionId:
          rec.gatewayTransactionId || null,
        flw_ref: rec.flw_ref || null,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      releaseOwnReservation();

      return {
        success: false,
        paymentStatus: "failed",
        paymentRecord: {
          ...currentPayment,
          paymentStatus: "failed",
        },
        statusReason: reason,
      };
    }

    // Compare the actual gateway amount to the recorded server-calculated fee.
    const expectedAmount = Number(
      currentPayment.amountCharged ?? currentPayment.amount
    );

    const verifiedAmount = Number(rec.amount);

    if (
      !Number.isFinite(expectedAmount) ||
      expectedAmount <= 0 ||
      !Number.isFinite(verifiedAmount) ||
      verifiedAmount !== expectedAmount
    ) {
      const reason =
        `Amount mismatch: Verified ₦${verifiedAmount} does not equal expected ₦${expectedAmount}.`;

      tx.update(paymentDocRef, {
        paymentStatus: "amount_mismatch",
        statusReason: reason,
        gatewayTransactionId:
          rec.gatewayTransactionId || null,
        flw_ref: rec.flw_ref || null,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      releaseOwnReservation();

      return {
        success: false,
        paymentStatus: "amount_mismatch",
        paymentRecord: {
          ...currentPayment,
          paymentStatus: "amount_mismatch",
        },
        statusReason: reason,
      };
    }

    // If an access record already exists, never overwrite it with
    // a different payment's record.
    if (existingAccess) {
      if (accessMatchesPayment(existingAccess)) {
        const reconciledPayment: PaymentRecord = {
          ...currentPayment,
          paymentStatus: "completed",
          gatewayTransactionId:
            rec.gatewayTransactionId ||
            currentPayment.gatewayTransactionId,
          flw_ref: rec.flw_ref || currentPayment.flw_ref,
          gatewayResponseRaw:
            rec.raw || currentPayment.gatewayResponseRaw,
          completedAt: currentPayment.completedAt || nowIso,
          paidAt: currentPayment.paidAt || nowIso,
          updatedAt: nowIso,
        };

        tx.set(paymentDocRef, reconciledPayment);

        if (reservationMatches) {
          tx.update(listingRef, {
            listingStatus: "under_negotiation",
            pendingAccessIntent: null,
            updatedAt: nowIso,
          });
        }

        return {
          success: true,
          paymentStatus: "completed",
          paymentRecord: reconciledPayment,
          accessRecord: existingAccess,
        };
      }

      // Another access grant already occupies this deterministic
      // buyer/listing ID. Successful payment requires reconciliation;
      // it must not overwrite that record.
      tx.update(paymentDocRef, {
        paymentStatus: "paid_unfulfillable",
        statusReason:
          "Payment succeeded, but an inconsistent or different seller-access record already exists. Administrative reconciliation/refund is required.",
        gatewayTransactionId:
          rec.gatewayTransactionId || null,
        flw_ref: rec.flw_ref || null,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      releaseOwnReservation();

      return {
        success: false,
        paymentStatus: "paid_unfulfillable",
        paymentRecord: {
          ...currentPayment,
          paymentStatus: "paid_unfulfillable",
        },
        statusReason:
          "Payment was verified, but seller access requires administrative reconciliation.",
      };
    }

    // A successful payment can only be fulfilled while its own
    // unexpired reservation is still valid.
    const expiresAtMs = currentIntent
      ? new Date(currentIntent.expiresAt).getTime()
      : Number.NaN;

    const isIntentValid =
      reservationMatches &&
      currentIntent?.currency === "NGN" &&
      currentListing.listingStatus === "available" &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs > Date.now() &&
      currentIntent.amountCharged === expectedAmount;

    if (!isIntentValid) {
      const reason =
        "Payment succeeded, but the listing reservation expired, changed, or no longer belongs to this payment. Administrative reconciliation/refund is required.";

      tx.update(paymentDocRef, {
        paymentStatus: "paid_unfulfillable",
        statusReason: reason,
        gatewayTransactionId:
          rec.gatewayTransactionId || null,
        flw_ref: rec.flw_ref || null,
        gatewayResponseRaw: rec.raw || null,
        updatedAt: nowIso,
      });

      // Clear only our own expired reservation when the listing
      // is still available. Never touch another buyer's reservation.
      if (
        reservationMatches &&
        currentListing.listingStatus === "available"
      ) {
        tx.update(listingRef, {
          pendingAccessIntent: null,
          updatedAt: nowIso,
        });
      }

      return {
        success: false,
        paymentStatus: "paid_unfulfillable",
        paymentRecord: {
          ...currentPayment,
          paymentStatus: "paid_unfulfillable",
        },
        statusReason: reason,
      };
    }

    const accessRecord: SellerAccessRecord = {
      accessId,
      listingId,
      lotId: currentListing.lotId,
      buyerId: buyerUid,
      buyerUid,
      sellerHolderId: currentListing.sellerHolderId,
      sellerId: currentListing.sellerHolderId,
      paymentId: cleanPayRef,
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

    const updatedPayment: PaymentRecord = {
      ...currentPayment,
      paymentStatus: "completed",
      gatewayTransactionId:
        rec.gatewayTransactionId ||
        currentPayment.gatewayTransactionId,
      flw_ref: rec.flw_ref || currentPayment.flw_ref,
      gatewayResponseRaw:
        rec.raw || currentPayment.gatewayResponseRaw,
      completedAt: nowIso,
      paidAt: nowIso,
      updatedAt: nowIso,
    };

    // All needed reads have completed. The access grant, payment
    // completion, and listing transition now commit atomically.
    tx.create(accessRef, accessRecord);
    tx.set(paymentDocRef, updatedPayment);
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

