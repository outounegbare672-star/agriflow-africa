"use client";

import { useRef, useState } from "react";

export function LocationFields() {
  const locationRef = useRef<HTMLInputElement>(null);
  const [coordinates, setCoordinates] = useState<{ latitude: string; longitude: string }>({
    latitude: "",
    longitude: "",
  });
  const [message, setMessage] = useState("");

  function locateParcel() {
    if (!navigator.geolocation) {
      setMessage("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }

    setMessage("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = coords.latitude.toFixed(6);
        const longitude = coords.longitude.toFixed(6);
        setCoordinates({ latitude, longitude });
        if (locationRef.current && !locationRef.current.value.trim()) {
          locationRef.current.value = `${latitude}, ${longitude}`;
        }
        setMessage(`Position capturée avec une précision de ${Math.round(coords.accuracy)} m.`);
      },
      (error) => {
        const reasons: Record<number, string> = {
          1: "Autorisez l’accès à la position pour utiliser cette fonction.",
          2: "Votre position n’a pas pu être déterminée.",
          3: "La recherche de position a expiré. Réessayez.",
        };
        setMessage(reasons[error.code] ?? "La position n’a pas pu être déterminée.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <>
      <label>Village, adresse ou repère<input name="gpsLocation" ref={locationRef} required /></label>
      <div className="location-capture">
        <button className="button button-secondary" type="button" onClick={locateParcel}>
          Utiliser ma position GPS
        </button>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="form-row">
        <label>Latitude<input name="latitude" inputMode="decimal" value={coordinates.latitude} onChange={(event) => setCoordinates((value) => ({ ...value, latitude: event.target.value }))} placeholder="Ex. 6.1319" /></label>
        <label>Longitude<input name="longitude" inputMode="decimal" value={coordinates.longitude} onChange={(event) => setCoordinates((value) => ({ ...value, longitude: event.target.value }))} placeholder="Ex. 1.2228" /></label>
      </div>
      <small className="panel-note">La position exacte reste visible uniquement par les membres de votre coopérative.</small>
    </>
  );
}
