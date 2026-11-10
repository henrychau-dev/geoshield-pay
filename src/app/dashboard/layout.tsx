import Link from "next/link";
import { ShieldLogo } from "@/components/ui";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/rules", label: "Rule Center" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid-bg min-h-screen">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <Link href="/"><ShieldLogo /></Link>
          <nav className="flex items-center gap-1.5 text-sm">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-lg px-3.5 py-2 font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {t.label}
              </Link>
            ))}
            <Link
              href="/checkout"
              className="ml-2 rounded-lg bg-gradient-to-r from-shield-blue to-shield-cyan px-3.5 py-2 font-semibold text-white"
            >
              Customer Demo
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
