"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, Maximize2, Crosshair } from "lucide-react";
import { MAPBOX_TOKEN, getMapStyle } from "@/lib/mapStyles";

export interface PlotPolygonData {
  id: string;
  name: string;
  polygon: [number, number][]; // [lng, lat]
  areaHa?: number;
  color?: string;
  region?: string;
}

interface MapboxGeofenceMapProps {
  initialCenter?: [number, number]; // [lng, lat]
  initialZoom?: number;
  activePolygon?: [number, number][]; // Current active drawing polygon [lng, lat][]
  existingPlots?: PlotPolygonData[]; // Other registered farm plots
  breadcrumbs?: [number, number][]; // Live GPS walk trail [lng, lat][]
  isWalking?: boolean;
  currentPosition?: [number, number] | null;
  interactiveDrawing?: boolean;
  autoFollowUser?: boolean;
  onPolygonChange?: (polygon: [number, number][]) => void;
  heightClass?: string;
  selectedPlotId?: string | null;
  onSelectPlot?: (plotId: string) => void;
}

export default function MapboxGeofenceMap({
  initialCenter = [9.1245, 4.5912], // Default Cameroon Cocoa Belt
  initialZoom = 15,
  activePolygon = [],
  existingPlots = [],
  breadcrumbs = [],
  isWalking = false,
  currentPosition = null,
  interactiveDrawing = false,
  autoFollowUser = true,
  onPolygonChange,
  heightClass = "h-[420px]",
  selectedPlotId,
  onSelectPlot,
}: MapboxGeofenceMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasNavigatedToUserRef = useRef(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<"satellite" | "streets" | "outdoors">("satellite");
  const [clickToAddEnabled, setClickToAddEnabled] = useState(interactiveDrawing);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (MAPBOX_TOKEN) {
      mapboxgl.accessToken = MAPBOX_TOKEN;
    }

    const startCenter = currentPosition || initialCenter;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(mapStyle),
      center: startCenter,
      zoom: initialZoom,
      pitch: 30,
      attributionControl: false, // Disables Mapbox default attribution control
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      setMapLoaded(true);
      mapRef.current = map;
      map.resize();

      if (currentPosition) {
        map.flyTo({ center: currentPosition, zoom: 16.5, essential: true, duration: 1000 });
      }
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
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle Style Switch
  const switchStyle = (newStyle: "satellite" | "streets" | "outdoors") => {
    setMapStyle(newStyle);
    if (mapRef.current) {
      mapRef.current.setStyle(getMapStyle(newStyle));
    }
  };

  // Automatically navigate camera to user's location when GPS fix updates or walking
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !currentPosition) return;

    if (isWalking || (!hasNavigatedToUserRef.current && autoFollowUser)) {
      hasNavigatedToUserRef.current = true;
      mapRef.current.flyTo({
        center: currentPosition,
        zoom: Math.max(mapRef.current.getZoom(), 16.5),
        essential: true,
        duration: isWalking ? 800 : 1200,
      });
    }
  }, [currentPosition, isWalking, mapLoaded, autoFollowUser]);

  // Map Click Handler for Interactive Point Placement
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (!clickToAddEnabled || isWalking) return;
      const newCoord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const updated = [...activePolygon, newCoord];
      if (onPolygonChange) {
        onPolygonChange(updated);
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [mapLoaded, clickToAddEnabled, activePolygon, isWalking, onPolygonChange]);

  // Update Layers, Polygons, and Markers
  const updateMapLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // 1. Render Existing Plots
    existingPlots.forEach((plot, index) => {
      const sourceId = `existing-plot-source-${plot.id || index}`;
      const fillLayerId = `existing-plot-fill-${plot.id || index}`;
      const lineLayerId = `existing-plot-line-${plot.id || index}`;

      if (plot.polygon && plot.polygon.length >= 3) {
        const closed = [...plot.polygon];
        if (
          closed[0][0] !== closed[closed.length - 1][0] ||
          closed[0][1] !== closed[closed.length - 1][1]
        ) {
          closed.push(closed[0]);
        }

        const geojsonData: GeoJSON.Feature<GeoJSON.Polygon> = {
          type: "Feature",
          properties: { id: plot.id, name: plot.name },
          geometry: {
            type: "Polygon",
            coordinates: [closed],
          },
        };

        if (map.getSource(sourceId)) {
          (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geojsonData);
        } else {
          map.addSource(sourceId, {
            type: "geojson",
            data: geojsonData,
          });

          map.addLayer({
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": plot.color || "#22c55e",
              "fill-opacity": selectedPlotId === plot.id ? 0.55 : 0.3,
            },
          });

          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": plot.color || "#15803d",
              "line-width": selectedPlotId === plot.id ? 3.5 : 2,
            },
          });

          map.on("click", fillLayerId, () => {
            if (onSelectPlot) onSelectPlot(plot.id);
          });
        }
      }
    });

    // 2. Render Active Polygon being mapped
    const activeSourceId = "active-polygon-source";
    const activeFillId = "active-polygon-fill";
    const activeLineId = "active-polygon-line";

    if (activePolygon.length >= 3) {
      const closed = [...activePolygon];
      if (
        closed[0][0] !== closed[closed.length - 1][0] ||
        closed[0][1] !== closed[closed.length - 1][1]
      ) {
        closed.push(closed[0]);
      }

      const activeGeoJSON: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [closed],
        },
      };

      if (map.getSource(activeSourceId)) {
        (map.getSource(activeSourceId) as mapboxgl.GeoJSONSource).setData(activeGeoJSON);
      } else {
        map.addSource(activeSourceId, {
          type: "geojson",
          data: activeGeoJSON,
        });

        map.addLayer({
          id: activeFillId,
          type: "fill",
          source: activeSourceId,
          paint: {
            "fill-color": "#b8f58b",
            "fill-opacity": 0.4,
          },
        });

        map.addLayer({
          id: activeLineId,
          type: "line",
          source: activeSourceId,
          paint: {
            "line-color": "#b8f58b",
            "line-width": 3.5,
          },
        });
      }
    } else if (activePolygon.length >= 2) {
      const lineGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: activePolygon,
        },
      };

      if (map.getSource(activeSourceId)) {
        (map.getSource(activeSourceId) as mapboxgl.GeoJSONSource).setData(lineGeoJSON);
      } else {
        map.addSource(activeSourceId, {
          type: "geojson",
          data: lineGeoJSON,
        });

        map.addLayer({
          id: activeLineId,
          type: "line",
          source: activeSourceId,
          paint: {
            "line-color": "#b8f58b",
            "line-width": 3,
            "line-dasharray": [2, 1],
          },
        });
      }
    }

    // 3. Render Breadcrumb Path (Canopy Walk trail)
    const breadcrumbSourceId = "breadcrumb-trail-source";
    const breadcrumbLineId = "breadcrumb-trail-line";

    if (breadcrumbs.length >= 2) {
      const lineGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: breadcrumbs,
        },
      };

      if (map.getSource(breadcrumbSourceId)) {
        (map.getSource(breadcrumbSourceId) as mapboxgl.GeoJSONSource).setData(lineGeoJSON);
      } else {
        map.addSource(breadcrumbSourceId, {
          type: "geojson",
          data: lineGeoJSON,
        });

        map.addLayer({
          id: breadcrumbLineId,
          type: "line",
          source: breadcrumbSourceId,
          paint: {
            "line-color": "#eab308",
            "line-width": 4,
            "line-opacity": 0.9,
          },
        });
      }
    }

    // 4. Update Turning Point Vertex Markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    activePolygon.forEach((coord, idx) => {
      const el = document.createElement("div");
      el.className =
        "flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#0b3528] text-[10px] font-bold text-[#b8f58b] shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform";
      el.innerText = `${idx + 1}`;

      const marker = new mapboxgl.Marker({ element: el, draggable: !isWalking })
        .setLngLat(coord)
        .addTo(map);

      marker.on("dragend", () => {
        const newLngLat = marker.getLngLat();
        const updated = [...activePolygon];
        updated[idx] = [newLngLat.lng, newLngLat.lat];
        if (onPolygonChange) onPolygonChange(updated);
      });

      markersRef.current.push(marker);
    });

    // 5. User Current Position Marker (Pulsating Live GPS Radar Marker)
    if (currentPosition) {
      if (!userMarkerRef.current) {
        const userEl = document.createElement("div");
        userEl.className = "relative flex h-6 w-6 items-center justify-center pointer-events-none";
        userEl.innerHTML = `
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
          <span class="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-lg"></span>
        `;
        userMarkerRef.current = new mapboxgl.Marker({ element: userEl })
          .setLngLat(currentPosition)
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat(currentPosition);
      }
    }
  }, [
    mapLoaded,
    existingPlots,
    activePolygon,
    breadcrumbs,
    currentPosition,
    isWalking,
    selectedPlotId,
    onPolygonChange,
    onSelectPlot,
  ]);

  useEffect(() => {
    updateMapLayers();
  }, [updateMapLayers]);

  // Navigate directly to user's location
  const handleLocateMe = () => {
    const map = mapRef.current;
    if (!map) return;

    if (currentPosition) {
      map.flyTo({ center: currentPosition, zoom: 17, essential: true, duration: 1000 });
    } else if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
          map.flyTo({ center: coords, zoom: 17, essential: true, duration: 1000 });
        },
        (err) => console.warn("Locate error:", err.message),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  // Fit bounds helper
  const fitBoundsToPolygon = () => {
    const map = mapRef.current;
    if (!map) return;

    const coordsToFit = activePolygon.length > 0 ? activePolygon : breadcrumbs;
    if (coordsToFit.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds();
      coordsToFit.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 40, maxZoom: 18, duration: 1000 });
    } else if (currentPosition) {
      map.flyTo({ center: currentPosition, zoom: 17, duration: 1000 });
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-[#dfe7d8] bg-[#07241b] shadow-inner">
      {/* Mapbox Container */}
      <div ref={mapContainerRef} className={`w-full ${heightClass}`} />

      {/* Floating Control Bar Overlay */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/20 bg-[#062d22]/90 p-1.5 backdrop-blur-md text-white shadow-lg">
        {/* Style Selector */}
        <div className="flex rounded-xl bg-white/10 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => switchStyle("satellite")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
              mapStyle === "satellite"
                ? "bg-[#b8f58b] text-[#073b2b]"
                : "text-white/80 hover:text-white"
            }`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => switchStyle("streets")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
              mapStyle === "streets"
                ? "bg-[#b8f58b] text-[#073b2b]"
                : "text-white/80 hover:text-white"
            }`}
          >
            Vector
          </button>
          <button
            type="button"
            onClick={() => switchStyle("outdoors")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
              mapStyle === "outdoors"
                ? "bg-[#b8f58b] text-[#073b2b]"
                : "text-white/80 hover:text-white"
            }`}
          >
            Terrain
          </button>
        </div>

        {/* Locate User Current GPS Button */}
        <button
          type="button"
          onClick={handleLocateMe}
          title="Navigate to My Current Location"
          className="flex items-center gap-1 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2.5 py-1 text-[11px] font-semibold transition hover:bg-sky-500/30 cursor-pointer"
        >
          <Crosshair size={12} className="animate-spin-slow" /> My Location
        </button>

        {/* Fit Bounds Button */}
        {(activePolygon.length > 0 || breadcrumbs.length > 0) && (
          <button
            type="button"
            onClick={fitBoundsToPolygon}
            title="Focus on Farm Perimeter"
            className="flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20 cursor-pointer"
          >
            <Maximize2 size={12} /> Focus Plot
          </button>
        )}

        {/* Click to add points mode toggle */}
        {!isWalking && (
          <button
            type="button"
            onClick={() => setClickToAddEnabled(!clickToAddEnabled)}
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
              clickToAddEnabled
                ? "bg-[#2d6130] text-[#b8f58b] ring-1 ring-[#b8f58b]/40"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <MapPin size={12} />
            {clickToAddEnabled ? "Click Map to Add Point" : "Add Points Enabled"}
          </button>
        )}
      </div>

      {/* Live Walking Status Pill */}
      {isWalking && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-2xl border border-yellow-400/40 bg-black/75 px-3 py-1.5 backdrop-blur-md text-xs font-bold text-yellow-300 shadow-xl">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500"></span>
          </span>
          GPS Tracking Active ({breadcrumbs.length} breadcrumbs)
        </div>
      )}

      {/* Bottom Summary Pill */}
      {activePolygon.length > 0 && (
        <div className="absolute bottom-3 right-3 z-10 rounded-2xl border border-white/20 bg-[#062d22]/90 px-3.5 py-2 backdrop-blur-md text-xs text-white shadow-xl">
          <span className="text-[10px] text-white/70 uppercase font-semibold block">Boundary Vertices</span>
          <span className="font-bold text-[#b8f58b]">{activePolygon.length} Points Logged</span>
        </div>
      )}
    </div>
  );
}
