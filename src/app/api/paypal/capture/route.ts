import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { captureAuthorization } from "@/lib/paypal/client";

/** Capture an existing authorization (merchant-side settle for buffer orders). */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "CONFIRMED") return NextResponse.json({ status: "CONFIRMED" });
  if (!order.paypalAuthorizationId) {
    return NextResponse.json({ error: "No authorization on record" }, { status: 409 });
  }

  try {
    await captureAuthorization(order.paypalAuthorizationId, order.reference);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    await prisma.auditLog.create({
      data: { orderId: order.id, type: "CAPTURE", message: "Authorization captured — funds settled" },
    });
    return NextResponse.json({ status: "CONFIRMED" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Capture failed" },
      { status: 502 }
    );
  }
}
