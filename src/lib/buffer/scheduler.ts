import { prisma } from "@/lib/db";
import { voidAuthorization } from "@/lib/paypal/client";

/**
 * Buffer-cabin watchdog: voids expired authorizations so funds are released
 * automatically instead of turning into disputes that damage the merchant's
 * PayPal account health.
 */
export async function runTick(): Promise<{ expired: number; failed: number }> {
  const now = new Date();
  const expired = await prisma.order.findMany({
    where: { status: "BUFFERING", bufferExpiresAt: { lte: now } },
    take: 50,
  });

  let ok = 0;
  let failed = 0;
  for (const order of expired) {
    try {
      if (order.paypalAuthorizationId) {
        await voidAuthorization(order.paypalAuthorizationId, order.reference);
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });
      await prisma.auditLog.create({
        data: {
          orderId: order.id,
          type: "EXPIRE",
          message: "72h buffer cabin expired — authorization voided, funds released",
        },
      });
      ok++;
    } catch (err) {
      console.error(`[buffer] failed to expire order ${order.reference}:`, err);
      failed++;
    }
  }
  if (ok > 0) console.log(`[buffer] expired ${ok} order(s), ${failed} failure(s)`);
  return { expired: ok, failed };
}

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  try {
    // Lazy import so builds without node-cron runtime still succeed.
    const cron = require("node-cron") as typeof import("node-cron");
    cron.schedule("* * * * *", () => {
      runTick().catch((err) => console.error("[buffer] tick failed:", err));
    });
    console.log("[buffer] 72h cabin watchdog scheduled (every minute)");
  } catch (err) {
    console.warn("[buffer] scheduler unavailable:", err);
  }
}
