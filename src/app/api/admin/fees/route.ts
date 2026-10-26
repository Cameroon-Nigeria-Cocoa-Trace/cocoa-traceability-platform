import { NextRequest, NextResponse } from "next/server";
import { adminService } from "@/lib/admin/adminService";

export async function GET() {
  try {
    const fees = await adminService.listFeeConfigs();
    return NextResponse.json({ success: true, fees });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-admin-uid") || body.adminUserId || "sys_admin_root";

    const updated = await adminService.updateFeeConfig(
      {
        code: body.code,
        amount: body.amount,
        currency: body.currency,
        isPercentage: body.isPercentage,
        description: body.description,
      },
      actorUid
    );

    return NextResponse.json({ success: true, fee: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
