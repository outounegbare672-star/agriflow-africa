import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { geminiModel, getGeminiProviderMessage, geminiProviderError, isValidGeminiModel } from "@/lib/gemini";
import { getPrisma } from "@/lib/prisma";

const maximumMessageLength = 1_000;
const maximumHistoryLength = 6;
const providerTimeoutMs = 60_000;

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

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ECO-FARMS IA n’est pas encore activé. Configurez GEMINI_API_KEY dans les secrets Render." },
      { status: 503 },
    );
  }
  if (!isValidGeminiModel(geminiModel)) {
    return NextResponse.json({ error: "La variable GEMINI_MODEL contient un identifiant invalide." }, { status: 500 });
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

  const providerUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const providerRequestBody = JSON.stringify({
    systemInstruction: {
      parts: [{
        text: "Tu es ECO-FARMS IA, un assistant d’information agricole pour les agriculteurs du Togo. Réponds en français simple, avec des conseils pratiques et concis. N’invente pas de météo, de prix ou de règles locales. Ne diagnostique pas les maladies et ne prescris jamais de pesticide, de produit chimique ni de dosage. Signale les incertitudes et conseille de consulter un agent agricole local pour les décisions importantes. Tes réponses sont informatives et ne remplacent pas un professionnel.",
      }],
    },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
  });
  const deadline = Date.now() + providerTimeoutMs;
  let providerResponse: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      providerResponse = await fetch(providerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: providerRequestBody,
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return NextResponse.json(
        { error: timedOut ? "ECO-FARMS IA met trop de temps à répondre. Réessayez." : "ECO-FARMS IA est momentanément injoignable." },
        { status: timedOut ? 504 : 502 },
      );
    }
    if (![500, 502, 503, 504].includes(providerResponse.status) || attempt === 1) break;
    console.warn(`[ECO-FARMS IA] Gemini returned HTTP ${providerResponse.status}; retrying once.`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!providerResponse) {
    return NextResponse.json({ error: "Google Gemini n’a pas retourné de réponse." }, { status: 502 });
  }
  if (!providerResponse.ok) {
    const providerMessage = await getGeminiProviderMessage(providerResponse, apiKey);
    console.error(`[ECO-FARMS IA] Gemini returned HTTP ${providerResponse.status}.${providerMessage ? ` ${providerMessage}` : ""}`);
    return NextResponse.json(
      {
        error: geminiProviderError(providerResponse.status),
        providerStatus: providerResponse.status,
        providerMessage,
        model: geminiModel,
      },
      { status: providerResponse.status === 429 ? 429 : providerResponse.status === 503 ? 503 : 502 },
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
