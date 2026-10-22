"use client";

import { useState } from "react";

type WeatherForecast = {
  timezone: string;
  current: {
    temperatureC: number;
    humidityPercent: number;
    precipitationMm: number;
    windSpeedKmh: number;
    weatherCode: number;
  };
  days: {
    date: string;
    weatherCode: number;
    maximumC: number;
    minimumC: number;
    rainProbabilityPercent: number;
    precipitationMm: number;
  }[];
};

type FarmOption = { id: string; name: string };

function weatherLabel(code: number) {
  if (code === 0) return "Ciel dégagé";
  if (code <= 3) return "Partiellement nuageux";
  if (code === 45 || code === 48) return "Brouillard";
  if (code >= 51 && code <= 67) return "Bruine ou pluie";
  if (code >= 71 && code <= 77) return "Neige";
  if (code >= 80 && code <= 82) return "Averses";
  if (code >= 95) return "Orage possible";
  return "Conditions variables";
}

export function WeatherPanel({
  cooperativeId,
  farms,
}: {
  cooperativeId: string;
  farms: FarmOption[];
}) {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedFarm = farms.find((farm) => farm.id === farmId);

  async function loadWeather() {
    if (!selectedFarm) return;
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({
        cooperativeId,
        farmId: selectedFarm.id,
      });
      const response = await fetch(`/api/weather?${query}`, { cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok) {
        const error = typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string" ? result.error : "Les prévisions météo sont indisponibles.";
        throw new Error(error);
      }
      setForecast(result as WeatherForecast);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de connexion au service météo.");
      setForecast(null);
    } finally {
      setLoading(false);
    }
  }

  async function sendWeatherAlert() {
    if (!selectedFarm || !window.confirm("Mettre en file une alerte SMS pour tous les producteurs de cette coopérative qui y ont consenti ?")) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/sms/weather", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cooperativeId, farmId: selectedFarm.id }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const error = typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string" ? result.error : "L’alerte SMS n’a pas pu être envoyée.";
        throw new Error(error);
      }
      if (typeof result === "object" && result !== null && "queued" in result &&
        typeof result.queued === "number" && "sent" in result && typeof result.sent === "number") {
        setMessage(result.queued === 0
          ? "Aucun producteur n’a consenti aux alertes SMS."
          : result.sent > 0
            ? `${result.sent} SMS envoyé(s); consultez l’historique pour les statuts.`
            : `${result.queued} alerte(s) mise(s) en attente; les identifiants Termii manquent ou doivent être vérifiés.`);
      } else {
        setMessage("L’alerte a été traitée; consultez l’historique SMS pour son statut.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur pendant l’envoi SMS.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="module-form-panel">
      <p className="eyebrow eyebrow-dark"><span /> PRÉVISIONS À TROIS JOURS</p>
      <h2>Météo des parcelles</h2>
      <p className="panel-note">Les coordonnées sont envoyées à Open‑Meteo uniquement après votre clic sur « Charger la météo ». Prévisions indicatives, pas une alerte officielle.</p>
      {farms.length ? (
        <div className="recommendation-controls">
          <label htmlFor="weather-farm">Parcelle</label>
          <select id="weather-farm" value={farmId} onChange={(event) => { setFarmId(event.target.value); setForecast(null); }}>
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
          <button className="button button-primary" disabled={loading || !selectedFarm} onClick={loadWeather} type="button">
            {loading ? "Chargement…" : "Charger la météo"}
          </button>
        </div>
      ) : <p className="empty-state">Aucune parcelle géolocalisée. Enregistrez ses coordonnées GPS dans l’espace de gestion.</p>}
      {message && <p className="form-notice" role="status">{message}</p>}
      {forecast && (
        <>
          <article className="weather-current">
            <span>{weatherLabel(forecast.current.weatherCode)}</span>
            <strong>{Math.round(forecast.current.temperatureC)} °C</strong>
            <small>Humidité {forecast.current.humidityPercent}% · pluie {forecast.current.precipitationMm} mm · vent {Math.round(forecast.current.windSpeedKmh)} km/h</small>
          </article>
          <div className="weather-days">
            {forecast.days.map((day) => (
              <article className="weather-day" key={day.date}>
                <strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}</strong>
                <span>{weatherLabel(day.weatherCode)}</span>
                <span>{Math.round(day.minimumC)}–{Math.round(day.maximumC)} °C</span>
                <small>Pluie {day.rainProbabilityPercent}% · {day.precipitationMm} mm</small>
              </article>
            ))}
          </div>
          <button className="button button-secondary" disabled={sending} onClick={sendWeatherAlert} type="button">
            {sending ? "Traitement…" : "Mettre une alerte météo en file par SMS"}
          </button>
        </>
      )}
      <small>Source : Open‑Meteo · {forecast?.timezone ?? "Fuseau de la parcelle"}</small>
    </section>
  );
}
