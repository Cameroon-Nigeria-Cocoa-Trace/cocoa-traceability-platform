import Dexie, { type Table } from "dexie";

export interface CanopyBreadcrumb {
  id?: number;
  farmId: string;
  lng: number;
  lat: number;
  accuracy?: number;
  timestamp: number;
}

export interface CachedGeofence {
  id?: number;
  farmId: string;
  farmName: string;
  polygon: [number, number][]; // [lng, lat][]
  areaHectares: number;
  pointCount: number;
  recordedAt: string;
  syncedToCloud: boolean;
}

export interface PendingFarmDraft {
  id?: number;
  draftId: string;
  farmerId: string;
  farmData: Record<string, unknown>;
  createdAt: string;
  status: "pending_validation" | "syncing" | "rejected";
  lastError?: string;
}

export class CocoaDatabase extends Dexie {
  breadcrumbs!: Table<CanopyBreadcrumb>;
  geofences!: Table<CachedGeofence>;
  pendingDrafts!: Table<PendingFarmDraft>;

  constructor() {
    super("CocoaFarmDatabase");
    this.version(1).stores({
      breadcrumbs: "++id, farmId, lng, lat, timestamp",
      geofences: "++id, farmId, farmName, recordedAt, syncedToCloud",
    });
    this.version(2).stores({
      breadcrumbs: "++id, farmId, lng, lat, timestamp",
      geofences: "++id, farmId, farmName, recordedAt, syncedToCloud",
      pendingDrafts: "++id, draftId, farmerId, createdAt, status",
    });
  }
}

export const cocoaDb = new CocoaDatabase();

export async function savePendingFarmDraft(
  draftId: string,
  farmerId: string,
  farmData: Record<string, unknown>
): Promise<void> {
  await cocoaDb.pendingDrafts.put({
    draftId,
    farmerId,
    farmData,
    createdAt: new Date().toISOString(),
    status: "pending_validation",
  });
}

export async function getPendingFarmDrafts(farmerId?: string): Promise<PendingFarmDraft[]> {
  if (farmerId) {
    return cocoaDb.pendingDrafts.where("farmerId").equals(farmerId).toArray();
  }
  return cocoaDb.pendingDrafts.toArray();
}

export async function removePendingFarmDraft(draftId: string): Promise<void> {
  const item = await cocoaDb.pendingDrafts.where("draftId").equals(draftId).first();
  if (item?.id) {
    await cocoaDb.pendingDrafts.delete(item.id);
  }
}
