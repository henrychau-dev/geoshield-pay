import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildGeoContext, extractClientIp } from "@/lib/geo/ip";
import { evaluateRisk } from "@/lib/risk/engine";
import { analyzeOrder } from "@/lib/risk/ai-agent";
import type { RiskSignalInput } from "@/types";

interface PrecheckBody {
  gpsLat?: number | null;
  gpsLng?: number | null;
  billingCountry: string;
  shippingCountry: string;
  accountCountry: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  product: string;
}

/**
 * THE pre-transaction gate. Everything runs BEFORE any PayPal order exists:
 *  1. Resolve IP geolocation (cached) + reverse geocode GPS
 *  2. Evaluate the rule engine (whitelist → blacklist → amount → geo lock → 3-country)
 *  3. Persist the order; BLOCK stops here — no PayPal call is ever made
 *  4. Kick off async LLM risk analysis (never blocks the payment path)
 */
export async function POST(req: NextRequest) {
  let body: PrecheckBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { gpsLat, gpsLng, billingCountry, shippingCountry, accountCountry, amount } = body;
  if (!billingCountry || !shippingCountry || !accountCountry || typeof amount !== "number") {
    return NextResponse.json(
      { error: "billingCountry, shippingCountry, accountCountry and numeric amount are required" },
      { status: 400 }
    );
  }

  const ip = extractClientIp(req.headers);
  const lat = gpsLat == null ? null : Number(gpsLat);
  const lng = gpsLng == null ? null : Number(gpsLng);
  const geo = await buildGeoContext(
    ip,
    lat != null && Number.isFinite(lat) ? lat : null,
    lng != null && Number.isFinite(lng) ? lng : null
  );

  const signal: RiskSignalInput = {
    geo,
    billingCountry,
    shippingCountry,
    accountCountry,
    amount,
  };

  const engine = await evaluateRisk(signal);

  const reference = `GS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      reference,
      customerName: body.customerName || "Guest",
      customerEmail: body.customerEmail || "guest@example.com",
      product: body.product || "Cart item",
      amount,
      status: engine.decision === "BLOCK" ? "BLOCKED" : "PENDING_PRECHECK",
      decision: engine.decision,
      blockedReason: engine.decision === "BLOCK" ? engine.reasons.join("; ") : null,
      ipCountry: geo.ipCountry,
      ipCity: geo.ipCity,
      isProxyOrVpn: geo.isProxyOrVpn,
      gpsCountry: geo.gpsCountry,
      gpsLat: geo.gpsLat,
      gpsLng: geo.gpsLng,
      billingCountry,
      shippingCountry,
      accountCountry,
      distanceKm: geo.distanceKm,
      ruleScore: engine.ruleScore,
    },
  });

  await prisma.auditLog.create({
    data: {
      orderId: order.id,
      type: engine.decision === "BLOCK" ? "BLOCK" : "PRECHECK",
      message:
        engine.decision === "BLOCK"
          ? `Pre-transaction BLOCK: ${engine.reasons.join("; ")}`
          : `Precheck ${engine.decision}: ${engine.reasons.join("; ")}`,
    },
  });

  // Fire-and-forget AI analysis — the payment path never waits for the LLM.
  void analyzeOrder(order.id, signal, engine).catch((err) =>
    console.error(`[ai] analysis failed for ${reference}:`, err)
  );

  return NextResponse.json({
    orderId: order.id,
    reference,
    decision: engine.decision,
    reasons: engine.reasons,
    ruleHits: engine.ruleHits,
    ruleScore: engine.ruleScore,
    geo,
  });
}
