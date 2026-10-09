/**
 * On-Platform Purchase API Route (Intent & Idempotent Finalization)
 * Endpoint: /api/marketplace/trades/on-platform-purchase
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createPurchaseIntent,
  verifyAndFinalizeOnPlatformPurchase,
} from "@/services/tradeService";
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
    const action = body?.action || "finalize";

    if (action === "intent") {
      const intent = await createPurchaseIntent({
        ...body,
        buyerId: user.userId,
      });
      return NextResponse.json({ success: true, intent });
    } else {
      const result = await verifyAndFinalizeOnPlatformPurchase({
        ...body,
        buyerId: user.userId,
      });
      return NextResponse.json({
        success: true,
        trade: result.trade,
        destHolding: result.destHolding,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error") || message.includes("Unsupported Transfer Route")
      ? 403
      : message.includes("Validation Error") || message.includes("Lookup Error")
      ? 400
      : message.includes("Quantity Error") || message.includes("Package Error") || message.includes("State Error")
      ? 409
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
