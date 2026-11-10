import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRules, updateRules } from "@/lib/rules/store";
import type { RuleConfig } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rules = await getRules();
  return NextResponse.json({ rules });
}

/** Save rules — in-memory cache invalidates instantly, next evaluation hot-reloads. */
export async function PUT(req: NextRequest) {
  const patch = (await req.json().catch(() => null)) as Partial<RuleConfig> | null;
  if (!patch) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const rules = await updateRules(patch);
  await prisma.auditLog.create({
    data: { type: "RULE_UPDATE", message: `Rules updated — hot-reloaded at ${new Date().toISOString()}` },
  });
  return NextResponse.json({ rules, reloadedAt: new Date().toISOString() });
}
