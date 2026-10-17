import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("id") || searchParams.get("orgId");
    const historyForOrg = searchParams.get("history");
    const subordinatesForOrg = searchParams.get("subordinates");

    if (historyForOrg) {
      const history = await cooperativeService.getMembershipHistory(historyForOrg);
      return NextResponse.json({ success: true, history });
    }

    if (subordinatesForOrg) {
      const subordinates = await cooperativeService.listSubordinateCooperatives(subordinatesForOrg);
      return NextResponse.json({ success: true, subordinates });
    }

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: id or orgId" },
        { status: 400 }
      );
    }

    const organization = await cooperativeService.getOrganization(orgId);
    if (!organization) {
      return NextResponse.json(
        { success: false, error: "Cooperative organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, organization });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "create";

    switch (action) {
      case "create": {
        const { ownerUserId, ...data } = body;
        if (!ownerUserId) {
          return NextResponse.json(
            { success: false, error: "Missing required field: ownerUserId" },
            { status: 400 }
          );
        }
        const org = await cooperativeService.createOrganization(ownerUserId, data);
        return NextResponse.json({ success: true, organization: org }, { status: 201 });
      }

      case "update": {
        const { orgId, updates } = body;
        if (!orgId) {
          return NextResponse.json(
            { success: false, error: "Missing required field: orgId" },
            { status: 400 }
          );
        }
        const updated = await cooperativeService.updateOrganization(orgId, updates);
        return NextResponse.json({ success: true, organization: updated });
      }

      case "add_member": {
        const { orgId, memberData, addedBy } = body;
        if (!orgId || !memberData || !memberData.userId) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: orgId, memberData.userId" },
            { status: 400 }
          );
        }
        const org = await cooperativeService.addMember(orgId, memberData, addedBy || "system");
        return NextResponse.json({ success: true, organization: org });
      }

      case "update_member_role": {
        const { orgId, memberId, newRole, changedBy, reason } = body;
        if (!orgId || !memberId || !newRole) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: orgId, memberId, newRole" },
            { status: 400 }
          );
        }
        const org = await cooperativeService.updateMemberRole(
          orgId,
          memberId,
          newRole,
          changedBy || "system",
          reason
        );
        return NextResponse.json({ success: true, organization: org });
      }

      case "update_member_status": {
        const { orgId, memberId, newStatus, changedBy, reason } = body;
        if (!orgId || !memberId || !newStatus) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: orgId, memberId, newStatus" },
            { status: 400 }
          );
        }
        const org = await cooperativeService.updateMemberStatus(
          orgId,
          memberId,
          newStatus,
          changedBy || "system",
          reason
        );
        return NextResponse.json({ success: true, organization: org });
      }

      case "remove_member": {
        const { orgId, memberId, changedBy, reason } = body;
        if (!orgId || !memberId) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: orgId, memberId" },
            { status: 400 }
          );
        }
        const org = await cooperativeService.removeMember(
          orgId,
          memberId,
          changedBy || "system",
          reason
        );
        return NextResponse.json({ success: true, organization: org });
      }

      case "link_subordinate": {
        const { apexCooperativeId, subordinateCooperativeId, notes } = body;
        if (!apexCooperativeId || !subordinateCooperativeId) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required fields: apexCooperativeId, subordinateCooperativeId",
            },
            { status: 400 }
          );
        }
        const relationship = await cooperativeService.linkSubordinateCooperative(
          apexCooperativeId,
          subordinateCooperativeId,
          notes
        );
        return NextResponse.json({ success: true, relationship }, { status: 201 });
      }

      case "delink_subordinate": {
        const { relationshipId, reason } = body;
        if (!relationshipId || !reason) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: relationshipId, reason" },
            { status: 400 }
          );
        }
        const relationship = await cooperativeService.delinkSubordinateCooperative(
          relationshipId,
          reason
        );
        return NextResponse.json({ success: true, relationship });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
