import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";
import { agentStore } from "@/lib/agent/agentStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    if (!agentId) {
      return NextResponse.json({ success: false, error: "agentId is required." }, { status: 400 });
    }
    const linkages = await agentStore.listLinkages(agentId);
    const operations = await agentStore.listOperations(agentId);
    return NextResponse.json({ success: true, linkages, operations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-user-uid") || body.actorUserId;

    if (body.action === "establish_linkage") {
      const link = await agentService.establishLinkage(body, actorUid);
      return NextResponse.json({ success: true, linkage: link });
    }

    const op = await agentService.recordCocoaOperation(body, actorUid);
    return NextResponse.json({ success: true, operation: op });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
