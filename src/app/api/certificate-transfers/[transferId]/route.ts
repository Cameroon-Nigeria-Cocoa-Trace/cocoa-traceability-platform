/**
 * Single Certificate Transfer API Route
 * Endpoint: /api/certificate-transfers/[transferId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getCertificateTransfer } from "@/services/transferService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> }
) {
  try {
    const { transferId } = await params;
    const transfer = await getCertificateTransfer(transferId);

    if (!transfer) {
      return NextResponse.json(
        { success: false, error: `Certificate transfer "${transferId}" not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      transfer,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
