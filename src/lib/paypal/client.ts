const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not configured (.env)");
  }
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

async function paypalFetch(
  path: string,
  init: { method: string; body?: unknown; idempotencyKey?: string }
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = init.idempotencyKey;
  return fetch(`${PAYPAL_API}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
}

export async function createAuthorizedOrder(params: {
  reference: string;
  amount: number;
  currency?: string;
  description: string;
}): Promise<{ id: string }> {
  const res = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `create-${params.reference}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: params.reference,
          description: params.description.slice(0, 127),
          amount: {
            currency_code: params.currency ?? "USD",
            value: params.amount.toFixed(2),
          },
        },
      ],
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PayPal create order failed: ${JSON.stringify(data.details ?? data.message ?? data)}`);
  }
  return { id: data.id };
}

/** Capture the buyer's approval for the order (server-side). */
export async function authorizeOrder(paypalOrderId: string): Promise<string> {
  const res = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/authorize`, {
    method: "POST",
    idempotencyKey: `authz-${paypalOrderId}`,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PayPal authorize failed: ${JSON.stringify(data.details ?? data.message ?? data)}`);
  }
  const link = data.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
  if (!link) throw new Error("PayPal authorize returned no authorization id");
  return link;
}

/** Capture funds from a 72h-cabin authorization. */
export async function captureAuthorization(
  authorizationId: string,
  reference: string
): Promise<void> {
  const res = await paypalFetch(`/v2/payments/authorizations/${authorizationId}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${reference}`,
    body: {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`PayPal capture failed: ${JSON.stringify(data.details ?? data.message ?? data)}`);
  }
}

/** Void (release) a pending authorization — the buffer-cabin release valve. */
export async function voidAuthorization(
  authorizationId: string,
  reference: string
): Promise<void> {
  const res = await paypalFetch(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    idempotencyKey: `void-${reference}`,
    body: {},
  });
  if (!res.ok && res.status !== 422 /* already captured/voided */) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`PayPal void failed: ${JSON.stringify(data.details ?? data.message ?? data)}`);
  }
}
