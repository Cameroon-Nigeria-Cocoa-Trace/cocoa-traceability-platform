
import { NextRequest, NextResponse } from "next/server";
import {
  firebaseAdminAuth,
  firebaseAdminDb,
} from "@/lib/firebaseAdmin";
import {
  getAuthenticatedUser,
  AuthenticatedUser,
} from "@/lib/authServer";
import {
  validateProductionInput,
  CreateProductionRecordInput,
  UpdateProductionRecordInput,
} from "@/services/productionService";
import { ProductionRecord } from "@/types/traceability";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

// Use a trusted Firebase custom claim for administrative access.
// Do not authorize using a client-supplied role or request body.
async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const userRecord = await firebaseAdminAuth.getUser(userId);
    return userRecord.customClaims?.admin === true;
  } catch {
    return false;
  }
}

async function assertFarmOwnership(
  farmId: string,
  user: AuthenticatedUser
): Promise<void> {
  const farmSnap = await firebaseAdminDb
    .collection("farms")
    .doc(farmId)
    .get();

  if (!farmSnap.exists) {
    throw new Error("Farm Lookup Error: Farm not found.");
  }

  const farm = farmSnap.data();

  if (farm?.farmerId === user.userId) {
    return;
  }

  if (await isPlatformAdmin(user.userId)) {
    return;
  }

  throw new Error(
    "Authorization Error: You are not authorized to access this farm's production records."
  );
}

function validationStatus(message: string): number {
  if (message.includes("Authorization Error")) return 403;
  if (message.includes("Farm Lookup Error")) return 404;
  if (message.includes("Validation Error")) return 400;
  if (message.includes("Conflict Error")) return 409;
  return 500;
}

// POST /api/production
// Create a seasonal production record for an authorized farm.
export async function POST(req: NextRequest) {
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Authentication Required";

    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid request body." },
        { status: 400 }
      );
    }

    const allowedKeys = new Set([
      "productionRecordId",
      "farmId",
      "seasonYear",
      "productionPeriod",
      "startDate",
      "endDate",
      "status",
      "estimatedQuantityKg",
      "actualQuantityKg",
      "expectedNumberOfHarvests",
      "numberOfHarvests",
      "notes",
      "createdBy",
    ]);

    const unsupportedKeys = Object.keys(body).filter(
      (key) => !allowedKeys.has(key)
    );

    if (unsupportedKeys.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation Error: Unsupported fields: ${unsupportedKeys.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const farmId =
      typeof body.farmId === "string" ? body.farmId.trim() : "";

    if (!farmId) {
      return NextResponse.json(
        { success: false, error: "Validation Error: farmId is required." },
        { status: 400 }
      );
    }

    // Farm ownership is checked against the authoritative server database.
    await assertFarmOwnership(farmId, user);

    // The client cannot choose the initial lifecycle state or overwrite
    // the authenticated creator and harvest counter.
    if (
      body.status !== undefined &&
      body.status !== "active"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: New production records must start as active.",
        },
        { status: 400 }
      );
    }

    const requestedId =
      typeof body.productionRecordId === "string"
        ? body.productionRecordId.trim()
        : "";

    if (
      requestedId &&
      !/^[A-Za-z0-9_-]{1,128}$/.test(requestedId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Invalid productionRecordId.",
        },
        { status: 400 }
      );
    }

    const input: CreateProductionRecordInput = {
      productionRecordId: requestedId || undefined,
      farmId,
      seasonYear:
        typeof body.seasonYear === "string"
          ? body.seasonYear.trim()
          : "",
      productionPeriod:
        typeof body.productionPeriod === "string"
          ? body.productionPeriod.trim()
          : "",
      startDate:
        typeof body.startDate === "string"
          ? body.startDate.trim()
          : "",
      endDate:
        typeof body.endDate === "string"
          ? body.endDate.trim()
          : undefined,
      status: "active",
      estimatedQuantityKg:
        body.estimatedQuantityKg as number | undefined,
      actualQuantityKg:
        body.actualQuantityKg as number | undefined,
      expectedNumberOfHarvests:
        body.expectedNumberOfHarvests as number | undefined,
      numberOfHarvests: 0,
      notes:
        typeof body.notes === "string"
          ? body.notes.trim()
          : undefined,
      // Never trust a client-supplied creator UID.
      createdBy: user.userId,
    };

    validateProductionInput(input, true);

    const productionRecordId =
      requestedId ||
      firebaseAdminDb.collection("productions").doc().id;

    const now = new Date().toISOString();

    const recordData: JsonObject = {
      productionRecordId,
      farmId,
      seasonYear: input.seasonYear,
      productionPeriod: input.productionPeriod,
      startDate: input.startDate,
      status: "active",
      actualQuantityKg: input.actualQuantityKg ?? 0,
      numberOfHarvests: 0,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    };

    if (input.endDate !== undefined) {
      recordData.endDate = input.endDate;
    }
    if (input.estimatedQuantityKg !== undefined) {
      recordData.estimatedQuantityKg = input.estimatedQuantityKg;
    }
    if (input.expectedNumberOfHarvests !== undefined) {
      recordData.expectedNumberOfHarvests =
        input.expectedNumberOfHarvests;
    }
    if (input.notes !== undefined) {
      recordData.notes = input.notes;
    }

    const recordRef = firebaseAdminDb
      .collection("productions")
      .doc(productionRecordId);

    // Atomic creation prevents a supplied idempotency key from overwriting
    // another record.
    const result = await firebaseAdminDb.runTransaction(async (tx) => {
      const existing = await tx.get(recordRef);

      if (existing.exists) {
        const current = existing.data();

        if (
          current?.createdBy === user.userId &&
          current?.farmId === farmId
        ) {
          return {
            created: false,
            record: {
              ...current,
              productionRecordId: existing.id,
            } as ProductionRecord,
          };
        }

        throw new Error(
          "Conflict Error: This productionRecordId is already in use."
        );
      }

      tx.create(recordRef, recordData);

      return {
        created: true,
        record: recordData as unknown as ProductionRecord,
      };
    });

    return NextResponse.json(
      {
        success: true,
        productionRecord: result.record,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Internal Server Error";

    return NextResponse.json(
      {
        success: false,
        error:
          validationStatus(message) === 500
            ? "Could not create production record."
            : message,
      },
      { status: validationStatus(message) }
    );
  }
}

// GET /api/production?farmId=...
// Return production history only to the farm owner or a trusted admin.
export async function GET(req: NextRequest) {
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Authentication Required";

    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const farmId = searchParams.get("farmId")?.trim();

    if (!farmId) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: farmId query parameter is required.",
        },
        { status: 400 }
      );
    }

    await assertFarmOwnership(farmId, user);

    const snapshot = await firebaseAdminDb
      .collection("productions")
      .where("farmId", "==", farmId)
      .get();

    const productionRecords = snapshot.docs
      .map((document): Record<string, unknown> & { productionRecordId: string } => ({
        ...document.data(),
        productionRecordId: document.id,
      }))
      .sort((a, b) =>
        String(b.startDate ?? "").localeCompare(
          String(a.startDate ?? "")
        )
      );

    return NextResponse.json({
      success: true,
      productionRecords,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Internal Server Error";

    return NextResponse.json(
      {
        success: false,
        error:
          validationStatus(message) === 500
            ? "Could not retrieve production records."
            : message,
      },
      { status: validationStatus(message) }
    );
  }
}

export async function PATCH(req: NextRequest) {
  let user: AuthenticatedUser;

  try {
    user = await getAuthenticatedUser(req);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Authentication Required";

    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await req.json();

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Invalid request body." },
        { status: 400 }
      );
    }

    const productionRecordId =
      typeof body.productionRecordId === "string"
        ? body.productionRecordId.trim()
        : "";

    if (!productionRecordId) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: productionRecordId is required.",
        },
        { status: 400 }
      );
    }

    const allowedFields = new Set([
      "seasonYear",
      "productionPeriod",
      "startDate",
      "endDate",
      "status",
      "estimatedQuantityKg",
      "actualQuantityKg",
      "expectedNumberOfHarvests",
      "numberOfHarvests",
      "notes",
    ]);

    const suppliedFields = Object.keys(body).filter(
      (key) => key !== "productionRecordId"
    );

    const forbiddenFields = suppliedFields.filter(
      (key) => !allowedFields.has(key)
    );

    if (forbiddenFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation Error: Unsupported fields: ${forbiddenFields.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (suppliedFields.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: No update fields were supplied.",
        },
        { status: 400 }
      );
    }

    const stringFields = [
      "seasonYear",
      "productionPeriod",
      "startDate",
      "endDate",
      "status",
      "notes",
    ];

    for (const key of stringFields) {
      if (
        body[key] !== undefined &&
        typeof body[key] !== "string"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Validation Error: ${key} must be a string.`,
          },
          { status: 400 }
        );
      }
    }

    const numericFields = [
      "estimatedQuantityKg",
      "actualQuantityKg",
      "expectedNumberOfHarvests",
      "numberOfHarvests",
    ];

    for (const key of numericFields) {
      if (
        body[key] !== undefined &&
        (typeof body[key] !== "number" ||
          !Number.isFinite(body[key] as number))
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Validation Error: ${key} must be a finite number.`,
          },
          { status: 400 }
        );
      }
    }

    const recordRef = firebaseAdminDb
      .collection("productions")
      .doc(productionRecordId);

    const recordSnap = await recordRef.get();

    if (!recordSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Production record not found." },
        { status: 404 }
      );
    }

    const existing = recordSnap.data()!;

    if (typeof existing.farmId !== "string" || !existing.farmId) {
      return NextResponse.json(
        {
          success: false,
          error: "Production record has an invalid farm relationship.",
        },
        { status: 409 }
      );
    }

    // Authorize access to the farm using trusted server-side data.
    await assertFarmOwnership(existing.farmId, user);

    const updates: UpdateProductionRecordInput = {};

    for (const key of suppliedFields) {
      (updates as Record<string, unknown>)[key] = body[key];
    }

    // Validate the effective date range, including unchanged existing dates.
    validateProductionInput(
      {
        ...updates,
        startDate:
          updates.startDate !== undefined
            ? updates.startDate
            : String(existing.startDate ?? ""),
        endDate:
          updates.endDate !== undefined
            ? updates.endDate
            : typeof existing.endDate === "string"
              ? existing.endDate
              : undefined,
      },
      false
    );

    // Preserve immutable relationship and audit fields.
    const safeUpdates: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await recordRef.update(safeUpdates);

    const updatedRecord = {
      ...existing,
      ...safeUpdates,
      productionRecordId: recordSnap.id,
    } as ProductionRecord;

    return NextResponse.json({
      success: true,
      productionRecord: updatedRecord,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status =
      validationStatus(message);

    return NextResponse.json(
      {
        success: false,
        error:
          status === 500
            ? "Could not update production record."
            : message,
      },
      { status }
    );
  }
}
