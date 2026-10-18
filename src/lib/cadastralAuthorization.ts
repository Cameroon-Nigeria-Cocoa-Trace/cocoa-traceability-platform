/**
 * Cadastral Authorization Module
 * 
 * Enforces server-side administrative and certification-officer authorization
 * for reviewing and verifying border-zone farm cadastral documentation.
 * 
 * Security Contract:
 * - Standard farmers CANNOT self-approve border cadastral verification.
 * - Only authorized review officers (Platform Admins, Certification Officers, Inspectors)
 *   can transition a farm from "pending_cadastral_review" to "verified_border_cadastral".
 * - Pluggable verifier interface for tests and integration environments.
 */

import { firebaseAdminDb } from "@/lib/firebaseAdmin";

export type CadastralReviewerVerifier = (
  userId: string
) => Promise<boolean> | boolean;

let customCadastralVerifier: CadastralReviewerVerifier | null = null;

/**
 * Registers a pluggable verifier for testing or external auth providers.
 */
export function setCadastralReviewerVerifier(
  verifier: CadastralReviewerVerifier | null
): void {
  customCadastralVerifier = verifier;
}

/**
 * Determines whether a given Firebase UID is authorized to review cadastral documents.
 */
export async function isAuthorizedCadastralReviewer(
  userId: string
): Promise<boolean> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    return false;
  }
  const cleanUid = userId.trim();

  // 1. Pluggable verifier override (if registered by test suite)
  if (customCadastralVerifier) {
    try {
      const authorized = await customCadastralVerifier(cleanUid);
      return Boolean(authorized);
    } catch {
      return false;
    }
  }

  // 2. Check admins/{userId} collection in Firestore (recognized by firestore.rules)
  try {
    const adminDoc = await firebaseAdminDb.collection("admins").doc(cleanUid).get();
    if (adminDoc.exists) {
      return true;
    }
  } catch {
    // Continue
  }

  // 3. Check users/{userId} for admin, certification_officer, inspector, or isCertificateAuthority
  try {
    const userDoc = await firebaseAdminDb.collection("users").doc(cleanUid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const role = userData?.role || userData?.accountType;
      if (
        role === "admin" ||
        role === "certification_officer" ||
        role === "inspector" ||
        role === "cadastral_officer" ||
        userData?.isCertificateAuthority === true
      ) {
        return true;
      }
    }
  } catch {
    // Continue
  }

  return false;
}

/**
 * Asserts that the authenticated caller has cadastral review authority.
 * Throws a descriptive Authorization Error if unauthorized.
 */
export async function assertAuthorizedCadastralReviewer(
  userId: string
): Promise<void> {
  const authorized = await isAuthorizedCadastralReviewer(userId);
  if (!authorized) {
    throw new Error(
      `Authorization Error: User "${userId}" is not authorized to review or approve border cadastral documentation. Requires administrative or certification-officer authority.`
    );
  }
}
