import type { Order } from "@prisma/client";
import type { RiskSignalInput } from "@/types";

/** Rebuild a RiskSignalInput from a stored Order row (used by AI re-analysis). */
export function signalFromOrder(order: Order): RiskSignalInput {
  return {
    geo: {
      ip: "n/a",
      ipCountry: order.ipCountry,
      ipCity: order.ipCity,
      ipLat: null,
      ipLng: null,
      isProxyOrVpn: order.isProxyOrVpn,
      gpsLat: order.gpsLat,
      gpsLng: order.gpsLng,
      gpsCountry: order.gpsCountry,
      distanceKm: order.distanceKm,
    },
    billingCountry: order.billingCountry ?? "",
    shippingCountry: order.shippingCountry ?? "",
    accountCountry: order.accountCountry ?? "",
    amount: order.amount,
  };
}
