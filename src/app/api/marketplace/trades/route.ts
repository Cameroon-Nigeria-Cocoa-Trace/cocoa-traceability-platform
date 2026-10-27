/**
 * Trades API Route
 * Endpoint: /api/marketplace/trades
 * Lists trades for authenticated users (as buyer, seller, or specific filters)
 */

import { NextRequest, NextResponse } from "next/server";
import { listTrades } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { TradeRecord, TradeStatus } from "@/types/traceability";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";

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
    const role = searchParams.get("role"); // "buyer" | "seller" | "all"
    const lotId = searchParams.get("lotId") || undefined;
    const certificateId = searchParams.get("certificateId") || undefined;
    const tradeStatus = (searchParams.get("tradeStatus") as TradeStatus) || undefined;
    const sellerHolderId = searchParams.get("sellerHolderId") || undefined;
    const buyerId = searchParams.get("buyerId") || undefined;

    let trades: TradeRecord[] = [];
    try {
      trades = await listTrades({
        lotId,
        certificateId,
        tradeStatus,
        sellerHolderId: sellerHolderId || (role === "seller" ? user.userId : undefined),
        buyerId: buyerId || (role === "buyer" ? user.userId : undefined),
      });
    } catch {
      // Fallback to firebaseAdminDb if client SDK list meets unauthenticated server context
      let q: FirebaseFirestore.Query = firebaseAdminDb.collection("trades");
      if (lotId) q = q.where("lotId", "==", lotId);
      if (certificateId) q = q.where("certificateId", "==", certificateId);
      if (tradeStatus) q = q.where("tradeStatus", "==", tradeStatus);
      const snap = await q.get();
      trades = snap.docs.map((d) => d.data() as TradeRecord);
    }

    // If no specific role is specified and neither buyerId nor sellerHolderId was passed,
    // filter to trades where the user is either buyer OR seller/sellerHolder
    if (!role && !sellerHolderId && !buyerId) {
      trades = trades.filter(
        (t) =>
          t.buyerId === user.userId ||
          t.sellerId === user.userId ||
          t.sellerHolderId === user.userId
      );
    }

    return NextResponse.json({ success: true, trades });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
