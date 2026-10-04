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
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Sparkles,
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

// Dynamic import of Mapbox to prevent SSR window reference errors
const MapboxGeofenceMap = dynamic(() => import("@/components/MapboxGeofenceMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[450px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
      <div className="flex items-center gap-2 text-xs text-[#b8f58b]">
        <Compass className="animate-spin" size={18} /> Initializing Mapbox Satellite View...
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
  const [isSimulating, setIsSimulating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSavedPointRef = useRef<[number, number] | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Area calculation helper using Turf.js
  const calculatePolygonArea = useCallback(
    (points: [number, number][]): number => {
      if (points.length < 3) return 0;
      try {
        const closed = [...points];
        if (
          closed[0][0] !== closed[closed.length - 1][0] ||
          closed[0][1] !== closed[closed.length - 1][1]
        ) {
          closed.push(closed[0]);
        }
        const poly = turf.polygon([closed]);
        const areaSqM = turf.area(poly);
        const areaHa = parseFloat((areaSqM / 10000).toFixed(2));
        setCalculatedArea(areaHa.toString());

        if (onGeofenceComplete) {
          onGeofenceComplete({
            polygon: points,
            areaHectares: areaHa,
            pointCount: points.length,
          });
        }
        return areaHa;
      } catch (e) {
        console.error("Turf area calculation error:", e);
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

  // Toggle Fullscreen Viewport Mode
  const toggleFullScreen = () => {
    setIsFullScreen((prev) => !prev);
  };

  // 1. GPS Core Logic Loop (Hardware watchPosition)
  const handleNewCoordinate = async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    setAccuracyValue(Math.round(accuracy));
    setCurrentPos([longitude, latitude]);

    // Reject weak multipath signals reflecting off the dense cocoa tree canopy (> 10m)
    if (accuracy > 10) {
      setSignalWarning(true);
      console.warn("Signal degraded under cocoa canopy (>10m accuracy), discarding point.");
      return;
    }
    setSignalWarning(false);

    const currentPoint: [number, number] = [longitude, latitude];
    setBreadcrumbs((prev) => [...prev, currentPoint]);

    // First anchor point
    if (!lastSavedPointRef.current) {
      lastSavedPointRef.current = currentPoint;
      await cocoaDb.breadcrumbs.add({
        farmId,
        lng: longitude,
        lat: latitude,
        accuracy,
        timestamp: Date.now(),
      });

      const updated = [currentPoint];
      setActivePolygon(updated);
      setPointCount(1);
      return;
    }

    // Distance Filter: Only commit to IndexedDB if farmer has walked at least 4 meters
    const from = turf.point(lastSavedPointRef.current);
    const to = turf.point(currentPoint);
    const distanceInMeters = turf.distance(from, to, { units: "meters" });

    if (distanceInMeters >= 4) {
      lastSavedPointRef.current = currentPoint;
      await cocoaDb.breadcrumbs.add({
        farmId,
        lng: longitude,
        lat: latitude,
        accuracy,
        timestamp: Date.now(),
      });

      const count = await cocoaDb.breadcrumbs.where("farmId").equals(farmId).count();
      setPointCount(count);

      setActivePolygon((prev) => {
        const next = [...prev, currentPoint];
        if (next.length >= 3) {
          calculatePolygonArea(next);
        }
        return next;
      });
    }
  };

  // 2. Start Live Hardware Tracking
  const startTracking = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("Your browser or device does not support GPS hardware tracking.");
      return;
    }

    setIsTracking(true);
    setCalculatedArea(null);
    lastSavedPointRef.current = null;
    setStatusMessage("Walking canopy perimeter... hold device up and walk along farm boundary.");

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleNewCoordinate,
      (err) => {
        console.error("GPS Error: ", err.message);
        setStatusMessage(`GPS Notice: ${err.message}. You can also use Simulation or tap the map to place pins.`);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
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

  // 4. Simulated Canopy Walk (Ideal for rapid preview and testing)
  const startSimulation = () => {
    setIsSimulating(true);
    setIsTracking(true);
    setCalculatedArea(null);
    setActivePolygon([]);
    setBreadcrumbs([]);
    setStatusMessage("Simulating farmer walking boundary in Ekondo-Titi cocoa zone, Cameroon...");

    const simRoute: [number, number][] = [
      [9.124, 4.591],
      [9.1278, 4.5914],
      [9.1286, 4.5888],
      [9.1252, 4.5882],
      [9.1238, 4.5898],
    ];

    let step = 0;
    const currentPoints: [number, number][] = [];

    simulationIntervalRef.current = setInterval(async () => {
      if (step < simRoute.length) {
        const pt = simRoute[step];
        currentPoints.push(pt);
        setCurrentPos(pt);
        setBreadcrumbs((prev) => [...prev, pt]);
        setActivePolygon([...currentPoints]);
        setPointCount(currentPoints.length);

        await cocoaDb.breadcrumbs.add({
          farmId,
          lng: pt[0],
          lat: pt[1],
          accuracy: 3.2,
          timestamp: Date.now(),
        });

        step++;
      } else {
        if (simulationIntervalRef.current) {
          clearInterval(simulationIntervalRef.current);
        }
        setIsSimulating(false);
        setIsTracking(false);
        calculatePolygonArea(currentPoints);
        setStatusMessage("Simulation complete! 5-point EUDR cocoa polygon created.");
      }
    }, 1000);
  };

  // 5. Undo Last Point
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

  // 6. Clear All Boundary Points
  const handleClear = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
    }
    setIsTracking(false);
    setIsSimulating(false);
    setActivePolygon([]);
    setBreadcrumbs([]);
    setCalculatedArea(null);
    setPointCount(0);
    lastSavedPointRef.current = null;
    await cocoaDb.breadcrumbs.where("farmId").equals(farmId).delete();
    setStatusMessage("Boundary points reset.");
  };

  return (
    <div ref={containerRef} className="relative">
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
                <h3 className="mt-2 text-2xl font-bold text-[#10251d]">
                  How to Geofence Your Cocoa Plot Accurately
                </h3>
                <p className="mt-1 text-xs text-[#57655d]">
                  Follow these 4 field steps to ensure your boundary polygon complies with EU Deforestation Regulation audits.
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
              {/* Step 1 */}
              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b3528] text-sm font-bold text-white">
                  1
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Stand at Corner 1 (Starting Boundary Post)
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Walk to the corner of your cocoa plot where tree canopy is relatively clear. Hold your smartphone or tablet chest-high facing slightly upward to establish a strong dual-frequency GNSS lock.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-sm font-bold text-white">
                  2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Tap &quot;Start Walking&quot; &amp; Walk the Tree Line
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Walk clockwise or counter-clockwise along the true perimeter boundary of the farm. The app automatically filters multipath interference (&lt;10m threshold) and drops a geodetic vertex every 4 meters.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] text-sm font-bold text-white">
                  3
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Pause 3–5 Seconds at Major Turning Corners
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Whenever you reach a sharp corner or turning boundary edge, pause for 3 seconds. This allows high-precision GPS positioning to settle before following the next tree row.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4 rounded-2xl border border-[#edf1ea] bg-[#fafcf9] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#073b2b] text-sm font-bold text-[#b8f58b]">
                  4
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#10251d]">
                    Return to Start &amp; Tap &quot;Finish &amp; Close Polygon&quot;
                  </h4>
                  <p className="mt-1 text-xs text-[#57655d] leading-relaxed">
                    Once you complete the perimeter circuit and return to your starting post, tap &quot;Finish &amp; Close Polygon&quot;. The polygon loop will close, calculate total acreage in Hectares &amp; Acres, and store the coordinates safely in offline storage.
                  </p>
                </div>
              </div>

              {/* Canopy Tip Callout */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <strong className="flex items-center gap-1.5 font-bold text-amber-950 mb-1">
                  <AlertTriangle size={15} className="text-amber-700" /> Dense Canopy Recommendation:
                </strong>
                If under very dense shade trees (e.g., Terminalia ivorensis / Iroko), you can also tap directly on the high-resolution satellite map to pin precise boundary vertices manually.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-full bg-[#0b3528] px-6 py-3 text-xs font-bold text-white hover:bg-[#07241b] cursor-pointer"
              >
                Got It, Let&apos;s Geofence
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
            : "space-y-4 rounded-[32px] border border-[#dfe7d8] bg-white p-5 shadow-sm sm:p-6"
        }
      >
        {/* Top Header / HUD Bar */}
        <div
          className={
            isFullScreen
              ? "flex flex-wrap items-center justify-between border-b border-white/10 bg-[#07241b]/95 px-6 py-3.5 backdrop-blur-md"
              : "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          }
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider ${
                  isFullScreen
                    ? "bg-[#b8f58b]/20 text-[#b8f58b] border border-[#b8f58b]/30"
                    : "bg-[#edf7e8] text-[#2d6130]"
                }`}
              >
                {isFullScreen ? "Fullscreen Geofence HUD" : "EUDR Polygon Geofencing"}
              </span>

              {/* Accuracy Status Badge */}
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold ${
                  accuracyValue && accuracyValue <= 5
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : accuracyValue && accuracyValue <= 10
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : signalWarning
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse"
                    : isFullScreen
                    ? "bg-white/10 text-white/80"
                    : "bg-[#edf1ea] text-[#57655d]"
                }`}
              >
                <Activity size={12} />
                <span>
                  {accuracyValue !== null
                    ? `GPS Accuracy: ±${accuracyValue}m`
                    : "Offline Canopy Filter Ready"}
                </span>
              </div>
            </div>

            <h3
              className={`mt-1 font-bold ${
                isFullScreen ? "text-xl text-white" : "text-xl text-[#10251d] sm:text-2xl"
              }`}
            >
              {farmName} Boundary Mapping
            </h3>

            {!isFullScreen && (
              <p className="mt-1 text-xs text-[#57655d]">
                Walk the real boundary or tap satellite imagery to map coordinates with automatic canopy jitter filtering (&lt;10m).
              </p>
            )}
          </div>

          {/* Top Right Controls (Guide, Fullscreen, Area badge) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Computed Area Pill */}
            {calculatedArea && (
              <div
                className={`flex items-center gap-2 rounded-2xl px-3.5 py-2 ${
                  isFullScreen
                    ? "border border-[#b8f58b]/40 bg-[#0b3b2c] text-white"
                    : "border border-[#c4ebb0] bg-[#eefae6] text-[#0c392b]"
                }`}
              >
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                isFullScreen
                  ? "bg-white/10 text-white hover:bg-white/20 border border-white/20"
                  : "bg-[#edf7e8] text-[#2d6130] hover:bg-[#dfe7d8]"
              }`}
            >
              <HelpCircle size={14} /> Field Walk Guide
            </button>

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={toggleFullScreen}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold shadow-sm transition cursor-pointer ${
                isFullScreen
                  ? "bg-[#b8f58b] text-[#073b2b] hover:bg-[#9de46c]"
                  : "bg-[#0b3528] text-white hover:bg-[#07241b]"
              }`}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 size={14} /> Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize2 size={14} /> Fullscreen Geofencing Mode
                </>
              )}
            </button>
          </div>
        </div>

        {/* Canopy Warning Alert */}
        {signalWarning && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 mx-2">
            <AlertTriangle size={16} className="shrink-0 text-amber-600 animate-pulse" />
            <span>
              <strong>Degraded Canopy GPS Signal:</strong> Accuracy is currently ±{accuracyValue}m (&gt;10m threshold). Move slightly towards canopy openings or tap map manually.
            </span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`flex items-center gap-2 rounded-2xl p-2.5 text-xs mx-2 ${
              isFullScreen
                ? "bg-white/10 text-[#b8f58b] border border-white/15"
                : "bg-[#fafcf9] text-[#394a41] border border-[#edf1ea]"
            }`}
          >
            <Info size={14} className="shrink-0 text-[#2d6130]" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. MAP CANVAS CONTAINER                                               */}
        {/* ===================================================================== */}
        <div className={`relative ${isFullScreen ? "flex-1 w-full h-full" : "w-full"}`}>
          <MapboxGeofenceMap
            initialCenter={activePolygon.length > 0 ? activePolygon[0] : [9.1245, 4.5912]}
            initialZoom={16}
            activePolygon={activePolygon}
            breadcrumbs={breadcrumbs}
            isWalking={isTracking}
            currentPosition={currentPos}
            interactiveDrawing={!isTracking}
            heightClass={isFullScreen ? "h-full min-h-[500px]" : "h-[450px]"}
            onPolygonChange={(updated) => {
              setActivePolygon(updated);
              setPointCount(updated.length);
              if (updated.length >= 3) {
                calculatePolygonArea(updated);
              }
            }}
          />

          {/* Quick Guidance Overlay Pill on Top-Left of Map */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 hidden sm:flex items-center gap-2 rounded-2xl border border-black/40 bg-black/75 px-3 py-1.5 backdrop-blur-md text-[11px] text-white">
            <Navigation size={13} className="text-[#b8f58b]" />
            <span>Tap map or walk perimeter to log vertices</span>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 4. ACTIONS / CONTROLS BOTTOM BAR                                      */}
        {/* ===================================================================== */}
        <div
          className={
            isFullScreen
              ? "flex flex-wrap items-center justify-between border-t border-white/10 bg-[#07241b]/95 p-4 backdrop-blur-md"
              : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2"
          }
        >
          {/* Tracking Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {!isTracking ? (
              <>
                <button
                  type="button"
                  onClick={startTracking}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#2d6130] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#234d26] cursor-pointer"
                >
                  <Play size={14} /> Start Walking Canopy Perimeter
                </button>

                <button
                  type="button"
                  onClick={startSimulation}
                  disabled={isSimulating}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold shadow-sm transition cursor-pointer ${
                    isFullScreen
                      ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
                      : "border-[#dfe7d8] bg-[#f7f8f3] text-[#10251d] hover:bg-[#edf3ea]"
                  }`}
                >
                  <Sparkles size={14} className="text-[#b8f58b]" /> Simulate Cameroon Plot Walk
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={stopTracking}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-red-700 cursor-pointer animate-pulse"
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
                className="inline-flex items-center gap-1.5 rounded-2xl border border-red-300 bg-red-500/10 px-3.5 py-3 text-xs font-semibold text-red-400 hover:bg-red-500/20 cursor-pointer"
              >
                <Trash2 size={13} /> Reset
              </button>
            )}
          </div>

          {/* Right Status / Completion Buttons */}
          <div className="flex items-center gap-2">
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
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
              >
                Save Boundary &amp; Continue <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
