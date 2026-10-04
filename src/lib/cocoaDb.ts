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

export class CocoaDatabase extends Dexie {
  breadcrumbs!: Table<CanopyBreadcrumb>;
  geofences!: Table<CachedGeofence>;

  constructor() {
    super("CocoaFarmDatabase");
    this.version(1).stores({
      breadcrumbs: "++id, farmId, lng, lat, timestamp",
      geofences: "++id, farmId, farmName, recordedAt, syncedToCloud",
    });
  }
}

export const cocoaDb = new CocoaDatabase();
