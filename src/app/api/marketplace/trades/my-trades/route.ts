import { NextRequest, NextResponse } from "next/server";
import { listTrades } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import {
  getAffiliatedFarmerIds,
  getCooperativeActorInfo,
} from "@/lib/serverCooperativeAuth";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { TradeRecord } from "@/types/traceability";

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

    let trades: TradeRecord[] = [];
    if (role === "seller") {
      const actorInfo = await getCooperativeActorInfo(user.userId);
      const targetSellers = new Set<string>([user.userId]);

      if (actorInfo.isCooperative || actorInfo.cooperativeOrgIds.length > 0) {
        actorInfo.cooperativeOrgIds.forEach((id) => targetSellers.add(id));
        const memberFarmerIds = await getAffiliatedFarmerIds(user.userId);
        memberFarmerIds.forEach((id) => targetSellers.add(id));
      }

      const tradeMap = new Map<string, TradeRecord>();
      const sellerList = Array.from(targetSellers);

      for (let i = 0; i < sellerList.length; i += 10) {
        const chunk = sellerList.slice(i, i + 10);
        if (chunk.length === 0) continue;

        const [snapHolder, snapSeller] = await Promise.all([
          firebaseAdminDb.collection("trades").where("sellerHolderId", "in", chunk).get(),
          firebaseAdminDb.collection("trades").where("sellerId", "in", chunk).get(),
        ]);

        snapHolder.docs.forEach((d) => tradeMap.set(d.id, d.data() as TradeRecord));
        snapSeller.docs.forEach((d) => tradeMap.set(d.id, d.data() as TradeRecord));
      }

      // If client service had trades, merge
      try {
        const clientTrades = await listTrades({ sellerHolderId: user.userId });
        clientTrades.forEach((t) => tradeMap.set(t.tradeId, t));
      } catch {
        // Continue
      }

      trades = Array.from(tradeMap.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    } else {
      trades = await listTrades({ buyerId: user.userId });
    }

    return NextResponse.json({ success: true, trades });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
