
import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { verifyFlutterwaveWebhookSignature } from "@/services/flutterwaveService";
import {
  verifyAndFinalizeSellerInfoAccessPayment,
} from "@/services/flutterwavePaymentService";

export async function POST(req: NextRequest) {
  // Authenticate the webhook using the configured Flutterwave secret hash.
  const signature = req.headers.get("verif-hash");

  if (!verifyFlutterwaveWebhookSignature(signature)) {
    console.warn(
      "Rejected Flutterwave webhook: invalid or missing signature."
    );

    return NextResponse.json(
      { error: "Unauthorized: Invalid webhook signature." },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { status: "ignored", message: "Invalid webhook payload." },
        { status: 200 }
      );
    }

    const payload = body as Record<string, unknown>;
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {};

    const rawReference =
      data.tx_ref ??
      data.txRef ??
      payload.tx_ref ??
      payload.txRef;

    if (
      typeof rawReference !== "string" ||
      !rawReference.trim() ||
      rawReference.length > 200 ||
      rawReference.includes("/")
    ) {
      // The signed event does not identify a usable payment reference.
      return NextResponse.json(
        { status: "ignored", message: "No valid payment reference." },
        { status: 200 }
      );
    }

    const txRef = rawReference.trim();

    // Load the canonical payment record using the Admin SDK.
    // Never derive buyer identity from the incoming webhook payload.
    const paymentSnap = await firebaseAdminDb
      .collection("payments")
      .doc(txRef)
      .get();

    if (!paymentSnap.exists) {
      // This webhook may concern another Flutterwave product or an
      // unrecognized transaction. Do not create payment records here.
      return NextResponse.json(
        {
          status: "ignored",
          message: "No matching payment record was found.",
        },
        { status: 200 }
      );
    }

    const payment = paymentSnap.data();

    // Process only the seller-information access payment flow.
    if (
      payment?.paymentPurpose !== "SELLER_INFORMATION_ACCESS" ||
      payment?.paymentGateway !== "FLUTTERWAVE" ||
      payment?.currency !== "NGN" ||
      payment?.paymentId !== txRef ||
      payment?.paymentReference !== txRef
    ) {
      return NextResponse.json(
        {
          status: "ignored",
          message: "This is not a matching seller-information payment.",
        },
        { status: 200 }
      );
    }

    if (
      typeof payment.buyerUid !== "string" ||
      !payment.buyerUid.trim()
    ) {
      console.error(
        "Flutterwave webhook: payment record has no valid buyer UID.",
        { paymentReference: txRef }
      );

      return NextResponse.json(
        { error: "Payment record requires reconciliation." },
        { status: 500 }
      );
    }

    // The signed webhook identifies the event, the trusted payment
    // record identifies the buyer, and the service verifies payment
    // directly with Flutterwave before granting seller access.
    const result =
      await verifyAndFinalizeSellerInfoAccessPayment(
        txRef,
        payment.buyerUid.trim()
      );

    if (result.success) {
      return NextResponse.json(
        {
          status: "success",
          paymentStatus: result.paymentStatus,
        },
        { status: 200 }
      );
    }

    const terminalStatuses = new Set<string>([
      "failed",
      "amount_mismatch",
      "paid_unfulfillable",
      "checkout_creation_failed",
    ]);

    if (terminalStatuses.has(result.paymentStatus)) {
      if (result.paymentStatus === "paid_unfulfillable") {
        console.error(
          "Flutterwave payment requires administrative reconciliation.",
          { paymentReference: txRef }
        );
      }

      return NextResponse.json(
        {
          status: "processed",
          paymentStatus: result.paymentStatus,
        },
        { status: 200 }
      );
    }

    // A pending or inconclusive verification must not grant access.
    // Return a retryable response instead of silently acknowledging it.
    return NextResponse.json(
      {
        status: "pending",
        message: "Payment verification remains inconclusive.",
      },
      { status: 503 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("Flutterwave webhook processing failed:", message);

    // Allow the provider's configured retry mechanism to retry failures.
    return NextResponse.json(
      { error: "Webhook processing failed. Retry reconciliation." },
      { status: 500 }
    );
  }
}
