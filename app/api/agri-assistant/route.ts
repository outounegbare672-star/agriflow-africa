import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const maximumMessageLength = 1_000;
const maximumHistoryLength = 6;
const providerTimeoutMs = 90_000;

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConversation(value: unknown): ConversationMessage[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumHistoryLength) return null;
  const messages: ConversationMessage[] = [];
  for (const item of value) {
    if (!isRecord(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string" ||
      item.content.trim().length === 0 ||
      item.content.length > maximumMessageLength) {
      return null;
    }
    messages.push({ role: item.role, content: item.content.trim() });
  }
  return messages;
}

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Connectez-vous pour parler à ECO-FARMS IA." }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "ECO-FARMS IA n’est pas encore activé. Configurez GEMINI_API_KEY dans les secrets Render." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 12_000) {
      return NextResponse.json({ error: "Votre message est trop long." }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!isRecord(body) ||
    typeof body.message !== "string" ||
    body.message.trim().length === 0 ||
    body.message.length > maximumMessageLength) {
    return NextResponse.json({ error: "Saisissez une question de 1 000 caractères maximum." }, { status: 400 });
  }
  const conversation = parseConversation(body.conversation);
  if (!conversation) {
    return NextResponse.json({ error: "Historique de conversation invalide." }, { status: 400 });
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    select: { role: true },
  });
  if (!membership || membership.role === "PRODUCER") {
    return NextResponse.json({ error: "L’assistant est réservé aux gestionnaires de coopérative." }, { status: 403 });
  }

  const contents = [
    ...conversation.map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    })),
    { role: "user", parts: [{ text: body.message.trim() }] },
  ];

  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Tu es ECO-FARMS IA, un assistant d’information agricole pour les agriculteurs du Togo. Réponds en français simple, avec des conseils pratiques et concis. N’invente pas de météo, de prix ou de règles locales. Ne diagnostique pas les maladies et ne prescris jamais de pesticide, de produit chimique ni de dosage. Signale les incertitudes et conseille de consulter un agent agricole local pour les décisions importantes. Tes réponses sont informatives et ne remplacent pas un professionnel.",
            }],
          },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(providerTimeoutMs),
        cache: "no-store",
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "ECO-FARMS IA met trop de temps à répondre. Réessayez." : "ECO-FARMS IA est momentanément injoignable." },
      { status: timedOut ? 504 : 502 },
    );
  }
  if (!providerResponse.ok) {
    console.error(`[ECO-FARMS IA] Gemini returned HTTP ${providerResponse.status}.`);
    const error = providerResponse.status === 401 || providerResponse.status === 403
      ? "Google Gemini refuse la clé ou son accès. Vérifiez que la clé est active et autorisée pour Gemini."
      : providerResponse.status === 404
        ? "Le modèle Gemini configuré est introuvable ou indisponible pour cette clé."
        : providerResponse.status === 429
          ? "Le quota ou le débit autorisé par Google Gemini est atteint. Vérifiez les limites du compte Google AI."
          : providerResponse.status === 400
            ? "Google Gemini refuse le format de la demande. Réessayez avec une question plus simple."
            : "Google Gemini n’a pas pu traiter la demande. Vérifiez les journaux Render pour le code HTTP.";
    return NextResponse.json(
      { error, providerStatus: providerResponse.status },
      { status: 502 },
    );
  }

  let providerBody: unknown;
  try {
    providerBody = await providerResponse.json();
  } catch {
    return NextResponse.json({ error: "Le service IA a retourné une réponse invalide." }, { status: 502 });
  }
  if (!isRecord(providerBody) ||
    !Array.isArray(providerBody.candidates) ||
    !isRecord(providerBody.candidates[0]) ||
    !isRecord(providerBody.candidates[0].content) ||
    !Array.isArray(providerBody.candidates[0].content.parts)) {
    return NextResponse.json({ error: "Le service IA n’a pas retourné de réponse exploitable." }, { status: 502 });
  }
  const answer = providerBody.candidates[0].content.parts
    .flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : [])
    .join("")
    .trim();
  if (!answer || answer.length > 4_000) {
    return NextResponse.json({ error: "Le service IA n’a pas retourné de réponse exploitable." }, { status: 502 });
  }

  return NextResponse.json(
    { answer, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
