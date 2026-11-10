import { prisma } from "@/lib/db";
import type { RiskSignalInput, EngineResult } from "@/types";
import { countryName } from "@/types";

interface AiVerdict {
  score: number;
  verdict: "ALLOW" | "REVIEW" | "DENY";
  reportZh: string;
  reportEn: string;
}

function buildPrompt(s: RiskSignalInput, engine: EngineResult): string {
  const g = s.geo;
  return `You are a senior cross-border e-commerce fraud analyst working inside GeoShield Pay, a pre-transaction risk shield for PayPal merchants.

Analyze this order and produce a fraud assessment.

## Signals
- Customer IP: ${g.ip} → country ${g.ipCountry ?? "unknown"}${g.ipCity ? ` (city: ${g.ipCity})` : ""}
- VPN/Proxy/Hosting IP: ${g.isProxyOrVpn ? "YES" : "no"}
- Customer GPS: ${g.gpsLat != null ? `${g.gpsLat.toFixed(3)}, ${g.gpsLng?.toFixed(3)} → country ${g.gpsCountry ?? "unknown"}` : "not provided"}
- IP↔GPS distance: ${g.distanceKm != null ? `${g.distanceKm.toLocaleString()} km` : "n/a"}
- PayPal account country: ${s.accountCountry}
- Billing country: ${s.billingCountry}
- Shipping country: ${s.shippingCountry}
- Amount: $${s.amount.toFixed(2)} USD

## Rule engine result
- Decision: ${engine.decision}
- Rule score: ${engine.ruleScore}/100
- Hits: ${engine.ruleHits.map((h) => `${h.rule} (${h.impact}): ${h.detail}`).join("; ")}

Respond ONLY with a JSON object (no markdown fences):
{
  "score": <0-100 integer, fraud risk>,
  "verdict": "ALLOW" | "REVIEW" | "DENY",
  "reportEn": "<3-5 sentence English analysis explaining the signals, the reasoning and the recommended action>",
  "reportZh": "<the same analysis in Chinese, 3-5 sentences>"
}`;
}

/**
 * LLM risk analyst. Fully async — never blocks the payment path.
 * Falls back to a deterministic rule-based report on timeout/failure.
 */
export async function analyzeOrder(
  orderId: string,
  signal: RiskSignalInput,
  engine: EngineResult
): Promise<void> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  let result: AiVerdict | null = null;
  let source: "AI" | "RULE_FALLBACK" = "AI";
  let usedModel = model;

  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are a precise fraud analyst. Always answer with valid JSON only." },
            { role: "user", content: buildPrompt(signal, engine) },
          ],
        }),
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content) as AiVerdict;
          if (typeof parsed.score === "number" && parsed.reportEn && parsed.reportZh) {
            result = parsed;
          }
        }
      }
    } catch {
      // fall through to rule fallback
    }
  }

  if (!result) {
    source = "RULE_FALLBACK";
    usedModel = "rule-fallback";
    result = fallbackVerdict(signal, engine);
  }

  const score = Math.min(100, Math.max(0, Math.round(result.score)));
  await prisma.riskReport.create({
    data: {
      orderId,
      score,
      verdict: result.verdict,
      signals: JSON.stringify({
        ipCountry: signal.geo.ipCountry,
        gpsCountry: signal.geo.gpsCountry,
        distanceKm: signal.geo.distanceKm,
        isProxyOrVpn: signal.geo.isProxyOrVpn,
        billingCountry: signal.billingCountry,
        shippingCountry: signal.shippingCountry,
        accountCountry: signal.accountCountry,
        amount: signal.amount,
        ruleHits: engine.ruleHits,
        decision: engine.decision,
      }),
      reportZh: result.reportZh,
      reportEn: result.reportEn,
      model: usedModel,
      source,
    },
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { riskScore: score },
  });
  await prisma.auditLog.create({
    data: {
      orderId,
      type: "AI_ANALYSIS",
      message: `AI risk analysis completed (source=${source}, score=${score}, verdict=${result.verdict})`,
    },
  });
}

function fallbackVerdict(s: RiskSignalInput, engine: EngineResult): AiVerdict {
  const score = engine.ruleScore;
  const verdict: AiVerdict["verdict"] = score >= 70 ? "DENY" : score >= 35 ? "REVIEW" : "ALLOW";
  const g = s.geo;
  const dist = g.distanceKm != null ? `${g.distanceKm.toLocaleString()} km` : "n/a";
  const en = `Rule-engine analysis (AI unavailable): ${engine.reasons.join("; ") || "no anomalies"}. IP country ${countryName(g.ipCountry)} vs GPS ${countryName(g.gpsCountry)}, distance ${dist}. ${g.isProxyOrVpn ? "Proxy/VPN hosting network detected." : "No proxy indicators."} Recommended action: ${engine.decision}.`;
  const zh = `规则引擎分析（AI 暂不可用）：${engine.reasons.join("；") || "未发现异常"}。IP 归属 ${countryName(g.ipCountry)}，GPS 归属 ${countryName(g.gpsCountry)}，相距 ${dist}。${g.isProxyOrVpn ? "检测到代理/VPN 主机网络。" : "未检测到代理特征。"}建议处置：${engine.decision}。`;
  return { score, verdict, reportEn: en, reportZh: zh };
}
