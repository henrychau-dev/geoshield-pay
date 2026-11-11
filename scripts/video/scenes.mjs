/**
 * Single source of truth for the GeoShield Pay demo film.
 *
 * One continuous take: every scene runs inside the same browser session, in this
 * order, with no cuts. `record.mjs` interprets the `actions`, `tts.mjs` turns the
 * `narration` into an audio track, and `compose.mjs` burns the same text as
 * captions.
 *
 * Action kinds (implemented in record.mjs):
 *   goto            { path }
 *   click           { role: "button" | "link", name, exact?, regex?, settleMs? }
 *   clickChip       { section: string, name: string }      // button chip inside a section
 *   clickOrderCard  { reference: string }                  // buffer-cabin card link
 *   scroll          { dy: number }                         // smooth, eased
 *   hover           { role, name, exact?, regex? }
 *   wait            { ms }
 *   assertText      { text, timeoutMs? }
 *   snapshotBlocked {}                                     // remember newest BLOCKED reference
 *   assertFreshOrder{}                                     // that reference must be visible
 *   rerunAnalyst    { expectModel: string }                // click Re-run, wait for LLM: model
 *   saveRules       { expectBadge: string }                // click Save, wait for live badge
 */

export const SCENES = [
  {
    id: "landing",
    narration:
      "Every chargeback story ends the same way: the money already left. Disputes, evidence, penalties. GeoShield Pay moves the decision earlier — before PayPal even creates an order.",
    minSeconds: 12,
    actions: [
      { kind: "goto", path: "/" },
      { kind: "wait", ms: 700 },
      { kind: "scroll", dy: 260 },
    ],
  },
  {
    id: "honest",
    narration:
      "This is a real checkout. The browser sends device GPS, the server resolves the request IP. Both land in the same Californian metro. Verdict: pass, risk score zero.",
    minSeconds: 12,
    actions: [
      { kind: "click", role: "link", name: "Try the checkout demo" },
      { kind: "wait", ms: 600 },
      { kind: "click", role: "button", name: "Honest customer", exact: true },
      { kind: "wait", ms: 500 },
      { kind: "scroll", dy: 380 },
      { kind: "click", role: "button", name: "Verify & continue to payment" },
      { kind: "assertText", text: "Precheck passed — safe to pay.", timeoutMs: 8000 },
      { kind: "wait", ms: 900 },
    ],
  },
  {
    id: "vpn",
    narration:
      "Same store, same cart. But this IP is a Tor exit node in Germany while the phone sits in New York — over six thousand kilometres apart, on a proxy network. Hard-blocked before a PayPal order exists. Nothing to dispute, because nothing was charged.",
    minSeconds: 15,
    actions: [
      { kind: "click", role: "button", name: "VPN fraudster", exact: true },
      { kind: "wait", ms: 450 },
      { kind: "click", role: "button", name: "Verify & continue to payment" },
      { kind: "assertText", text: "Transaction blocked", timeoutMs: 8000 },
      { kind: "assertText", text: "No PayPal order was created", timeoutMs: 3000 },
      { kind: "snapshotBlocked" },
      { kind: "wait", ms: 1400 },
    ],
  },
  {
    id: "mismatch",
    narration:
      "Not every fraud is that loud. The geography looks clean here, but the PayPal account and billing country are China, shipping to the United States. So instead of capturing, GeoShield authorizes the payment and parks the funds for seventy-two hours.",
    minSeconds: 14,
    actions: [
      { kind: "click", role: "button", name: "Three-country mismatch", exact: true },
      { kind: "wait", ms: 450 },
      { kind: "click", role: "button", name: "Verify & continue to payment" },
      { kind: "assertText", text: "Precheck flagged this order", timeoutMs: 8000 },
      { kind: "wait", ms: 1200 },
    ],
  },
  {
    id: "dashboard",
    narration:
      "Every interception you just watched is already in the merchant console — that blocked order is the one we created seconds ago. Funds in the buffer cabin keep their live countdown. Nothing was captured, so no dispute can open.",
    minSeconds: 16,
    actions: [
      { kind: "click", role: "link", name: "Merchant Dashboard", exact: false },
      { kind: "wait", ms: 900 },
      { kind: "assertText", text: "Risk Command Center", timeoutMs: 8000 },
      { kind: "assertFreshOrder" },
      { kind: "scroll", dy: 330 },
      { kind: "wait", ms: 1500 },
    ],
  },
  {
    id: "analyst",
    narration:
      "Open the buffered order: IP versus GPS, the distance, the three countries, the interception timeline. Then the AI analyst reads the signal chain and writes the story in plain English. This is a live model call, right now.",
    minSeconds: 16,
    actions: [
      { kind: "clickOrderCard", reference: "GS-DEMO-5T1R8W" },
      { kind: "wait", ms: 900 },
      { kind: "assertText", text: "AI Risk Analyst", timeoutMs: 8000 },
      { kind: "scroll", dy: 220 },
      { kind: "wait", ms: 900 },
      { kind: "rerunAnalyst", expectModel: "deepseek-chat" },
      { kind: "wait", ms: 1200 },
    ],
  },
  {
    id: "rules",
    narration:
      "Finally, the rules. The merchant blacklists one country and saves. Under a second later the engine already runs the new rule — no restart, no deploy. Blocked before the money moves: that is the product.",
    minSeconds: 13,
    actions: [
      { kind: "click", role: "link", name: "Rule Center", exact: true },
      { kind: "wait", ms: 900 },
      { kind: "assertText", text: "Rule Center", timeoutMs: 8000 },
      { kind: "scroll", dy: 520 },
      { kind: "wait", ms: 500 },
      { kind: "clickChip", section: "Blacklist — hard block", name: "United States" },
      { kind: "wait", ms: 600 },
      { kind: "saveRules", expectBadge: "Live — reloaded just now" },
      { kind: "wait", ms: 1200 },
    ],
  },
];

/** Extra quiet time kept after the last scene before the take ends. */
export const TAIL_SECONDS = 1.4;

/** Narration starts this long after a scene becomes visible. */
export const NARRATION_LEAD_SECONDS = 0.4;
