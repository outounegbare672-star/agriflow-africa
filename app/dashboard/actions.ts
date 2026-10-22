"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { queueCooperativeSms } from "@/lib/sms";
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
  const smsConsent = data.get("smsConsent") === "on";
  if (firstName.length < 2 || lastName.length < 2 || phone.length < 6 || village.length < 2) {
    dashboardRedirect(cooperativeId, "error=invalid-producer");
  }
  if (smsConsent && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    dashboardRedirect(cooperativeId, "error=invalid-sms-phone");
  }

  await getPrisma().producer.create({
    data: {
      firstName,
      lastName,
      phone,
      village,
      gender: "Non renseigné",
      smsConsent,
      smsConsentAt: smsConsent ? new Date() : null,
      cooperativeId,
    },
  });
  dashboardRedirect(cooperativeId, "created=producer");
}

export async function setProducerSmsConsent(data: FormData) {
  const user = await requireUser();
  const cooperativeId = await requireCooperative(user.id, text(data, "cooperativeId"));
  const producerId = text(data, "producerId");
  const consent = text(data, "consent");
  if (consent !== "true" && consent !== "false") {
    dashboardRedirect(cooperativeId, "error=invalid-sms-consent");
  }

  const producer = await getPrisma().producer.findFirst({
    where: { id: producerId, cooperativeId },
    select: { id: true, phone: true },
  });
  if (!producer) dashboardRedirect(cooperativeId, "error=invalid-producer");
  if (consent === "true" && !/^\+[1-9]\d{7,14}$/.test(producer.phone)) {
    dashboardRedirect(cooperativeId, "error=invalid-sms-phone");
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.producer.update({
      where: { id: producer.id },
      data: { smsConsent: consent === "true", smsConsentAt: consent === "true" ? new Date() : null },
    });
    if (consent === "false") {
      await tx.smsNotification.updateMany({
        where: { producerId: producer.id, status: "PENDING" },
        data: { status: "CANCELLED", error: "Consentement SMS retiré." },
      });
    }
  });
  dashboardRedirect(cooperativeId, consent === "true" ? "created=sms-consent" : "created=sms-consent-withdrawn");
}

export async function createFarmAndCrop(data: FormData) {
  const user = await requireUser();
  const cooperativeId = await requireCooperative(user.id, text(data, "cooperativeId"));
  const producerId = text(data, "producerId");
  const farmName = text(data, "farmName");
  const gpsLocation = text(data, "gpsLocation");
  const latitudeInput = text(data, "latitude");
  const longitudeInput = text(data, "longitude");
  const latitude = latitudeInput ? Number(latitudeInput) : null;
  const longitude = longitudeInput ? Number(longitudeInput) : null;
  const area = number(data, "area");
  const cropName = text(data, "cropName");
  const estimatedYield = number(data, "estimatedYield");
  const expectedHarvest = new Date(`${text(data, "expectedHarvest")}T00:00:00.000Z`);

  if (
    !farmName || !gpsLocation || area <= 0 || !cropName || estimatedYield < 0 ||
    Number.isNaN(expectedHarvest.getTime()) ||
    (latitudeInput !== "" && (
      latitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    )) ||
    (longitudeInput !== "" && (
      longitude === null || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    )) ||
    (latitudeInput === "") !== (longitudeInput === "")
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
      latitude,
      longitude,
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

  const harvest = await prisma.$transaction(async (tx) => {
    const harvest = await tx.harvest.create({
      data: { cropId: crop.id, producerId: crop.farm.producerId, quantity, date, photos: [] },
    });
    await tx.traceabilityEvent.create({
      data: {
        harvestId: harvest.id,
        type: "HARVEST_RECORDED",
        note: "Récolte enregistrée par la coopérative.",
      },
    });
    await tx.stock.create({
      data: { type: crop.name, quantity, harvestId: harvest.id },
    });
    return harvest;
  });
  const sms = await queueCooperativeSms(
    cooperativeId,
    "HARVEST",
    `Agriflow : récolte de ${crop.name} enregistrée (${quantity} kg). Lot ${harvest.batchCode}.`,
    [crop.farm.producerId],
    `harvest:${harvest.id}`,
  );
  dashboardRedirect(
    cooperativeId,
    sms.queued && !sms.sent ? "created=harvest-sms-pending" : "created=harvest",
  );
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
    select: { id: true, firstName: true },
  });
  if (!producer) dashboardRedirect(cooperativeId, "error=invalid-producer");

  const payment = await prisma.payment.create({
    data: { producerId, cooperativeId, amount, method, reference },
  });
  const cooperative = await prisma.cooperative.findUniqueOrThrow({
    where: { id: cooperativeId },
    select: { currency: true },
  });
  const sms = await queueCooperativeSms(
    cooperativeId,
    "PAYMENT",
    `Agriflow : un paiement de ${amount} ${cooperative.currency} a été enregistré pour vous. Réf. ${reference}.`,
    [producer.id],
    `payment:${payment.id}`,
  );
  dashboardRedirect(
    cooperativeId,
    sms.queued && !sms.sent ? "created=payment-sms-pending" : "created=payment",
  );
}
