import Link from "next/link";
import { TopNav } from "@/components/ui";
import {
  Globe2, MapPin, Hourglass, Brain, ShieldAlert, ArrowRight, Lock, Zap, HeartPulse,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="grid-bg min-h-screen">
      <TopNav />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-shield-blue/20 blur-[120px]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-shield-cyan/30 bg-shield-cyan/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-shield-cyan">
            <Lock className="h-3.5 w-3.5" /> Pre-transaction fraud shield for PayPal merchants
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            Stop fraud <span className="text-gradient">before money moves.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
            GeoShield Pay hard-blocks VPN spoofing and stolen PayPal accounts at checkout with a dual
            IP+GPS geo-lock, suspends risky funds in a 72-hour buffer cabin, and briefs you with an AI
            fraud analyst — cutting chargebacks by 85%+.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/checkout"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-shield-blue to-shield-cyan px-7 py-3.5 font-semibold text-white shadow-lg shadow-shield-blue/30 transition-all hover:shadow-shield-cyan/40"
            >
              Try the checkout demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              Merchant dashboard
            </Link>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4">
            {[
              { v: "85%+", l: "Chargeback reduction" },
              { v: "<1s", l: "Pre-transaction block" },
              { v: "72h", l: "Smart buffer window" },
            ].map((s) => (
              <div key={s.l} className="glass p-5">
                <p className="text-gradient text-4xl font-bold">{s.v}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core capabilities */}
      <section className="mx-auto max-w-7xl px-5 pb-20">
        <h2 className="text-center text-3xl font-bold text-white">Three lines of defense</h2>
        <p className="mt-2 text-center text-slate-400">Every order faces the gauntlet before PayPal touches a cent.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<Globe2 className="h-6 w-6" />}
            title="Dual Geo-Lock"
            accent="from-shield-blue/25"
            points={[
              "Customer IP location vs phone hardware GPS at checkout",
              "VPN / proxy / hosting networks flagged instantly",
              "Hard block happens before the PayPal order is even created",
            ]}
          />
          <FeatureCard
            icon={<Hourglass className="h-6 w-6" />}
            title="72h Smart Buffer Cabin"
            accent="from-shield-amber/25"
            points={[
              "Account / billing / shipping country mismatch triggers hold",
              "PayPal AUTHORIZE suspends funds — no money moves yet",
              "Confirm captures it; reject or timeout Voids and releases",
            ]}
          />
          <FeatureCard
            icon={<Brain className="h-6 w-6" />}
            title="AI Risk Analyst"
            accent="from-shield-violet/25"
            points={[
              "LLM reads every signal chain for each transaction",
              "0-100 risk score plus a plain-language fraud report",
              "Bilingual (EN/ZH) analysis stored on every order",
            ]}
          />
        </div>
      </section>

      {/* Pipeline */}
      <section className="mx-auto max-w-7xl px-5 pb-24">
        <div className="glass p-8 md:p-12">
          <h2 className="text-center text-2xl font-bold text-white">The interception pipeline</h2>
          <div className="mt-10 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <PipelineStep icon={<MapPin className="h-5 w-5" />} label="GPS + IP captured" sub="at checkout" />
            <Arrow />
            <PipelineStep icon={<ShieldAlert className="h-5 w-5" />} label="Geo-lock verdict" sub="< 1s, pre-PayPal" accent />
            <Arrow />
            <PipelineStep icon={<Zap className="h-5 w-5" />} label="PayPal AUTHORIZE" sub="funds suspended" />
            <Arrow />
            <PipelineStep icon={<Hourglass className="h-5 w-5" />} label="72h cabin" sub="confirm / void / expire" />
          </div>
          <div className="mt-8 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <PipelineStep icon={<Brain className="h-5 w-5" />} label="AI analyst report" sub="async, non-blocking" />
            <Arrow />
            <PipelineStep icon={<HeartPulse className="h-5 w-5" />} label="Account health protected" sub="zero surprise chargebacks" accent />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-500">
        GeoShield Pay — built for the PayPal AI Hackathon · PayPal Orders API v2 (AUTHORIZE) · LLM risk analyst
      </footer>
    </div>
  );
}

function FeatureCard({
  icon, title, points, accent,
}: {
  icon: React.ReactNode; title: string; points: string[]; accent: string;
}) {
  return (
    <div className="glass glass-hover relative overflow-hidden p-7">
      <div className={`absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br ${accent} to-transparent blur-2xl`} />
      <div className="relative">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-shield-cyan">
          {icon}
        </div>
        <h3 className="mt-4 text-xl font-bold text-white">{title}</h3>
        <ul className="mt-4 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-slate-400">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-shield-cyan" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PipelineStep({
  icon, label, sub, accent,
}: {
  icon: React.ReactNode; label: string; sub: string; accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 text-center ${
        accent ? "border-shield-cyan/40 bg-shield-cyan/10" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <span className="text-shield-cyan">{icon}</span>
      <span className="text-sm font-semibold text-white">{label}</span>
      <span className="text-xs text-slate-500">{sub}</span>
    </div>
  );
}

function Arrow() {
  return <ArrowRight className="mx-auto h-4 w-4 shrink-0 text-slate-600 md:rotate-0" />;
}
