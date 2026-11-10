import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { voidAuthorization } from "@/lib/paypal/client";

/** Customer rejects a buffered order → void authorization, release funds. */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "BUFFERING") {
    return NextResponse.json({ error: `Order is not buffering (status=${order.status})` }, { status: 409 });
  }

  try {
    await voidAuthorization(order.paypalAuthorizationId!, order.reference);
    await prisma.order.update({ where: { id: order.id }, data: { status: "VOIDED" } });
    await prisma.auditLog.create({
      data: { orderId: order.id, type: "VOID", message: "Customer rejected in buffer cabin — voided authorization" },
    });
    return NextResponse.json({ status: "VOIDED" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Void failed" },
      { status: 502 }
    );
  }
}
