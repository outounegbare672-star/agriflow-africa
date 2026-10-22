import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { westAfricanCountries } from "@/lib/west-africa";
import { createSandboxCheckout } from "./checkout-actions";

export const metadata: Metadata = {
  title: "Marché agricole — Agriflow Africa",
  description: "Offres de produits agricoles publiées par les coopératives d'Afrique de l'Ouest.",
};
export const instant = false;

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ culture?: string; pays?: string; recherche?: string; error?: string }>;
}) {
  await connection();
  const { culture, pays, recherche, error } = await searchParams;
  const selectedCountry = westAfricanCountries.some((country) => country.code === pays) ? pays : undefined;
  const query = recherche?.trim().slice(0, 80) ?? "";
  const cropFilter = culture?.trim().slice(0, 60) ?? "";
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const listings = databaseConfigured
    ? await getPrisma().marketListing.findMany({
      where: {
        active: true,
        ...(cropFilter ? { crop: { contains: cropFilter, mode: "insensitive" as const } } : {}),
        ...(selectedCountry ? { cooperative: { countryCode: selectedCountry } } : {}),
        ...(query ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { crop: { contains: query, mode: "insensitive" as const } },
          ],
        } : {}),
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
      {error && <p className="form-error" role="alert">{marketError(error)}</p>}
      <form className="market-search" method="get">
        <label>Produit ou offre
          <input name="recherche" maxLength={80} defaultValue={query} placeholder="Maïs, riz, légumes…" />
        </label>
        <label>Culture
          <input name="culture" maxLength={60} defaultValue={culture ?? ""} placeholder="Toutes les cultures" />
        </label>
        <label>Pays
          <select name="pays" defaultValue={selectedCountry ?? ""}>
            <option value="">Tous les pays</option>
            {westAfricanCountries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
        </label>
        <button className="button button-primary" type="submit">Filtrer les offres</button>
      </form>
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
              {listing.cooperative.countryCode === "TG" &&
                listing.cooperative.currency === "XOF" &&
                listing.pricePerUnit !== null &&
                listing.pricePerUnit * listing.quantity >= 100 && (
                  <div className="sandbox-checkout">
                    <p><strong>Essai Mobile Money (sandbox uniquement)</strong><br />
                      Montant total du lot : {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(listing.pricePerUnit * listing.quantity))} XOF.
                    </p>
                    {process.env.CINETPAY_MODE === "sandbox" && process.env.CINETPAY_SANDBOX_API_KEY && process.env.CINETPAY_SANDBOX_SITE_ID ? (
                      <form action={createSandboxCheckout} className="dashboard-form compact-form">
                        <input name="listingId" type="hidden" value={listing.id} />
                        <label>Téléphone de test (format international)<input name="buyerPhone" placeholder="+228XXXXXXXX" required type="tel" /></label>
                        <label className="consent-check">
                          <input name="sandboxConsent" required type="checkbox" />
                          Je comprends qu’il s’agit d’un test : aucun argent réel ne sera encaissé.
                        </label>
                        <button className="button button-secondary" type="submit">Tester TMoney / Moov Money</button>
                      </form>
                    ) : (
                      <p className="panel-note">Essai désactivé : les identifiants CinetPay sandbox doivent être configurés dans les secrets Render. Aucune transaction réelle n’est possible.</p>
                    )}
                  </div>
                )}
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

function marketError(code: string) {
  const messages: Record<string, string> = {
    "payment-sandbox-not-configured": "Les paiements sandbox ne sont pas configurés; aucun paiement n’a été tenté.",
    "invalid-sandbox-payment": "Vérifiez le numéro de téléphone international et confirmez le mode test.",
    "sandbox-payment-limit": "La limite de cinq essais par heure a été atteinte.",
    "listing-payment-unavailable": "Cette offre n’est pas disponible pour un paiement test (Togo, XOF et prix unitaire requis).",
    "sandbox-payment-initiation": "CinetPay n’a pas pu initialiser le test. Aucun paiement n’a été confirmé; réessayez ou contactez l’administrateur.",
  };
  return messages[code] ?? "L’action demandée n’a pas pu aboutir.";
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
