
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { verifyAndFinalizeSellerInfoAccessPayment } from "@/services/flutterwavePaymentService";

async function handleVerification(
  req: NextRequest,
  paymentReference: string | null
) {
  try {
    // Require an authenticated Firebase user.
    const user = await getAuthenticatedUser(req);

    if (!paymentReference || !paymentReference.trim()) {
      return NextResponse.json(
        { error: "Validation Error: tx_ref is required." },
        { status: 400 }
      );
    }

    const result = await verifyAndFinalizeSellerInfoAccessPayment(
      paymentReference.trim(),
      user.userId
    );

    // Return only fields required by the verification page.
    // Never expose the raw gateway response or internal payment metadata.
    const payment = result.paymentRecord;
    const access = result.accessRecord;

    return NextResponse.json({
      success: result.success,
      paymentStatus: result.paymentStatus,
      statusReason: result.statusReason,
      paymentRecord: payment
        ? {
            paymentReference: payment.paymentReference,
            paymentId: payment.paymentId,
            listingId: payment.listingId,
            amountCharged: payment.amountCharged,
            amount: payment.amount,
            currency: payment.currency,
            paymentStatus: payment.paymentStatus,
          }
        : undefined,
      accessRecord: access
        ? {
            accessId: access.accessId,
            listingId: access.listingId,
            accessStatus: access.accessStatus,
          }
        : undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);

    console.error("Seller Access Payment Verification Error:", msg);

    if (
      msg.includes("Authorization Error") ||
      msg.includes("Security Error")
    ) {
      return NextResponse.json(
        { error: "You are not authorized to access this payment." },
        { status: 403 }
      );
    }

    if (
      msg.includes("Authentication") ||
      msg.toLowerCase().includes("unauthorized")
    ) {
      return NextResponse.json(
        { error: "Authentication is required to verify this payment." },
        { status: 401 }
      );
    }

    if (msg.includes("Lookup Error")) {
      return NextResponse.json(
        { error: "Payment record or listing not found." },
        { status: 404 }
      );
    }

    if (msg.includes("Validation Error")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Payment verification could not be completed. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentReference =
    searchParams.get("tx_ref") ||
    searchParams.get("transaction_id") ||
    searchParams.get("paymentReference");

  return handleVerification(req, paymentReference);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const paymentReference =
    typeof body?.tx_ref === "string"
      ? body.tx_ref
      : typeof body?.paymentReference === "string"
        ? body.paymentReference
        : null;

  return handleVerification(req, paymentReference);
}
