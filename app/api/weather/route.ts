import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getWeatherForecast } from "@/lib/weather";

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const cooperativeId = search.get("cooperativeId") ?? "";
  const farmId = search.get("farmId") ?? "";
  if (!cooperativeId || !farmId || cooperativeId.length > 40 || farmId.length > 40) {
    return NextResponse.json({ error: "Sélectionnez une parcelle valide." }, { status: 400 });
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId } },
    select: { role: true },
  });
  if (!membership || membership.role === "PRODUCER") {
    return NextResponse.json({ error: "Accès à cette parcelle non autorisé." }, { status: 403 });
  }
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, cooperativeId },
    select: { latitude: true, longitude: true },
  });
  if (!farm || farm.latitude === null || farm.longitude === null) {
    return NextResponse.json({ error: "Coordonnées GPS de la parcelle introuvables." }, { status: 404 });
  }

  try {
    return NextResponse.json(await getWeatherForecast(farm.latitude, farm.longitude), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Service météo indisponible.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
