import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ModuleHeader, ModuleNotice } from "@/app/marche/page";
import { RecommendationsPanel } from "./recommendations";
import { queueUpcomingHarvestReminders } from "./actions";

export const metadata: Metadata = {
  title: "Calendrier et alertes agricoles — ECO-FARMS Togo",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function AdvicePage({
  searchParams,
}: {
  searchParams: Promise<{ cooperative?: string; smsQueued?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return (
      <main className="public-module">
        <ModuleHeader />
        <ModuleNotice title="Conseils & alertes en préparation" text="Configurez PostgreSQL pour consulter le calendrier calculé à partir des cultures réelles de votre coopérative." />
      </main>
    );
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fconseils");
  const params = await searchParams;
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      cooperative: { select: { id: true, name: true } },
    },
  });
  if (!memberships.length) {
    return <main className="public-module"><ModuleHeader /><ModuleNotice title="Aucune coopérative liée à votre compte" text="Créez ou rejoignez une coopérative pour consulter le calendrier de cultures." /><Link className="button button-primary" href="/dashboard">Ouvrir mon espace</Link></main>;
  }
  const active = memberships.find(({ cooperative }) => cooperative.id === params.cooperative) ?? memberships[0];
  const cooperativeId = active.cooperative.id;
  if (active.role === "PRODUCER") {
    return (
      <main className="public-module">
        <ModuleHeader />
        <ModuleNotice title="Calendrier producteur non configuré" text="Votre compte n’est pas encore associé à une fiche producteur. Demandez au gestionnaire de votre coopérative de configurer votre accès." />
      </main>
    );
  }
  const crops = await prisma.crop.findMany({
    where: { farm: { cooperativeId } },
    orderBy: { expectedHarvest: "asc" },
    select: {
      id: true, name: true, expectedHarvest: true, estimatedYield: true, status: true,
      farm: { select: { name: true, producer: { select: { firstName: true, lastName: true } } } },
    },
    take: 200,
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 30);

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> CALENDRIER DE CULTURE</p>
        <h1>Conseils & alertes.</h1>
        <p>Repères calculés à partir des cultures enregistrées, avec des recommandations IA facultatives lorsque le fournisseur est configuré. Vérifiez toujours les conseils auprès d’un professionnel local.</p>
      </section>
      {memberships.length > 1 && (
        <nav className="module-coop-nav" aria-label="Choisir une coopérative">
          {memberships.map(({ cooperative }) => (
            <Link aria-current={cooperative.id === cooperativeId ? "page" : undefined} href={`/conseils?cooperative=${encodeURIComponent(cooperative.id)}`} key={cooperative.id}>
              {cooperative.name}
            </Link>
          ))}
        </nav>
      )}
      {params.smsQueued !== undefined && (
        <p className="form-notice" role="status">
          {Number.isInteger(Number(params.smsQueued)) && Number(params.smsQueued) > 0
            ? `${params.smsQueued} rappel(s) SMS mis en file; vérifiez leur statut dans les notifications.`
            : "Aucun nouveau rappel à mettre en file. Vérifiez qu’une récolte est prévue sous sept jours et que le producteur a consenti aux SMS."}
        </p>
      )}
      {crops.length ? (
        <section className="advice-grid">
          {crops.map((crop) => {
            const days = Math.ceil((crop.expectedHarvest.getTime() - today.getTime()) / 86_400_000);
            const alert = days < 0
              ? "Date prévue dépassée : vérifiez l’état de la culture et mettez à jour le suivi."
              : days <= 30
                ? "Récolte prévue dans les 30 jours : confirmez la préparation du stockage et du transport."
                : "Culture en suivi : contrôlez régulièrement l’évolution avec le producteur.";
            return (
              <article className="advice-card" key={crop.id}>
                <span className={`record-tag ${days <= 30 ? "status-open" : ""}`}>
                  {days < 0 ? "À vérifier" : days <= 30 ? "Bientôt" : "Planifiée"}
                </span>
                <h2>{crop.name}</h2>
                <p>{crop.farm.name} · {crop.farm.producer.firstName} {crop.farm.producer.lastName}</p>
                <p>Récolte prévue : {crop.expectedHarvest.toLocaleDateString("fr-FR")}</p>
                <p>Rendement estimé : {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(crop.estimatedYield)} kg</p>
                <p className="advice-alert">{alert}</p>
              </article>
            );
          })}
        </section>
      ) : (
        <ModuleNotice title="Aucune culture enregistrée" text="Ajoutez des fermes et des cultures à votre coopérative pour générer le calendrier." />
      )}
      <RecommendationsPanel
        cooperativeId={cooperativeId}
        crops={crops.map(({ id, name }) => ({ id, name }))}
      />
      {crops.length > 0 && (
        <section className="module-form-panel">
          <h2>Rappels SMS de récolte</h2>
          <p className="panel-note">Met en file un rappel unique pour les récoltes prévues dans les sept prochains jours. Les SMS ne partent qu’aux producteurs consentants; si Termii est configuré, des frais de message peuvent s’appliquer.</p>
          <form action={queueUpcomingHarvestReminders}>
            <input name="cooperativeId" type="hidden" value={cooperativeId} />
            <button className="button button-secondary" type="submit">Mettre en file les rappels</button>
          </form>
        </section>
      )}
      <p className="module-disclaimer">Les rappels utilisent les informations saisies dans ECO-FARMS Togo. Les recommandations générées automatiquement sont indicatives, ne diagnostiquent pas les maladies et ne remplacent pas l’accompagnement d’un conseiller agricole.</p>
    </main>
  );
}
