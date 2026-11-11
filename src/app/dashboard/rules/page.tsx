"use client";

import { useCallback, useEffect, useState } from "react";
import { countryName } from "@/types";
import type { RuleConfig } from "@/types";
import { Check, Plus, X, Zap, Save } from "lucide-react";

const ALL_COUNTRIES = ["US", "GB", "DE", "FR", "NL", "SG", "HK", "CN", "JP", "KR", "AU", "CA", "IN", "BR", "RU", "UA", "VN", "TH", "MY", "TW", "NG", "KP", "IR", "SY"];

export default function RulesPage() {
  const [rules, setRules] = useState<RuleConfig | null>(null);
  const [reloadedAt, setReloadedAt] = useState<string>("");
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newBlackIp, setNewBlackIp] = useState("");
  const [newWhiteIp, setNewWhiteIp] = useState("");

  const load = useCallback(async () => {
    const data = await fetch("/api/rules").then((r) => r.json());
    setRules(data.rules);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2600);
    return () => clearTimeout(t);
  }, [justSaved]);

  function patch(p: Partial<RuleConfig>) {
    setRules((r) => {
      if (!r) return r;
      const next: RuleConfig = { ...r };
      if (p.geoLock) next.geoLock = { ...r.geoLock, ...p.geoLock };
      if (p.bufferCabin) next.bufferCabin = { ...r.bufferCabin, ...p.bufferCabin };
      if (p.thresholds) next.thresholds = { ...r.thresholds, ...p.thresholds };
      if (p.blacklists) next.blacklists = { ...r.blacklists, ...p.blacklists };
      if (p.whitelists) next.whitelists = { ...r.whitelists, ...p.whitelists };
      return next;
    });
  }

  async function save() {
    if (!rules) return;
    setSaving(true);
    const res = await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    const data = await res.json();
    setRules(data.rules);
    setReloadedAt(new Date().toLocaleTimeString());
    setJustSaved(true);
    setSaving(false);
  }

  if (!rules) return <p className="mt-20 text-center text-slate-500">Loading rules…</p>;

  const toggleCountry = (list: "blacklists" | "whitelists", code: string) => {
    const cur = rules[list].countries;
    patch({ [list]: { ...rules[list], countries: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] } } as Partial<RuleConfig>);
  };

  const removeIp = (list: "blacklists" | "whitelists", ip: string) => {
    patch({ [list]: { ...rules[list], ips: rules[list].ips.filter((i) => i !== ip) } } as Partial<RuleConfig>);
  };

  const addIp = (list: "blacklists" | "whitelists", ip: string) => {
    const v = ip.trim();
    if (!v || rules[list].ips.includes(v)) return;
    patch({ [list]: { ...rules[list], ips: [...rules[list].ips, v] } } as Partial<RuleConfig>);
    if (list === "blacklists") setNewBlackIp(""); else setNewWhiteIp("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Rule Center</h1>
          <p className="mt-1 text-sm text-slate-400">
            Adjust thresholds and lists — saved rules hot-reload into the risk engine instantly, no restart.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(justSaved || reloadedAt) && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
              justSaved ? "border-green-500/40 bg-green-500/15 text-green-400" : "border-white/15 text-slate-400"
            }`}>
              {justSaved ? <><Check className="h-3.5 w-3.5" /> Live — reloaded just now</> : <><Zap className="h-3.5 w-3.5" /> Effective since {reloadedAt}</>}
            </span>
          )}
          <button
            onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-shield-blue to-shield-cyan px-5 py-2.5 font-semibold text-white shadow-lg shadow-shield-blue/25 transition-all hover:shadow-shield-cyan/40 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save & hot-reload"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Geo lock */}
        <section className="glass p-6">
          <h2 className="font-bold text-white">Geo-Lock</h2>
          <p className="mt-1 text-sm text-slate-400">IP vs device GPS mismatch policy.</p>
          <Toggle label="Geo-lock enabled" checked={rules.geoLock.enabled}
            onChange={(v) => patch({ geoLock: { ...rules.geoLock, enabled: v } })} />
          <NumberField label="Max IP↔GPS distance (km)" value={rules.geoLock.maxDistanceKm}
            onChange={(v) => patch({ geoLock: { ...rules.geoLock, maxDistanceKm: v } })} />
          <Toggle label="Strict mode (proxy/VPN → hard BLOCK)" checked={rules.geoLock.strictMode}
            onChange={(v) => patch({ geoLock: { ...rules.geoLock, strictMode: v } })} />
        </section>

        {/* Buffer cabin */}
        <section className="glass p-6">
          <h2 className="font-bold text-white">72h Buffer Cabin</h2>
          <p className="mt-1 text-sm text-slate-400">Suspend funds instead of capturing on risky orders.</p>
          <Toggle label="Buffer cabin enabled" checked={rules.bufferCabin.enabled}
            onChange={(v) => patch({ bufferCabin: { ...rules.bufferCabin, enabled: v } })} />
          <NumberField label="Countdown window (hours)" value={rules.bufferCabin.countdownHours}
            onChange={(v) => patch({ bufferCabin: { ...rules.bufferCabin, countdownHours: v } })} />
          <div className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2.5 text-xs text-slate-400">
            Trigger: <span className="font-semibold text-shield-cyan">three-country mismatch</span> —
            account / billing / shipping countries inconsistent.
          </div>
        </section>

        {/* Amount threshold */}
        <section className="glass p-6">
          <h2 className="font-bold text-white">Amount Threshold</h2>
          <p className="mt-1 text-sm text-slate-400">What happens when an order exceeds your ceiling.</p>
          <NumberField label="Max amount (USD)" value={rules.thresholds.maxAmount}
            onChange={(v) => patch({ thresholds: { ...rules.thresholds, maxAmount: v } })} />
          <div className="mt-4 flex gap-2">
            {(["BLOCK", "BUFFER", "PASS"] as const).map((a) => (
              <button key={a} onClick={() => patch({ thresholds: { ...rules.thresholds, action: a } })}
                className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-colors ${
                  rules.thresholds.action === a
                    ? "border-shield-cyan/50 bg-shield-cyan/15 text-shield-cyan"
                    : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                }`}>
                {a}
              </button>
            ))}
          </div>
        </section>

        {/* Blacklist */}
        <section className="glass p-6">
          <h2 className="font-bold text-red-400">Blacklist — hard block</h2>
          <p className="mt-1 text-sm text-slate-400">Matched countries or IPs are blocked before PayPal is called.</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Countries</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL_COUNTRIES.map((c) => (
              <Chip key={c} active={rules.blacklists.countries.includes(c)} tone="red"
                onClick={() => toggleCountry("blacklists", c)}>
                {countryName(c)}
              </Chip>
            ))}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">IPs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rules.blacklists.ips.map((ip) => (
              <span key={ip} className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-1 font-mono text-xs text-red-300">
                {ip}
                <button onClick={() => removeIp("blacklists", ip)}><X className="h-3 w-3 hover:text-white" /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={newBlackIp} onChange={(e) => setNewBlackIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addIp("blacklists", newBlackIp)}
              placeholder="e.g. 185.220.101.1"
              className="w-48 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:border-red-500/50 focus:outline-none" />
            <button onClick={() => addIp("blacklists", newBlackIp)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 text-slate-300 hover:bg-white/10">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Whitelist */}
        <section className="glass p-6">
          <h2 className="font-bold text-green-400">Whitelist — trust bypass</h2>
          <p className="mt-1 text-sm text-slate-400">Matched customers skip all checks instantly.</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Countries</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL_COUNTRIES.map((c) => (
              <Chip key={c} active={rules.whitelists.countries.includes(c)} tone="green"
                onClick={() => toggleCountry("whitelists", c)}>
                {countryName(c)}
              </Chip>
            ))}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">IPs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rules.whitelists.ips.map((ip) => (
              <span key={ip} className="inline-flex items-center gap-1 rounded-md border border-green-500/40 bg-green-500/15 px-2.5 py-1 font-mono text-xs text-green-300">
                {ip}
                <button onClick={() => removeIp("whitelists", ip)}><X className="h-3 w-3 hover:text-white" /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={newWhiteIp} onChange={(e) => setNewWhiteIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addIp("whitelists", newWhiteIp)}
              placeholder="e.g. 203.0.113.10"
              className="w-48 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:border-green-500/50 focus:outline-none" />
            <button onClick={() => addIp("whitelists", newWhiteIp)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 text-slate-300 hover:bg-white/10">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-shield-cyan" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mt-4 block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="number" value={value} min={0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold tabular-nums text-white focus:border-shield-cyan/50 focus:outline-none"
      />
    </label>
  );
}

function Chip({ active, tone, onClick, children }: {
  active: boolean; tone: "red" | "green"; onClick: () => void; children: React.ReactNode;
}) {
  const cls = active
    ? tone === "red" ? "border-red-500/50 bg-red-500/20 text-red-300" : "border-green-500/50 bg-green-500/20 text-green-300"
    : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300";
  return (
    <button onClick={onClick} className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${cls}`}>
      {children}
    </button>
  );
}
