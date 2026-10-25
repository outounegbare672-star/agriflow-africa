import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getWestAfricanCountry, westAfricanCountries } from "@/lib/west-africa";
import { LogoutButton } from "./logout-button";
import { InviteMemberForm } from "./invite-member-form";
import { LocationFields } from "./location-fields";
import {
  createCooperative,
  createFarmAndCrop,
  createProducer,
  recordHarvest,
  recordPayment,
  setProducerSmsConsent,
} from "./actions";
import {
  closeMarketListing,
  createMarketListing,
  createPriceReport,
} from "./market-actions";
import { addTraceabilityEvent } from "@/app/tracabilite/actions";

export const metadata: Metadata = {
  title: "Espace de gestion — ECO-FARMS Togo",
  robots: { index: false, follow: false },
};
export const instant = false;

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string; cooperative?: string; newCooperative?: string }>;
}) {
  await connection();
  if (!process.env.DATABASE_URL) {
    return (
      <main className="dashboard-shell">
        <section className="onboarding-card">
          <p className="eyebrow eyebrow-dark"><span /> CONFIGURATION REQUISE</p>
          <h1>L’espace de gestion n’est pas encore connecté.</h1>
          <p>Configurez PostgreSQL dans <code>DATABASE_URL</code>, puis appliquez les migrations pour activer les comptes et les données métier.</p>
          <Link className="button button-primary" href="/">Retour à l’accueil</Link>
        </section>
      </main>
    );
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");

  const params = await searchParams;
  const user = session.user;
  const displayName = user.name.trim().split(/\s+/)[0] || "membre";
  const prisma = getPrisma();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      cooperative: { select: { id: true, name: true } },
    },
  });

  if (!memberships.length) {
    return (
      <main className="dashboard-shell">
        <DashboardHeader name={user.name} memberships={[]} />
        <section className="onboarding-card">
          <p className="eyebrow eyebrow-dark"><span /> PREMIÈRE ÉTAPE</p>
          <h1>Créez l’espace de votre coopérative.</h1>
          <p>Choisissez le pays de votre coopérative. La devise comptable sera configurée automatiquement.</p>
          <FormNotice error={params.error} created={params.created} />
          <form action={createCooperative} className="dashboard-form">
            <label>Nom de la coopérative<input name="name" minLength={2} required /></label>
            <label>Téléphone<input name="phone" type="tel" minLength={6} required /></label>
            <label>Ville ou adresse<input name="address" /></label>
            <label>Pays
              <select name="countryCode" defaultValue="TG" required>
                {westAfricanCountries.map((country) => (
                  <option key={country.code} value={country.code}>{country.name}</option>
                ))}
              </select>
            </label>
            <button className="button button-primary" type="submit">Créer mon espace</button>
          </form>
        </section>
      </main>
    );
  }

  const activeMembership = memberships.find(
    (membership) => membership.cooperative.id === params.cooperative,
  ) ?? memberships[0];
  const cooperativeId = activeMembership.cooperative.id;
  const canManage = activeMembership.role !== "PRODUCER";
  const cooperative = await prisma.cooperative.findUnique({
    where: { id: cooperativeId },
    select: { name: true, countryCode: true, currency: true },
  });
  if (!cooperative) {
    return (
      <main className="dashboard-shell">
        <DashboardHeader name={user.name} memberships={memberships} activeId={cooperativeId} />
        <section className="onboarding-card">
          <h1>Espace coopérative indisponible</h1>
          <p>La coopérative associée à votre compte est introuvable. Contactez l’assistance avant de poursuivre.</p>
        </section>
      </main>
    );
  }
  if (activeMembership.role === "PRODUCER") {
    return (
      <main className="dashboard-shell">
        <DashboardHeader name={user.name} memberships={memberships} activeId={cooperativeId} activeRole={activeMembership.role} />
        <section className="onboarding-card">
          <p className="eyebrow eyebrow-dark"><span /> ESPACE PRODUCTEUR</p>
          <h1>{cooperative.name}</h1>
          <p>Votre accès producteur n’est pas encore relié à une fiche producteur. Demandez à un gestionnaire de votre coopérative de configurer votre profil.</p>
        </section>
      </main>
    );
  }

  const [producers, crops, harvests, stocks, payments, producerCount, farmCount, harvestCount, stockTotal, paymentTotal] =
    await Promise.all([
      prisma.producer.findMany({
        where: { cooperativeId },
        orderBy: { createdAt: "desc" },
        select: { id: true, firstName: true, lastName: true, village: true, phone: true, smsConsent: true },
        take: 50,
      }),
      prisma.crop.findMany({
        where: { farm: { cooperativeId } },
        orderBy: { expectedHarvest: "asc" },
        select: { id: true, name: true, farm: { select: { name: true } } },
        take: 100,
      }),
      prisma.harvest.findMany({
        where: { producer: { cooperativeId } },
        orderBy: { date: "desc" },
        select: {
          id: true, batchCode: true, quantity: true, date: true,
          producer: { select: { firstName: true, lastName: true } },
          crop: { select: { name: true } },
        },
        take: 8,
      }),
      prisma.stock.groupBy({
        by: ["type"],
        where: { harvest: { producer: { cooperativeId } } },
        _sum: { quantity: true },
        orderBy: { type: "asc" },
      }),
      prisma.payment.findMany({
        where: { cooperativeId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, amount: true, method: true, reference: true, createdAt: true,
          producer: { select: { firstName: true, lastName: true } },
        },
        take: 8,
      }),
      prisma.producer.count({ where: { cooperativeId } }),
      prisma.farm.count({ where: { cooperativeId } }),
      prisma.harvest.count({ where: { producer: { cooperativeId } } }),
      prisma.stock.aggregate({
        where: { harvest: { producer: { cooperativeId } } },
        _sum: { quantity: true },
      }),
      prisma.payment.aggregate({
        where: { cooperativeId },
        _sum: { amount: true },
      }),
    ]);
  const [teamMembers, pendingInvitations] = await Promise.all([
    prisma.membership.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: "asc" },
      select: { role: true, user: { select: { name: true, email: true } } },
    }),
    prisma.invitation.findMany({
      where: { cooperativeId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  ]);
  const [marketListings, priceReports] = await Promise.all([
    prisma.marketListing.findMany({
      where: { cooperativeId, active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, crop: true, quantity: true, unit: true, pricePerUnit: true },
      take: 8,
    }),
    prisma.priceReport.findMany({
      where: { cooperativeId },
      orderBy: { observedAt: "desc" },
      select: { id: true, crop: true, marketName: true, price: true, unit: true, observedAt: true },
      take: 5,
    }),
  ]);
  const [farms, smsNotifications] = await Promise.all([
    prisma.farm.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, gpsLocation: true, latitude: true, longitude: true },
      take: 20,
    }),
    prisma.smsNotification.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, category: true, toPhone: true, message: true, status: true, createdAt: true,
      },
      take: 6,
    }),
  ]);

  return (
    <main className="dashboard-shell">
      <DashboardHeader
        name={user.name}
        memberships={memberships}
        activeId={cooperativeId}
        activeRole={activeMembership.role}
      />
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow eyebrow-dark"><span /> ESPACE COOPÉRATIVE · {getWestAfricanCountry(cooperative.countryCode)?.name.toUpperCase() ?? cooperative.countryCode}</p>
          <h1>Bonjour {displayName}.</h1>
          <p>{cooperative.name} <span className="dashboard-separator">·</span> Comptabilité en {cooperative.currency}</p>
        </div>
        <Link className="dashboard-back" href="/">Voir le site public ↗</Link>
      </section>

      <FormNotice error={params.error} created={params.created} />

      <nav className="dashboard-shortcuts" aria-label="Outils ECO-FARMS Togo">
        <Link href="/marche">Marché public ↗</Link>
        <Link href="/prix">Prix relevés ↗</Link>
        <Link href={`/transport?cooperative=${encodeURIComponent(cooperativeId)}`}>Transport ↗</Link>
        <Link href={`/conseils?cooperative=${encodeURIComponent(cooperativeId)}`}>Conseils & alertes ↗</Link>
        <Link href={`/meteo?cooperative=${encodeURIComponent(cooperativeId)}`}>Météo des parcelles ↗</Link>
        <Link href={`/statistiques?cooperative=${encodeURIComponent(cooperativeId)}`}>Statistiques régionales ↗</Link>
        <Link href="/notifications">Notifications SMS ↗</Link>
      </nav>

      <details className="dashboard-panel cooperative-create-panel" id="nouvelle-cooperative" open={params.newCooperative === "1"}>
        <summary>Créer un autre espace coopérative</summary>
        <form action={createCooperative} className="dashboard-form compact-form">
          <label>Nom de la coopérative<input name="name" minLength={2} required /></label>
          <div className="form-row">
            <label>Téléphone<input name="phone" type="tel" minLength={6} required /></label>
            <label>Ville ou adresse<input name="address" /></label>
          </div>
          <label>Pays
            <select name="countryCode" defaultValue="TG" required>
              {westAfricanCountries.map((country) => (
                <option key={country.code} value={country.code}>{country.name}</option>
              ))}
            </select>
          </label>
          <button className="button button-primary" type="submit">Créer un espace</button>
        </form>
      </details>

      <section className="metric-grid" aria-label="Indicateurs">
        <Metric label="Producteurs" value={numberFormat.format(producerCount)} detail="dans la coopérative" />
        <Metric label="Fermes" value={numberFormat.format(farmCount)} detail="parcelles suivies" />
        <Metric label="Récoltes" value={numberFormat.format(harvestCount)} detail="enregistrées" />
        <Metric label="Stock récolté" value={`${numberFormat.format(stockTotal._sum.quantity ?? 0)} kg`} detail="quantité cumulée" />
        <Metric label="Paiements suivis" value={`${moneyFormat.format(paymentTotal._sum.amount ?? 0)} ${cooperative.currency}`} detail="montant enregistré" />
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-panel">
          <PanelHeading eyebrow="ÉQUIPE" title={`Membres (${teamMembers.length})`} />
          <div className="record-list">
            {teamMembers.map(({ role, user: member }) => (
              <div className="record-row" key={member.email}>
                <span><strong>{member.name}</strong><small>{member.email}</small></span>
                <span className="record-tag">{role}</span>
              </div>
            ))}
          </div>
          {pendingInvitations.length > 0 && (
            <div className="record-list">
              <PanelHeading eyebrow="EN ATTENTE" title="Invitations" />
              {pendingInvitations.map((invitation) => (
                <div className="record-row" key={invitation.id}>
                  <span><strong>{invitation.email}</strong><small>Expire le {invitation.expiresAt.toLocaleDateString("fr-FR")}</small></span>
                  <span className="record-tag">{invitation.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeMembership.role === "OWNER" || activeMembership.role === "MANAGER" ? (
          <div className="dashboard-panel">
            <PanelHeading eyebrow="ÉQUIPE" title="Inviter un membre" />
            <p className="panel-note">Les liens sont à transmettre par votre canal habituel. Ils expirent après sept jours.</p>
            <InviteMemberForm cooperativeId={cooperativeId} />
          </div>
        ) : null}

        <div className="dashboard-panel">
          <PanelHeading eyebrow="TERRAIN" title="Producteurs" />
          {canManage && (
          <form action={createProducer} className="dashboard-form compact-form">
            <input name="cooperativeId" type="hidden" value={cooperativeId} />
            <div className="form-row">
              <label>Prénom<input name="firstName" minLength={2} required /></label>
              <label>Nom<input name="lastName" minLength={2} required /></label>
            </div>
            <div className="form-row">
              <label>Téléphone<input name="phone" type="tel" minLength={6} required /></label>
              <label>Village<input name="village" minLength={2} required /></label>
            </div>
            <label className="consent-check">
              <input name="smsConsent" type="checkbox" />
              Le producteur consent à recevoir les alertes de récolte, météo, paiement et marketplace par SMS; il peut retirer son consentement auprès de la coopérative.
            </label>
            <button className="button button-primary" type="submit">Ajouter le producteur</button>
          </form>
          )}
          <div className="record-list">
            {producers.length ? producers.map((producer) => (
              <div className="record-row" key={producer.id}>
                <span><strong>{producer.firstName} {producer.lastName}</strong><small>{producer.village} · {producer.phone}</small></span>
                <span className={`record-tag ${producer.smsConsent ? "status-open" : ""}`}>{producer.smsConsent ? "SMS autorisés" : "SMS désactivés"}</span>
                {canManage && (
                  <form action={setProducerSmsConsent}>
                    <input name="cooperativeId" type="hidden" value={cooperativeId} />
                    <input name="producerId" type="hidden" value={producer.id} />
                    <input name="consent" type="hidden" value={producer.smsConsent ? "false" : "true"} />
                    <button className="record-action" type="submit">{producer.smsConsent ? "Retirer le consentement" : "Autoriser les SMS"}</button>
                  </form>
                )}
              </div>
            )) : <p className="empty-state">Aucun producteur enregistré pour le moment.</p>}
          </div>
        </div>

        <div className="dashboard-panel">
          <PanelHeading eyebrow="PARCELLES" title="Fermes & cultures" />
          {canManage && (
          <form action={createFarmAndCrop} className="dashboard-form compact-form">
            <input name="cooperativeId" type="hidden" value={cooperativeId} />
            <label>Producteur
              <select name="producerId" required defaultValue="">
                <option disabled value="">Sélectionner un producteur</option>
                {producers.map((producer) => <option key={producer.id} value={producer.id}>{producer.firstName} {producer.lastName}</option>)}
              </select>
            </label>
            <div className="form-row">
              <label>Nom de la ferme<input name="farmName" required /></label>
              <label>Superficie (ha)<input name="area" min="0.01" step="0.01" type="number" required /></label>
            </div>
            <LocationFields />
            <div className="form-row">
              <label>Culture<input name="cropName" required /></label>
              <label>Récolte prévue<input name="expectedHarvest" type="date" required /></label>
            </div>
            <label>Rendement estimé (kg)<input name="estimatedYield" min="0" step="0.1" type="number" required /></label>
            <button className="button button-primary" disabled={!producers.length} type="submit">Ajouter ferme et culture</button>
          </form>
          )}
          <div className="record-list">
            {crops.slice(0, 5).map((crop) => (
              <div className="record-row" key={crop.id}>
                <span><strong>{crop.name}</strong><small>{crop.farm.name}</small></span>
                <span className="record-tag">Culture</span>
              </div>
            ))}
            {!crops.length && <p className="empty-state">Ajoutez un producteur puis sa ferme et ses cultures.</p>}
            {farms.map((farm) => (
              <div className="record-row" key={farm.id}>
                <span>
                  <strong>{farm.name}</strong>
                  <small>{farm.gpsLocation}{farm.latitude !== null && farm.longitude !== null ? ` · ${farm.latitude.toFixed(5)}, ${farm.longitude.toFixed(5)}` : ""}</small>
                </span>
                {farm.latitude !== null && farm.longitude !== null ? (
                  <a className="record-action" href={`https://www.openstreetmap.org/?mlat=${farm.latitude}&mlon=${farm.longitude}#map=15/${farm.latitude}/${farm.longitude}`} rel="noreferrer" target="_blank">Voir la carte ↗</a>
                ) : <span className="record-tag">GPS à compléter</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-panel" id="stocks">
          <PanelHeading eyebrow="PRODUCTION" title="Récoltes & stocks" />
          {canManage && (
          <form action={recordHarvest} className="dashboard-form compact-form">
            <input name="cooperativeId" type="hidden" value={cooperativeId} />
            <label>Culture récoltée
              <select name="cropId" required defaultValue="">
                <option disabled value="">Sélectionner une culture</option>
                {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name} — {crop.farm.name}</option>)}
              </select>
            </label>
            <div className="form-row">
              <label>Quantité (kg)<input name="quantity" min="0.1" step="0.1" type="number" required /></label>
              <label>Date<input name="date" type="date" required /></label>
            </div>
            <button className="button button-primary" disabled={!crops.length} type="submit">Enregistrer la récolte</button>
          </form>
          )}
          <div className="stock-summary">
            <strong>Stock total suivi : {numberFormat.format(stockTotal._sum.quantity ?? 0)} kg</strong>
            {stocks.map((stock) => <span key={stock.type}>{stock.type}<b>{numberFormat.format(stock._sum.quantity ?? 0)} kg</b></span>)}
          </div>
          <div className="record-list">
            {harvests.map((harvest) => (
              <div className="record-row" key={harvest.id}>
                <span>
                  <strong>{harvest.crop.name} · {numberFormat.format(harvest.quantity)} kg</strong>
                  <small>{harvest.producer.firstName} {harvest.producer.lastName} · {harvest.date.toLocaleDateString("fr-FR")}</small>
                  <Link className="text-link" href={`/tracabilite/${encodeURIComponent(harvest.batchCode)}`}>Lot {harvest.batchCode} ↗</Link>
                </span>
                {canManage && (
                  <form action={addTraceabilityEvent} className="traceability-event-form">
                    <input name="cooperativeId" type="hidden" value={cooperativeId} />
                    <input name="harvestId" type="hidden" value={harvest.id} />
                    <select aria-label="Étape de traçabilité" name="type" defaultValue="QUALITY_CHECKED">
                      <option value="QUALITY_CHECKED">Qualité vérifiée</option>
                      <option value="STORED">Stockée</option>
                      <option value="DISPATCHED">Expédiée</option>
                      <option value="RECEIVED">Reçue</option>
                    </select>
                    <input aria-label="Note de traçabilité" maxLength={300} minLength={3} name="note" placeholder="Note d’étape" required />
                    <input aria-label="Lieu (village/ville)" maxLength={80} name="location" placeholder="Lieu (facultatif)" />
                    <button className="record-action" type="submit">Ajouter étape</button>
                  </form>
                )}
              </div>
            ))}
            {!harvests.length && <p className="empty-state">Les récoltes enregistrées apparaîtront ici.</p>}
          </div>
        </div>

        <div className="dashboard-panel" id="market">
          <PanelHeading eyebrow="MARCHÉ" title="Publier une offre" />
          <p className="panel-note">L’offre sera visible publiquement. Vérifiez les disponibilités avec l’acheteur.</p>
          {canManage && (
            <form action={createMarketListing} className="dashboard-form compact-form">
              <input name="cooperativeId" type="hidden" value={cooperativeId} />
              <label>Titre de l’offre<input name="title" maxLength={100} required /></label>
              <div className="form-row">
                <label>Produit<input name="crop" maxLength={60} required /></label>
                <label>Quantité (kg)<input name="quantity" min="0.1" step="0.1" type="number" required /></label>
              </div>
              <label>Prix indicatif par kg ({cooperative.currency}, facultatif)<input name="pricePerUnit" min="1" step="1" type="number" /></label>
              <button className="button button-primary" type="submit">Publier l’offre</button>
            </form>
          )}
          <div className="record-list">
            {marketListings.map((listing) => (
              <div className="record-row" key={listing.id}>
                <span><strong>{listing.title}</strong><small>{listing.crop} · {numberFormat.format(listing.quantity)} {listing.unit}{listing.pricePerUnit !== null ? ` · ${moneyFormat.format(listing.pricePerUnit)} ${cooperative.currency}/${listing.unit}` : ""}</small></span>
                {canManage && (
                  <form action={closeMarketListing}>
                    <input name="cooperativeId" type="hidden" value={cooperativeId} />
                    <input name="listingId" type="hidden" value={listing.id} />
                    <button className="record-action" type="submit">Clôturer</button>
                  </form>
                )}
              </div>
            ))}
            {!marketListings.length && <p className="empty-state">Aucune offre active.</p>}
          </div>
        </div>

        <div className="dashboard-panel" id="prix">
          <PanelHeading eyebrow="OBSERVATOIRE" title="Déclarer un prix relevé" />
          <p className="panel-note">Saisie manuelle, pas de flux de prix en direct. Indiquez le marché et la date de l’observation.</p>
          {canManage && (
            <form action={createPriceReport} className="dashboard-form compact-form">
              <input name="cooperativeId" type="hidden" value={cooperativeId} />
              <div className="form-row">
                <label>Produit<input name="crop" required /></label>
                <label>Prix ({cooperative.currency}/kg)<input name="price" min="1" step="1" type="number" required /></label>
              </div>
              <div className="form-row">
                <label>Marché / lieu<input name="marketName" required /></label>
                <label>Date du relevé<input name="observedAt" type="date" required /></label>
              </div>
              <button className="button button-primary" type="submit">Enregistrer le relevé</button>
            </form>
          )}
          <div className="record-list">
            {priceReports.map((report) => (
              <div className="record-row" key={report.id}>
                <span><strong>{report.crop} · {moneyFormat.format(report.price)} {cooperative.currency}/{report.unit}</strong><small>{report.marketName} · relevé le {report.observedAt.toLocaleDateString("fr-FR")}</small></span>
                <span className="record-tag">Déclaré</span>
              </div>
            ))}
            {!priceReports.length && <p className="empty-state">Aucun relevé de prix pour cette coopérative.</p>}
          </div>
        </div>

        <div className="dashboard-panel">
          <PanelHeading eyebrow="COMPTABILITÉ" title="Suivi des paiements" />
          <p className="panel-note">Registre manuel uniquement : aucun argent n’est encaissé. Les essais CinetPay TMoney/Moov restent désactivés jusqu’à la configuration des identifiants sandbox.</p>
          {canManage && (
          <form action={recordPayment} className="dashboard-form compact-form">
            <input name="cooperativeId" type="hidden" value={cooperativeId} />
            <label>Producteur
              <select name="producerId" required defaultValue="">
                <option disabled value="">Sélectionner un producteur</option>
                {producers.map((producer) => <option key={producer.id} value={producer.id}>{producer.firstName} {producer.lastName}</option>)}
              </select>
            </label>
            <label>Montant ({cooperative.currency})<input name="amount" min="1" step="1" type="number" required /></label>
            <div className="form-row">
              <label>Mode de paiement
                <select name="method" defaultValue="" required>
                  <option disabled value="">Sélectionner</option>
                  <option>Espèces</option>
                  <option>TMoney (saisie manuelle)</option>
                  <option>Moov Money (saisie manuelle)</option>
                  <option>Autre Mobile Money (saisie manuelle)</option>
                </select>
              </label>
              <label>Référence / reçu<input name="reference" required /></label>
            </div>
            <button className="button button-primary" disabled={!producers.length} type="submit">Enregistrer le paiement</button>
          </form>
          )}
          <div className="record-list">
            {payments.map((payment) => (
              <div className="record-row" key={payment.id}>
                <span><strong>{payment.producer.firstName} {payment.producer.lastName} · {moneyFormat.format(payment.amount)} {cooperative.currency}</strong><small>{payment.method} · réf. {payment.reference} · {payment.createdAt.toLocaleDateString("fr-FR")}</small></span>
                <span className="record-tag">Suivi</span>
              </div>
            ))}
            {!payments.length && <p className="empty-state">Les paiements enregistrés apparaîtront ici.</p>}
          </div>
        </div>

        <div className="dashboard-panel">
          <PanelHeading eyebrow="SMS" title="Notifications de la coopérative" />
          <p className="panel-note">Les SMS sont envoyés uniquement aux producteurs ayant donné leur consentement explicite. Sans identifiants Termii, ils restent en attente et ne sont pas facturés.</p>
          <div className="record-list">
            {smsNotifications.map((notification) => (
              <div className="record-row" key={notification.id}>
                <span>
                  <strong>{smsCategoryLabel(notification.category)} · {notification.toPhone}</strong>
                  <small>{notification.message} · {notification.createdAt.toLocaleString("fr-FR")}</small>
                </span>
                <span className={`record-tag ${notification.status === "SENT" ? "status-open" : ""}`}>
                  {notification.status === "SENT" ? "Envoyé" : notification.status === "PENDING" ? "En attente" : notification.status === "CANCELLED" ? "Annulé" : "Échec"}
                </span>
              </div>
            ))}
            {!smsNotifications.length && <p className="empty-state">Aucune notification SMS.</p>}
          </div>
          <Link className="text-link" href="/notifications">Voir l’historique et les détails d’envoi ↗</Link>
        </div>
      </section>
      <footer className="dashboard-footer">
        Données réservées à votre coopérative · {getWestAfricanCountry(cooperative.countryCode)?.name ?? cooperative.countryCode} ·
        {" "}{getWestAfricanCountry(cooperative.countryCode)?.currencyName ?? cooperative.currency} ({cooperative.currency})
      </footer>
    </main>
  );
}

function DashboardHeader({
  name,
  memberships,
  activeId,
  activeRole,
}: {
  name: string;
  memberships: { role: string; cooperative: { id: string; name: string } }[];
  activeId?: string;
  activeRole?: string;
}) {
  return (
    <header className="dashboard-header">
      <Link className="brand" href="/" aria-label="ECO-FARMS Togo, accueil">
        <span className="brand-mark" aria-hidden="true">E</span>
        <span className="brand-name">ECO-<span>FARMS</span><small>TOGO</small></span>
      </Link>
      {memberships.length > 0 && (
        <details className="cooperative-switcher">
          <summary>{memberships.find(({ cooperative }) => cooperative.id === activeId)?.cooperative.name ?? "Mes coopératives"} ▾</summary>
          <div className="cooperative-switcher-menu">
            {memberships.map(({ cooperative, role }) => (
              <Link
                aria-current={cooperative.id === activeId ? "page" : undefined}
                href={`/dashboard?cooperative=${encodeURIComponent(cooperative.id)}`}
                key={cooperative.id}
              >
                {cooperative.name}<small>{role}</small>
              </Link>
            ))}
            <Link href={`/dashboard?cooperative=${encodeURIComponent(activeId ?? "")}&newCooperative=1#nouvelle-cooperative`}>
              + Nouvelle coopérative
            </Link>
          </div>
        </details>
      )}
      <span className="dashboard-account">{name}</span>
      {activeRole && <span className="dashboard-role">{activeRole}</span>}
      <LogoutButton />
    </header>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="panel-heading"><span>{eyebrow}</span><h2>{title}</h2></div>;
}

function smsCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    HARVEST: "Récolte",
    WEATHER: "Météo",
    PAYMENT: "Paiement",
    MARKET: "Marché",
  };
  return labels[category] ?? "Notification";
}

function FormNotice({ error, created }: { error?: string; created?: string }) {
  const errors: Record<string, string> = {
    "cooperative-exists": "Votre compte appartient déjà à une coopérative.",
    "cooperative-required": "Créez d’abord votre espace coopérative.",
    "unauthorized-cooperative": "Vous n’êtes pas membre de cet espace coopérative.",
    "write-access-required": "Votre rôle ne permet pas de modifier les données de cette coopérative.",
    "invalid-listing": "Vérifiez le titre, le produit et la quantité de l’offre.",
    "listing-not-found": "Cette offre n’existe plus ou a déjà été clôturée.",
    "invalid-price": "Vérifiez le produit, le marché, le prix et la date du relevé.",
    "invalid-transport": "Vérifiez le chargement, les lieux, la quantité et la date.",
    "transport-not-found": "Cette demande n’existe plus ou a déjà été clôturée.",
    "invalid-cooperative": "Vérifiez le nom et le numéro de téléphone de la coopérative.",
    "invalid-producer": "Les informations du producteur sont invalides ou hors de votre coopérative.",
    "invalid-farm": "Vérifiez les informations de la ferme et de la culture.",
    "invalid-harvest": "Indiquez une culture, une quantité positive et une date valide.",
    "invalid-crop": "La culture sélectionnée ne fait pas partie de votre coopérative.",
    "invalid-payment": "Vérifiez le montant, le mode et la référence du paiement.",
    "invalid-sms-phone": "Pour autoriser les SMS, saisissez le numéro au format international, par exemple +228XXXXXXXX.",
    "invalid-sms-consent": "Le choix de consentement SMS est invalide.",
    "invalid-traceability": "Vérifiez les informations de traçabilité.",
  };
  const messages: Record<string, string> = {
    cooperative: "Espace coopérative créé.",
    producer: "Producteur ajouté.",
    "sms-consent": "Consentement SMS enregistré.",
    "sms-consent-withdrawn": "Consentement SMS retiré; aucun nouveau message ne sera mis en file.",
    farm: "Ferme et culture ajoutées.",
    harvest: "Récolte enregistrée et stock mis à jour.",
    "harvest-sms-pending": "Récolte tracée. Le SMS reste en attente de la configuration Termii.",
    payment: "Paiement ajouté au registre de suivi.",
    "payment-sms-pending": "Paiement enregistré. Le SMS reste en attente de la configuration Termii.",
    listing: "Offre publiée sur le marché.",
    "listing-sms-pending": "Offre publiée. Les SMS consentis restent en attente de la configuration Termii.",
    "listing-sms-failed": "Offre publiée, mais un ou plusieurs SMS ont échoué. Consultez les notifications pour voir les erreurs et réessayer.",
    "listing-closed": "Offre clôturée.",
    "listing-closed-sms-pending": "Offre clôturée. Les SMS restent en attente de la configuration Termii.",
    "listing-closed-sms-failed": "Offre clôturée, mais un ou plusieurs SMS ont échoué. Consultez les notifications pour voir les erreurs et réessayer.",
    price: "Relevé de prix enregistré.",
    transport: "Demande de transport enregistrée.",
    "transport-closed": "Demande de transport terminée.",
  };
  if (error && errors[error]) return <p className="form-error form-notice" role="alert">{errors[error]}</p>;
  if (created && messages[created]) return <p className="form-success form-notice" role="status">{messages[created]}</p>;
  return null;
}
