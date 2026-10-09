/**
 * User Trades API Route
 * Endpoint: /api/marketplace/trades/my-trades
 */

import { NextRequest, NextResponse } from "next/server";
import { listTrades } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function GET(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") || "buyer";

    let trades = [];
    if (role === "seller") {
      trades = await listTrades({ sellerHolderId: user.userId });
    } else {
      trades = await listTrades({ buyerId: user.userId });
    }

    return NextResponse.json({ success: true, trades });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
