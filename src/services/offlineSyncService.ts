import Dexie, { Table } from "dexie";
import { FarmRecord } from "@/context/FirebaseContext";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface OfflineFarmEntry {
  id: string;
  farmData: FarmRecord;
  createdAt: string;
  syncStatus: "pending" | "syncing" | "synced" | "error";
  syncError?: string;
}

class CocoaTraceOfflineDatabase extends Dexie {
  offlineFarms!: Table<OfflineFarmEntry, string>;

  constructor() {
    super("CocoaTraceOfflineDB");
    this.version(1).stores({
      offlineFarms: "id, syncStatus, createdAt",
    });
  }
}

export const offlineDb = new CocoaTraceOfflineDatabase();

/**
 * Saves a farm record locally to IndexedDB queue when captured offline
 */
export async function saveFarmOfflineQueue(farm: FarmRecord): Promise<OfflineFarmEntry> {
  const entry: OfflineFarmEntry = {
    id: farm.id,
    farmData: {
      ...farm,
    },
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
  };

  try {
    await offlineDb.offlineFarms.put(entry);
  } catch (err) {
    console.warn("IndexedDB put warning, falling back to localStorage:", err);
    if (typeof window !== "undefined") {
      const existing: OfflineFarmEntry[] = JSON.parse(
        localStorage.getItem("cocoatrace_pending_offline_farms") || "[]"
      );
      const filtered = existing.filter((f) => f.id !== farm.id);
      filtered.push(entry);
      localStorage.setItem("cocoatrace_pending_offline_farms", JSON.stringify(filtered));
    }
  }

  return entry;
}

/**
 * Retrieves all pending offline farm records waiting to be uploaded to Firebase
 */
export async function getPendingOfflineFarms(): Promise<OfflineFarmEntry[]> {
  try {
    const entries = await offlineDb.offlineFarms.where("syncStatus").equals("pending").toArray();
    if (entries.length > 0) return entries;
  } catch (err) {
    console.warn("IndexedDB read warning:", err);
  }

  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("cocoatrace_pending_offline_farms");
      if (saved) {
        const parsed: OfflineFarmEntry[] = JSON.parse(saved);
        return parsed.filter((f) => f.syncStatus === "pending");
      }
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * Syncs all pending offline captured farm plots to Firebase Firestore
 */
export async function syncOfflineFarmsToFirebase(): Promise<{
  successCount: number;
  failedCount: number;
  errors: string[];
}> {
  const pending = await getPendingOfflineFarms();
  if (pending.length === 0) {
    return { successCount: 0, failedCount: 0, errors: [] };
  }

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const entry of pending) {
    try {
      // Mark as syncing
      try {
        await offlineDb.offlineFarms.update(entry.id, { syncStatus: "syncing" });
      } catch {
        // ignore
      }

      // Convert geofence polygon to Firestore format if present
      const farmToSave = { ...entry.farmData };
      if (farmToSave.geofencePolygon && Array.isArray(farmToSave.geofencePolygon)) {
        farmToSave.geofencePolygon = farmToSave.geofencePolygon.map((pt: unknown) => {
          if (Array.isArray(pt)) return { lat: pt[0], lng: pt[1] };
          return pt as { lat: number; lng: number };
        }) as unknown as [number, number][];
      }

      // Upload to Firebase Firestore
      await setDoc(doc(db, "farms", entry.id), farmToSave);

      // Mark as synced
      try {
        await offlineDb.offlineFarms.update(entry.id, { syncStatus: "synced" });
      } catch {
        // ignore
      }

      if (typeof window !== "undefined") {
        const saved: OfflineFarmEntry[] = JSON.parse(
          localStorage.getItem("cocoatrace_pending_offline_farms") || "[]"
        );
        const updated = saved.filter((f) => f.id !== entry.id);
        localStorage.setItem("cocoatrace_pending_offline_farms", JSON.stringify(updated));
      }

      successCount++;
    } catch (err: unknown) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Farm "${entry.farmData.farmName}": ${msg}`);

      try {
        await offlineDb.offlineFarms.update(entry.id, {
          syncStatus: "error",
          syncError: msg,
        });
      } catch {
        // ignore
      }
    }
  }

  return { successCount, failedCount, errors };
}
