import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getWestAfricanCountry } from "@/lib/west-africa";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";

export const metadata: Metadata = {
  title: "Traçabilité d’un lot — ECO-FARMS Togo",
  description: "Consultez les étapes déclarées de traçabilité d’une récolte ECO-FARMS Togo.",
};
export const instant = false;

export default async function TraceabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchCode: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Traçabilité indisponible" text="La base de données n’est pas configurée." /></main>;
  }
  const [{ batchCode }, query] = await Promise.all([params, searchParams]);
  if (!/^[A-Za-z0-9-]{8,50}$/.test(batchCode)) notFound();

  const harvest = await getPrisma().harvest.findUnique({
    where: { batchCode },
    select: {
      batchCode: true,
      quantity: true,
      date: true,
      crop: { select: { name: true } },
      producer: {
        select: {
          cooperative: { select: { name: true, countryCode: true } },
        },
      },
      traceabilityEvents: {
        orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
        select: { id: true, type: true, eventDate: true },
      },
    },
  });
  if (!harvest) notFound();
  const country = getWestAfricanCountry(harvest.producer.cooperative.countryCode);

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> TRAÇABILITÉ AGRICOLE</p>
        <h1>Suivi du lot {harvest.batchCode}.</h1>
        <p>Historique des étapes déclarées par la coopérative. ECO-FARMS Togo ne vérifie pas physiquement les informations saisies.</p>
      </section>
      {query.created === "event" && <p className="form-success" role="status">Étape de traçabilité ajoutée.</p>}
      <section className="traceability-summary">
        <article><span>Produit</span><strong>{harvest.crop.name}</strong></article>
        <article><span>Quantité enregistrée</span><strong>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(harvest.quantity)} kg</strong></article>
        <article><span>Date de récolte</span><strong>{harvest.date.toLocaleDateString("fr-FR")}</strong></article>
        <article><span>Coopérative</span><strong>{harvest.producer.cooperative.name} · {country?.name ?? harvest.producer.cooperative.countryCode}</strong></article>
      </section>
      <section className="traceability-timeline" aria-label="Étapes de traçabilité">
        <h2>Étapes du lot</h2>
        {harvest.traceabilityEvents.map((event) => (
          <article className="traceability-event" key={event.id}>
            <span className="record-tag">{eventLabel(event.type)}</span>
            <div>
              <p>Étape déclarée par la coopérative.</p>
              <small>{event.eventDate.toLocaleString("fr-FR")}</small>
            </div>
          </article>
        ))}
      </section>
      <p className="module-disclaimer">Ce code identifie le lot dans ECO-FARMS Togo. Les lieux précis, noms de producteurs et coordonnées GPS ne sont pas publiés sur cette page.</p>
    </main>
  );
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    HARVEST_RECORDED: "Récolte enregistrée",
    QUALITY_CHECKED: "Qualité vérifiée",
    STORED: "Stockée",
    DISPATCHED: "Expédiée",
    RECEIVED: "Réceptionnée",
  };
  return labels[type] ?? "Étape de suivi";
}
