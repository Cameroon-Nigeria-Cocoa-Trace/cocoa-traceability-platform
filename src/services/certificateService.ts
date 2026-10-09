/**
 * Origin Trace Certificate Service
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * Responsibilities:
 * - Manages the lifecycle of Origin Trace Certificate Applications:
 *   submitted -> under_review -> approved / rejected
 * - Validates strict upstream traceability chain:
 *   Farm -> Production Record -> Harvest -> Cocoa Lot -> Certificate Application -> Trace Certificate
 * - Enforces entity integrity:
 *   - CocoaLot.farmId === ProductionRecord.farmId === Harvest.farmId
 *   - CocoaLot.productionRecordId === Harvest.productionRecordId
 *   - CocoaLot.originCountry === "Cameroon"
 *   - requestedQuantityKg > 0 && requestedQuantityKg <= CocoaLot.quantityKg
 * - Guarantees Certification vs Allocation Boundary:
 *   Certification certifies existing traceable lots and does NOT consume physical harvest or lot quantities.
 * - Enforces atomic certificate issuance via Firestore transactions to prevent duplicate or race conditions.
 * - Protects historical lineage and immutability.
 */

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import {
  CertificateApplication,
  TraceCertificate,
  CertificateVerificationStatus,
  CertificateHolderType,
  CocoaLot,
  CocoaLotStatus,
  ProductionRecord,
  Harvest,
  CloudinaryImageReference,
} from "@/types/traceability";
import { resolveAuthenticatedUserUid, getProductionRecord } from "./productionService";
import { getHarvestRecord } from "./harvestService";
import { getCocoaLot } from "./cocoaLotService";
import {
  assertAuthorizedForCertificateOperation,
} from "@/lib/certificateAuthorization";

// Top-level Firestore collections
export const COLLECTIONS = {
  CERTIFICATE_APPLICATIONS: "certificateApplications",
  CERTIFICATES: "certificates",
  CERTIFICATE_HOLDINGS: "certificateHoldings",
  CERTIFICATE_TRANSFERS: "certificateTransfers",
  COCOA_LOTS: "cocoaLots",
  FARMS: "farms",
  PRODUCTIONS: "productions",
  HARVESTS: "harvests",
  MARKETPLACE_LISTINGS: "marketplaceListings",
  TRADES: "trades",
  COCOA_LOT_ADJUSTMENTS: "cocoaLotAdjustments",
} as const;

export interface FarmRecord {
  id: string;
  farmerId: string;
  farmName: string;
  region?: string;
  cooperative?: string;
  geolocation?: string;
  sizeHectares?: number;
  eudrCompliant?: boolean;
  createdAt?: string;
}

export interface CreateCertificateApplicationInput {
  applicationId?: string; // Optional idempotency key / custom document ID
  lotId: string;
  applicantId?: string; // Authenticated Firebase UID
  applicantType?: CertificateHolderType; // Defaults to "farmer"
  requestedQuantityKg: number;
}

export interface IssueCertificateInput {
  certificateId?: string; // Optional idempotency key / custom ID
  applicationId: string; // Mandatory reference to approved application
  certifiedQuantityKg?: number; // Defaults to application.requestedQuantityKg
  expiryDate?: string;
  verificationStatus?: CertificateVerificationStatus; // Defaults to "verified"
  issuedBy?: string; // Authenticated Firebase UID
}

export interface CertificateLineage {
  certificate: TraceCertificate;
  application: CertificateApplication;
  lot: CocoaLot;
  harvest: Harvest;
  production: ProductionRecord;
  farm: FarmRecord;
}

/**
 * Validates the full upstream relational integrity for a Certificate Application.
 */
export function validateUpstreamTraceabilityChain(
  lot: CocoaLot,
  farm: FarmRecord,
  production: ProductionRecord,
  harvest: Harvest,
  requestedQuantityKg: number
): void {
  // 1. Verify Farm match
  if (lot.farmId !== farm.id) {
    throw new Error(
      `Relational Mismatch Error: Cocoa lot farmId ("${lot.farmId}") does not match Farm ID ("${farm.id}").`
    );
  }
  if (production.farmId !== farm.id) {
    throw new Error(
      `Relational Mismatch Error: Production record farmId ("${production.farmId}") does not match Farm ID ("${farm.id}").`
    );
  }
  if (harvest.farmId !== farm.id) {
    throw new Error(
      `Relational Mismatch Error: Harvest record farmId ("${harvest.farmId}") does not match Farm ID ("${farm.id}").`
    );
  }

  // 2. Verify Production Record match
  if (lot.productionRecordId !== production.productionRecordId) {
    throw new Error(
      `Relational Mismatch Error: Cocoa lot productionRecordId ("${lot.productionRecordId}") does not match Production Record ID ("${production.productionRecordId}").`
    );
  }
  if (harvest.productionRecordId !== production.productionRecordId) {
    throw new Error(
      `Relational Mismatch Error: Harvest productionRecordId ("${harvest.productionRecordId}") does not match Production Record ID ("${production.productionRecordId}").`
    );
  }

  // 3. Verify Harvest match
  if (lot.harvestId !== harvest.harvestId) {
    throw new Error(
      `Relational Mismatch Error: Cocoa lot harvestId ("${lot.harvestId}") does not match Harvest ID ("${harvest.harvestId}").`
    );
  }

  // 4. Verify Origin Country
  if (lot.originCountry !== "Cameroon") {
    throw new Error(
      `Origin Validation Error: Cocoa lot originCountry must be "Cameroon", received "${lot.originCountry}".`
    );
  }

  // 5. Verify Quantities
  if (typeof lot.quantityKg !== "number" || isNaN(lot.quantityKg) || lot.quantityKg <= 0) {
    throw new Error(`Validation Error: Invalid Cocoa Lot quantity (${lot.quantityKg}). Must be greater than 0.`);
  }

  if (typeof requestedQuantityKg !== "number" || isNaN(requestedQuantityKg) || requestedQuantityKg <= 0) {
    throw new Error(
      `Validation Error: Invalid requestedQuantityKg (${requestedQuantityKg}). Must be a positive finite number greater than 0.`
    );
  }

  if (requestedQuantityKg > lot.quantityKg) {
    throw new Error(
      `Quantity Validation Error: Requested certification quantity (${requestedQuantityKg} kg) cannot exceed Cocoa Lot quantity (${lot.quantityKg} kg).`
    );
  }
}

/**
 * Generates a unique, human-readable Application Number.
 * Format: APP-CMR-YYYYMMDD-XXXXXX
 */
export function generateApplicationNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `APP-CMR-${dateStr}-${rand}`;
}

/**
 * Generates a unique, immutable Certificate Number.
 * Format: CERT-CMR-YYYY-XXXXXX
 */
export function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CERT-CMR-${year}-${rand}`;
}

/**
 * Creates an Origin Trace Certificate Application.
 * Validates the complete upstream chain (Farm -> Production -> Harvest -> Lot).
 * Idempotent against duplicate retries.
 */
export async function createCertificateApplication(
  input: CreateCertificateApplicationInput
): Promise<CertificateApplication> {
  const applicantUid = resolveAuthenticatedUserUid(input.applicantId);

  if (!input.lotId || typeof input.lotId !== "string" || !input.lotId.trim()) {
    throw new Error("Validation Error: lotId is required and must be a non-empty string.");
  }

  const requestedQuantityKg = input.requestedQuantityKg;
  if (typeof requestedQuantityKg !== "number" || isNaN(requestedQuantityKg) || requestedQuantityKg <= 0) {
    throw new Error(
      `Validation Error: requestedQuantityKg must be a positive number greater than 0, received ${requestedQuantityKg}.`
    );
  }

  // Idempotency: Check if application with provided applicationId already exists
  if (input.applicationId) {
    const existing = await getCertificateApplication(input.applicationId);
    if (existing) {
      return existing;
    }
  }

  // 1. Fetch Cocoa Lot
  const lot = await getCocoaLot(input.lotId);
  if (!lot) {
    throw new Error(`Upstream Lookup Error: Cocoa lot with ID "${input.lotId}" does not exist.`);
  }

  // 2. Fetch Farm
  const farmRef = doc(db, COLLECTIONS.FARMS, lot.farmId);
  const farmSnap = await getDoc(farmRef);
  if (!farmSnap.exists()) {
    throw new Error(`Upstream Lookup Error: Farm with ID "${lot.farmId}" does not exist.`);
  }
  const farm = { id: farmSnap.id, ...farmSnap.data() } as FarmRecord;

  // 3. Fetch Production Record
  const production = await getProductionRecord(lot.productionRecordId);
  if (!production) {
    throw new Error(`Upstream Lookup Error: Production record with ID "${lot.productionRecordId}" does not exist.`);
  }

  // 4. Fetch Harvest
  const harvest = await getHarvestRecord(lot.harvestId);
  if (!harvest) {
    throw new Error(`Upstream Lookup Error: Harvest with ID "${lot.harvestId}" does not exist.`);
  }

  // 5. Validate complete upstream traceability chain
  validateUpstreamTraceabilityChain(lot, farm, production, harvest, requestedQuantityKg);

  // 6. Construct Certificate Application
  const now = new Date().toISOString();
  const applicationId = input.applicationId?.trim() || doc(collection(db, COLLECTIONS.CERTIFICATE_APPLICATIONS)).id;
  const applicationNumber = generateApplicationNumber();

  const application: CertificateApplication = {
    applicationId,
    applicationNumber,
    lotId: lot.lotId,
    farmId: farm.id,
    applicantId: applicantUid,
    applicantType: input.applicantType || "farmer",
    requestedQuantityKg,
    originCountry: "Cameroon",
    productionPeriod: lot.productionPeriod || production.productionPeriod,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
  };

  const appDocRef = doc(db, COLLECTIONS.CERTIFICATE_APPLICATIONS, applicationId);
  await runTransaction(db, async (tx) => {
    const existingDoc = await tx.get(appDocRef);
    if (existingDoc.exists()) {
      return;
    }
    tx.set(appDocRef, application);
  });

  return application;
}

/**
 * Retrieves a Certificate Application by ID.
 */
export async function getCertificateApplication(
  applicationId: string
): Promise<CertificateApplication | null> {
  if (!applicationId || typeof applicationId !== "string" || !applicationId.trim()) {
    return null;
  }

  const appRef = doc(db, COLLECTIONS.CERTIFICATE_APPLICATIONS, applicationId.trim());
  try {
    const snap = await getDoc(appRef);
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as CertificateApplication;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.CERTIFICATE_APPLICATIONS}/${applicationId}`);
    return null;
  }
}

/**
 * Lists Certificate Applications for a specific Cocoa Lot (preserving complete history).
 */
export async function listCertificateApplicationsByLot(
  lotId: string
): Promise<CertificateApplication[]> {
  if (!lotId || typeof lotId !== "string" || !lotId.trim()) {
    return [];
  }

  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_APPLICATIONS),
    where("lotId", "==", lotId.trim())
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as CertificateApplication);
}

/**
 * Lists Certificate Applications submitted by a specific applicant UID.
 */
export async function listCertificateApplicationsByApplicant(
  applicantId: string
): Promise<CertificateApplication[]> {
  if (!applicantId || typeof applicantId !== "string" || !applicantId.trim()) {
    return [];
  }

  const q = query(
    collection(db, COLLECTIONS.CERTIFICATE_APPLICATIONS),
    where("applicantId", "==", applicantId.trim())
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as CertificateApplication);
}

/**
 * Moves a Certificate Application to "under_review".
 * Requires explicit "review" authorization.
 */
export async function reviewCertificateApplication(
  applicationId: string,
  reviewerId?: string
): Promise<CertificateApplication> {
  const verifiedReviewer = resolveAuthenticatedUserUid(reviewerId);
  await assertAuthorizedForCertificateOperation(verifiedReviewer, "review");

  const appRef = doc(db, COLLECTIONS.CERTIFICATE_APPLICATIONS, applicationId.trim());

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists()) {
      throw new Error(`Application Error: Certificate application "${applicationId}" does not exist.`);
    }

    const application = snap.data() as CertificateApplication;

    if (application.status === "approved") {
      throw new Error(`State Transition Error: Application "${applicationId}" is already approved.`);
    }
    if (application.status === "rejected") {
      throw new Error(`State Transition Error: Application "${applicationId}" has already been rejected.`);
    }

    const now = new Date().toISOString();
    const updatedApplication: CertificateApplication = {
      ...application,
      status: "under_review",
      reviewedBy: verifiedReviewer,
      reviewedAt: now,
      updatedAt: now,
    };

    tx.set(appRef, updatedApplication);
    return updatedApplication;
  });
}

/**
 * Approves a Certificate Application.
 * Requires explicit "approve" authorization.
 */
export async function approveCertificateApplication(
  applicationId: string,
  reviewerId?: string
): Promise<CertificateApplication> {
  const verifiedReviewer = resolveAuthenticatedUserUid(reviewerId);
  await assertAuthorizedForCertificateOperation(verifiedReviewer, "approve");

  const appRef = doc(db, COLLECTIONS.CERTIFICATE_APPLICATIONS, applicationId.trim());

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists()) {
      throw new Error(`Application Error: Certificate application "${applicationId}" does not exist.`);
    }

    const application = snap.data() as CertificateApplication;

    if (application.status === "approved") {
      return application; // Idempotent approval
    }
    if (application.status === "rejected") {
      throw new Error(`State Transition Error: Cannot approve rejected application "${applicationId}".`);
    }

    const now = new Date().toISOString();
    const updatedApplication: CertificateApplication = {
      ...application,
      status: "approved",
      reviewedBy: verifiedReviewer,
      reviewedAt: now,
      updatedAt: now,
    };

    tx.set(appRef, updatedApplication);
    return updatedApplication;
  });
}

/**
 * Rejects a Certificate Application with mandatory rejectionReason.
 * Requires explicit "reject" authorization.
 * Preserves the application permanently for historical lineage.
 */
export async function rejectCertificateApplication(
  applicationId: string,
  rejectionReason: string,
  reviewerId?: string
): Promise<CertificateApplication> {
  const verifiedReviewer = resolveAuthenticatedUserUid(reviewerId);
  await assertAuthorizedForCertificateOperation(verifiedReviewer, "reject");

  if (!rejectionReason || typeof rejectionReason !== "string" || !rejectionReason.trim()) {
    throw new Error("Validation Error: rejectionReason is required and must be a non-empty string.");
  }

  const appRef = doc(db, COLLECTIONS.CERTIFICATE_APPLICATIONS, applicationId.trim());

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists()) {
      throw new Error(`Application Error: Certificate application "${applicationId}" does not exist.`);
    }

    const application = snap.data() as CertificateApplication;

    if (application.status === "approved") {
      throw new Error(`State Transition Error: Cannot reject already approved application "${applicationId}".`);
    }

    const now = new Date().toISOString();
    const updatedApplication: CertificateApplication = {
      ...application,
      status: "rejected",
      rejectionReason: rejectionReason.trim(),
      reviewedBy: verifiedReviewer,
      reviewedAt: now,
      updatedAt: now,
    };

    tx.set(appRef, updatedApplication);
    return updatedApplication;
  });
}

/**
 * Issues an Origin Trace Certificate based on an approved application.
 * Requires explicit "issue" authorization.
 *
 * Atomic transaction guarantees:
 * - Application must be in "approved" state.
 * - Idempotency: Prevents duplicate certificate issuance for the same application.
 * - Re-evaluates remaining certification capacity dynamically at moment of issuance:
 *   SUM(issued certified quantities for lot) + newQuantity <= CocoaLot.quantityKg
 * - Atomic write to both Certificate and CocoaLot ensures concurrent issuance requests
 *   cannot exceed lot capacity.
 * - Does NOT reduce or mutate physical harvest or lot quantities.
 */
export async function issueTraceCertificate(
  input: IssueCertificateInput
): Promise<TraceCertificate> {
  const issuerUid = resolveAuthenticatedUserUid(input.issuedBy);
  await assertAuthorizedForCertificateOperation(issuerUid, "issue");

  if (!input.applicationId || typeof input.applicationId !== "string" || !input.applicationId.trim()) {
    throw new Error("Validation Error: applicationId is required to issue a Trace Certificate.");
  }

  const appRef = doc(db, COLLECTIONS.CERTIFICATE_APPLICATIONS, input.applicationId.trim());

  return await runTransaction(db, async (tx) => {
    // 1. Fetch Application
    const appSnap = await tx.get(appRef);
    if (!appSnap.exists()) {
      throw new Error(`Issuance Error: Application with ID "${input.applicationId}" does not exist.`);
    }
    const application = appSnap.data() as CertificateApplication;

    // 2. Validate Application Status
    if (application.status !== "approved") {
      throw new Error(
        `Issuance Error: Cannot issue certificate for application in "${application.status}" state. Application must be "approved".`
      );
    }

    // 3. Check if Certificate has already been issued for this applicationId (idempotency check)
    const certsQuery = query(
      collection(db, COLLECTIONS.CERTIFICATES),
      where("applicationId", "==", application.applicationId)
    );
    const existingCerts = await getDocs(certsQuery);
    if (!existingCerts.empty) {
      return existingCerts.docs[0].data() as TraceCertificate;
    }

    // 4. Fetch Cocoa Lot to check quantity and current certified capacity atomically
    const lotRef = doc(db, COLLECTIONS.COCOA_LOTS, application.lotId);
    const lotSnap = await tx.get(lotRef);
    if (!lotSnap.exists()) {
      throw new Error(`Issuance Error: Backing Cocoa Lot "${application.lotId}" does not exist.`);
    }
    const lot = lotSnap.data() as CocoaLot;

    // 5. Validate Certified Quantity
    const certifiedQuantityKg = input.certifiedQuantityKg ?? application.requestedQuantityKg;
    if (typeof certifiedQuantityKg !== "number" || isNaN(certifiedQuantityKg) || certifiedQuantityKg <= 0) {
      throw new Error(
        `Validation Error: certifiedQuantityKg must be a positive number greater than 0, received ${certifiedQuantityKg}.`
      );
    }
    if (certifiedQuantityKg > application.requestedQuantityKg) {
      throw new Error(
        `Quantity Error: certifiedQuantityKg (${certifiedQuantityKg} kg) cannot exceed approved application quantity (${application.requestedQuantityKg} kg).`
      );
    }

    // 6. Cumulative Certification Capacity Check & Uncertified Marketplace Commitment Protection (Atomic)
    const currentCertifiedKg = lot.certifiedQuantityKg ?? 0;
    const remainingPhysicalCapacityKg = lot.quantityKg - currentCertifiedKg;
    if (certifiedQuantityKg > remainingPhysicalCapacityKg) {
      throw new Error(
        `Capacity Exceeded Error: Requested certified quantity (${certifiedQuantityKg} kg) exceeds remaining certification capacity (${remainingPhysicalCapacityKg} kg) for Cocoa Lot "${lot.lotId}". Existing certified: ${currentCertifiedKg} kg, total lot capacity: ${lot.quantityKg} kg.`
      );
    }

    // Query active uncertified marketplace commitments on this lot
    const activeUncertifiedQuery = query(
      collection(db, COLLECTIONS.MARKETPLACE_LISTINGS),
      where("lotId", "==", lot.lotId),
      where("certificationType", "==", "uncertified")
    );
    const activeListingsSnap = await getDocs(activeUncertifiedQuery);
    const committedUncertifiedKg = activeListingsSnap.docs
      .map((d) => d.data())
      .filter((l) => l.listingStatus === "available" || l.listingStatus === "under_negotiation")
      .reduce((sum, l) => sum + (l.quantityAvailableKg || 0), 0);

    // Query completed uncertified trades
    const tradesQuery = query(
      collection(db, COLLECTIONS.TRADES),
      where("lotId", "==", lot.lotId),
      where("certificationType", "==", "uncertified")
    );
    const tradesSnap = await getDocs(tradesQuery);
    const completedUncertifiedTradesKg = tradesSnap.docs
      .map((d) => d.data())
      .filter((t) => t.tradeStatus === "completed")
      .reduce((sum, t) => sum + (t.quantityKg || 0), 0);

    // Query physical deductions
    const adjQuery = query(
      collection(db, COLLECTIONS.COCOA_LOT_ADJUSTMENTS),
      where("lotId", "==", lot.lotId)
    );
    const adjSnap = await getDocs(adjQuery);
    const physicalDeductionsKg = adjSnap.docs
      .map((d) => d.data())
      .filter((a) => a.isPhysicalDeduction === true)
      .reduce((sum, a) => sum + (a.deductedQuantityKg || 0), 0);

    const legitimateUncertifiedEligible = Math.max(
      0,
      lot.quantityKg - currentCertifiedKg - completedUncertifiedTradesKg - physicalDeductionsKg
    );
    const uncommittedUncertifiedCapacity = Math.max(
      0,
      legitimateUncertifiedEligible - committedUncertifiedKg
    );

    if (certifiedQuantityKg > uncommittedUncertifiedCapacity) {
      throw new Error(
        `Capacity Exceeded Error: Requested certified quantity (${certifiedQuantityKg} kg) exceeds uncommitted uncertified physical capacity (${uncommittedUncertifiedCapacity} kg) for Cocoa Lot "${lot.lotId}". Active uncertified marketplace listings commit ${committedUncertifiedKg} kg, completed commercial sales: ${completedUncertifiedTradesKg} kg, physical deductions: ${physicalDeductionsKg} kg.`
      );
    }

    // 7. Generate Certificate
    const now = new Date().toISOString();
    const certificateId = input.certificateId?.trim() || doc(collection(db, COLLECTIONS.CERTIFICATES)).id;
    const certificateNumber = generateCertificateNumber();

    const certificate: TraceCertificate = {
      certificateId,
      certificateNumber,
      applicationId: application.applicationId,
      lotId: application.lotId,
      farmId: application.farmId,
      holderId: application.applicantId,
      holderType: application.applicantType || "farmer",
      originCountry: "Cameroon",
      certifiedQuantityKg,
      productionPeriod: application.productionPeriod,
      issueDate: now,
      expiryDate: input.expiryDate,
      status: "active",
      verificationStatus: input.verificationStatus || "verified",
      createdBy: issuerUid,
      createdAt: now,
      updatedAt: now,
    };

    const certRef = doc(db, COLLECTIONS.CERTIFICATES, certificateId);
    tx.set(certRef, certificate);

    // 8. Atomically provision initial CertificateHolding for the certified quantity
    const initialHoldingId = `holding_init_${certificateId}`;
    const initialHoldingRef = doc(db, COLLECTIONS.CERTIFICATE_HOLDINGS, initialHoldingId);
    const initialHolding = {
      holdingId: initialHoldingId,
      certificateId,
      certificateNumber,
      lotId: application.lotId,
      farmId: application.farmId,
      holderId: application.applicantId,
      holderType: application.applicantType || "farmer",
      quantityKg: certifiedQuantityKg,
      availableQuantityKg: certifiedQuantityKg,
      status: "active",
      createdBy: issuerUid,
      createdAt: now,
      updatedAt: now,
    };
    tx.set(initialHoldingRef, initialHolding);

    // 9. Atomically update certifiedQuantityKg and lotStatus on the Cocoa Lot document
    const newTotalCertified = currentCertifiedKg + certifiedQuantityKg;
    const newLotStatus: CocoaLotStatus =
      newTotalCertified >= lot.quantityKg ? "certified" : "partially_certified";

    tx.update(lotRef, {
      certifiedQuantityKg: newTotalCertified,
      lotStatus: newLotStatus,
      updatedAt: now,
    });

    return certificate;
  });
}

/**
 * Retrieves a Trace Certificate by its certificateId.
 */
export async function getTraceCertificate(
  certificateId: string
): Promise<TraceCertificate | null> {
  if (!certificateId || typeof certificateId !== "string" || !certificateId.trim()) {
    return null;
  }

  const certRef = doc(db, COLLECTIONS.CERTIFICATES, certificateId.trim());
  try {
    const snap = await getDoc(certRef);
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as TraceCertificate;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.CERTIFICATES}/${certificateId}`);
    return null;
  }
}

/**
 * Retrieves a Trace Certificate by its certificateNumber.
 */
export async function getTraceCertificateByNumber(
  certificateNumber: string
): Promise<TraceCertificate | null> {
  if (!certificateNumber || typeof certificateNumber !== "string" || !certificateNumber.trim()) {
    return null;
  }

  const q = query(
    collection(db, COLLECTIONS.CERTIFICATES),
    where("certificateNumber", "==", certificateNumber.trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  return snap.docs[0].data() as TraceCertificate;
}

/**
 * Retrieves a Trace Certificate for a specific Cocoa Lot.
 */
export async function getTraceCertificateByLot(
  lotId: string
): Promise<TraceCertificate | null> {
  if (!lotId || typeof lotId !== "string" || !lotId.trim()) {
    return null;
  }

  const q = query(
    collection(db, COLLECTIONS.CERTIFICATES),
    where("lotId", "==", lotId.trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  return snap.docs[0].data() as TraceCertificate;
}

/**
 * Resolves the full historical lineage:
 * Certificate -> Application -> CocoaLot -> Harvest -> Production -> Farm
 */
export async function resolveCertificateLineage(
  certificateId: string
): Promise<CertificateLineage> {
  const certificate = await getTraceCertificate(certificateId);
  if (!certificate) {
    throw new Error(`Lineage Resolution Error: Certificate "${certificateId}" does not exist.`);
  }

  const application = await getCertificateApplication(certificate.applicationId);
  if (!application) {
    throw new Error(
      `Lineage Resolution Error: Backing application "${certificate.applicationId}" for certificate "${certificateId}" does not exist.`
    );
  }

  const lot = await getCocoaLot(certificate.lotId);
  if (!lot) {
    throw new Error(
      `Lineage Resolution Error: Cocoa lot "${certificate.lotId}" for certificate "${certificateId}" does not exist.`
    );
  }

  const harvest = await getHarvestRecord(lot.harvestId);
  if (!harvest) {
    throw new Error(
      `Lineage Resolution Error: Harvest "${lot.harvestId}" for lot "${lot.lotId}" does not exist.`
    );
  }

  const production = await getProductionRecord(lot.productionRecordId);
  if (!production) {
    throw new Error(
      `Lineage Resolution Error: Production "${lot.productionRecordId}" for lot "${lot.lotId}" does not exist.`
    );
  }

  const farmRef = doc(db, COLLECTIONS.FARMS, certificate.farmId);
  const farmSnap = await getDoc(farmRef);
  if (!farmSnap.exists()) {
    throw new Error(
      `Lineage Resolution Error: Farm "${certificate.farmId}" for certificate "${certificateId}" does not exist.`
    );
  }
  const farm = { id: farmSnap.id, ...farmSnap.data() } as FarmRecord;

  return {
    certificate,
    application,
    lot,
    harvest,
    production,
    farm,
  };
}

/**
 * Public verifiable certificate view (sanitized to remove internal user/reviewer UIDs)
 */
export interface PublicTraceCertificate {
  certificateId: string;
  certificateNumber: string;
  lotId: string;
  originCountry: "Cameroon";
  certifiedQuantityKg: number;
  productionPeriod: string;
  issueDate: string;
  expiryDate?: string;
  status: string;
  verificationStatus: string;
}

export function toPublicTraceCertificate(cert: TraceCertificate): PublicTraceCertificate {
  return {
    certificateId: cert.certificateId,
    certificateNumber: cert.certificateNumber,
    lotId: cert.lotId,
    originCountry: cert.originCountry,
    certifiedQuantityKg: cert.certifiedQuantityKg,
    productionPeriod: cert.productionPeriod,
    issueDate: cert.issueDate,
    expiryDate: cert.expiryDate,
    status: cert.status,
    verificationStatus: cert.verificationStatus,
  };
}

/**
 * Public verifiable lineage view (sanitizes private farmer UID, internal review notes, etc.)
 */
export interface PublicCertificateLineage {
  certificate: PublicTraceCertificate;
  lot: {
    lotId: string;
    lotNumber: string;
    originCountry: "Cameroon";
    productionPeriod: string;
    qualityGrade?: string;
    cocoaImage: CloudinaryImageReference;
  };
  farm: {
    farmName: string;
    region?: string;
    cooperative?: string;
    eudrCompliant?: boolean;
  };
  production: {
    seasonYear: string;
    productionPeriod: string;
  };
}

export function toPublicCertificateLineage(lineage: CertificateLineage): PublicCertificateLineage {
  return {
    certificate: toPublicTraceCertificate(lineage.certificate),
    lot: {
      lotId: lineage.lot.lotId,
      lotNumber: lineage.lot.lotNumber,
      originCountry: lineage.lot.originCountry,
      productionPeriod: lineage.lot.productionPeriod,
      qualityGrade: lineage.lot.qualityGrade,
      cocoaImage: lineage.lot.cocoaImage,
    },
    farm: {
      farmName: lineage.farm.farmName,
      region: lineage.farm.region,
      cooperative: lineage.farm.cooperative,
      eudrCompliant: lineage.farm.eudrCompliant,
    },
    production: {
      seasonYear: lineage.production.seasonYear,
      productionPeriod: lineage.production.productionPeriod,
    },
  };
}
