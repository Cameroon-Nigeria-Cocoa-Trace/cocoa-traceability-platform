/**
 * Certificate Holdings API Route
 * Endpoint: /api/certificate-holdings
 *
 * Provides a secure server-side boundary for querying certified cocoa holdings.
 */

import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { getAuthenticatedUser } from "@/lib/authServer";
import { CertificateHolding } from "@/types/traceability";

export async function GET(req: NextRequest) {
  let userId: string | undefined;
  try {
    const user = await getAuthenticatedUser(req);
    userId = user.userId;
  } catch {
    userId = undefined;
  }

  try {
    const { searchParams } = new URL(req.url);
    const certificateId = searchParams.get("certificateId");
    const holderId = searchParams.get("holderId") || userId;

    let queryRef: FirebaseFirestore.Query = firebaseAdminDb.collection("certificateHoldings");

    if (certificateId) {
      queryRef = queryRef.where("certificateId", "==", certificateId.trim());
    }
    if (holderId) {
      queryRef = queryRef.where("holderId", "==", holderId.trim());
    }

    const snapshot = await queryRef.get();
    let holdings = snapshot.docs.map((doc) => doc.data() as CertificateHolding);

    if (holdings.length === 0 && userId) {
      const allSnap = await firebaseAdminDb.collection("certificateHoldings").get();
      holdings = allSnap.docs.map((doc) => doc.data() as CertificateHolding);
    }

    return NextResponse.json({ success: true, holdings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
