import { NextRequest, NextResponse } from "next/server";
import { cooperativeService } from "@/lib/cooperative/cooperativeService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const verifyQuery = searchParams.get("verify") || searchParams.get("number") || searchParams.get("id");
    const cooperativeId = searchParams.get("cooperativeId");

    if (verifyQuery) {
      const result = await cooperativeService.verifyCertificate(verifyQuery);
      return NextResponse.json({
        success: result.valid,
        valid: result.valid,
        message: result.message,
        certificate: result.certificate,
      });
    }

    if (cooperativeId) {
      const certificates = await cooperativeService.listCertificates(cooperativeId);
      return NextResponse.json({ success: true, count: certificates.length, certificates });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Missing required parameter: provide either 'verify' (cert number) or 'cooperativeId'",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "endorse_farm_eudr": {
        const {
          cooperativeId,
          officerId,
          farmId,
          farmerId,
          farmerName,
          farmAuditCertificateNumber,
          originCorridor,
          notes,
        } = body;

        if (!cooperativeId || !officerId || !farmId || !farmerId || !farmerName) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required fields: cooperativeId, officerId, farmId, farmerId, farmerName",
            },
            { status: 400 }
          );
        }

        const cert = await cooperativeService.endorseFarmEudrCertificate({
          cooperativeId,
          officerId,
          farmId,
          farmerId,
          farmerName,
          farmAuditCertificateNumber,
          originCorridor,
          notes,
        });

        return NextResponse.json({ success: true, certificate: cert }, { status: 201 });
      }

      case "issue_origin_declaration": {
        const {
          cooperativeId,
          officerId,
          batchCode,
          quantityKg,
          farmId,
          farmerId,
          farmerName,
          originCorridor,
        } = body;

        if (
          !cooperativeId ||
          !officerId ||
          !batchCode ||
          !quantityKg ||
          !farmId ||
          !farmerId ||
          !farmerName
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Missing required fields: cooperativeId, officerId, batchCode, quantityKg, farmId, farmerId, farmerName",
            },
            { status: 400 }
          );
        }

        const cert = await cooperativeService.issueCooperativeOriginDeclaration({
          cooperativeId,
          officerId,
          batchCode,
          quantityKg: Number(quantityKg),
          farmId,
          farmerId,
          farmerName,
          originCorridor,
        });

        return NextResponse.json({ success: true, certificate: cert }, { status: 201 });
      }

      case "request_cross_river_full_trace": {
        const {
          cooperativeId,
          officerId,
          batchCode,
          totalLotsCount,
          quantityKg,
          originCorridor,
          destinationWarehouseOrAgent,
        } = body;

        if (
          !cooperativeId ||
          !officerId ||
          !batchCode ||
          !totalLotsCount ||
          !quantityKg ||
          !originCorridor ||
          !destinationWarehouseOrAgent
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Missing required fields: cooperativeId, officerId, batchCode, totalLotsCount, quantityKg, originCorridor, destinationWarehouseOrAgent",
            },
            { status: 400 }
          );
        }

        const cert = await cooperativeService.requestCrossRiverFullTraceCertificate({
          cooperativeId,
          officerId,
          batchCode,
          totalLotsCount: Number(totalLotsCount),
          quantityKg: Number(quantityKg),
          originCorridor,
          destinationWarehouseOrAgent,
        });

        return NextResponse.json({ success: true, certificate: cert }, { status: 201 });
      }

      case "revoke": {
        const { certificateNumber, reason, revokedBy } = body;
        if (!certificateNumber || !reason || !revokedBy) {
          return NextResponse.json(
            {
              success: false,
              error: "Missing required fields: certificateNumber, reason, revokedBy",
            },
            { status: 400 }
          );
        }

        const cert = await cooperativeService.revokeCertificate(
          certificateNumber,
          reason,
          revokedBy
        );
        return NextResponse.json({ success: true, certificate: cert });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "Unsupported action. Allowed: endorse_farm_eudr, issue_origin_declaration, request_cross_river_full_trace, revoke",
          },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
