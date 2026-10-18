/**
 * Declare Off-Platform Sale API Route
 * Endpoint: /api/marketplace/trades/declare-off-platform-sale
 */

import { NextRequest, NextResponse } from "next/server";
import { declareOffPlatformSale } from "@/services/tradeService";
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
    const trade = await declareOffPlatformSale({
      ...body,
      actorUid: user.userId,
    });

    return NextResponse.json({ success: true, trade }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Validation Error") || message.includes("Lookup Error")
      ? 400
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
