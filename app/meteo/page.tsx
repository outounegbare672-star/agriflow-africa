import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";
import { WeatherPanel } from "./weather-panel";

export const metadata: Metadata = {
  title: "Météo agricole — ECO-FARMS Togo",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function WeatherPage({
  searchParams,
}: {
  searchParams: Promise<{ cooperative?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Météo des parcelles indisponible" text="Configurez PostgreSQL pour associer les prévisions aux parcelles de votre coopérative." /></main>;
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fmeteo");

  const params = await searchParams;
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, cooperative: { select: { id: true, name: true } } },
  });
  if (!memberships.length) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Aucune coopérative liée" text="Créez ou rejoignez une coopérative pour consulter la météo de ses parcelles." /><Link className="button button-primary" href="/dashboard">Ouvrir mon espace</Link></main>;
  }
  const active = memberships.find(({ cooperative }) => cooperative.id === params.cooperative) ?? memberships[0];
  if (active.role === "PRODUCER") {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Accès météo non configuré" text="Demandez au gestionnaire de votre coopérative de configurer votre accès." /></main>;
  }

  const farms = await prisma.farm.findMany({
    where: {
      cooperativeId: active.cooperative.id,
      latitude: { not: null },
      longitude: { not: null },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, latitude: true, longitude: true },
    take: 100,
  });

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> MÉTÉO AGRICOLE</p>
        <h1>Prévisions sur vos parcelles.</h1>
        <p>Consultez les prévisions des trois prochains jours pour une parcelle géolocalisée. Les données météo sont fournies par Open‑Meteo.</p>
      </section>
      {memberships.length > 1 && (
        <nav className="module-coop-nav" aria-label="Choisir une coopérative">
          {memberships.map(({ cooperative }) => (
            <Link aria-current={cooperative.id === active.cooperative.id ? "page" : undefined} href={`/meteo?cooperative=${encodeURIComponent(cooperative.id)}`} key={cooperative.id}>
              {cooperative.name}
            </Link>
          ))}
        </nav>
      )}
      <WeatherPanel
        cooperativeId={active.cooperative.id}
        farms={farms.flatMap((farm) =>
          farm.latitude === null || farm.longitude === null
            ? []
            : [{ id: farm.id, name: farm.name }],
        )}
      />
      <p className="module-disclaimer">La météo peut varier selon les conditions locales. Vérifiez les informations sur le terrain avant toute décision. Les alertes SMS sont mises en file uniquement pour les personnes ayant donné leur accord.</p>
    </main>
  );
}
