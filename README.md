# Agriflow Africa

Agriflow est un SaaS agricole multi-tenant destiné aux coopératives d'Afrique
de l'Ouest. Le Togo est le premier pays de lancement ; chaque espace
coopérative sélectionne son pays et reçoit sa devise locale.

## Démarrage

Copiez `.env.example` vers `.env`, configurez PostgreSQL, `BETTER_AUTH_URL`
et un `BETTER_AUTH_SECRET` aléatoire (32 caractères minimum en production).
Ne versionnez jamais `.env`.

```bash
npm install
npm run db:validate
npm run db:generate
npm run db:migrate
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000), puis « Ouvrir mon
espace » pour créer un compte et enregistrer une coopérative.

## Périmètre actuel

- Authentification par e-mail/mot de passe et espace privé.
- Données métier isolées par coopérative, avec comptes multi-coopératives et
  rôles par équipe.
- Invitations d'équipe par lien à usage unique, valable sept jours.
- Gestion de base des coopératives, producteurs, fermes, cultures, récoltes,
  stocks et suivi comptable des paiements (aucun encaissement).
- Publication et clôture d'offres de coopératives, annuaire d'offres et
  contact direct par téléphone.
- Relevés de prix déclarés avec lieu/date (pas de flux direct vérifié).
- Demandes de transport internes à la coopérative avec statut ouvert/terminé.
- Rappels de calendrier basés sur les dates de récolte saisies ; pas de
  prédiction IA ni d'avis agronomique.
- Sélection du pays parmi les 16 pays d'Afrique de l'Ouest définis dans
  `lib/west-africa.ts`, avec devise assignée côté serveur.
- Flux de prix automatisé, réservation de transporteurs, intelligence
  artificielle et facturation SaaS automatisée : non intégrés (pilote sans
  encaissement).

## Ouverture publique

### Déploiement d'essai sur Render

Le Blueprint `render.yaml` décrit un service Next.js gratuit dans la région
de Francfort. Reliez le dépôt Git contenant ce projet à Render et appliquez le
Blueprint. Renseignez `DATABASE_URL` dans les variables secrètes Render avec
l'URL PostgreSQL Neon directe. Render génère `BETTER_AUTH_SECRET` ; l'URL
publique est détectée via `RENDER_EXTERNAL_URL`.

Le build applique les migrations avant la compilation. Toute nouvelle migration
sera donc appliquée au prochain build/déploiement. La formule gratuite peut
mettre le service en veille et ne convient pas à une mise en production SaaS
avec disponibilité garantie.

Avant une ouverture publique, vérifier les secrets et l'URL HTTPS, configurer
un fournisseur d'e-mail pour la vérification de compte et la récupération de
mot de passe, puis préparer les politiques de confidentialité et les contrôles
adaptés aux pays desservis. En attendant l'e-mail transactionnel, transmettez
les liens d'invitation générés par un canal privé uniquement aux destinataires.

## Vérifications

```bash
npm run lint
npm run test:security
npm run db:validate
npm run build
```
