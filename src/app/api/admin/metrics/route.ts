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

    const metrics = await adminService.getSystemOverview(actorId);
    return NextResponse.json({ success: true, metrics });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
