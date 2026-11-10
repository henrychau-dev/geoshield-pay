import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeOrder, captureAuthorization } from "@/lib/paypal/client";
import { getRules } from "@/lib/rules/store";

/**
 * Called after the buyer approves in the PayPal popup.
 * - PASS  → authorize then immediately capture (frictionless path)
 * - BUFFER → authorize funds and open the 72h buffer cabin countdown
 */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!order.paypalOrderId) {
    return NextResponse.json({ error: "No PayPal order on record" }, { status: 409 });
  }

  try {
    const authorizationId = await authorizeOrder(order.paypalOrderId);

    if (order.decision === "BUFFER") {
      const rules = await getRules();
      const hours = rules.bufferCabin.countdownHours || 72;
      const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "BUFFERING",
          paypalAuthorizationId: authorizationId,
          bufferExpiresAt: expiresAt,
        },
      });
      await prisma.auditLog.create({
        data: {
          orderId: order.id,
          type: "BUFFER_START",
          message: `Funds authorized and suspended in 72h buffer cabin until ${expiresAt.toISOString()}`,
        },
      });
      return NextResponse.json({ status: "BUFFERING", bufferExpiresAt: expiresAt });
    }

    // PASS → immediate capture
    await captureAuthorization(authorizationId, order.reference);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED", paypalAuthorizationId: authorizationId },
    });
    await prisma.auditLog.create({
      data: { orderId: order.id, type: "CAPTURE", message: "Payment captured (PASS path, no buffer needed)" },
    });
    return NextResponse.json({ status: "CONFIRMED" });
  } catch (err) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "FAILED", blockedReason: err instanceof Error ? err.message : "PayPal authorize failed" },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PayPal authorize failed" },
      { status: 502 }
    );
  }
}
