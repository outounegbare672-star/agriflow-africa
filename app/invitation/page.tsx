import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitation } from "@/app/dashboard/invitation-actions";

export const metadata: Metadata = {
  title: "Invitation — ECO-FARMS Togo",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const errorMessage = error === "email-mismatch"
    ? "Connectez-vous avec l’adresse e-mail qui a reçu l’invitation."
    : error
      ? "Ce lien d’invitation est invalide ou a expiré. Demandez un nouveau lien au propriétaire."
      : "";

  return (
    <main className="auth-page">
      <Link className="auth-back" href="/">← Retour au site</Link>
      <section className="auth-card">
        <p className="eyebrow eyebrow-dark"><span /> INVITATION ECO-FARMS TOGO</p>
        <h1>Rejoindre une coopérative.</h1>
        <p className="auth-intro">Connectez-vous à votre compte ECO-FARMS Togo, puis acceptez l’invitation.</p>
        {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
        {!process.env.DATABASE_URL ? (
          <p className="form-error" role="status">L’acceptation d’invitation sera disponible après la configuration de PostgreSQL.</p>
        ) : token ? (
          <form action={acceptInvitation} className="auth-form">
            <input name="token" type="hidden" value={token} />
            <button className="button button-primary" type="submit">Accepter l’invitation</button>
          </form>
        ) : (
          <p className="form-error" role="alert">Le lien d’invitation ne contient pas de jeton valide.</p>
        )}
        <Link className="auth-switch" href={`/connexion?next=${encodeURIComponent(`/invitation?token=${encodeURIComponent(token ?? "")}`)}`}>
          Se connecter ou créer un compte
        </Link>
      </section>
    </main>
  );
}
