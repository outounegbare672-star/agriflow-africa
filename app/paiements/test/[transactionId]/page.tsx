import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { refreshCinetPayCheckout } from "@/lib/cinetpay";
import { getPrisma } from "@/lib/prisma";
import { ModuleHeader } from "@/app/marche/page";

export const metadata: Metadata = {
  title: "Résultat du paiement test — Agriflow Africa",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function SandboxPaymentPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  await connection();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");
  const { transactionId } = await params;
  if (!/^AGR-[a-f0-9-]{36}$/i.test(transactionId)) notFound();

  const prisma = getPrisma();
  let checkout = await prisma.mobileMoneyCheckout.findFirst({
    where: { transactionId, buyerId: session.user.id },
    select: {
      transactionId: true,
      amount: true,
      currency: true,
      status: true,
      marketListing: { select: { title: true } },
      cooperative: { select: { name: true } },
    },
  });
  if (!checkout) notFound();

  let verificationError = "";
  if (checkout.status === "PENDING" && process.env.CINETPAY_MODE === "sandbox") {
    try {
      await refreshCinetPayCheckout(transactionId);
      checkout = await prisma.mobileMoneyCheckout.findFirstOrThrow({
        where: { transactionId, buyerId: session.user.id },
        select: {
          transactionId: true,
          amount: true,
          currency: true,
          status: true,
          marketListing: { select: { title: true } },
          cooperative: { select: { name: true } },
        },
      });
    } catch (error) {
      verificationError = error instanceof Error ? error.message : "Le statut du paiement n’a pas pu être vérifié.";
    }
  }

  return (
    <main className="public-module">
      <ModuleHeader />
      <section className="module-hero">
        <p className="eyebrow eyebrow-dark"><span /> PAIEMENT MOBILE MONEY · MODE TEST</p>
        <h1>{checkout.status === "PAID" ? "Paiement test accepté." : checkout.status === "FAILED" ? "Paiement test non abouti." : "Paiement test en attente."}</h1>
        <p>Transaction {checkout.transactionId} · offre « {checkout.marketListing.title} » · {checkout.cooperative.name}.</p>
      </section>
      <section className="traceability-summary">
        <article><span>Montant de test</span><strong>{new Intl.NumberFormat("fr-FR").format(checkout.amount)} {checkout.currency}</strong></article>
        <article><span>Statut vérifié côté serveur</span><strong>{statusLabel(checkout.status)}</strong></article>
        <article><span>Mode</span><strong>Sandbox uniquement</strong></article>
      </section>
      {verificationError && <p className="form-error" role="alert">{verificationError}</p>}
      {checkout.status === "PAID" && <p className="form-success">Accepté par le compte de test CinetPay. Aucun argent réel n’a été encaissé et aucune vente n’est confirmée.</p>}
      {checkout.status === "PENDING" && <p className="form-notice">Si tu viens de terminer le parcours CinetPay, recharge cette page pour vérifier le statut auprès du fournisseur.</p>}
      <Link className="button button-primary" href="/marche">Retour au marché</Link>
      <p className="module-disclaimer">TMoney/Moov Money ne sont proposés que si les méthodes sont activées dans le compte marchand de test. Les paiements réels sont désactivés et ne sont pas pris en charge par ce parcours.</p>
    </main>
  );
}

function statusLabel(status: string) {
  return status === "PAID" ? "Accepté en sandbox (non réel)"
    : status === "FAILED" ? "Échec / refusé"
      : status === "PENDING" ? "En attente de confirmation"
        : "Initialisation";
}
