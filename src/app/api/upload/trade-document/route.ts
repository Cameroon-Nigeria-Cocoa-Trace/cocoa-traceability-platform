/**
 * Trade Document Upload API Route
 * Endpoint: POST /api/upload/trade-document
 *
 * Authenticates the caller and securely uploads letterhead logos, signatures,
 * or off-platform payment receipts (PNG, JPEG, WEBP, or PDF) to Cloudinary.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  uploadTradeDocumentAsset,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_TRADE_DOCUMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
} from "@/services/cloudinaryService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage =
      authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json(
      { success: false, error: authMessage },
      { status: 401 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") || "receipt").toLowerCase().trim();

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "Validation Error: 'file' field is required." },
        { status: 400 }
      );
    }

    const uploadedFile = file as File;

    if (uploadedFile.size <= 0) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Uploaded file is empty." },
        { status: 400 }
      );
    }

    if (uploadedFile.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Validation Error: File size exceeds the 10 MB limit." },
        { status: 413 }
      );
    }

    const mimeType = uploadedFile.type.toLowerCase().trim();
    const allowedList =
      kind === "logo" || kind === "signature"
        ? ALLOWED_IMAGE_MIME_TYPES
        : ALLOWED_TRADE_DOCUMENT_MIME_TYPES;

    if (!allowedList.includes(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          error:
            kind === "logo" || kind === "signature"
              ? "Validation Error: Please upload a PNG, JPEG, or WEBP image."
              : "Validation Error: Please upload a PNG, JPEG, WEBP image or PDF receipt.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());

    const asset = await uploadTradeDocumentAsset(buffer, {
      filename: uploadedFile.name,
      mimeType,
      uploaderId: user.userId,
      tags: ["trade-document", kind],
    });

    return NextResponse.json({
      success: true,
      asset,
      fileName: uploadedFile.name,
      mimeType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Trade document upload error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
