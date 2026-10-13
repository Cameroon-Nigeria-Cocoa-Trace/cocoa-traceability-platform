"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import * as turf from "@turf/turf";
import { cocoaDb } from "@/lib/cocoaDb";
import dynamic from "next/dynamic";
import {
  Compass,
  Play,
  Square,
  ShieldCheck,
  Trees,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ArrowRight,
  Info,
  Maximize2,
  Minimize2,
  HelpCircle,
  Undo2,
  X,
  Navigation,
  Activity,
} from "lucide-react";
import { checkForestOverlap } from "@/lib/protectedForests";

// Dynamic import of Mapbox to prevent SSR window reference errors
const MapboxGeofenceMap = dynamic(() => import("@/components/MapboxGeofenceMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[450px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
      <div className="flex items-center gap-2 text-xs text-[#b8f58b]">
        <Compass className="animate-spin" size={18} /> Loading map...
      </div>
    </div>
  ),
});

interface CocoaTrackerProps {
  farmId?: string;
  farmName?: string;
  initialPolygon?: [number, number][]; // [lng, lat][]
  onGeofenceComplete?: (data: {
    polygon: [number, number][];
    areaHectares: number;
    pointCount: number;
  }) => void;
  onContinue?: () => void;
}

export default function CocoaTracker({
  farmId = "farm_canopy_temp",
  farmName = "Cocoa Farm Plot",
  initialPolygon = [],
  onGeofenceComplete,
  onContinue,
}: CocoaTrackerProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [pointCount, setPointCount] = useState(initialPolygon.length);
  const [calculatedArea, setCalculatedArea] = useState<string | null>(null);
  const [signalWarning, setSignalWarning] = useState(false);
  const [accuracyValue, setAccuracyValue] = useState<number | null>(null);
  const [activePolygon, setActivePolygon] = useState<[number, number][]>(initialPolygon);
  const [breadcrumbs, setBreadcrumbs] = useState<[number, number][]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const forestCheck = checkForestOverlap(activePolygon);

  const containerRef = useRef<HTMLDivElement>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSavedPointRef = useRef<[number, number] | null>(null);

  // Area calculation helper using Turf.js
  const calculatePolygonArea = useCallback(
    (points: [number, number][]): number => {
      if (!points || points.length < 3) {
        setCalculatedArea(null);
        return 0;
      }

      // Filter out duplicate consecutive points
      const uniquePoints: [number, number][] = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (
          i === 0 ||
          pt[0] !== points[i - 1][0] ||
          pt[1] !== points[i - 1][1]
        ) {
          uniquePoints.push(pt);
        }
      }

      if (uniquePoints.length < 3) {
        setCalculatedArea(null);
        return 0;
      }

      try {
        const closed = [...uniquePoints];
        const first = closed[0];
        const last = closed[closed.length - 1];

        // Ensure closed ring
        if (first[0] !== last[0] || first[1] !== last[1]) {
          closed.push([first[0], first[1]]);
        }

        // A valid GeoJSON LinearRing must have at least 4 positions (3 distinct vertices + 1 closing vertex)
        if (closed.length < 4) {
          setCalculatedArea(null);
          return 0;
        }

        const poly = turf.polygon([closed]);
        const areaSqM = turf.area(poly);
        const areaHa = parseFloat((areaSqM / 10000).toFixed(2));
        setCalculatedArea(areaHa.toString());

        if (onGeofenceComplete) {
          onGeofenceComplete({
            polygon: uniquePoints,
            areaHectares: areaHa,
            pointCount: uniquePoints.length,
          });
        }
        return areaHa;
      } catch (e: unknown) {
        console.warn("Polygon area calculation notice:", e instanceof Error ? e.message : e);
        return 0;
      }
    },
    [onGeofenceComplete]
  );

  // Initialize from offline IndexedDB if available
  useEffect(() => {
    async function loadOfflinePoints() {
      try {
        const saved = await cocoaDb.breadcrumbs.where("farmId").equals(farmId).toArray();
        if (saved.length > 0 && activePolygon.length === 0) {
          const coords: [number, number][] = saved.map((p) => [p.lng, p.lat]);
          setActivePolygon(coords);
          setPointCount(coords.length);

          if (coords.length >= 3) {
            calculatePolygonArea(coords);
          }
        }
      } catch (err) {
        console.warn("IndexedDB read error:", err);
      }
    }
    loadOfflinePoints();
  }, [farmId, activePolygon.length, calculatePolygonArea]);

  // Auto-acquire current GPS position on load to navigate map directly to farmer's location
  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setAccuracyValue(Math.round(accuracy));
          setCurrentPos([longitude, latitude]);
          setStatusMessage(`GPS locked: centered on your current location (±${Math.round(accuracy)}m).`);
        },
        (err) => {
          console.warn("Auto-location notice:", err.message);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    }
  }, []);

  // Fullscreen keyboard escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen]);

  // Fullscreen Toggle
  const toggleFullScreen = () => {
    setIsFullScreen((prev) => !prev);
  };

  // 1. Point Distance Helper
  const getDistanceFromLatLonInMeters = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371e3; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // 2. Start Live Hardware GPS Perimeter Tracking
  const startTracking = () => {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported by your browser or device.");
      return;
    }

    setIsTracking(true);
    setStatusMessage("Acquiring high-precision GNSS lock under canopy...");

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setAccuracyValue(Math.round(accuracy));
        setCurrentPos([longitude, latitude]);

        if (accuracy > 10) {
          setSignalWarning(true);
          setStatusMessage(`Degraded canopy signal (±${Math.round(accuracy)}m). Pausing automated point log.`);
          return;
        }

        setSignalWarning(false);
        const currentCoord: [number, number] = [longitude, latitude];

        let shouldSave = false;
        if (!lastSavedPointRef.current) {
          shouldSave = true;
        } else {
          const dist = getDistanceFromLatLonInMeters(
            lastSavedPointRef.current[1],
            lastSavedPointRef.current[0],
            latitude,
            longitude
          );
          if (dist >= 4) {
            shouldSave = true;
          }
        }

        if (shouldSave) {
          lastSavedPointRef.current = currentCoord;

          setBreadcrumbs((prev) => [...prev, currentCoord]);
          setActivePolygon((prev) => {
            const next = [...prev, currentCoord];
            setPointCount(next.length);
            if (next.length >= 3) {
              calculatePolygonArea(next);
            }
            return next;
          });

          await cocoaDb.breadcrumbs.add({
            farmId,
            lng: longitude,
            lat: latitude,
            accuracy,
            timestamp: position.timestamp,
          });

          setStatusMessage(`Logged boundary vertex #${pointCount + 1} (±${Math.round(accuracy)}m).`);
        }
      },
      (error) => {
        console.warn("GPS Tracking Notice:", error.message);
        setIsTracking(false);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        let msg = "GPS signal unavailable. You can tap on the satellite map directly to mark boundary points.";
        if (error.code === 1) {
          msg = "Location permission is not enabled. You can tap directly on the map to place boundary points.";
        } else if (error.code === 3) {
          msg = "GPS signal timed out. You can tap directly on the satellite map to add boundary points.";
        }
        setStatusMessage(msg);
      },
      geoOptions
    );
  };

  // 3. Stop Hardware Tracking & Calculate Area
  const stopTracking = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);

    const rawPoints = await cocoaDb.breadcrumbs.where("farmId").equals(farmId).toArray();

    if (rawPoints.length < 3 && activePolygon.length < 3) {
      setStatusMessage("Farm boundary requires at least 3 logged points to calculate area.");
      return;
    }

    const coordsToUse: [number, number][] =
      rawPoints.length >= 3 ? rawPoints.map((p) => [p.lng, p.lat]) : activePolygon;

    calculatePolygonArea(coordsToUse);
    setStatusMessage("Perimeter closed! EUDR-compliant polygon & acreage calculated.");
  };

  // 4. Undo Last Point
  const handleUndo = async () => {
    if (activePolygon.length === 0) return;
    const updated = activePolygon.slice(0, -1);
    setActivePolygon(updated);
    setPointCount(updated.length);

    if (updated.length >= 3) {
      calculatePolygonArea(updated);
    } else {
      setCalculatedArea(null);
    }

    try {
      const all = await cocoaDb.breadcrumbs.where("farmId").equals(farmId).toArray();
      if (all.length > 0) {
        const last = all[all.length - 1];
        if (last.id) await cocoaDb.breadcrumbs.delete(last.id);
      }
    } catch (e) {
      console.warn("Could not delete last point from IndexedDB", e);
    }
  };

  // 5. Clear All Boundary Points
  const handleClear = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setActivePolygon([]);
    setBreadcrumbs([]);
    setCalculatedArea(null);
    setPointCount(0);
    lastSavedPointRef.current = null;
    await cocoaDb.breadcrumbs.where("farmId").equals(farmId).delete();
    setStatusMessage("Boundary points reset.");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ========================================================================= */}
      {/* 1. HOW-TO-GEOFENCE FIELD GUIDE MODAL                                       */}
      {/* ========================================================================= */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2d6130] uppercase">
                    EUDR Regulation Article 9
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#57655d]">
                    <ShieldCheck size={14} className="text-[#2a7a33]" /> Official Standard
                  </span>
                </div>
                <h3 className="mt-2 text-xl sm:text-2xl font-bold text-[#10251d]">
                  How to Geofence Your Cocoa Plot Accurately
                </h3>
                <p className="mt-1 text-xs text-[#57655d]">
                  Follow these field steps to ensure your boundary polygon complies with EU Deforestation Regulation audits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-full p-2 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b3528] text-sm font-bold text-white">
                  1
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Stand at Starting Boundary Corner
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Walk to the starting corner of your cocoa plot. Hold your device chest-high to establish a strong dual-frequency GNSS lock.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-sm font-bold text-white">
                  2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Tap &quot;Start Walking&quot; &amp; Walk the Boundary
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Walk clockwise or counter-clockwise along the true perimeter boundary of the farm. The app drops a vertex every 4 meters.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-sm font-bold text-white">
                  3
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Pause 3–5 Seconds at Major Turning Points
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Whenever you reach a sharp corner, pause briefly to let GPS position settle accurately before moving along the next edge.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#073b2b] text-sm font-bold text-[#b8f58b]">
                  4
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Close Perimeter &amp; Generate Polygon
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    When you return to your starting post, tap &quot;Finish &amp; Close Polygon&quot; to calculate certified acreage and save the record.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white transition hover:bg-[#07241b] cursor-pointer"
              >
                Understood, Let&apos;s Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. GEOFENCING CONTAINER (SWITCHES BETWEEN EMBEDDED & FULL-SCREEN VIEWPORT) */}
      {/* ========================================================================= */}
      <div
        className={
          isFullScreen
            ? "fixed inset-0 z-[100] flex flex-col bg-[#051c14] text-white"
            : "space-y-4 rounded-[32px] border border-[#dfe7d8] bg-white p-4 sm:p-6 shadow-sm"
        }
      >
        {/* Top Header Bar (ONLY SHOWN IN EMBEDDED MODE - HIDDEN IN FULLSCREEN) */}
        {!isFullScreen && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
                  EUDR Polygon Geofencing
                </span>

                {/* Accuracy Status Badge */}
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold ${
                    accuracyValue && accuracyValue <= 5
                      ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/30"
                      : accuracyValue && accuracyValue <= 10
                      ? "bg-blue-500/10 text-blue-700 border border-blue-500/30"
                      : signalWarning
                      ? "bg-amber-500/20 text-amber-800 border border-amber-500/30 animate-pulse"
                      : "bg-[#edf1ea] text-[#57655d]"
                  }`}
                >
                  <Activity size={12} />
                  <span>
                    {accuracyValue !== null
                      ? `GPS Accuracy: ±${accuracyValue}m`
                      : "Canopy GPS Ready"}
                  </span>
                </div>

                {/* Protected Forest Reserve Proximity / EUDR Status Badge */}
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold ${
                    forestCheck.isOverlapping
                      ? "bg-red-500/20 text-red-700 border border-red-500/30 font-bold animate-pulse"
                      : "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                  }`}
                >
                  <Trees size={12} className={forestCheck.isOverlapping ? "text-red-600" : "text-emerald-600"} />
                  <span>
                    {forestCheck.isOverlapping
                      ? `⚠️ Intersects ${forestCheck.breachedForests[0]?.name}`
                      : forestCheck.nearestForest
                      ? `Zero Deforestation (${forestCheck.nearestForest.distanceKm}km to ${forestCheck.nearestForest.name})`
                      : "Protected Forests Geofenced"}
                  </span>
                </div>
              </div>

              <h3 className="mt-1 text-lg font-bold text-[#10251d] sm:text-2xl">
                {farmName} Boundary Mapping
              </h3>

              <p className="mt-1 text-xs text-[#57655d]">
                Walk the boundary or tap the satellite map to log coordinates with automatic canopy jitter filtering.
              </p>
            </div>

            {/* Top Right Controls (Guide, Fullscreen, Area badge) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Computed Area Pill */}
              {calculatedArea && (
                <div className="flex items-center gap-2 rounded-2xl border border-[#c4ebb0] bg-[#eefae6] px-3.5 py-2 text-[#0c392b]">
                  <CheckCircle2 size={16} className="text-[#2a7a33]" />
                  <div>
                    <span className="block text-[0.6rem] font-bold uppercase tracking-wider opacity-80">
                      Calculated Size
                    </span>
                    <span className="font-extrabold text-sm sm:text-base">
                      {calculatedArea} Ha ({(parseFloat(calculatedArea) * 2.471).toFixed(2)} Ac)
                    </span>
                  </div>
                </div>
              )}

              {/* How-To Field Guide Button */}
              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3.5 py-2 text-xs font-bold text-[#2d6130] transition hover:bg-[#dfe7d8] cursor-pointer"
              >
                <HelpCircle size={14} /> Field Guide
              </button>

              {/* Fullscreen Toggle Button */}
              <button
                type="button"
                onClick={toggleFullScreen}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
              >
                <Maximize2 size={14} /> Fullscreen
              </button>
            </div>
          </div>
        )}

        {/* Floating Glassmorphic Exit Fullscreen Button (ONLY in Fullscreen Mode) */}
        {isFullScreen && (
          <button
            type="button"
            onClick={toggleFullScreen}
            className="absolute top-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#062d22]/80 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-xl transition hover:bg-[#062d22] hover:border-[#b8f58b]/60 cursor-pointer"
          >
            <Minimize2 size={15} className="text-[#b8f58b]" />
            <span>Exit Fullscreen</span>
          </button>
        )}

        {/* Canopy Warning Alert */}
        {signalWarning && !isFullScreen && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle size={16} className="shrink-0 text-amber-600 animate-pulse" />
            <span>
              <strong>Degraded Canopy GPS Signal:</strong> Accuracy is ±{accuracyValue}m (&gt;10m threshold). Move towards canopy openings or tap map manually.
            </span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && !isFullScreen && (
          <div className="flex items-center gap-2 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-2.5 text-xs text-[#394a41]">
            <Info size={14} className="shrink-0 text-[#2d6130]" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. MAP CANVAS CONTAINER                                               */}
        {/* ===================================================================== */}
        <div className={`relative ${isFullScreen ? "flex-1 w-full h-full" : "w-full"}`}>
          <MapboxGeofenceMap
            initialCenter={activePolygon.length > 0 ? activePolygon[0] : [11.2, 5.0]}
            initialZoom={activePolygon.length > 0 ? 15.5 : 6.8}
            activePolygon={activePolygon}
            breadcrumbs={breadcrumbs}
            isWalking={isTracking}
            currentPosition={currentPos}
            interactiveDrawing={!isTracking}
            heightClass={isFullScreen ? "h-full min-h-[500px]" : "h-[380px] sm:h-[450px]"}
            onPolygonChange={(updated) => {
              setActivePolygon(updated);
              setPointCount(updated.length);
              if (updated.length >= 3) {
                calculatePolygonArea(updated);
              }
            }}
          />

          {/* Guidance Overlay Pill */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 hidden sm:flex items-center gap-2 rounded-2xl border border-black/40 bg-black/75 px-3 py-1.5 backdrop-blur-md text-[11px] text-white">
            <Navigation size={13} className="text-[#b8f58b]" />
            <span>Tap map or walk perimeter to log boundary</span>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 4. ACTIONS / CONTROLS BOTTOM BAR                                      */}
        {/* ===================================================================== */}
        <div
          className={
            isFullScreen
              ? "flex flex-wrap items-center justify-between border-t border-white/10 bg-[#07241b]/95 p-4 backdrop-blur-md gap-3"
              : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1"
          }
        >
          {/* Tracking Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {!isTracking ? (
              <button
                type="button"
                onClick={startTracking}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2d6130] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#234d26] cursor-pointer"
              >
                <Play size={14} /> Start Walking Canopy Perimeter
              </button>
            ) : (
              <button
                type="button"
                onClick={stopTracking}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-red-700 cursor-pointer animate-pulse"
              >
                <Square size={14} /> Finish &amp; Close Polygon ({pointCount} pts)
              </button>
            )}

            {/* Undo Last Point */}
            {pointCount > 0 && !isTracking && (
              <button
                type="button"
                onClick={handleUndo}
                title="Undo last point"
                className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-3 text-xs font-semibold transition cursor-pointer ${
                  isFullScreen
                    ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
                    : "border-[#dfe7d8] bg-white text-[#57655d] hover:bg-[#f7f8f3]"
                }`}
              >
                <Undo2 size={13} /> Undo
              </button>
            )}

            {/* Reset All */}
            {pointCount > 0 && !isTracking && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-red-300 bg-red-500/10 px-3.5 py-3 text-xs font-semibold text-red-500 hover:bg-red-500/20 cursor-pointer"
              >
                <Trash2 size={13} /> Reset
              </button>
            )}
          </div>

          {/* Right Status / Completion Buttons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <div
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                isFullScreen ? "bg-white/10 text-white/90" : "bg-[#f7f8f3] text-[#57655d]"
              }`}
            >
              {pointCount} Vertices Logged
            </div>

            {isFullScreen && (
              <button
                type="button"
                onClick={toggleFullScreen}
                className="rounded-2xl bg-[#b8f58b] px-5 py-2.5 text-xs font-bold text-[#073b2b] hover:bg-[#a2e873] cursor-pointer"
              >
                Apply &amp; Return
              </button>
            )}

            {onContinue && !isFullScreen && (
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
              >
                Save &amp; Continue <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
