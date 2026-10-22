import "server-only";

export type WeatherForecast = {
  timezone: string;
  current: {
    time: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function numberArray(value: unknown): number[] | null {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? value
    : null;
}

export async function getWeatherForecast(latitude: number, longitude: number): Promise<WeatherForecast> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Coordonnées GPS invalides.");
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    forecast_days: "3",
    timezone: "auto",
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Le service météo a répondu avec le statut ${response.status}.`);
  }

  const root = asRecord(await response.json());
  const current = asRecord(root?.current);
  const daily = asRecord(root?.daily);
  const timezone = root?.timezone;
  if (!root || !current || !daily || typeof timezone !== "string") {
    throw new Error("Le service météo a retourné des données incomplètes.");
  }

  const times = stringArray(daily.time);
  const codes = numberArray(daily.weather_code);
  const maximums = numberArray(daily.temperature_2m_max);
  const minimums = numberArray(daily.temperature_2m_min);
  const rainProbabilities = numberArray(daily.precipitation_probability_max);
  const precipitation = numberArray(daily.precipitation_sum);
  const temperatureC = numberValue(current, "temperature_2m");
  const humidityPercent = numberValue(current, "relative_humidity_2m");
  const precipitationMm = numberValue(current, "precipitation");
  const windSpeedKmh = numberValue(current, "wind_speed_10m");
  const weatherCode = numberValue(current, "weather_code");
  const currentTime = current.time;
  if (
    !times || !codes || !maximums || !minimums || !rainProbabilities || !precipitation ||
    ![codes, maximums, minimums, rainProbabilities, precipitation].every((values) => values.length === times.length) ||
    temperatureC === null || humidityPercent === null || precipitationMm === null ||
    windSpeedKmh === null || weatherCode === null || typeof currentTime !== "string"
  ) {
    throw new Error("Le service météo a retourné des prévisions invalides.");
  }

  return {
    timezone,
    current: {
      time: currentTime,
      temperatureC,
      humidityPercent,
      precipitationMm,
      windSpeedKmh,
      weatherCode,
    },
    days: times.map((date, index) => ({
      date,
      weatherCode: codes[index],
      maximumC: maximums[index],
      minimumC: minimums[index],
      rainProbabilityPercent: rainProbabilities[index],
      precipitationMm: precipitation[index],
    })),
  };
}

export function describeWeatherCode(code: number) {
  if (code === 0) return "Ciel dégagé";
  if (code <= 3) return "Partiellement nuageux";
  if (code === 45 || code === 48) return "Brouillard";
  if (code >= 51 && code <= 67) return "Bruine ou pluie";
  if (code >= 71 && code <= 77) return "Neige";
  if (code >= 80 && code <= 82) return "Averses";
  if (code >= 85 && code <= 86) return "Averses de neige";
  if (code >= 95) return "Orage possible";
  return "Conditions variables";
}
