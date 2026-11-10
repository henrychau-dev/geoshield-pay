export type Decision = "PASS" | "BUFFER" | "BLOCK";

export type OrderStatus =
  | "PENDING_PRECHECK"
  | "BLOCKED"
  | "BUFFERING"
  | "CONFIRMED"
  | "VOIDED"
  | "EXPIRED"
  | "FAILED";

export interface GeoContext {
  ip: string;
  ipCountry: string | null;
  ipCity: string | null;
  ipLat: number | null;
  ipLng: number | null;
  isProxyOrVpn: boolean;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsCountry: string | null;
  distanceKm: number | null;
}

export interface RiskSignalInput {
  geo: GeoContext;
  billingCountry: string;
  shippingCountry: string;
  accountCountry: string;
  amount: number;
}

export interface RuleHit {
  rule: string;
  detail: string;
  impact: "positive" | "negative";
}

export interface EngineResult {
  decision: Decision;
  ruleHits: RuleHit[];
  ruleScore: number; // 0-100 heuristic risk
  reasons: string[];
}

export interface RuleConfig {
  geoLock: {
    enabled: boolean;
    maxDistanceKm: number;
    /** strictMode: proxy/VPN alone triggers hard BLOCK */
    strictMode: boolean;
  };
  bufferCabin: {
    enabled: boolean;
    countdownHours: number;
    triggerWhen: "three-country-mismatch";
  };
  thresholds: {
    maxAmount: number;
    action: "BLOCK" | "BUFFER" | "PASS";
  };
  blacklists: { countries: string[]; ips: string[] };
  whitelists: { countries: string[]; ips: string[] };
}

export const DEFAULT_RULES: RuleConfig = {
  geoLock: { enabled: true, maxDistanceKm: 500, strictMode: true },
  bufferCabin: { enabled: true, countdownHours: 72, triggerWhen: "three-country-mismatch" },
  thresholds: { maxAmount: 2000, action: "BUFFER" },
  blacklists: { countries: ["KP", "IR", "SY"], ips: [] },
  whitelists: { countries: [], ips: [] },
};

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany", FR: "France",
  SG: "Singapore", HK: "Hong Kong", CN: "China", JP: "Japan", KR: "South Korea",
  AU: "Australia", CA: "Canada", IN: "India", BR: "Brazil", RU: "Russia",
  NL: "Netherlands", KP: "North Korea", IR: "Iran", SY: "Syria", NG: "Nigeria",
  UA: "Ukraine", VN: "Vietnam", TH: "Thailand", MY: "Malaysia", TW: "Taiwan",
};

export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  return COUNTRY_NAMES[code] ?? code;
}
