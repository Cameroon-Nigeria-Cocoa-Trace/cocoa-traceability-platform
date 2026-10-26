import { NextRequest, NextResponse } from "next/server";
import { adminService } from "@/lib/admin/adminService";

export async function GET() {
  try {
    const status = await adminService.getSystemStatus();
    return NextResponse.json({ success: true, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-admin-uid") || body.adminUserId || "sys_admin_root";

    if (body.targetEntityType && body.targetEntityId) {
      // Entity status update
      const result = await adminService.setEntityStatus(
        {
          entityType: body.targetEntityType,
          entityId: body.targetEntityId,
          entityName: body.entityName || body.targetEntityId,
          status: body.status,
          reason: body.reason,
        },
        actorUid
      );
      return NextResponse.json({ success: true, entityStatus: result });
    }

    // Platform system status update
    const newStatus = await adminService.setSystemStatus(body.status, actorUid, body.reason);
    return NextResponse.json({ success: true, status: newStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
