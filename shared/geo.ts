/**
 * Geo distance math for reverse geocoding.
 *
 * Pure, no DOM or runtime deps — safe to import from both the Workers runtime
 * and the browser bundle.
 */

/** Earth's mean radius in metres. */
export const EARTH_RADIUS_METRES = 6_371_000.0;

/** Beyond this distance (metres), reverse geocode returns no match. */
export const MAX_REVERSE_DISTANCE_METERS = 5000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates, in metres (haversine,
 * R = 6 371 000).
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a = sinDLat * sinDLat + Math.cos(φ1) * Math.cos(φ2) * sinDLng * sinDLng;
  return EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
