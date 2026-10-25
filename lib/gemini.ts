export const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

export function isValidGeminiModel(model: string) {
  return /^[a-z0-9][a-z0-9.-]{0,99}$/i.test(model);
}

export function geminiProviderError(status: number) {
  if (status === 400) return "Google Gemini refuse la requête. Vérifiez le modèle et les paramètres.";
  if (status === 401 || status === 403) {
    return "Google Gemini refuse cette clé ou les autorisations de son projet.";
  }
  if (status === 404) return "Le modèle Gemini demandé est introuvable ou inaccessible pour cette clé.";
  if (status === 429) return "La limite d’utilisation Google Gemini est atteinte. Vérifiez le quota et la facturation du projet.";
  if (status === 503) return "Google Gemini est temporairement indisponible. Réessayez dans quelques instants.";
  return "Google Gemini n’a pas pu traiter la demande.";
}

export async function getGeminiProviderMessage(response: Response, apiKey: string) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const providerError = body.error;
  if (typeof providerError !== "object" || providerError === null ||
    !("message" in providerError) || typeof providerError.message !== "string") {
    return null;
  }

  const redactedMessage = apiKey
    ? providerError.message.replaceAll(apiKey, "[clé masquée]")
    : providerError.message;
  const message = redactedMessage
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[clé masquée]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 400);
  return message || null;
}
