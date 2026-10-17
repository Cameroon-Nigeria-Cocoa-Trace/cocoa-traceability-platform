import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: orgId" },
        { status: 400 }
      );
    }

    const organization = await agentService.getOrganization(orgId);
    if (!organization) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
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

    if (body.action === "add_member") {
      const { orgId, inviterAgentId, member } = body;
      if (!orgId || !inviterAgentId || !member) {
        return NextResponse.json(
          { success: false, error: "Missing required fields: orgId, inviterAgentId, member" },
          { status: 400 }
        );
      }
      const updatedOrg = await agentService.addMemberToOrganization(
        orgId,
        inviterAgentId,
        member
      );
      return NextResponse.json({ success: true, organization: updatedOrg });
    }

    // Default action: create organization
    const { ownerAgentId, name, registrationNumber, headquarters, contactEmail, contactPhone, operatingRegions, serviceFeePercentage } = body;

    if (!ownerAgentId || !name || !registrationNumber) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: ownerAgentId, name, registrationNumber" },
        { status: 400 }
      );
    }

    const organization = await agentService.createOrganization(ownerAgentId, {
      name,
      registrationNumber,
      headquarters: headquarters || "Cross River State Aggregation Hub",
      contactEmail: contactEmail || "agency@cocoatrace.cm",
      contactPhone: contactPhone || "+234 800 000 0000",
      operatingRegions,
      serviceFeePercentage,
    });

    return NextResponse.json({ success: true, organization }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, requesterAgentId, memberId } = body;

    if (!orgId || !requesterAgentId || !memberId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: orgId, requesterAgentId, memberId" },
        { status: 400 }
      );
    }

    const updatedOrg = await agentService.removeMemberFromOrganization(
      orgId,
      requesterAgentId,
      memberId
    );

    return NextResponse.json({ success: true, organization: updatedOrg });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
