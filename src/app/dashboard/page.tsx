"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KpiCard, CountdownRing, StatusBadge } from "@/components/ui";
import { countryName } from "@/types";
import { ShieldAlert, Hourglass, DollarSign, Activity, RefreshCw } from "lucide-react";

interface Stats {
  total: number; blocked: number; buffering: number; confirmed: number;
  voided: number; expired: number; avgRiskScore: number; avgDistanceKm: number;
  protectedValue: number; blockRate: number;
}

interface OrderRow {
  id: string; reference: string; customerName: string; product: string; amount: number;
  status: string; decision: string | null; riskScore: number | null;
  ipCountry: string | null; gpsCountry: string | null; distanceKm: number | null;
  accountCountry: string | null; shippingCountry: string | null;
  bufferExpiresAt: string | null; createdAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [buffering, setBuffering] = useState<OrderRow[]>([]);
  const [recent, setRecent] = useState<OrderRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [updatedAt, setUpdatedAt] = useState<string>("");

  async function load() {
    const [s, orders] = await Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ]);
    setStats(s);
    setBuffering((orders.orders as OrderRow[]).filter((o) => o.status === "BUFFERING"));
    setRecent((orders.orders as OrderRow[]).slice(0, 8));
    setUpdatedAt(new Date().toLocaleTimeString());
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, []);

  async function runTick() {
    await fetch("/api/buffer/tick", { method: "POST" });
    load();
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Command Center</h1>
          <p className="mt-1 text-sm text-slate-400">
            Live fraud posture across every cross-border PayPal order{updatedAt && ` · updated ${updatedAt}`}
          </p>
        </div>
        <button
          onClick={runTick}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" /> Run buffer sweep
        </button>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Blocked pre-PayPal" value={stats ? String(stats.blocked) : "—"}
          sub={stats ? `${stats.blockRate}% of all traffic neutralized` : ""}
          accent="text-red-400"
        />
        <KpiCard
          label="In buffer cabin" value={stats ? String(stats.buffering) : "—"}
          sub="funds authorized, awaiting verdict"
          accent="text-amber-400"
        />
        <KpiCard
          label="Protected value" value={stats ? `$${stats.protectedValue.toLocaleString()}` : "—"}
          sub="risky funds caught before capture"
          accent="text-shield-cyan"
        />
        <KpiCard
          label="Avg risk score" value={stats ? String(stats.avgRiskScore) : "—"}
          sub={stats ? `avg IP↔GPS distance ${stats.avgDistanceKm.toLocaleString()} km` : ""}
          accent="text-shield-violet"
        />
      </div>

      {/* Buffer cabin stream */}
      <h2 className="mt-10 flex items-center gap-2 text-lg font-bold text-white">
        <Hourglass className="h-5 w-5 text-amber-400" /> 72h Buffer Cabin — live countdown
      </h2>
      {buffering.length === 0 ? (
        <p className="glass mt-4 p-6 text-sm text-slate-400">
          No orders in the cabin. Run the <Link className="text-shield-cyan underline" href="/checkout">three-country mismatch demo scenario</Link> to see funds suspended in real time.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buffering.map((o) => {
            const expires = new Date(o.bufferExpiresAt!).getTime();
            const created = new Date(o.createdAt).getTime();
            const progress = Math.max(0, Math.min(1, (expires - now) / (expires - created)));
            const remainMs = expires - now;
            const h = Math.max(0, Math.floor(remainMs / 3600000));
            const m = Math.max(0, Math.floor((remainMs % 3600000) / 60000));
            const s = Math.max(0, Math.floor((remainMs % 60000) / 1000));
            return (
              <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="glass glass-hover block p-5">
                <div className="flex items-center gap-4">
                  <CountdownRing progress={progress} accent="#F59E0B"
                    label={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{o.reference}</p>
                    <p className="truncate text-sm text-slate-400">{o.customerName} · ${o.amount.toFixed(2)}</p>
                    <p className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-400">
                      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <span>{countryName(o.accountCountry)} → {countryName(o.shippingCountry)}</span>
                  {o.riskScore != null && <span className="ml-auto rounded bg-amber-500/15 px-2 py-0.5 font-bold text-amber-400">risk {o.riskScore}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Recent orders */}
      <h2 className="mt-10 flex items-center gap-2 text-lg font-bold text-white">
        <Activity className="h-5 w-5 text-shield-cyan" /> Latest interceptions
      </h2>
      <div className="glass mt-4 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">IP / GPS</th>
              <th className="px-5 py-3">Risk</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-mono text-xs font-semibold text-shield-cyan hover:underline">
                    {o.reference}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-slate-300">{o.customerName}</td>
                <td className="px-5 py-3.5 text-slate-400">
                  {countryName(o.ipCountry)} ↔ {countryName(o.gpsCountry)}
                  {o.distanceKm != null && <span className="ml-1 text-xs text-slate-500">({o.distanceKm.toLocaleString()} km)</span>}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold tabular-nums ${
                    (o.riskScore ?? 0) >= 70 ? "bg-red-500/15 text-red-400"
                    : (o.riskScore ?? 0) >= 35 ? "bg-amber-500/15 text-amber-400"
                    : "bg-green-500/15 text-green-400"}`}>
                    {o.riskScore ?? "—"}
                  </span>
                </td>
                <td className="px-5 py-3.5"><StatusBadge status={o.status} /></td>
                <td className="px-5 py-3.5 font-semibold tabular-nums text-white">${o.amount.toFixed(2)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                No orders yet — trigger the <Link className="text-shield-cyan underline" href="/checkout">checkout demo</Link>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
        <ShieldAlert className="h-3.5 w-3.5" /> Blocked + voided + expired orders never captured funds —
        chargebacks are structurally impossible on intercepted transactions.
      </p>
    </div>
  );
}
