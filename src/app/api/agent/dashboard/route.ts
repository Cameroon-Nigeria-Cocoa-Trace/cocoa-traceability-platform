import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const actorUid = req.headers.get("x-user-uid") || searchParams.get("userId") || agentId;

    if (!agentId || !actorUid) {
      return NextResponse.json(
        { success: false, error: "agentId and actor userId are required." },
        { status: 400 }
      );
    }

    const data = await agentService.getDashboardData(agentId, actorUid);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
