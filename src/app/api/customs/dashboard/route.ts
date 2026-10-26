import { NextRequest, NextResponse } from "next/server";
import { customsService } from "@/lib/customs/customsService";

export async function GET(req: NextRequest) {
  try {
    const officerUid = req.headers.get("x-customs-uid") || "usr_customs_lead_01";
    const data = await customsService.getDashboardData(officerUid);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
