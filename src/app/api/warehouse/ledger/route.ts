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
    const receipts = await warehouseService.listReceipts(context, warehouseId);

    return NextResponse.json({
      success: true,
      count: receipts.length,
      receipts,
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
    const action = body.action;

    if (action === "reverse") {
      const { warehouseId, receiptId, reason } = body;
      if (!warehouseId || !receiptId || !reason) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required fields: warehouseId, receiptId, reason",
          },
          { status: 400 }
        );
      }

      const context = getActorContext(req, warehouseId);
      const result = await warehouseService.createReceiptReversal(context, receiptId, reason);

      return NextResponse.json(
        {
          success: true,
          reversalReceipt: result.reversalReceipt,
          facility: result.updatedFacility,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Allowed: 'reverse'" },
      { status: 400 }
    );
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
