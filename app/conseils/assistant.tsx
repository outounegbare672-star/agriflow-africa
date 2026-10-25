"use client";

import { useState, type FormEvent } from "react";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type HealthResult = {
  ok?: boolean;
  model?: string;
  message?: string;
  error?: string;
  providerMessage?: string | null;
};

function isHealthResult(value: unknown): value is HealthResult {
  return typeof value === "object" && value !== null &&
    (!("ok" in value) || typeof value.ok === "boolean") &&
    (!("model" in value) || typeof value.model === "string") &&
    (!("message" in value) || typeof value.message === "string") &&
    (!("error" in value) || typeof value.error === "string") &&
    (!("providerMessage" in value) ||
      value.providerMessage === null || typeof value.providerMessage === "string");
}

function isAnswer(value: unknown): value is { answer: string } {
  return typeof value === "object" && value !== null &&
    "answer" in value && typeof value.answer === "string";
}

export function AgriculturalAssistant() {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [healthMessage, setHealthMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function checkConnection() {
    if (checking) return;
    setChecking(true);
    setHealthMessage(null);
    try {
      const response = await fetch("/api/agri-assistant/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Le serveur a retourné une erreur (HTTP ${response.status}).`);
      }
      const result: unknown = await response.json();
      if (!isHealthResult(result)) {
        throw new Error("Réponse de vérification invalide.");
      }
      if (!response.ok || result.ok !== true) {
        const detail = typeof result.providerMessage === "string" ? ` Détail Google : ${result.providerMessage}` : "";
        throw new Error(`${result.error ?? "La configuration Gemini ne fonctionne pas."}${detail}`);
      }
      setHealthMessage({ ok: true, text: `${result.message} Modèle : ${result.model}.` });
    } catch (healthError) {
      setHealthMessage({
        ok: false,
        text: healthError instanceof Error ? healthError.message : "Impossible de vérifier la configuration Gemini.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = message.trim();
    if (!question || sending) return;

    setMessage("");
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/agri-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: question,
          conversation: conversation.slice(-6),
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Le serveur a retourné une erreur (HTTP ${response.status}). Réessayez dans un moment.`);
      }
      const result: unknown = await response.json();
      if (!response.ok || !isAnswer(result)) {
        const responseError = typeof result === "object" && result !== null &&
          "error" in result && typeof result.error === "string"
          ? result.error
          : "ECO-FARMS IA n’a pas pu répondre.";
        const providerMessage = typeof result === "object" && result !== null &&
          "providerMessage" in result && typeof result.providerMessage === "string"
          ? ` Détail Google : ${result.providerMessage}`
          : "";
        throw new Error(`${responseError}${providerMessage}`);
      }
      setConversation((current) => [
        ...current,
        { role: "user", content: question },
        { role: "assistant", content: result.answer },
      ]);
    } catch (requestError) {
      setMessage(question);
      setError(requestError instanceof Error ? requestError.message : "Erreur de connexion à ECO-FARMS IA.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="module-form-panel assistant-panel" aria-labelledby="agricultural-assistant-title">
      <p className="eyebrow eyebrow-dark"><span /> ECO-FARMS IA</p>
      <h2 id="agricultural-assistant-title">Posez votre question agricole</h2>
      <p className="panel-note">Un assistant en français simple pour vos questions agricoles au Togo, sans limite quotidienne fixée par la plateforme. Google Gemini peut appliquer ses propres limites d’utilisation. Vos questions et les six derniers messages sont transmis à Google Gemini : n’incluez pas de données personnelles. Les réponses sont indicatives ; consultez un conseiller local avant toute décision importante.</p>
      <button className="button button-secondary" disabled={checking} onClick={checkConnection} type="button">
        {checking ? "Vérification…" : "Vérifier la connexion IA"}
      </button>
      {healthMessage && (
        <p className={healthMessage.ok ? "form-success" : "form-error"} role={healthMessage.ok ? "status" : "alert"}>
          {healthMessage.text}
        </p>
      )}
      <div className="assistant-messages" aria-live="polite" aria-relevant="additions">
        {conversation.length === 0 ? (
          <p className="empty-state">Exemple : « Comment conserver le maïs après la récolte ? »</p>
        ) : conversation.map((item, index) => (
          <article className={`assistant-message ${item.role}`} key={`${index}-${item.content}`}>
            <strong>{item.role === "user" ? "Vous" : "ECO-FARMS IA"}</strong>
            <p>{item.content}</p>
          </article>
        ))}
        {sending && <p className="assistant-loading" role="status">ECO-FARMS IA prépare une réponse…</p>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="assistant-form" onSubmit={sendMessage}>
        <label htmlFor="assistant-question">Votre question
          <textarea
            id="assistant-question"
            maxLength={1_000}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Posez votre question sur les cultures, les récoltes ou leur conservation…"
            required
            rows={3}
            value={message}
          />
        </label>
        <button className="button button-primary" disabled={sending || !message.trim()} type="submit">
          {sending ? "Envoi…" : "Demander à ECO-FARMS IA"}
        </button>
      </form>
    </section>
  );
}
