import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";
import { agentStore } from "@/lib/agent/agentStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || req.headers.get("x-user-uid");
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
    }
    const profile = await agentStore.getProfile(userId);
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "create_agency") {
      const agency = await agentService.createAgency(body);
      return NextResponse.json({ success: true, agency });
    }

    const profile = await agentService.registerAgent(body);
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
