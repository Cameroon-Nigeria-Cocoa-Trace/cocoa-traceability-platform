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
    const warehouseId =
      searchParams.get("warehouseId") ||
      searchParams.get("id") ||
      "wh_ikom_central";

    const context = getActorContext(req, warehouseId);
    const dashboard = await warehouseService.getDashboardData(context, warehouseId);

    return NextResponse.json({ success: true, dashboard });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes("UNAUTHORIZED") ? 403 : 500;
    return NextResponse.json({ success: false, error: errorMsg }, { status });
  }
}
