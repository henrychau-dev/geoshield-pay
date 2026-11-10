/**
 * Demo data generator — fills the dashboard with a realistic mix of orders so
 * judges immediately see the shield in action. Safe to re-run (clears first).
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_RULES } from "../src/types/index";

const prisma = new PrismaClient();

const hAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);
const hLater = (h: number) => new Date(Date.now() + h * 3600 * 1000);

interface DemoOrder {
  reference: string; name: string; email: string; product: string; amount: number;
  status: string; decision: string; ipCountry: string; ipCity: string; proxy: boolean;
  gpsCountry: string | null; distanceKm: number; acc: string; bill: string; ship: string;
  ruleScore: number; riskScore: number; verdict: string;
  reportEn: string; reportZh: string;
  bufferHoursLeft?: number; hoursAgo: number;
}

const DEMO_ORDERS: DemoOrder[] = [
  {
    reference: "GS-DEMO-8F3K2A", name: "Sarah Mitchell", email: "sarah.m@example.com", product: "Mechanical keyboard (US→US)", amount: 149.0,
    status: "CONFIRMED", decision: "PASS", ipCountry: "US", ipCity: "San Jose", proxy: false,
    gpsCountry: "US", distanceKm: 18, acc: "US", bill: "US", ship: "US", ruleScore: 0, riskScore: 4, verdict: "ALLOW",
    reportEn: "All signals align: residential US IP, GPS within 18 km in the same metro, consistent account/billing/shipping countries and a modest amount. No fraud indicators; the transaction was captured immediately.",
    reportZh: "所有信号一致：美国家宽 IP，GPS 相距仅 18 公里，账号/账单/收货国一致，金额正常。无欺诈指标，交易已即时扣款。",
    hoursAgo: 26,
  },
  {
    reference: "GS-DEMO-2X9Q7M", name: "Unknown Actor", email: "burner041@example.com", product: "12× gift cards (US→US)", amount: 1200.0,
    status: "BLOCKED", decision: "BLOCK", ipCountry: "NL", ipCity: "Amsterdam", proxy: true,
    gpsCountry: "US", distanceKm: 5837, acc: "US", bill: "US", ship: "US", ruleScore: 100, riskScore: 97, verdict: "DENY",
    reportEn: "Classic account-takeover pattern: Tor/proxy exit node in Amsterdam while the device GPS places the phone in New York — 5,837 km apart. The IP belongs to a hosting network and the cart contains 12 high-resale gift cards. GeoShield hard-blocked before any PayPal order existed.",
    reportZh: "典型账号盗刷模式：阿姆斯特丹的 Tor/代理出口节点，而设备 GPS 定位在纽约，相距 5,837 公里。IP 属于托管网络，购物车含 12 张高转售礼品卡。GeoShield 在创建 PayPal 订单前就已硬拦截。",
    hoursAgo: 21,
  },
  {
    reference: "GS-DEMO-5T1R8W", name: "Wei Zhang", email: "weizhang88@example.com", product: "Camera lens (CN→US)", amount: 489.0,
    status: "BUFFERING", decision: "BUFFER", ipCountry: "US", ipCity: "Los Angeles", proxy: false,
    gpsCountry: "US", distanceKm: 42, acc: "CN", bill: "CN", ship: "US", ruleScore: 40, riskScore: 52, verdict: "REVIEW",
    reportEn: "Geography is clean (US IP matches GPS), but the PayPal account country (CN) and billing country (CN) differ from the shipping country (US) — the classic three-country mismatch often seen in mule-freight fraud. Funds are authorized but suspended in the 72h buffer cabin; recommend confirming only after delivery-intent verification.",
    reportZh: "地理信号正常（美国 IP 与 GPS 匹配），但 PayPal 账号国（CN）和账单国（CN）与收货国（US）不一致——典型的“三国不一致”水货运货欺诈特征。资金已预授权并挂起于 72 小时缓冲舱；建议核实收货意愿后再扣款。",
    bufferHoursLeft: 55, hoursAgo: 17,
  },
  {
    reference: "GS-DEMO-7B4N1C", name: "Erik Johansson", email: "erik.j@example.com", product: "Studio monitor pair (SE→DE)", amount: 649.0,
    status: "EXPIRED", decision: "BUFFER", ipCountry: "SE", ipCity: "Stockholm", proxy: false,
    gpsCountry: "SE", distanceKm: 9, acc: "SE", bill: "SE", ship: "DE", ruleScore: 30, riskScore: 41, verdict: "REVIEW",
    reportEn: "Cross-border Nordic order with consistent IP/GPS but shipping to a different country than billing. Entered the 72h buffer cabin; the customer never responded, so the watchdog voided the authorization and released the funds automatically — zero dispute risk for the merchant.",
    reportZh: "北欧跨境订单，IP/GPS 一致，但收货国与账单国不同。进入 72 小时缓冲舱后客户未响应，看门狗自动撤销授权并释放资金——商家零拒付风险。",
    hoursAgo: 80,
  },
  {
    reference: "GS-DEMO-9K6V3H", name: "Ade Obi", email: "ade.obi@example.com", product: "iPhone 15 Pro (NG→US)", amount: 1099.0,
    status: "VOIDED", decision: "BUFFER", ipCountry: "US", ipCity: "Houston", proxy: true,
    gpsCountry: "US", distanceKm: 220, acc: "NG", bill: "US", ship: "US", ruleScore: 55, riskScore: 68, verdict: "DENY",
    reportEn: "Hosting-network IP 220 km from the device, Nigerian PayPal account on a $1,099 high-resale device shipping to a US freight forwarder profile. Buffered by the cabin; the merchant voided after the AI report — funds released with no chargeback exposure.",
    reportZh: "托管网络 IP 与设备相距 220 公里，尼日利亚 PayPal 账号购买 1,099 美元高转售设备并收货至美国转运地址。经缓冲舱挂起后，商家根据 AI 报告手动撤销——资金已释放，无拒付风险。",
    hoursAgo: 44,
  },
  {
    reference: "GS-DEMO-3M8J5P", name: "Grace Liu", email: "grace.liu@example.com", product: "Ergonomic chair ×2 (SG→SG)", amount: 780.0,
    status: "CONFIRMED", decision: "PASS", ipCountry: "SG", ipCity: "Singapore", proxy: false,
    gpsCountry: "SG", distanceKm: 6, acc: "SG", bill: "SG", ship: "SG", ruleScore: 0, riskScore: 7, verdict: "ALLOW",
    reportEn: "Low-risk wholesale order: corporate email, IP and GPS both in Singapore 6 km apart, all three countries consistent. Captured immediately.",
    reportZh: "低风险批发订单：企业邮箱，IP 与 GPS 同在新加坡相距 6 公里，三国一致。已即时扣款。",
    hoursAgo: 9,
  },
];

async function main() {
  console.log("Seeding GeoShield Pay demo data…");

  await prisma.auditLog.deleteMany();
  await prisma.riskReport.deleteMany();
  await prisma.order.deleteMany();

  // Seed rules with a demo-blacklisted IP used by the checkout scenario
  const rules = {
    ...DEFAULT_RULES,
    blacklists: { countries: ["KP", "IR", "SY"], ips: ["196.52.43.60"] },
  };
  await prisma.ruleConfigRow.upsert({
    where: { id: "default" },
    update: { config: JSON.stringify(rules) },
    create: { id: "default", config: JSON.stringify(rules) },
  });

  for (const d of DEMO_ORDERS) {
    const bufferExpiresAt =
      d.status === "BUFFERING"
        ? hLater(d.bufferHoursLeft ?? 55)
        : d.status === "EXPIRED"
          ? hAgo(4)
          : null;

    const order = await prisma.order.create({
      data: {
        reference: d.reference,
        customerName: d.name,
        customerEmail: d.email,
        product: d.product,
        amount: d.amount,
        status: d.status,
        decision: d.decision,
        blockedReason: d.status === "BLOCKED" ? "Geo-lock exceeded; proxy network detected" : null,
        paypalOrderId: d.status === "BLOCKED" ? null : `PAYPAL-DEMO-${d.reference.slice(-6)}`,
        paypalAuthorizationId: ["CONFIRMED", "VOIDED", "EXPIRED", "BUFFERING"].includes(d.status)
          ? `AUTH-DEMO-${d.reference.slice(-6)}` : null,
        ipCountry: d.ipCountry, ipCity: d.ipCity, isProxyOrVpn: d.proxy,
        gpsCountry: d.gpsCountry, gpsLat: 37.386, gpsLng: -122.084,
        billingCountry: d.bill, shippingCountry: d.ship, accountCountry: d.acc,
        distanceKm: d.distanceKm, ruleScore: d.ruleScore, riskScore: d.riskScore,
        bufferExpiresAt,
        createdAt: hAgo(d.hoursAgo),
      },
    });

    await prisma.riskReport.create({
      data: {
        orderId: order.id, score: d.riskScore, verdict: d.verdict,
        signals: JSON.stringify({ seeded: true, decision: d.decision }),
        reportZh: d.reportZh, reportEn: d.reportEn,
        model: "gpt-4o-mini", source: "AI",
        createdAt: hAgo(d.hoursAgo),
      },
    });

    const events: Array<{ type: string; message: string; offsetH: number }> = [{ type: "PRECHECK", message: `Precheck ${d.decision}: rule score ${d.ruleScore}/100`, offsetH: d.hoursAgo }];
    if (d.decision === "BLOCK") events.push({ type: "BLOCK", message: "Pre-transaction hard block — no PayPal order created", offsetH: d.hoursAgo });
    else {
      events.push({ type: "BUFFER_START", message: "Funds authorized via PayPal AUTHORIZE", offsetH: d.hoursAgo });
      if (d.status === "CONFIRMED") events.push({ type: "CAPTURE", message: "Payment captured", offsetH: d.hoursAgo - 1 });
      if (d.status === "VOIDED") events.push({ type: "VOID", message: "Merchant voided authorization — funds released", offsetH: d.hoursAgo + 2 });
      if (d.status === "EXPIRED") events.push({ type: "EXPIRE", message: "72h window elapsed — watchdog voided authorization", offsetH: d.hoursAgo + 72 });
    }
    events.push({ type: "AI_ANALYSIS", message: `AI risk analysis completed (score=${d.riskScore}, verdict=${d.verdict})`, offsetH: d.hoursAgo });

    for (const e of events) {
      await prisma.auditLog.create({
        data: { orderId: order.id, type: e.type, message: e.message, createdAt: hAgo(e.offsetH) },
      });
    }
  }

  console.log(`Seeded ${DEMO_ORDERS.length} demo orders, rules and audit trail.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
