"use client";

import { useState } from "react";

type Recommendation = {
  summary: string;
  recommendations: string[];
  cautions: string[];
  generatedAt: string;
};

function isRecommendation(value: unknown): value is Recommendation {
  return typeof value === "object" && value !== null &&
    "summary" in value && typeof value.summary === "string" &&
    "recommendations" in value && Array.isArray(value.recommendations) &&
    value.recommendations.every((item) => typeof item === "string") &&
    "cautions" in value && Array.isArray(value.cautions) &&
    value.cautions.every((item) => typeof item === "string") &&
    "generatedAt" in value && typeof value.generatedAt === "string";
}

export function RecommendationsPanel({
  cooperativeId,
  crops,
}: {
  cooperativeId: string;
  crops: { id: string; name: string }[];
}) {
  const [cropId, setCropId] = useState(crops[0]?.id ?? "");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setRecommendation(null);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cooperativeId, cropId }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isRecommendation(result)) {
        const message = typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string" ? result.error : "La recommandation n’a pas pu être générée.";
        throw new Error(message);
      }
      setRecommendation(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erreur de connexion au service IA.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-form-panel" aria-labelledby="ai-recommendations-title">
      <p className="eyebrow eyebrow-dark"><span /> ASSISTANT AGRICOLE</p>
      <h2 id="ai-recommendations-title">Conseils adaptés à une culture</h2>
      <p className="panel-note">L’IA reçoit uniquement la culture, le pays, les dates et la météo disponible — jamais le nom du producteur, ses coordonnées ou son numéro. Cinq demandes par jour et par compte. Réponse informative, à confirmer auprès d’un conseiller local.</p>
      {crops.length ? (
        <div className="recommendation-controls">
          <label htmlFor="recommendation-crop">Culture</label>
          <select id="recommendation-crop" value={cropId} onChange={(event) => setCropId(event.target.value)}>
            {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}
          </select>
          <button className="button button-primary" disabled={loading || !cropId} onClick={generate} type="button">
            {loading ? "Génération…" : "Générer une recommandation"}
          </button>
        </div>
      ) : <p className="empty-state">Ajoutez une culture pour obtenir des recommandations ciblées.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {recommendation && (
        <article className="recommendation-result" aria-live="polite">
          <h3>Résumé</h3>
          <p>{recommendation.summary}</p>
          <h3>Actions suggérées</h3>
          <ul>{recommendation.recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          {recommendation.cautions.length > 0 && (
            <>
              <h3>Précautions</h3>
              <ul>{recommendation.cautions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
            </>
          )}
          <small>Généré le {new Date(recommendation.generatedAt).toLocaleString("fr-FR")}. Vérifiez ces conseils localement.</small>
        </article>
      )}
    </section>
  );
}
