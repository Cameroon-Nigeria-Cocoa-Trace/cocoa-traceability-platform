/**
 * Cocoa Lots API Route
 * Endpoint: /api/cocoa-lots
 *
 * Provides a secure server-side boundary for the Frontend developer.
 * - POST /api/cocoa-lots: Creates a new Cocoa Lot for an authenticated user.
 * - GET /api/cocoa-lots: Lists Cocoa Lots filtered by farmId, productionRecordId, or harvestId.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createCocoaLot,
  listCocoaLotsByFarm,
  listCocoaLotsByProductionRecord,
  listCocoaLotsByHarvest,
} from "@/services/cocoaLotService";
import { getAuthenticatedUser, AuthenticatedUser } from "@/lib/authServer";

export async function POST(req: NextRequest) {
  // 1. Enforce Authentication Requirement
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(req);
  } catch (authError: unknown) {
    const authMessage = authError instanceof Error ? authError.message : "Authentication Required";
    return NextResponse.json(
      { success: false, error: authMessage },
      { status: 401 }
    );
  }

  // 2. Parse Payload
  try {
    const body = await req.json();

    // 3. Delegate to server-side Cocoa Lot service, strictly binding createdBy to authenticated UID
    const lot = await createCocoaLot({
      ...body,
      createdBy: user.userId,
    });

    return NextResponse.json({
      success: true,
      lot,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    // Handle allocation errors with 409 Conflict, validation errors with 400 Bad Request
    const status = message.includes("Harvest Allocation Error")
      ? 409
      : message.includes("Validation Error")
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const farmId = searchParams.get("farmId");
    const productionRecordId = searchParams.get("productionRecordId");
    const harvestId = searchParams.get("harvestId");

    if (harvestId) {
      const lots = await listCocoaLotsByHarvest(harvestId);
      return NextResponse.json({ success: true, lots });
    }

    if (productionRecordId) {
      const lots = await listCocoaLotsByProductionRecord(productionRecordId);
      return NextResponse.json({ success: true, lots });
    }

    if (farmId) {
      const lots = await listCocoaLotsByFarm(farmId);
      return NextResponse.json({ success: true, lots });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'farmId', 'productionRecordId', or 'harvestId' is required." },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
