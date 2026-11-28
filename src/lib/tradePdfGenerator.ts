"use client";

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from "pdf-lib";
import { DeliveryNote, PurchaseOrder, TradeInvoice } from "@/types/traceability";

const BRAND_GREEN = rgb(11 / 255, 53 / 255, 40 / 255); // #0b3528
const ACCENT_GREEN = rgb(45 / 255, 97 / 255, 48 / 255); // #2d6130
const LIGHT_BG = rgb(247 / 255, 248 / 255, 243 / 255); // #f7f8f3
const BORDER_COLOR = rgb(215 / 255, 226 / 255, 208 / 255);
const TEXT_DARK = rgb(16 / 255, 37 / 255, 29 / 255);
const TEXT_MUTED = rgb(87 / 255, 101 / 255, 93 / 255);
const WHITE = rgb(1, 1, 1);

function sanitizeText(value?: string | number | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(amount: number, currency: string): string {
  return `${(Number(amount) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${sanitizeText(currency).toUpperCase()}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "Pending";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return sanitizeText(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function tryEmbedRemoteImage(
  pdfDoc: PDFDocument,
  url?: string
): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const bytes = await res.arrayBuffer();
    if (contentType.includes("png") || url.toLowerCase().endsWith(".png")) {
      return await pdfDoc.embedPng(bytes);
    }
    if (
      contentType.includes("jpeg") ||
      contentType.includes("jpg") ||
      url.toLowerCase().endsWith(".jpg") ||
      url.toLowerCase().endsWith(".jpeg")
    ) {
      return await pdfDoc.embedJpg(bytes);
    }
    // Try PNG then JPG as fallback
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color = TEXT_DARK,
  lineHeight = size + 4
): number {
  const words = sanitizeText(text).split(" ");
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, size);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= lineHeight;
  }
  return cursorY;
}

function drawHeaderBanner(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  docTitle: string,
  docNumber: string,
  statusLabel: string
) {
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: 0,
    y: height - 92,
    width,
    height: 92,
    color: BRAND_GREEN,
  });

  page.drawText("TRACETRADENETWORK", {
    x: 42,
    y: height - 38,
    size: 16,
    font: fontBold,
    color: WHITE,
  });
  page.drawText("From Farm to World  |  Cameroon Cocoa Traceability & Export Exchange", {
    x: 42,
    y: height - 55,
    size: 8.5,
    font: fontRegular,
    color: rgb(184 / 255, 245 / 255, 139 / 255),
  });
  page.drawText(sanitizeText(docTitle).toUpperCase(), {
    x: 42,
    y: height - 76,
    size: 12,
    font: fontBold,
    color: WHITE,
  });

  const numText = sanitizeText(docNumber);
  const numWidth = fontBold.widthOfTextAtSize(numText, 12);
  page.drawText(numText, {
    x: width - 42 - numWidth,
    y: height - 42,
    size: 12,
    font: fontBold,
    color: WHITE,
  });

  const statusText = sanitizeText(statusLabel).toUpperCase();
  const statusWidth = fontBold.widthOfTextAtSize(statusText, 8.5);
  page.drawRectangle({
    x: width - 42 - statusWidth - 16,
    y: height - 72,
    width: statusWidth + 16,
    height: 20,
    color: ACCENT_GREEN,
  });
  page.drawText(statusText, {
    x: width - 42 - statusWidth - 8,
    y: height - 65,
    size: 8.5,
    font: fontBold,
    color: WHITE,
  });
}

function drawFooter(page: PDFPage, fontRegular: PDFFont, referenceId: string) {
  const { width } = page.getSize();
  page.drawLine({
    start: { x: 42, y: 48 },
    end: { x: width - 42, y: 48 },
    thickness: 0.75,
    color: BORDER_COLOR,
  });
  page.drawText(
    `TraceTradeNetwork Verified Trade Document  |  Ref: ${sanitizeText(referenceId)}  |  Generated: ${formatDate(new Date().toISOString())}`,
    {
      x: 42,
      y: 32,
      size: 7.5,
      font: fontRegular,
      color: TEXT_MUTED,
    }
  );
}

function triggerPdfDownload(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================================================================
// 1. PURCHASE ORDER PDF (WITH BUYER LETTERHEAD LOGO + BUYER & SELLER SIGNATURES)
// ============================================================================

export async function downloadPurchaseOrderPdf(po: PurchaseOrder): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const statusText = po.sellerSignature
    ? "Confirmed & Signed"
    : "Submitted by Buyer";

  drawHeaderBanner(page, fontBold, fontRegular, "Purchase Order", po.poNumber, statusText);

  const { width, height } = page.getSize();
  let y = height - 118;

  // Buyer Official Letterhead Box
  page.drawRectangle({
    x: 42,
    y: y - 82,
    width: width - 84,
    height: 82,
    color: LIGHT_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  const logoImg = await tryEmbedRemoteImage(pdfDoc, po.buyerLetterhead.logoUrl);
  let letterheadTextX = 56;
  if (logoImg) {
    const dims = logoImg.scaleToFit(72, 62);
    page.drawImage(logoImg, {
      x: 54,
      y: y - 10 - dims.height - (62 - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
    letterheadTextX = 140;
  }

  page.drawText("BUYER LETTERHEAD", {
    x: letterheadTextX,
    y: y - 18,
    size: 7.5,
    font: fontBold,
    color: ACCENT_GREEN,
  });
  page.drawText(sanitizeText(po.buyerLetterhead.companyName), {
    x: letterheadTextX,
    y: y - 34,
    size: 13,
    font: fontBold,
    color: TEXT_DARK,
  });
  page.drawText(`Address: ${sanitizeText(po.buyerLetterhead.address)}`, {
    x: letterheadTextX,
    y: y - 50,
    size: 9,
    font: fontRegular,
    color: TEXT_DARK,
  });
  page.drawText(
    `Business Registration No.: ${sanitizeText(po.buyerLetterhead.businessRegistrationNumber)}  |  Buyer Role: ${sanitizeText(po.buyerHolderType).toUpperCase()}`,
    {
      x: letterheadTextX,
      y: y - 66,
      size: 8.5,
      font: fontBold,
      color: TEXT_MUTED,
    }
  );

  y -= 104;

  // Two-column Trade Parties & Metadata
  const colW = (width - 96) / 2;
  page.drawText("SELLER DETAILS", { x: 42, y, size: 8.5, font: fontBold, color: ACCENT_GREEN });
  page.drawText("ORDER DETAILS", { x: 54 + colW, y, size: 8.5, font: fontBold, color: ACCENT_GREEN });
  y -= 16;

  page.drawText(sanitizeText(po.sellerContactName || "Verified Cocoa Seller"), {
    x: 42,
    y,
    size: 10.5,
    font: fontBold,
    color: TEXT_DARK,
  });
  page.drawText(`PO Date: ${formatDate(po.createdAt)}`, {
    x: 54 + colW,
    y,
    size: 9.5,
    font: fontRegular,
    color: TEXT_DARK,
  });
  y -= 15;

  page.drawText(`Entity Type: ${sanitizeText(po.sellerHolderType).toUpperCase()}`, {
    x: 42,
    y,
    size: 9,
    font: fontRegular,
    color: TEXT_MUTED,
  });
  page.drawText(`Listing No.: ${sanitizeText(po.listingNumber)}`, {
    x: 54 + colW,
    y,
    size: 9,
    font: fontRegular,
    color: TEXT_DARK,
  });
  y -= 14;

  page.drawText(`Location: ${sanitizeText(po.sellerLocation || "Cameroon")}`, {
    x: 42,
    y,
    size: 9,
    font: fontRegular,
    color: TEXT_MUTED,
  });
  page.drawText(`Cocoa Lot ID: ${sanitizeText(po.lotId)}`, {
    x: 54 + colW,
    y,
    size: 9,
    font: fontRegular,
    color: TEXT_DARK,
  });
  y -= 14;

  if (po.sellerContactPhone || po.sellerContactEmail) {
    page.drawText(
      sanitizeText([po.sellerContactPhone, po.sellerContactEmail].filter(Boolean).join(" | ")),
      { x: 42, y, size: 8.5, font: fontRegular, color: TEXT_MUTED }
    );
  }
  page.drawText(
    `Certification: ${sanitizeText(po.certificationType).toUpperCase()}${po.certificateId ? ` (${po.certificateId})` : ""}`,
    { x: 54 + colW, y, size: 8.5, font: fontRegular, color: TEXT_MUTED }
  );

  y -= 32;

  // Commercial Line Item Table
  page.drawRectangle({
    x: 42,
    y: y - 24,
    width: width - 84,
    height: 24,
    color: BRAND_GREEN,
  });
  page.drawText("COCOA LOT DESCRIPTION", { x: 52, y: y - 15, size: 8.5, font: fontBold, color: WHITE });
  page.drawText("QTY (KG)", { x: 295, y: y - 15, size: 8.5, font: fontBold, color: WHITE });
  page.drawText("UNIT PRICE", { x: 368, y: y - 15, size: 8.5, font: fontBold, color: WHITE });
  page.drawText("PURCHASE PRICE", { x: 455, y: y - 15, size: 8.5, font: fontBold, color: WHITE });

  y -= 24;
  page.drawRectangle({
    x: 42,
    y: y - 52,
    width: width - 84,
    height: 52,
    color: WHITE,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  drawWrappedText(
    page,
    `${po.listingTitle} (${po.qualityGrade || "Grade 1"})`,
    52,
    y - 18,
    230,
    fontBold,
    9.5,
    TEXT_DARK,
    13
  );
  page.drawText(`${po.quantityKg.toLocaleString("en-US")} kg`, {
    x: 295,
    y: y - 22,
    size: 9.5,
    font: fontBold,
    color: TEXT_DARK,
  });
  page.drawText(formatMoney(po.unitPricePerKg, po.currency), {
    x: 368,
    y: y - 22,
    size: 9.5,
    font: fontRegular,
    color: TEXT_DARK,
  });
  page.drawText(formatMoney(po.purchasePrice, po.currency), {
    x: 455,
    y: y - 22,
    size: 10,
    font: fontBold,
    color: BRAND_GREEN,
  });

  y -= 66;

  // Total Summary Box
  page.drawRectangle({
    x: width - 262,
    y: y - 34,
    width: 220,
    height: 34,
    color: LIGHT_BG,
    borderColor: ACCENT_GREEN,
    borderWidth: 1,
  });
  page.drawText("TOTAL PURCHASE PRICE:", {
    x: width - 250,
    y: y - 21,
    size: 8.5,
    font: fontBold,
    color: TEXT_MUTED,
  });
  const totalText = formatMoney(po.purchasePrice, po.currency);
  const totalW = fontBold.widthOfTextAtSize(totalText, 11);
  page.drawText(totalText, {
    x: width - 52 - totalW,
    y: y - 21,
    size: 11,
    font: fontBold,
    color: BRAND_GREEN,
  });

  y -= 56;

  if (po.notes) {
    page.drawText("AGREED TERMS / BUYER NOTES:", { x: 42, y, size: 8, font: fontBold, color: ACCENT_GREEN });
    y = drawWrappedText(page, po.notes, 42, y - 14, width - 84, fontRegular, 9, TEXT_DARK, 13) - 10;
  }

  // Dual Signature Section
  const sigBoxY = Math.min(y - 16, 260);
  const sigBoxW = (width - 100) / 2;
  const sigBoxH = 128;

  // Buyer Signature Box
  page.drawRectangle({
    x: 42,
    y: sigBoxY - sigBoxH,
    width: sigBoxW,
    height: sigBoxH,
    color: LIGHT_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });
  page.drawText("BUYER SIGNATURE", {
    x: 54,
    y: sigBoxY - 18,
    size: 8,
    font: fontBold,
    color: ACCENT_GREEN,
  });

  const buyerSigImg = await tryEmbedRemoteImage(pdfDoc, po.buyerSignature.signatureImageUrl);
  if (buyerSigImg) {
    const dims = buyerSigImg.scaleToFit(sigBoxW - 36, 48);
    page.drawImage(buyerSigImg, {
      x: 54,
      y: sigBoxY - 76,
      width: dims.width,
      height: dims.height,
    });
  }
  page.drawLine({
    start: { x: 54, y: sigBoxY - 82 },
    end: { x: 42 + sigBoxW - 14, y: sigBoxY - 82 },
    thickness: 0.75,
    color: BORDER_COLOR,
  });
  page.drawText(sanitizeText(po.buyerSignature.signerName), {
    x: 54,
    y: sigBoxY - 96,
    size: 9.5,
    font: fontBold,
    color: TEXT_DARK,
  });
  page.drawText(
    sanitizeText(
      [po.buyerSignature.signerTitle, `Signed: ${formatDate(po.buyerSignature.signedAt)}`]
        .filter(Boolean)
        .join(" | ")
    ),
    { x: 54, y: sigBoxY - 110, size: 7.5, font: fontRegular, color: TEXT_MUTED }
  );

  // Seller Signature Box
  const sellerBoxX = 58 + sigBoxW;
  page.drawRectangle({
    x: sellerBoxX,
    y: sigBoxY - sigBoxH,
    width: sigBoxW,
    height: sigBoxH,
    color: LIGHT_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });
  page.drawText("SELLER CONFIRMATION SIGNATURE", {
    x: sellerBoxX + 12,
    y: sigBoxY - 18,
    size: 8,
    font: fontBold,
    color: ACCENT_GREEN,
  });

  if (po.sellerSignature) {
    const sellerSigImg = await tryEmbedRemoteImage(pdfDoc, po.sellerSignature.signatureImageUrl);
    if (sellerSigImg) {
      const dims = sellerSigImg.scaleToFit(sigBoxW - 36, 48);
      page.drawImage(sellerSigImg, {
        x: sellerBoxX + 12,
        y: sigBoxY - 76,
        width: dims.width,
        height: dims.height,
      });
    }
    page.drawLine({
      start: { x: sellerBoxX + 12, y: sigBoxY - 82 },
      end: { x: sellerBoxX + sigBoxW - 14, y: sigBoxY - 82 },
      thickness: 0.75,
      color: BORDER_COLOR,
    });
    page.drawText(sanitizeText(po.sellerSignature.signerName), {
      x: sellerBoxX + 12,
      y: sigBoxY - 96,
      size: 9.5,
      font: fontBold,
      color: TEXT_DARK,
    });
    page.drawText(
      sanitizeText(
        [po.sellerSignature.signerTitle, `Signed: ${formatDate(po.sellerSignature.signedAt)}`]
          .filter(Boolean)
          .join(" | ")
      ),
      { x: sellerBoxX + 12, y: sigBoxY - 110, size: 7.5, font: fontRegular, color: TEXT_MUTED }
    );
  } else {
    page.drawText("Awaiting Seller Review & Signature", {
      x: sellerBoxX + 12,
      y: sigBoxY - 64,
      size: 9,
      font: fontRegular,
      color: TEXT_MUTED,
    });
  }

  drawFooter(page, fontRegular, po.poNumber);

  const bytes = await pdfDoc.save();
  triggerPdfDownload(bytes, `${po.poNumber}.pdf`);
}

// ============================================================================
// 2. COMMERCIAL INVOICE PDF
// ============================================================================

export async function downloadInvoicePdf(po: PurchaseOrder, invoice: TradeInvoice): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const statusLabel =
    invoice.status === "paid"
      ? "PAID"
      : invoice.status === "off_platform_receipt_uploaded"
        ? "RECEIPT SUBMITTED"
        : "ISSUED / PAYABLE";

  drawHeaderBanner(page, fontBold, fontRegular, "Commercial Invoice", invoice.invoiceNumber, statusLabel);

  const { width, height } = page.getSize();
  let y = height - 118;

  const colW = (width - 96) / 2;
  page.drawText("BILL TO (BUYER)", { x: 42, y, size: 8.5, font: fontBold, color: ACCENT_GREEN });
  page.drawText("INVOICE METADATA", { x: 54 + colW, y, size: 8.5, font: fontBold, color: ACCENT_GREEN });
  y -= 16;

  page.drawText(sanitizeText(invoice.buyerCompanyName), { x: 42, y, size: 11, font: fontBold, color: TEXT_DARK });
  page.drawText(`Invoice Date: ${formatDate(invoice.issuedAt)}`, { x: 54 + colW, y, size: 9.5, font: fontRegular, color: TEXT_DARK });
  y -= 15;

  page.drawText(`Address: ${sanitizeText(invoice.buyerAddress)}`, { x: 42, y, size: 9, font: fontRegular, color: TEXT_MUTED });
  page.drawText(`Purchase Order Ref: ${sanitizeText(invoice.poNumber)}`, { x: 54 + colW, y, size: 9.5, font: fontBold, color: TEXT_DARK });
  y -= 14;

  page.drawText(`Reg No.: ${sanitizeText(invoice.buyerRegistrationNumber)}`, { x: 42, y, size: 9, font: fontRegular, color: TEXT_MUTED });
  page.drawText(`Seller: ${sanitizeText(invoice.sellerContactName || "Verified Seller")}`, { x: 54 + colW, y, size: 9, font: fontRegular, color: TEXT_DARK });
  y -= 14;

  page.drawText(`Cocoa Lot: ${sanitizeText(invoice.lotId)}`, { x: 42, y, size: 9, font: fontRegular, color: TEXT_MUTED });
  page.drawText(`Seller Origin: ${sanitizeText(invoice.sellerLocation || "Cameroon")}`, { x: 54 + colW, y, size: 9, font: fontRegular, color: TEXT_MUTED });

  y -= 32;

  // Line Item Table
  page.drawRectangle({ x: 42, y: y - 24, width: width - 84, height: 24, color: BRAND_GREEN });
  page.drawText("ITEM DESCRIPTION", { x: 52, y: y - 15, size: 8.5, font: fontBold, color: WHITE });
  page.drawText("QTY (KG)", { x: 295, y: y - 15, size: 8.5, font: fontBold, color: WHITE });
  page.drawText("UNIT PRICE", { x: 368, y: y - 15, size: 8.5, font: fontBold, color: WHITE });
  page.drawText("SUBTOTAL", { x: 460, y: y - 15, size: 8.5, font: fontBold, color: WHITE });

  y -= 24;
  page.drawRectangle({
    x: 42,
    y: y - 48,
    width: width - 84,
    height: 48,
    color: WHITE,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  drawWrappedText(page, invoice.listingTitle, 52, y - 18, 230, fontBold, 9.5, TEXT_DARK, 13);
  page.drawText(`${invoice.quantityKg.toLocaleString("en-US")} kg`, { x: 295, y: y - 22, size: 9.5, font: fontBold, color: TEXT_DARK });
  page.drawText(formatMoney(invoice.unitPricePerKg, invoice.currency), { x: 368, y: y - 22, size: 9.5, font: fontRegular, color: TEXT_DARK });
  page.drawText(formatMoney(invoice.purchasePrice, invoice.currency), { x: 460, y: y - 22, size: 9.5, font: fontBold, color: TEXT_DARK });

  y -= 72;

  // Settlement Options & Fee Schedule Box
  page.drawRectangle({
    x: 42,
    y: y - 142,
    width: width - 84,
    height: 142,
    color: LIGHT_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  page.drawText("SETTLEMENT OPTIONS & FEE BREAKDOWN", {
    x: 54,
    y: y - 20,
    size: 9,
    font: fontBold,
    color: ACCENT_GREEN,
  });

  page.drawText(`1. On-Platform Payment (1.5% Service Fee — Escrow Protection OR Direct Split):`, {
    x: 54,
    y: y - 42,
    size: 9,
    font: fontBold,
    color: TEXT_DARK,
  });
  page.drawText(
    `Base Cocoa Price: ${formatMoney(invoice.purchasePrice, invoice.currency)}  +  Service Fee (1.5%): ${formatMoney(invoice.onPlatformServiceFeeAmount, invoice.currency)}  =  Total: ${formatMoney(invoice.onPlatformTotalAmount, invoice.currency)}`,
    { x: 64, y: y - 58, size: 8.5, font: fontRegular, color: TEXT_MUTED }
  );

  page.drawText(`2. Off-Platform Payment (Direct Settlement + 0.5% Certificate Transfer Fee):`, {
    x: 54,
    y: y - 82,
    size: 9,
    font: fontBold,
    color: TEXT_DARK,
  });
  page.drawText(
    `Direct Payment to Seller: ${formatMoney(invoice.purchasePrice, invoice.currency)}  |  Platform Certificate Transfer Fee (0.5%): ${formatMoney(invoice.offPlatformTransferFeeAmount, invoice.currency)}`,
    { x: 64, y: y - 98, size: 8.5, font: fontRegular, color: TEXT_MUTED }
  );

  if (invoice.status === "paid") {
    page.drawText(
      `CONFIRMED PAID (${invoice.chosenPaymentChannel === "on_platform" ? "ON-PLATFORM" : "OFF-PLATFORM"}): ${formatMoney(invoice.paidAmount ?? invoice.purchasePrice, invoice.currency)} on ${formatDate(invoice.paidAt)}`,
      { x: 54, y: y - 124, size: 9, font: fontBold, color: BRAND_GREEN }
    );
  }

  y -= 168;

  if (po.sellerBankInstructions) {
    page.drawText("SELLER PAYMENT / BANK INSTRUCTIONS (FOR OFF-PLATFORM SETTLEMENT):", {
      x: 42,
      y,
      size: 8.5,
      font: fontBold,
      color: ACCENT_GREEN,
    });
    drawWrappedText(page, po.sellerBankInstructions, 42, y - 15, width - 84, fontRegular, 9, TEXT_DARK, 13);
  }

  drawFooter(page, fontRegular, invoice.invoiceNumber);

  const bytes = await pdfDoc.save();
  triggerPdfDownload(bytes, `${invoice.invoiceNumber}.pdf`);
}

// ============================================================================
// 3. PAYMENT RECEIPT PDF (ON-PLATFORM 1.5%, OFF-PLATFORM CONFIRMED, OR 0.5% TRANSFER FEE)
// ============================================================================

export async function downloadPaymentReceiptPdf(
  po: PurchaseOrder,
  invoice: TradeInvoice | null,
  receiptKind: "on_platform" | "off_platform" | "transfer_fee"
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const receiptNumber =
    receiptKind === "on_platform"
      ? `RCP-${po.onPlatformPaymentReference || po.poNumber}`
      : receiptKind === "transfer_fee"
        ? `RCP-TRF-${po.transferFeePaymentReference || po.poNumber}`
        : `RCP-OFF-${po.poNumber}`;

  const docTitle =
    receiptKind === "on_platform"
      ? "On-Platform Payment Receipt"
      : receiptKind === "transfer_fee"
        ? "Certificate Transfer Fee Receipt (0.5%)"
        : "Confirmed Off-Platform Payment Receipt";

  drawHeaderBanner(page, fontBold, fontRegular, docTitle, receiptNumber.slice(0, 26), "VERIFIED PAID");

  const { width, height } = page.getSize();
  let y = height - 122;

  const rows: Array<[string, string]> = [
    ["Purchase Order Number", po.poNumber],
    ["Invoice Number", invoice?.invoiceNumber || po.invoiceNumber || "N/A"],
    ["Buyer Organization", `${po.buyerLetterhead.companyName} (Reg: ${po.buyerLetterhead.businessRegistrationNumber})`],
    ["Seller", po.sellerContactName || po.sellerId],
    ["Cocoa Lot / Listing", `${po.listingTitle} (${po.lotId})`],
    ["Agreed Quantity", `${po.quantityKg.toLocaleString("en-US")} kg @ ${formatMoney(po.unitPricePerKg, po.currency)}/kg`],
  ];

  if (receiptKind === "on_platform") {
    const fee = po.onPlatformServiceFeeAmount ?? invoice?.onPlatformServiceFeeAmount ?? 0;
    const total = po.onPlatformTotalPaid ?? invoice?.onPlatformTotalAmount ?? po.purchasePrice + fee;
    rows.push(
      [
        "Settlement Mode",
        po.onPlatformMode === "direct_split"
          ? "Direct to Seller (1.5% Service Charge Split to Platform)"
          : "TraceTradeNetwork Platform Escrow (Refund-Protected)",
      ],
      ["Base Purchase Price", formatMoney(po.purchasePrice, po.currency)],
      ["Platform Service Fee (1.5%)", formatMoney(fee, po.currency)],
      ["Total Paid (Verified)", formatMoney(total, po.currency)],
      ["Gateway Payment Reference", po.onPlatformPaymentReference || "Verified"],
      ["Verified Timestamp", formatDate(po.onPlatformPaidAt)]
    );
  } else if (receiptKind === "transfer_fee") {
    const fee = po.transferFeeAmount ?? invoice?.offPlatformTransferFeeAmount ?? 0;
    rows.push(
      ["Fee Purpose", "Off-Platform Certificate Transfer Fee (0.5% of Purchase Price)"],
      ["Base Purchase Price", formatMoney(po.purchasePrice, po.currency)],
      ["Transfer Fee Paid (0.5%)", formatMoney(fee, po.currency)],
      ["Gateway Payment Reference", po.transferFeePaymentReference || "Verified"],
      ["Certificate Transfer ID", po.transferId || "Completed"],
      ["Verified Timestamp", formatDate(po.transferFeePaidAt)]
    );
  } else {
    rows.push(
      ["Settlement Channel", "Off-Platform Direct Settlement"],
      ["Amount Paid to Seller", formatMoney(po.purchasePrice, po.currency)],
      ["Payment Method", po.offPlatformReceipt?.paymentMethodNote || "Direct Off-Platform"],
      ["Buyer Payment Reference", po.offPlatformReceipt?.paymentReferenceNote || "Uploaded Proof"],
      ["Receipt Uploaded At", formatDate(po.offPlatformReceipt?.uploadedAt)],
      ["Confirmed by Seller At", formatDate(po.offPlatformReceipt?.confirmedBySellerAt)]
    );
  }

  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i];
    const rowBg = i % 2 === 0 ? LIGHT_BG : WHITE;
    page.drawRectangle({
      x: 42,
      y: y - 24,
      width: width - 84,
      height: 24,
      color: rowBg,
      borderColor: BORDER_COLOR,
      borderWidth: 0.5,
    });
    page.drawText(sanitizeText(label), {
      x: 52,
      y: y - 16,
      size: 8.5,
      font: fontBold,
      color: TEXT_MUTED,
    });
    page.drawText(sanitizeText(value), {
      x: 230,
      y: y - 16,
      size: 9,
      font: i === rows.length - 3 ? fontBold : fontRegular,
      color: TEXT_DARK,
    });
    y -= 24;
  }

  // Embed uploaded off-platform receipt image if PNG/JPEG
  if (receiptKind === "off_platform" && po.offPlatformReceipt?.receiptUrl) {
    const receiptImg = await tryEmbedRemoteImage(pdfDoc, po.offPlatformReceipt.receiptUrl);
    if (receiptImg && y > 180) {
      y -= 20;
      page.drawText("ATTACHED BUYER PAYMENT PROOF:", {
        x: 42,
        y,
        size: 8.5,
        font: fontBold,
        color: ACCENT_GREEN,
      });
      const maxH = Math.max(120, y - 80);
      const dims = receiptImg.scaleToFit(width - 120, Math.min(240, maxH));
      page.drawImage(receiptImg, {
        x: 42,
        y: y - 12 - dims.height,
        width: dims.width,
        height: dims.height,
      });
    }
  }

  drawFooter(page, fontRegular, receiptNumber);

  const bytes = await pdfDoc.save();
  triggerPdfDownload(bytes, `${receiptNumber}.pdf`);
}

// ============================================================================
// 4. DELIVERY NOTE PDF
// ============================================================================

export async function downloadDeliveryNotePdf(
  po: PurchaseOrder,
  dn: DeliveryNote
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const statusText =
    dn.status === "delivered"
      ? "DELIVERED & CLOSED"
      : dn.status === "in_transit"
        ? "IN TRANSIT"
        : "INITIALIZED";

  drawHeaderBanner(page, fontBold, fontRegular, "Cocoa Delivery Note", dn.deliveryNoteNumber, statusText);

  const { width, height } = page.getSize();
  let y = height - 122;

  const rows: Array<[string, string]> = [
    ["Delivery Note Number", dn.deliveryNoteNumber],
    ["Purchase Order / Invoice", `${dn.poNumber}  /  ${dn.invoiceNumber}`],
    ["Trade Reference", dn.tradeNumber || po.tradeNumber || "In Progress"],
    ["Certificate Transfer ID", dn.transferId || "Uncertified Physical Custody"],
    ["Cocoa Lot / Grade", `${dn.listingTitle} (${dn.lotId} — ${dn.qualityGrade || "Grade 1"})`],
    ["Quantity Dispatched", `${dn.quantityKg.toLocaleString("en-US")} kg`],
    ["Consignor (Seller)", `${dn.sellerContactName || "Verified Seller"} — ${dn.sellerLocation || "Cameroon"}`],
    ["Consignee (Buyer)", `${dn.buyerCompanyName} — ${dn.buyerAddress}`],
    ["Initialized Timestamp", formatDate(dn.initializedAt)],
    [
      "Delivery Confirmation",
      dn.status === "delivered"
        ? `Confirmed Successful on ${formatDate(dn.deliveredAt)}`
        : "Pending Buyer Receipt Confirmation",
    ],
  ];

  if (dn.deliveryNotes) {
    rows.push(["Delivery Notes", dn.deliveryNotes]);
  }
  if (dn.status === "delivered" && typeof dn.remainingListingQuantityRestoredKg === "number") {
    rows.push([
      "Listing Remainder Action",
      dn.remainingListingQuantityRestoredKg > 0
        ? `${dn.remainingListingQuantityRestoredKg.toLocaleString("en-US")} kg returned to Available on Marketplace`
        : "Full lot delivered — Listing marked Sold",
    ]);
  }

  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i];
    const rowBg = i % 2 === 0 ? LIGHT_BG : WHITE;
    page.drawRectangle({
      x: 42,
      y: y - 26,
      width: width - 84,
      height: 26,
      color: rowBg,
      borderColor: BORDER_COLOR,
      borderWidth: 0.5,
    });
    page.drawText(sanitizeText(label), {
      x: 52,
      y: y - 17,
      size: 8.5,
      font: fontBold,
      color: TEXT_MUTED,
    });
    page.drawText(sanitizeText(value), {
      x: 220,
      y: y - 17,
      size: 9,
      font: fontRegular,
      color: TEXT_DARK,
    });
    y -= 26;
  }

  drawFooter(page, fontRegular, dn.deliveryNoteNumber);

  const bytes = await pdfDoc.save();
  triggerPdfDownload(bytes, `${dn.deliveryNoteNumber}.pdf`);
}
