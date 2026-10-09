import { NextRequest, NextResponse } from "next/server";
import { verifyAndFinalizeSellerInfoAccessPayment } from "@/services/flutterwavePaymentService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const txRef = searchParams.get("tx_ref") || searchParams.get("transaction_id") || searchParams.get("paymentReference");

    if (!txRef || !txRef.trim()) {
      return NextResponse.json(
        { error: "Validation Error: tx_ref parameter is required." },
        { status: 400 }
      );
    }

    const result = await verifyAndFinalizeSellerInfoAccessPayment(txRef.trim());

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("Payment Verification Error:", msg);

    if (msg.includes("Lookup Error")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Validation Error")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const txRef = body.tx_ref || body.paymentReference;

    if (!txRef || typeof txRef !== "string" || !txRef.trim()) {
      return NextResponse.json(
        { error: "Validation Error: tx_ref is required." },
        { status: 400 }
      );
    }

    const result = await verifyAndFinalizeSellerInfoAccessPayment(txRef.trim());

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("Payment Verification Error:", msg);

    if (msg.includes("Lookup Error")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Validation Error")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
