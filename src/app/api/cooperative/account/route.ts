import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";
import { cooperativeStore } from "@/lib/cooperative/cooperativeStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || req.headers.get("x-user-uid");
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId parameter is required." }, { status: 400 });
    }
    const profile = await cooperativeStore.getProfile(userId);
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "create_organization") {
      const org = await cooperativeService.createOrganization(body);
      return NextResponse.json({ success: true, organization: org });
    }

    const profile = await cooperativeService.registerProfile(body);
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
