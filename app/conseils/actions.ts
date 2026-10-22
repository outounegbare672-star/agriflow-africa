"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { queueCooperativeSms } from "@/lib/sms";

export async function queueUpcomingHarvestReminders(data: FormData) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fconseils");
  const cooperativeId = String(data.get("cooperativeId") ?? "").trim();
  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId } },
    select: { role: true },
  });
  if (!membership || membership.role === "PRODUCER") {
    redirect("/conseils?error=unauthorized-cooperative");
  }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const crops = await prisma.crop.findMany({
    where: {
      farm: { cooperativeId },
      expectedHarvest: { gte: start, lte: end },
    },
    select: {
      id: true,
      name: true,
      expectedHarvest: true,
      farm: { select: { producer: { select: { id: true, smsConsent: true } } } },
    },
    take: 100,
  });

  let queued = 0;
  for (const crop of crops) {
    if (!crop.farm.producer.smsConsent) continue;
    const date = crop.expectedHarvest.toISOString().slice(0, 10);
    const result = await queueCooperativeSms(
      cooperativeId,
      "HARVEST",
      `Agriflow : rappel, la récolte de ${crop.name} est prévue le ${date}. Confirmez l’organisation avec la coopérative.`,
      [crop.farm.producer.id],
      `harvest-reminder:${crop.id}:${date}`,
    );
    queued += result.queued;
  }
  redirect(`/conseils?cooperative=${encodeURIComponent(cooperativeId)}&smsQueued=${queued}`);
}
