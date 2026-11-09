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

        if (data.listingId) {
          const listingRef = firebaseAdminDb.collection("marketplaceListings").doc(data.listingId);
          const lSnap = await listingRef.get();
          if (lSnap.exists) {
            const lData = lSnap.data() as { quantityAvailableKg?: number } | undefined;
            const restored = (lData?.quantityAvailableKg || 0) + (data.quantityKg || 0);
            await listingRef.update({
              quantityAvailableKg: restored,
              listingStatus: "available",
              pendingAccessIntent: null,
              updatedAt: now,
            });
          }
          const c1 = `SAR-${data.listingId}-${user.userId}`;
          const c2 = `acc_${data.listingId}-${user.userId}`;
          for (const cid of [c1, c2]) {
            const accRef = firebaseAdminDb.collection("sellerAccessRecords").doc(cid);
            const accSnap = await accRef.get();
            if (accSnap.exists) {
              await accRef.update({
                accessStatus: "active",
                dealOutcome: null,
                cancellationReason: reason || "Declined by buyer",
                updatedAt: now,
              });
            }
          }
        }

        trade = {
          ...data,
          tradeStatus: "cancelled",
          buyerConfirmed: false,
          notes: `${data.notes || ""} [Declined by buyer: ${reason || "Terms not agreed"}]`.trim(),
          updatedAt: now,
        };
        await tradeRef.update({
          tradeStatus: "cancelled",
          buyerConfirmed: false,
          notes: trade.notes,
          updatedAt: now,
        });
      }
      return NextResponse.json({ success: true, message: "Trade declined and returned to seller", trade });
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
