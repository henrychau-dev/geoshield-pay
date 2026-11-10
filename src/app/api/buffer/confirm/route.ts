import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { captureAuthorization } from "@/lib/paypal/client";

/** Customer confirms a buffered order within the 72h window → capture funds. */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "BUFFERING") {
    return NextResponse.json({ error: `Order is not buffering (status=${order.status})` }, { status: 409 });
  }

  try {
    await captureAuthorization(order.paypalAuthorizationId!, order.reference);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    await prisma.auditLog.create({
      data: { orderId: order.id, type: "CONFIRM", message: "Customer confirmed in buffer cabin — captured funds" },
    });
    return NextResponse.json({ status: "CONFIRMED" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Capture failed" },
      { status: 502 }
    );
  }
}
