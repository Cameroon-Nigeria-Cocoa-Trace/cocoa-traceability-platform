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
import { uploadCocoaLotImage } from "@/services/cloudinaryService";
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

    const blob = file as Blob;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = blob.type || "image/jpeg";
    const filename = "name" in blob && typeof blob.name === "string" ? blob.name : undefined;

    // 3. Upload to Cloudinary with uploader context
    const imageReference = await uploadCocoaLotImage(buffer, {
      filename,
      mimeType,
      uploaderId: user.userId,
    });

    return NextResponse.json({
      success: true,
      imageReference,
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
