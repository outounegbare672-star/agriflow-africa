import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";
import { retrySmsNotification } from "./actions";

export const metadata: Metadata = {
  title: "Notifications SMS — ECO-FARMS Togo",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cooperative?: string; result?: string; error?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Historique SMS indisponible" text="Configurez PostgreSQL pour consulter les notifications de votre coopérative." /></main>;
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fnotifications");

  const params = await searchParams;
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, role: { not: "PRODUCER" } },
    orderBy: { createdAt: "asc" },
    select: { cooperative: { select: { id: true, name: true } } },
  });
  if (!memberships.length) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Accès gestionnaire requis" text="L’historique SMS est réservé aux gestionnaires de coopérative." /><Link className="button button-primary" href="/dashboard">Retour au tableau de bord</Link></main>;
  }
  const active = memberships.find(({ cooperative }) => cooperative.id === params.cooperative) ?? memberships[0];
  const notifications = await prisma.smsNotification.findMany({
    where: { cooperativeId: active.cooperative.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, category: true, toPhone: true, message: true, status: true,
      error: true, providerReference: true, createdAt: true, sentAt: true,
    },
    take: 100,
  });

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> NOTIFICATIONS SMS</p>
        <h1>Historique de {active.cooperative.name}.</h1>
        <p>Les envois réels nécessitent une clé Termii et un expéditeur validé. Les numéros ne sont visibles que par les membres gestionnaires.</p>
      </section>
      {memberships.length > 1 && (
        <nav className="module-coop-nav" aria-label="Choisir une coopérative">
          {memberships.map(({ cooperative }) => (
            <Link aria-current={cooperative.id === active.cooperative.id ? "page" : undefined} href={`/notifications?cooperative=${encodeURIComponent(cooperative.id)}`} key={cooperative.id}>
              {cooperative.name}
            </Link>
          ))}
        </nav>
      )}
      {params.result && <p className={params.result === "sent" ? "form-success" : "form-notice"} role="status">{smsResult(params.result)}</p>}
      {params.error && <p className="form-error" role="alert">{notificationError(params.error)}</p>}
      {notifications.length ? (
        <section className="notification-list">
          {notifications.map((notification) => (
            <article className="notification-card" key={notification.id}>
              <div className="notification-card-header">
                <span className={`record-tag ${notification.status === "SENT" ? "status-open" : ""}`}>{statusLabel(notification.status)}</span>
                <small>{categoryLabel(notification.category)} · {notification.createdAt.toLocaleString("fr-FR")}</small>
              </div>
              <p><strong>Destinataire :</strong> {notification.toPhone}</p>
              <p>{notification.message}</p>
              {notification.error && <p className="form-error">{notification.error}</p>}
              {notification.providerReference && <small>Référence Termii : {notification.providerReference}</small>}
              {notification.sentAt && <small>Envoyé le {notification.sentAt.toLocaleString("fr-FR")}</small>}
              {(notification.status === "PENDING" || notification.status === "FAILED") && (
                <form action={retrySmsNotification}>
                  <input name="cooperativeId" type="hidden" value={active.cooperative.id} />
                  <input name="notificationId" type="hidden" value={notification.id} />
                  <button className="button button-secondary" type="submit">
                    {notification.status === "PENDING" ? "Réessayer l’envoi" : "Relancer après correction"}
                  </button>
                </form>
              )}
            </article>
          ))}
        </section>
      ) : <ModuleNotice title="Aucune notification pour le moment" text="Les SMS destinés aux producteurs ayant consenti apparaîtront ici, y compris ceux en attente ou en échec." />}
      <p className="module-disclaimer">Un statut « Envoyé » signifie que Termii a accepté le message; il ne garantit pas sa réception par le téléphone. Les erreurs et tentatives restent consultables ici.</p>
    </main>
  );
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    HARVEST: "Récolte",
    WEATHER: "Météo",
    PAYMENT: "Paiement",
    MARKET: "Marché",
  };
  return labels[category] ?? category;
}

function statusLabel(status: string) {
  return status === "SENT" ? "Accepté par Termii"
    : status === "PENDING" ? "En attente"
      : status === "CANCELLED" ? "Annulé (consentement retiré)"
        : "Échec";
}

function smsResult(result: string) {
  if (result === "sent") return "Termii a accepté le SMS.";
  if (result === "pending") return "SMS en attente : configurez Termii dans les variables secrètes du service.";
  return "Le SMS n’a pas été envoyé. Consultez l’erreur et corrigez les paramètres avant de réessayer.";
}

function notificationError(error: string) {
  const errors: Record<string, string> = {
    unauthorized: "Vous n’êtes pas membre de cette coopérative.",
    forbidden: "Votre rôle ne permet pas de consulter les notifications.",
    "not-found": "Cette notification n’existe pas dans votre coopérative.",
  };
  return errors[error] ?? "Une erreur est survenue.";
}
