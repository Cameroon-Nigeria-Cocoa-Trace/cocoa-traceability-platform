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

    const controls = await adminService.getPlatformControls(actorId);
    return NextResponse.json({ success: true, platformControls: controls });
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
    const {
      operationalStatus,
      statusMessage,
      tradingEnabled,
      intakeSubmissionsEnabled,
      customsProcessingEnabled,
      eudrEnforcementStrict,
      corridorCrossBorderTransitOpen,
      allowedRegions,
      maintenanceNotice,
      reason,
    } = body;

    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          error: "Modifying platform controls requires an explicit audit reason",
        },
        { status: 400 }
      );
    }

    const updated = await adminService.updatePlatformControls(actorId, {
      operationalStatus,
      statusMessage,
      tradingEnabled,
      intakeSubmissionsEnabled,
      customsProcessingEnabled,
      eudrEnforcementStrict,
      corridorCrossBorderTransitOpen,
      allowedRegions,
      maintenanceNotice,
      reason,
    });

    return NextResponse.json({ success: true, platformControls: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
