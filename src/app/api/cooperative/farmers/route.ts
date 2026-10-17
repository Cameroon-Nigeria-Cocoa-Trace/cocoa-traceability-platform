import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cooperativeId = searchParams.get("cooperativeId");
    const status = searchParams.get("status") || undefined;
    const history = searchParams.get("history");

    if (!cooperativeId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: cooperativeId" },
        { status: 400 }
      );
    }

    if (history) {
      const historyRecords = await cooperativeService.getAffiliationHistory(cooperativeId);
      return NextResponse.json({ success: true, history: historyRecords });
    }

    const affiliations = await cooperativeService.listAffiliatedFarmers(cooperativeId, status);
    return NextResponse.json({
      success: true,
      count: affiliations.length,
      affiliations,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "link";

    switch (action) {
      case "link": {
        const { cooperativeId, farmId, farmerId, farmerName, options } = body;
        if (!cooperativeId || !farmId || !farmerId || !farmerName) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required fields: cooperativeId, farmId, farmerId, farmerName",
            },
            { status: 400 }
          );
        }

        const affiliation = await cooperativeService.linkFarmerToCooperative(
          cooperativeId,
          farmId,
          farmerId,
          farmerName,
          options
        );
        return NextResponse.json({ success: true, affiliation }, { status: 201 });
      }

      case "verify": {
        const { affiliationId, officerId, notes } = body;
        if (!affiliationId || !officerId) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: affiliationId, officerId" },
            { status: 400 }
          );
        }

        const updated = await cooperativeService.verifyFarmerAffiliation(
          affiliationId,
          officerId,
          notes
        );
        return NextResponse.json({ success: true, affiliation: updated });
      }

      case "update_status": {
        const { affiliationId, newStatus, changedBy, reason } = body;
        if (!affiliationId || !newStatus || !changedBy) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required fields: affiliationId, newStatus, changedBy",
            },
            { status: 400 }
          );
        }

        const updated = await cooperativeService.updateAffiliationStatus(
          affiliationId,
          newStatus,
          changedBy,
          reason
        );
        return NextResponse.json({ success: true, affiliation: updated });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
