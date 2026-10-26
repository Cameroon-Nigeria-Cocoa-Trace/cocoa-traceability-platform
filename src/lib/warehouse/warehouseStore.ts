import {
  WarehouseFacility,
  WarehouseOrganization,
  WarehouseReceiptRecord,
  CrossRiverStateTraceCertificateRequest,
} from "@/types/warehouse";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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

class WarehouseMemoryStore {
  facilities: Map<string, WarehouseFacility> = new Map();
  organizations: Map<string, WarehouseOrganization> = new Map();
  receipts: WarehouseReceiptRecord[] = [];
  crsRequests: Map<string, CrossRiverStateTraceCertificateRequest> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    const defaultOrg: WarehouseOrganization = {
      id: "org_wh_crossriver_bonded",
      name: "Cross River State Maritime & Inland Cocoa Terminal Ltd",
      registrationNumber: "RC-WH-CR-2026-081",
      customsBondedWarehouseCode: "NCS-BOND-CR-0012",
      headquartersAddress: "Free Trade Zone Expressway, Calabar",
      contactEmail: "terminal-ops@cr-cocoaterminal.com",
      contactPhone: "+234 803 777 6543",
      facilities: ["wh_calabar_port"],
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.organizations.set(defaultOrg.id, defaultOrg);

    const defaultFacility: WarehouseFacility = {
      id: "wh_calabar_port",
      organizationId: "org_wh_crossriver_bonded",
      name: "Calabar Port Maritime Export Facility",
      licenseNumber: "NCS-WH-CAL-2026-01",
      location: {
        address: "Berth 4, Calabar Free Trade Zone Port Complex",
        cityOrLGA: "Calabar South",
        stateOrRegion: "Cross River State",
        country: "Nigeria",
        latitude: 4.9757,
        longitude: 8.3417,
        operatingHours: "06:00 - 20:00 WAT",
      },
      capacityKg: 500000, // 500 metric tonnes
      capacityBags: Math.floor(500000 / 64),
      currentStockKg: 150000,
      currentStockBags: Math.floor(150000 / 64),
      availableCapacityKg: 350000,
      operationalStatus: "operational",
      adminStatus: "active",
      managerUserId: "usr_wh_mgr_01",
      contactEmail: "calabar-facility@cr-cocoaterminal.com",
      contactPhone: "+234 803 777 6543",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    this.facilities.set(defaultFacility.id, defaultFacility);
    this.facilities.set(defaultFacility.managerUserId, defaultFacility);
  }
}

const memoryStore = new WarehouseMemoryStore();

export class WarehouseStore {
  // Facilities
  async getFacility(idOrManagerUid: string): Promise<WarehouseFacility | null> {
    try {
      const snap = await getDoc(doc(db, "warehouse_facilities", idOrManagerUid));
      if (snap.exists()) {
        const data = snap.data() as WarehouseFacility;
        memoryStore.facilities.set(data.id, data);
        memoryStore.facilities.set(data.managerUserId, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return (
      memoryStore.facilities.get(idOrManagerUid) ||
      Array.from(memoryStore.facilities.values()).find(
        (f) => f.id === idOrManagerUid || f.managerUserId === idOrManagerUid
      ) ||
      null
    );
  }

  async saveFacility(facility: WarehouseFacility): Promise<WarehouseFacility> {
    memoryStore.facilities.set(facility.id, facility);
    memoryStore.facilities.set(facility.managerUserId, facility);
    try {
      await setDoc(
        doc(db, "warehouse_facilities", facility.id),
        cleanData(facility as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving warehouse_facility:", err);
    }
    return facility;
  }

  async updateFacility(
    facilityId: string,
    updates: Partial<WarehouseFacility>
  ): Promise<WarehouseFacility | null> {
    const existing = await this.getFacility(facilityId);
    if (!existing) return null;

    const updated: WarehouseFacility = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    memoryStore.facilities.set(updated.id, updated);
    memoryStore.facilities.set(updated.managerUserId, updated);

    try {
      await updateDoc(
        doc(db, "warehouse_facilities", updated.id),
        cleanData({ ...updates, updatedAt: updated.updatedAt } as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice updating warehouse_facility:", err);
    }
    return updated;
  }

  // Organizations
  async getOrganization(orgId: string): Promise<WarehouseOrganization | null> {
    try {
      const snap = await getDoc(doc(db, "warehouse_organizations", orgId));
      if (snap.exists()) {
        const data = snap.data() as WarehouseOrganization;
        memoryStore.organizations.set(data.id, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return memoryStore.organizations.get(orgId) || null;
  }

  async saveOrganization(org: WarehouseOrganization): Promise<WarehouseOrganization> {
    memoryStore.organizations.set(org.id, org);
    try {
      await setDoc(
        doc(db, "warehouse_organizations", org.id),
        cleanData(org as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving warehouse_organization:", err);
    }
    return org;
  }

  // Receipts
  async appendReceipt(receipt: WarehouseReceiptRecord): Promise<WarehouseReceiptRecord> {
    memoryStore.receipts.unshift(receipt);
    try {
      await setDoc(
        doc(db, "warehouse_receipts", receipt.id),
        cleanData(receipt as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving warehouse_receipt:", err);
    }
    return receipt;
  }

  async listReceipts(facilityId: string): Promise<WarehouseReceiptRecord[]> {
    return memoryStore.receipts.filter((r) => r.facilityId === facilityId);
  }

  // Cross River State Full Trace Requests
  async saveCrsRequest(
    request: CrossRiverStateTraceCertificateRequest
  ): Promise<CrossRiverStateTraceCertificateRequest> {
    memoryStore.crsRequests.set(request.id, request);
    try {
      await setDoc(
        doc(db, "warehouse_crs_requests", request.id),
        cleanData(request as unknown as Record<string, unknown>)
      );
    } catch (err) {
      console.warn("Firestore notice saving warehouse_crs_requests:", err);
    }
    return request;
  }

  async listCrsRequests(facilityId: string): Promise<CrossRiverStateTraceCertificateRequest[]> {
    return Array.from(memoryStore.crsRequests.values()).filter((r) => r.facilityId === facilityId);
  }
}

export const warehouseStore = new WarehouseStore();
