import "server-only";

import { getPrisma } from "@/lib/prisma";

type CheckoutStatus = "PENDING" | "PAID" | "FAILED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireSandboxConfig() {
  if (process.env.CINETPAY_MODE !== "sandbox") {
    throw new Error("CinetPay est désactivé : seul le mode sandbox est autorisé.");
  }
  if (!process.env.CINETPAY_SANDBOX_API_KEY || !process.env.CINETPAY_SANDBOX_SITE_ID) {
    throw new Error("Configurez les identifiants dédiés CINETPAY_SANDBOX dans Render.");
  }
}

function publicBaseUrl() {
  const configured = process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (!configured) throw new Error("Configurez l’URL publique avant d’activer le paiement sandbox.");
  const url = new URL(configured);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("L’URL publique doit utiliser HTTPS.");
  }
  return url;
}

export async function createCinetPayCheckout({
  transactionId,
  amount,
  currency,
  description,
  buyerId,
  buyerName,
  buyerEmail,
  buyerPhone,
}: {
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
}) {
  requireSandboxConfig();
  const baseUrl = publicBaseUrl();
  const parts = buyerName.trim().split(/\s+/);
  const firstName = parts.shift() ?? "Acheteur";
  const lastName = parts.join(" ") || firstName;
  const response = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_SANDBOX_API_KEY,
      site_id: process.env.CINETPAY_SANDBOX_SITE_ID,
      transaction_id: transactionId,
      amount,
      currency,
      description: description.slice(0, 120),
      notify_url: new URL("/api/payments/cinetpay/notify", baseUrl).toString(),
      return_url: new URL(`/paiements/test/${encodeURIComponent(transactionId)}`, baseUrl).toString(),
      channels: "MOBILE_MONEY",
      lang: "fr",
      customer_id: buyerId,
      customer_name: firstName,
      customer_surname: lastName,
      customer_email: buyerEmail,
      customer_phone_number: buyerPhone.replace(/^\+/, ""),
      customer_country: "TG",
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`CinetPay a refusé l’initialisation (HTTP ${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.data) ||
    typeof payload.data.payment_url !== "string" ||
    ((typeof payload.code === "string" || typeof payload.code === "number") &&
      !["201", "00"].includes(String(payload.code)))) {
    throw new Error("CinetPay n’a pas retourné d’URL de paiement valide.");
  }
  const paymentUrl = new URL(payload.data.payment_url);
  if (paymentUrl.protocol !== "https:" ||
    !(paymentUrl.hostname === "cinetpay.com" || paymentUrl.hostname.endsWith(".cinetpay.com"))) {
    throw new Error("CinetPay a retourné une destination de paiement non autorisée.");
  }

  return {
    paymentUrl: paymentUrl.toString(),
    providerReference: typeof payload.api_response_id === "string" ? payload.api_response_id : null,
  };
}

export async function refreshCinetPayCheckout(transactionId: string): Promise<CheckoutStatus> {
  requireSandboxConfig();
  const checkout = await getPrisma().mobileMoneyCheckout.findUnique({
    where: { transactionId },
    select: { amount: true, currency: true },
  });
  if (!checkout) throw new Error("Transaction sandbox inconnue.");

  const response = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_SANDBOX_API_KEY,
      site_id: process.env.CINETPAY_SANDBOX_SITE_ID,
      transaction_id: transactionId,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`La vérification CinetPay a échoué (HTTP ${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.code !== "00" || !isRecord(payload.data) ||
    typeof payload.data.status !== "string") {
    throw new Error("CinetPay a retourné un statut de paiement invalide.");
  }
  const providerAmount = typeof payload.data.amount === "number"
    ? payload.data.amount
    : typeof payload.data.amount === "string" && /^\d+$/.test(payload.data.amount)
      ? Number(payload.data.amount)
      : null;
  if (providerAmount !== checkout.amount || payload.data.currency !== checkout.currency) {
    throw new Error("Montant ou devise du statut CinetPay incompatible avec la transaction enregistrée.");
  }
  if (payload.data.transaction_id !== transactionId ||
    (payload.data.site_id !== undefined &&
      String(payload.data.site_id) !== process.env.CINETPAY_SANDBOX_SITE_ID)) {
    throw new Error("La transaction vérifiée ne correspond pas au compte sandbox ECO-FARMS Togo.");
  }

  const status: CheckoutStatus = payload.data.status === "ACCEPTED"
    ? "PAID"
    : payload.data.status === "REFUSED" || payload.data.status === "CANCELLED"
      ? "FAILED"
      : payload.data.status === "PENDING"
        ? "PENDING"
        : (() => { throw new Error("Statut de paiement CinetPay non reconnu."); })();
  const providerReference = typeof payload.data.payment_method === "string"
    ? payload.data.payment_method
    : null;

  await getPrisma().mobileMoneyCheckout.updateMany({
    where: { transactionId, status: { not: "PAID" } },
    data: {
      status,
      providerReference,
      ...(status === "PAID" || status === "FAILED" ? { completedAt: new Date() } : {}),
    },
  });
  return status;
}
