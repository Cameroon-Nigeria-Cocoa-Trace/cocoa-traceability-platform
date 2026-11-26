import { NextRequest, NextResponse } from "next/server";
import QRCodeLib from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAuthenticatedUser } from "@/lib/authServer";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { buildQRVerificationUrl, resolveRequestOrigin } from "@/lib/qrUrl";
import {
  isCooperativeAuthorizedForHolding,
  isPlatformAdmin,
} from "@/lib/serverCooperativeAuth";
import type { CertificateHolding, QRCode } from "@/types/traceability";

export const runtime = "nodejs";

function safeAscii(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "-");
}

async function generateQRPdfLabel(
  qr: QRCode,
  verificationUrl: string
): Promise<Uint8Array> {
  const qrPngBuffer = await QRCodeLib.toBuffer(verificationUrl, {
    type: "png",
    width: 600,
    margin: 2,
    errorCorrectionLevel: "H",
    color: {
      dark: "#064e3b",
      light: "#ffffff",
    },
  });

  const pdfDoc = await PDFDocument.create();
  const pageWidth = 420;
  const pageHeight = 580;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const deepGreen = rgb(6 / 255, 45 / 255, 34 / 255);
  const emerald = rgb(6 / 255, 78 / 255, 59 / 255);
  const mintAccent = rgb(184 / 255, 245 / 255, 139 / 255);
  const darkText = rgb(28 / 255, 25 / 255, 23 / 255);
  const mutedText = rgb(87 / 255, 83 / 255, 78 / 255);
  const lightSurface = rgb(245 / 255, 245 / 255, 244 / 255);
  const borderGray = rgb(214 / 255, 211 / 255, 209 / 255);
  const white = rgb(1, 1, 1);

  // Outer frame
  page.drawRectangle({
    x: 18,
    y: 18,
    width: pageWidth - 36,
    height: pageHeight - 36,
    borderColor: emerald,
    borderWidth: 2,
    color: white,
  });

  // Top dark green header bar
  const headerHeight = 64;
  page.drawRectangle({
    x: 18,
    y: pageHeight - 18 - headerHeight,
    width: pageWidth - 36,
    height: headerHeight,
    color: deepGreen,
  });

  page.drawText("TRACETRADENETWORK", {
    x: 34,
    y: pageHeight - 46,
    size: 15,
    font: fontBold,
    color: white,
  });

  page.drawText("FROM FARM TO WORLD  |  CAMEROON COCOA TRACEABILITY", {
    x: 34,
    y: pageHeight - 64,
    size: 7.5,
    font: fontBold,
    color: mintAccent,
  });

  // Center QR code image
  const embeddedQr = await pdfDoc.embedPng(qrPngBuffer);
  const qrSize = 210;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = pageHeight - 18 - headerHeight - 28 - qrSize;

  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    borderColor: borderGray,
    borderWidth: 1,
    color: white,
  });

  page.drawImage(embeddedQr, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // Prominent QR Code ID directly under the barcode
  const qrIdBoxY = qrY - 62;
  page.drawRectangle({
    x: 34,
    y: qrIdBoxY,
    width: pageWidth - 68,
    height: 44,
    color: lightSurface,
    borderColor: borderGray,
    borderWidth: 1,
  });

  const qrCaption = "QR CODE ID (ENTER AT TRACEABILITY PORTAL TO VERIFY)";
  const captionWidth = fontBold.widthOfTextAtSize(qrCaption, 6.8);
  page.drawText(qrCaption, {
    x: (pageWidth - captionWidth) / 2,
    y: qrIdBoxY + 28,
    size: 6.8,
    font: fontBold,
    color: mutedText,
  });

  const qrValueText = safeAscii(qr.qrValue);
  let qrIdFontSize = 10.5;
  while (
    qrIdFontSize > 6.5 &&
    fontMono.widthOfTextAtSize(qrValueText, qrIdFontSize) > pageWidth - 88
  ) {
    qrIdFontSize -= 0.5;
  }
  const qrValueWidth = fontMono.widthOfTextAtSize(qrValueText, qrIdFontSize);
  page.drawText(qrValueText, {
    x: (pageWidth - qrValueWidth) / 2,
    y: qrIdBoxY + 11,
    size: qrIdFontSize,
    font: fontMono,
    color: emerald,
  });

  // Package & Lot Details Section
  const pkgTitle = safeAscii(qr.packageNumber || qr.qrId);
  let pkgFontSize = 14;
  while (
    pkgFontSize > 9 &&
    fontBold.widthOfTextAtSize(pkgTitle, pkgFontSize) > pageWidth - 72
  ) {
    pkgFontSize -= 0.5;
  }
  const pkgTitleWidth = fontBold.widthOfTextAtSize(pkgTitle, pkgFontSize);
  const pkgTitleY = qrIdBoxY - 28;
  page.drawText(pkgTitle, {
    x: (pageWidth - pkgTitleWidth) / 2,
    y: pkgTitleY,
    size: pkgFontSize,
    font: fontBold,
    color: darkText,
  });

  const rows: [string, string][] = [
    ["Net Weight", `${qr.representedQuantityKg} kg`],
    ["Lot Number", safeAscii(qr.lotNumber || "N/A")],
    ["Certificate", `#${safeAscii(qr.certificateNumber || "N/A")}`],
    ["Package Seq", `#${qr.sequenceNumber}`],
    [
      "Status",
      qr.retiredOnSale ||
      qr.status === "transferred" ||
      qr.status === "superseded"
        ? "RETIRED (SOLD / NON-REUSABLE)"
        : safeAscii((qr.status || "active").toUpperCase()),
    ],
  ];

  let rowY = pkgTitleY - 26;
  for (const [label, value] of rows) {
    page.drawText(label, {
      x: 38,
      y: rowY,
      size: 9,
      font: fontRegular,
      color: mutedText,
    });

    const valWidth = fontBold.widthOfTextAtSize(value, 9);
    page.drawText(value, {
      x: pageWidth - 38 - valWidth,
      y: rowY,
      size: 9,
      font: fontBold,
      color: darkText,
    });

    page.drawLine({
      start: { x: 38, y: rowY - 5 },
      end: { x: pageWidth - 38, y: rowY - 5 },
      thickness: 0.5,
      color: borderGray,
    });

    rowY -= 19;
  }

  // Footer
  const footerNotice =
    "Scan with a camera or type the QR Code ID on TraceTradeNetwork.";
  const footerWidth = fontRegular.widthOfTextAtSize(footerNotice, 7.5);
  page.drawText(footerNotice, {
    x: (pageWidth - footerWidth) / 2,
    y: 44,
    size: 7.5,
    font: fontRegular,
    color: mutedText,
  });

  const cleanUrl = safeAscii(verificationUrl);
  let urlSize = 6.5;
  while (
    urlSize > 4.5 &&
    fontRegular.widthOfTextAtSize(cleanUrl, urlSize) > pageWidth - 60
  ) {
    urlSize -= 0.25;
  }
  const urlWidth = fontRegular.widthOfTextAtSize(cleanUrl, urlSize);
  page.drawText(cleanUrl, {
    x: (pageWidth - urlWidth) / 2,
    y: 31,
    size: urlSize,
    font: fontRegular,
    color: emerald,
  });

  return await pdfDoc.save();
}

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

    if (formatParam && formatParam !== "pdf" && formatParam !== "png") {
      return NextResponse.json(
        { success: false, error: "Validation Error: Format must be pdf or png." },
        { status: 400 }
      );
    }

    const format: "pdf" | "png" = formatParam === "png" ? "png" : "pdf";

    const isAdmin = await isPlatformAdmin(user.userId);

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

    const isAuthorized =
      isAdmin || (await isCooperativeAuthorizedForHolding(user.userId, holding));

    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: "Authorization Error: You cannot download this QR label.",
        },
        { status: 403 }
      );
    }

    const verificationUrl = buildQRVerificationUrl(
      qr.qrValue,
      resolveRequestOrigin(req)
    );

    const safePackageName =
      (typeof qr.packageNumber === "string" ? qr.packageNumber : qrId)
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(0, 100) || "qr-label";

    if (format === "png") {
      const pngBuffer = await QRCodeLib.toBuffer(verificationUrl, {
        type: "png",
        width: 400,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      return new NextResponse(new Uint8Array(pngBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="${safePackageName}.png"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const pdfBytes = await generateQRPdfLabel(qr, verificationUrl);

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safePackageName}.pdf"`,
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
