import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "./form";

export const metadata: Metadata = {
  title: "Connexion — Agriflow Africa",
  description: "Connectez-vous à votre espace de gestion Agriflow Africa.",
};
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  return (
    <main className="auth-page">
      <Link className="auth-back" href="/">← Retour au site</Link>
      <section className="auth-card">
        <p className="eyebrow eyebrow-dark"><span /> ESPACE AGRIFLOW</p>
        <h1>Gérez votre activité.</h1>
        <p className="auth-intro">Créez un compte ou retrouvez votre espace coopérative.</p>
        {process.env.DATABASE_URL ? (
          <AuthForm nextPath={nextPath} />
        ) : (
          <p className="form-error" role="status">
            L’inscription est momentanément indisponible : la base PostgreSQL n’est pas encore configurée.
          </p>
        )}
      </section>
    </main>
  );
}
