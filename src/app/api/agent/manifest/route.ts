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

    const manifests = await agentStore.getManifestsByAgent(agentId);
    return NextResponse.json({ success: true, manifests });
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
      transactionIds,
      warehouseId,
      warehouseName,
      warehouseLocation,
      traceCertificateNumber,
    } = body;

    if (!agentId || !transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: agentId, transactionIds array" },
        { status: 400 }
      );
    }

    const result = await agentService.createBatchManifest({
      agentId,
      transactionIds,
      warehouseId: warehouseId || "wh_ikom_central",
      warehouseName: warehouseName || "Ikom Central Aggregation Warehouse",
      warehouseLocation: warehouseLocation || "Ikom Commercial District, Cross River State",
      traceCertificateNumber,
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { manifestId, agentId, status, notes, warehouseOfficer } = body;

    if (!manifestId || !agentId || !status) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: manifestId, agentId, status" },
        { status: 400 }
      );
    }

    const updated = await agentService.updateManifestStatus(
      manifestId,
      agentId,
      status,
      notes,
      warehouseOfficer
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Manifest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, manifest: updated });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
