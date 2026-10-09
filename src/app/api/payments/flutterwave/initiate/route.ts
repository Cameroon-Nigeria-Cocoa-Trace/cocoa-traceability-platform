import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/authServer";
import { initiateSellerInfoAccessPayment } from "@/services/flutterwavePaymentService";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));

    if (!body.listingId || typeof body.listingId !== "string") {
      return NextResponse.json(
        { error: "Validation Error: listingId is required." },
        { status: 400 }
      );
    }

    const result = await initiateSellerInfoAccessPayment({
      listingId: body.listingId,
      buyerUid: user.userId,
      redirectUrl: body.redirectUrl,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("Payment Initiation Error:", msg);

    if (msg.includes("Conflict Error (409)") || msg.includes("currently reserved")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("Validation Error") || msg.includes("Security Error") || msg.includes("State Error")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("Authentication")) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg.includes("Gateway Timeout (504)") || msg.includes("Reconciliation Pending")) {
      return NextResponse.json({ error: msg }, { status: 504 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
