import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cooperativeId = searchParams.get("cooperativeId");

    if (!cooperativeId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: cooperativeId" },
        { status: 400 }
      );
    }

    const intakes = await cooperativeService.listIntakes(cooperativeId);
    return NextResponse.json({ success: true, count: intakes.length, intakes });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "record";

    switch (action) {
      case "record": {
        const {
          cooperativeId,
          officerId,
          farmerId,
          farmerName,
          farmId,
          farmName,
          quantityKg,
          qualityGrade,
          moistureContentPercent,
          eudrCompliant,
          farmAuditCertificateNumber,
          unitPricePerKg,
          currency,
          paymentReference,
        } = body;

        if (
          !cooperativeId ||
          !officerId ||
          !farmerId ||
          !farmerName ||
          !farmId ||
          !farmName ||
          !quantityKg ||
          !unitPricePerKg
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Missing required fields: cooperativeId, officerId, farmerId, farmerName, farmId, farmName, quantityKg, unitPricePerKg",
            },
            { status: 400 }
          );
        }

        const batch = await cooperativeService.recordIntakeBatch({
          cooperativeId,
          officerId,
          farmerId,
          farmerName,
          farmId,
          farmName,
          quantityKg: Number(quantityKg),
          qualityGrade,
          moistureContentPercent:
            moistureContentPercent !== undefined ? Number(moistureContentPercent) : undefined,
          eudrCompliant,
          farmAuditCertificateNumber,
          unitPricePerKg: Number(unitPricePerKg),
          currency,
          paymentReference,
        });

        return NextResponse.json({ success: true, intakeBatch: batch }, { status: 201 });
      }

      case "dispatch": {
        const { intakeId, target, dispatchReference } = body;
        if (!intakeId || !target || !dispatchReference) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required fields: intakeId, target ('agent' | 'warehouse'), dispatchReference",
            },
            { status: 400 }
          );
        }

        const updated = await cooperativeService.dispatchIntakeBatch(
          intakeId,
          target,
          dispatchReference
        );
        return NextResponse.json({ success: true, intakeBatch: updated });
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
