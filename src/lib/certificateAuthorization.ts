/**
 * Certificate Authorization Module (Role 3 Security Boundary)
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Establishes an explicit authorization dependency for sensitive certificate operations:
 *   - reviewCertificateApplication
 *   - approveCertificateApplication
 *   - rejectCertificateApplication
 *   - issueTraceCertificate
 *   - readInternalCertificateApplication
 * - Enforces the required security contract:
 *   - Unauthenticated caller -> HTTP 401
 *   - Authenticated but unauthorized caller -> HTTP 403
 *   - Authenticated and authorized caller -> Operation proceeds
 * - Integrates with existing Firestore authorization structures:
 *   - admins/{userId} collection (established in firestore.rules)
 *   - users/{userId} role attribute ('admin')
 *   - Pluggable verifier interface for integration when Role 1 formalizes the certification officer account.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type CertificateOperation =
  | "review"
  | "approve"
  | "reject"
  | "issue"
  | "read_internal";

export type EntityAuthorityVerifier = (
  actorUid: string,
  holderId: string,
  holderType: string,
  action: "transfer" | "manage"
) => Promise<boolean> | boolean;

let customEntityVerifier: EntityAuthorityVerifier | null = null;

/**
 * Allows the authentication/authorization team to register an entity authority verifier
 * for organizational holders (cooperatives, agents, warehouses).
 */
export function setEntityAuthorityVerifier(
  verifier: EntityAuthorityVerifier | null
): void {
  customEntityVerifier = verifier;
}

/**
 * Asserts that the authenticated actor is authorized to act on behalf of the holding entity.
 * Fails closed if unauthorized.
 */
export async function assertActorCanActForHolder(
  actorUid: string,
  holderId: string,
  holderType: string,
  action: "transfer" | "manage" = "transfer"
): Promise<void> {
  if (!actorUid || !actorUid.trim()) {
    throw new Error("Authentication Required: You must be authenticated to perform this operation.");
  }
  if (!holderId || !holderId.trim()) {
    throw new Error("Validation Error: holderId is required for authorization verification.");
  }

  const cleanActorUid = actorUid.trim();
  const cleanHolderId = holderId.trim();

  // 1. Pluggable entity verifier override (if registered by Auth module or test suite)
  if (customEntityVerifier) {
    const isAuthorized = await customEntityVerifier(cleanActorUid, cleanHolderId, holderType, action);
    if (isAuthorized) return;
  }

  // 2. Platform Admins have universal operational authority
  try {
    const adminSnap = await getDoc(doc(db, "admins", cleanActorUid));
    if (adminSnap.exists()) return;
  } catch {
    // Continue
  }

  try {
    const userSnap = await getDoc(doc(db, "users", cleanActorUid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData?.role === "admin" || userData?.accountType === "admin") return;

      // Check organization membership link if present on user profile
      if (
        holderType !== "farmer" &&
        (userData?.organizationId === cleanHolderId ||
          userData?.cooperativeId === cleanHolderId ||
          userData?.agentId === cleanHolderId ||
          userData?.warehouseId === cleanHolderId)
      ) {
        return;
      }
    }
  } catch {
    // Continue
  }

  // 3. Farmer: Personal holding, actor must match farmer UID
  if (holderType === "farmer") {
    if (cleanActorUid === cleanHolderId) return;
    throw new Error(
      `Authorization Error: Actor "${cleanActorUid}" is not authorized to act on behalf of farmer "${cleanHolderId}".`
    );
  }

  // 4. Organizational holder (Cooperative, Agent, Warehouse):
  // Actor UID is an individual user and does NOT equal the organizational holder ID.
  // Fail closed by default if membership/authority was not established above.
  throw new Error(
    `Authorization Error: Actor "${cleanActorUid}" is not authorized to act on behalf of ${holderType} entity "${cleanHolderId}".`
  );
}

export type DestinationEntityValidator = (
  holderId: string,
  holderType: string
) => Promise<boolean> | boolean;

let customDestinationValidator: DestinationEntityValidator | null = null;

/**
 * Registers an entity validator for destination holding verification.
 */
export function setDestinationEntityValidator(
  validator: DestinationEntityValidator | null
): void {
  customDestinationValidator = validator;
}

/**
 * Asserts that the destination entity is valid, supported, and exists according to the project's entity model.
 * Fails safely: does NOT accept arbitrary unverified entity IDs or create missing entities.
 */
export async function assertDestinationEntityValid(
  destinationHolderId: string,
  destinationHolderType: string
): Promise<void> {
  if (!destinationHolderId || !destinationHolderId.trim()) {
    throw new Error("Validation Error: destinationHolderId is required.");
  }
  if (!destinationHolderType || !destinationHolderType.trim()) {
    throw new Error("Validation Error: destinationHolderType is required.");
  }

  const cleanHolderId = destinationHolderId.trim();
  const cleanType = destinationHolderType.trim().toLowerCase();

  const supportedTypes = ["farmer", "cooperative", "agent", "warehouse"];
  if (!supportedTypes.includes(cleanType)) {
    throw new Error(
      `Validation Error: destinationHolderType "${destinationHolderType}" is not supported. Supported types: ${supportedTypes.join(", ")}.`
    );
  }

  // 1. Pluggable entity validator (registered by Auth/Actor module or test suite)
  if (customDestinationValidator) {
    const isValid = await customDestinationValidator(cleanHolderId, cleanType);
    if (!isValid) {
      throw new Error(
        `Destination Entity Error: Destination entity "${cleanHolderId}" of type "${cleanType}" does not exist or could not be verified.`
      );
    }
    return;
  }

  // 2. Default entity checks against Firestore:
  if (cleanType === "farmer") {
    try {
      const userSnap = await getDoc(doc(db, "users", cleanHolderId));
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const role = userData?.role || userData?.accountType;
        if (!role || role === "farmer") {
          return;
        }
        throw new Error(
          `Destination Entity Error: Destination user "${cleanHolderId}" has role "${role}", which does not match requested destinationHolderType "farmer".`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Destination Entity Error")) throw err;
    }
  } else if (cleanType === "cooperative") {
    try {
      const coopSnap = await getDoc(doc(db, "cooperatives", cleanHolderId));
      if (coopSnap.exists()) {
        const coopData = coopSnap.data();
        if (coopData?.type && coopData.type !== "cooperative") {
          throw new Error(
            `Destination Entity Error: Cooperative entity "${cleanHolderId}" has mismatched type "${coopData.type}", which does not match requested destinationHolderType "cooperative".`
          );
        }
        return;
      }
      const orgSnap = await getDoc(doc(db, "organizations", cleanHolderId));
      if (orgSnap.exists()) {
        const orgData = orgSnap.data();
        const orgType = (orgData?.type || orgData?.organizationType || "").toLowerCase();
        if (orgType && orgType !== "cooperative") {
          throw new Error(
            `Destination Entity Error: Organization entity "${cleanHolderId}" has type "${orgType}", which does not match requested destinationHolderType "cooperative".`
          );
        }
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Destination Entity Error")) throw err;
    }
  } else if (cleanType === "agent") {
    try {
      const agentSnap = await getDoc(doc(db, "agents", cleanHolderId));
      if (agentSnap.exists()) {
        const agentData = agentSnap.data();
        if (agentData?.type && agentData.type !== "agent") {
          throw new Error(
            `Destination Entity Error: Agent entity "${cleanHolderId}" has mismatched type "${agentData.type}", which does not match requested destinationHolderType "agent".`
          );
        }
        return;
      }
      const orgSnap = await getDoc(doc(db, "organizations", cleanHolderId));
      if (orgSnap.exists()) {
        const orgData = orgSnap.data();
        const orgType = (orgData?.type || orgData?.organizationType || "").toLowerCase();
        if (orgType && orgType !== "agent") {
          throw new Error(
            `Destination Entity Error: Organization entity "${cleanHolderId}" has type "${orgType}", which does not match requested destinationHolderType "agent".`
          );
        }
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Destination Entity Error")) throw err;
    }
  } else if (cleanType === "warehouse") {
    try {
      const whSnap = await getDoc(doc(db, "warehouses", cleanHolderId));
      if (whSnap.exists()) {
        const whData = whSnap.data();
        if (whData?.type && whData.type !== "warehouse") {
          throw new Error(
            `Destination Entity Error: Warehouse entity "${cleanHolderId}" has mismatched type "${whData.type}", which does not match requested destinationHolderType "warehouse".`
          );
        }
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Destination Entity Error")) throw err;
    }
  }

  // Fail safe: If the entity cannot be verified and no validator approved it, fail safely
  throw new Error(
    `Destination Entity Error: Destination entity "${cleanHolderId}" of type "${cleanType}" does not exist or could not be verified.`
  );
}

export type CertificateAuthorityVerifier = (
  userId: string,
  operation: CertificateOperation
) => Promise<boolean> | boolean;

let customVerifier: CertificateAuthorityVerifier | null = null;

/**
 * Allows the authentication/authorization team to register a custom verifier
 * without altering Role 3 domain logic.
 */
export function setCertificateAuthorityVerifier(
  verifier: CertificateAuthorityVerifier | null
): void {
  customVerifier = verifier;
}

/**
 * Checks whether an authenticated Firebase UID is authorized to perform
 * a sensitive certificate operation.
 */
export async function isAuthorizedForCertificateOperation(
  userId: string,
  operation: CertificateOperation
): Promise<boolean> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    return false;
  }

  const cleanUserId = userId.trim();

  // 1. Pluggable verifier override (if registered by Auth module or test suite)
  if (customVerifier) {
    try {
      const authorized = await customVerifier(cleanUserId, operation);
      return Boolean(authorized);
    } catch {
      return false;
    }
  }

  // 2. Check admins/{userId} collection (recognized by firestore.rules)
  try {
    const adminSnap = await getDoc(doc(db, "admins", cleanUserId));
    if (adminSnap.exists()) {
      return true;
    }
  } catch {
    // Continue to next check
  }

  // 3. Check users/{userId} document for 'admin' role or certificate authority capability
  try {
    const userSnap = await getDoc(doc(db, "users", cleanUserId));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData?.role === "admin" || userData?.isCertificateAuthority === true || userData?.accountType === "admin") {
        return true;
      }
    }
  } catch {
    // Continue
  }

  // Default deny: ordinary authenticated users (standard farmers, buyers, etc.)
  // are NOT authorized to review, approve, reject, or issue certificates.
  return false;
}

/**
 * Asserts that the authenticated user is authorized for the given certificate operation.
 * Throws an explicit Authorization Error if unauthorized.
 */
export async function assertAuthorizedForCertificateOperation(
  userId: string,
  operation: CertificateOperation
): Promise<void> {
  const authorized = await isAuthorizedForCertificateOperation(userId, operation);
  if (!authorized) {
    throw new Error(
      `Authorization Error: User "${userId}" is not authorized to perform certificate operation "${operation}".`
    );
  }
}
