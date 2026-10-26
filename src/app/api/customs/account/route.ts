import { NextRequest, NextResponse } from "next/server";
import { customsService } from "@/lib/customs/customsService";
import { customsStore } from "@/lib/customs/customsStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || req.headers.get("x-user-uid");
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
    }
    const profile = await customsStore.getProfile(userId);
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
      const agency = await customsService.createAgency(body);
      return NextResponse.json({ success: true, agency });
    }

    const profile = await customsService.registerOfficerProfile(body);
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
