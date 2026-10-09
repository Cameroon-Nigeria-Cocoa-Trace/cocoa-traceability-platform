/**
 * Cloudinary Service
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Server-side Cloudinary integration for agricultural traceability assets.
 * - Securely manages Cloudinary credentials using environment variables (never exposed to client).
 * - Enforces asset validation: non-empty binary buffer, supported MIME types, size thresholds.
 * - Directs uploads into standard folder hierarchies: "cocoa-traceability/lots".
 * - Produces standardized CloudinaryImageReference metadata for Firestore persistence.
 * - Guarantees that image binaries and base64 strings are never stored in Firestore.
 */

import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { CloudinaryImageReference } from "@/types/traceability";

export const CLOUDINARY_FOLDERS = {
  COCOA_LOTS: "cocoa-traceability/lots",
  FARMS: "cocoa-traceability/farms",
  DOCUMENTS: "cocoa-traceability/documents",
} as const;

// 10 MB maximum file size for agricultural inspection photos
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// Permitted agricultural image MIME types
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface UploadImageOptions {
  filename?: string;
  mimeType?: string;
  folder?: string;
  customPublicId?: string;
  tags?: string[];
  uploaderId?: string;
}

/**
 * Validates and retrieves server-side Cloudinary configuration from process.env.
 * Throws explicit error if any required credential is missing or empty.
 */
export function getCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName) {
    throw new Error(
      "Cloudinary Configuration Error: CLOUDINARY_CLOUD_NAME environment variable is required but missing."
    );
  }
  if (!apiKey) {
    throw new Error(
      "Cloudinary Configuration Error: CLOUDINARY_API_KEY environment variable is required but missing."
    );
  }
  if (!apiSecret) {
    throw new Error(
      "Cloudinary Configuration Error: CLOUDINARY_API_SECRET environment variable is required but missing."
    );
  }

  return { cloudName, apiKey, apiSecret };
}

/**
 * Configures the Cloudinary v2 SDK instance using server-side environment variables.
 */
export function initializeCloudinary(): void {
  const config = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
}

/**
 * Validates raw image binary buffer and optional MIME type prior to transmission.
 */
export function validateImageUploadInput(buffer: Buffer, mimeType?: string): void {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Image Validation Error: A valid binary image Buffer is required.");
  }

  if (buffer.length === 0) {
    throw new Error("Image Validation Error: Image buffer cannot be empty (0 bytes).");
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Image Validation Error: File size (${sizeMb} MB) exceeds maximum allowed size of 10 MB.`
    );
  }

  if (mimeType) {
    const normalizedMime = mimeType.toLowerCase().trim();
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMime)) {
      throw new Error(
        `Image Validation Error: Unsupported MIME type "${mimeType}". Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`
      );
    }
  }
}

/**
 * Maps a successful Cloudinary UploadApiResponse to the project's CloudinaryImageReference interface.
 */
export function mapCloudinaryResponseToReference(
  response: Partial<UploadApiResponse> | Record<string, unknown>
): CloudinaryImageReference {
  if (!response || typeof response !== "object") {
    throw new Error("Cloudinary Error: Received empty or invalid upload response from Cloudinary.");
  }

  const res = response as Record<string, unknown>;
  const publicId = res.public_id as string | undefined;

  if (!publicId) {
    throw new Error("Cloudinary Error: Upload response is missing public_id.");
  }

  const url = (res.secure_url || res.url) as string | undefined;
  if (!url) {
    throw new Error("Cloudinary Error: Upload response is missing asset URL.");
  }

  return {
    publicId,
    url: (res.url as string) || (res.secure_url as string),
    secureUrl: (res.secure_url as string) || (res.url as string),
    format: res.format as string | undefined,
    width: typeof res.width === "number" ? res.width : undefined,
    height: typeof res.height === "number" ? res.height : undefined,
    bytes: typeof res.bytes === "number" ? res.bytes : undefined,
    resourceType: (res.resource_type as string) || "image",
    createdAt: (res.created_at as string) || new Date().toISOString(),
  };
}

/**
 * Uploads a Cocoa Lot image buffer to Cloudinary in the "cocoa-traceability/lots" directory.
 * Returns a validated CloudinaryImageReference for storage in Firestore.
 */
export async function uploadCocoaLotImage(
  buffer: Buffer,
  options?: UploadImageOptions
): Promise<CloudinaryImageReference> {
  validateImageUploadInput(buffer, options?.mimeType);
  initializeCloudinary();

  const folder = options?.folder || CLOUDINARY_FOLDERS.COCOA_LOTS;

  return new Promise((resolve, reject) => {
    const tags = options?.tags ? [...options.tags] : ["cocoa-lot", "traceability"];
    if (options?.uploaderId) {
      tags.push(`uploader:${options.uploaderId}`);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        public_id: options?.customPublicId,
        tags,
        context: options?.uploaderId ? { uploadedBy: options.uploaderId } : undefined,
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            new Error(
              `Cloudinary Upload Failed: ${error?.message || "Unknown error occurred during asset upload."}`
            )
          );
        }

        try {
          const imageReference = mapCloudinaryResponseToReference(result);
          resolve(imageReference);
        } catch (mapError) {
          reject(mapError);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * General asset upload function for future document workflows (farms, inspection certificates, legal deeds).
 */
export async function uploadTraceabilityAsset(
  buffer: Buffer,
  folder: string,
  options?: UploadImageOptions
): Promise<CloudinaryImageReference> {
  validateImageUploadInput(buffer, options?.mimeType);
  initializeCloudinary();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        public_id: options?.customPublicId,
        tags: options?.tags || ["cocoa-traceability"],
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            new Error(
              `Cloudinary Asset Upload Failed: ${error?.message || "Failed to upload asset."}`
            )
          );
        }

        try {
          resolve(mapCloudinaryResponseToReference(result));
        } catch (err) {
          reject(err);
        }
      }
    );

    uploadStream.end(buffer);
  });
}
