'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Dexie, { type Table } from 'dexie';
import * as turf from '@turf/turf';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Play,
  Square,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Maximize2,
  Minimize2,
  HelpCircle,
  X,
  Navigation,
  Activity,
} from 'lucide-react';
import { MAPBOX_TOKEN, getMapStyle } from '@/lib/mapStyles';

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

interface Breadcrumb {
  id?: number;
  farmId: string;
  lng: number;
  lat: number;
  timestamp: number;
}

class CocoaDatabase extends Dexie {
  breadcrumbs!: Table<Breadcrumb>;
  constructor() {
    super('CocoaFarmDatabase');
    this.version(1).stores({
      breadcrumbs: '++id, farmId, lng, lat, timestamp',
    });
  }
}

const db = new CocoaDatabase();

interface GeofenceOnboardingProps {
  farmId?: string;
  farmName?: string;
  onComplete?: (data: { polygon: [number, number][]; areaHa: number; pointCount: number }) => void;
}

export default function GeofenceOnboarding({
  farmId = 'onboarding_geofence_farm',
  farmName = 'Cocoa Farm Plot',
  onComplete,
}: GeofenceOnboardingProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [calculatedArea, setCalculatedArea] = useState<string | null>(null);
  const [signalWarning, setSignalWarning] = useState(false);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSavedPointRef = useRef<[number, number] | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update map source visual structure
  const updateMapVisualization = useCallback(async () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (!map.isStyleLoaded()) return;

    const rawPoints = await db.breadcrumbs.where('farmId').equals(farmId).toArray();
    if (rawPoints.length === 0) return;

    const coordinates: [number, number][] = rawPoints.map((p) => [p.lng, p.lat]);

    const latestPoint = coordinates[coordinates.length - 1];
    map.flyTo({ center: [latestPoint[0], latestPoint[1]], zoom: 16.5, essential: true });

    const geoJsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };

    if (coordinates.length >= 3) {
      const closedCoords = [...coordinates, coordinates[0]];
      geoJsonData.features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [closedCoords],
        },
        properties: {
          area: calculatedArea || 'Pending',
        },
      });
    } else {
      geoJsonData.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
        properties: {},
      });
    }

    const source = map.getSource('geofence') as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geoJsonData);
    }
  }, [farmId, calculatedArea]);

  // Initialize Mapbox Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: getMapStyle('satellite'),
      center: [9.2612, 4.1534], // Cameroon Cocoa Belt
      zoom: 15,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      if (!map.getSource('geofence')) {
        map.addSource('geofence', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });

        map.addLayer({
          id: 'geofence-layer',
          type: 'fill',
          source: 'geofence',
          layout: {},
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0.45,
          },
        });

        map.addLayer({
          id: 'geofence-outline',
          type: 'line',
          source: 'geofence',
          layout: {},
          paint: {
            'line-color': '#b8f58b',
            'line-width': 3.5,
          },
        });
      }
      map.resize();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Auto-acquire current GPS position on load to navigate map to farmer's location
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setCurrentAccuracy(Math.round(accuracy));
          if (mapRef.current) {
            mapRef.current.flyTo({
              center: [longitude, latitude],
              zoom: 16.5,
              essential: true,
              duration: 1200,
            });
          }
        },
        (err) => console.warn('Auto-locate error:', err.message),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    }
  }, []);

  const handlePositionUpdate = async (pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords;
    setCurrentAccuracy(Math.round(accuracy));

    if (accuracy > 10) {
      setSignalWarning(true);
      return;
    }
    setSignalWarning(false);

    const currentCoords: [number, number] = [longitude, latitude];

    if (!lastSavedPointRef.current) {
      lastSavedPointRef.current = currentCoords;
      await db.breadcrumbs.add({
        farmId,
        lng: longitude,
        lat: latitude,
        timestamp: Date.now(),
      });
      setPointCount(1);
      await updateMapVisualization();
      return;
    }

    const from = turf.point(lastSavedPointRef.current);
    const to = turf.point(currentCoords);
    const dist = turf.distance(from, to, { units: 'meters' });

    if (dist >= 4) {
      lastSavedPointRef.current = currentCoords;
      await db.breadcrumbs.add({
        farmId,
        lng: longitude,
        lat: latitude,
        timestamp: Date.now(),
      });

      const count = await db.breadcrumbs.where('farmId').equals(farmId).count();
      setPointCount(count);
      await updateMapVisualization();
    }
  };

  const startTracking = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      console.warn('Geolocation is not supported by your browser/device.');
      return;
    }

    setIsTracking(true);
    setCalculatedArea(null);
    lastSavedPointRef.current = null;

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      (err) => {
        console.warn('GPS watch notice:', err.message);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  };

  const stopTracking = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);

    const rawPoints = await db.breadcrumbs.where('farmId').equals(farmId).toArray();
    if (rawPoints.length < 3) {
      console.warn('Boundary requires at least 3 points to create a closed polygon.');
      return;
    }

    const coordinates: [number, number][] = rawPoints.map((p) => [p.lng, p.lat]);
    coordinates.push(coordinates[0]);

    const polygon = turf.polygon([coordinates]);
    const areaSqM = turf.area(polygon);
    const areaHectares = (areaSqM / 10000).toFixed(2);
    setCalculatedArea(areaHectares);

    await updateMapVisualization();

    if (onComplete) {
      onComplete({
        polygon: rawPoints.map((p) => [p.lng, p.lat]),
        areaHa: parseFloat(areaHectares),
        pointCount: rawPoints.length,
      });
    }
  };

  const runSimulatedWalk = () => {
    setIsSimulating(true);
    setIsTracking(true);
    setCalculatedArea(null);

    const simVertices: [number, number][] = [
      [9.2612, 4.1534],
      [9.2635, 4.1542],
      [9.2651, 4.1521],
      [9.2642, 4.1495],
      [9.2619, 4.1501],
      [9.2608, 4.1517],
    ];

    let idx = 0;
    simIntervalRef.current = setInterval(async () => {
      if (idx >= simVertices.length) {
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);
        setIsSimulating(false);
        setIsTracking(false);

        const rawPoints = await db.breadcrumbs.where('farmId').equals(farmId).toArray();
        const coords = rawPoints.map((p) => [p.lng, p.lat] as [number, number]);
        coords.push(coords[0]);
        const poly = turf.polygon([coords]);
        const ha = (turf.area(poly) / 10000).toFixed(2);
        setCalculatedArea(ha);
        await updateMapVisualization();

        if (onComplete) {
          onComplete({
            polygon: rawPoints.map((p) => [p.lng, p.lat]),
            areaHa: parseFloat(ha),
            pointCount: rawPoints.length,
          });
        }
        return;
      }

      const pt = simVertices[idx];
      await db.breadcrumbs.add({
        farmId,
        lng: pt[0],
        lat: pt[1],
        timestamp: Date.now(),
      });
      setPointCount(idx + 1);
      setCurrentAccuracy(3);
      await updateMapVisualization();
      idx++;
    }, 800);
  };

  const clearPoints = async () => {
    await db.breadcrumbs.where('farmId').equals(farmId).delete();
    setPointCount(0);
    setCalculatedArea(null);
    lastSavedPointRef.current = null;
    if (mapRef.current && mapRef.current.getSource('geofence')) {
      (mapRef.current.getSource('geofence') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  };

  return (
    <div className="relative">
      {/* Field Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b border-[#edf1ea] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#edf7e8] px-2.5 py-0.5 text-[0.68rem] font-bold text-[#2d6130] uppercase">
                    EUDR Regulation
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#57655d]">
                    <ShieldCheck size={14} className="text-[#2a7a33]" /> Standardized Protocol
                  </span>
                </div>
                <h3 className="mt-2 text-2xl font-bold text-[#10251d]">
                  How to Walk &amp; Geofence Your Cocoa Plot
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-full p-2 text-[#57655d] hover:bg-[#f7f8f3] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4 text-xs">
              <div className="flex gap-3 rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b3528] font-bold text-white">1</div>
                <div>
                  <strong className="block text-sm text-[#10251d]">Stand at Starting Corner</strong>
                  <p className="mt-1 text-[#57655d]">Position yourself at a distinct corner post with clear line-of-sight to the sky.</p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] font-bold text-white">2</div>
                <div>
                  <strong className="block text-sm text-[#10251d]">Walk Steady Along the Boundary</strong>
                  <p className="mt-1 text-[#57655d]">Follow the outer edge of your cocoa trees. Points log automatically every 4 meters.</p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2d6130] font-bold text-white">3</div>
                <div>
                  <strong className="block text-sm text-[#10251d]">Pause at Turning Vertices</strong>
                  <p className="mt-1 text-[#57655d]">Pause for 3 seconds whenever you turn a corner to let the GPS settle.</p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl bg-[#fafcf9] p-4 border border-[#edf1ea]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#073b2b] font-bold text-[#b8f58b]">4</div>
                <div>
                  <strong className="block text-sm text-[#10251d]">Return to Start &amp; Finish</strong>
                  <p className="mt-1 text-[#57655d]">Complete your perimeter circuit and tap Finish to calculate Hectares.</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-full bg-[#0b3528] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#07241b] cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-[100] flex flex-col bg-[#051c14] text-white'
            : 'mx-auto max-w-2xl space-y-4 rounded-[32px] border border-[#dfe7d8] bg-white p-6 shadow-xl'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf1ea] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
                EUDR Article 9 Compliance
              </span>
              <div className="flex items-center gap-1 text-[0.68rem] text-[#57655d]">
                <Activity size={12} />
                <span>{currentAccuracy !== null ? `Accuracy: ±${currentAccuracy}m` : 'Offline Canopy Mode'}</span>
              </div>
            </div>
            <h2 className="text-xl font-bold text-[#10251d]">{farmName} Geofence</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1 rounded-full bg-[#edf7e8] px-3 py-1.5 text-xs font-bold text-[#2d6130] hover:bg-[#dfe7d8] cursor-pointer"
            >
              <HelpCircle size={13} /> Field Walk Guide
            </button>

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="inline-flex items-center gap-1 rounded-full bg-[#0b3528] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#07241b] cursor-pointer"
            >
              {isFullScreen ? (
                <>
                  <Minimize2 size={13} /> Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize2 size={13} /> Fullscreen Mode
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mapbox Container */}
        <div
          ref={mapContainerRef}
          className={`relative w-full overflow-hidden rounded-2xl border border-[#dfe7d8] bg-[#062d22] ${
            isFullScreen ? 'flex-1 min-h-[500px]' : 'h-80'
          }`}
        >
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-[0.68rem] font-medium text-[#b8f58b] backdrop-blur-md">
            <Navigation size={12} />
            <span>High-Resolution Satellite Canvas</span>
          </div>
        </div>

        {/* Status / Accuracy */}
        <div className="flex items-center justify-between rounded-xl border border-[#edf1ea] bg-[#f9fbf7] p-3 text-xs text-[#4b594f]">
          <span>
            Logged Boundary Pins: <strong className="font-bold text-[#0b3528]">{pointCount}</strong>
          </span>
          {signalWarning && (
            <span className="flex items-center gap-1 font-semibold text-amber-700 animate-pulse">
              <AlertTriangle size={13} /> Canopy signal degradation detected (&gt;10m)
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {!isTracking ? (
            <button
              type="button"
              onClick={startTracking}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#2d6130] px-4 py-3 text-xs font-bold text-white shadow transition hover:bg-[#224b25] cursor-pointer"
            >
              <Play size={14} /> Start Walking Perimeter
            </button>
          ) : (
            <button
              type="button"
              onClick={stopTracking}
              disabled={isSimulating}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#c53b27] px-4 py-3 text-xs font-bold text-white shadow transition hover:bg-[#a32e1c] cursor-pointer animate-pulse"
            >
              <Square size={14} /> Finish &amp; Calculate Size
            </button>
          )}

          <button
            type="button"
            onClick={runSimulatedWalk}
            disabled={isTracking}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#dfe7d8] bg-[#edf7e8] px-4 py-3 text-xs font-semibold text-[#0b3528] transition hover:bg-[#dfe7d8] cursor-pointer"
          >
            <RefreshCw size={13} className={isSimulating ? 'animate-spin' : ''} />
            {isSimulating ? 'Simulating...' : 'Simulate 6-Point Walk'}
          </button>

          {pointCount > 0 && !isTracking && (
            <button
              type="button"
              onClick={clearPoints}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-[#c53b27] hover:bg-red-100 cursor-pointer"
            >
              Reset Points
            </button>
          )}
        </div>

        {calculatedArea && (
          <div className="space-y-2 rounded-2xl border border-[#b8f58b] bg-[#edf7e8] p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#2d6130]">
              <CheckCircle2 size={15} /> Final Farm Boundary Computed
            </div>
            <p className="text-3xl font-extrabold text-[#0b3528]">{calculatedArea} Ha</p>
            <p className="text-xs text-[#57655d]">
              Polygon perimeter closed with {pointCount} geolocation anchors.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
