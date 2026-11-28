/**
 * Certificate Holdings API Route
 * Endpoint: /api/certificate-holdings
 *
 * Provides a secure server-side boundary for querying certified cocoa holdings,
 * including automatic reconciliation from issued Trace Certificates and completed trades.
 */

import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { getAuthenticatedUser } from "@/lib/authServer";
import { CertificateHolding, CertificateHolderType } from "@/types/traceability";
import {
  getAffiliatedFarmerIds,
  getCooperativeActorInfo,
  isCooperativeAuthorizedForFarmer,
} from "@/lib/serverCooperativeAuth";

const VALID_HOLDER_TYPES = new Set<CertificateHolderType>([
  "farmer",
  "cooperative",
  "agent",
  "warehouse",
]);

function normalizeHolderType(raw: unknown): CertificateHolderType {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (VALID_HOLDER_TYPES.has(s as CertificateHolderType)) {
    return s as CertificateHolderType;
  }
  return "farmer";
}

function normalizeHolding(docId: string, raw: Record<string, unknown>): CertificateHolding {
  const quantityKg = Number(raw.quantityKg ?? 0) || 0;
  const availableQuantityKg =
    raw.availableQuantityKg !== undefined && raw.availableQuantityKg !== null
      ? Number(raw.availableQuantityKg) || 0
      : quantityKg;

  return {
    ...(raw as unknown as CertificateHolding),
    holdingId:
      typeof raw.holdingId === "string" && raw.holdingId.trim()
        ? raw.holdingId.trim()
        : docId,
    certificateId:
      typeof raw.certificateId === "string" ? raw.certificateId.trim() : "",
    certificateNumber:
      typeof raw.certificateNumber === "string" && raw.certificateNumber.trim()
        ? raw.certificateNumber.trim()
        : typeof raw.certificateId === "string" && raw.certificateId.trim()
        ? raw.certificateId.trim()
        : docId,
    lotId: typeof raw.lotId === "string" ? raw.lotId.trim() : "",
    farmId: typeof raw.farmId === "string" ? raw.farmId.trim() : "",
    holderId: typeof raw.holderId === "string" ? raw.holderId.trim() : "",
    holderType: normalizeHolderType(raw.holderType),
    quantityKg,
    availableQuantityKg,
    status: (typeof raw.status === "string" && raw.status.trim()
      ? raw.status.trim()
      : availableQuantityKg > 0
      ? "active"
      : "depleted") as CertificateHolding["status"],
  };
}

/**
 * Resolves all holder IDs an authenticated actor is authorized to represent:
 * - their own UID
 * - cooperative org IDs + affiliated member farmer IDs
 * - user profile org/agent/warehouse IDs
 * - agent/warehouse organizations created by this actor
 */
async function resolveAuthorizedHolderIds(userId: string): Promise<string[]> {
  const targetHolders = new Set<string>([userId]);

  try {
    const actorInfo = await getCooperativeActorInfo(userId);
    actorInfo.cooperativeOrgIds.forEach((id) => {
      if (id && id.trim()) targetHolders.add(id.trim());
    });

    if (actorInfo.isCooperative || actorInfo.cooperativeOrgIds.length > 0) {
      const memberFarmerIds = await getAffiliatedFarmerIds(userId);
      memberFarmerIds.forEach((id) => {
        if (id && id.trim()) targetHolders.add(id.trim());
      });
    }
  } catch {
    // Non-blocking fallback
  }

  try {
    const userDoc = await firebaseAdminDb.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const uData = userDoc.data() || {};
      for (const field of [
        "organizationId",
        "cooperativeOrgId",
        "cooperativeId",
        "agentId",
        "warehouseId",
      ]) {
        const val = uData[field];
        if (typeof val === "string" && val.trim()) {
          targetHolders.add(val.trim());
        }
      }
    }

    const orgCollections = [
      "agents",
      "agent_organizations",
      "warehouses",
      "warehouse_facilities",
      "warehouse_organizations",
    ];

    const orgSnaps = await Promise.all(
      orgCollections.map((col) =>
        firebaseAdminDb
          .collection(col)
          .where("createdBy", "==", userId)
          .get()
          .catch(() => null)
      )
    );

    for (const snap of orgSnaps) {
      if (!snap) continue;
      snap.forEach((doc) => targetHolders.add(doc.id));
    }
  } catch {
    // Non-blocking fallback
  }

  return Array.from(targetHolders);
}

/**
 * Reconciles completed trades that did not create a destination holding yet.
 */
async function syncCompletedTradesToHoldings() {
  try {
    const tradesSnap = await firebaseAdminDb
      .collection("trades")
      .where("tradeStatus", "==", "completed")
      .get();

    const batch = firebaseAdminDb.batch();
    let batchCount = 0;

    for (const docSnap of tradesSnap.docs) {
      const trade = docSnap.data();
      if (!trade.buyerId || !trade.tradeId) continue;
      if (trade.destHoldingId) continue;
      const holdingId = `hold_trade_${trade.tradeId}`;
      const holdingRef = firebaseAdminDb.collection("certificateHoldings").doc(holdingId);
      const hSnap = await holdingRef.get();

      if (!hSnap.exists) {
        const isUncertified = trade.certificationType === "uncertified";
        const now = new Date().toISOString();
        const holdingData = {
          holdingId,
          certificateId: isUncertified
            ? "uncertified"
            : trade.certificateId || `cert_${trade.tradeId}`,
          certificateNumber: isUncertified
            ? "UNCERTIFIED COCOA"
            : trade.certificateId
            ? `CERT-${String(trade.certificateId).slice(-6).toUpperCase()}`
            : `CERT-${String(trade.tradeId).slice(-6).toUpperCase()}`,
          lotId: trade.lotId || "",
          farmId: trade.sellerHolderId || trade.lotId || "",
          holderId: trade.buyerId,
          holderType: normalizeHolderType(trade.buyerHolderType),
          quantityKg: Number(trade.quantityKg) || 0,
          availableQuantityKg: Number(trade.quantityKg) || 0,
          sourceTransferId: trade.tradeId,
          status: "active",
          certificationType: isUncertified ? "uncertified" : "certified",
          isUncertified,
          createdAt: trade.createdAt || now,
          updatedAt: now,
        };
        batch.set(holdingRef, holdingData);
        batchCount++;
        if (batchCount >= 400) {
          await batch.commit();
          batchCount = 0;
        }
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
  } catch {
    // Non-blocking background sync
  }
}

/**
 * Ensures every active issued Trace Certificate owned by any of the given holder IDs
 * has at least one backing document in `certificateHoldings`.
 * This self-heals legacy or out-of-band certificates that were issued without
 * creating their initial holding custody unit.
 */
async function syncCertificatesToHoldingsForHolders(holderIds: string[]) {
  if (holderIds.length === 0) return;

  try {
    const holderSet = new Set(holderIds);
    const certMap = new Map<string, Record<string, unknown>>();

    // 1. Direct certificate lookups by holderId and currentHolderId
    for (let i = 0; i < holderIds.length; i += 10) {
      const chunk = holderIds.slice(i, i + 10);
      if (chunk.length === 0) continue;

      const [byHolder, byCurrentHolder, appsByApplicant] = await Promise.all([
        firebaseAdminDb
          .collection("certificates")
          .where("holderId", "in", chunk)
          .get()
          .catch(() => null),
        firebaseAdminDb
          .collection("certificates")
          .where("currentHolderId", "in", chunk)
          .get()
          .catch(() => null),
        firebaseAdminDb
          .collection("certificateApplications")
          .where("applicantId", "in", chunk)
          .get()
          .catch(() => null),
      ]);

      byHolder?.forEach((d) => certMap.set(d.id, d.data()));
      byCurrentHolder?.forEach((d) => certMap.set(d.id, d.data()));

      // 2. Certificates linked to the actor's approved applications
      const approvedAppIds: string[] = [];
      appsByApplicant?.forEach((d) => {
        const app = d.data();
        if (app.status === "approved") {
          const appId = typeof app.applicationId === "string" && app.applicationId.trim()
            ? app.applicationId.trim()
            : d.id;
          approvedAppIds.push(appId);
        }
      });

      for (let j = 0; j < approvedAppIds.length; j += 10) {
        const appChunk = approvedAppIds.slice(j, j + 10);
        if (appChunk.length === 0) continue;
        const certsByApp = await firebaseAdminDb
          .collection("certificates")
          .where("applicationId", "in", appChunk)
          .get()
          .catch(() => null);
        certsByApp?.forEach((d) => certMap.set(d.id, d.data()));
      }
    }

    // 3. Also check certificates for the actor's certified cocoaLots
    const certifiedLotIds = new Set<string>();
    for (let i = 0; i < holderIds.length; i += 10) {
      const chunk = holderIds.slice(i, i + 10);
      if (chunk.length === 0) continue;

      const [lotsByCreator, lotsByFarmer] = await Promise.all([
        firebaseAdminDb
          .collection("cocoaLots")
          .where("createdBy", "in", chunk)
          .get()
          .catch(() => null),
        firebaseAdminDb
          .collection("cocoaLots")
          .where("farmerId", "in", chunk)
          .get()
          .catch(() => null),
      ]);

      for (const snap of [lotsByCreator, lotsByFarmer]) {
        snap?.forEach((d) => {
          const lot = d.data();
          const certQty = Number(lot.certifiedQuantityKg || 0);
          const status = String(lot.lotStatus || "").toLowerCase();
          if (certQty > 0 || status === "certified" || status === "partially_certified") {
            certifiedLotIds.add(typeof lot.lotId === "string" && lot.lotId ? lot.lotId : d.id);
          }
        });
      }
    }

    const lotIdList = Array.from(certifiedLotIds);
    for (let i = 0; i < lotIdList.length; i += 10) {
      const lotChunk = lotIdList.slice(i, i + 10);
      if (lotChunk.length === 0) continue;
      const certsByLot = await firebaseAdminDb
        .collection("certificates")
        .where("lotId", "in", lotChunk)
        .get()
        .catch(() => null);
      certsByLot?.forEach((d) => {
        const data = d.data();
        const effectiveHolder = String(data.currentHolderId || data.holderId || "").trim();
        // Only pull in certificates whose current holder is one of this actor's authorized IDs
        if (!effectiveHolder || holderSet.has(effectiveHolder)) {
          certMap.set(d.id, data);
        }
      });
    }

    if (certMap.size === 0) return;

    const now = new Date().toISOString();

    for (const [docId, cert] of certMap.entries()) {
      const certId =
        typeof cert.certificateId === "string" && cert.certificateId.trim()
          ? cert.certificateId.trim()
          : docId;

      const certStatus = String(cert.status || "active").toLowerCase();
      if (certStatus === "revoked" || certStatus === "expired" || certStatus === "cancelled") {
        continue;
      }

      const certifiedQty = Number(cert.certifiedQuantityKg ?? cert.quantityKg ?? 0);
      if (!Number.isFinite(certifiedQty) || certifiedQty <= 0) {
        continue;
      }

      const effectiveHolderId = String(cert.currentHolderId || cert.holderId || "").trim();
      if (!effectiveHolderId || !holderSet.has(effectiveHolderId)) {
        continue;
      }

      // Check if ANY holding already exists for this certificate
      const existingHoldingsSnap = await firebaseAdminDb
        .collection("certificateHoldings")
        .where("certificateId", "==", certId)
        .limit(1)
        .get();

      if (!existingHoldingsSnap.empty) {
        continue;
      }

      const holdingId = `holding_init_${certId}`;
      const holdingRef = firebaseAdminDb.collection("certificateHoldings").doc(holdingId);
      const holdingDoc: CertificateHolding = {
        holdingId,
        certificateId: certId,
        certificateNumber:
          typeof cert.certificateNumber === "string" && cert.certificateNumber.trim()
            ? cert.certificateNumber.trim()
            : `CERT-${certId.slice(-6).toUpperCase()}`,
        lotId: typeof cert.lotId === "string" ? cert.lotId.trim() : "",
        farmId: typeof cert.farmId === "string" ? cert.farmId.trim() : "",
        holderId: effectiveHolderId,
        holderType: normalizeHolderType(cert.holderType),
        quantityKg: certifiedQty,
        availableQuantityKg: certifiedQty,
        status: "active",
        certificationType: "certified",
        isUncertified: false,
        createdBy:
          typeof cert.createdBy === "string" && cert.createdBy.trim()
            ? cert.createdBy.trim()
            : effectiveHolderId,
        createdAt:
          typeof cert.issueDate === "string" && cert.issueDate
            ? cert.issueDate
            : typeof cert.createdAt === "string" && cert.createdAt
            ? cert.createdAt
            : now,
        updatedAt: now,
      };

      await holdingRef.set(holdingDoc, { merge: true });
    }
  } catch (err) {
    console.warn("syncCertificatesToHoldingsForHolders notice:", err);
  }
}

export async function GET(req: NextRequest) {
  let userId: string | undefined;
  try {
    const user = await getAuthenticatedUser(req);
    userId = user.userId;
  } catch {
    userId = undefined;
  }

  try {
    await syncCompletedTradesToHoldings();

    const { searchParams } = new URL(req.url);
    const certificateId = searchParams.get("certificateId");
    const explicitHolderId = searchParams.get("holderId")?.trim();

    if (explicitHolderId) {
      let queryHolders: string[] = [explicitHolderId];

      if (userId) {
        const actorHolders = await resolveAuthorizedHolderIds(userId);
        const isSelf = explicitHolderId === userId;
        const isAuthorized =
          isSelf ||
          actorHolders.includes(explicitHolderId) ||
          (await isCooperativeAuthorizedForFarmer(userId, explicitHolderId));

        if (!isAuthorized) {
          const actorInfo = await getCooperativeActorInfo(userId);
          if (!actorInfo.isAdmin && !actorInfo.cooperativeOrgIds.includes(explicitHolderId)) {
            return NextResponse.json(
              {
                success: false,
                error: "Authorization Error: Not authorized to access holdings for this holder.",
              },
              { status: 403 }
            );
          }
        }

        // When requesting own holdings (e.g. /dashboard/holdings?holderId=<uid>),
        // include all organization / cooperative / member holdings the actor represents.
        if (isSelf) {
          queryHolders = actorHolders;
        }
      }

      await syncCertificatesToHoldingsForHolders(queryHolders);

      const holdingMap = new Map<string, CertificateHolding>();
      for (let i = 0; i < queryHolders.length; i += 10) {
        const chunk = queryHolders.slice(i, i + 10);
        if (chunk.length === 0) continue;
        let queryRef: FirebaseFirestore.Query = firebaseAdminDb
          .collection("certificateHoldings")
          .where("holderId", "in", chunk);
        if (certificateId) {
          queryRef = queryRef.where("certificateId", "==", certificateId.trim());
        }
        const snapshot = await queryRef.get();
        snapshot.forEach((doc) => {
          holdingMap.set(doc.id, normalizeHolding(doc.id, doc.data()));
        });
      }

      return NextResponse.json({
        success: true,
        holdings: Array.from(holdingMap.values()),
      });
    }

    if (certificateId) {
      const cleanCertId = certificateId.trim();
      let snap = await firebaseAdminDb
        .collection("certificateHoldings")
        .where("certificateId", "==", cleanCertId)
        .get();

      if (snap.empty) {
        const certDoc = await firebaseAdminDb.collection("certificates").doc(cleanCertId).get();
        if (certDoc.exists) {
          const certData = certDoc.data() || {};
          const effectiveHolder = String(certData.currentHolderId || certData.holderId || "").trim();
          if (effectiveHolder) {
            await syncCertificatesToHoldingsForHolders([effectiveHolder]);
            snap = await firebaseAdminDb
              .collection("certificateHoldings")
              .where("certificateId", "==", cleanCertId)
              .get();
          }
        }
      }

      const holdings = snap.docs.map((doc) => normalizeHolding(doc.id, doc.data()));
      return NextResponse.json({ success: true, holdings });
    }

    if (userId) {
      const holderList = await resolveAuthorizedHolderIds(userId);
      await syncCertificatesToHoldingsForHolders(holderList);

      const holdingMap = new Map<string, CertificateHolding>();

      for (let i = 0; i < holderList.length; i += 10) {
        const chunk = holderList.slice(i, i + 10);
        if (chunk.length === 0) continue;
        const snap = await firebaseAdminDb
          .collection("certificateHoldings")
          .where("holderId", "in", chunk)
          .get();
        snap.forEach((doc) => {
          holdingMap.set(doc.id, normalizeHolding(doc.id, doc.data()));
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
