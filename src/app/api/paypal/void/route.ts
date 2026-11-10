import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { voidAuthorization } from "@/lib/paypal/client";

/** Void an authorization and release the suspended funds. */
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({ orderId: undefined }));
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!order.paypalAuthorizationId) {
    return NextResponse.json({ error: "No authorization on record" }, { status: 409 });
  }

  try {
    await voidAuthorization(order.paypalAuthorizationId, order.reference);
    await prisma.order.update({ where: { id: order.id }, data: { status: "VOIDED" } });
    await prisma.auditLog.create({
      data: { orderId: order.id, type: "VOID", message: "Authorization voided — funds released, no dispute risk" },
    });
    return NextResponse.json({ status: "VOIDED" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Void failed" },
      { status: 502 }
    );
  }
}
