import "server-only";

import { getPrisma } from "@/lib/prisma";

type SmsCategory = "HARVEST" | "WEATHER" | "PAYMENT" | "MARKET";

export async function queueCooperativeSms(
  cooperativeId: string,
  category: SmsCategory,
  message: string,
  producerIds?: string[],
  eventKey?: string,
) {
  const producers = await getPrisma().producer.findMany({
    where: {
      cooperativeId,
      smsConsent: true,
      ...(producerIds ? { id: { in: producerIds } } : {}),
    },
    select: { id: true, phone: true },
    take: 100,
  });

  if (!producers.length) return { queued: 0, sent: 0, failed: 0 };

  const data = producers.map((producer) => ({
    cooperativeId,
    producerId: producer.id,
    category,
    toPhone: producer.phone,
    message,
    ...(eventKey ? { dedupeKey: `${eventKey}:${producer.id}` } : {}),
  }));
  const prisma = getPrisma();
  let notifications: { id: string }[];
  let queued: number;
  if (eventKey) {
    const created = await prisma.smsNotification.createMany({ data, skipDuplicates: true });
    queued = created.count;
    notifications = await prisma.smsNotification.findMany({
      where: {
        dedupeKey: { in: data.flatMap(({ dedupeKey }) => dedupeKey ? [dedupeKey] : []) },
        status: "PENDING",
      },
      select: { id: true },
      take: 100,
    });
  } else {
    notifications = await Promise.all(data.map((entry) =>
      prisma.smsNotification.create({ data: entry, select: { id: true } }),
    ));
    queued = notifications.length;
  }

  let sent = 0;
  let failed = 0;
  if (process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID) {
    for (const notification of notifications.slice(0, 10)) {
      const result = await dispatchSms(notification.id);
      if (result === "SENT") sent += 1;
      if (result === "FAILED") failed += 1;
    }
  }

  return { queued, sent, failed };
}

export async function dispatchSms(notificationId: string) {
  const prisma = getPrisma();
  const notification = await prisma.smsNotification.findUnique({
    where: { id: notificationId },
    select: { id: true, producerId: true, toPhone: true, message: true, status: true },
  });
  if (!notification) return "MISSING" as const;
  if (notification.status !== "PENDING") return notification.status;
  if (!process.env.TERMII_API_KEY || !process.env.TERMII_SENDER_ID) return "PENDING" as const;
  const producer = notification.producerId
    ? await prisma.producer.findFirst({
      where: { id: notification.producerId, smsConsent: true },
      select: { id: true },
    })
    : null;
  if (!producer) {
    await prisma.smsNotification.update({
      where: { id: notificationId },
      data: { status: "CANCELLED", error: "Consentement SMS retiré ou destinataire supprimé." },
    });
    return "CANCELLED" as const;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(notification.toPhone)) {
    await prisma.smsNotification.update({
      where: { id: notificationId },
      data: { status: "FAILED", error: "Le numéro doit être au format international, par exemple +228XXXXXXXX." },
    });
    return "FAILED" as const;
  }

  const baseUrl = process.env.TERMII_BASE_URL ?? "https://api.ng.termii.com";
  let endpoint: URL;
  try {
    endpoint = new URL("/api/sms/send", baseUrl);
  } catch {
    throw new Error("TERMII_BASE_URL must be a valid URL.");
  }
  if (endpoint.protocol !== "https:") {
    throw new Error("TERMII_BASE_URL must use HTTPS.");
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TERMII_API_KEY,
        to: notification.toPhone.slice(1),
        from: process.env.TERMII_SENDER_ID,
        sms: notification.message,
        type: "plain",
        channel: "generic",
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "NetworkError";
    await prisma.smsNotification.update({
      where: { id: notificationId },
      data: { status: "FAILED", error: `Échec de connexion au fournisseur SMS (${reason}).` },
    });
    return "FAILED" as const;
  }

  const body = await response.text();
  if (!response.ok) {
    await prisma.smsNotification.update({
      where: { id: notificationId },
      data: { status: "FAILED", error: `Termii a refusé l’envoi (HTTP ${response.status}).` },
    });
    return "FAILED" as const;
  }

  let providerReference: string | null = null;
  try {
    const result: unknown = JSON.parse(body);
    if (typeof result === "object" && result !== null && "message_id" in result &&
      typeof result.message_id === "string") {
      providerReference = result.message_id;
    }
  } catch {
    providerReference = null;
  }
  if (!providerReference) {
    await prisma.smsNotification.update({
      where: { id: notificationId },
      data: { status: "FAILED", error: "Termii a retourné une réponse sans identifiant de message." },
    });
    return "FAILED" as const;
  }

  await prisma.smsNotification.update({
    where: { id: notificationId },
    data: { status: "SENT", sentAt: new Date(), providerReference, error: null },
  });
  return "SENT" as const;
}
