import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeOrder } from "@/lib/risk/ai-agent";
import { signalFromOrder } from "@/lib/risk/signal";
import type { EngineResult } from "@/types";

/** Manual re-run of the AI risk analyst for an order. */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const signal = signalFromOrder(order);
  const engine: EngineResult = {
    decision: (order.decision as EngineResult["decision"]) ?? "PASS",
    ruleHits: [],
    ruleScore: order.ruleScore ?? 0,
    reasons: order.blockedReason ? [order.blockedReason] : ["Re-analysis requested"],
  };

  try {
    await analyzeOrder(order.id, signal, engine);
    const report = await prisma.riskReport.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
