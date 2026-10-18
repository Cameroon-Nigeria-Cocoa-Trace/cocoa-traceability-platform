
import { NextRequest, NextResponse } from "next/server";
import { adjustMarketplaceAvailability } from "@/services/marketplaceService";
import { getAuthenticatedUser } from "@/lib/authServer";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "listingId",
  "lotId",
  "sellerHolderId",
  "adjustmentType",
  "isPhysicalDeduction",
  "deductedQuantityKg",
  "newStatus",
  "newQuantityKg",
  "reason",
  "notes",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
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

    const listingId = rawListingId.trim();

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

    if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Unsupported adjustment fields.",
        },
        { status: 400 }
      );
    }

    // The URL is the source of truth for listingId.
    if (
      body.listingId !== undefined &&
      body.listingId !== listingId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Body listingId must match the URL.",
        },
        { status: 400 }
      );
    }

    if (
      typeof body.lotId !== "string" ||
      !body.lotId.trim() ||
      body.lotId.length > 256
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: A valid lotId is required." },
        { status: 400 }
      );
    }

    if (
      typeof body.sellerHolderId !== "string" ||
      !body.sellerHolderId.trim() ||
      body.sellerHolderId.length > 256
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: A valid sellerHolderId is required.",
        },
        { status: 400 }
      );
    }

    if (
      typeof body.adjustmentType !== "string" ||
      !body.adjustmentType.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: adjustmentType is required.",
        },
        { status: 400 }
      );
    }

    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.trim().length > 500
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Reason must contain 1–500 characters.",
        },
        { status: 400 }
      );
    }

    if (
      body.isPhysicalDeduction !== undefined &&
      typeof body.isPhysicalDeduction !== "boolean"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: isPhysicalDeduction must be a boolean.",
        },
        { status: 400 }
      );
    }

    if (
      body.deductedQuantityKg !== undefined &&
      (
        typeof body.deductedQuantityKg !== "number" ||
        !Number.isFinite(body.deductedQuantityKg) ||
        body.deductedQuantityKg < 0
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: deductedQuantityKg must be a finite non-negative number.",
        },
        { status: 400 }
      );
    }

    if (
      body.newQuantityKg !== undefined &&
      (
        typeof body.newQuantityKg !== "number" ||
        !Number.isFinite(body.newQuantityKg) ||
        body.newQuantityKg < 0
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: newQuantityKg must be a finite non-negative number.",
        },
        { status: 400 }
      );
    }

    if (
      body.newStatus !== undefined &&
      (
        typeof body.newStatus !== "string" ||
        !body.newStatus.trim()
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid newStatus." },
        { status: 400 }
      );
    }

    if (
      body.notes !== undefined &&
      (typeof body.notes !== "string" || body.notes.length > 1000)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Notes must not exceed 1000 characters.",
        },
        { status: 400 }
      );
    }

    const adjustment = await adjustMarketplaceAvailability({
      listingId,
      lotId: body.lotId.trim(),
      sellerHolderId: body.sellerHolderId.trim(),
      adjustmentType: body.adjustmentType,
      reason: body.reason.trim(),
      actorUid: user.userId,
      ...(body.isPhysicalDeduction !== undefined
        ? { isPhysicalDeduction: body.isPhysicalDeduction }
        : {}),
      ...(body.deductedQuantityKg !== undefined
        ? { deductedQuantityKg: body.deductedQuantityKg }
        : {}),
      ...(body.newStatus !== undefined
        ? { newStatus: body.newStatus }
        : {}),
      ...(body.newQuantityKg !== undefined
        ? { newQuantityKg: body.newQuantityKg }
        : {}),
      ...(typeof body.notes === "string" && body.notes.trim()
        ? { notes: body.notes.trim() }
        : {}),
    });

    return NextResponse.json(
      { success: true, adjustment },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status =
      message.startsWith("Authentication Required")
        ? 401
        : message.startsWith("Authorization Error")
          ? 403
          : message.startsWith("Validation Error") ||
              message.startsWith("Relational Mismatch")
            ? 400
            : message.startsWith("Listing Error") ||
                message.startsWith("Upstream Lookup Error")
              ? 404
              : message.startsWith("Capacity Error") ||
                  message.startsWith("Commitment Error") ||
                  message.startsWith("State Error")
                ? 409
                : 500;

    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? "Unable to adjust marketplace availability." : message,
      },
      { status }
    );
  }
}
