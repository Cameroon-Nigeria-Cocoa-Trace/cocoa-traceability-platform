
import { NextRequest, NextResponse } from "next/server";
import QRCodeLib from "qrcode";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminAuth, firebaseAdminDb } from "@/lib/firebaseAdmin";
import type { CertificateHolding, QRCode } from "@/types/traceability";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ qrId: string }> }
) {
  let user: { userId: string };

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required" },
      { status: 401 }
    );
  }

  try {
    const { qrId: rawQrId } = await context.params;

    if (
      typeof rawQrId !== "string" ||
      !rawQrId.trim() ||
      rawQrId.length > 256
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid QR ID." },
        { status: 400 }
      );
    }

    const qrId = rawQrId.trim();
    const formatParam = new URL(req.url).searchParams.get("format")?.toLowerCase();

    if (formatParam && formatParam !== "svg" && formatParam !== "png") {
      return NextResponse.json(
        { success: false, error: "Validation Error: Format must be svg or png." },
        { status: 400 }
      );
    }

    const format: "svg" | "png" = formatParam === "png" ? "png" : "svg";

    const authRecord = await firebaseAdminAuth.getUser(user.userId);
    const isAdmin = authRecord.customClaims?.admin === true;

    const qrSnapshot = await firebaseAdminDb
      .collection("qrCodes")
      .doc(qrId)
      .get();

    if (!qrSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "QR code not found." },
        { status: 404 }
      );
    }

    const qr = qrSnapshot.data() as QRCode;

    if (
      qr.qrId !== qrId ||
      typeof qr.qrValue !== "string" ||
      !qr.qrValue.trim() ||
      typeof qr.currentHoldingId !== "string" ||
      !qr.currentHoldingId.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "The QR record is incomplete or inconsistent." },
        { status: 409 }
      );
    }

    const holdingSnapshot = await firebaseAdminDb
      .collection("certificateHoldings")
      .doc(qr.currentHoldingId)
      .get();

    if (!holdingSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "The QR code's current holding could not be verified." },
        { status: 409 }
      );
    }

    const holding = holdingSnapshot.data() as CertificateHolding;

    if (
      holding.holdingId !== qr.currentHoldingId ||
      !holding.holderId ||
      !holding.holderType
    ) {
      return NextResponse.json(
        { success: false, error: "The current holding record is inconsistent." },
        { status: 409 }
      );
    }

    // Until trusted organization membership verification exists, only a
    // Firebase administrator or the owner of a farmer holding may download.
    const ownsFarmerHolding =
      holding.holderType.toLowerCase() === "farmer" &&
      holding.holderId === user.userId;

    if (!isAdmin && !ownsFarmerHolding) {
      return NextResponse.json(
        {
          success: false,
          error: "Authorization Error: You cannot download this QR label.",
        },
        { status: 403 }
      );
    }

    let content: string | Buffer;
    let contentType: string;

    if (format === "png") {
      content = await QRCodeLib.toBuffer(qr.qrValue, {
        type: "png",
        width: 400,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      contentType = "image/png";
    } else {
      content = await QRCodeLib.toString(qr.qrValue, {
        type: "svg",
        width: 400,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      contentType = "image/svg+xml";
    }

    const safePackageName =
      (typeof qr.packageNumber === "string" ? qr.packageNumber : qrId)
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(0, 100) || "qr-label";

    const responseBody =
      typeof content === "string" ? content : new Uint8Array(content);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safePackageName}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to generate the QR download." },
      { status: 500 }
    );
  }
}
