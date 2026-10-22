import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getWeatherForecast } from "@/lib/weather";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Connectez-vous pour demander une recommandation." }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Les recommandations IA ne sont pas activées. Configurez OPENAI_API_KEY dans Render." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.cooperativeId !== "string" || typeof body.cropId !== "string") {
    return NextResponse.json({ error: "Sélectionnez une culture valide." }, { status: 400 });
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId: body.cooperativeId } },
    select: { role: true },
  });
  if (!membership) return NextResponse.json({ error: "Vous n’avez pas accès à cette coopérative." }, { status: 403 });
  if (membership.role === "PRODUCER") {
    return NextResponse.json({ error: "Les recommandations sont réservées aux gestionnaires de coopérative." }, { status: 403 });
  }

  const crop = await prisma.crop.findFirst({
    where: { id: body.cropId, farm: { cooperativeId: body.cooperativeId } },
    select: {
      name: true,
      status: true,
      sowingDate: true,
      expectedHarvest: true,
      farm: {
        select: {
          latitude: true,
          longitude: true,
          cooperative: { select: { countryCode: true } },
        },
      },
    },
  });
  if (!crop) return NextResponse.json({ error: "Cette culture ne fait pas partie de la coopérative." }, { status: 404 });

  const allowed = await prisma.$transaction(async (tx) => {
    const requestCount = await tx.aiRecommendationRequest.count({
      where: { userId: session.user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (requestCount >= 5) return false;
    await tx.aiRecommendationRequest.create({ data: { userId: session.user.id } });
    return true;
  }, { isolationLevel: "Serializable" });
  if (!allowed) {
    return NextResponse.json({ error: "Limite quotidienne de cinq demandes IA atteinte." }, { status: 429 });
  }

  let weather: { temperatureC: number; precipitationMm: number; weatherCode: number } | null = null;
  if (crop.farm.latitude !== null && crop.farm.longitude !== null) {
    try {
      const forecast = await getWeatherForecast(crop.farm.latitude, crop.farm.longitude);
      weather = {
        temperatureC: forecast.current.temperatureC,
        precipitationMm: forecast.current.precipitationMm,
        weatherCode: forecast.current.weatherCode,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Les données météo ne sont pas disponibles.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const farmingContext = {
    crop: crop.name,
    country: crop.farm.cooperative.countryCode,
    growthStatus: crop.status,
    sowingDate: crop.sowingDate.toISOString().slice(0, 10),
    expectedHarvestDate: crop.expectedHarvest.toISOString().slice(0, 10),
    currentWeather: weather,
  };

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.3,
        max_completion_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "developer",
            content: "Tu es un assistant d’information agricole prudent. Réponds uniquement en français et en JSON {\"summary\": string, \"recommendations\": string[], \"cautions\": string[]}. Donne 2 à 4 actions simples, adaptées au stade de la culture et aux données météo effectivement fournies. N’invente pas de météo ou de pratiques locales. Ne diagnostique pas de maladie et ne recommande aucun pesticide, produit chimique, dosage ou fertilisant précis. Signale les incertitudes et recommande de consulter un conseiller agricole local avant toute décision importante. Ne promets jamais de rendement.",
          },
          {
            role: "user",
            content: JSON.stringify(farmingContext),
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "NetworkError";
    return NextResponse.json(
      { error: `Le service IA n’est pas joignable (${reason}).` },
      { status: 502 },
    );
  }
  if (!providerResponse.ok) {
    return NextResponse.json(
      { error: `Le fournisseur IA a refusé la demande (HTTP ${providerResponse.status}).` },
      { status: 502 },
    );
  }

  let providerBody: unknown;
  try {
    providerBody = await providerResponse.json();
  } catch {
    return NextResponse.json({ error: "Le fournisseur IA a retourné une réponse JSON invalide." }, { status: 502 });
  }
  if (!isRecord(providerBody) || !Array.isArray(providerBody.choices) ||
    !isRecord(providerBody.choices[0]) || !isRecord(providerBody.choices[0].message) ||
    typeof providerBody.choices[0].message.content !== "string") {
    return NextResponse.json({ error: "Le fournisseur IA a retourné une réponse invalide." }, { status: 502 });
  }

  let recommendation: unknown;
  try {
    recommendation = JSON.parse(providerBody.choices[0].message.content);
  } catch {
    return NextResponse.json({ error: "La réponse IA n’a pas pu être interprétée." }, { status: 502 });
  }
  if (!isRecord(recommendation) ||
    typeof recommendation.summary !== "string" || recommendation.summary.length < 3 || recommendation.summary.length > 500 ||
    !Array.isArray(recommendation.recommendations) ||
    recommendation.recommendations.length < 2 || recommendation.recommendations.length > 4 ||
    !recommendation.recommendations.every((item) => typeof item === "string" && item.length <= 300) ||
    !Array.isArray(recommendation.cautions) ||
    !recommendation.cautions.every((item) => typeof item === "string" && item.length <= 300)) {
    return NextResponse.json({ error: "La réponse IA ne respecte pas le format attendu." }, { status: 502 });
  }

  return NextResponse.json({
    summary: recommendation.summary,
    recommendations: recommendation.recommendations.slice(0, 4),
    cautions: recommendation.cautions.slice(0, 3),
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
