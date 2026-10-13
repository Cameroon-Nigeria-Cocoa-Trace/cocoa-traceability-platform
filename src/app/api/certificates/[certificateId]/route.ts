/**
 * Single Trace Certificate API Route
 * Endpoint: /api/certificates/[certificateId]
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTraceCertificate,
  resolveCertificateLineage,
  toPublicTraceCertificate,
  toPublicCertificateLineage,
} from "@/services/certificateService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ certificateId: string }> }
) {
  try {
    const { certificateId } = await params;
    const { searchParams } = new URL(req.url);
    const includeLineage = searchParams.get("includeLineage") === "true";

    if (includeLineage) {
      const lineage = await resolveCertificateLineage(certificateId);
      return NextResponse.json({
        success: true,
        lineage: toPublicCertificateLineage(lineage),
      });
    }

    const certificate = await getTraceCertificate(certificateId);
    if (!certificate) {
      return NextResponse.json(
        { success: false, error: `Certificate "${certificateId}" not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      certificate: toPublicTraceCertificate(certificate),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("not exist") ? 404 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
