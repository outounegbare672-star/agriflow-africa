import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { geminiModel, getGeminiProviderMessage, geminiProviderError, isValidGeminiModel } from "@/lib/gemini";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Connectez-vous pour vérifier la configuration IA." }, { status: 401 });
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    select: { role: true },
  });
  if (!membership || membership.role === "PRODUCER") {
    return NextResponse.json({ error: "La vérification est réservée aux gestionnaires de coopérative." }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "La variable GEMINI_API_KEY est absente des variables d’environnement Render." },
      { status: 503 },
    );
  }
  if (!isValidGeminiModel(geminiModel)) {
    return NextResponse.json({ error: "La variable GEMINI_MODEL contient un identifiant invalide." }, { status: 500 });
  }

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "Google Gemini ne répond pas au test de connexion." : "Render ne parvient pas à joindre Google Gemini." },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!response.ok) {
    const providerMessage = await getGeminiProviderMessage(response, apiKey);
    console.error(`[ECO-FARMS IA] Configuration check failed (HTTP ${response.status}).${providerMessage ? ` ${providerMessage}` : ""}`);
    return NextResponse.json({
      error: geminiProviderError(response.status),
      providerStatus: response.status,
      providerMessage,
      model: geminiModel,
    }, { status: response.status === 429 || response.status === 503 ? response.status : 502 });
  }

  let modelInfo: unknown;
  try {
    modelInfo = await response.json();
  } catch {
    return NextResponse.json({ error: "Google Gemini a retourné une réponse de configuration invalide." }, { status: 502 });
  }
  if (typeof modelInfo !== "object" || modelInfo === null ||
    !("supportedGenerationMethods" in modelInfo) ||
    !Array.isArray(modelInfo.supportedGenerationMethods) ||
    !modelInfo.supportedGenerationMethods.includes("generateContent")) {
    return NextResponse.json(
      { error: `Le modèle ${geminiModel} ne prend pas en charge la génération de réponses.` },
      { status: 422 },
    );
  }

  return NextResponse.json(
    { ok: true, model: geminiModel, message: "La clé et le modèle Gemini sont accessibles. Le test n’a généré aucun texte." },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
