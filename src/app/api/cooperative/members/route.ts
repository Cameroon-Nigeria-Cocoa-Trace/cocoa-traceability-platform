import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";
import { cooperativeStore } from "@/lib/cooperative/cooperativeStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("cooperativeOrgId");
    if (!orgId) {
      return NextResponse.json({ success: false, error: "cooperativeOrgId is required." }, { status: 400 });
    }
    const members = await cooperativeStore.listMemberships(orgId);
    return NextResponse.json({ success: true, members });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-user-uid") || body.actorUserId;

    if (body.action === "update_status") {
      const member = await cooperativeService.updateMemberStatus(
        {
          cooperativeOrgId: body.cooperativeOrgId,
          farmerId: body.farmerId,
          status: body.status,
          reason: body.reason,
        },
        actorUid
      );
      return NextResponse.json({ success: true, member });
    }

    if (body.action === "link_subordinate") {
      const sub = await cooperativeService.linkSubordinateCooperative(body, actorUid);
      return NextResponse.json({ success: true, subordinate: sub });
    }

    if (body.action === "unlink_subordinate") {
      const sub = await cooperativeService.unlinkSubordinateCooperative(body, actorUid);
      return NextResponse.json({ success: true, subordinate: sub });
    }

    const member = await cooperativeService.addFarmerMember(body, actorUid);
    return NextResponse.json({ success: true, member });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
