/**
 * Farm Cadastral Review Service
 * 
 * Handles the state transition of border-zone farms from
 * "pending_cadastral_review" to "verified_border_cadastral" or "rejected_cadastral_review".
 */

import { firebaseAdminDb } from "@/lib/firebaseAdmin";
import { assertAuthorizedCadastralReviewer } from "@/lib/cadastralAuthorization";

export interface CadastralReviewInput {
  farmId: string;
  reviewerUid: string;
  decision: "approve" | "reject";
  reviewNotes?: string;
  cadastralCertificateNumber?: string;
}

export interface CadastralReviewResult {
  farmId: string;
  previousStatus: string;
  newStatus: "verified_border_cadastral" | "rejected_cadastral_review";
  reviewedBy: string;
  reviewedAt: string;
  reviewNotes: string;
  cadastralCertificateNumber?: string;
}

/**
 * Reviews and verifies or rejects cadastral documentation for a border-zone farm.
 * Requires authorized administrative or certification-officer caller.
 */
export async function reviewFarmCadastralStatus(
  input: CadastralReviewInput
): Promise<CadastralReviewResult> {
  const { farmId, reviewerUid, decision, reviewNotes, cadastralCertificateNumber } = input;

  if (!farmId || typeof farmId !== "string" || !farmId.trim()) {
    throw new Error("Validation Error: farmId is required.");
  }
  if (!reviewerUid || typeof reviewerUid !== "string" || !reviewerUid.trim()) {
    throw new Error("Validation Error: reviewerUid is required.");
  }
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Validation Error: decision must be either 'approve' or 'reject'.");
  }

  // 1. Enforce strict server-side authorization check
  await assertAuthorizedCadastralReviewer(reviewerUid);

  const cleanFarmId = farmId.trim();
  const farmRef = firebaseAdminDb.collection("farms").doc(cleanFarmId);
  const farmSnap = await farmRef.get();

  if (!farmSnap.exists) {
    throw new Error(`Upstream Lookup Error: Farm with ID "${cleanFarmId}" does not exist.`);
  }

  const farmData = farmSnap.data() || {};
  const currentStatus = (farmData.borderAuditStatus as string) || "pending_cadastral_review";

  // Prevent self-review if reviewer is also the farmer (separation of duties)
  if (farmData.farmerId === reviewerUid) {
    throw new Error(
      "Authorization Error: A farmer cannot review or self-approve their own farm's cadastral documentation."
    );
  }

  const nowIso = new Date().toISOString();

  if (decision === "approve") {
    // Verify that proof was supplied (either on the farm or provided with the approval)
    const effectiveLandDoc = cadastralCertificateNumber || farmData.landDocReference;
    if (!effectiveLandDoc || typeof effectiveLandDoc !== "string" || !effectiveLandDoc.trim()) {
      throw new Error(
        "Validation Error: Cannot approve border cadastral verification without a valid land document reference or cadastral certificate number."
      );
    }

    const updates: Record<string, unknown> = {
      borderAuditStatus: "verified_border_cadastral",
      cadastralReviewedBy: reviewerUid,
      cadastralReviewedAt: nowIso,
      cadastralReviewNotes: reviewNotes || "Approved by authorized review officer.",
      auditCertificateNumber: effectiveLandDoc.trim(),
    };

    await farmRef.update(updates);

    return {
      farmId: cleanFarmId,
      previousStatus: currentStatus,
      newStatus: "verified_border_cadastral",
      reviewedBy: reviewerUid,
      reviewedAt: nowIso,
      reviewNotes: reviewNotes || "Approved by authorized review officer.",
      cadastralCertificateNumber: effectiveLandDoc.trim(),
    };
  } else {
    // Rejection branch
    const updates: Record<string, unknown> = {
      borderAuditStatus: "rejected_cadastral_review",
      cadastralReviewedBy: reviewerUid,
      cadastralReviewedAt: nowIso,
      cadastralReviewNotes: reviewNotes || "Rejected by authorized review officer.",
    };

    await farmRef.update(updates);

    return {
      farmId: cleanFarmId,
      previousStatus: currentStatus,
      newStatus: "rejected_cadastral_review",
      reviewedBy: reviewerUid,
      reviewedAt: nowIso,
      reviewNotes: reviewNotes || "Rejected by authorized review officer.",
    };
  }
}
