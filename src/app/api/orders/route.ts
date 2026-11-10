import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const orders = await prisma.order.findMany({
    where: status && status !== "ALL" ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { riskReports: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return NextResponse.json({ orders });
}
