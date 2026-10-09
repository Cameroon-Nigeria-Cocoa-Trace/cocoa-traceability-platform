/**
 * Certificate Holdings API Route
 * Endpoint: /api/certificate-holdings
 *
 * Provides a secure server-side boundary for querying certified cocoa holdings.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listCertificateHoldingsByCertificate,
  listCertificateHoldingsByHolder,
  listCertificateHoldingsByCertificateAndHolder,
} from "@/services/transferService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const certificateId = searchParams.get("certificateId");
    const holderId = searchParams.get("holderId");

    if (certificateId && holderId) {
      const holdings = await listCertificateHoldingsByCertificateAndHolder(certificateId, holderId);
      return NextResponse.json({ success: true, holdings });
    }

    if (certificateId) {
      const holdings = await listCertificateHoldingsByCertificate(certificateId);
      return NextResponse.json({ success: true, holdings });
    }

    if (holderId) {
      const holdings = await listCertificateHoldingsByHolder(holderId);
      return NextResponse.json({ success: true, holdings });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'certificateId' or 'holderId' is required." },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
