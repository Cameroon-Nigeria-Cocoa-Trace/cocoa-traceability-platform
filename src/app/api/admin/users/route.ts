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
    const targetUid = searchParams.get("uid");
    const role = searchParams.get("role") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    if (targetUid) {
      const user = await adminService.getUser(actorId, targetUid);
      return NextResponse.json({ success: true, user });
    }

    const users = await adminService.listUsers(actorId, { role, status, search });
    return NextResponse.json({ success: true, count: users.length, users });
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
    const { action, targetUid, reason, newRole } = body;

    if (!targetUid) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: targetUid" },
        { status: 400 }
      );
    }

    if (action === "suspend") {
      if (!reason) {
        return NextResponse.json(
          { success: false, error: "Suspension requires a reason" },
          { status: 400 }
        );
      }
      const user = await adminService.suspendUser(actorId, targetUid, reason);
      return NextResponse.json({ success: true, user });
    }

    if (action === "activate") {
      const user = await adminService.activateUser(actorId, targetUid, reason);
      return NextResponse.json({ success: true, user });
    }

    if (action === "update_role") {
      if (!newRole) {
        return NextResponse.json(
          { success: false, error: "Role change requires newRole parameter" },
          { status: 400 }
        );
      }
      const user = await adminService.updateUserRole(actorId, targetUid, newRole, reason);
      return NextResponse.json({ success: true, user });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
