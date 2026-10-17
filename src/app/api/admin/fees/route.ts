import { NextRequest, NextResponse } from "next/server";
import { adminService } from "@/lib/admin/adminService";

export async function GET(req: NextRequest) {
  try {
    const actorId = req.headers.get("x-admin-id") || req.nextUrl.searchParams.get("adminId");
    if (!actorId) {
      return NextResponse.json(
        { success: false, error: "Missing x-admin-id header or adminId query parameter" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const feeId = searchParams.get("id") || searchParams.get("feeCode");
    const category = searchParams.get("category") || undefined;
    const historyFor = searchParams.get("historyFor");

    if (historyFor) {
      const history = await adminService.getFeeHistory(actorId, historyFor);
      return NextResponse.json({ success: true, count: history.length, history });
    }

    if (feeId) {
      const fee = await adminService.getFee(actorId, feeId);
      return NextResponse.json({ success: true, fee });
    }

    const fees = await adminService.listFees(actorId, { category });
    return NextResponse.json({ success: true, count: fees.length, fees });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actorId = req.headers.get("x-admin-id") || req.nextUrl.searchParams.get("adminId");
    if (!actorId) {
      return NextResponse.json(
        { success: false, error: "Missing x-admin-id header or adminId parameter" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === "update") {
      const { feeIdOrCode, newRate, title, description, isActive, reason } = body;
      if (!feeIdOrCode || !reason) {
        return NextResponse.json(
          { success: false, error: "Missing required fields: feeIdOrCode and reason" },
          { status: 400 }
        );
      }

      const updated = await adminService.updateFeeRate(actorId, feeIdOrCode, {
        newRate,
        title,
        description,
        isActive,
        reason,
      });
      return NextResponse.json({ success: true, fee: updated });
    }

    // Default action: create new fee configuration
    const {
      feeCode,
      title,
      category,
      feeType,
      rate,
      currency,
      minAmount,
      maxAmount,
      description,
    } = body;

    if (!feeCode || !title || rate === undefined || !category || !feeType) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: feeCode, title, category, feeType, rate",
        },
        { status: 400 }
      );
    }

    const created = await adminService.createFeeConfig(actorId, {
      feeCode,
      title,
      category,
      feeType,
      rate,
      currency,
      minAmount,
      maxAmount,
      description,
    });

    return NextResponse.json({ success: true, fee: created }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
