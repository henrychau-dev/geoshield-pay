"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusBadge, DecisionBadge, RiskGauge } from "@/components/ui";
import { countryName } from "@/types";
import type { RuleHit } from "@/types";
import {
  ArrowLeft, Wifi, MapPin, Globe, Brain, CheckCircle2, XCircle, Timer, RefreshCw, FileText, Flag,
} from "lucide-react";

interface RiskReport {
  id: string; score: number; verdict: string; signals: string;
  reportZh: string; reportEn: string; model: string; source: string; createdAt: string;
}
interface AuditEvent { id: string; type: string; message: string; createdAt: string }
interface OrderDetail {
  id: string; reference: string; customerName: string; customerEmail: string; product: string;
  amount: number; currency: string; status: string; decision: string | null; blockedReason: string | null;
  paypalOrderId: string | null; ipCountry: string | null; ipCity: string | null; isProxyOrVpn: boolean;
  gpsCountry: string | null; gpsLat: number | null; gpsLng: number | null;
  billingCountry: string | null; shippingCountry: string | null; accountCountry: string | null;
  distanceKm: number | null; ruleScore: number | null; riskScore: number | null;
  bufferExpiresAt: string | null; riskReports: RiskReport[]; events: AuditEvent[];
  createdAt: string;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  PRECHECK: <Flag className="h-3.5 w-3.5 text-shield-sky" />,
  BLOCK: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  BUFFER_START: <Timer className="h-3.5 w-3.5 text-amber-400" />,
  CONFIRM: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  CAPTURE: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  VOID: <XCircle className="h-3.5 w-3.5 text-violet-400" />,
  EXPIRE: <Timer className="h-3.5 w-3.5 text-violet-400" />,
  AI_ANALYSIS: <Brain className="h-3.5 w-3.5 text-shield-violet" />,
  RULE_UPDATE: <RefreshCw className="h-3.5 w-3.5 text-slate-400" />,
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${id}`);
    if (res.ok) setOrder((await res.json()).order);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(path: string) {
    setBusy(true);
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: id }),
    });
    await load();
    setBusy(false);
  }

  if (!order) {
    return <p className="mt-20 text-center text-slate-500">Loading order…</p>;
  }

  const report = order.riskReports[0];
  const trio = [order.accountCountry, order.billingCountry, order.shippingCountry];
  const trioMismatch = trio.every(Boolean) && trio.some((c) => c !== trio[0]);

  return (
    <div>
      <Link href="/dashboard/orders" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-white">{order.reference}</h1>
        <StatusBadge status={order.status} />
        {order.decision && <DecisionBadge decision={order.decision} />}
        <span className="ml-auto text-2xl font-bold tabular-nums text-white">
          ${order.amount.toFixed(2)} <span className="text-sm font-normal text-slate-500">{order.currency}</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {order.customerName} · {order.customerEmail} · {order.product} · {new Date(order.createdAt).toLocaleString()}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Signal chain + timeline */}
        <div className="space-y-6">
          <section className="glass p-6">
            <h2 className="font-bold text-white">Risk signal chain</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SignalRow icon={<Wifi className="h-4 w-4" />} label="IP location"
                value={`${countryName(order.ipCountry)}${order.ipCity ? ` · ${order.ipCity}` : ""}`} bad={order.isProxyOrVpn} />
              <SignalRow icon={<MapPin className="h-4 w-4" />} label="GPS location"
                value={order.gpsLat != null ? `${countryName(order.gpsCountry)} (${order.gpsLat.toFixed(2)}, ${order.gpsLng?.toFixed(2)})` : "not shared"}
                bad={order.gpsCountry != null && order.ipCountry != null && order.gpsCountry !== order.ipCountry} />
              <SignalRow icon={<Globe className="h-4 w-4" />} label="IP ↔ GPS distance"
                value={order.distanceKm != null ? `${order.distanceKm.toLocaleString()} km` : "n/a"}
                bad={(order.distanceKm ?? 0) > 500} />
              <SignalRow icon={<Flag className="h-4 w-4" />} label="Acc / Bill / Ship"
                value={`${order.accountCountry} / ${order.billingCountry} / ${order.shippingCountry}`} bad={trioMismatch} />
            </div>
            {order.isProxyOrVpn && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400">
                Proxy / VPN / hosting network detected on the customer IP
              </p>
            )}
            {order.blockedReason && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{order.blockedReason}</p>
            )}
          </section>

          <section className="glass p-6">
            <h2 className="font-bold text-white">Interception timeline</h2>
            <ol className="mt-4 space-y-4">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <div className="mt-1">{EVENT_ICONS[e.type] ?? <Flag className="h-3.5 w-3.5 text-slate-400" />}</div>
                  <div className="border-l border-white/10 pb-1 pl-4">
                    <p className="text-sm font-semibold text-slate-200">{e.type}</p>
                    <p className="text-xs leading-relaxed text-slate-400">{e.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{new Date(e.createdAt).toLocaleString()}</p>
                  </div>
                </li>
              ))}
              {order.events.length === 0 && <p className="text-sm text-slate-500">No events recorded.</p>}
            </ol>
          </section>
        </div>

        {/* AI report */}
        <div className="space-y-6">
          <section className="glass p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-white">
                <Brain className="h-5 w-5 text-shield-violet" /> AI Risk Analyst
              </h2>
              <button
                onClick={() => act("/api/risk/analyze")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Re-run
              </button>
            </div>

            {report ? (
              <>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <RiskGauge score={report.score} />
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      report.verdict === "DENY" ? "text-red-400" : report.verdict === "REVIEW" ? "text-amber-400" : "text-green-400"
                    }`}>{report.verdict}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.source === "AI" ? `LLM: ${report.model}` : "Rule fallback (LLM unavailable)"}
                    </p>
                    <p className="text-[11px] text-slate-600">{new Date(report.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  {(["en", "zh"] as const).map((l) => (
                    <button key={l} onClick={() => setLang(l)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold uppercase ${lang === l ? "bg-shield-violet/20 text-shield-violet" : "text-slate-500 hover:text-slate-300"}`}>
                      {l === "en" ? "English" : "中文"}
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-white/[0.04] p-4 text-sm leading-relaxed text-slate-300">
                  <FileText className="mb-2 h-4 w-4 text-slate-500" />
                  {lang === "en" ? report.reportEn : report.reportZh}
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-white/[0.04] p-4 text-sm text-slate-400">
                Analysis in progress — the LLM runs asynchronously and never blocks the payment path.
                Click <b>Re-run</b> to refresh.
              </p>
            )}
          </section>

          {/* Merchant actions */}
          {order.status === "BUFFERING" && (
            <section className="glass p-6">
              <h2 className="font-bold text-white">Buffer cabin verdict</h2>
              <p className="mt-1 text-sm text-slate-400">
                Funds are suspended until{" "}
                <span className="font-semibold text-amber-400">
                  {order.bufferExpiresAt ? new Date(order.bufferExpiresAt).toLocaleString() : "—"}
                </span>
                . After expiry the authorization is voided automatically.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => act("/api/buffer/confirm")} disabled={busy}
                  className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  Capture payment
                </button>
                <button
                  onClick={() => act("/api/buffer/reject")} disabled={busy}
                  className="flex-1 rounded-xl border border-violet-500/40 bg-violet-500/10 py-3 font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
                >
                  Void & release funds
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalRow({
  icon, label, value, bad,
}: {
  icon: React.ReactNode; label: string; value: string; bad?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${bad ? "border-red-500/30 bg-red-500/[0.07]" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {icon} {label}
      </p>
      <p className={`mt-1 truncate font-semibold ${bad ? "text-red-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}
