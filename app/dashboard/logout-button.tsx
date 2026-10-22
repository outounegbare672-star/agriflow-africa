"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function logout() {
    setError("");
    setPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message ?? "La déconnexion a échoué. Réessayez.");
        return;
      }
      router.replace("/connexion");
      router.refresh();
    } catch {
      setError("La déconnexion a échoué. Vérifiez votre connexion puis réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="logout-control">
      <button className="logout-button" disabled={pending} onClick={logout}>
        {pending ? "Déconnexion…" : "Déconnexion"}
      </button>
      {error && <small className="logout-error" role="alert">{error}</small>}
    </span>
  );
}
