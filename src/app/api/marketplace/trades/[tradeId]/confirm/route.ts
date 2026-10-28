/**
 * Confirm Trade API Route
 * Endpoint: /api/marketplace/trades/[tradeId]/confirm
 * Allows a buyer to confirm or reject a declared commercial trade
 */

import { NextRequest, NextResponse } from "next/server";
import { confirmTradeByBuyer, rejectTradeByBuyer } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { TradeRecord } from "@/types/traceability";

export async function POST(
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
    const body = await req.json().catch(() => ({}));
    const action = body.action || "confirm"; // "confirm" | "reject"
    const reason = body.reason || undefined;

    if (action === "reject") {
      let trade: TradeRecord;
      try {
        trade = await rejectTradeByBuyer(tradeId, user.userId, reason);
      } catch {
        const tradeRef = firebaseAdminDb.collection("trades").doc(tradeId);
        const snap = await tradeRef.get();
        if (!snap.exists) {
          return NextResponse.json({ success: false, error: "Trade not found" }, { status: 404 });
        }
        const data = snap.data() as TradeRecord;
        if (data.buyerId !== user.userId) {
          return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
        }
        const now = new Date().toISOString();
        trade = {
          ...data,
          tradeStatus: "cancelled",
          buyerConfirmed: false,
          notes: `${data.notes || ""} [Rejected by buyer: ${reason || "Terms not agreed"}]`.trim(),
          updatedAt: now,
        };
        await tradeRef.update({
          tradeStatus: "cancelled",
          buyerConfirmed: false,
          notes: trade.notes,
          updatedAt: now,
        });
      }
      return NextResponse.json({ success: true, message: "Trade rejected", trade });
    }

    // Default: confirm
    let trade: TradeRecord;
    try {
      trade = await confirmTradeByBuyer(tradeId, user.userId);
    } catch {
      const tradeRef = firebaseAdminDb.collection("trades").doc(tradeId);
      const snap = await tradeRef.get();
      if (!snap.exists) {
        return NextResponse.json({ success: false, error: "Trade not found" }, { status: 404 });
      }
      const data = snap.data() as TradeRecord;
      if (data.buyerId !== user.userId) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
      }
      const now = new Date().toISOString();
      trade = {
        ...data,
        tradeStatus: "completed",
        buyerConfirmed: true,
        buyerConfirmedAt: now,
        confirmedByBuyerUid: user.userId,
        updatedAt: now,
      };
      await tradeRef.update({
        tradeStatus: "completed",
        buyerConfirmed: true,
        buyerConfirmedAt: now,
        confirmedByBuyerUid: user.userId,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Trade successfully confirmed and accepted!",
      trade,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
