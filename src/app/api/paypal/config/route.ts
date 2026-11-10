import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Exposes the PayPal sandbox client id to the frontend buttons. */
export async function GET() {
  return NextResponse.json({
    clientId: process.env.PAYPAL_CLIENT_ID ?? "test",
    currency: "USD",
    configured: Boolean(
      process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_ID !== "REPLACE_WITH_SANDBOX_CLIENT_ID"
    ),
  });
}
