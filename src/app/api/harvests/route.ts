
import { NextRequest, NextResponse } from "next/server";
import {
  firebaseAdminAuth,
  firebaseAdminDb,
} from "@/lib/firebaseAdmin";
import { getAuthenticatedUser } from "@/lib/authServer";
import type {
  Harvest,
  HarvestStatus,
  CocoaQualityGrade,
} from "@/types/traceability";

type JsonObject = Record<string, unknown>;

class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validateDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(new Date(value).getTime())
  );
}

function validateHarvestDate(
  harvestDate: string,
  production: { startDate: string; endDate?: string }
): void {
  if (!validateDate(harvestDate)) {
    throw new ApiError(400, "Validation Error: Invalid harvestDate.");
  }

  if (!validateDate(production.startDate)) {
    throw new ApiError(
      409,
      "Production record has an invalid startDate."
    );
  }

  if (new Date(harvestDate).getTime() < new Date(production.startDate).getTime()) {
    throw new ApiError(
      400,
      "Date Consistency Error: Harvest date precedes production start."
    );
  }

  if (
    production.endDate &&
    (!validateDate(production.endDate) ||
      new Date(harvestDate).getTime() >
        new Date(production.endDate).getTime())
  ) {
    throw new ApiError(
      400,
      "Date Consistency Error: Harvest date falls outside the production season."
    );
  }
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const userRecord = await firebaseAdminAuth.getUser(userId);
    return userRecord.customClaims?.admin === true;
  } catch {
    return false;
  }
}

async function assertFarmAccess(
  farmId: string,
  userId: string,
  isAdmin: boolean
): Promise<JsonObject> {
  const farmSnap = await firebaseAdminDb
    .collection("farms")
    .doc(farmId)
    .get();

  if (!farmSnap.exists) {
    throw new ApiError(404, "Farm not found.");
  }

  const farm = farmSnap.data() as JsonObject;

  if (farm.farmerId !== userId && !isAdmin) {
    throw new ApiError(
      403,
      "Authorization Error: You cannot access this farm."
    );
  }

  return farm;
}

function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode }
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  console.error("Harvest API error:", error);

  return NextResponse.json(
    { success: false, error: "Harvest operation failed." },
    { status: 500 }
  );
}

// POST /api/harvests
// Creates one harvest and updates production totals atomically.
export async function POST(req: NextRequest) {
  let userId: string;

  try {
    userId = (await getAuthenticatedUser(req)).userId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required." },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      throw new ApiError(400, "Validation Error: Invalid request body.");
    }

    const allowed = new Set([
      "harvestId",
      "farmId",
      "productionRecordId",
      "harvestDate",
      "quantityKg",
      "qualityGrade",
      "notes",
    ]);

    const unsupported = Object.keys(body).filter(
      (key) => !allowed.has(key)
    );

    if (unsupported.length > 0) {
      throw new ApiError(
        400,
        `Validation Error: Unsupported fields: ${unsupported.join(", ")}`
      );
    }

    const farmId =
      typeof body.farmId === "string" ? body.farmId.trim() : "";
    const productionRecordId =
      typeof body.productionRecordId === "string"
        ? body.productionRecordId.trim()
        : "";
    const harvestDate =
      typeof body.harvestDate === "string"
        ? body.harvestDate.trim()
        : "";
    const quantityKg = body.quantityKg;

    if (!farmId || !productionRecordId) {
      throw new ApiError(
        400,
        "Validation Error: farmId and productionRecordId are required."
      );
    }

    if (
      !validateDate(harvestDate) ||
      typeof quantityKg !== "number" ||
      !Number.isFinite(quantityKg) ||
      quantityKg <= 0
    ) {
      throw new ApiError(
        400,
        "Validation Error: A valid harvest date and positive finite quantity are required."
      );
    }

    for (const key of ["qualityGrade", "status", "notes"]) {
      if (body[key] !== undefined && typeof body[key] !== "string") {
        throw new ApiError(
          400,
          `Validation Error: ${key} must be a string.`
        );
      }
    }

    const requestedId =
      typeof body.harvestId === "string" ? body.harvestId.trim() : "";

    if (
      requestedId &&
      !/^[A-Za-z0-9_-]{1,128}$/.test(requestedId)
    ) {
      throw new ApiError(400, "Validation Error: Invalid harvestId.");
    }

    const admin = await isPlatformAdmin(userId);

    const farmRef = firebaseAdminDb.collection("farms").doc(farmId);
    const productionRef = firebaseAdminDb
      .collection("productions")
      .doc(productionRecordId);

    const harvestRef = requestedId
      ? firebaseAdminDb.collection("harvests").doc(requestedId)
      : firebaseAdminDb.collection("harvests").doc();

    const now = new Date().toISOString();
    const initialStatus = (body.status || "logged") as HarvestStatus;

    const result = await firebaseAdminDb.runTransaction(async (tx) => {
      // Read every document before performing transaction writes.
      const farmSnap = await tx.get(farmRef);
      const productionSnap = await tx.get(productionRef);
      const existingHarvestSnap = await tx.get(harvestRef);

      if (!farmSnap.exists) {
        throw new ApiError(404, "Farm not found.");
      }

      const farm = farmSnap.data() as JsonObject;

      if (farm.farmerId !== userId && !admin) {
        throw new ApiError(
          403,
          "Authorization Error: You cannot create a harvest for this farm."
        );
      }

      if (!productionSnap.exists) {
        throw new ApiError(404, "Production record not found.");
      }

      const production = productionSnap.data() as JsonObject;

      if (production.farmId !== farmId) {
        throw new ApiError(
          400,
          "Relational Mismatch Error: Production record belongs to another farm."
        );
      }

      validateHarvestDate(harvestDate, {
        startDate: String(production.startDate || ""),
        endDate:
          typeof production.endDate === "string"
            ? production.endDate
            : undefined,
      });

      // A retry can return an existing record only if it matches the
      // same farm and production season. It must never expose an unrelated
      // record through a caller-supplied harvest ID.
      if (existingHarvestSnap.exists) {
        const existing = existingHarvestSnap.data() as JsonObject;

        if (
          existing.farmId === farmId &&
          existing.productionRecordId === productionRecordId &&
          existing.createdBy === userId
        ) {
          return {
            created: false,
            harvest: {
              ...existing,
              harvestId: existingHarvestSnap.id,
            },
          };
        }

        throw new ApiError(
          409,
          "Conflict Error: This harvestId is already in use."
        );
      }

      const record: Harvest = {
        harvestId: harvestRef.id,
        farmId,
        productionRecordId,
        harvestDate,
        quantityKg,
        qualityGrade:
          body.qualityGrade as CocoaQualityGrade | undefined,
        status: "logged",
        notes:
          typeof body.notes === "string"
            ? body.notes.trim()
            : undefined,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const actualQuantity = Number(production.actualQuantityKg ?? 0);
      const harvestCount = Number(production.numberOfHarvests ?? 0);

      if (
        !Number.isFinite(actualQuantity) ||
        actualQuantity < 0 ||
        !Number.isFinite(harvestCount) ||
        harvestCount < 0
      ) {
        throw new ApiError(
          409,
          "Production record contains invalid harvest totals."
        );
      }

      tx.create(harvestRef, record);

      // Archived harvests are excluded from active production totals.
      if (initialStatus !== "archived") {
        tx.update(productionRef, {
          actualQuantityKg: actualQuantity + quantityKg,
          numberOfHarvests: harvestCount + 1,
          updatedAt: now,
        });
      }

      return { created: true, harvest: record };
    });

    return NextResponse.json(
      { success: true, harvest: result.harvest },
      { status: result.created ? 201 : 200 }
    );
  } catch (error: unknown) {
    return handleError(error);
  }
}

// GET /api/harvests?farmId=... OR ?productionRecordId=...
// Every read is authorized against the parent farm first.
export async function GET(req: NextRequest) {
  let userId: string;

  try {
    userId = (await getAuthenticatedUser(req)).userId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const productionRecordId =
      searchParams.get("productionRecordId")?.trim();
    const requestedFarmId = searchParams.get("farmId")?.trim();

    if (!productionRecordId && !requestedFarmId) {
      throw new ApiError(
        400,
        "farmId or productionRecordId is required."
      );
    }

    const admin = await isPlatformAdmin(userId);
    let records: Harvest[] = [];
    let authorizedFarmId: string;

    if (productionRecordId) {
      const productionSnap = await firebaseAdminDb
        .collection("productions")
        .doc(productionRecordId)
        .get();

      if (!productionSnap.exists) {
        throw new ApiError(404, "Production record not found.");
      }

      const production = productionSnap.data() as JsonObject;

      if (
        typeof production.farmId !== "string" ||
        !production.farmId
      ) {
        throw new ApiError(
          409,
          "Production record has an invalid farm relationship."
        );
      }

      authorizedFarmId = production.farmId;

      if (requestedFarmId && requestedFarmId !== authorizedFarmId) {
        throw new ApiError(
          400,
          "farmId does not match the selected production record."
        );
      }

      await assertFarmAccess(authorizedFarmId, userId, admin);

      const snapshot = await firebaseAdminDb
        .collection("harvests")
        .where("productionRecordId", "==", productionRecordId)
        .get();

      records = snapshot.docs
        .filter((d) => d.data().farmId === authorizedFarmId)
        .map(
          (d) =>
            ({
              ...d.data(),
              harvestId: d.id,
            }) as Harvest
        );
    } else {
      authorizedFarmId = requestedFarmId!;

      await assertFarmAccess(authorizedFarmId, userId, admin);

      const snapshot = await firebaseAdminDb
        .collection("harvests")
        .where("farmId", "==", authorizedFarmId)
        .get();

      records = snapshot.docs.map(
        (d) =>
          ({
            ...d.data(),
            harvestId: d.id,
          }) as Harvest
      );
    }

    records.sort((a, b) => b.harvestDate.localeCompare(a.harvestDate));

    return NextResponse.json({ success: true, harvests: records });
  } catch (error: unknown) {
    return handleError(error);
  }
}

// PATCH /api/harvests
// Only harvest-specific mutable fields are accepted.
export async function PATCH(req: NextRequest) {
  let userId: string;

  try {
    userId = (await getAuthenticatedUser(req)).userId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Authentication Required." },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      throw new ApiError(400, "Validation Error: Invalid request body.");
    }

    const harvestId =
      typeof body.harvestId === "string" ? body.harvestId.trim() : "";

    if (!harvestId) {
      throw new ApiError(400, "Validation Error: harvestId is required.");
    }

    const allowed = new Set([
      "harvestId",
      "harvestDate",
      "quantityKg",
      "qualityGrade",
      "notes",
    ]);

    const unsupported = Object.keys(body).filter(
      (key) => !allowed.has(key)
    );

    if (unsupported.length > 0) {
      throw new ApiError(
        400,
        `Validation Error: Unsupported fields: ${unsupported.join(", ")}`
      );
    }

    const suppliedFields = Object.keys(body).filter(
      (key) => key !== "harvestId"
    );

    if (suppliedFields.length === 0) {
      throw new ApiError(400, "No harvest update fields supplied.");
    }

    for (const key of ["harvestDate", "qualityGrade", "status", "notes"]) {
      if (body[key] !== undefined && typeof body[key] !== "string") {
        throw new ApiError(
          400,
          `Validation Error: ${key} must be a string.`
        );
      }
    }

    if (
      body.quantityKg !== undefined &&
      (typeof body.quantityKg !== "number" ||
        !Number.isFinite(body.quantityKg) ||
        body.quantityKg <= 0)
    ) {
      throw new ApiError(
        400,
        "Validation Error: quantityKg must be a positive finite number."
      );
    }

    const admin = await isPlatformAdmin(userId);
    const harvestRef = firebaseAdminDb
      .collection("harvests")
      .doc(harvestId);

    const now = new Date().toISOString();

    const updated = await firebaseAdminDb.runTransaction(async (tx) => {
      const harvestSnap = await tx.get(harvestRef);

      if (!harvestSnap.exists) {
        throw new ApiError(404, "Harvest not found.");
      }

      const existing = harvestSnap.data() as JsonObject;
      const farmId = String(existing.farmId || "");
      const productionRecordId = String(existing.productionRecordId || "");

      if (!farmId || !productionRecordId) {
        throw new ApiError(
          409,
          "Harvest has an invalid farm or production relationship."
        );
      }

      const farmRef = firebaseAdminDb.collection("farms").doc(farmId);
      const productionRef = firebaseAdminDb
        .collection("productions")
        .doc(productionRecordId);

      const farmSnap = await tx.get(farmRef);
      const productionSnap = await tx.get(productionRef);

      if (!farmSnap.exists || !productionSnap.exists) {
        throw new ApiError(
          409,
          "Harvest's parent farm or production record no longer exists."
        );
      }

      const farm = farmSnap.data() as JsonObject;
      const production = productionSnap.data() as JsonObject;

      if (farm.farmerId !== userId && !admin) {
        throw new ApiError(
          403,
          "Authorization Error: You cannot update this harvest."
        );
      }

      if (production.farmId !== farmId) {
        throw new ApiError(
          409,
          "Harvest and production record have inconsistent farm IDs."
        );
      }

      const oldQuantity = Number(existing.quantityKg);
      const newQuantity =
        body.quantityKg !== undefined
          ? Number(body.quantityKg)
          : oldQuantity;

      const oldStatus = String(existing.status || "logged");
      const newStatus =
        typeof body.status === "string" ? body.status : oldStatus;

      const newDate =
        typeof body.harvestDate === "string"
          ? body.harvestDate.trim()
          : String(existing.harvestDate || "");

      validateHarvestDate(newDate, {
        startDate: String(production.startDate || ""),
        endDate:
          typeof production.endDate === "string"
            ? production.endDate
            : undefined,
      });

      if (!Number.isFinite(oldQuantity) || oldQuantity <= 0) {
        throw new ApiError(409, "Existing harvest quantity is invalid.");
      }

      const oldTotal = Number(production.actualQuantityKg ?? 0);
      const oldCount = Number(production.numberOfHarvests ?? 0);

      if (
        !Number.isFinite(oldTotal) ||
        oldTotal < 0 ||
        !Number.isFinite(oldCount) ||
        oldCount < 0
      ) {
        throw new ApiError(
          409,
          "Production record contains invalid harvest totals."
        );
      }

      const wasArchived = oldStatus === "archived";
      const isNowArchived = newStatus === "archived";

      let actualDelta = 0;
      let countDelta = 0;

      if (!wasArchived && isNowArchived) {
        actualDelta = -oldQuantity;
        countDelta = -1;
      } else if (wasArchived && !isNowArchived) {
        actualDelta = newQuantity;
        countDelta = 1;
      } else if (!isNowArchived) {
        actualDelta = newQuantity - oldQuantity;
      }

      const updatedHarvest: Record<string, unknown> = {
        ...existing,
        harvestId: harvestSnap.id,
        harvestDate: newDate,
        quantityKg: newQuantity,
        status: newStatus,
        updatedAt: now,
      };

      if (body.qualityGrade !== undefined) {
        updatedHarvest.qualityGrade = body.qualityGrade;
      }

      if (body.notes !== undefined) {
        updatedHarvest.notes = body.notes;
      }

      // Immutable fields are preserved from the stored record:
      // farmId, productionRecordId, createdBy and createdAt.
      tx.update(harvestRef, updatedHarvest);

      if (actualDelta !== 0 || countDelta !== 0) {
        tx.update(productionRef, {
          actualQuantityKg: Math.max(0, oldTotal + actualDelta),
          numberOfHarvests: Math.max(0, oldCount + countDelta),
          updatedAt: now,
        });
      }

      return updatedHarvest as unknown as Harvest;
    });

    return NextResponse.json({ success: true, harvest: updated });
  } catch (error: unknown) {
    return handleError(error);
  }
}
