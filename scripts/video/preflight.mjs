import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CACHE = path.resolve("demo/.cache");
const BASE = process.env.BASE_URL || "http://localhost:3210";

/** Same payloads the checkout's demo scenario buttons send (see src/app/checkout/page.tsx). */
export const SCENARIO_PAYLOADS = {
  honest: {
    ip: "76.102.0.10",
    expect: "PASS",
    body: {
      gpsLat: 37.386,
      gpsLng: -122.084,
      accountCountry: "US",
      billingCountry: "US",
      shippingCountry: "US",
      amount: 129,
      customerName: "Sarah Mitchell",
      customerEmail: "sarah.m@example.com",
      product: "Cross-border order (demo store)",
    },
  },
  vpn: {
    ip: "185.220.101.1",
    expect: "BLOCK",
    body: {
      gpsLat: 40.713,
      gpsLng: -74.006,
      accountCountry: "US",
      billingCountry: "US",
      shippingCountry: "US",
      amount: 129,
      customerName: "Unknown Actor",
      customerEmail: "burner041@example.com",
      product: "Cross-border order (demo store)",
    },
  },
  mismatch: {
    ip: "76.102.0.10",
    expect: "BUFFER",
    body: {
      gpsLat: 37.386,
      gpsLng: -122.084,
      accountCountry: "CN",
      billingCountry: "CN",
      shippingCountry: "US",
      amount: 489,
      customerName: "Wei Zhang",
      customerEmail: "weizhang88@example.com",
      product: "Cross-border order (demo store)",
    },
  },
};

async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

export async function waitForServer({ timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/paypal/config`);
      if (res.ok) return true;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Server not reachable at ${BASE} after ${timeoutMs}ms`);
}

export async function runPreflight() {
  await waitForServer();

  const config = await json(`${BASE}/api/paypal/config`);
  if (!config.configured) throw new Error("PayPal sandbox credentials are not configured — checkout would show a warning banner");

  const timings = {};
  const results = {};
  for (const [key, scenario] of Object.entries(SCENARIO_PAYLOADS)) {
    const t0 = Date.now();
    const data = await json(`${BASE}/api/risk/precheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-ip": scenario.ip },
      body: JSON.stringify(scenario.body),
    });
    const ms = Date.now() - t0;
    if (data.decision !== scenario.expect) {
      throw new Error(
        `Scenario "${key}" produced ${data.decision}, expected ${scenario.expect}. ` +
          `Reasons: ${(data.reasons || []).join("; ")}`
      );
    }
    timings[key] = ms;
    results[key] = { decision: data.decision, ruleScore: data.ruleScore, reference: data.reference, ms };
    console.log(`  precheck ${key.padEnd(9)} ${data.decision.padEnd(6)} score=${String(data.ruleScore).padEnd(3)} ${ms}ms`);
  }

  // Second pass must hit the in-process geo cache, otherwise the take could stall on ip-api.com.
  const warmMs = await (async () => {
    const t0 = Date.now();
    await json(`${BASE}/api/risk/precheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-ip": SCENARIO_PAYLOADS.vpn.ip },
      body: JSON.stringify(SCENARIO_PAYLOADS.vpn.body),
    });
    return Date.now() - t0;
  })();
  if (warmMs > 1500) throw new Error(`Geo cache looks cold: cached precheck took ${warmMs}ms`);
  console.log(`  cached precheck ${warmMs}ms`);

  const { orders } = await json(`${BASE}/api/orders`);
  const buffered = orders.find((o) => o.reference === "GS-DEMO-5T1R8W");
  if (!buffered) throw new Error("Seed order GS-DEMO-5T1R8W (buffering) is missing — run npm run db:seed");

  const aiStart = Date.now();
  const analysis = await json(`${BASE}/api/risk/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: buffered.id }),
  });
  const aiMs = Date.now() - aiStart;
  const report = analysis.report;
  if (!report) throw new Error("AI analyst returned no report");
  if (report.source !== "AI") throw new Error(`AI analyst degraded to ${report.source} — check AI_API_KEY / AI_BASE_URL`);
  if (!/^deepseek/.test(report.model)) throw new Error(`AI analyst used model ${report.model}, expected a deepseek model`);
  if (!report.reportEn || !report.reportZh) throw new Error("AI analyst returned an incomplete bilingual report");
  console.log(`  ai analyst ${report.model} score=${report.score} ${aiMs}ms`);

  const stats = await json(`${BASE}/api/stats`);
  const summary = { baseUrl: BASE, results, cachedMs: warmMs, ai: { model: report.model, score: report.score, ms: aiMs }, stats };
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(path.join(CACHE, "preflight.json"), JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreflight().catch((err) => {
    console.error(`preflight failed: ${err.message}`);
    process.exit(1);
  });
}
