import type { GeoContext } from "@/types";

export interface IpGeoResult {
  ip: string;
  country: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  isProxyOrVpn: boolean;
  fromCache: boolean;
}

interface CacheEntry {
  data: IpGeoResult;
  ts: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CacheEntry>();

export function isLocalAddress(ip: string): boolean {
  return (
    !ip ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("::ffff:127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip === "unknown"
  );
}

/**
 * Resolve the customer's public IP from request headers.
 * DEMO_MODE allows an x-demo-ip override so the hackathon demo can simulate
 * customers from anywhere in the world.
 */
export function extractClientIp(headers: Headers): string {
  if (process.env.DEMO_MODE === "true") {
    const demoIp = headers.get("x-demo-ip");
    if (demoIp && !isLocalAddress(demoIp)) return demoIp.trim();
  }
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Look up IP geolocation via ip-api.com with a 1h in-memory cache. */
export async function lookupIp(ip: string): Promise<IpGeoResult> {
  if (isLocalAddress(ip)) {
    const fallback = process.env.DEMO_FALLBACK_IP || "8.8.8.8";
    ip = fallback;
  }

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.ts < TTL_MS) return { ...hit.data, fromCache: true };

  const empty: IpGeoResult = {
    ip, country: null, city: null, lat: null, lng: null,
    isProxyOrVpn: false, fromCache: false,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const fields = "status,message,country,countryCode,lat,lon,city,proxy,hosting,query";
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`,
      { signal: controller.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) return empty;
    const data = await res.json();
    if (data.status !== "success") return empty;

    const result: IpGeoResult = {
      ip: data.query ?? ip,
      country: data.countryCode ?? null,
      city: data.city ?? null,
      lat: typeof data.lat === "number" ? data.lat : null,
      lng: typeof data.lon === "number" ? data.lon : null,
      isProxyOrVpn: Boolean(data.proxy || data.hosting),
      fromCache: false,
    };
    cache.set(ip, { data: result, ts: Date.now() });
    return result;
  } catch {
    return empty;
  }
}

/** Reverse geocode GPS coordinates to a country (free, key-less BigDataCloud endpoint). */
export async function reverseGeocodeCountry(
  lat: number,
  lng: number
): Promise<string | null> {
  const key = `gps:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data.country;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const code: string | null = data.countryCode ?? null;
    cache.set(key, { data: { ip: "", country: code, city: null, lat, lng, isProxyOrVpn: false, fromCache: false }, ts: Date.now() });
    return code;
  } catch {
    return null;
  }
}

/** Build the full geo context for a checkout request. */
export async function buildGeoContext(
  ip: string,
  gpsLat: number | null,
  gpsLng: number | null
): Promise<GeoContext> {
  const ipGeo = await lookupIp(ip);
  const gpsCountry =
    gpsLat != null && gpsLng != null
      ? await reverseGeocodeCountry(gpsLat, gpsLng)
      : null;
  const distanceKm =
    ipGeo.lat != null && ipGeo.lng != null && gpsLat != null && gpsLng != null
      ? haversineKm(ipGeo.lat, ipGeo.lng, gpsLat, gpsLng)
      : null;

  return {
    ip: ipGeo.ip,
    ipCountry: ipGeo.country,
    ipCity: ipGeo.city,
    ipLat: ipGeo.lat,
    ipLng: ipGeo.lng,
    isProxyOrVpn: ipGeo.isProxyOrVpn,
    gpsLat,
    gpsLng,
    gpsCountry,
    distanceKm,
  };
}

/** Great-circle distance between two points in kilometers. */
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
