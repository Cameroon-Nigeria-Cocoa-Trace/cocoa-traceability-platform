/**
 * QR Code Image Download API Route
 * Endpoint: /api/qr-codes/[qrId]/download
 *
 * Generates and returns a printable SVG or PNG representation of the QR code.
 */

import { NextRequest, NextResponse } from "next/server";
import { getQRCode, generateQRImage } from "@/services/qrTraceabilityService";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ qrId: string }> }
) {
  try {
    const { qrId } = await context.params;
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "svg").toLowerCase() === "png" ? "png" : "svg";

    const qr = await getQRCode(qrId);
    if (!qr) {
      return NextResponse.json(
        { success: false, error: `QRCode "${qrId}" not found.` },
        { status: 404 }
      );
    }

    const { data, contentType } = await generateQRImage(qr.qrValue, format);
    const body: BodyInit = typeof data === "string" ? data : new Uint8Array(data);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${qr.packageNumber}.${format}"`,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
