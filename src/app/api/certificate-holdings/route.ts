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
import {
  getAffiliatedFarmerIds,
  getCooperativeActorInfo,
  isCooperativeAuthorizedForFarmer,
} from "@/lib/serverCooperativeAuth";

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
    const explicitHolderId = searchParams.get("holderId")?.trim();

    if (explicitHolderId) {
      if (userId) {
        const isAuthorized =
          explicitHolderId === userId ||
          (await isCooperativeAuthorizedForFarmer(userId, explicitHolderId));

        if (!isAuthorized) {
          const actorInfo = await getCooperativeActorInfo(userId);
          if (!actorInfo.isAdmin && !actorInfo.cooperativeOrgIds.includes(explicitHolderId)) {
            return NextResponse.json(
              { success: false, error: "Authorization Error: Not authorized to access holdings for this holder." },
              { status: 403 }
            );
          }
        }
      }

      let queryRef: FirebaseFirestore.Query = firebaseAdminDb.collection("certificateHoldings").where("holderId", "==", explicitHolderId);
      if (certificateId) {
        queryRef = queryRef.where("certificateId", "==", certificateId.trim());
      }
      const snapshot = await queryRef.get();
      const holdings = snapshot.docs.map((doc) => doc.data() as CertificateHolding);
      return NextResponse.json({ success: true, holdings });
    }

    if (certificateId) {
      const snap = await firebaseAdminDb
        .collection("certificateHoldings")
        .where("certificateId", "==", certificateId.trim())
        .get();
      const holdings = snap.docs.map((doc) => doc.data() as CertificateHolding);
      return NextResponse.json({ success: true, holdings });
    }

    if (userId) {
      const actorInfo = await getCooperativeActorInfo(userId);
      const targetHolders = new Set<string>([userId]);

      if (actorInfo.isCooperative || actorInfo.cooperativeOrgIds.length > 0) {
        actorInfo.cooperativeOrgIds.forEach((id) => targetHolders.add(id));
        const memberFarmerIds = await getAffiliatedFarmerIds(userId);
        memberFarmerIds.forEach((id) => targetHolders.add(id));
      }

      const holdingMap = new Map<string, CertificateHolding>();
      const holderList = Array.from(targetHolders);

      for (let i = 0; i < holderList.length; i += 10) {
        const chunk = holderList.slice(i, i + 10);
        if (chunk.length === 0) continue;
        const snap = await firebaseAdminDb
          .collection("certificateHoldings")
          .where("holderId", "in", chunk)
          .get();
        snap.forEach((doc) => {
          holdingMap.set(doc.id, doc.data() as CertificateHolding);
        });
      }

      return NextResponse.json({
        success: true,
        holdings: Array.from(holdingMap.values()),
      });
    }

    return NextResponse.json(
      { success: false, error: "Authentication or holderId query parameter required." },
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
