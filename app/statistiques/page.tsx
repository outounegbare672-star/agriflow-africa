import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getWestAfricanCountry } from "@/lib/west-africa";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";

export const metadata: Metadata = {
  title: "Statistiques agricoles régionales — Agriflow Africa",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ cooperative?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Statistiques régionales indisponibles" text="Configurez PostgreSQL pour consulter les données agrégées de votre région." /></main>;
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fstatistiques");
  const params = await searchParams;
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { cooperative: { select: { id: true, name: true, countryCode: true, currency: true } } },
  });
  if (!memberships.length) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Aucune coopérative liée" text="Créez ou rejoignez une coopérative pour consulter les statistiques régionales." /><Link className="button button-primary" href="/dashboard">Ouvrir mon espace</Link></main>;
  }

  const active = memberships.find(({ cooperative }) => cooperative.id === params.cooperative) ?? memberships[0];
  const { countryCode } = active.cooperative;
  const harvestWhere = { producer: { cooperative: { countryCode } } };
  const farmWhere = { cooperative: { countryCode } };
  const cooperativeCount = await prisma.cooperative.count({
    where: { countryCode, farms: { some: {} } },
  });
  const country = getWestAfricanCountry(countryCode);

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> OBSERVATOIRE RÉGIONAL PRIVÉ</p>
        <h1>Repères agricoles de {country?.name ?? countryCode}.</h1>
        <p>Indicateurs agrégés des coopératives participantes; aucun nom de producteur, de ferme ou de coopérative n’est partagé.</p>
      </section>
      {memberships.length > 1 && (
        <nav className="module-coop-nav" aria-label="Choisir une région">
          {memberships.map(({ cooperative }) => (
            <Link aria-current={cooperative.id === active.cooperative.id ? "page" : undefined} href={`/statistiques?cooperative=${encodeURIComponent(cooperative.id)}`} key={cooperative.id}>
              {cooperative.name}
            </Link>
          ))}
        </nav>
      )}
      {cooperativeCount < 3 ? (
        <ModuleNotice
          title="Données régionales encore insuffisantes"
          text={`Les indicateurs s’affichent à partir de trois coopératives participantes. Pour l’instant : ${cooperativeCount} coopérative(s) disposent de parcelles dans cette région.`}
        />
      ) : (
        <RegionalStatistics
          countryCode={countryCode}
          cooperativeCount={cooperativeCount}
          farmWhere={farmWhere}
          harvestWhere={harvestWhere}
        />
      )}
      <p className="module-disclaimer">Les chiffres sont calculés à partir des données déclarées par les coopératives participantes; ils ne constituent pas des statistiques officielles ni un recensement exhaustif.</p>
    </main>
  );
}

async function RegionalStatistics({
  countryCode,
  cooperativeCount,
  farmWhere,
  harvestWhere,
}: {
  countryCode: string;
  cooperativeCount: number;
  farmWhere: { cooperative: { countryCode: string } };
  harvestWhere: { producer: { cooperative: { countryCode: string } } };
}) {
  const prisma = getPrisma();
  const [farms, producers, harvests, groupedCrops] = await Promise.all([
    prisma.farm.aggregate({
      where: farmWhere,
      _count: { id: true },
      _sum: { area: true },
    }),
    prisma.producer.count({ where: { cooperative: { countryCode } } }),
    prisma.harvest.aggregate({
      where: harvestWhere,
      _count: { id: true },
      _sum: { quantity: true },
    }),
    prisma.harvest.groupBy({
      by: ["cropId"],
      where: harvestWhere,
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);
  const cropNames = await prisma.crop.findMany({
    where: { id: { in: groupedCrops.map((crop) => crop.cropId) } },
    select: { id: true, name: true },
  });
  const namesById = new Map(cropNames.map((crop) => [crop.id, crop.name]));
  const format = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

  return (
    <>
      <section className="metric-grid" aria-label="Indicateurs régionaux agrégés">
        <Metric label="Coopératives" value={format.format(cooperativeCount)} detail="participantes dans cette région" />
        <Metric label="Producteurs" value={format.format(producers)} detail="tous participants de la région" />
        <Metric label="Parcelles" value={format.format(farms._count.id)} detail="surface suivie" />
        <Metric label="Superficie totale" value={`${format.format(farms._sum.area ?? 0)} ha`} detail="déclarée par les coopératives" />
        <Metric label="Récoltes suivies" value={format.format(harvests._count.id)} detail="quantités enregistrées" />
        <Metric label="Volume récolté" value={`${format.format(harvests._sum.quantity ?? 0)} kg`} detail="données déclarées" />
      </section>
      <section className="module-form-panel">
        <h2>Productions les plus suivies</h2>
        {groupedCrops.length ? (
          <div className="record-list">
            {groupedCrops.map((crop) => (
              <div className="record-row" key={crop.cropId}>
                <strong>{namesById.get(crop.cropId) ?? "Culture"}</strong>
                <span>{format.format(crop._sum.quantity ?? 0)} kg</span>
              </div>
            ))}
          </div>
        ) : <p className="empty-state">Aucune récolte saisie dans cette région pour le moment.</p>}
      </section>
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
