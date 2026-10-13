/**
 * Single QR Code API Route
 * Endpoint: /api/qr-codes/[qrId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getQRCode } from "@/services/qrTraceabilityService";
import { getAuthenticatedUser } from "@/lib/authServer";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ qrId: string }> }
) {
  try {
    await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json({ success: false, error: authMessage }, { status: 401 });
  }

  try {
    const { qrId } = await context.params;
    const qr = await getQRCode(qrId);

    if (!qr) {
      return NextResponse.json(
        { success: false, error: `QRCode "${qrId}" not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      qrCode: qr,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
