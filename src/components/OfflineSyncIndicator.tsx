"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getPendingOfflineFarms,
  syncOfflineFarmsToFirebase,
} from "@/services/offlineSyncService";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, CloudUpload } from "lucide-react";

export const OfflineSyncIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return navigator.onLine;
  });
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const checkPending = useCallback(async () => {
    try {
      const pending = await getPendingOfflineFarms();
      setPendingCount(pending.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);

    try {
      const res = await syncOfflineFarmsToFirebase();
      await checkPending();

      if (res.successCount > 0) {
        setSyncResult({
          msg: `Successfully uploaded ${res.successCount} offline farm plot(s) to Firebase!`,
          type: "success",
        });
      } else if (res.failedCount > 0) {
        setSyncResult({
          msg: `Failed to upload ${res.failedCount} farm plot(s). Check connection or Firebase rules.`,
          type: "error",
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Network error";
      setSyncResult({
        msg: `Sync failed: ${errorMsg}`,
        type: "error",
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 6000);
    }
  }, [syncing, checkPending]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = async () => {
      setIsOnline(true);
      await checkPending();
      // Auto-sync when coming back online
      handleSyncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      checkPending();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check on interval & periodic polling for pending offline queue updates
    const interval = setInterval(checkPending, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkPending, handleSyncNow]);

  if (isOnline && pendingCount === 0 && !syncResult) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-sm flex-col gap-2">
      {/* Sync result toast */}
      {syncResult && (
        <div
          className={`flex items-center gap-2 rounded-2xl p-3 text-xs font-semibold shadow-xl backdrop-blur-md transition-all ${
            syncResult.type === "success"
              ? "bg-[#10251d] text-[#b8f58b] border border-[#b8f58b]/30"
              : "bg-red-950 text-red-200 border border-red-500/30"
          }`}
        >
          {syncResult.type === "success" ? (
            <CheckCircle2 size={16} className="text-[#b8f58b] shrink-0" />
          ) : (
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
          )}
          <span>{syncResult.msg}</span>
        </div>
      )}

      {/* Main Offline / Sync Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-[#dfe7d8]/30 bg-[#10251d]/95 p-3 text-white shadow-2xl backdrop-blur-md">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            isOnline ? "bg-[#b8f58b]/20 text-[#b8f58b]" : "bg-amber-500/20 text-amber-400"
          }`}
        >
          {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
        </div>

        <div className="flex flex-col text-xs">
          <span className="font-bold text-white">
            {isOnline ? "PWA Online Mode" : "PWA Offline Location Mode"}
          </span>
          <span className="text-[0.7rem] text-[#b8f58b]/80">
            {pendingCount > 0
              ? `${pendingCount} farm plot(s) recorded offline waiting for upload`
              : isOnline
              ? "All farm coordinates synced to Firebase"
              : "GPS location mapping is active offline"}
          </span>
        </div>

        {pendingCount > 0 && isOnline && (
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#b8f58b] px-3 py-1.5 text-[0.7rem] font-bold text-[#073b2b] shadow-sm hover:bg-[#a6eb77] disabled:opacity-50 cursor-pointer"
          >
            {syncing ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <CloudUpload size={12} />
            )}
            <span>{syncing ? "Uploading..." : "Sync Now"}</span>
          </button>
        )}
      </div>
    </div>
  );
};
