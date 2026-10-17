import {
  WarehouseFacility,
  WarehouseProfile,
  WarehouseReceiptRecord,
  WarehouseFullTraceRequest,
  WarehouseExportCustomsRequest,
  WarehouseMembershipHistoryRecord,
} from "@/types/warehouse";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

/**
 * Strips undefined values to maintain strict Firestore compatibility
 */
function cleanData<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result[key] = cleanData(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * In-memory fallback and test harness repository.
 * Guarantees zero downtime, atomic capacity concurrency, and reliable test execution.
 */
class WarehouseMemoryStore {
  facilities: Map<string, WarehouseFacility> = new Map();
  profiles: Map<string, WarehouseProfile> = new Map();
  receipts: Map<string, WarehouseReceiptRecord> = new Map();
  receiptsByIdempotencyKey: Map<string, WarehouseReceiptRecord> = new Map();
  fullTraceRequests: Map<string, WarehouseFullTraceRequest> = new Map();
  customsRequests: Map<string, WarehouseExportCustomsRequest> = new Map();
  membershipHistory: WarehouseMembershipHistoryRecord[] = [];

  // Simple concurrency lock per warehouse to simulate Firestore transaction semantics
  private warehouseLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.seedDefaults();
  }

  async acquireLock(warehouseId: string): Promise<() => void> {
    while (this.warehouseLocks.has(warehouseId)) {
      await this.warehouseLocks.get(warehouseId);
    }
    let resolver: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    this.warehouseLocks.set(warehouseId, promise);
    return () => {
      this.warehouseLocks.delete(warehouseId);
      resolver();
    };
  }

  private seedDefaults() {
    // 1. Ikom Central Aggregation Warehouse
    const ikomWh: WarehouseFacility = {
      id: "wh_ikom_central",
      name: "Ikom Central Aggregation Warehouse",
      registrationNumber: "RC-WH-IKM-2026-001",
      ownerUserId: "usr_wh_mgr_ikom",
      facilityType: "central_aggregation",
      contactEmail: "ikom-depot@crossriver-cocoa.org",
      contactPhone: "+234 803 555 1234",
      location: {
        address: "Km 4 Ikom-Ogoja Commercial Expressway",
        city: "Ikom",
        lga: "Ikom",
        state: "Cross River State",
        country: "Nigeria",
        coordinates: { lat: 5.9603, lng: 8.7188 },
        operatingHours: "07:00 - 18:00 WAT",
        customsZone: "Cross River Central Corridor Free Zone",
      },
      maxCapacityKg: 5000000, // 5,000 tonnes
      currentStockKg: 1250000, // 1,250 tonnes
      availableCapacityKg: 3750000,
      maxCapacityTons: 5000,
      currentStockTons: 1250,
      utilizationPercentage: 25,
      totalBagsStored: Math.ceil(1250000 / 64),
      operationalStatus: "operational",
      adminControlledStatus: "active",
      acceptedCertificates: [
        "EUDR Origine Cameroun",
        "Cross River Trace",
        "Federal Nigerian Customs Export",
      ],
      members: [
        {
          id: "mem_wh_01",
          userId: "usr_wh_mgr_ikom",
          name: "Godwin Bassey",
          email: "godwin.bassey@crossriver-cocoa.org",
          phone: "+234 803 555 1234",
          role: "warehouse_manager",
          status: "active",
          joinedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "mem_wh_02",
          userId: "usr_wh_officer_ikom",
          name: "Blessing Effiom",
          email: "blessing.effiom@crossriver-cocoa.org",
          phone: "+234 802 888 9911",
          role: "intake_officer",
          status: "active",
          joinedAt: "2026-01-05T00:00:00.000Z",
        },
      ],
      memberCount: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.facilities.set(ikomWh.id, ikomWh);

    // 2. Etung Transit & Inspection Terminal
    const etungWh: WarehouseFacility = {
      id: "wh_etung_border",
      name: "Etung Transit & Inspection Terminal",
      registrationNumber: "RC-WH-ETG-2026-002",
      ownerUserId: "usr_wh_mgr_etung",
      facilityType: "transit_terminal",
      contactEmail: "etung-terminal@crossriver-cocoa.org",
      contactPhone: "+234 803 666 4321",
      location: {
        address: "Border Transit Station, Mfum Road",
        city: "Etung",
        lga: "Etung",
        state: "Cross River State",
        country: "Nigeria",
        coordinates: { lat: 5.8924, lng: 8.8412 },
        operatingHours: "06:00 - 20:00 WAT",
        customsZone: "Mfum Border Transit Depot",
      },
      maxCapacityKg: 2500000, // 2,500 tonnes
      currentStockKg: 450000,
      availableCapacityKg: 2050000,
      maxCapacityTons: 2500,
      currentStockTons: 450,
      utilizationPercentage: 18,
      totalBagsStored: Math.ceil(450000 / 64),
      operationalStatus: "operational",
      adminControlledStatus: "active",
      acceptedCertificates: ["EUDR Origine Cameroun"],
      members: [
        {
          id: "mem_wh_etg_01",
          userId: "usr_wh_mgr_etung",
          name: "Dominic Ojong",
          email: "dominic.ojong@crossriver-cocoa.org",
          phone: "+234 803 666 4321",
          role: "warehouse_manager",
          status: "active",
          joinedAt: "2026-01-10T00:00:00.000Z",
        },
      ],
      memberCount: 1,
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    };
    this.facilities.set(etungWh.id, etungWh);

    // 3. Calabar Port Maritime Export Facility
    const calabarWh: WarehouseFacility = {
      id: "wh_calabar_port",
      name: "Calabar Port Maritime Export Facility",
      registrationNumber: "RC-WH-CAL-2026-003",
      ownerUserId: "usr_wh_mgr_calabar",
      facilityType: "port_export_facility",
      contactEmail: "port-facility@crossriver-cocoa.org",
      contactPhone: "+234 803 777 6543",
      location: {
        address: "Calabar Free Trade Zone Port Complex, Berth 4",
        city: "Calabar",
        lga: "Calabar Municipal",
        state: "Cross River State",
        country: "Nigeria",
        coordinates: { lat: 4.9757, lng: 8.3417 },
        operatingHours: "24 Hours (Port Operations)",
        customsZone: "Nigerian Ports Authority Export Terminal",
      },
      maxCapacityKg: 12000000, // 12,000 tonnes
      currentStockKg: 3200000,
      availableCapacityKg: 8800000,
      maxCapacityTons: 12000,
      currentStockTons: 3200,
      utilizationPercentage: 26.67,
      totalBagsStored: Math.ceil(3200000 / 64),
      operationalStatus: "operational",
      adminControlledStatus: "active",
      acceptedCertificates: [
        "Federal Nigerian Customs Export",
        "EUDR Final",
        "Cross River Trace",
      ],
      members: [
        {
          id: "mem_wh_cal_01",
          userId: "usr_wh_mgr_calabar",
          name: "Captain Eyo Asuquo",
          email: "eyo.asuquo@crossriver-cocoa.org",
          phone: "+234 803 777 6543",
          role: "warehouse_manager",
          status: "active",
          joinedAt: "2026-01-15T00:00:00.000Z",
        },
      ],
      memberCount: 1,
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    this.facilities.set(calabarWh.id, calabarWh);

    // 4. Seed Default Profile for Godwin Bassey
    const defaultProfile: WarehouseProfile = {
      id: "wh_usr_ikom_mgr",
      userId: "usr_wh_mgr_ikom",
      warehouseId: "wh_ikom_central",
      warehouseName: "Ikom Central Aggregation Warehouse",
      fullName: "Godwin Bassey",
      email: "godwin.bassey@crossriver-cocoa.org",
      phone: "+234 803 555 1234",
      roleInWarehouse: "warehouse_manager",
      accountType: "organizational",
      staffBadgeNumber: "WH-IKM-001",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.profiles.set(defaultProfile.id, defaultProfile);
    this.profiles.set(defaultProfile.userId, defaultProfile);

    // 5. Seed Initial Receipt Record
    const defaultReceipt: WarehouseReceiptRecord = {
      id: "rcpt_wh_init_001",
      receiptNumber: "RCPT-IKOM-2026-0001",
      warehouseId: "wh_ikom_central",
      warehouseName: "Ikom Central Aggregation Warehouse",
      sourceType: "agent_manifest",
      sourceReferenceId: "manifest_agt_cr_001",
      sourceBatchCode: "MAN-CR-2026-001",
      traceCertificateNumber: "CERT-AGT-AGG-24091",
      senderId: "agent_cr_001",
      senderName: "Emmanuel Etim",
      quantityKg: 25000,
      bagCount: 391,
      qualityGrade: "Grade 1",
      moistureContentPercent: 7.2,
      eudrCompliant: true,
      receivedByOfficerId: "usr_wh_mgr_ikom",
      receivedByOfficerName: "Godwin Bassey",
      receivedAt: "2026-03-20T10:00:00.000Z",
      status: "received",
      notes: "First bulk aggregation manifest received into Ikom Bay 1.",
      idempotencyKey: "wh_ikom_central_agent_manifest_manifest_agt_cr_001",
    };
    this.receipts.set(defaultReceipt.id, defaultReceipt);
    this.receiptsByIdempotencyKey.set(
      defaultReceipt.idempotencyKey,
      defaultReceipt
    );
  }
}

const memoryStore = new WarehouseMemoryStore();

export class WarehouseStore {
  // ==========================================
  // 1. WAREHOUSE FACILITIES
  // ==========================================

  async getFacility(warehouseId: string): Promise<WarehouseFacility | null> {
    try {
      const snap = await getDoc(doc(db, "warehouse_facilities", warehouseId));
      if (snap.exists()) {
        const data = snap.data() as WarehouseFacility;
        memoryStore.facilities.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.facilities.get(warehouseId) || null;
  }

  async saveFacility(facility: WarehouseFacility): Promise<WarehouseFacility> {
    memoryStore.facilities.set(facility.id, facility);
    try {
      await setDoc(
        doc(db, "warehouse_facilities", facility.id),
        cleanData(facility as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for warehouse_facilities:", err);
    }
    return facility;
  }

  async updateFacility(
    warehouseId: string,
    updates: Partial<WarehouseFacility>
  ): Promise<WarehouseFacility | null> {
    const existing = await this.getFacility(warehouseId);
    if (!existing) return null;

    const updated: WarehouseFacility = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.facilities.set(warehouseId, updated);

    try {
      await updateDoc(
        doc(db, "warehouse_facilities", warehouseId),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for warehouse_facilities:", err);
    }
    return updated;
  }

  async listFacilities(): Promise<WarehouseFacility[]> {
    return Array.from(memoryStore.facilities.values());
  }

  // ==========================================
  // 2. ATOMIC CAPACITY & STOCK MUTATION (TRANSACTION LOCK)
  // ==========================================

  /**
   * Atomically mutates currentStockKg with strict capacity checks.
   * Concurrent receipts cannot exceed maxCapacityKg.
   */
  async mutateStockAtomic(
    warehouseId: string,
    deltaKg: number,
    enforceMaxCapacity = true
  ): Promise<WarehouseFacility> {
    const releaseLock = await memoryStore.acquireLock(warehouseId);
    try {
      const facility = await this.getFacility(warehouseId);
      if (!facility) {
        throw new Error(`Warehouse facility not found: ${warehouseId}`);
      }

      const newStockKg = facility.currentStockKg + deltaKg;

      if (newStockKg < 0) {
        throw new Error(
          `STOCK_UNDERFLOW: Proposed stock change (${deltaKg} kg) would result in negative stock (${newStockKg} kg).`
        );
      }

      if (enforceMaxCapacity && newStockKg > facility.maxCapacityKg) {
        throw new Error(
          `RECEIPT_EXCEEDS_CAPACITY: Receipt of ${deltaKg} kg exceeds available warehouse capacity of ${facility.availableCapacityKg} kg (maximum capacity: ${facility.maxCapacityKg} kg, current stock: ${facility.currentStockKg} kg). Receipt rejected.`
        );
      }

      const availableCapacityKg = facility.maxCapacityKg - newStockKg;
      const currentStockTons = Math.round((newStockKg / 1000) * 100) / 100;
      const utilizationPercentage =
        Math.round((newStockKg / facility.maxCapacityKg) * 10000) / 100;
      const totalBagsStored = Math.ceil(newStockKg / 64);

      // Status updates based on utilization
      let operationalStatus = facility.operationalStatus;
      if (operationalStatus === "operational" && newStockKg >= facility.maxCapacityKg) {
        operationalStatus = "at_capacity";
      } else if (operationalStatus === "at_capacity" && newStockKg < facility.maxCapacityKg) {
        operationalStatus = "operational";
      }

      const updated = await this.updateFacility(warehouseId, {
        currentStockKg: newStockKg,
        availableCapacityKg,
        currentStockTons,
        utilizationPercentage,
        totalBagsStored,
        operationalStatus,
      });

      return updated!;
    } finally {
      releaseLock();
    }
  }

  // ==========================================
  // 3. PROFILES
  // ==========================================

  async getProfile(idOrUserId: string): Promise<WarehouseProfile | null> {
    try {
      const snap = await getDoc(doc(db, "warehouse_profiles", idOrUserId));
      if (snap.exists()) {
        const data = snap.data() as WarehouseProfile;
        memoryStore.profiles.set(data.id, data);
        memoryStore.profiles.set(data.userId, data);
        return data;
      }
    } catch {
      // Fallback
    }

    return (
      memoryStore.profiles.get(idOrUserId) ||
      Array.from(memoryStore.profiles.values()).find(
        (p) => p.id === idOrUserId || p.userId === idOrUserId
      ) ||
      null
    );
  }

  async saveProfile(profile: WarehouseProfile): Promise<WarehouseProfile> {
    memoryStore.profiles.set(profile.id, profile);
    memoryStore.profiles.set(profile.userId, profile);
    try {
      await setDoc(
        doc(db, "warehouse_profiles", profile.id),
        cleanData(profile as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for warehouse_profiles:", err);
    }
    return profile;
  }

  async updateProfile(
    profileId: string,
    updates: Partial<WarehouseProfile>
  ): Promise<WarehouseProfile | null> {
    const existing = await this.getProfile(profileId);
    if (!existing) return null;

    const updated: WarehouseProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.profiles.set(updated.id, updated);
    memoryStore.profiles.set(updated.userId, updated);

    try {
      await updateDoc(
        doc(db, "warehouse_profiles", updated.id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for warehouse_profiles:", err);
    }
    return updated;
  }

  // ==========================================
  // 4. APPEND-ONLY RECEIPT LEDGER
  // ==========================================

  async getReceiptByIdempotencyKey(key: string): Promise<WarehouseReceiptRecord | null> {
    return memoryStore.receiptsByIdempotencyKey.get(key) || null;
  }

  async getReceipt(id: string): Promise<WarehouseReceiptRecord | null> {
    try {
      const snap = await getDoc(doc(db, "warehouse_receipts", id));
      if (snap.exists()) {
        const data = snap.data() as WarehouseReceiptRecord;
        memoryStore.receipts.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.receipts.get(id) || null;
  }

  async appendReceipt(receipt: WarehouseReceiptRecord): Promise<WarehouseReceiptRecord> {
    memoryStore.receipts.set(receipt.id, receipt);
    memoryStore.receiptsByIdempotencyKey.set(receipt.idempotencyKey, receipt);
    try {
      await setDoc(
        doc(db, "warehouse_receipts", receipt.id),
        cleanData(receipt as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for warehouse_receipts:", err);
    }
    return receipt;
  }

  async listReceiptsByWarehouse(
    warehouseId: string,
    limitCount = 50
  ): Promise<WarehouseReceiptRecord[]> {
    const list = Array.from(memoryStore.receipts.values())
      .filter((r) => r.warehouseId === warehouseId)
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    return list.slice(0, limitCount);
  }

  // ==========================================
  // 5. CROSS RIVER STATE FULL TRACE REQUESTS
  // ==========================================

  async saveFullTraceRequest(
    request: WarehouseFullTraceRequest
  ): Promise<WarehouseFullTraceRequest> {
    memoryStore.fullTraceRequests.set(request.id, request);
    try {
      await setDoc(
        doc(db, "warehouse_full_trace_requests", request.id),
        cleanData(request as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for warehouse_full_trace_requests:", err);
    }
    return request;
  }

  async getFullTraceRequest(id: string): Promise<WarehouseFullTraceRequest | null> {
    try {
      const snap = await getDoc(doc(db, "warehouse_full_trace_requests", id));
      if (snap.exists()) {
        const data = snap.data() as WarehouseFullTraceRequest;
        memoryStore.fullTraceRequests.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.fullTraceRequests.get(id) || null;
  }

  async updateFullTraceRequest(
    id: string,
    updates: Partial<WarehouseFullTraceRequest>
  ): Promise<WarehouseFullTraceRequest | null> {
    const existing = await this.getFullTraceRequest(id);
    if (!existing) return null;

    const updated: WarehouseFullTraceRequest = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.fullTraceRequests.set(id, updated);
    try {
      await updateDoc(
        doc(db, "warehouse_full_trace_requests", id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore update notice for warehouse_full_trace_requests:", err);
    }
    return updated;
  }

  async listFullTraceRequests(warehouseId: string): Promise<WarehouseFullTraceRequest[]> {
    return Array.from(memoryStore.fullTraceRequests.values()).filter(
      (r) => r.warehouseId === warehouseId
    );
  }

  // ==========================================
  // 6. CUSTOMS EXPORT CLEARANCE REQUESTS
  // ==========================================

  async saveCustomsRequest(
    request: WarehouseExportCustomsRequest
  ): Promise<WarehouseExportCustomsRequest> {
    memoryStore.customsRequests.set(request.id, request);
    try {
      await setDoc(
        doc(db, "warehouse_customs_requests", request.id),
        cleanData(request as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for warehouse_customs_requests:", err);
    }
    return request;
  }

  async listCustomsRequests(warehouseId: string): Promise<WarehouseExportCustomsRequest[]> {
    return Array.from(memoryStore.customsRequests.values()).filter(
      (r) => r.warehouseId === warehouseId
    );
  }

  // ==========================================
  // 7. MEMBERSHIP AUDIT HISTORY
  // ==========================================

  async appendMembershipHistory(
    record: WarehouseMembershipHistoryRecord
  ): Promise<WarehouseMembershipHistoryRecord> {
    memoryStore.membershipHistory.unshift(record);
    try {
      await setDoc(
        doc(db, "warehouse_membership_history", record.id),
        cleanData(record as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore save notice for warehouse_membership_history:", err);
    }
    return record;
  }

  async getMembershipHistory(
    warehouseId: string
  ): Promise<WarehouseMembershipHistoryRecord[]> {
    return memoryStore.membershipHistory.filter((h) => h.warehouseId === warehouseId);
  }
}

export const warehouseStore = new WarehouseStore();
