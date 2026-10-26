import { NextRequest, NextResponse } from "next/server";
import { adminService } from "@/lib/admin/adminService";

export async function GET(req: NextRequest) {
  try {
    const actorUid = req.headers.get("x-admin-uid") || "sys_admin_root";
    const data = await adminService.getDashboardData(actorUid);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
