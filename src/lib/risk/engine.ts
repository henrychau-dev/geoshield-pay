import type { RiskSignalInput, EngineResult, RuleHit } from "@/types";
import { getRules } from "@/lib/rules/store";

/**
 * Synchronous, in-memory rule evaluation — the hot path of the pre-transaction
 * shield. Runs in milliseconds, before any PayPal order is created.
 */
export async function evaluateRisk(signal: RiskSignalInput): Promise<EngineResult> {
  const rules = await getRules();
  const hits: RuleHit[] = [];
  const reasons: string[] = [];
  let score = 0;
  let decision: EngineResult["decision"] = "PASS";

  const {
    geo,
    billingCountry,
    shippingCountry,
    accountCountry,
    amount,
  } = signal;

  const countries = [geo.ipCountry, geo.gpsCountry, billingCountry, shippingCountry, accountCountry]
    .filter((c): c is string => Boolean(c));

  // 1. Whitelist fast-path — only for customers with NO geo red flags.
  //    A whitelist match must never override hard signals (proxy, distance,
  //    country mismatch), otherwise fraudsters ride a trusted country to PASS.
  const onWhitelist =
    (geo.ip && rules.whitelists.ips.includes(geo.ip)) ||
    countries.some((c) => rules.whitelists.countries.includes(c));
  const threeCountryConsistent = (() => {
    const trio = [accountCountry, billingCountry, shippingCountry];
    return !trio.some((c) => c && c !== trio[0]);
  })();
  const geoClean =
    !geo.isProxyOrVpn &&
    (geo.distanceKm == null || geo.distanceKm <= rules.geoLock.maxDistanceKm);

  if (onWhitelist) {
    if (geoClean && threeCountryConsistent) {
      hits.push({ rule: "whitelist.match", detail: "Known-good customer matched whitelist — bypassed", impact: "positive" });
      reasons.push("Whitelisted customer bypassed all checks");
      return { decision: "PASS", ruleHits: hits, ruleScore: 2, reasons };
    }
    hits.push({
      rule: "whitelist.conflict",
      detail: "Whitelist match overridden by geo red flags — continuing full evaluation",
      impact: "positive",
    });
  }

  // 2. Blacklist hard block
  if (geo.ip && rules.blacklists.ips.includes(geo.ip)) {
    hits.push({ rule: "blacklist.ip", detail: `IP ${geo.ip} is blacklisted`, impact: "negative" });
    decision = "BLOCK";
    score = 100;
    reasons.push("IP address is blacklisted");
  }
  if (geo.ipCountry && rules.blacklists.countries.includes(geo.ipCountry)) {
    hits.push({ rule: "blacklist.country", detail: `IP country ${geo.ipCountry} is blacklisted`, impact: "negative" });
    decision = "BLOCK";
    score = Math.max(score, 98);
    reasons.push("IP country is blacklisted");
  }

  // 3. Amount threshold
  if (amount > rules.thresholds.maxAmount) {
    hits.push({
      rule: "threshold.maxAmount",
      detail: `Amount $${amount.toFixed(2)} exceeds limit $${rules.thresholds.maxAmount}`,
      impact: "negative",
    });
    score += 25;
    reasons.push(`High amount: $${amount.toFixed(2)} > $${rules.thresholds.maxAmount}`);
    if (rules.thresholds.action === "BLOCK" && decision !== "BLOCK") decision = "BLOCK";
    if (rules.thresholds.action === "BUFFER" && decision === "PASS") decision = "BUFFER";
  }

  // 4. Geo lock: IP vs GPS
  if (rules.geoLock.enabled) {
    if (geo.isProxyOrVpn) {
      hits.push({ rule: "geoLock.proxyDetected", detail: "IP belongs to a proxy/hosting network (VPN likely)", impact: "negative" });
      score += rules.geoLock.strictMode ? 60 : 30;
      reasons.push("Proxy/VPN network detected");
      if (rules.geoLock.strictMode) decision = "BLOCK";
      else if (decision === "PASS") decision = "BUFFER";
    }
    if (geo.distanceKm != null) {
      if (geo.distanceKm > rules.geoLock.maxDistanceKm) {
        hits.push({
          rule: "geoLock.distanceExceeded",
          detail: `IP↔GPS distance ${geo.distanceKm.toLocaleString()} km exceeds ${rules.geoLock.maxDistanceKm} km`,
          impact: "negative",
        });
        score += 45;
        reasons.push(`IP and GPS are ${geo.distanceKm.toLocaleString()} km apart`);
        decision = rules.geoLock.strictMode ? "BLOCK" : decision === "BLOCK" ? "BLOCK" : "BUFFER";
      } else {
        hits.push({ rule: "geoLock.passed", detail: `IP↔GPS distance ${geo.distanceKm} km within tolerance`, impact: "positive" });
      }
    } else if (geo.gpsLat == null) {
      hits.push({ rule: "geoLock.gpsMissing", detail: "No GPS location provided", impact: "negative" });
      score += 20;
      if (decision === "PASS") decision = "BUFFER";
    }
  }

  // 5. Buffer cabin: three-country mismatch
  if (rules.bufferCabin.enabled) {
    const trio = [accountCountry, billingCountry, shippingCountry];
    const mismatch = trio.some((c) => c && c !== trio[0]);
    if (mismatch) {
      hits.push({
        rule: "bufferCabin.threeCountryMismatch",
        detail: `Account ${accountCountry} / Billing ${billingCountry} / Shipping ${shippingCountry} mismatch`,
        impact: "negative",
      });
      score += 30;
      reasons.push("Account, billing and shipping countries are not consistent");
      if (decision === "PASS") decision = "BUFFER";
    } else {
      hits.push({ rule: "bufferCabin.consistent", detail: "Account/billing/shipping countries consistent", impact: "positive" });
    }
  }

  // Country mismatch between IP and shipping is an extra soft signal
  if (geo.ipCountry && shippingCountry && geo.ipCountry !== shippingCountry) {
    hits.push({ rule: "signal.ipShippingMismatch", detail: `IP country ${geo.ipCountry} ≠ shipping ${shippingCountry}`, impact: "negative" });
    score += 10;
  }

  return {
    decision,
    ruleHits: hits,
    ruleScore: Math.min(100, Math.round(score)),
    reasons: reasons.length ? reasons : ["All checks passed"],
  };
}
