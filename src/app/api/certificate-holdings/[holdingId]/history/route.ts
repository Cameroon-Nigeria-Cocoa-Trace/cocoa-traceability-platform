/**
 * Dedicated Certificate Holding History API Route
 * Endpoint: /api/certificate-holdings/[holdingId]/history
 *
 * Recursively resolves complete provenance and transfer chain-of-custody for a specific holding.
 * Serves as the authoritative provenance resolution anchor for QR code generation in Step 7.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCertificateHoldingHistory } from "@/services/transferService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  try {
    const { holdingId } = await params;
    const history = await resolveCertificateHoldingHistory(holdingId);

    if (!history) {
      return NextResponse.json(
        { success: false, error: `Certificate holding "${holdingId}" not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Circular Reference Error") ? 500 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
