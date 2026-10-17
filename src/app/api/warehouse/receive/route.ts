import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";
import { WarehouseActorContext, WarehouseReceiveInput } from "@/types/warehouse";

function getActorContext(req: NextRequest, targetWarehouseId: string): WarehouseActorContext {
  const userId = req.headers.get("x-user-id") || "usr_wh_intake_officer";
  const warehouseId =
    req.headers.get("x-warehouse-id") ||
    req.nextUrl.searchParams.get("actorWarehouseId") ||
    targetWarehouseId;
  const isSuperAdmin = req.headers.get("x-is-admin") === "true";

  return {
    userId,
    warehouseId,
    isSuperAdmin,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      warehouseId,
      officerUserId,
      officerName,
      sourceType,
      sourceReferenceId,
      notes,
      overrideQualityGrade,
      measuredMoistureContentPercent,
    } = body;

    if (!warehouseId || !sourceType || !sourceReferenceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: warehouseId, sourceType, sourceReferenceId",
        },
        { status: 400 }
      );
    }

    const context = getActorContext(req, warehouseId);

    const input: WarehouseReceiveInput = {
      warehouseId,
      officerUserId: officerUserId || context.userId,
      officerName: officerName || `Officer ${context.userId}`,
      sourceType,
      sourceReferenceId,
      notes,
      overrideQualityGrade,
      measuredMoistureContentPercent,
    };

    const result = await warehouseService.receiveCocoaDelivery(context, input);

    return NextResponse.json(
      {
        success: true,
        receipt: result.receipt,
        facility: result.updatedFacility,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes("UNAUTHORIZED")
      ? 403
      : errorMsg.includes("DUPLICATE")
      ? 409
      : errorMsg.includes("EXCEEDS_CAPACITY")
      ? 422
      : errorMsg.includes("SUSPENDED")
      ? 423
      : 400;

    return NextResponse.json({ success: false, error: errorMsg }, { status });
  }
}
