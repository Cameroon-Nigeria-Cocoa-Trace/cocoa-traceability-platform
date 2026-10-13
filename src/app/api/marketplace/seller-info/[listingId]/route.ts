/**
 * Seller Information Retrieval API Route
 * Endpoint: /api/marketplace/seller-info/[listingId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getSellerInfoForListing } from "@/services/tradeService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { listingId } = await params;
    const sellerInfo = await getSellerInfoForListing(listingId, user.userId);

    return NextResponse.json({ success: true, sellerInfo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Access Denied") || message.includes("403")
      ? 403
      : message.includes("Lookup Error")
      ? 404
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
