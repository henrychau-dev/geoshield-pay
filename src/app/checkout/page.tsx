"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { TopNav, DecisionBadge } from "@/components/ui";
import { countryName } from "@/types";
import type { RuleHit } from "@/types";
import {
  MapPin, ShieldCheck, ShieldX, Hourglass, Navigation, Crosshair, Wifi, AlertTriangle, CheckCircle2,
} from "lucide-react";

interface PrecheckResponse {
  orderId: string;
  reference: string;
  decision: "PASS" | "BUFFER" | "BLOCK";
  reasons: string[];
  ruleHits: RuleHit[];
  ruleScore: number;
  geo: {
    ip: string;
    ipCountry: string | null;
    ipCity: string | null;
    isProxyOrVpn: boolean;
    gpsCountry: string | null;
    gpsLat: number | null;
    gpsLng: number | null;
    distanceKm: number | null;
  };
}

interface Scenario {
  id: string;
  label: string;
  desc: string;
  demoIp?: string;
  gps: { lat: number; lng: number } | null;
  accountCountry: string;
  billingCountry: string;
  shippingCountry: string;
  amount: number;
}

/** Pre-wired demo scenarios so judges can reproduce every risk path in seconds. */
const SCENARIOS: Scenario[] = [
  {
    id: "honest",
    label: "Honest customer",
    desc: "Residential IP and GPS both in the SF Bay Area — everything matches",
    demoIp: "76.102.0.10",
    gps: { lat: 37.386, lng: -122.084 },
    accountCountry: "US", billingCountry: "US", shippingCountry: "US",
    amount: 129.0,
  },
  {
    id: "vpn",
    label: "VPN fraudster",
    desc: "Tor exit IP in Europe + GPS in US → hard block before PayPal",
    demoIp: "185.220.101.1",
    gps: { lat: 40.713, lng: -74.006 },
    accountCountry: "US", billingCountry: "US", shippingCountry: "US",
    amount: 129.0,
  },
  {
    id: "three-country",
    label: "Three-country mismatch",
    desc: "Account CN / Billing CN / Shipping US → enters 72h buffer cabin",
    demoIp: "76.102.0.10",
    gps: { lat: 37.386, lng: -122.084 },
    accountCountry: "CN", billingCountry: "CN", shippingCountry: "US",
    amount: 489.0,
  },
  {
    id: "blacklist",
    label: "Blacklisted IP",
    desc: "IP is on the merchant blacklist → instant hard block",
    demoIp: "196.52.43.60",
    gps: { lat: 37.386, lng: -122.084 },
    accountCountry: "US", billingCountry: "US", shippingCountry: "US",
    amount: 89.0,
  },
  {
    id: "whale",
    label: "High amount",
    desc: "$5,000 order exceeds the amount threshold → buffered",
    demoIp: "76.102.0.10",
    gps: { lat: 37.386, lng: -122.084 },
    accountCountry: "US", billingCountry: "US", shippingCountry: "US",
    amount: 5000.0,
  },
];

const COUNTRIES = ["US", "GB", "DE", "FR", "SG", "HK", "CN", "JP", "AU", "CA", "IN", "BR", "NL", "TW"];

type Stage = "form" | "checking" | "blocked" | "pay" | "buffering" | "confirmed" | "voided" | "error";

export default function CheckoutPage() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [useRealGps, setUseRealGps] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(SCENARIOS[0].gps);
  const [gpsStatus, setGpsStatus] = useState<string>("");
  const [name, setName] = useState("Tony Stark");
  const [email, setEmail] = useState("tony@starkindustries.com");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string>("");
  const [precheck, setPrecheck] = useState<PrecheckResponse | null>(null);
  const [paypalConfig, setPaypalConfig] = useState<{ clientId: string; configured: boolean } | null>(null);
  const [bufferExpiresAt, setBufferExpiresAt] = useState<string>("");
  const [now, setNow] = useState(Date.now());
  const orderIdRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/paypal/config").then((r) => r.json()).then(setPaypalConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (stage !== "buffering") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stage]);

  function applyScenario(s: Scenario) {
    setScenario(s);
    setUseRealGps(false);
    setGps(s.gps);
    setStage("form");
    setPrecheck(null);
    setError("");
  }

  function captureRealGps() {
    if (!navigator.geolocation) {
      setGpsStatus("Geolocation not supported in this browser");
      return;
    }
    setGpsStatus("Requesting device GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUseRealGps(true);
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus(`Device GPS acquired (±${Math.round(pos.coords.accuracy)}m)`);
      },
      () => setGpsStatus("GPS denied — using scenario location. Tip: Chrome DevTools → Sensors can override location."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const runPrecheck = useCallback(async () => {
    setStage("checking");
    setError("");
    const g = useRealGps ? gps : scenario.gps;
    try {
      const res = await fetch("/api/risk/precheck", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(scenario.demoIp ? { "x-demo-ip": scenario.demoIp } : {}),
        },
        body: JSON.stringify({
          gpsLat: g?.lat ?? null,
          gpsLng: g?.lng ?? null,
          billingCountry: scenario.billingCountry,
          shippingCountry: scenario.shippingCountry,
          accountCountry: scenario.accountCountry,
          amount: scenario.amount,
          customerName: name,
          customerEmail: email,
          product: "Cross-border order (demo store)",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Precheck failed");
      setPrecheck(data);
      orderIdRef.current = data.orderId;
      setStage(data.decision === "BLOCK" ? "blocked" : "pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Precheck failed");
      setStage("form");
    }
  }, [scenario, useRealGps, gps, name, email]);

  async function confirmBuffer() {
    const res = await fetch("/api/buffer/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: orderIdRef.current }),
    });
    if (res.ok) setStage("confirmed");
  }

  async function rejectBuffer() {
    const res = await fetch("/api/buffer/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: orderIdRef.current }),
    });
    if (res.ok) setStage("voided");
  }

  const remainingMs = bufferExpiresAt ? new Date(bufferExpiresAt).getTime() - now : 0;
  const remainH = Math.max(0, Math.floor(remainingMs / 3600000));
  const remainM = Math.max(0, Math.floor((remainingMs % 3600000) / 60000));
  const remainS = Math.max(0, Math.floor((remainingMs % 60000) / 1000));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="/" className="text-lg font-bold tracking-tight">
            Geo<span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">Shield</span> Pay
          </a>
          <a href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Merchant Dashboard →
          </a>
        </div>
      </div>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: cart + form */}
        <section>
          <h1 className="text-2xl font-bold">Checkout</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your location is verified against your network identity before payment is created.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-xl text-white">
                📦
              </div>
              <div className="flex-1">
                <p className="font-semibold">Cross-border order (demo store)</p>
                <p className="text-sm text-slate-500">Ships internationally from the US warehouse</p>
              </div>
              <p className="text-xl font-bold tabular-nums">${scenario.amount.toFixed(2)}</p>
            </div>
          </div>

          {/* Demo scenarios */}
          <div className="mt-6 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Demo scenario selector
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => applyScenario(s)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    scenario.id === s.id
                      ? "border-blue-500 bg-blue-600 text-white shadow"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{scenario.desc}</p>
          </div>

          {/* Customer form */}
          <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
            <Field label="Full name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email">
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="PayPal account country">
              <select className={inputCls} value={scenario.accountCountry}
                onChange={(e) => setScenario({ ...scenario, accountCountry: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </select>
            </Field>
            <Field label="Billing country">
              <select className={inputCls} value={scenario.billingCountry}
                onChange={(e) => setScenario({ ...scenario, billingCountry: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </select>
            </Field>
            <Field label="Shipping country">
              <select className={inputCls} value={scenario.shippingCountry}
                onChange={(e) => setScenario({ ...scenario, shippingCountry: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </select>
            </Field>
            <Field label="GPS location (simulating phone hardware)">
              <div className="flex items-center gap-2">
                <button
                  onClick={captureRealGps}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                >
                  <Navigation className="h-3.5 w-3.5" /> Use my real GPS
                </button>
                <span className="truncate text-xs text-slate-500">
                  {gpsStatus || (gps ? `${gps.lat.toFixed(3)}, ${gps.lng?.toFixed(3)}` : "none")}
                </span>
              </div>
            </Field>
          </div>

          <button
            onClick={runPrecheck}
            disabled={stage === "checking"}
            className="mt-6 w-full rounded-xl bg-slate-900 py-4 font-semibold text-white shadow-lg transition-all hover:bg-slate-800 disabled:opacity-60"
          >
            {stage === "checking" ? "Running pre-transaction geo shield…" : "Verify & continue to payment"}
          </button>
          {error && <p className="mt-3 text-center text-sm font-medium text-red-600">{error}</p>}
        </section>

        {/* Right: shield panel */}
        <section className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <Crosshair className="h-5 w-5 text-blue-600" /> GeoShield verification panel
            </h2>

            {!precheck && (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Run the precheck to see your IP identity vs GPS location analysis.
                Nothing is charged — the shield runs before PayPal is involved.
              </p>
            )}

            {precheck && (
              <div className="mt-4 space-y-4">
                <GeoCompare precheck={precheck} />

                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rule engine verdict</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <DecisionBadge decision={precheck.decision} />
                      <span className="text-xs text-slate-500">score {precheck.ruleScore}/100</span>
                    </div>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {precheck.reasons.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-slate-600">
                      {precheck.decision === "BLOCK"
                        ? <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />}
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* BLOCK state */}
            {stage === "blocked" && (
              <div className="mt-5 animate-pulse-red rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-center">
                <ShieldX className="mx-auto h-12 w-12 text-red-500" />
                <p className="mt-3 text-lg font-bold text-red-700">Transaction blocked</p>
                <p className="mt-1 text-sm text-red-600">
                  No PayPal order was created. The fraud attempt never reached the payment network.
                </p>
              </div>
            )}

            {/* PASS/BUFFER → PayPal */}
            {stage === "pay" && paypalConfig && (
              <div className="mt-5">
                <p className="mb-3 text-sm font-medium text-slate-600">
                  {precheck?.decision === "BUFFER"
                    ? "Precheck flagged this order — payment will be authorized (held) for review, not captured."
                    : "Precheck passed — safe to pay."}
                </p>
                {paypalConfig.configured ? (
                  <PayPalScriptProvider options={{ clientId: paypalConfig.clientId, currency: "USD", intent: "authorize" }}>
                    <PayPalButtons
                      style={{ layout: "vertical", shape: "rect", label: "paypal" }}
                      createOrder={async () => {
                        const res = await fetch("/api/paypal/create-order", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ orderId: orderIdRef.current }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        return data.paypalOrderId;
                      }}
                      onApprove={async (data) => {
                        const res = await fetch("/api/paypal/authorize", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ orderId: orderIdRef.current }),
                        });
                        const result = await res.json();
                        if (!res.ok) {
                          setError(result.error ?? "Authorization failed");
                          setStage("error");
                          return;
                        }
                        if (result.status === "BUFFERING") {
                          setBufferExpiresAt(result.bufferExpiresAt);
                          setStage("buffering");
                        } else {
                          setStage("confirmed");
                        }
                      }}
                      onError={() => {
                        setError("PayPal error — check sandbox credentials in .env");
                        setStage("error");
                      }}
                    />
                  </PayPalScriptProvider>
                ) : (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                    PayPal sandbox credentials not configured. Add <code className="font-mono">PAYPAL_CLIENT_ID</code> /
                    <code className="font-mono"> PAYPAL_CLIENT_SECRET</code> to <code className="font-mono">.env</code> from
                    the <a className="underline" href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noreferrer">PayPal Developer Dashboard</a>.
                  </div>
                )}
              </div>
            )}

            {/* BUFFERING result */}
            {stage === "buffering" && (
              <div className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
                <Hourglass className="mx-auto h-12 w-12 animate-breathe text-amber-500" />
                <p className="mt-3 text-lg font-bold text-amber-700">72-hour buffer cabin opened</p>
                <p className="mt-1 text-sm text-amber-600">
                  Funds are authorized but not captured. Confirm to complete the purchase, or reject to
                  release the hold.
                </p>
                <p className="mt-4 font-mono text-3xl font-bold tabular-nums text-amber-700">
                  {String(remainH).padStart(2, "0")}:{String(remainM).padStart(2, "0")}:{String(remainS).padStart(2, "0")}
                </p>
                <div className="mt-5 flex gap-3">
                  <button onClick={confirmBuffer} className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700">
                    Confirm payment
                  </button>
                  <button onClick={rejectBuffer} className="flex-1 rounded-xl border border-red-300 bg-white py-3 font-semibold text-red-600 hover:bg-red-50">
                    Reject & release
                  </button>
                </div>
              </div>
            )}

            {stage === "confirmed" && (
              <ResultCard
                icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
                title="Payment captured"
                sub="The order completed safely. Merchant is protected against chargeback fraud."
                tone="green"
              />
            )}
            {stage === "voided" && (
              <ResultCard
                icon={<ShieldCheck className="h-12 w-12 text-violet-500" />}
                title="Authorization voided"
                sub="Funds released instantly — no chargeback risk, no PayPal account damage."
                tone="violet"
              />
            )}
            {stage === "error" && (
              <ResultCard
                icon={<AlertTriangle className="h-12 w-12 text-red-500" />}
                title="Something went wrong"
                sub={error}
                tone="red"
              />
            )}
          </div>

          {precheck && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
              <p className="flex items-center gap-2 font-semibold text-slate-700">
                <Wifi className="h-4 w-4 text-slate-400" /> Network identity
              </p>
              <p className="mt-2 font-mono text-xs text-slate-500">{precheck.geo.ip}</p>
              <Link className="mt-3 inline-block text-xs font-semibold text-blue-600 hover:underline" href="/dashboard">
                See this order in the merchant dashboard →
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function GeoCompare({ precheck }: { precheck: PrecheckResponse }) {
  const g = precheck.geo;
  const mismatch = g.distanceKm == null || g.distanceKm > 500;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <LocationCard
          icon={<Wifi className="h-4 w-4" />}
          title="IP location"
          main={countryName(g.ipCountry)}
          sub={g.ipCity ? `${g.ipCity} · ${g.ip}` : g.ip}
          tone={mismatch ? "red" : "green"}
        />
        <LocationCard
          icon={<MapPin className="h-4 w-4" />}
          title="GPS location"
          main={countryName(g.gpsCountry)}
          sub={g.gpsLat != null ? `${g.gpsLat.toFixed(3)}, ${g.gpsLng?.toFixed(3)}` : "not shared"}
          tone={mismatch ? "red" : "green"}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-2.5 text-sm font-semibold">
        {g.distanceKm != null ? (
          <>
            <span className={mismatch ? "text-red-600" : "text-green-600"}>
              {g.distanceKm.toLocaleString()} km apart
            </span>
            <span className="text-slate-400">· tolerance 500 km</span>
          </>
        ) : (
          <span className="text-amber-600">Distance unavailable (GPS or IP geo missing)</span>
        )}
      </div>
      {g.isProxyOrVpn && (
        <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs font-bold text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" /> Proxy / VPN / hosting network detected
        </p>
      )}
    </div>
  );
}

function LocationCard({
  icon, title, main, sub, tone,
}: {
  icon: React.ReactNode; title: string; main: string; sub: string; tone: "red" | "green";
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "red" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {icon} {title}
      </p>
      <p className={`mt-1 font-bold ${tone === "red" ? "text-red-700" : "text-green-700"}`}>{main}</p>
      <p className="truncate text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function ResultCard({
  icon, title, sub, tone,
}: {
  icon: React.ReactNode; title: string; sub: string; tone: "green" | "violet" | "red";
}) {
  const tones = {
    green: "border-green-300 bg-green-50 text-green-700",
    violet: "border-violet-300 bg-violet-50 text-violet-700",
    red: "border-red-300 bg-red-50 text-red-700",
  };
  return (
    <div className={`mt-5 rounded-2xl border-2 p-6 text-center ${tones[tone]}`}>
      <div className="flex justify-center">{icon}</div>
      <p className="mt-3 text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{sub}</p>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
