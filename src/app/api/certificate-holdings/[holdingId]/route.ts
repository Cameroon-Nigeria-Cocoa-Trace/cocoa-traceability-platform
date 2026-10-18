/**
 * Single Certificate Holding API Route
 * Endpoint: /api/certificate-holdings/[holdingId]
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCertificateHolding,
  resolveCertificateHoldingHistory,
} from "@/services/transferService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  try {
    const { holdingId } = await params;
    const holding = await getCertificateHolding(holdingId);

    if (!holding) {
      return NextResponse.json(
        { success: false, error: `Certificate holding "${holdingId}" not found.` },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const includeHistory = searchParams.get("includeHistory") === "true";

    if (includeHistory) {
      const history = await resolveCertificateHoldingHistory(holdingId);
      return NextResponse.json({
        success: true,
        holding,
        history,
      });
    }

    return NextResponse.json({
      success: true,
      holding,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
