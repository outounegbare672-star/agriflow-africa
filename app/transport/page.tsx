import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { completeTransportRequest, createTransportRequest } from "@/app/dashboard/market-actions";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";

export const metadata: Metadata = {
  title: "Transport des récoltes — ECO-FARMS Togo",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ cooperative?: string; error?: string; created?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return (
      <main className="public-module">
        <ModuleHeader />
        <ModuleNotice title="Transport en préparation" text="Configurez PostgreSQL pour enregistrer et consulter les demandes de transport de votre coopérative." />
      </main>
    );
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Ftransport");

  const params = await searchParams;
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, cooperative: { select: { id: true, name: true, countryCode: true, phone: true } } },
  });
  if (!memberships.length) {
    return (
      <main className="public-module"><ModuleHeader />
        <ModuleNotice title="Créez d’abord votre coopérative" text="Les demandes de transport sont enregistrées dans l’espace d’une coopérative." />
        <Link className="button button-primary" href="/dashboard">Créer mon espace</Link>
      </main>
    );
  }

  const active = memberships.find(({ cooperative }) => cooperative.id === params.cooperative) ?? memberships[0];
  const cooperativeId = active.cooperative.id;
  const canWrite = active.role !== "PRODUCER";
  if (!canWrite) {
    return (
      <main className="public-module">
        <ModuleHeader />
        <ModuleNotice title="Accès transport non configuré" text="Votre compte n’est pas encore associé à une fiche producteur. Demandez au gestionnaire de votre coopérative de configurer votre accès." />
      </main>
    );
  }
  const requests = await prisma.transportRequest.findMany({
    where: { cooperativeId },
    orderBy: [{ status: "asc" }, { pickupDate: "asc" }],
    select: { id: true, cargo: true, quantity: true, unit: true, origin: true, destination: true, pickupDate: true, status: true },
    take: 100,
  });

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> LOGISTIQUE COOPÉRATIVE</p>
        <h1>Organiser un transport.</h1>
        <p>Enregistrez les besoins de transport de votre coopérative et suivez leur statut avec votre équipe.</p>
      </section>
      {memberships.length > 1 && (
        <nav className="module-coop-nav" aria-label="Choisir une coopérative">
          {memberships.map(({ cooperative }) => (
            <Link aria-current={cooperative.id === cooperativeId ? "page" : undefined} href={`/transport?cooperative=${encodeURIComponent(cooperative.id)}`} key={cooperative.id}>
              {cooperative.name}
            </Link>
          ))}
        </nav>
      )}
      {params.error && <p className="form-error" role="alert">{transportError(params.error)}</p>}
      {params.created && <p className="form-success" role="status">{transportMessage(params.created)}</p>}
      {canWrite && (
        <section className="module-form-panel">
          <h2>Nouvelle demande</h2>
          <form action={createTransportRequest} className="dashboard-form compact-form">
            <input name="cooperativeId" type="hidden" value={cooperativeId} />
            <input name="returnTo" type="hidden" value="transport" />
            <div className="form-row">
              <label>Produit / chargement<input name="cargo" required /></label>
              <label>Quantité (kg)<input name="quantity" min="0.1" step="0.1" type="number" required /></label>
            </div>
            <div className="form-row">
              <label>Départ<input name="origin" required /></label>
              <label>Destination<input name="destination" required /></label>
            </div>
            <label>Date souhaitée<input name="pickupDate" type="date" required /></label>
            <button className="button button-primary" type="submit">Enregistrer la demande</button>
          </form>
        </section>
      )}
      <section className="transport-list">
        <h2>Demandes de {active.cooperative.name}</h2>
        {requests.length ? requests.map((request) => (
          <article className="transport-card" key={request.id}>
            <div>
              <span className={`record-tag ${request.status === "OPEN" ? "status-open" : ""}`}>{request.status === "OPEN" ? "À organiser" : "Terminée"}</span>
              <h3>{request.cargo} · {request.quantity} {request.unit}</h3>
              <p>{request.origin} → {request.destination}</p>
              <small>Départ souhaité : {request.pickupDate.toLocaleDateString("fr-FR")}</small>
            </div>
            {canWrite && request.status === "OPEN" && (
              <form action={completeTransportRequest}>
                <input name="cooperativeId" type="hidden" value={cooperativeId} />
                <input name="requestId" type="hidden" value={request.id} />
                <input name="returnTo" type="hidden" value="transport" />
                <button className="button button-primary" type="submit">Marquer terminée</button>
              </form>
            )}
          </article>
        )) : <p className="empty-state">Aucune demande de transport enregistrée.</p>}
      </section>
      <p className="module-disclaimer">Cet outil organise les demandes de la coopérative ; il ne réserve pas un transporteur et ne garantit pas la disponibilité d’un véhicule.</p>
    </main>
  );
}

function transportError(code: string) {
  const messages: Record<string, string> = {
    "invalid-transport": "Vérifiez les lieux, la quantité et la date de départ.",
    "write-access-required": "Votre rôle ne permet pas de créer ou clôturer une demande.",
    "unauthorized-cooperative": "Vous n’êtes pas membre de cette coopérative.",
    "transport-not-found": "Cette demande n’existe plus ou a déjà été clôturée.",
  };
  return messages[code] ?? "La demande n’a pas pu être enregistrée.";
}

function transportMessage(code: string) {
  const messages: Record<string, string> = {
    transport: "Demande de transport enregistrée.",
    "transport-closed": "Demande marquée comme terminée.",
  };
  return messages[code] ?? "Mise à jour effectuée.";
}
