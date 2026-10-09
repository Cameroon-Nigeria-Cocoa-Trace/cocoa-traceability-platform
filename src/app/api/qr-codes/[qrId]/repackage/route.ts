/**
 * QR Code Repackaging / Return-to-Bulk API Route
 * Endpoint: /api/qr-codes/[qrId]/repackage
 *
 * Transactionally executes a formal return-to-bulk repackaging operation for a revoked QR package.
 * Releases packaging capacity back to unpackaged bulk cocoa.
 */

import { NextRequest, NextResponse } from "next/server";
import { repackageRevokedQRCode } from "@/services/qrTraceabilityService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ qrId: string }> }
) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { qrId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const notes = body.notes || "Emptied physical package cocoa returned to bulk state.";

    const repackagedQR = await repackageRevokedQRCode(qrId, notes, user.userId);

    return NextResponse.json({
      success: true,
      qrCode: repackagedQR,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Authentication Required")
      ? 401
      : message.includes("Authorization Error")
      ? 403
      : message.includes("not exist")
      ? 404
      : message.includes("Repackage Error")
      ? 409
      : 400;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
