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
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
    const targetType = searchParams.get("targetType") || undefined;
    const action = searchParams.get("action") || undefined;
    const filterActorId = searchParams.get("actor") || undefined;

    const logs = await adminService.getAuditLogs(actorId, {
      limit,
      targetType,
      action,
      filterActorId,
    });

    return NextResponse.json({ success: true, count: logs.length, auditLogs: logs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
