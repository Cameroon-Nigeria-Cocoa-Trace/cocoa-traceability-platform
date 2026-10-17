import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";
import { agentStore } from "@/lib/agent/agentStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const txnId = searchParams.get("txnId");
    const agentId = searchParams.get("agentId");

    if (txnId) {
      const txn = await agentStore.getTransaction(txnId);
      if (!txn) {
        return NextResponse.json(
          { success: false, error: "Transaction not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, transaction: txn });
    }

    if (agentId) {
      const transactions = await agentStore.getTransactionsByAgent(agentId);
      return NextResponse.json({ success: true, transactions });
    }

    return NextResponse.json(
      { success: false, error: "Missing required parameter: txnId or agentId" },
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

    const {
      agentId,
      farmId,
      farmerId,
      farmerName,
      cooperative,
      quantityKg,
      unitPrice,
      currency,
      paymentMethod,
      paymentReference,
      batchCode,
      inspectionId,
      warehouseDestinationId,
      warehouseDestinationName,
      feeRateOverride,
    } = body;

    if (!agentId || !farmId || !farmerId || !quantityKg || !unitPrice) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields (agentId, farmId, farmerId, quantityKg, unitPrice)",
        },
        { status: 400 }
      );
    }

    const transaction = await agentService.recordTransaction({
      agentId,
      farmId,
      farmerId,
      farmerName: farmerName || "Registered Farmer",
      cooperative,
      quantityKg: Number(quantityKg),
      unitPrice: Number(unitPrice),
      currency: currency || "FCFA",
      paymentMethod: paymentMethod || "bank_transfer",
      paymentReference,
      batchCode: batchCode || `BATCH-CR-${Date.now().toString().slice(-6)}`,
      inspectionId,
      warehouseDestinationId,
      warehouseDestinationName,
      feeRateOverride: feeRateOverride !== undefined ? Number(feeRateOverride) : undefined,
    });

    return NextResponse.json({ success: true, transaction }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
