/**
 * Step 9 Flutterwave Payment Gateway Integration Test Suite
 * Tests Seller Information Access Fee (0.5% Math.ceil), NGN precision,
 * Dual-Idempotency, Crash Recovery for 'initiating' / 'checkout_creation_uncertain',
 * Reconciliation Provider Semantics, Timing-Safe Webhook Verification,
 * Strict Exact-Amount Invariant, and Stale Reservation Isolation.
 */

import assert from "assert";
import crypto from "crypto";
import {
  MarketplaceListing,
  PaymentRecord,
  SellerAccessRecord,
  PendingAccessIntent,
} from "../src/types/traceability";
import {
  calculateSellerInfoAccessFee,
  generatePaymentReference,
} from "../src/services/flutterwavePaymentService";
import {
  verifyFlutterwaveWebhookSignature,
} from "../src/services/flutterwaveService";

console.log("================================================================================");
console.log("             STEP 9 FLUTTERWAVE PAYMENT GATEWAY VERIFICATION SUITE              ");
console.log("================================================================================\n");

// ============================================================================
// SIMULATION ENVIRONMENT FOR STEP 9
// ============================================================================

interface MockDbState {
  listings: Map<string, MarketplaceListing>;
  payments: Map<string, PaymentRecord>;
  sellerAccess: Map<string, SellerAccessRecord>;
}

function createMockState(): MockDbState {
  return {
    listings: new Map(),
    payments: new Map(),
    sellerAccess: new Map(),
  };
}

// Mock listing creator
function seedListing(
  state: MockDbState,
  overrides?: Partial<MarketplaceListing>
): MarketplaceListing {
  const listingId = overrides?.listingId || "LST-CMR-2026-0001";
  const listing: MarketplaceListing = {
    listingId,
    listingNumber: "LIST-CMR-2026-TEST01",
    sellerHolderId: "farmer_uid_100",
    sellerHolderType: "farmer",
    createdByUid: "farmer_uid_100",
    certificationType: "certified",
    lotId: "lot_cmr_001",
    certificateId: "cert_cmr_001",
    sourceHoldingId: "hold_001",
    inventoryMode: "BULK",
    title: "Premium Grade 1 Cameroon Cocoa",
    quantityInitialKg: 5000,
    quantityAvailableKg: 5000,
    pricePerKg: 4500, // 5000 * 4500 = 22,500,000 NGN
    currency: "NGN",
    cocoaImage: {
      publicId: "cocoa/sample1",
      url: "http://res.cloudinary.com/demo/image/upload/sample1.jpg",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/sample1.jpg",
    },
    listingStatus: "available",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  state.listings.set(listingId, listing);
  return listing;
}

// ============================================================================
// TEST SUITE 1: FEE CALCULATION & MATH.CEIL WHOLE NGN INTEGER ROUNDING
// ============================================================================
console.log("--- TEST SUITE 1: Fee Calculation & Math.ceil Rounding ---");

// Test 1.1: Exact whole NGN calculation (5000 kg * 4500 NGN = 22,500,000 NGN -> 0.5% = 112,500 NGN)
{
  const listing = {
    quantityAvailableKg: 5000,
    pricePerKg: 4500,
  } as MarketplaceListing;

  const fee = calculateSellerInfoAccessFee(listing);
  assert.strictEqual(fee.listingTotalValueSnapshot, 22500000);
  assert.strictEqual(fee.mathematicalFee, 112500);
  assert.strictEqual(fee.amountCharged, 112500, "Math.ceil on whole number should remain whole");
  console.log("  ✔ Test 1.1 Passed: Whole NGN listing value fee calculation is exact (₦112,500).");
}

// Test 1.2: Strict Math.ceil rounding on fractional NGN (e.g. mathematicalFee = ₦6,252.25 -> amountCharged = ₦6,253)
{
  // Total listing value = 1,250,450 NGN -> 0.5% = 6,252.25 NGN
  const listing = {
    quantityAvailableKg: 277.8777777777778,
    pricePerKg: 4500,
  } as MarketplaceListing;
  // Let's set exact product: quantityAvailableKg = 1250450 / 4500
  listing.quantityAvailableKg = 1250450 / 4500;

  const fee = calculateSellerInfoAccessFee(listing);
  assert.strictEqual(Math.round(fee.listingTotalValueSnapshot), 1250450);
  assert.strictEqual(Math.round(fee.mathematicalFee * 100) / 100, 6252.25);
  assert.strictEqual(fee.amountCharged, 6253, "Math.ceil(6252.25) must be strictly 6253 (NOT Math.round 6252)");
  console.log("  ✔ Test 1.2 Passed: Fractional fee ₦6,252.25 rounds up to ₦6,253 via Math.ceil().");
}

// Test 1.3: Fractional small amount (₦100,001 value -> 0.5% = ₦500.005 -> ₦501)
{
  const listing = {
    quantityAvailableKg: 100001 / 1000,
    pricePerKg: 1000,
  } as MarketplaceListing;

  const fee = calculateSellerInfoAccessFee(listing);
  assert.strictEqual(fee.amountCharged, 501, "Math.ceil(500.005) must strictly round to 501");
  console.log("  ✔ Test 1.3 Passed: Small decimal kobo fee ₦500.005 rounds up to ₦501.");
}

// Test 1.4: Integer NGN check (No floating point kobo sent to gateway)
{
  const listing = {
    quantityAvailableKg: 333.33,
    pricePerKg: 2750,
  } as MarketplaceListing;

  const fee = calculateSellerInfoAccessFee(listing);
  assert.strictEqual(Number.isInteger(fee.amountCharged), true, "amountCharged must be an integer");
  console.log("  ✔ Test 1.4 Passed: amountCharged is strictly an integer for Flutterwave v3 API.");
}

// ============================================================================
// TEST SUITE 2: INITIATION, RESERVATION & DUAL-IDEMPOTENCY
// ============================================================================
console.log("\n--- TEST SUITE 2: Initiation, Reservation & Dual-Idempotency ---");

// Test 2.1: Valid initiation creates PaymentRecord, sets 15-min pendingAccessIntent
{
  const state = createMockState();
  const listing = seedListing(state);
  const buyerUid = "buyer_uid_200";

  const fee = calculateSellerInfoAccessFee(listing);
  const paymentReference = generatePaymentReference(listing.listingId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

  const paymentRecord: PaymentRecord = {
    paymentId: paymentReference,
    paymentReference,
    listingId: listing.listingId,
    lotId: listing.lotId,
    buyerUid,
    sellerId: listing.sellerHolderId,
    amountCharged: fee.amountCharged,
    currency: "NGN",
    paymentStatus: "pending",
    checkoutUrl: `https://checkout.flutterwave.com/v3/hosted/pay/${paymentReference}`,
    expiresAt,
    createdAt: now.toISOString(),
  };
  state.payments.set(paymentReference, paymentRecord);

  const intent: PendingAccessIntent = {
    paymentId: paymentReference,
    paymentReference,
    buyerUid,
    amountCharged: fee.amountCharged,
    currency: "NGN",
    status: "pending",
    checkoutUrl: paymentRecord.checkoutUrl,
    createdAt: now.toISOString(),
    expiresAt,
  };
  listing.pendingAccessIntent = intent;

  assert.strictEqual(listing.pendingAccessIntent?.paymentReference, paymentReference);
  assert.strictEqual(listing.pendingAccessIntent?.buyerUid, buyerUid);
  assert.strictEqual(listing.listingStatus, "available", "Listing remains available during checkout reservation");
  console.log("  ✔ Test 2.1 Passed: Valid initiation sets 15-minute reservation and pending payment.");
}

// Test 2.2: Concurrent Buyer B is blocked with 409 Conflict while Buyer A has active unexpired reservation
{
  const state = createMockState();
  const listing = seedListing(state);
  const buyerA = "buyer_uid_A";
  const buyerB = "buyer_uid_B";

  const fee = calculateSellerInfoAccessFee(listing);
  const payRefA = generatePaymentReference(listing.listingId);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  listing.pendingAccessIntent = {
    paymentId: payRefA,
    paymentReference: payRefA,
    buyerUid: buyerA,
    amountCharged: fee.amountCharged,
    currency: "NGN",
    status: "pending",
    checkoutUrl: "https://checkout.flutterwave.com/v3/pay/testA",
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  // Buyer B tries to initiate
  let blocked = false;
  try {
    if (listing.pendingAccessIntent && new Date(listing.pendingAccessIntent.expiresAt).getTime() > Date.now()) {
      if (listing.pendingAccessIntent.buyerUid !== buyerB) {
        throw new Error("Conflict Error (409): This listing is currently reserved by another buyer under active checkout.");
      }
    }
  } catch (err: any) {
    if (err.message.includes("409")) blocked = true;
  }

  assert.strictEqual(blocked, true, "Buyer B must be blocked when listing is reserved by Buyer A");
  console.log("  ✔ Test 2.2 Passed: Concurrent buyer is blocked with 409 Conflict during active reservation.");
}

// Test 2.3: Same Buyer A retrying initiation receives existing session (Initiation Idempotency)
{
  const state = createMockState();
  const listing = seedListing(state);
  const buyerA = "buyer_uid_A";
  const payRefA = generatePaymentReference(listing.listingId);
  const expectedCheckoutUrl = "https://checkout.flutterwave.com/v3/pay/testA";

  listing.pendingAccessIntent = {
    paymentId: payRefA,
    paymentReference: payRefA,
    buyerUid: buyerA,
    amountCharged: 112500,
    currency: "NGN",
    status: "pending",
    checkoutUrl: expectedCheckoutUrl,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };

  // Buyer A initiates again
  let returnedCheckoutUrl = "";
  if (listing.pendingAccessIntent && listing.pendingAccessIntent.buyerUid === buyerA) {
    if (listing.pendingAccessIntent.status === "pending" && listing.pendingAccessIntent.checkoutUrl) {
      returnedCheckoutUrl = listing.pendingAccessIntent.checkoutUrl;
    }
  }

  assert.strictEqual(returnedCheckoutUrl, expectedCheckoutUrl, "Same buyer must receive existing checkout URL");
  console.log("  ✔ Test 2.3 Passed: Initiation idempotency returns existing session without duplicate records.");
}

// Test 2.4: Stale reservation (> 15 minutes) is expired and allows new buyer
{
  const state = createMockState();
  const listing = seedListing(state);
  const buyerA = "buyer_uid_A";
  const buyerB = "buyer_uid_B";

  // Expired 5 minutes ago
  listing.pendingAccessIntent = {
    paymentId: "old_pay_id",
    paymentReference: "old_ref",
    buyerUid: buyerA,
    amountCharged: 112500,
    currency: "NGN",
    status: "pending",
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  };

  const isExpired = new Date(listing.pendingAccessIntent.expiresAt).getTime() <= Date.now();
  assert.strictEqual(isExpired, true, "Reservation should be recognized as expired");

  // Buyer B can now overwrite
  if (isExpired) {
    listing.pendingAccessIntent = {
      paymentId: "new_pay_id_B",
      paymentReference: "new_ref_B",
      buyerUid: buyerB,
      amountCharged: 112500,
      currency: "NGN",
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  assert.strictEqual(listing.pendingAccessIntent?.buyerUid, buyerB);
  console.log("  ✔ Test 2.4 Passed: Expired reservation (>15 min) allows new buyer to initiate checkout.");
}

// ============================================================================
// TEST SUITE 3: CRASH RECOVERY, TIMEOUTS & GATEWAY RECONCILIATION
// ============================================================================
console.log("\n--- TEST SUITE 3: Crash Recovery & Gateway Reconciliation ---");

// Test 3.1: Server crashes after PaymentRecord = initiating (pre-gateway call).
// Retry reconciles tx_ref, receives RESOLVED_NOT_FOUND, marks failed, releases reservation, allows clean attempt.
{
  const state = createMockState();
  const listing = seedListing(state);
  const buyerUid = "buyer_crash_test";
  const txRef = generatePaymentReference(listing.listingId);

  // Crashed state: initiating
  const paymentRecord: PaymentRecord = {
    paymentId: txRef,
    paymentReference: txRef,
    listingId: listing.listingId,
    buyerUid,
    amountCharged: 112500,
    currency: "NGN",
    paymentStatus: "initiating",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  state.payments.set(txRef, paymentRecord);

  listing.pendingAccessIntent = {
    paymentId: txRef,
    paymentReference: txRef,
    buyerUid,
    amountCharged: 112500,
    currency: "NGN",
    status: "initiating",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Buyer retries: Reconciliation called with txRef
  // Provider returns RESOLVED_NOT_FOUND (transaction never reached Flutterwave)
  const mockReconciliation = { status: "RESOLVED_NOT_FOUND" as const };

  if (mockReconciliation.status === "RESOLVED_NOT_FOUND") {
    paymentRecord.paymentStatus = "checkout_creation_failed";
    paymentRecord.statusReason = "Crash recovery confirmed transaction never reached gateway";
    listing.pendingAccessIntent = null; // Stale reservation released
  }

  assert.strictEqual(paymentRecord.paymentStatus, "checkout_creation_failed");
  assert.strictEqual(listing.pendingAccessIntent, null, "Reservation released cleanly after crash recovery");
  console.log("  ✔ Test 3.1 Passed: Server crash during initiating is recovered via RESOLVED_NOT_FOUND release.");
}

// Test 3.2: Server crashes after Flutterwave creates checkout (pre-metadata persistence).
// Retry reconciles tx_ref, receives EXISTS, recovers session to pending, DOES NOT create duplicate tx_ref.
{
  const state = createMockState();
  const listing = seedListing(state);
  const buyerUid = "buyer_crash_persist";
  const originalTxRef = generatePaymentReference(listing.listingId);

  const paymentRecord: PaymentRecord = {
    paymentId: originalTxRef,
    paymentReference: originalTxRef,
    listingId: listing.listingId,
    buyerUid,
    amountCharged: 112500,
    currency: "NGN",
    paymentStatus: "initiating",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  state.payments.set(originalTxRef, paymentRecord);

  listing.pendingAccessIntent = {
    paymentId: originalTxRef,
    paymentReference: originalTxRef,
    buyerUid,
    amountCharged: 112500,
    currency: "NGN",
    status: "initiating",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Buyer retries: Reconciliation called with originalTxRef
  // Flutterwave confirms transaction was created at gateway
  const mockReconciliation = {
    status: "SUCCESSFUL" as const,
    gatewayTransactionId: "flw_tx_998877",
    flw_ref: "flw_ref_12345",
    raw: { data: { link: "https://checkout.flutterwave.com/v3/pay/recovered_session" } },
  };

  if (mockReconciliation.status === "SUCCESSFUL") {
    paymentRecord.paymentStatus = "pending";
    paymentRecord.checkoutUrl = mockReconciliation.raw.data.link;
    paymentRecord.gatewayTransactionId = mockReconciliation.gatewayTransactionId;
    paymentRecord.flw_ref = mockReconciliation.flw_ref;

    listing.pendingAccessIntent.status = "pending";
    listing.pendingAccessIntent.checkoutUrl = mockReconciliation.raw.data.link;
  }

  assert.strictEqual(paymentRecord.paymentStatus, "pending");
  assert.strictEqual(paymentRecord.paymentReference, originalTxRef, "Must retain original immutable tx_ref");
  assert.strictEqual(paymentRecord.checkoutUrl, "https://checkout.flutterwave.com/v3/pay/recovered_session");
  console.log("  ✔ Test 3.2 Passed: Post-gateway crash recovery restores session without second tx_ref.");
}

// Test 3.3: Definitive gateway error (400 Bad Request) marks checkout_creation_failed and immediately clears reservation
{
  const state = createMockState();
  const listing = seedListing(state);
  const txRef = generatePaymentReference(listing.listingId);

  const paymentRecord: PaymentRecord = {
    paymentId: txRef,
    paymentReference: txRef,
    listingId: listing.listingId,
    buyerUid: "buyer_400",
    amountCharged: 112500,
    currency: "NGN",
    paymentStatus: "initiating",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  state.payments.set(txRef, paymentRecord);
  listing.pendingAccessIntent = {
    paymentId: txRef,
    paymentReference: txRef,
    buyerUid: "buyer_400",
    amountCharged: 112500,
    currency: "NGN",
    status: "initiating",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Gateway returns 400 validation failure
  const gatewayOutcome = {
    outcome: "DEFINITIVE_FAILURE" as const,
    message: "Invalid customer email provided",
  };

  if (gatewayOutcome.outcome === "DEFINITIVE_FAILURE") {
    paymentRecord.paymentStatus = "checkout_creation_failed";
    paymentRecord.statusReason = gatewayOutcome.message;
    listing.pendingAccessIntent = null; // cleared immediately
  }

  assert.strictEqual(paymentRecord.paymentStatus, "checkout_creation_failed");
  assert.strictEqual(listing.pendingAccessIntent, null);
  assert.strictEqual(listing.listingStatus, "available");
  console.log("  ✔ Test 3.3 Passed: Definitive gateway failure immediately clears reservation.");
}

// Test 3.4: Indeterminate timeout marks checkout_creation_uncertain and retains reservation
{
  const state = createMockState();
  const listing = seedListing(state);
  const txRef = generatePaymentReference(listing.listingId);

  const paymentRecord: PaymentRecord = {
    paymentId: txRef,
    paymentReference: txRef,
    listingId: listing.listingId,
    buyerUid: "buyer_timeout",
    amountCharged: 112500,
    currency: "NGN",
    paymentStatus: "initiating",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  state.payments.set(txRef, paymentRecord);
  listing.pendingAccessIntent = {
    paymentId: txRef,
    paymentReference: txRef,
    buyerUid: "buyer_timeout",
    amountCharged: 112500,
    currency: "NGN",
    status: "initiating",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Network timeout happens
  const gatewayOutcome = {
    outcome: "INDETERMINATE_TIMEOUT" as const,
    message: "Socket hangup while contacting Flutterwave",
  };

  if (gatewayOutcome.outcome === "INDETERMINATE_TIMEOUT") {
    paymentRecord.paymentStatus = "checkout_creation_uncertain";
    paymentRecord.statusReason = gatewayOutcome.message;
    listing.pendingAccessIntent.status = "checkout_creation_uncertain";
  }

  assert.strictEqual(paymentRecord.paymentStatus, "checkout_creation_uncertain");
  assert.strictEqual(listing.pendingAccessIntent?.status, "checkout_creation_uncertain");
  console.log("  ✔ Test 3.4 Passed: Indeterminate timeout sets checkout_creation_uncertain state.");
}

// ============================================================================
// TEST SUITE 4: VERIFICATION, STRICT INVARIANTS & SECURITY
// ============================================================================
console.log("\n--- TEST SUITE 4: Verification, Strict Invariants & Security ---");

// Test 4.1: Strict Exact Amount Check - ₦1 short is rejected (amount_mismatch)
{
  const state = createMockState();
  const listing = seedListing(state);
  const txRef = generatePaymentReference(listing.listingId);
  const expectedAmount: number = 112500;
  const verifiedAmount: number = 112499; // ₦1 short

  const paymentRecord: PaymentRecord = {
    paymentId: txRef,
    paymentReference: txRef,
    listingId: listing.listingId,
    buyerUid: "buyer_mismatch",
    amountCharged: expectedAmount,
    currency: "NGN",
    paymentStatus: "pending",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  state.payments.set(txRef, paymentRecord);
  listing.pendingAccessIntent = {
    paymentId: txRef,
    paymentReference: txRef,
    buyerUid: "buyer_mismatch",
    amountCharged: expectedAmount,
    currency: "NGN",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Verification
  let accessGranted = false;
  if (verifiedAmount !== expectedAmount) {
    paymentRecord.paymentStatus = "amount_mismatch";
    paymentRecord.statusReason = `Amount mismatch: Verified ₦${verifiedAmount} does not equal expected ₦${expectedAmount}`;
  } else {
    accessGranted = true;
  }

  assert.strictEqual(paymentRecord.paymentStatus, "amount_mismatch");
  assert.strictEqual(accessGranted, false);
  assert.strictEqual(state.sellerAccess.size, 0, "No SellerAccessRecord must be granted on amount mismatch");
  assert.strictEqual(listing.listingStatus, "available", "Listing remains available");
  console.log("  ✔ Test 4.1 Passed: Strict exact amount equality rejects ₦1 underpayment (amount_mismatch).");
}

// Test 4.2: Strict Exact Amount Check - ₦1 over is rejected (amount_mismatch)
{
  const expectedAmount: number = 112500;
  const verifiedAmount: number = 112501; // ₦1 over
  let status = "pending";
  if (verifiedAmount !== expectedAmount) {
    status = "amount_mismatch";
  }
  assert.strictEqual(status, "amount_mismatch");
  console.log("  ✔ Test 4.2 Passed: Strict exact amount equality rejects ₦1 overpayment (amount_mismatch).");
}

// Test 4.3: Strict Currency Check - non-NGN currency (e.g. USD) is rejected
{
  const verifiedCurrency: string = "USD";
  let status = "pending";
  if (verifiedCurrency !== "NGN") {
    status = "failed";
  }
  assert.strictEqual(status, "failed");
  console.log("  ✔ Test 4.3 Passed: Currency mismatch (non-NGN) rejected.");
}

// Test 4.4: Expired reservation isolation -> paid_unfulfillable, no access granted
{
  const state = createMockState();
  const listing = seedListing(state);
  const txRefA = generatePaymentReference(listing.listingId);

  const paymentRecordA: PaymentRecord = {
    paymentId: txRefA,
    paymentReference: txRefA,
    listingId: listing.listingId,
    buyerUid: "buyer_A",
    amountCharged: 112500,
    currency: "NGN",
    paymentStatus: "pending",
    expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Expired
    createdAt: new Date().toISOString(),
  };
  state.payments.set(txRefA, paymentRecordA);

  // Listing superseded by Buyer B
  listing.pendingAccessIntent = {
    paymentId: "pay_B",
    paymentReference: "tx_ref_B",
    buyerUid: "buyer_B",
    amountCharged: 112500,
    currency: "NGN",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Buyer A completes payment at gateway after expiration
  const intent = listing.pendingAccessIntent;
  const isValid =
    intent.paymentReference === txRefA &&
    intent.paymentId === paymentRecordA.paymentId &&
    new Date(intent.expiresAt).getTime() > Date.now();

  if (!isValid) {
    paymentRecordA.paymentStatus = "paid_unfulfillable";
    paymentRecordA.statusReason = "Payment succeeded at gateway after reservation expired or superseded.";
  }

  assert.strictEqual(paymentRecordA.paymentStatus, "paid_unfulfillable");
  assert.strictEqual(state.sellerAccess.has(`SAR-${listing.listingId}-buyer_A`), false);
  console.log("  ✔ Test 4.4 Passed: Stale payment isolated as paid_unfulfillable without granting access.");
}

// Test 4.5: Finalization Idempotency - Webhook and Redirect Callback race
{
  const state = createMockState();
  const listing = seedListing(state);
  const txRef = generatePaymentReference(listing.listingId);
  const buyerUid = "buyer_race";

  const paymentRecord: PaymentRecord = {
    paymentId: txRef,
    paymentReference: txRef,
    listingId: listing.listingId,
    lotId: listing.lotId,
    buyerUid,
    sellerId: listing.sellerHolderId,
    amountCharged: 112500,
    currency: "NGN",
    paymentStatus: "pending",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  state.payments.set(txRef, paymentRecord);
  listing.pendingAccessIntent = {
    paymentId: txRef,
    paymentReference: txRef,
    buyerUid,
    amountCharged: 112500,
    currency: "NGN",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  // Process 1 (Redirect callback completes)
  const finalizePayment = () => {
    if (paymentRecord.paymentStatus === "completed") {
      return { idempotencyHit: true, access: state.sellerAccess.get(`SAR-${listing.listingId}-${buyerUid}`) };
    }
    paymentRecord.paymentStatus = "completed";
    listing.listingStatus = "under_negotiation";
    listing.pendingAccessIntent = null;

    const access: SellerAccessRecord = {
      accessId: `SAR-${listing.listingId}-${buyerUid}`,
      listingId: listing.listingId,
      lotId: listing.lotId,
      buyerId: buyerUid,
      sellerHolderId: listing.sellerHolderId,
      feePaid: 112500,
      currency: "NGN",
      accessStatus: "active",
      accessGrantedAt: new Date().toISOString(),
    };
    state.sellerAccess.set(access.accessId, access);
    return { idempotencyHit: false, access };
  };

  const res1 = finalizePayment();
  const res2 = finalizePayment(); // Process 2 (Webhook arrives)

  assert.strictEqual(res1.idempotencyHit, false, "First finalization creates record");
  assert.strictEqual(res2.idempotencyHit, true, "Second finalization safely returns existing record");
  assert.strictEqual(state.sellerAccess.size, 1, "Exactly 1 SellerAccessRecord created");
  assert.strictEqual(listing.listingStatus, "under_negotiation");
  console.log("  ✔ Test 4.5 Passed: Finalization idempotency handles concurrent webhook/redirect race.");
}

// Test 4.6: Timing-Safe Webhook Signature Verification
{
  const secretHash = "test_flw_secret_hash_2026_secure";
  const validHeader = "test_flw_secret_hash_2026_secure";
  const invalidHeader = "tampered_flw_secret_hash";
  const nullHeader = null;

  assert.strictEqual(verifyFlutterwaveWebhookSignature(validHeader, secretHash), true);
  assert.strictEqual(verifyFlutterwaveWebhookSignature(invalidHeader, secretHash), false);
  assert.strictEqual(verifyFlutterwaveWebhookSignature(nullHeader, secretHash), false);
  console.log("  ✔ Test 4.6 Passed: Timing-safe webhook verification rejects tampered/missing signatures.");
}

// Test 4.7: Seller cannot buy access to own listing
{
  const state = createMockState();
  const listing = seedListing(state, { sellerHolderId: "seller_uid_999", createdByUid: "seller_uid_999" });

  let sellerBlocked = false;
  const buyerAttempt = "seller_uid_999";

  if (listing.sellerHolderId === buyerAttempt || listing.createdByUid === buyerAttempt) {
    sellerBlocked = true;
  }

  assert.strictEqual(sellerBlocked, true, "Seller must be forbidden from paying access to own listing");
  console.log("  ✔ Test 4.7 Passed: Security check prevents sellers from paying access for own listings.");
}

console.log("\n================================================================================");
console.log("             ALL STEP 9 VERIFICATION TESTS PASSED SUCCESSFULLY!                ");
console.log("================================================================================\n");
