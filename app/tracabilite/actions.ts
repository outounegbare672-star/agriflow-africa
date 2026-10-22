"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

function isTraceabilityEventType(
  value: string,
): value is "QUALITY_CHECKED" | "STORED" | "DISPATCHED" | "RECEIVED" {
  return ["QUALITY_CHECKED", "STORED", "DISPATCHED", "RECEIVED"].includes(value);
}

export async function addTraceabilityEvent(data: FormData) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");

  const harvestId = String(data.get("harvestId") ?? "").trim();
  const cooperativeId = String(data.get("cooperativeId") ?? "").trim();
  const type = String(data.get("type") ?? "");
  const note = String(data.get("note") ?? "").trim();
  const location = String(data.get("location") ?? "").trim();
  if (!isTraceabilityEventType(type) ||
    note.length < 3 || note.length > 300 || location.length > 80) {
    redirect("/dashboard?error=invalid-traceability");
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId } },
    select: { role: true },
  });
  if (!membership) redirect("/dashboard?error=unauthorized-cooperative");
  if (membership.role === "PRODUCER") {
    redirect(`/dashboard?cooperative=${encodeURIComponent(cooperativeId)}&error=write-access-required`);
  }

  const harvest = await prisma.harvest.findFirst({
    where: { id: harvestId, producer: { cooperativeId } },
    select: { id: true, batchCode: true },
  });
  if (!harvest) redirect(`/dashboard?cooperative=${encodeURIComponent(cooperativeId)}&error=invalid-traceability`);

  await prisma.traceabilityEvent.create({
    data: {
      harvestId: harvest.id,
      type,
      note,
      location: location || null,
    },
  });
  redirect(`/tracabilite/${encodeURIComponent(harvest.batchCode)}?created=event`);
}
