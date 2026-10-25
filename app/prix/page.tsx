import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";

export const metadata: Metadata = {
  title: "Prix agricoles déclarés — ECO-FARMS Togo",
  description: "Prix agricoles récemment relevés et déclarés par les coopératives participantes.",
};
export const instant = false;

export default async function PricesPage() {
  await connection();
  const reports = process.env.DATABASE_URL
    ? await getPrisma().priceReport.findMany({
      orderBy: { observedAt: "desc" },
      select: {
        id: true, crop: true, marketName: true, price: true, unit: true, observedAt: true,
        cooperative: { select: { name: true, countryCode: true, currency: true } },
      },
      take: 100,
    })
    : null;

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> OBSERVATOIRE PARTICIPATIF</p>
        <h1>Prix agricoles relevés.</h1>
        <p>Les observations sont saisies par les coopératives, avec le marché et la date du relevé. Elles ne proviennent pas d’un flux de prix en direct.</p>
        <Link className="button button-primary" href="/connexion?next=%2Fdashboard%23prix">Déclarer un prix relevé</Link>
      </section>
      {reports === null ? (
        <ModuleNotice title="Les relevés ne sont pas encore disponibles" text="Configurez la base de données pour enregistrer et partager des observations de prix réelles." />
      ) : reports.length ? (
        <div className="table-scroll">
          <table className="market-table">
            <thead><tr><th>Produit</th><th>Prix déclaré</th><th>Marché</th><th>Pays</th><th>Coopérative déclarante</th><th>Date du relevé</th></tr></thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.crop}</td>
                  <td>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(report.price)} {report.cooperative.currency} / {report.unit}</td>
                  <td>{report.marketName}</td>
                  <td>{report.cooperative.countryCode}</td>
                  <td>{report.cooperative.name}</td>
                  <td>{report.observedAt.toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ModuleNotice title="Aucun relevé de prix pour le moment" text="Une coopérative peut publier un relevé depuis son espace de gestion." />
      )}
      <p className="module-disclaimer">Les prix sont déclaratifs, indicatifs et non vérifiés par ECO-FARMS Togo. Vérifiez toujours la date et les conditions auprès de la coopérative.</p>
    </main>
  );
}
