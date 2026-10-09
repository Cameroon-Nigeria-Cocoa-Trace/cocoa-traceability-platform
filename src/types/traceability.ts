/**
 * Core Role 3 Domain Types and Data Contracts
 * Cocoa Traceability, Certificate & Cross-Border Export Platform
 *
 * CONFIRMED BUSINESS RULES ENFORCED:
 * 1. Farmer -> Cooperative = FREE certificate-transfer fee.
 * 2. Agent -> Warehouse = FREE certificate-transfer fee.
 * 3. Farmer -> Agent = CHARGED certificate-transfer fee.
 * 4. Farmer -> Cooperative -> Agent = CHARGED certificate-transfer fee.
 * 5. Farmer -> Warehouse = fee treatment NOT YET CONFIRMED (PENDING_BUSINESS_CONFIRMATION).
 * 6. Cooperative -> Warehouse = fee treatment NOT YET CONFIRMED (PENDING_BUSINESS_CONFIRMATION).
 * 7. Partial certificate transfers are allowed and must preserve quantity integrity.
 * 8. Historical certificate, holding, transfer, and trade records must never be overwritten or deleted.
 * 9. A cocoa lot MUST exist before an Origin Trace Certificate application can be submitted.
 * 10. A cocoa lot image is MANDATORY, stored as a Cloudinary metadata reference (no binary data in Firestore).
 * 11. Marketplace listing REQUIRES a valid Trace Certificate.
 * 12. On-platform marketplace purchase has a 2% platform service fee on the purchase price.
 * 13. Firebase UID is used as userId (userId = firebaseUID) across all actor and transaction references.
 *
 * NOTE ON STATUSES & LIFECYCLE STATES:
 * Enums and lifecycle states below use open, extensible string types. They represent technical
 * design proposals and must not be treated as restrictive, unconfirmed business mandates.
 */

// ============================================================================
// 1. CLOUDINARY ASSET REFERENCE (CONFIRMED ARCHITECTURE)
// ============================================================================

/**
 * Cloudinary asset metadata reference.
 * Firestore stores only structured metadata; image binaries remain on Cloudinary.
 */
export interface CloudinaryImageReference {
  publicId: string;
  url: string;
  secureUrl: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  resourceType?: string;
  createdAt?: string;
}

// ============================================================================
// 2. PLATFORM ACTORS & CERTIFICATE HOLDERS
// ============================================================================

/**
 * Eligible certificate holder types participating in transfer routes.
 * Note: 'buyer' is an action/transaction role, not a separate platform actor account.
 * No synthetic 'exporter' role is introduced.
 */
export type CertificateHolderType =
  | "farmer"
  | "cooperative"
  | "agent"
  | "warehouse"
  | (string & {});

// ============================================================================
// 3. PRODUCTION & HARVEST RECORDS
// ============================================================================

export type ProductionStatus = "active" | "completed" | (string & {});

export interface ProductionRecord {
  productionRecordId: string;
  farmId: string; // References registered Cameroon farm plot
  seasonYear: string; // e.g. "2024/2025"
  productionPeriod: string; // e.g. "Main Crop 2024-2025" or "Mid Crop"
  startDate: string; // ISO Date (YYYY-MM-DD)
  endDate?: string; // ISO Date (YYYY-MM-DD)
  status: ProductionStatus;
  estimatedQuantityKg?: number; // Optional estimated or target production volume in kg (not a hard upper limit)
  actualQuantityKg?: number; // Cumulative actual harvested weight in kg (distinct from estimated)
  expectedNumberOfHarvests?: number; // Planned/expected harvest events in this season
  numberOfHarvests?: number; // Actual number of harvest events logged for this production record
  notes?: string;
  createdBy: string; // Firebase UID
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

export type HarvestStatus = "logged" | "allocated_to_lot" | (string & {});
export type CocoaQualityGrade = "Grade 1" | "Grade 2" | "Sub-standard" | (string & {});

export interface Harvest {
  harvestId: string;
  productionRecordId: string; // Links to parent production season
  farmId: string; // Links to registered Cameroon farm
  harvestDate: string; // ISO Date (YYYY-MM-DD)
  quantityKg: number;
  allocatedQuantityKg?: number; // Cumulative quantity allocated to Cocoa Lots (preserves quantity integrity)
  availableQuantityKg?: number; // Remaining unallocated harvest quantity (quantityKg - allocatedQuantityKg)
  qualityGrade?: CocoaQualityGrade;
  status: HarvestStatus;
  notes?: string;
  createdBy: string; // Firebase UID
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

// ============================================================================
// 4. COCOA LOT (MANDATORY IMAGE & UPSTREAM ANCHOR)
// ============================================================================

export type CocoaLotStatus =
  | "created"
  | "certified"
  | "partially_certified"
  | "in_marketplace"
  | "transferred"
  | "depleted"
  | (string & {});

export interface CocoaLot {
  lotId: string;
  lotNumber: string; // Identifiable traceable lot number
  farmId: string; // Upstream Cameroon farm
  productionRecordId: string; // Upstream production record
  harvestId: string; // Upstream harvest event
  originCountry: "Cameroon"; // Locked country of origin
  productionPeriod: string; // Production period/season
  productionDate: string; // Date of production / harvest
  quantityKg: number; // Initial total quantity
  availableQuantityKg: number; // Unallocated / available quantity
  certifiedQuantityKg?: number; // Cumulative certified quantity (sum of issued trace certificates <= quantityKg)
  pricePerKg: number; // Current base / reference listing price
  currency: string; // e.g. "USD", "XAF"
  qualityGrade?: CocoaQualityGrade;
  cocoaImage: CloudinaryImageReference; // REQUIRED: Approved Cloudinary metadata
  lotStatus: CocoaLotStatus;
  createdBy: string; // Firebase UID
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

// ============================================================================
// 5. ORIGIN TRACE CERTIFICATE & APPLICATIONS
// ============================================================================

export type CertificateApplicationStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | (string & {});

export interface CertificateApplication {
  applicationId: string;
  applicationNumber: string;
  lotId: string; // CONFIRMED RULE: Cocoa lot MUST exist before application can be created
  farmId: string;
  applicantId: string; // Entity ID of applicant (Farmer Firebase UID, or Cooperative organization ID)
  applicantType: CertificateHolderType;
  appliedBy?: string; // Firebase UID of the authenticated person submitting the application
  requestedQuantityKg: number;
  originCountry: "Cameroon";
  productionPeriod: string;
  status: CertificateApplicationStatus;
  rejectionReason?: string;
  reviewedBy?: string; // Firebase UID of the authenticated reviewer
  reviewedAt?: string;
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

/**
 * Parent TraceCertificate lifecycle status:
 * - "active": Root certificate is active and in its initial single holding (no downstream transfers yet).
 * - "partially_transferred": Transferred cocoa has begun circulating across supply chain holdings;
 *   certified quantities now exist across one or more downstream holdings (e.g. Farmer + Cooperative, or Cooperative + Agent).
 *   The parent certificate remains in this active operational state while holdings are active.
 * - "fully_transferred": Reserved for when the full certified batch reaches terminal cross-border / export lifecycle state.
 *   CRITICAL INTEGRITY RULE: Do NOT equate "source holding available balance == 0" with "certificate status == fully_transferred".
 *   The full certified batch continues to exist and circulate across other active downstream holdings.
 *   The exact terminal trigger for "fully_transferred" is an OPEN BUSINESS DECISION pending cross-border/customs rules.
 * - "expired": Certificate validity period expired.
 */
export type CertificateStatus =
  | "active"
  | "partially_transferred"
  | "fully_transferred"
  | "expired"
  | (string & {});

export type CertificateVerificationStatus =
  | "verified"
  | "pending"
  | (string & {});

export interface TraceCertificate {
  certificateId: string;
  certificateNumber: string;
  applicationId: string; // Approved CertificateApplication reference ensuring full upstream traceability
  lotId: string; // Backing cocoa lot
  farmId: string; // Origin farm
  holderId?: string; // Entity ID of current/root certificate holder (Farmer Firebase UID, Cooperative ID, etc.)
  holderType?: CertificateHolderType; // Classification of holding entity: "farmer" | "cooperative" | "agent" | "warehouse"
  originCountry: "Cameroon";
  certifiedQuantityKg: number;
  productionPeriod: string;
  issueDate: string;
  expiryDate?: string;
  status: CertificateStatus;
  verificationStatus: CertificateVerificationStatus;
  createdBy: string; // Firebase UID of the authenticated issuing officer
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

// ============================================================================
// 6. CERTIFICATE HOLDING (PARTIAL TRANSFERS ARCHITECTURE)
// ============================================================================

/**
 * CertificateHolding status represents the current lifecycle state of a specific holding balance:
 * - "active": Active holding with balance available; no outbound transfers executed from this holding yet.
 * - "partially_transferred": Holding from which partial quantity was transferred out, but remaining available balance is > 0.
 * - "depleted": Fully depleted holding whose available balance reached 0 (all held cocoa was transferred out).
 *   IMPORTANT: Depleted holdings are preserved permanently in Firestore for historical chain-of-custody and traceability. NEVER deleted!
 * - "archived": Historical or deactivated holding.
 *
 * NOTE: The raw value "transferred" is NOT used as a CertificateHoldingStatus to avoid ambiguity with depleted vs active holdings.
 */
export type CertificateHoldingStatus =
  | "active"
  | "partially_transferred"
  | "depleted"
  | "archived"
  | (string & {});

/**
 * CertificateHolding represents a DISTINCT CUSTODY UNIT of certified cocoa.
 *
 * IMMUTABLE CUSTODY UNIT RULES:
 * - Every CertificateHolding has a permanent unique holdingId.
 * - Holdings MUST NEVER be merged simply because they share the same certificateId, lotId, or holderId.
 * - Every completed certificate transfer creates a fresh, distinct destination holding.
 * - sourceTransferId links directly to the specific CertificateTransfer that birthed this holding.
 * - The permanent holdingId is the custody & provenance anchor for subsequent QR package allocations.
 */
export interface CertificateHolding {
  holdingId: string; // Permanent unique holding ID (immutable throughout lifecycle)
  certificateId: string; // Permanent reference to parent TraceCertificate
  certificateNumber: string;
  lotId: string; // Backing CocoaLot reference
  farmId: string; // Origin farm reference
  holderId: string; // Holding entity ID (Farmer Firebase UID, or Cooperative/Agent/Warehouse entity ID)
  holderType: CertificateHolderType;
  quantityKg: number; // Certified quantity held in this specific holding unit
  availableQuantityKg: number; // Quantity available for subsequent transfer / listing
  parentHoldingId?: string; // The source holding from which this holding branched (undefined for root initial holding)
  sourceTransferId?: string; // The exact CertificateTransfer record that created this holding unit
  sourceTransferIds?: string[]; // Legacy/compatibility field (new transfers use distinct holding units)
  status: CertificateHoldingStatus;
  createdBy?: string; // Firebase UID of authenticated actor who initialized this holding
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

/**
 * Summary record of an upstream entity who previously held certified cocoa leading to a holding.
 */
export interface UpstreamHolderSummary {
  holderId: string;
  holderType: CertificateHolderType;
  holdingId: string;
  transferredQuantityKg: number;
  transferredAt: string; // ISO 8601 Timestamp
}

/**
 * Structured holding trace history resolving complete provenance for a specific holdingId.
 * Serves as the traceability anchor for subsequent QR package allocations in Step 7.
 */
export interface CertificateHoldingTraceHistory {
  holdingId: string;
  certificateId: string;
  certificateNumber: string;
  lotId: string;
  farmId: string;
  holderId: string;
  holderType: CertificateHolderType;
  currentQuantityKg: number;
  availableQuantityKg: number;
  status: CertificateHoldingStatus;
  incomingTransfers: CertificateTransfer[];
  outgoingTransfers: CertificateTransfer[];
  upstreamHoldings: CertificateHolding[];
  upstreamHolders: UpstreamHolderSummary[];
  upstreamTransfers: CertificateTransfer[];
  chronologicalTransferSequence: CertificateTransfer[];
  originalHoldingId: string;
  originalHolderId: string;
  originalHolderType: CertificateHolderType;
  resolvedAt: string; // ISO 8601 Timestamp
}

// ============================================================================
// 7. CERTIFICATE TRANSFERS & ROUTE POLICIES
// ============================================================================

/**
 * Strictly supported certificate transfer routes.
 * No unsupported routes are permitted.
 */
export type SupportedTransferRoute =
  | "Farmer -> Cooperative"
  | "Farmer -> Agent"
  | "Farmer -> Warehouse"
  | "Cooperative -> Agent"
  | "Cooperative -> Warehouse"
  | "Agent -> Warehouse";

/**
 * Fee treatment policy indicator:
 * - EXEMPT: Confirmed 0 fee (Farmer -> Cooperative, Agent -> Warehouse)
 * - APPLIED: Confirmed fee applies (Farmer -> Agent, Cooperative -> Agent)
 * - PENDING_BUSINESS_CONFIRMATION: Unfinalized fee treatment (Farmer -> Warehouse, Cooperative -> Warehouse)
 */
export type TransferFeePolicy =
  | "EXEMPT"
  | "APPLIED"
  | "PENDING_BUSINESS_CONFIRMATION";

export type CertificateTransferStatus =
  | "initiated"
  | "completed"
  | "rejected"
  | "cancelled"
  | (string & {});

export interface CertificateTransfer {
  transferId: string;
  certificateId: string; // Parent TraceCertificate reference
  certificateNumber: string;
  lotId: string;
  sourceHoldingId: string;
  destinationHoldingId?: string;
  sourceHolderId: string; // Holding entity ID of sender (Farmer UID, Coop ID, Agent ID, Warehouse ID)
  sourceHolderType: CertificateHolderType;
  destinationHolderId: string; // Holding entity ID of recipient (Coop ID, Agent ID, Warehouse ID)
  destinationHolderType: CertificateHolderType;
  route: SupportedTransferRoute;
  quantityKg: number;
  isPartialTransfer: boolean;
  sourceRemainingQuantityKg: number;
  feeApplied: AppliedFeeRecord; // Historical fee snapshot permanently captured on record
  transferStatus: CertificateTransferStatus;
  transferredQrPackageIds?: string[]; // Specific physical QR packages transferred in package-aware transfer
  initiatedBy: string; // Firebase UID of authenticated person initiating the transfer
  completedBy?: string; // Firebase UID of authenticated person completing/accepting the transfer (if applicable)
  initiatedAt: string; // ISO 8601 Timestamp
  completedAt?: string; // ISO 8601 Timestamp
  rejectionReason?: string;
}

// ============================================================================
// 8. MARKETPLACE LISTING & ADJUSTMENTS (ROLE 3 SCOPE)
// ============================================================================

export type MarketplaceCertificationType = "certified" | "uncertified";
export type MarketplaceInventoryMode = "BULK" | "QR_PACKAGES";
export type MarketplaceListingStatus =
  | "available"
  | "under_negotiation"
  | "sold"
  | "cancelled"
  | "expired"
  | (string & {});

export interface PendingAccessIntent {
  paymentId: string;
  paymentReference: string; // Flutterwave tx_ref
  buyerUid: string;
  amountCharged: number;
  currency: "NGN";
  status: "initiating" | "pending" | "checkout_creation_uncertain";
  checkoutUrl?: string;
  createdAt: string;
  expiresAt: string; // ISO-8601 (15 minutes from creation)
}

export interface MarketplaceListing {
  listingId: string;
  listingNumber: string; // e.g. "LIST-CMR-2026-XXXXXX"

  // Entity vs. Authenticated Operator
  sellerHolderId: string; // Entity ID of the seller (Farmer UID, Cooperative Org ID, Agent Business ID, Warehouse ID)
  sellerHolderType: CertificateHolderType;
  createdByUid: string; // Firebase Auth UID of human operator creating the listing

  // Strict 1-to-1 Provenance Anchors
  certificationType: MarketplaceCertificationType;
  lotId: string; // Mandatory: Exactly 1 CocoaLot
  certificateId?: string; // Mandatory if certified; strictly prohibited if uncertified
  sourceHoldingId?: string; // Mandatory if certified; strictly prohibited if uncertified

  // Inventory Mode (Certified Only)
  inventoryMode?: MarketplaceInventoryMode; // "BULK" or "QR_PACKAGES"
  initialQrPackageIds?: string[]; // Immutable snapshot of all QR packages initially offered
  currentQrPackageIds?: string[]; // Transactionally updated remaining available package IDs

  // Commercial Parameters
  title: string;
  description?: string;
  quantityInitialKg: number; // Total initial offered quantity
  quantityAvailableKg: number; // Current remaining unpurchased quantity
  pricePerKg: number; // Reference unit price
  currency: string; // e.g. "XAF", "USD", "NGN"
  qualityGrade?: string;
  cocoaImage: CloudinaryImageReference; // Referenced from backing CocoaLot

  listingStatus: MarketplaceListingStatus;
  pendingAccessIntent?: PendingAccessIntent | null; // Step 9: 15-minute reservation lock for Seller Info Access

  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

export type PhysicalAdjustmentType =
  | "LOCAL_SALE" // Deducts physical uncertified cocoa sold off-platform
  | "INVENTORY_DAMAGE" // Deducts physical cocoa lost/damaged
  | "OTHER_PHYSICAL_DEDUCTION"; // Other approved physical deductions

export type NonConsumingAdjustmentType =
  | "NEGOTIATION_CANCELLED" // Status adjustment only (0 kg physical deduction)
  | "MANUAL_STATUS_CHANGE" // Status adjustment only (0 kg physical deduction)
  | "PRICE_UPDATE"; // Commercial adjustment only (0 kg physical deduction)

export interface CocoaLotAdjustment {
  adjustmentId: string;
  lotId: string;
  listingId?: string;
  sellerHolderId: string;
  recordedByUid: string; // Firebase Auth UID
  adjustmentType: PhysicalAdjustmentType | NonConsumingAdjustmentType | (string & {});
  isPhysicalDeduction: boolean; // True for physical deductions; false for non-consuming events
  deductedQuantityKg: number; // > 0 for physical deductions; 0 for status/non-consuming adjustments
  previousStatus?: string;
  newStatus?: string;
  previousQuantityKg?: number;
  newQuantityKg?: number;
  quantityDeltaKg?: number;
  reason: string;
  notes?: string;
  recordedAt: string; // ISO 8601 Timestamp
}

export interface SellerAccessRecord {
  accessId: string; // e.g. "SAR-LST-CMR-2026-XXXXXX-BUYERUID" or "acc_..."
  listingId: string;
  lotId?: string;
  buyerId: string; // Firebase UID (alias: buyerUid)
  buyerUid?: string; // Firebase UID
  sellerHolderId: string;
  sellerId?: string; // Firebase UID of seller
  paymentId?: string;
  paymentReference?: string;
  accessType?: "off_platform_negotiation" | "on_platform_purchase" | "flutterwave_seller_info_access" | (string & {});
  feePaid: number; // Snapshot of fee paid
  amountPaid?: number; // Snapshot of amount paid (NGN)
  currency: string;
  accessStatus: "active" | "expired" | "revoked" | (string & {});
  status?: "active" | "revoked";
  accessGrantedAt: string; // ISO 8601 Timestamp
  expiresAt?: string; // Optional configurable expiration
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// 9. TRADE RECORDS (SEPARATE FROM TRANSFER & PAYMENT)
// ============================================================================

export type TradeStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "failed"
  | (string & {});

export type TradePaymentChannel = "on_platform" | "off_platform";

export interface TradeRecord {
  tradeId: string;
  tradeNumber: string; // e.g. "TRD-CMR-2026-XXXXXX"
  listingId: string;
  certificationType: MarketplaceCertificationType;
  lotId: string;
  certificateId?: string;
  sourceHoldingId?: string;
  destHoldingId?: string;
  sellerId: string; // sellerHolderId
  sellerHolderId: string;
  sellerHolderType: CertificateHolderType;
  buyerId: string; // Firebase UID
  buyerHolderType?: CertificateHolderType;
  quantityKg: number;
  purchasedQrPackageIds?: string[]; // Specific discrete packages purchased in QR_PACKAGES mode
  negotiatedPricePerKg: number; // Actual negotiated transaction price
  totalAmount: number; // quantityKg * negotiatedPricePerKg
  currency: string;
  paymentChannel: TradePaymentChannel;
  paymentReference?: string; // Unique idempotency key / gateway payment reference
  tradeStatus: TradeStatus;
  platformFeeApplied?: AppliedFeeRecord; // CONFIRMED: 2% platform service fee on purchase price
  transferFeeApplied?: AppliedFeeRecord; // Preserved transfer fee if settled with cert transfer
  transferId?: string; // Associated CertificateTransfer ID if certified
  tradeDate: string; // ISO 8601 Timestamp
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
}

// ============================================================================
// 10. PAYMENT RECORDS (ROLE 3 SCOPE ONLY)
// ============================================================================

export type PaymentRecordType =
  | "marketplace_purchase"
  | "platform_service_fee"
  | "certificate_transfer_fee"
  | "seller_info_access"
  | "SELLER_INFORMATION_ACCESS"
  | (string & {});

export type PaymentMechanism =
  | "mtn_momo"
  | "remittance"
  | "off_platform_direct"
  | "flutterwave"
  | "FLUTTERWAVE"
  | (string & {});

export type PaymentStatus =
  | "initiating"                  // Local reservation created; Flutterwave checkout creation in-flight or awaiting recovery
  | "pending"                     // Flutterwave checkout/transaction exists and is awaiting successful payment
  | "checkout_creation_uncertain" // Network timeout during checkout creation; requires reconciliation before re-initiation
  | "checkout_creation_failed"    // Definitive gateway rejection or verified absent session; reservation released
  | "completed"                   // Verified by gateway and fulfilled in system
  | "paid_unfulfillable"          // Valid payment received at gateway, but local listing reservation expired/superseded
  | "amount_mismatch"             // Verified gateway amount !== PaymentRecord.amountCharged (strict exact equality violated)
  | "failed"                      // Gateway returned failed/cancelled status
  | "cancelled";                  // Buyer explicitly cancelled before completion

export type PaymentRecordStatus = PaymentStatus;

export interface PaymentRecord {
  paymentId: string;
  paymentReference: string; // Unique idempotency reference / Flutterwave tx_ref
  tradeId?: string;
  listingId?: string;
  lotId?: string;
  transferId?: string;
  payerId?: string; // Firebase UID
  payeeId?: string; // Firebase UID / Platform
  buyerUid?: string; // Firebase UID of payer
  sellerId?: string; // Firebase UID of seller
  paymentPurpose?: "SELLER_INFORMATION_ACCESS" | (string & {});
  paymentGateway?: "FLUTTERWAVE" | (string & {});
  amount?: number;
  currency: string; // e.g. "NGN", "XAF", "USD"
  paymentType?: PaymentRecordType;
  paymentMethod?: PaymentMechanism;
  paymentStatus: PaymentRecordStatus;

  // Step 9 Authoritative Fee Snapshot
  quantityAvailableKgSnapshot?: number;
  pricePerKgSnapshot?: number;
  listingTotalValueSnapshot?: number;
  mathematicalFee?: number;
  feePercentage?: number; // 0.005 for 0.5%
  amountCharged?: number; // Math.ceil(mathematicalFee) -> Integer NGN

  // Step 9 Gateway Metadata
  checkoutUrl?: string;
  gatewayTransactionId?: string; // Flutterwave transaction ID (data.id)
  flw_ref?: string; // Flutterwave internal reference
  gatewayResponseRaw?: Record<string, any>;
  statusReason?: string;
  expiresAt?: string; // ISO 8601 Timestamp (reservation window)

  externalTransactionReference?: string;
  paidAt?: string;
  completedAt?: string;
  createdAt: string; // ISO 8601 Timestamp
  updatedAt?: string; // ISO 8601 Timestamp
}

// ============================================================================
// 11. FEES & FEE CONFIGURATION
// ============================================================================

export type FeeType =
  | "marketplace_platform_fee"
  | "certificate_transfer_fee"
  | (string & {});

export type FeeStatus =
  | "assessed"
  | "waived"
  | "paid"
  | "pending_policy"
  | (string & {});

/**
 * Historical snapshot of fee assessed on a trade or transfer.
 * Preserved permanently without destructive mutation.
 */
export interface AppliedFeeRecord {
  feeId: string;
  feeType: FeeType;
  payerId: string; // Firebase UID
  ratePercentage?: number; // e.g. 2 for 2% marketplace platform fee
  flatRateAmount?: number;
  calculatedAmount: number;
  currency: string;
  isFeeExempt: boolean;
  policyStatus: TransferFeePolicy;
  feeStatus: FeeStatus;
  policyNotes?: string;
  assessedAt: string; // ISO 8601 Timestamp
}

/**
 * Dynamic fee configuration structure.
 * Separates confirmed zero-fee/charged rules from unconfirmed policy routes.
 */
export interface FeeConfiguration {
  marketplacePlatformFeePercent: number; // Confirmed: 2.0%
  transferFeeSchedule: {
    "Farmer -> Cooperative": { feeType: "exempt"; amount: 0 }; // Confirmed: FREE
    "Agent -> Warehouse": { feeType: "exempt"; amount: 0 }; // Confirmed: FREE
    "Farmer -> Agent": { feeType: "configurable"; defaultRatePerKg: number }; // Confirmed: CHARGED
    "Cooperative -> Agent": { feeType: "configurable"; defaultRatePerKg: number }; // Confirmed: CHARGED
    "Farmer -> Warehouse": { feeType: "tbd"; policyStatus: "PENDING_BUSINESS_CONFIRMATION" }; // Unfinalized: TBD
    "Cooperative -> Warehouse": { feeType: "tbd"; policyStatus: "PENDING_BUSINESS_CONFIRMATION" }; // Unfinalized: TBD
  };
  currency: string;
  lastUpdated: string;
}

// ============================================================================
// 12. QR CODE & QR SCAN TRACEABILITY
// ============================================================================

export type QRCodeStatus = "active" | "inactive" | "revoked" | (string & {});

export interface QRCode {
  qrId: string; // Permanent internal ID: qr_${lotId}_${sequenceNumber}
  qrValue: string; // Stable verification identifier / verification payload
  packageNumber: string; // Human-readable physical package identifier: ${lotNumber}-PKG-${sequence}
  sequenceNumber: number; // Monotonically increasing sequence within the lot (1, 2, 3...)

  // Strict Custody Identity Anchors
  generatedFromHoldingId: string; // IMMUTABLE: Holding where this bag was packaged
  currentHoldingId: string; // CURRENT CUSTODY: Mutates ONLY when transferred via package-aware CertificateTransfer

  // Domain References
  certificateId: string;
  certificateNumber: string;
  lotId: string;
  lotNumber: string;
  farmId: string;

  // Package Quantity (Permanently Immutable)
  representedQuantityKg: number; // Physical package quantity (e.g., 50 kg, 100 kg)
  qrGroupId?: string; // Optional batch grouping reference (e.g. GRP-2026-001)

  // Status and Lifecycle
  status: QRCodeStatus;
  generatedAt: string; // ISO 8601 Timestamp
  activatedAt?: string;
  deactivatedAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  returnedToBulk?: boolean; // Whether physical cocoa was explicitly returned to bulk upon revocation
  returnedToBulkAt?: string;
  returnedToBulkBy?: string;
  repackageNotes?: string;

  generatedBy: string; // Firebase UID of authenticated operator
  lastTransferId?: string; // CertificateTransfer ID that last moved this package
  lastTransferredAt?: string;
}

/**
 * Derived Packaging Accounting State for a specific CertificateHolding.
 * Enforces the unified zero-redundant-state formula:
 * allocatedPackageQuantityKg = SUM(qr.representedQuantityKg WHERE currentHoldingId === holdingId AND returnedToBulk !== true)
 * unpackagedQuantityKg = holding.availableQuantityKg - allocatedPackageQuantityKg
 */
export interface HoldingPackagingState {
  holdingId: string;
  totalHoldingQuantityKg: number;
  availableQuantityKg: number;
  allocatedPackageQuantityKg: number;
  unpackagedQuantityKg: number;
  activePackageCount: number;
  allocatedPackageCount: number;
}

export type ScannerType =
  | "public"
  | "authenticated"
  | (string & {});

export interface QRScan {
  scanId: string;
  qrId: string;
  qrValue: string;
  packageNumber?: string;
  lotId: string;
  certificateId?: string;
  currentHoldingId?: string;
  userId?: string; // Firebase UID if authenticated
  scannerType?: ScannerType;
  location?: {
    latitude: number;
    longitude: number;
    description?: string;
  };
  ipAddress?: string;
  userAgent?: string;
  scannedAt: string; // ISO 8601 Timestamp
}

/**
 * Publicly verifiable QR package traceability result.
 * Sanitized to strictly exclude Firebase UIDs, internal fee records, applicant details, and reviewer notes.
 */
export interface PublicQRTraceabilityResult {
  package: {
    packageNumber: string;
    packageQuantityKg: number;
    status: string;
    generatedAt: string;
    isPackagedAtOrigin: boolean;
  };
  quantities: {
    originalLotQuantityKg: number;
    certifiedQuantityKg: number;
    currentHoldingQuantityKg: number;
    thisPackageQuantityKg: number;
  };
  origin: {
    country: "Cameroon";
    farmName: string;
    region?: string;
    eudrCompliant?: boolean;
    lotNumber: string;
    productionPeriod: string;
    qualityGrade?: string;
    certificateNumber: string;
    issueDate: string;
    cocoaImage?: CloudinaryImageReference;
  };
  custodyChain: Array<{
    stepOrder: number;
    fromHolderPublicName: string;
    fromHolderType: string;
    toHolderPublicName: string;
    toHolderType: string;
    transferredQuantityKg: number;
    transferredAt: string;
  }>;
  current: {
    currentHolderPublicName: string;
    currentHolderType: string;
    currentHoldingStatus: string;
  };
  resolvedAt: string;
}

/**
 * Authorized internal QR traceability view including full internal audit references.
 */
export interface AuthorizedQRTraceabilityResult extends PublicQRTraceabilityResult {
  internal: {
    qrId: string;
    generatedFromHoldingId: string;
    currentHoldingId: string;
    lotId: string;
    certificateId: string;
    farmId: string;
    generatedBy: string;
    returnedToBulk?: boolean;
    lastTransferId?: string;
  };
}

// ============================================================================
// 13. COMPLETE TRACEABILITY LINEAGE TREE
// ============================================================================

export interface CompleteTraceabilityLineage {
  lot: CocoaLot;
  harvest: Harvest;
  production: ProductionRecord;
  originFarm: {
    farmId: string;
    farmName?: string;
    region?: string;
    geolocation?: string;
    country: "Cameroon";
  };
  primaryCertificate?: TraceCertificate;
  certificateHoldings: CertificateHolding[];
  transferHistory: CertificateTransfer[];
  qrCodes: QRCode[];
  recentScans: QRScan[];
}
