"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, DecisionBadge } from "@/components/ui";
import { countryName } from "@/types";
import { Filter } from "lucide-react";

interface OrderRow {
  id: string; reference: string; customerName: string; product: string; amount: number;
  status: string; decision: string | null; riskScore: number | null;
  ipCountry: string | null; gpsCountry: string | null; billingCountry: string | null;
  shippingCountry: string | null; accountCountry: string | null; distanceKm: number | null;
  createdAt: string;
}

const FILTERS = ["ALL", "BUFFERING", "BLOCKED", "CONFIRMED", "VOIDED", "EXPIRED", "FAILED"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders?status=${filter}`);
    const data = await res.json();
    setOrders(data.orders);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Orders</h1>
      <p className="mt-1 text-sm text-slate-400">Every transaction that faced the shield.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-slate-500" />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f
                ? "border-shield-cyan/50 bg-shield-cyan/15 text-shield-cyan"
                : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="glass mt-5 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Countries (Acc/Bill/Ship)</th>
              <th className="px-5 py-3">IP ↔ GPS</th>
              <th className="px-5 py-3">Verdict</th>
              <th className="px-5 py-3">Risk</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-mono text-xs font-semibold text-shield-cyan hover:underline">
                    {o.reference}
                  </Link>
                  <p className="text-[11px] text-slate-500">{new Date(o.createdAt).toLocaleString()}</p>
                </td>
                <td className="px-5 py-3.5 text-slate-300">{o.customerName}</td>
                <td className="px-5 py-3.5 text-slate-400">
                  <span className={trioMismatch(o) ? "font-semibold text-amber-400" : ""}>
                    {o.accountCountry ?? "?"} / {o.billingCountry ?? "?"} / {o.shippingCountry ?? "?"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400">
                  {countryName(o.ipCountry)} ↔ {countryName(o.gpsCountry)}
                  {o.distanceKm != null && (
                    <span className={`ml-1 text-xs ${(o.distanceKm > 500) ? "font-bold text-red-400" : "text-slate-500"}`}>
                      ({o.distanceKm.toLocaleString()} km)
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">{o.decision ? <DecisionBadge decision={o.decision} /> : "—"}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold tabular-nums ${
                    (o.riskScore ?? 0) >= 70 ? "bg-red-500/15 text-red-400"
                    : (o.riskScore ?? 0) >= 35 ? "bg-amber-500/15 text-amber-400"
                    : "bg-green-500/15 text-green-400"}`}>
                    {o.riskScore ?? "—"}
                  </span>
                </td>
                <td className="px-5 py-3.5"><StatusBadge status={o.status} /></td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-white">${o.amount.toFixed(2)}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">No orders in this state.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function trioMismatch(o: OrderRow): boolean {
  const t = [o.accountCountry, o.billingCountry, o.shippingCountry];
  return t.every(Boolean) && t.some((c) => c !== t[0]);
}
