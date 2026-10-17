import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";
import { CooperativeRegistrationInput } from "@/types/cooperative";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || searchParams.get("userId") || searchParams.get("profileId");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: id, userId, or profileId" },
        { status: 400 }
      );
    }

    const profile = await cooperativeService.getProfile(id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Cooperative profile not found" },
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
      const { profileId, updates } = body;
      if (!profileId) {
        return NextResponse.json(
          { success: false, error: "Missing profileId for update" },
          { status: 400 }
        );
      }
      const updated = await cooperativeService.updateProfile(profileId, updates);
      return NextResponse.json({ success: true, profile: updated });
    }

    // Default action: Register Cooperative Account
    const input: CooperativeRegistrationInput = {
      userId: body.userId,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      accountType: body.accountType || "personal",
      officerRole: body.officerRole,
      cooperativeId: body.cooperativeId,
      cooperativeName: body.cooperativeName,
      nationalIdOrNin: body.nationalIdOrNin,
      operatingRegion: body.operatingRegion,
      operatingLgas: body.operatingLgas,
      metadata: body.metadata,
    };

    const profile = await cooperativeService.registerCooperativeAccount(input);
    return NextResponse.json({ success: true, profile }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
