import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { queueCooperativeSms } from "@/lib/sms";
import { getWeatherForecast } from "@/lib/weather";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine de requête non autorisée." }, { status: 403 });
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (
    typeof body !== "object" || body === null ||
    !("cooperativeId" in body) || typeof body.cooperativeId !== "string" ||
    !("farmId" in body) || typeof body.farmId !== "string"
  ) {
    return NextResponse.json({ error: "Sélectionnez une parcelle valide." }, { status: 400 });
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId: body.cooperativeId } },
    select: { role: true },
  });
  if (!membership) return NextResponse.json({ error: "Accès coopérative non autorisé." }, { status: 403 });
  if (membership.role === "PRODUCER") {
    return NextResponse.json({ error: "Cette action est réservée aux gestionnaires." }, { status: 403 });
  }

  const farm = await prisma.farm.findFirst({
    where: { id: body.farmId, cooperativeId: body.cooperativeId },
    select: { latitude: true, longitude: true },
  });
  if (!farm || farm.latitude === null || farm.longitude === null) {
    return NextResponse.json({ error: "Cette parcelle n’a pas de coordonnées GPS enregistrées." }, { status: 400 });
  }

  const recentAlert = await prisma.smsNotification.count({
    where: {
      cooperativeId: body.cooperativeId,
      category: "WEATHER",
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
  });
  if (recentAlert > 0) {
    return NextResponse.json({ error: "Une alerte météo a déjà été mise en file pour cette coopérative durant les six dernières heures." }, { status: 429 });
  }

  let forecast;
  try {
    forecast = await getWeatherForecast(farm.latitude, farm.longitude);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Les prévisions météo ne sont pas disponibles.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const risks = forecast.days.filter((day) =>
    day.weatherCode >= 95 || day.precipitationMm >= 20 ||
    (day.rainProbabilityPercent >= 90 && day.precipitationMm >= 10),
  );
  if (!risks.length) {
    return NextResponse.json(
      { error: "Aucun seuil d’alerte (orage ou fortes pluies) n’a été détecté dans les prévisions à trois jours." },
      { status: 409 },
    );
  }

  const riskSummary = risks
    .map((day) => `${day.date}: ${day.precipitationMm} mm prévus`)
    .join("; ");
  const result = await queueCooperativeSms(
    body.cooperativeId,
    "WEATHER",
    `ECO-FARMS Togo - Alerte météo pour une parcelle suivie: ${riskSummary}. Protégez les récoltes et vérifiez localement.`,
  );
  return NextResponse.json({
    queued: result.queued,
    sent: result.sent,
    failed: result.failed,
    configured: Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
