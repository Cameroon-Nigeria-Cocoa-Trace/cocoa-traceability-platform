/**
 * Trade Record API Route
 * Endpoint: /api/marketplace/trades/[tradeId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getTradeRecord } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { tradeId } = await params;
    const trade = await getTradeRecord(tradeId);
    if (!trade) {
      return NextResponse.json({ success: false, error: "Trade not found" }, { status: 404 });
    }

    // Authorize party to trade (buyer or seller)
    if (trade.buyerId !== user.userId && trade.sellerId !== user.userId && trade.sellerHolderId !== user.userId) {
      return NextResponse.json(
        { success: false, error: "Access Denied: Only buyer or seller can access trade details" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, trade });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
