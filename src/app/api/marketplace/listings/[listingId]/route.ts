/**
 * Marketplace Single Listing API Route
 * Endpoint: /api/marketplace/listings/[listingId]
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMarketplaceListing,
  updateMarketplaceListing,
  sanitizePublicListing,
  createMarketplaceListing,
} from "@/services/marketplaceService";
import type { CreateMarketplaceListingInput } from "@/services/marketplaceService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";
import { MarketplaceCertificationType, MarketplaceInventoryMode } from "@/types/traceability";


export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required" },
      { status: 401 }
    );
  }

  try {
    let rawBody: unknown;

    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid JSON body." },
        { status: 400 }
      );
    }

    if (
      rawBody === null ||
      typeof rawBody !== "object" ||
      Array.isArray(rawBody)
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: A JSON object is required." },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;

    // Listing ID, listing number, creator UID, image and lifecycle fields
    // are controlled by the server or derived from trusted source records.
    const allowedFields = new Set([
      "sellerHolderId",
      "sellerHolderType",
      "certificationType",
      "lotId",
      "certificateId",
      "sourceHoldingId",
      "inventoryMode",
      "initialQrPackageIds",
      "title",
      "description",
      "quantityInitialKg",
      "pricePerKg",
      "currency",
      "qualityGrade",
    ]);

    if (Object.keys(body).some((key) => !allowedFields.has(key))) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Unsupported listing fields were supplied.",
        },
        { status: 400 }
      );
    }

    const requiredString = (key: string, maxLength: number): string => {
      const value = body[key];

      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > maxLength
      ) {
        throw new Error(
          `Validation Error: ${key} must be a non-empty string of at most ${maxLength} characters.`
        );
      }

      return value.trim();
    };

    const optionalString = (
      key: string,
      maxLength: number
    ): string | undefined => {
      const value = body[key];

      if (value === undefined) return undefined;

      if (
        typeof value !== "string" ||
        value.length > maxLength
      ) {
        throw new Error(
          `Validation Error: ${key} must be a string of at most ${maxLength} characters.`
        );
      }

      return value.trim() || undefined;
    };

    const sellerHolderId = requiredString("sellerHolderId", 256);
    const sellerHolderType = requiredString("sellerHolderType", 32).toLowerCase();
    const certificationType = requiredString("certificationType", 32);
    const lotId = requiredString("lotId", 256);
    const title = requiredString("title", 150);

    if (
      !["farmer", "cooperative", "agent", "warehouse"].includes(
        sellerHolderType
      )
    ) {
      throw new Error("Validation Error: Unsupported seller holder type.");
    }

    if (
      certificationType !== "certified" &&
      certificationType !== "uncertified"
    ) {
      throw new Error(
        'Validation Error: certificationType must be "certified" or "uncertified".'
      );
    }

    if (
      typeof body.quantityInitialKg !== "number" ||
      !Number.isFinite(body.quantityInitialKg) ||
      body.quantityInitialKg <= 0
    ) {
      throw new Error(
        "Validation Error: quantityInitialKg must be finite and greater than zero."
      );
    }

    if (
      typeof body.pricePerKg !== "number" ||
      !Number.isFinite(body.pricePerKg) ||
      body.pricePerKg <= 0
    ) {
      throw new Error(
        "Validation Error: pricePerKg must be finite and greater than zero."
      );
    }

    const certificateId = optionalString("certificateId", 256);
    const sourceHoldingId = optionalString("sourceHoldingId", 256);
    const description = optionalString("description", 3000);
    const qualityGrade = optionalString("qualityGrade", 100);
    const currency = optionalString("currency", 3);

    if (
      currency !== undefined &&
      !/^[A-Za-z]{3}$/.test(currency)
    ) {
      throw new Error(
        "Validation Error: currency must be a three-letter code."
      );
    }

    let inventoryMode: MarketplaceInventoryMode | undefined;

    if (body.inventoryMode !== undefined) {
      if (
        body.inventoryMode !== "BULK" &&
        body.inventoryMode !== "QR_PACKAGES"
      ) {
        throw new Error(
          'Validation Error: inventoryMode must be "BULK" or "QR_PACKAGES".'
        );
      }

      inventoryMode = body.inventoryMode;
    }

    let initialQrPackageIds: string[] | undefined;

    if (body.initialQrPackageIds !== undefined) {
      if (
        !Array.isArray(body.initialQrPackageIds) ||
        body.initialQrPackageIds.length === 0 ||
        body.initialQrPackageIds.length > 100 ||
        !body.initialQrPackageIds.every(
          (id) =>
            typeof id === "string" &&
            id.trim().length > 0 &&
            id.length <= 256
        )
      ) {
        throw new Error(
          "Validation Error: initialQrPackageIds must contain between 1 and 100 valid package IDs."
        );
      }

      initialQrPackageIds = body.initialQrPackageIds.map(
        (id) => (id as string).trim()
      );

      if (new Set(initialQrPackageIds).size !== initialQrPackageIds.length) {
        throw new Error(
          "Validation Error: Duplicate QR package IDs are not allowed."
        );
      }
    }

    const listingInput: CreateMarketplaceListingInput = {
      sellerHolderId,
      sellerHolderType:
        sellerHolderType as CreateMarketplaceListingInput["sellerHolderType"],
      certificationType:
        certificationType as MarketplaceCertificationType,
      lotId,
      title,
      quantityInitialKg: body.quantityInitialKg,
      pricePerKg: body.pricePerKg,
      createdByUid: user.userId,
      ...(certificateId ? { certificateId } : {}),
      ...(sourceHoldingId ? { sourceHoldingId } : {}),
      ...(inventoryMode ? { inventoryMode } : {}),
      ...(initialQrPackageIds ? { initialQrPackageIds } : {}),
      ...(description ? { description } : {}),
      ...(qualityGrade ? { qualityGrade } : {}),
      ...(currency ? { currency: currency.toUpperCase() } : {}),
    };

    const listing = await createMarketplaceListing(listingInput);

    return NextResponse.json(
      { success: true, listing },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status =
      message.startsWith("Authentication Required")
        ? 401
        : message.startsWith("Authorization Error") ||
            message.startsWith("Ownership Error")
          ? 403
          : message.startsWith("Validation Error") ||
              message.startsWith("Relational Mismatch")
            ? 400
            : message.startsWith("Upstream Lookup Error")
              ? 404
              : message.startsWith("Capacity Error") ||
                  message.startsWith("Reservation Error") ||
                  message.startsWith("Package Error") ||
                  message.startsWith("Package Lookup Error") ||
                  message.startsWith("Quantity Mismatch Error") ||
                  message.startsWith("Listing Error")
                ? 409
                : 500;

    return NextResponse.json(
      {
        success: false,
        error:
          status === 500
            ? "Unable to create marketplace listing."
            : message,
      },
      { status }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params;

    if (
      !listingId ||
      !listingId.trim() ||
      listingId.length > 256
    ) {
      return NextResponse.json(
        { success: false, error: "A valid listing ID is required." },
        { status: 400 }
      );
    }

    const listing = await getMarketplaceListing(listingId.trim());

    if (!listing) {
      return NextResponse.json(
        { success: false, error: "Listing not found." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const forcePublic = searchParams.get("public") === "true";

    // Authentication is optional for public marketplace browsing.
    let requesterUid: string | undefined;

    if (!forcePublic) {
      try {
        const user = await getAuthenticatedUser(req);
        requesterUid = user.userId;
      } catch {
        requesterUid = undefined;
      }
    }

    // Never expose internal listing fields to anonymous users or to
    // authenticated users who did not create this listing.
    if (
      !forcePublic &&
      requesterUid &&
      listing.createdByUid === requesterUid
    ) {
      return NextResponse.json({
        success: true,
        listing,
      });
    }

    return NextResponse.json({
      success: true,
      listing: sanitizePublicListing(listing),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to retrieve marketplace listing." },
      { status: 500 }
    );
  }
}


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required" },
      { status: 401 }
    );
  }

  try {
    const { listingId: rawListingId } = await params;

    if (
      typeof rawListingId !== "string" ||
      !rawListingId.trim() ||
      rawListingId.length > 256
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid listingId." },
        { status: 400 }
      );
    }

    let rawBody: unknown;

    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid JSON body." },
        { status: 400 }
      );
    }

    if (
      rawBody === null ||
      typeof rawBody !== "object" ||
      Array.isArray(rawBody)
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: A JSON object is required." },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;
    const allowedFields = new Set([
      "title",
      "description",
      "pricePerKg",
      "currency",
    ]);

    const unexpectedFields = Object.keys(body).filter(
      (key) => !allowedFields.has(key)
    );

    if (unexpectedFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Validation Error: Unsupported fields supplied. Listing quantity, status, seller identity, certification, and QR references cannot be edited through this endpoint.",
        },
        { status: 400 }
      );
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Provide at least one editable field." },
        { status: 400 }
      );
    }

    const updated = await updateMarketplaceListing({
      listingId: rawListingId.trim(),
      actorUid: user.userId,
      ...(body.title !== undefined
        ? { title: body.title as string }
        : {}),
      ...(body.description !== undefined
        ? { description: body.description as string }
        : {}),
      ...(body.pricePerKg !== undefined
        ? { pricePerKg: body.pricePerKg as number }
        : {}),
      ...(body.currency !== undefined
        ? { currency: body.currency as string }
        : {}),
    });

    return NextResponse.json({
      success: true,
      listing: updated,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status =
      message.startsWith("Authentication Required")
        ? 401
        : message.startsWith("Authorization Error")
          ? 403
          : message.startsWith("Validation Error")
            ? 400
            : message.startsWith("Listing Error")
              ? 404
              : message.startsWith("State Error")
                ? 409
                : 500;

    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? "Unable to update marketplace listing." : message,
      },
      { status }
    );
  }
}

