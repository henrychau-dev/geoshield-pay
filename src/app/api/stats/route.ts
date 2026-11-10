import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [total, blocked, buffering, confirmed, voided, expired, avgScore, recent] =
    await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: "BLOCKED" } }),
      prisma.order.count({ where: { status: "BUFFERING" } }),
      prisma.order.count({ where: { status: "CONFIRMED" } }),
      prisma.order.count({ where: { status: "VOIDED" } }),
      prisma.order.count({ where: { status: "EXPIRED" } }),
      prisma.order.aggregate({ _avg: { riskScore: true, distanceKm: true } }),
      prisma.order.findMany({
        where: { status: { in: ["BLOCKED", "BUFFERING"] } },
        select: { amount: true },
      }),
    ]);

  const protectedValue = recent.reduce((sum, o) => sum + o.amount, 0);

  return NextResponse.json({
    total,
    blocked,
    buffering,
    confirmed,
    voided,
    expired,
    avgRiskScore: Math.round(avgScore._avg.riskScore ?? 0),
    avgDistanceKm: Math.round(avgScore._avg.distanceKm ?? 0),
    protectedValue: Math.round(protectedValue * 100) / 100,
    blockRate: total > 0 ? Math.round(((blocked + voided + expired) / total) * 1000) / 10 : 0,
  });
}
