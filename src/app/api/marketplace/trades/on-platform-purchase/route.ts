/**
 * On-Platform Purchase API Route (Intent & Idempotent Finalization)
 * Endpoint: /api/marketplace/trades/on-platform-purchase
 */

import { NextRequest, NextResponse } from "next/server";
import { createPurchaseIntent } from "@/services/tradeService";
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
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "intent") {
      const intent = await createPurchaseIntent({
        ...body,
        buyerId: user.userId,
      });

      return NextResponse.json({
        success: true,
        intent,
      });
    }

    if (action === "finalize") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Purchase finalization is temporarily unavailable while payment verification is being configured. No purchase has been completed.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unsupported purchase action.",
      },
      { status: 400 }
    );
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
