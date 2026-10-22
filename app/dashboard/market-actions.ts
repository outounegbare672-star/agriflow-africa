"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

async function requireWriter(cooperativeId: string) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");
  const membership = await getPrisma().membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId } },
    select: { role: true },
  });
  if (!membership) redirect("/dashboard?error=unauthorized-cooperative");
  if (membership.role === "PRODUCER") {
    redirect(`/dashboard?cooperative=${encodeURIComponent(cooperativeId)}&error=write-access-required`);
  }
  return cooperativeId;
}

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function positiveNumber(data: FormData, name: string) {
  const parsed = Number(data.get(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function back(cooperativeId: string, result: string): never {
  redirect(`/dashboard?cooperative=${encodeURIComponent(cooperativeId)}&${result}`);
}

function transportBack(data: FormData, cooperativeId: string, result: string): never {
  if (value(data, "returnTo") === "transport") {
    redirect(`/transport?cooperative=${encodeURIComponent(cooperativeId)}&${result}`);
  }
  back(cooperativeId, result);
}

export async function createMarketListing(data: FormData) {
  const cooperativeId = await requireWriter(value(data, "cooperativeId"));
  const title = value(data, "title");
  const crop = value(data, "crop");
  const quantity = positiveNumber(data, "quantity");
  const priceInput = value(data, "pricePerUnit");
  const price = priceInput ? positiveNumber(data, "pricePerUnit") : null;
  if (
    title.length < 3 || title.length > 100 || crop.length < 2 || crop.length > 60 ||
    !quantity || (priceInput && !price)
  ) {
    back(cooperativeId, "error=invalid-listing");
  }

  await getPrisma().marketListing.create({
    data: {
      cooperativeId,
      title,
      crop,
      quantity,
      unit: "kg",
      pricePerUnit: price,
    },
  });
  back(cooperativeId, "created=listing");
}

export async function closeMarketListing(data: FormData) {
  const cooperativeId = await requireWriter(value(data, "cooperativeId"));
  const listingId = value(data, "listingId");
  const result = await getPrisma().marketListing.updateMany({
    where: { id: listingId, cooperativeId, active: true },
    data: { active: false },
  });
  back(cooperativeId, result.count ? "created=listing-closed" : "error=listing-not-found");
}

export async function createPriceReport(data: FormData) {
  const cooperativeId = await requireWriter(value(data, "cooperativeId"));
  const crop = value(data, "crop");
  const marketName = value(data, "marketName");
  const price = positiveNumber(data, "price");
  const observedAt = new Date(`${value(data, "observedAt")}T00:00:00.000Z`);
  if (
    crop.length < 2 || crop.length > 60 || marketName.length < 2 || marketName.length > 100 ||
    !price || Number.isNaN(observedAt.getTime()) || observedAt > new Date()
  ) {
    back(cooperativeId, "error=invalid-price");
  }

  await getPrisma().priceReport.create({
    data: { cooperativeId, crop, marketName, price, unit: "kg", observedAt },
  });
  back(cooperativeId, "created=price");
}

export async function createTransportRequest(data: FormData) {
  const cooperativeId = await requireWriter(value(data, "cooperativeId"));
  const cargo = value(data, "cargo");
  const quantity = positiveNumber(data, "quantity");
  const origin = value(data, "origin");
  const destination = value(data, "destination");
  const pickupDateValue = value(data, "pickupDate");
  const pickupDate = new Date(`${pickupDateValue}T00:00:00.000Z`);
  if (
    cargo.length < 2 || cargo.length > 100 || !quantity ||
    origin.length < 2 || origin.length > 100 ||
    destination.length < 2 || destination.length > 100 ||
    Number.isNaN(pickupDate.getTime()) ||
    pickupDateValue < new Date().toISOString().slice(0, 10)
  ) {
    back(cooperativeId, "error=invalid-transport");
  }

  await getPrisma().transportRequest.create({
    data: { cooperativeId, cargo, quantity, unit: "kg", origin, destination, pickupDate },
  });
  transportBack(data, cooperativeId, "created=transport");
}

export async function completeTransportRequest(data: FormData) {
  const cooperativeId = await requireWriter(value(data, "cooperativeId"));
  const requestId = value(data, "requestId");
  const result = await getPrisma().transportRequest.updateMany({
    where: { id: requestId, cooperativeId, status: "OPEN" },
    data: { status: "COMPLETED" },
  });
  transportBack(data, cooperativeId, result.count ? "created=transport-closed" : "error=transport-not-found");
}
