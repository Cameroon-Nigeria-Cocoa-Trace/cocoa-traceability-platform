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
    const type = searchParams.get("type") || undefined;
    const status = searchParams.get("status") || undefined;

    const orgs = await adminService.listOrganizations(actorId, { type, status });
    return NextResponse.json({ success: true, count: orgs.length, organizations: orgs });
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
    const { orgId, status: newStatus, reason } = body;

    if (!orgId || !newStatus || !reason) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: orgId, status, and reason" },
        { status: 400 }
      );
    }

    const updated = await adminService.updateOrganizationStatus(
      actorId,
      orgId,
      newStatus,
      reason
    );
    return NextResponse.json({ success: true, organization: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
