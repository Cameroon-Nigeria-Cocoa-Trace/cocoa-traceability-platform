import { FarmRecord } from "@/context/FirebaseContext";
import * as turf from "@turf/turf";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  conflictFarm?: FarmRecord;
  distanceMeters?: number;
  message?: string;
  reason?: "exact_geolocation" | "proximity_threshold" | "polygon_overlap" | "vertex_match";
}

export type PolygonPointInput = [number, number] | { lat?: number; latitude?: number; lng?: number; longitude?: number };

/**
 * Parses GPS string formats like "4.5821° N, 9.0432° E" or "4.5821, 9.0432" into numeric lat/lng
 */
export function parseCoordsString(str?: string): { lat: number; lng: number } | null {
  if (!str) return null;
  const numbers = str.match(/[-+]?\d*\.?\d+/g);
  if (numbers && numbers.length >= 2) {
    let lat = parseFloat(numbers[0]);
    let lng = parseFloat(numbers[1]);

    if (/S/i.test(str) && lat > 0) lat = -lat;
    if (/W/i.test(str) && lng > 0) lng = -lng;

    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

/**
 * Calculates distance between two GPS coordinates in meters using Haversine formula
 */
export function calculateHaversineDistanceMeters(
  c1: { lat: number; lng: number },
  c2: { lat: number; lng: number }
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalizes polygon into [lng, lat][] coordinate array for Turf
 */
export function normalizePolygonTurf(rawPoly?: PolygonPointInput[]): [number, number][] {
  if (!rawPoly || !Array.isArray(rawPoly) || rawPoly.length === 0) return [];

  return rawPoly.map((pt) => {
    if (Array.isArray(pt)) {
      return [Number(pt[1] ?? pt[0]), Number(pt[0])]; // [lng, lat]
    }
    if (typeof pt === "object" && pt !== null) {
      const lat = Number(pt.lat ?? pt.latitude ?? 0);
      const lng = Number(pt.lng ?? pt.longitude ?? 0);
      return [lng, lat];
    }
    return [0, 0];
  });
}

/**
 * Safeguard check: Evaluates whether candidate farm coordinates or polygon overlap with existing registered farms
 * @param candidate Farm data to register
 * @param existingFarms List of registered farms in Firestore / local queue
 * @param proximityThresholdMeters Distance threshold in meters (default 25 meters)
 */
export function checkDuplicateCoordinates(
  candidate: {
    farmName?: string;
    geolocation?: string;
    geofencePolygon?: PolygonPointInput[];
    farmId?: string;
  },
  existingFarms: FarmRecord[],
  proximityThresholdMeters: number = 25
): DuplicateCheckResult {
  if (!existingFarms || existingFarms.length === 0) {
    return { isDuplicate: false };
  }

  const candidateCoords = parseCoordsString(candidate.geolocation);
  const candidatePolyCoords = normalizePolygonTurf(candidate.geofencePolygon);

  for (const existing of existingFarms) {
    // Skip comparing against self when updating
    if (candidate.farmId && existing.id === candidate.farmId) continue;

    const existingCoords = parseCoordsString(existing.geolocation);
    const existingPolyCoords = normalizePolygonTurf(existing.geofencePolygon as PolygonPointInput[]);

    // 1. Exact string match check
    if (
      candidate.geolocation &&
      existing.geolocation &&
      candidate.geolocation.trim().toLowerCase() === existing.geolocation.trim().toLowerCase()
    ) {
      return {
        isDuplicate: true,
        conflictFarm: existing,
        distanceMeters: 0,
        reason: "exact_geolocation",
        message: `Duplicate Coordinate Alert: A farm plot ("${existing.farmName}") has already been registered with exact location coordinates "${existing.geolocation}".`,
      };
    }

    // 2. Point Proximity Check (within threshold e.g. 25m)
    if (candidateCoords && existingCoords) {
      const distance = calculateHaversineDistanceMeters(candidateCoords, existingCoords);
      if (distance <= proximityThresholdMeters) {
        return {
          isDuplicate: true,
          conflictFarm: existing,
          distanceMeters: Math.round(distance),
          reason: "proximity_threshold",
          message: `Duplicate Location Alert: Coordinates are only ${Math.round(distance)}m away from registered plot "${existing.farmName}" (Threshold: ${proximityThresholdMeters}m).`,
        };
      }
    }

    // 3. Geofence Polygon Overlap / Vertex Proximity Check using Turf
    if (candidatePolyCoords.length >= 3 && existingPolyCoords.length >= 3) {
      try {
        // Ensure closed linear rings
        const ring1 = [...candidatePolyCoords];
        if (ring1[0][0] !== ring1[ring1.length - 1][0] || ring1[0][1] !== ring1[ring1.length - 1][1]) {
          ring1.push(ring1[0]);
        }
        const ring2 = [...existingPolyCoords];
        if (ring2[0][0] !== ring2[ring2.length - 1][0] || ring2[0][1] !== ring2[ring2.length - 1][1]) {
          ring2.push(ring2[0]);
        }

        const poly1 = turf.polygon([ring1]);
        const poly2 = turf.polygon([ring2]);

        const overlaps = turf.booleanOverlap(poly1, poly2) || turf.booleanContains(poly1, poly2) || turf.booleanContains(poly2, poly1);
        if (overlaps) {
          return {
            isDuplicate: true,
            conflictFarm: existing,
            reason: "polygon_overlap",
            message: `Spatial Duplicate Safeguard: Geofence polygon directly overlaps with registered farm plot "${existing.farmName}". EUDR rules prohibit registering overlapping plot polygons.`,
          };
        }

        // Check vertex proximity between polygon points
        for (const pt1 of candidatePolyCoords) {
          for (const pt2 of existingPolyCoords) {
            const dist = calculateHaversineDistanceMeters(
              { lat: pt1[1], lng: pt1[0] },
              { lat: pt2[1], lng: pt2[0] }
            );
            if (dist <= proximityThresholdMeters) {
              return {
                isDuplicate: true,
                conflictFarm: existing,
                distanceMeters: Math.round(dist),
                reason: "vertex_match",
                message: `Polygon Boundary Alert: Geofence boundary point is ${Math.round(dist)}m from plot "${existing.farmName}".`,
              };
            }
          }
        }
      } catch (err) {
        console.warn("Turf polygon check warning:", err);
      }
    }
  }

  return { isDuplicate: false };
}
