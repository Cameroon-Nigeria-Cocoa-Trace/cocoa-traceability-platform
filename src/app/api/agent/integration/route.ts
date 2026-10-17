import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "warehouses";

    if (type === "warehouses") {
      const warehouses = agentService.getApprovedWarehouses();
      return NextResponse.json({ success: true, warehouses });
    }

    if (type === "farm") {
      const farmId = searchParams.get("farmId");
      if (!farmId) {
        return NextResponse.json(
          { success: false, error: "Missing required parameter: farmId" },
          { status: 400 }
        );
      }
      const farm = await agentService.getFarmerFarm(farmId);
      return NextResponse.json({ success: true, farm });
    }

    return NextResponse.json(
      { success: false, error: `Unknown integration type: ${type}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
