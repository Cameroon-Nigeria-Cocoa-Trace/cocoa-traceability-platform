'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Dexie, { type Table } from 'dexie';
import * as turf from '@turf/turf';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Square, AlertTriangle, ShieldCheck, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
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

    // Pan map to latest coordinate point
    const latestPoint = coordinates[coordinates.length - 1];
    map.flyTo({ center: [latestPoint[0], latestPoint[1]], zoom: 16.5, essential: true });

    const geoJsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };

    if (coordinates.length >= 3) {
      // Close polygon loop for Turf/Mapbox
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
      // Render as a line string until it forms a valid shape
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
      center: [9.2612, 4.1534], // Cameroon Cocoa Belt default coordinates
      zoom: 15,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add source for the geofence perimeter line/polygon
      if (!map.getSource('geofence')) {
        map.addSource('geofence', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });

        // Add visualization layer - Fill
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

        // Add outline stroke
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

      // Check for existing saved points in IndexedDB
      db.breadcrumbs
        .where('farmId')
        .equals(farmId)
        .toArray()
        .then((pts) => {
          if (pts.length > 0) {
            setPointCount(pts.length);
            updateMapVisualization();
          }
        });
    });

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, [farmId, updateMapVisualization]);

  const handleNewCoordinate = useCallback(
    async (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      setCurrentAccuracy(Math.round(accuracy));

      // Tree canopy GPS degradation filter (> 10m)
      if (accuracy > 10) {
        setSignalWarning(true);
        return;
      }
      setSignalWarning(false);

      const currentPoint: [number, number] = [longitude, latitude];

      if (!lastSavedPointRef.current) {
        lastSavedPointRef.current = currentPoint;
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
      const to = turf.point(currentPoint);
      const distanceInMeters = turf.distance(from, to, { units: 'meters' });

      // Minimum 4m threshold between consecutive boundary pins
      if (distanceInMeters >= 4) {
        lastSavedPointRef.current = currentPoint;
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
    },
    [farmId, updateMapVisualization]
  );

  const startTracking = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Your browser or device does not support GPS tracking.');
      return;
    }

    setIsTracking(true);
    setCalculatedArea(null);
    lastSavedPointRef.current = null;

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleNewCoordinate,
      (err) => console.error('GPS Error: ', err.message),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const stopTracking = async () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);

    const rawPoints = await db.breadcrumbs.where('farmId').equals(farmId).toArray();

    if (rawPoints.length < 3) {
      alert('A farm boundary requires a minimum of 3 logged turning points.');
      return;
    }

    const coordinates: [number, number][] = rawPoints.map((p) => [p.lng, p.lat]);
    coordinates.push(coordinates[0]);

    const farmPolygon = turf.polygon([coordinates]);
    const areaInSqMeters = turf.area(farmPolygon);
    const areaInHectares = (areaInSqMeters / 10000).toFixed(2);

    setCalculatedArea(areaInHectares);
    await updateMapVisualization();

    if (onComplete) {
      onComplete({
        polygon: rawPoints.map((p) => [p.lng, p.lat]),
        areaHa: parseFloat(areaInHectares),
        pointCount: rawPoints.length,
      });
    }
  };

  // Demo simulation for testing without walking a physical field
  const runSimulatedWalk = async () => {
    setIsSimulating(true);
    setIsTracking(true);
    await db.breadcrumbs.where('farmId').equals(farmId).delete();
    setPointCount(0);
    setCalculatedArea(null);

    // Mock polygon around Mount Cameroon cocoa zone
    const simVertices: [number, number][] = [
      [9.2612, 4.1534],
      [9.2638, 4.1539],
      [9.2651, 4.1518],
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
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-[#dfe7d8] bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#2d6130]">
            EUDR Article 9 Compliance
          </span>
          <h2 className="text-xl font-bold text-[#10251d]">Step 5: Map Farm Geofence</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-semibold text-[#2d6130]">
          <ShieldCheck size={14} />
          <span>{farmName}</span>
        </div>
      </div>

      {/* Mapbox Container View Canvas Element */}
      <div
        ref={mapContainerRef}
        className="relative h-72 w-full overflow-hidden rounded-xl border border-[#dfe7d8] bg-[#062d22]"
      >
        <div className="absolute top-2 left-2 z-10 rounded-lg bg-black/60 px-2.5 py-1 text-[0.68rem] font-medium text-[#b8f58b] backdrop-blur-md">
          🛰️ Mapbox Satellite (High-Resolution Imagery)
        </div>
      </div>

      <div className="rounded-xl border border-[#edf1ea] bg-[#f9fbf7] p-4">
        <div className="flex items-center justify-between text-sm font-medium text-[#4b594f]">
          <span>
            Logged Boundary Pins:{' '}
            <strong className="font-bold text-[#0b3528]">{pointCount}</strong>
          </span>
          {currentAccuracy !== null && (
            <span className="text-xs text-[#6f7e73]">
              Accuracy: <strong className="text-[#10251d]">{currentAccuracy}m</strong>
            </span>
          )}
        </div>

        {signalWarning && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 animate-pulse">
            <AlertTriangle size={14} />
            <span>Signal degraded by tree canopy. Move closer to the boundary perimeter clearing...</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {!isTracking ? (
          <button
            type="button"
            onClick={startTracking}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2d6130] px-4 py-3 font-bold text-white shadow transition hover:bg-[#224b25] active:scale-[0.98] cursor-pointer"
          >
            <Play size={16} />
            Start Walking Perimeter
          </button>
        ) : (
          <button
            type="button"
            onClick={stopTracking}
            disabled={isSimulating}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#c53b27] px-4 py-3 font-bold text-white shadow transition hover:bg-[#a32e1c] active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            <Square size={16} />
            Finish & Calculate Size
          </button>
        )}

        <button
          type="button"
          onClick={runSimulatedWalk}
          disabled={isTracking}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#dfe7d8] bg-[#edf7e8] px-4 py-3 font-semibold text-[#0b3528] transition hover:bg-[#dfe7d8] active:scale-[0.98] cursor-pointer disabled:opacity-50 text-xs"
        >
          <RefreshCw size={14} className={isSimulating ? 'animate-spin' : ''} />
          {isSimulating ? 'Walking Perimeter...' : 'Simulate 6-Point Walk'}
        </button>
      </div>

      {pointCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearPoints}
            className="text-xs font-medium text-[#c53b27] hover:underline cursor-pointer"
          >
            Reset points
          </button>
        </div>
      )}

      {calculatedArea && (
        <div className="space-y-3 rounded-xl border border-[#b8f58b] bg-[#edf7e8] p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#2d6130]">
            <CheckCircle2 size={15} /> Final Farm Boundary Computed
          </div>
          <p className="text-3xl font-extrabold text-[#0b3528]">{calculatedArea} Ha</p>
          <p className="text-xs text-[#57655d]">
            Polygon perimeter closed with {pointCount} geolocation anchors. Stored in IndexedDB for
            offline field syncing.
          </p>

          <Link
            href="/dashboard"
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#0b3528] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#164635]"
          >
            Continue to Farm Dashboard <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
