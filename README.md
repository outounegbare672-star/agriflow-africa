# ECO-FARMS Togo

ECO-FARMS Togo est un SaaS agricole multi-tenant destiné aux coopératives d'Afrique
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
  filtres par produit/pays et contact direct par téléphone.
- Relevés de prix déclarés avec lieu/date (pas de flux direct vérifié).
- Coordonnées GPS des parcelles capturées avec consentement du navigateur,
  carte OpenStreetMap et prévisions Open-Meteo à trois jours, chargées à la
  demande.
- Statistiques régionales privées et agrégées, affichées à partir de trois
  coopératives participantes et sans noms de producteurs ou de fermes.
- Traçabilité par code public de lot et événements de récolte, stockage,
  expédition et réception ; les coordonnées GPS et les identités ne sont pas
  publiées.
- Notifications SMS avec consentement explicite, journal d'envoi et tentatives
  relançables. Sans identifiants Termii, les alertes restent en attente.
- Recommandations agricoles OpenAI facultatives, limitées à cinq demandes par
  jour et par compte. Seules la culture, le pays, les dates et la météo sont
  transmis ; les noms, coordonnées GPS et numéros de téléphone ne le sont pas.
- Assistant de questions agricoles ECO-FARMS IA facultatif, propulsé par
  Gemini. Les questions et les six derniers messages de la conversation sont
  envoyés au fournisseur ; cinq demandes IA par jour et par compte, partagées
  avec les recommandations de culture.
- Parcours Mobile Money CinetPay limité au sandbox : aucun paiement réel, aucune
  vente confirmée et aucun reversement n'est pris en charge.
- Demandes de transport internes à la coopérative avec statut ouvert/terminé.
- Rappels de calendrier basés sur les dates de récolte saisies ; pas de
  prédiction de rendement ni de diagnostic agronomique.
- Sélection du pays parmi les 16 pays d'Afrique de l'Ouest définis dans
  `lib/west-africa.ts`, avec devise assignée côté serveur.
- Flux de prix automatisé, réservation de transporteurs, paiements Mobile
  Money réels et facturation SaaS automatisée : non intégrés.

## Ouverture publique

### Déploiement d'essai sur Render

Le Blueprint `render.yaml` décrit un service Next.js gratuit et une base
PostgreSQL gratuite dans la région de Francfort. La base Render gratuite est
limitée à 1 Go et expire après 30 jours ; elle ne convient qu'aux essais. Le
Blueprint utilise la connexion interne à cette base. Render génère
`BETTER_AUTH_SECRET` ; l'URL publique est détectée via `RENDER_EXTERNAL_URL`.

Le build applique les migrations avant la compilation. Toute nouvelle migration
sera donc appliquée au prochain build/déploiement. La formule gratuite peut
mettre le service en veille et ne convient pas à une mise en production SaaS
avec disponibilité garantie.

Avant une ouverture publique, vérifier les secrets et l'URL HTTPS, configurer
un fournisseur d'e-mail pour la vérification de compte et la récupération de
mot de passe, puis préparer les politiques de confidentialité et les contrôles
adaptés aux pays desservis. En attendant l'e-mail transactionnel, transmettez
les liens d'invitation générés par un canal privé uniquement aux destinataires.

### Services externes facultatifs

Les clés doivent être enregistrées dans les variables secrètes Render (ou dans
`.env` en local, jamais dans Git) :

- `OPENAI_API_KEY` active les recommandations générées. L'usage de l'API peut
  être facturé par OpenAI. Les recommandations sont indicatives et ne prescrivent
  aucun produit chimique ni dosage.
- `GEMINI_API_KEY` active l’assistant de questions agricoles. L'usage de l'API
  peut être facturé par Google. Le secret reste côté serveur ; les questions
  envoyées à l’assistant sont traitées par Google Gemini.
- `TERMII_API_KEY`, `TERMII_SENDER_ID` et éventuellement `TERMII_BASE_URL`
  activent les SMS. Le compte doit autoriser l'expéditeur et disposer de crédit.
  Seuls les producteurs ayant consenti reçoivent des messages ; les erreurs
  d'envoi sont visibles et les échecs peuvent être relancés.
- `CINETPAY_MODE=sandbox`, `CINETPAY_SANDBOX_API_KEY` et
  `CINETPAY_SANDBOX_SITE_ID` activent uniquement les paiements de test. Utilisez
  exclusivement les identifiants de test dédiés. Les méthodes TMoney/Moov
  dépendent du compte CinetPay de test. Ne configurez pas de clés de production :
  le mode réel n'est volontairement pas pris en charge.

Open‑Meteo fournit les prévisions sans clé API. Les coordonnées d'une parcelle ne
sont transmises au service météo qu'après une action explicite dans l'interface.
La page de traçabilité publique affiche le lot, la coopérative, le pays et les
événements déclarés, mais pas l'identité du producteur ni la position précise.

## Vérifications

```bash
npm run lint
npm run test:security
npm run db:validate
npm run build
```
