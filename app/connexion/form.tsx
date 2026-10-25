"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");

    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name, email, password, callbackURL: nextPath })
        : await authClient.signIn.email({ email, password, callbackURL: nextPath });

      if (result.error) {
        setError(result.error.message ?? "La connexion a échoué. Réessayez.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Le service est temporairement indisponible. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === "signup" && (
        <label>
          Nom complet
          <input autoComplete="name" name="name" minLength={2} required />
        </label>
      )}
      <label>
        Adresse e-mail
        <input autoComplete="email" name="email" type="email" required />
      </label>
      <label>
        Mot de passe
        <input
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          name="password"
          type="password"
          minLength={mode === "signup" ? 12 : undefined}
          maxLength={128}
          required
        />
        {mode === "signup" && <small>12 caractères minimum.</small>}
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={loading} type="submit">
        {loading ? "Veuillez patienter…" : mode === "signup" ? "Créer mon compte" : "Me connecter"}
      </button>
      <button
        className="auth-switch"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError("");
        }}
        type="button"
      >
        {mode === "signup" ? "Déjà inscrit·e ? Se connecter" : "Nouveau sur ECO-FARMS Togo ? Créer un compte"}
      </button>
    </form>
  );
}
