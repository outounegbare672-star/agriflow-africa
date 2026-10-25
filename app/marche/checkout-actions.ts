"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { createCinetPayCheckout } from "@/lib/cinetpay";
import { getPrisma } from "@/lib/prisma";

export async function createSandboxCheckout(data: FormData) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fmarche");
  if (
    process.env.CINETPAY_MODE !== "sandbox" ||
    !process.env.CINETPAY_SANDBOX_API_KEY ||
    !process.env.CINETPAY_SANDBOX_SITE_ID
  ) {
    redirect("/marche?error=payment-sandbox-not-configured");
  }

  const listingId = String(data.get("listingId") ?? "").trim();
  const buyerPhone = String(data.get("buyerPhone") ?? "").trim();
  if (!/^\+[1-9]\d{7,14}$/.test(buyerPhone) || data.get("sandboxConsent") !== "on") {
    redirect("/marche?error=invalid-sandbox-payment");
  }

  const prisma = getPrisma();
  const recentAttempts = await prisma.mobileMoneyCheckout.count({
    where: { buyerId: session.user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recentAttempts >= 5) redirect("/marche?error=sandbox-payment-limit");

  const listing = await prisma.marketListing.findFirst({
    where: { id: listingId, active: true },
    select: {
      id: true,
      title: true,
      quantity: true,
      unit: true,
      pricePerUnit: true,
      cooperativeId: true,
      cooperative: { select: { currency: true, countryCode: true } },
    },
  });
  if (
    !listing || listing.cooperative.currency !== "XOF" ||
    listing.cooperative.countryCode !== "TG" ||
    listing.pricePerUnit === null
  ) {
    redirect("/marche?error=listing-payment-unavailable");
  }

  const amount = Math.round(listing.quantity * listing.pricePerUnit);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100_000_000) {
    redirect("/marche?error=listing-payment-unavailable");
  }

  const transactionId = `AGR-${randomUUID()}`;
  await prisma.mobileMoneyCheckout.create({
    data: {
      transactionId,
      amount,
      currency: listing.cooperative.currency,
      buyerId: session.user.id,
      cooperativeId: listing.cooperativeId,
      marketListingId: listing.id,
    },
  });

  let checkout: Awaited<ReturnType<typeof createCinetPayCheckout>>;
  try {
    checkout = await createCinetPayCheckout({
      transactionId,
      amount,
      currency: listing.cooperative.currency,
      description: `Test ECO-FARMS Togo - ${listing.title}`,
      buyerId: session.user.id,
      buyerName: session.user.name,
      buyerEmail: session.user.email,
      buyerPhone,
    });
  } catch {
    await prisma.mobileMoneyCheckout.update({
      where: { transactionId },
      data: { status: "FAILED", completedAt: new Date() },
    });
    redirect("/marche?error=sandbox-payment-initiation");
  }
  await prisma.mobileMoneyCheckout.update({
    where: { transactionId },
    data: {
      paymentUrl: checkout.paymentUrl,
      providerReference: checkout.providerReference,
      status: "PENDING",
    },
  });
  redirect(checkout.paymentUrl);
}
