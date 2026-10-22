import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Marché agricole — Agriflow Africa",
  description: "Offres de produits agricoles publiées par les coopératives d'Afrique de l'Ouest.",
};
export const instant = false;

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ culture?: string }>;
}) {
  await connection();
  const { culture } = await searchParams;
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const listings = databaseConfigured
    ? await getPrisma().marketListing.findMany({
      where: {
        active: true,
        ...(culture ? { crop: { contains: culture, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, crop: true, quantity: true, unit: true,
        pricePerUnit: true, createdAt: true,
        cooperative: {
          select: { name: true, phone: true, address: true, countryCode: true, currency: true },
        },
      },
      take: 100,
    })
    : null;

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> MARCHÉ AGRICOLE</p>
        <h1>Des récoltes à valoriser.</h1>
        <p>Offres publiées par les coopératives participantes. Contactez directement le vendeur pour vérifier la disponibilité et convenir de la vente.</p>
        <Link className="button button-primary" href="/connexion?next=%2Fdashboard">Publier une offre</Link>
      </section>
      {listings === null ? (
        <ModuleNotice title="Le marché est en préparation" text="Configurez la base de données pour publier et consulter les offres réelles des coopératives." />
      ) : listings.length ? (
        <section className="listing-grid" aria-label="Offres agricoles disponibles">
          {listings.map((listing) => (
            <article className="listing-card" key={listing.id}>
              <span className="record-tag">{listing.cooperative.countryCode}</span>
              <h2>{listing.title}</h2>
              <p>{listing.crop} · {listing.cooperative.address ?? "Localisation à confirmer"}</p>
              <strong>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(listing.quantity)} {listing.unit} disponibles</strong>
              {listing.pricePerUnit !== null && (
                <p>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(listing.pricePerUnit)} {listing.cooperative.currency} / {listing.unit} <small>(prix annoncé)</small></p>
              )}
              <p className="listing-meta">{listing.cooperative.name} · publié le {listing.createdAt.toLocaleDateString("fr-FR")}</p>
              <a className="button button-primary" href={`tel:${listing.cooperative.phone}`}>Appeler la coopérative</a>
            </article>
          ))}
        </section>
      ) : (
        <ModuleNotice
          title={culture ? `Aucune offre pour « ${culture} »` : "Aucune offre publiée pour le moment"}
          text="Les offres apparaîtront ici lorsqu’une coopérative en publiera une depuis son espace."
        />
      )}
      <p className="module-disclaimer">Agriflow met en relation les parties ; les quantités, prix et conditions sont publiés par les coopératives et doivent être confirmés directement.</p>
    </main>
  );
}

export function ModuleHeader() {
  return (
    <header className="module-header">
      <Link className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">A</span>
        <span className="brand-name">agri<span>flow</span><small>AFRICA</small></span>
      </Link>
      <nav aria-label="Navigation Agriflow">
        <Link href="/marche">Marché</Link>
        <Link href="/prix">Prix relevés</Link>
        <Link href="/transport">Transport</Link>
      </nav>
      <Link className="header-cta" href="/connexion">Mon espace</Link>
    </header>
  );
}

export function ModuleNotice({ title, text }: { title: string; text: string }) {
  return <section className="module-notice"><h2>{title}</h2><p>{text}</p></section>;
}
