import { NextRequest, NextResponse } from "next/server";
import { warehouseService } from "@/lib/warehouse/warehouseService";
import { WarehouseActorContext, WarehouseRegistrationInput } from "@/types/warehouse";

function getActorContext(req: NextRequest, targetWarehouseId?: string): WarehouseActorContext {
  const userId = req.headers.get("x-user-id") || "usr_wh_client";
  const warehouseId =
    req.headers.get("x-warehouse-id") ||
    req.nextUrl.searchParams.get("actorWarehouseId") ||
    targetWarehouseId ||
    "wh_ikom_central";
  const isSuperAdmin = req.headers.get("x-is-admin") === "true";

  return {
    userId,
    warehouseId,
    isSuperAdmin,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("id") || searchParams.get("warehouseId");

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: id or warehouseId" },
        { status: 400 }
      );
    }

    const context = getActorContext(req, warehouseId);
    const facility = await warehouseService.getFacility(context, warehouseId);
    if (!facility) {
      return NextResponse.json(
        { success: false, error: `Warehouse '${warehouseId}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, facility });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes("UNAUTHORIZED") ? 403 : 500;
    return NextResponse.json({ success: false, error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "register";

    switch (action) {
      case "register": {
        const input: WarehouseRegistrationInput = {
          id: body.id,
          name: body.name,
          registrationNumber: body.registrationNumber,
          ownerUserId: body.ownerUserId || "usr_wh_lead",
          facilityType: body.facilityType,
          contactEmail: body.contactEmail,
          contactPhone: body.contactPhone,
          location: body.location,
          maxCapacityKg: Number(body.maxCapacityKg),
          acceptedCertificates: body.acceptedCertificates,
          initialStockKg: body.initialStockKg ? Number(body.initialStockKg) : 0,
        };

        const facility = await warehouseService.registerWarehouse(input, input.ownerUserId);
        return NextResponse.json({ success: true, facility }, { status: 201 });
      }

      case "update_location": {
        const { warehouseId, location, operationalStatus, statusReason, operatingHours } = body;
        if (!warehouseId) {
          return NextResponse.json(
            { success: false, error: "Missing required field: warehouseId" },
            { status: 400 }
          );
        }

        const context = getActorContext(req, warehouseId);
        const facility = await warehouseService.updateLocationAndOperations(
          context,
          warehouseId,
          {
            location,
            operationalStatus,
            statusReason,
            operatingHours,
          }
        );
        return NextResponse.json({ success: true, facility });
      }

      case "update_capacity": {
        const { warehouseId, maxCapacityKg } = body;
        if (!warehouseId || !maxCapacityKg) {
          return NextResponse.json(
            { success: false, error: "Missing required fields: warehouseId, maxCapacityKg" },
            { status: 400 }
          );
        }

        const context = getActorContext(req, warehouseId);
        const facility = await warehouseService.updateCapacity(
          context,
          warehouseId,
          Number(maxCapacityKg)
        );
        return NextResponse.json({ success: true, facility });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unsupported action: ${action}. Allowed: register, update_location, update_capacity`,
          },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes("UNAUTHORIZED")
      ? 403
      : errorMsg.includes("SUSPENDED")
      ? 423
      : 400;
    return NextResponse.json({ success: false, error: errorMsg }, { status });
  }
}
