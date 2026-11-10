import Link from "next/link";
import type { ReactNode } from "react";

export function ShieldLogo({ size = 34 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
        <defs>
          <linearGradient id="shieldGrad" x1="0" y1="0" x2="40" y2="40">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <path
          d="M20 3 L34 8 V19 C34 28.5 28 34.5 20 37 C12 34.5 6 28.5 6 19 V8 Z"
          fill="url(#shieldGrad)"
          fillOpacity="0.18"
          stroke="url(#shieldGrad)"
          strokeWidth="2"
        />
        <circle cx="20" cy="17" r="4" fill="url(#shieldGrad)" />
        <path d="M20 21 V28 M14 17 H8 M32 17 H26" stroke="url(#shieldGrad)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-white">
        Geo<span className="text-gradient">Shield</span> Pay
      </span>
    </div>
  );
}

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
        <Link href="/"><ShieldLogo /></Link>
        <nav className="flex items-center gap-1.5 text-sm">
          <NavLink href="/checkout">Checkout Demo</NavLink>
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/dashboard/rules">Rule Center</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3.5 py-2 font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
    >
      {children}
    </Link>
  );
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  PENDING_PRECHECK: { label: "Prechecked", cls: "bg-slate-500/15 text-slate-300 border-slate-400/30" },
  BLOCKED: { label: "Blocked", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  BUFFERING: { label: "In Buffer Cabin", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  CONFIRMED: { label: "Captured", cls: "bg-green-500/15 text-green-400 border-green-500/40" },
  VOIDED: { label: "Voided", cls: "bg-violet-500/15 text-violet-400 border-violet-500/40" },
  EXPIRED: { label: "Expired → Voided", cls: "bg-violet-500/15 text-violet-400 border-violet-500/40" },
  FAILED: { label: "Failed", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: "bg-white/5 text-slate-300 border-white/20" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {status === "BUFFERING" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />}
      {s.label}
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PASS: { label: "PASS", cls: "bg-green-500/15 text-green-400 border-green-500/40" },
    BUFFER: { label: "BUFFER", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
    BLOCK: { label: "BLOCK", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  };
  const s = map[decision] ?? { label: decision, cls: "bg-white/5 text-slate-300 border-white/20" };
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${s.cls}`}>{s.label}</span>
  );
}

export function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="glass glass-hover p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Circular countdown ring for buffer-cabin cards. */
export function CountdownRing({
  progress,
  label,
  accent = "#F59E0B",
}: {
  progress: number; // 0..1 remaining
  label: string;
  accent?: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-white">
        {label}
      </div>
    </div>
  );
}

export function RiskGauge({ score }: { score: number }) {
  const angle = (score / 100) * 180;
  const rad = ((angle - 180) * Math.PI) / 180;
  const nx = 70 + 52 * Math.cos(rad);
  const ny = 70 + 52 * Math.sin(rad);
  const color = score >= 70 ? "#EF4444" : score >= 35 ? "#F59E0B" : "#22C55E";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 84" className="w-44">
        <path d="M 18 70 A 52 52 0 0 1 122 70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" strokeLinecap="round" />
        <path
          d={`M 70 70 L ${nx} ${ny}`}
          stroke={color} strokeWidth="3.5" strokeLinecap="round"
          style={{ transition: "all 0.8s cubic-bezier(.2,.8,.2,1)" }}
        />
        <circle cx="70" cy="70" r="5" fill={color} />
      </svg>
      <p className="-mt-2 text-3xl font-bold tabular-nums" style={{ color }}>{score}</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risk Score</p>
    </div>
  );
}
