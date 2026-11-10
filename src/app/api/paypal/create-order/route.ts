import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuthorizedOrder } from "@/lib/paypal/client";

/**
 * Creates the PayPal order with intent=AUTHORIZE.
 * Only reachable for orders that survived the pre-transaction geo shield.
 */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.decision === "BLOCK") {
    return NextResponse.json(
      { error: "Order was blocked by GeoShield precheck — PayPal order creation is forbidden" },
      { status: 403 }
    );
  }

  try {
    const paypalOrder = await createAuthorizedOrder({
      reference: order.reference,
      amount: order.amount,
      currency: order.currency,
      description: `GeoShield Pay — ${order.product}`,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { paypalOrderId: paypalOrder.id },
    });
    return NextResponse.json({ paypalOrderId: paypalOrder.id });
  } catch (err) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "FAILED", blockedReason: err instanceof Error ? err.message : "PayPal create failed" },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PayPal create order failed" },
      { status: 502 }
    );
  }
}
