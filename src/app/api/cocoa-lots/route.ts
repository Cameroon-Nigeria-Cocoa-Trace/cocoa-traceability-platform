/**
 * Cocoa Lots API
 * Endpoint: /api/cocoa-lots
 *
 * Creates and lists cocoa lots through authenticated server-side
 * operations. Harvest allocation and lot creation are atomic.
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  firebaseAdminAuth,
  firebaseAdminDb,
} from "@/lib/firebaseAdmin";
import { getAuthenticatedUser } from "@/lib/authServer";
import type {
  CocoaLot,
  CloudinaryImageReference,
} from "@/types/traceability";

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredString(
  value: unknown,
  fieldName: string
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(
      `${fieldName} is required and must be a non-empty string.`,
      400
    );
  }

  return value.trim();
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

/**
 * Build a safe Cloudinary metadata reference.
 * Image binaries and data URLs are never accepted.
 */
function validateCloudinaryImage(
  value: unknown
): CloudinaryImageReference {
  if (!isObject(value)) {
    throw new ApiError(
      "cocoaImage is required and must be a Cloudinary metadata reference.",
      400
    );
  }

  const publicId = requiredString(
    value.publicId,
    "cocoaImage.publicId"
  );

  if (publicId.length > 512) {
    throw new ApiError(
      "cocoaImage.publicId is too long.",
      400
    );
  }

  const candidateUrl =
    typeof value.secureUrl === "string" &&
    value.secureUrl.trim()
      ? value.secureUrl.trim()
      : value.url;

  if (
    typeof candidateUrl !== "string" ||
    !candidateUrl.trim()
  ) {
    throw new ApiError(
      "cocoaImage must contain a valid Cloudinary secure URL.",
      400
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(candidateUrl);
  } catch {
    throw new ApiError(
      "cocoaImage URL is invalid.",
      400
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "res.cloudinary.com"
  ) {
    throw new ApiError(
      "cocoaImage must use an HTTPS Cloudinary URL.",
      400
    );
  }

  const image: CloudinaryImageReference = {
    publicId,
    url: parsedUrl.toString(),
    secureUrl: parsedUrl.toString(),
  };

  if (typeof value.format === "string") {
    image.format = value.format;
  }

  if (typeof value.resourceType === "string") {
    image.resourceType = value.resourceType;
  }

  if (typeof value.createdAt === "string") {
    image.createdAt = value.createdAt;
  }

  for (const field of ["width", "height", "bytes"] as const) {
    const fieldValue = value[field];

    if (fieldValue !== undefined) {
      if (
        typeof fieldValue !== "number" ||
        !Number.isFinite(fieldValue) ||
        fieldValue < 0
      ) {
        throw new ApiError(
          `cocoaImage.${field} must be a non-negative finite number.`,
          400
        );
      }

      image[field] = fieldValue;
    }
  }

  return image;
}

/**
 * Authorization uses only a verified Firebase custom admin claim
 * or the farm's canonical farmerId.
 */
async function hasAdminClaim(uid: string): Promise<boolean> {
  const userRecord = await firebaseAdminAuth.getUser(uid);
  return userRecord.customClaims?.admin === true;
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.statusCode }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : "An unexpected server error occurred.";

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}

/**
 * POST /api/cocoa-lots
 *
 * Creates a cocoa lot and deducts its quantity from the harvest's
 * unallocated capacity within the same Firestore transaction.
 */
export async function POST(req: NextRequest) {
  let user: { userId: string };

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
      },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (!isObject(body)) {
      throw new ApiError(
        "The request body must be a JSON object.",
        400
      );
    }

    // Accept legacy metadata fields for compatibility, but never
    // trust the client to determine creator, dates, or lot number.
    const allowedFields = new Set([
      "lotId",
      "lotNumber",
      "farmId",
      "productionRecordId",
      "harvestId",
      "quantityKg",
      "pricePerKg",
      "currency",
      "qualityGrade",
      "cocoaImage",
      "productionPeriod",
      "productionDate",
      "createdBy",
    ]);

    const unsupportedFields = Object.keys(body).filter(
      (key) => !allowedFields.has(key)
    );

    if (unsupportedFields.length > 0) {
      throw new ApiError(
        `Unsupported field(s): ${unsupportedFields.join(", ")}.`,
        400
      );
    }

    const farmId = requiredString(body.farmId, "farmId");
    const productionRecordId = requiredString(
      body.productionRecordId,
      "productionRecordId"
    );
    const harvestId = requiredString(
      body.harvestId,
      "harvestId"
    );

    if (
      typeof body.quantityKg !== "number" ||
      !Number.isFinite(body.quantityKg) ||
      body.quantityKg <= 0
    ) {
      throw new ApiError(
        "quantityKg must be a positive finite number.",
        400
      );
    }

    if (
      typeof body.pricePerKg !== "number" ||
      !Number.isFinite(body.pricePerKg) ||
      body.pricePerKg < 0
    ) {
      throw new ApiError(
        "pricePerKg must be a non-negative finite number.",
        400
      );
    }

    let currency = "XAF";

    if (body.currency !== undefined) {
      currency = requiredString(body.currency, "currency");

      if (currency.length > 10) {
        throw new ApiError(
          "currency is too long.",
          400
        );
      }
    }

    let qualityGrade: string | undefined;

    if (body.qualityGrade !== undefined) {
      qualityGrade = requiredString(
        body.qualityGrade,
        "qualityGrade"
      );

      if (qualityGrade.length > 100) {
        throw new ApiError(
          "qualityGrade is too long.",
          400
        );
      }
    }

    const cocoaImage = validateCloudinaryImage(
      body.cocoaImage
    );

    let lotId: string;

    if (body.lotId === undefined || body.lotId === "") {
      lotId = firebaseAdminDb
        .collection("cocoaLots")
        .doc().id;
    } else {
      lotId = requiredString(body.lotId, "lotId");

      if (!/^[A-Za-z0-9_-]{1,128}$/.test(lotId)) {
        throw new ApiError(
          "lotId contains unsupported characters or is too long.",
          400
        );
      }
    }

    const isAdmin = await hasAdminClaim(user.userId);

    const farmRef = firebaseAdminDb
      .collection("farms")
      .doc(farmId);

    const productionRef = firebaseAdminDb
      .collection("productions")
      .doc(productionRecordId);

    const harvestRef = firebaseAdminDb
      .collection("harvests")
      .doc(harvestId);

    const lotRef = firebaseAdminDb
      .collection("cocoaLots")
      .doc(lotId);

    const now = new Date().toISOString();
    const randomSuffix = randomBytes(5)
      .toString("hex")
      .toUpperCase();

    const result = await firebaseAdminDb.runTransaction(
      async (transaction) => {
        // Complete all reads before writing.
        const farmSnapshot = await transaction.get(farmRef);
        const productionSnapshot =
          await transaction.get(productionRef);
        const harvestSnapshot =
          await transaction.get(harvestRef);
        const existingLotSnapshot =
          await transaction.get(lotRef);

        if (!farmSnapshot.exists) {
          throw new ApiError("Farm not found.", 404);
        }

        const farm = farmSnapshot.data()!;

        if (
          farm.farmerId !== user.userId &&
          !isAdmin
        ) {
          throw new ApiError(
            "You are not authorized to create a lot for this farm.",
            403
          );
        }

        if (!productionSnapshot.exists) {
          throw new ApiError(
            "Production record not found.",
            404
          );
        }

        const production = productionSnapshot.data()!;

        if (production.farmId !== farmId) {
          throw new ApiError(
            "The production record does not belong to the specified farm.",
            409
          );
        }

        if (!harvestSnapshot.exists) {
          throw new ApiError("Harvest not found.", 404);
        }

        const harvest = harvestSnapshot.data()!;

        if (
          harvest.farmId !== farmId ||
          harvest.productionRecordId !== productionRecordId
        ) {
          throw new ApiError(
            "The harvest does not belong to the specified farm and production record.",
            409
          );
        }

        if (harvest.status === "archived") {
          throw new ApiError(
            "An archived harvest cannot be allocated to a new lot.",
            409
          );
        }

        // Idempotency: an existing lot ID is reusable only for the
        // same authenticated creator and the same core request.
        if (existingLotSnapshot.exists) {
          const existing =
            existingLotSnapshot.data() as CocoaLot;

          const sameRequest =
            existing.createdBy === user.userId &&
            existing.farmId === farmId &&
            existing.productionRecordId === productionRecordId &&
            existing.harvestId === harvestId &&
            existing.quantityKg === body.quantityKg;

          if (!sameRequest) {
            throw new ApiError(
              "This lot ID has already been used for a different request.",
              409
            );
          }

          return existing;
        }

        const harvestQuantity = harvest.quantityKg;
        const allocatedQuantity =
          harvest.allocatedQuantityKg ?? 0;

        if (
          typeof harvestQuantity !== "number" ||
          !Number.isFinite(harvestQuantity) ||
          harvestQuantity <= 0 ||
          typeof allocatedQuantity !== "number" ||
          !Number.isFinite(allocatedQuantity) ||
          allocatedQuantity < 0 ||
          allocatedQuantity > harvestQuantity
        ) {
          throw new ApiError(
            "The harvest inventory quantities are invalid. Resolve the inventory inconsistency before allocating this lot.",
            409
          );
        }

        if (!isValidDate(harvest.harvestDate)) {
          throw new ApiError(
            "The harvest has an invalid harvest date.",
            409
          );
        }

        const remainingCapacity =
          harvestQuantity - allocatedQuantity;

        const pricePerKg = body.pricePerKg;

        if (
          typeof pricePerKg !== "number" ||
          !Number.isFinite(pricePerKg) ||
          pricePerKg <= 0
        ) {
          throw new ApiError(
            "The price per kilogram must be a positive, finite number.",
            400
          );
        }

        const quantityKg = body.quantityKg;

        if (
          typeof quantityKg !== "number" ||
          !Number.isFinite(quantityKg) ||
          quantityKg <= 0
        ) {
          throw new ApiError(
            "The cocoa lot quantity must be a positive, finite number.",
            400
          );
        }

        if (quantityKg > remainingCapacity) {
          throw new ApiError(
            `Requested quantity (${quantityKg} kg) exceeds remaining harvest capacity (${remainingCapacity} kg).`,
            409
          );
        }

        const newAllocatedQuantity =
          allocatedQuantity + quantityKg;

        const newAvailableQuantity = Math.max(
          0,
          harvestQuantity - newAllocatedQuantity
        );

        const updatedHarvestStatus =
          newAvailableQuantity === 0
            ? "allocated_to_lot"
            : harvest.status || "logged";

        const seasonSegment = String(
          production.seasonYear || "GEN"
        )
          .replace(/[^a-zA-Z0-9]/g, "-")
          .toUpperCase()
          .slice(0, 24);

        const lot: CocoaLot = {
          lotId,
          lotNumber: `LOT-CMR-${seasonSegment}-${Date.now()
            .toString(36)
            .toUpperCase()}-${randomSuffix}`,
          farmId,
          productionRecordId,
          harvestId,
          originCountry: "Cameroon",
          productionPeriod: requiredString(
            production.productionPeriod,
            "production.productionPeriod"
          ),
          productionDate: harvest.harvestDate,
          quantityKg,
          availableQuantityKg: quantityKg,
          pricePerKg,
          currency,
          qualityGrade:
            qualityGrade ?? harvest.qualityGrade,
          cocoaImage,
          lotStatus: "created",
          createdBy: user.userId,
          createdAt: now,
          updatedAt: now,
        };

        // The harvest update and lot creation succeed or fail together.
        transaction.update(harvestRef, {
          allocatedQuantityKg: newAllocatedQuantity,
          availableQuantityKg: newAvailableQuantity,
          status: updatedHarvestStatus,
          updatedAt: now,
        });

        transaction.create(lotRef, lot);

        return lot;
      }
    );

    return NextResponse.json({
      success: true,
      lot: result,
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

/**
 * GET /api/cocoa-lots
 *
 * Lists lots only after authenticating the requester and verifying
 * access to the farm associated with the requested records.
 */
export async function GET(req: NextRequest) {
  let user: { userId: string };

  try {
    user = await getAuthenticatedUser(req);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
      },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);

    const farmId = searchParams.get("farmId")?.trim();
    const productionRecordId =
      searchParams.get("productionRecordId")?.trim();
    const harvestId = searchParams.get("harvestId")?.trim();

    if (!farmId && !productionRecordId && !harvestId) {
      throw new ApiError(
        "Provide farmId, productionRecordId, or harvestId.",
        400
      );
    }

    let resolvedFarmId = farmId || "";
    let filterField: "farmId" | "productionRecordId" | "harvestId";
    let filterValue: string;

    if (harvestId) {
      const harvestSnapshot = await firebaseAdminDb
        .collection("harvests")
        .doc(harvestId)
        .get();

      if (!harvestSnapshot.exists) {
        throw new ApiError("Harvest not found.", 404);
      }

      const harvest = harvestSnapshot.data()!;

      resolvedFarmId = harvest.farmId;
      filterField = "harvestId";
      filterValue = harvestId;
    } else if (productionRecordId) {
      const productionSnapshot = await firebaseAdminDb
        .collection("productions")
        .doc(productionRecordId)
        .get();

      if (!productionSnapshot.exists) {
        throw new ApiError(
          "Production record not found.",
          404
        );
      }

      const production = productionSnapshot.data()!;

      resolvedFarmId = production.farmId;
      filterField = "productionRecordId";
      filterValue = productionRecordId;
    } else {
      filterField = "farmId";
      filterValue = farmId!;
    }

    if (
      typeof resolvedFarmId !== "string" ||
      !resolvedFarmId.trim()
    ) {
      throw new ApiError(
        "The requested record has no valid farm reference.",
        409
      );
    }

    const farmSnapshot = await firebaseAdminDb
      .collection("farms")
      .doc(resolvedFarmId)
      .get();

    if (!farmSnapshot.exists) {
      throw new ApiError("Farm not found.", 404);
    }

    const farm = farmSnapshot.data()!;
    const isAdmin = await hasAdminClaim(user.userId);

    if (
      farm.farmerId !== user.userId &&
      !isAdmin
    ) {
      throw new ApiError(
        "You are not authorized to view lots for this farm.",
        403
      );
    }

    const snapshot = await firebaseAdminDb
      .collection("cocoaLots")
      .where(filterField, "==", filterValue)
      .get();

    const lots = snapshot.docs
      .map((document) => document.data() as CocoaLot)
      .sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

    return NextResponse.json({
      success: true,
      lots,
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}