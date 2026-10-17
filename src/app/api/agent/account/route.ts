import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";
import { AgentRegistrationInput } from "@/types/agent";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || searchParams.get("userId") || searchParams.get("agentId");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: id, userId, or agentId" },
        { status: 400 }
      );
    }

    const profile = await agentService.getProfile(id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Agent profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "update") {
      const { agentId, updates } = body;
      if (!agentId) {
        return NextResponse.json(
          { success: false, error: "Missing agentId for update" },
          { status: 400 }
        );
      }
      const updated = await agentService.updateProfile(agentId, updates);
      return NextResponse.json({ success: true, profile: updated });
    }

    // Default action: register agent
    const input: AgentRegistrationInput = {
      userId: body.userId,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      accountType: body.accountType || "personal",
      accreditationNumber: body.accreditationNumber,
      nationalIdOrNin: body.nationalIdOrNin,
      operatingRegion: body.operatingRegion,
      operatingLgas: body.operatingLgas,
      assignedCooperativeId: body.assignedCooperativeId,
      assignedCooperativeName: body.assignedCooperativeName,
      organizationId: body.organizationId,
      organizationRole: body.organizationRole,
      serviceFeePercentage: body.serviceFeePercentage,
    };

    const profile = await agentService.registerAgent(input);
    return NextResponse.json({ success: true, profile }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
