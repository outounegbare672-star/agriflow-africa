"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getWestAfricanCountry } from "@/lib/west-africa";

async function requireUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");
  return session.user;
}

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function number(data: FormData, name: string) {
  const value = Number(data.get(name));
  return Number.isFinite(value) ? value : Number.NaN;
}

function dashboardRedirect(cooperativeId: string, message: string): never {
  redirect(`/dashboard?cooperative=${encodeURIComponent(cooperativeId)}&${message}`);
}

async function requireCooperative(userId: string, cooperativeId: string) {
  if (!cooperativeId) redirect("/dashboard?error=cooperative-required");
  const membership = await getPrisma().membership.findUnique({
    where: { userId_cooperativeId: { userId, cooperativeId } },
    select: { role: true },
  });
  if (!membership) redirect("/dashboard?error=unauthorized-cooperative");
  if (membership.role === "PRODUCER") {
    dashboardRedirect(cooperativeId, "error=write-access-required");
  }
  return cooperativeId;
}

export async function createCooperative(data: FormData) {
  const user = await requireUser();
  const name = text(data, "name");
  const phone = text(data, "phone");
  const address = text(data, "address");
  const country = getWestAfricanCountry(text(data, "countryCode"));
  if (name.length < 2 || phone.length < 6 || !country) {
    redirect("/dashboard?error=invalid-cooperative");
  }

  const cooperative = await getPrisma().$transaction(async (tx) => {
    const created = await tx.cooperative.create({
      data: {
        name,
        phone,
        address: address || null,
        countryCode: country.code,
        currency: country.currency,
      },
    });
    await tx.membership.create({
      data: { userId: user.id, cooperativeId: created.id, role: "OWNER" },
    });
    return created;
  });
  redirect(`/dashboard?cooperative=${encodeURIComponent(cooperative.id)}&created=cooperative`);
}

export async function createProducer(data: FormData) {
  const user = await requireUser();
  const cooperativeId = await requireCooperative(user.id, text(data, "cooperativeId"));
  const firstName = text(data, "firstName");
  const lastName = text(data, "lastName");
  const phone = text(data, "phone");
  const village = text(data, "village");
  if (firstName.length < 2 || lastName.length < 2 || phone.length < 6 || village.length < 2) {
    dashboardRedirect(cooperativeId, "error=invalid-producer");
  }

  await getPrisma().producer.create({
    data: {
      firstName,
      lastName,
      phone,
      village,
      gender: "Non renseigné",
      cooperativeId,
    },
  });
  dashboardRedirect(cooperativeId, "created=producer");
}

export async function createFarmAndCrop(data: FormData) {
  const user = await requireUser();
  const cooperativeId = await requireCooperative(user.id, text(data, "cooperativeId"));
  const producerId = text(data, "producerId");
  const farmName = text(data, "farmName");
  const gpsLocation = text(data, "gpsLocation");
  const area = number(data, "area");
  const cropName = text(data, "cropName");
  const estimatedYield = number(data, "estimatedYield");
  const expectedHarvest = new Date(`${text(data, "expectedHarvest")}T00:00:00.000Z`);

  if (
    !farmName || !gpsLocation || area <= 0 || !cropName || estimatedYield < 0 ||
    Number.isNaN(expectedHarvest.getTime())
  ) dashboardRedirect(cooperativeId, "error=invalid-farm");

  const prisma = getPrisma();
  const producer = await prisma.producer.findFirst({
    where: { id: producerId, cooperativeId },
    select: { id: true },
  });
  if (!producer) dashboardRedirect(cooperativeId, "error=invalid-producer");

  await prisma.farm.create({
    data: {
      name: farmName,
      gpsLocation,
      area,
      producerId,
      cooperativeId,
      crops: {
        create: {
          name: cropName,
          sowingDate: new Date(),
          expectedHarvest,
          estimatedYield,
          status: "CULTIVATION",
        },
      },
    },
  });
  dashboardRedirect(cooperativeId, "created=farm");
}

export async function recordHarvest(data: FormData) {
  const user = await requireUser();
  const cooperativeId = await requireCooperative(user.id, text(data, "cooperativeId"));
  const cropId = text(data, "cropId");
  const quantity = number(data, "quantity");
  const date = new Date(`${text(data, "date")}T00:00:00.000Z`);
  if (!cropId || quantity <= 0 || Number.isNaN(date.getTime())) {
    dashboardRedirect(cooperativeId, "error=invalid-harvest");
  }

  const prisma = getPrisma();
  const crop = await prisma.crop.findFirst({
    where: { id: cropId, farm: { cooperativeId } },
    select: { id: true, name: true, farm: { select: { producerId: true } } },
  });
  if (!crop) dashboardRedirect(cooperativeId, "error=invalid-crop");

  await prisma.$transaction(async (tx) => {
    const harvest = await tx.harvest.create({
      data: { cropId: crop.id, producerId: crop.farm.producerId, quantity, date, photos: [] },
    });
    await tx.stock.create({
      data: { type: crop.name, quantity, harvestId: harvest.id },
    });
  });
  dashboardRedirect(cooperativeId, "created=harvest");
}

export async function recordPayment(data: FormData) {
  const user = await requireUser();
  const cooperativeId = await requireCooperative(user.id, text(data, "cooperativeId"));
  const producerId = text(data, "producerId");
  const amount = number(data, "amount");
  const method = text(data, "method");
  const reference = text(data, "reference");
  if (amount <= 0 || !method || !reference) {
    dashboardRedirect(cooperativeId, "error=invalid-payment");
  }

  const prisma = getPrisma();
  const producer = await prisma.producer.findFirst({
    where: { id: producerId, cooperativeId },
    select: { id: true },
  });
  if (!producer) dashboardRedirect(cooperativeId, "error=invalid-producer");

  await prisma.payment.create({
    data: { producerId, cooperativeId, amount, method, reference },
  });
  dashboardRedirect(cooperativeId, "created=payment");
}
