/**
 * Seller Negotiations API Route
 * Endpoint: /api/marketplace/negotiations
 * Retrieves all listings and inquiries where buyers have unlocked contact information
 */

import { NextRequest, NextResponse } from "next/server";
import { listNegotiationsForSeller } from "@/services/tradeService";
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
    const sellerUid = searchParams.get("sellerUid") || user.userId;

    // Enforce that non-admins can only see their own negotiations
    const targetUid = (user.role === "admin" || user.userId === sellerUid) ? sellerUid : user.userId;

    const negotiations = await listNegotiationsForSeller(targetUid);

    return NextResponse.json({
      success: true,
      negotiations,
      count: negotiations.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
