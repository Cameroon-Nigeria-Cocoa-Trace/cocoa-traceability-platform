import { NextRequest, NextResponse } from "next/server";
import { agentService } from "@/lib/agent/agentService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const certificateNumber = searchParams.get("certificateNumber") || searchParams.get("id");
    const agentId = searchParams.get("agentId");

    if (certificateNumber) {
      const cert = await agentService.verifyCertificate(certificateNumber);
      if (!cert) {
        return NextResponse.json(
          { success: false, valid: false, error: "Certificate not found or invalid" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, valid: true, certificate: cert });
    }

    if (agentId) {
      const certificates = await agentService.getCertificatesByAgent(agentId);
      return NextResponse.json({ success: true, certificates });
    }

    return NextResponse.json(
      { success: false, error: "Missing required parameter: certificateNumber or agentId" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
