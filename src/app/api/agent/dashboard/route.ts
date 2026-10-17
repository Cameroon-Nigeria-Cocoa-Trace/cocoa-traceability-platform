import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("agentId") || searchParams.get("userId") || "demo_agent_cr_001";

    const dashboard = await agentService.getDashboardData(id);
    return NextResponse.json({ success: true, ...dashboard });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
