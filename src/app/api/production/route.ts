
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

  const farm = farmSnap.data() as JsonObject;

  if (farm?.farmerId === user.userId) {
    return;
  }

  if (await isPlatformAdmin(user.userId)) {
    return;
  }

  try {
    if (
      farm.cooperativeUserId === user.userId ||
      farm.cooperativeOrgId === user.userId ||
      (typeof farm.cooperativeOrgId === "string" && farm.cooperativeOrgId.includes(user.userId))
    ) {
      return;
    }

    const userSnap = await firebaseAdminDb.collection("users").doc(user.userId).get();
    if (userSnap.exists) {
      const uData = userSnap.data();
      const role = uData?.role || uData?.accountType;
      const coopOrgId = uData?.cooperativeOrgId || uData?.cooperativeId;

      if (role === "cooperative" || uData?.isCooperative) {
        if (
          (coopOrgId && (farm.cooperativeOrgId === coopOrgId || farm.cooperativeUserId === user.userId)) ||
          farm.cooperativeUserId === user.userId
        ) {
          return;
        }

        const assocKey1 = `${farm.farmerId}_${user.userId}`;
        const assocKey2 = coopOrgId ? `${farm.farmerId}_${coopOrgId}` : null;

        const assocSnap1 = await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(assocKey1).get();
        if (assocSnap1.exists && assocSnap1.data()?.status === "active") {
          return;
        }

        if (assocKey2) {
          const assocSnap2 = await firebaseAdminDb.collection("farmerCooperativeAssociations").doc(assocKey2).get();
          if (assocSnap2.exists && assocSnap2.data()?.status === "active") {
            return;
          }
        }

        const queryAssoc = await firebaseAdminDb
          .collection("farmerCooperativeAssociations")
          .where("farmerId", "==", farm.farmerId)
          .where("status", "==", "active")
          .get();

        for (const docSnap of queryAssoc.docs) {
          const assocData = docSnap.data();
          if (
            assocData.cooperativeUserId === user.userId ||
            assocData.cooperativeOrgId === user.userId ||
            (coopOrgId && assocData.cooperativeOrgId === coopOrgId)
          ) {
            return;
          }
        }

        const memSnap = await firebaseAdminDb
          .collection("cooperative_memberships")
          .where("farmerId", "==", farm.farmerId)
          .where("status", "==", "active")
          .get();

        for (const docSnap of memSnap.docs) {
          const memData = docSnap.data();
          if (
            (coopOrgId && memData.cooperativeOrgId === coopOrgId) ||
            memData.cooperativeOrgId === user.userId
          ) {
            return;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Cooperative farm ownership check notice:", err);
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

    const yearNumber = parseInt(input.seasonYear, 10);
    if (!isNaN(yearNumber) && yearNumber >= 2020) {
      input.startDate = `${yearNumber}-01-01`;
      input.endDate = `${yearNumber}-12-31`;
    }

    validateProductionInput(input, true);

    // 1. Enforce unique season year per farm: a farmer cannot create 2 separate production records of the same year
    const duplicateSeasonSnap = await firebaseAdminDb
      .collection("productions")
      .where("farmId", "==", farmId)
      .where("seasonYear", "==", input.seasonYear)
      .get();

    if (!duplicateSeasonSnap.empty) {
      return NextResponse.json(
        {
          success: false,
          error: `Conflict Error: A production record for season year ${input.seasonYear} already exists on this farm. Farmers cannot create multiple production records for the same year.`,
        },
        { status: 409 }
      );
    }

    // 2. Enforce harvest completion: must put all harvest periods for existing production seasons before adding another
    const existingRecordsSnap = await firebaseAdminDb
      .collection("productions")
      .where("farmId", "==", farmId)
      .get();

    for (const doc of existingRecordsSnap.docs) {
      const prod = doc.data();
      const targetHarvests = Number(prod.expectedNumberOfHarvests ?? 0);
      const loggedHarvests = Number(prod.numberOfHarvests ?? 0);

      if (targetHarvests > 0 && loggedHarvests < targetHarvests) {
        return NextResponse.json(
          {
            success: false,
            error: `Validation Error: All ${targetHarvests} harvest periods for production season ${prod.seasonYear} (${loggedHarvests} currently logged) must be logged before creating another production record.`,
          },
          { status: 400 }
        );
      }
    }

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
      const {
        getAffiliatedFarmIds,
        getCooperativeActorInfo,
      } = await import("@/lib/serverCooperativeAuth");

      const targetFarmIds = new Set<string>();
      const userFarmsSnap = await firebaseAdminDb
        .collection("farms")
        .where("farmerId", "==", user.userId)
        .get();
      userFarmsSnap.forEach((d) => targetFarmIds.add(d.id));

      const actorInfo = await getCooperativeActorInfo(user.userId);
      if (actorInfo.isCooperative || actorInfo.cooperativeOrgIds.length > 0) {
        const affiliated = await getAffiliatedFarmIds(user.userId);
        affiliated.forEach((id) => targetFarmIds.add(id));
      }

      const farmIdList = Array.from(targetFarmIds);
      const recordsMap = new Map<string, Record<string, unknown> & { productionRecordId: string }>();

      for (let i = 0; i < farmIdList.length; i += 10) {
        const chunk = farmIdList.slice(i, i + 10);
        if (chunk.length === 0) continue;
        const snap = await firebaseAdminDb
          .collection("productions")
          .where("farmId", "in", chunk)
          .get();
        snap.forEach((doc) => {
          recordsMap.set(doc.id, {
            ...doc.data(),
            productionRecordId: doc.id,
          });
        });
      }

      const productionRecords = Array.from(recordsMap.values()).sort((a, b) =>
        String(b.startDate ?? "").localeCompare(String(a.startDate ?? ""))
      );

      return NextResponse.json({
        success: true,
        productionRecords,
      });
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

    // Rule: Season year cannot be edited
    if (body.seasonYear !== undefined && body.seasonYear !== existing.seasonYear) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: Season year cannot be edited on an existing production record.",
        },
        { status: 400 }
      );
    }

    // Rule: When editing, harvests cannot be reduced to less than the amount of harvests already present
    const currentHarvestsCount = Number(existing.numberOfHarvests ?? 0);
    if (
      body.expectedNumberOfHarvests !== undefined &&
      typeof body.expectedNumberOfHarvests === "number" &&
      body.expectedNumberOfHarvests < currentHarvestsCount
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation Error: Number of harvests cannot be reduced to less than the ${currentHarvestsCount} harvest(s) already recorded for this production record.`,
        },
        { status: 400 }
      );
    }

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

// DELETE /api/production?productionRecordId=...
// A farmer cannot delete a production record after harvests have been added under it.
export async function DELETE(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    let productionRecordId = searchParams.get("productionRecordId")?.trim();

    if (!productionRecordId) {
      try {
        const body = await req.json();
        if (isJsonObject(body) && typeof body.productionRecordId === "string") {
          productionRecordId = body.productionRecordId.trim();
        }
      } catch {
        // Query param preferred
      }
    }

    if (!productionRecordId) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation Error: productionRecordId is required.",
        },
        { status: 400 }
      );
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

    // Authorize farm ownership
    await assertFarmOwnership(existing.farmId, user);

    // Rule: Cannot delete a production record after harvests have been added under it
    const loggedCount = Number(existing.numberOfHarvests ?? 0);
    const harvestsSnap = await firebaseAdminDb
      .collection("harvests")
      .where("productionRecordId", "==", productionRecordId)
      .get();

    if (loggedCount > 0 || !harvestsSnap.empty) {
      return NextResponse.json(
        {
          success: false,
          error: `Conflict Error: Cannot delete production record because ${harvestsSnap.size || loggedCount} harvest(s) have already been recorded under it.`,
        },
        { status: 409 }
      );
    }

    await recordRef.delete();

    return NextResponse.json({
      success: true,
      message: "Production record deleted successfully.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status = validationStatus(message);

    return NextResponse.json(
      {
        success: false,
        error:
          status === 500
            ? "Could not delete production record."
            : message,
      },
      { status }
    );
  }
}
