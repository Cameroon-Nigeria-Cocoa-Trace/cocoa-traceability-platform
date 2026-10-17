import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";
import { WarehouseActorContext } from "@/types/warehouse";

function getActorContext(req: NextRequest, targetWarehouseId: string): WarehouseActorContext {
  const userId = req.headers.get("x-user-id") || "usr_wh_client";
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: warehouseId" },
        { status: 400 }
      );
    }

    const context = getActorContext(req, warehouseId);
    const requests = await warehouseService.listCustomsRequests(context, warehouseId);

    return NextResponse.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes("UNAUTHORIZED") ? 403 : 500;
    return NextResponse.json({ success: false, error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      warehouseId,
      officerId,
      manifestOrBatchCode,
      quantityKg,
      destinationPort,
      exportLicenseNumber,
      notes,
    } = body;

    if (!warehouseId || !manifestOrBatchCode || !quantityKg || !destinationPort) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: warehouseId, manifestOrBatchCode, quantityKg, destinationPort",
        },
        { status: 400 }
      );
    }

    const context = getActorContext(req, warehouseId);

    const request = await warehouseService.submitCustomsExportRequest(context, {
      warehouseId,
      officerId: officerId || context.userId,
      manifestOrBatchCode,
      quantityKg: Number(quantityKg),
      destinationPort,
      exportLicenseNumber: exportLicenseNumber || "EXP-FED-CR-2026",
      notes,
    });

    return NextResponse.json({ success: true, customsRequest: request }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes("UNAUTHORIZED")
      ? 403
      : errorMsg.includes("SUSPENDED")
      ? 423
      : 400;
    return NextResponse.json({ success: false, error: errorMsg }, { status });
  }
}
