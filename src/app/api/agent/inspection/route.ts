import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";
import { agentStore } from "@/lib/agent/agentStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: agentId" },
        { status: 400 }
      );
    }

    const inspections = await agentStore.getInspectionsByAgent(agentId);
    return NextResponse.json({ success: true, inspections });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      agentId,
      farmId,
      farmerId,
      farmerName,
      cooperative,
      inspectionDate,
      moistureContentPercent,
      beanCountPer100g,
      fermentationRatePercent,
      defectiveBeansPercent,
      geolocation,
      notes,
      issueCertificate,
    } = body;

    if (!agentId || !farmId || !farmerId || !farmerName) {
      return NextResponse.json(
        { success: false, error: "Missing required inspection identifiers (agentId, farmId, farmerId, farmerName)" },
        { status: 400 }
      );
    }

    const result = await agentService.recordInspection({
      agentId,
      farmId,
      farmerId,
      farmerName,
      cooperative,
      inspectionDate,
      moistureContentPercent: Number(moistureContentPercent) || 7.5,
      beanCountPer100g: Number(beanCountPer100g) || 100,
      fermentationRatePercent: Number(fermentationRatePercent) || 82,
      defectiveBeansPercent: Number(defectiveBeansPercent) || 2.0,
      geolocation,
      notes,
      issueCertificate: issueCertificate !== false,
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
