import { NextRequest, NextResponse } from "next/server";
import { customsService } from "@/lib/customs/customsService";
import { customsStore } from "@/lib/customs/customsStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get("requestId");

    if (requestId) {
      const request = await customsStore.getRequest(requestId);
      if (!request) {
        return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
      }
      const history = await customsStore.getProcessingHistory(request.id);
      return NextResponse.json({ success: true, request, history });
    }

    const status = searchParams.get("status") || undefined;
    const submitterId = searchParams.get("submitterId") || undefined;
    const submitterType = searchParams.get("submitterType") || undefined;

    const list = await customsStore.listRequests({ status, submitterId, submitterType });
    return NextResponse.json({ success: true, requests: list });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUid = req.headers.get("x-user-uid") || body.submitterUserId || body.submitterId;

    const request = await customsService.submitExportCustomsRequest(body, actorUid);
    return NextResponse.json({ success: true, request });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
