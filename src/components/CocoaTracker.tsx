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
} from "lucide-react";

// Dynamic import of Mapbox to prevent SSR window reference errors
const MapboxGeofenceMap = dynamic(() => import("@/components/MapboxGeofenceMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-full items-center justify-center rounded-3xl bg-[#062d22] text-white">
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

  const watchIdRef = useRef<number | null>(null);
  const lastSavedPointRef = useRef<[number, number] | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Area calculation helper using Turf.js
  const calculatePolygonArea = useCallback((points: [number, number][]): number => {
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
  }, [onGeofenceComplete]);

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
    setStatusMessage("Walking canopy perimeter... logging GPS turning points.");

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleNewCoordinate,
      (err) => {
        console.error("GPS Error: ", err.message);
        setStatusMessage(`GPS Notice: ${err.message}. You can also use the Simulation or click on map.`);
      },
      {
        enableHighAccuracy: true, // Forces L1/L5 dual-frequency phone GPS chip
        timeout: 8000,
        maximumAge: 0, // Zero caching allowed
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

    // Pull raw offline points from IndexedDB
    const rawPoints = await cocoaDb.breadcrumbs.where("farmId").equals(farmId).toArray();

    if (rawPoints.length < 3 && activePolygon.length < 3) {
      setStatusMessage("Farm boundary requires at least 3 logged points to calculate area.");
      return;
    }

    const coordsToUse: [number, number][] =
      rawPoints.length >= 3 ? rawPoints.map((p) => [p.lng, p.lat]) : activePolygon;

    calculatePolygonArea(coordsToUse);
    setStatusMessage("Perimeter closed & EUDR polygon calculated successfully!");
  };

  // 4. Simulated Canopy Walk (Ideal for desktop, preview, and rapid testing)
  const startSimulation = () => {
    setIsSimulating(true);
    setIsTracking(true);
    setCalculatedArea(null);
    setActivePolygon([]);
    setBreadcrumbs([]);
    setStatusMessage("Simulating farmer walking canopy perimeter in Ekondo-Titi, Cameroon...");

    // 5-point realistic cocoa plantation polygon around 4.5912° N, 9.1245° E
    const simRoute: [number, number][] = [
      [9.1240, 4.5910],
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
          accuracy: 3.5,
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
        setStatusMessage("Simulation finished! 5-point EUDR cocoa polygon created.");
      }
    }, 1000);
  };

  // 5. Clear All Boundary Points
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
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130] uppercase tracking-wider">
                EUDR Polygon Geofencing
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-[#57655d]">
                <ShieldCheck size={14} className="text-[#2a7a33]" /> Offline Canopy Mode
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold text-[#10251d] sm:text-3xl">
              Map Cocoa Plot Boundary
            </h2>
            <p className="mt-1 text-xs text-[#57655d]">
              Walk the perimeter of <strong className="text-[#10251d]">{farmName}</strong>. Points are filtered for tree canopy multipath degradation (&lt;10m) and saved offline in IndexedDB.
            </p>
          </div>

          {/* Quick Area Metric Badge */}
          {calculatedArea && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#c4ebb0] bg-[#eefae6] p-3.5 sm:p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2a7a33] text-white">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <span className="block text-[0.68rem] uppercase font-bold text-[#2a5933]">
                  Computed Farm Size
                </span>
                <span className="text-2xl font-black text-[#0c392b]">{calculatedArea} Ha</span>
              </div>
            </div>
          )}
        </div>

        {/* Status / Canopy Warning Alert */}
        {signalWarning && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
            <AlertTriangle size={16} className="shrink-0 text-amber-600 animate-pulse" />
            <span>
              <strong>Degraded Canopy GPS Signal:</strong> Accuracy is currently {accuracyValue}m (&gt;10m threshold). Keep walking towards canopy openings...
            </span>
          </div>
        )}

        {statusMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#fafcf9] p-2.5 text-xs text-[#394a41] border border-[#edf1ea]">
            <Info size={14} className="text-[#2d6130]" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Mapbox Interactive Satellite Map */}
      <div className="space-y-2">
        <MapboxGeofenceMap
          initialCenter={
            activePolygon.length > 0 ? activePolygon[0] : [9.1245, 4.5912]
          }
          initialZoom={16}
          activePolygon={activePolygon}
          breadcrumbs={breadcrumbs}
          isWalking={isTracking}
          currentPosition={currentPos}
          interactiveDrawing={!isTracking}
          heightClass="h-[430px]"
          onPolygonChange={(updated) => {
            setActivePolygon(updated);
            setPointCount(updated.length);
            if (updated.length >= 3) {
              calculatePolygonArea(updated);
            }
          }}
        />
        <div className="flex items-center justify-between text-[11px] text-[#57655d] px-1">
          <span>Tip: You can also click directly on the satellite map to add or drag boundary vertices.</span>
          <span>{pointCount} Polygon Vertices</span>
        </div>
      </div>

      {/* Bottom Control Actions Panel */}
      <div className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Tracking Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
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
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#dfe7d8] bg-[#f7f8f3] px-4 py-3 text-xs font-bold text-[#10251d] shadow-sm transition hover:bg-[#edf3ea] cursor-pointer"
                >
                  <Sparkles size={14} className="text-[#2d6130]" /> Simulate Walk (Cameroon Plot)
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={stopTracking}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 cursor-pointer animate-pulse"
              >
                <Square size={14} /> Finish & Close Polygon ({pointCount} pts)
              </button>
            )}

            {pointCount > 0 && !isTracking && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-red-200 bg-red-50/50 px-3.5 py-3 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
              >
                <Trash2 size={13} /> Reset Points
              </button>
            )}
          </div>

          {/* Proceed to Complete Onboarding */}
          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b3528] px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
            >
              Complete Farm Registration <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
