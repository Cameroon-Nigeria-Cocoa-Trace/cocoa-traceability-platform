/**
 * Cocoa Lot Image Upload API Route
 * Endpoint: POST /api/upload/cocoa-lot
 *
 * Secure server-side proxy route for the Frontend developer.
 * Enforces authentication: Requires an authenticated Firebase user before allowing uploads.
 * Associates asset metadata with the uploader's Firebase UID.
 * Receives multipart/form-data image files from the browser, validates file thresholds,
 * uploads directly to Cloudinary using private server-side credentials,
 * and returns a standard CloudinaryImageReference.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  uploadCocoaLotImage,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
} from "@/services/cloudinaryService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  // 1. Enforce Authentication Requirement
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json(
      { success: false, error: authMessage },
      { status: 401 }
    );
  }

  // 2. Parse and Validate File Input
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "Validation Error: 'file' field is required in form-data." },
        { status: 400 }
      );
    }

    const uploadedFile = file as File;

    // Reject empty files before reading them into memory.
    if (uploadedFile.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: The uploaded image is empty.",
        },
        { status: 400 }
      );
    }

    // Enforce the 10 MB limit before allocating an image buffer.
    if (uploadedFile.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Image size exceeds the 10 MB limit.",
        },
        { status: 413 }
      );
    }

    // Validate the declared image type before reading the file.
    const mimeType = uploadedFile.type.toLowerCase().trim();

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Unsupported image format.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());

    // Upload using the authenticated user's UID.
    const imageReference = await uploadCocoaLotImage(buffer, {
      filename: uploadedFile.name,
      mimeType,
      uploaderId: user.userId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Cocoa lot image upload error:", message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
