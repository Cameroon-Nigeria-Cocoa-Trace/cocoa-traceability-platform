import { NextRequest, NextResponse } from "next/server";
import { verifyFlutterwaveWebhookSignature } from "@/services/flutterwaveService";
import { verifyAndFinalizeSellerInfoAccessPayment } from "@/services/flutterwavePaymentService";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("verif-hash");

    // Timing-safe verification of webhook signature
    const isValid = verifyFlutterwaveWebhookSignature(signature);
    if (!isValid) {
      console.warn("Unauthorized Flutterwave Webhook: Invalid or missing verif-hash signature");
      return NextResponse.json(
        { error: "Unauthorized: Invalid webhook signature" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const txRef = body?.data?.tx_ref || body?.txRef || body?.data?.txRef || body?.tx_ref;

    if (!txRef || typeof txRef !== "string" || !txRef.trim()) {
      return NextResponse.json(
        { message: "Webhook received but no valid tx_ref found in payload." },
        { status: 200 }
      );
    }

    // Process reconciliation and finalization idempotently
    await verifyAndFinalizeSellerInfoAccessPayment(txRef.trim()).catch((err) => {
      console.error("Error processing webhook reconciliation:", err?.message || err);
    });

    return NextResponse.json(
      { status: "success", message: "Webhook processed successfully." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Webhook Handler Error:", error?.message || error);
    // Return 200 so Flutterwave does not spam retries on non-recoverable processing errors
    return NextResponse.json(
      { status: "acknowledged", message: "Webhook received with errors." },
      { status: 200 }
    );
  }
}
