/**
 * Seller Information Pay Access API Route
 * Endpoint: /api/marketplace/seller-info/pay-access
 */

import { NextRequest, NextResponse } from "next/server";
import { paySellerInfoAccessFee } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const body = await req.json();
    const accessRecord = await paySellerInfoAccessFee({
      ...body,
      buyerId: user.userId,
    });

    return NextResponse.json({ success: true, accessRecord });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Validation Error") || message.includes("State Error")
      ? 400
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
