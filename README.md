# BIOSAVEUR · Poulet Molo Molo

Application web (mobile et ordinateur) de BIOSAVEUR / AGRO VIVDURABLE SARL :
boutique de poulet halal et traçable, cotisation poulet, livraisons suivies sur carte et confirmées par QR code.

## Ce que fait l'application

| Espace | Fonctions |
|---|---|
| **Client** | Boutique (catégories, recherche, offres flash, fiches produit avec traçabilité), panier, choix du jour et du créneau, paiement à la livraison / par cotisation / en ligne CinetPay, QR code de commande, suivi en 4 étapes, cotisation (objectif, versements, renouvellement automatique, programmation de la livraison), parrainage avec points convertibles, messagerie avec l'équipe, notifications, position de livraison sur carte. |
| **Livreur** | Tournée du jour sur carte avec ordre de passage, distance et temps estimés, navigation Google Maps / Waze vers la position GPS exacte du client, départ en livraison, confirmation de remise en scannant le QR du client (caméra) ou en saisissant son code. |
| **Administrateur** | Vue d'ensemble (indicateurs, graphique de collecte, alertes), commandes et livraisons (statuts, attribution des livreurs, carte du jour), clients (actifs / inactifs, relance), cotisations et saisie des versements, produits et stock, messagerie, équipe (comptes livreurs et admins), réglages CinetPay, journal des actions. |

Technique : Node.js 20+, Express, PostgreSQL, interface sans framework (HTML/CSS/JS), cartes Leaflet sur fonds OpenStreetMap / CARTO.

## Lancer en local

```bash
cp .env.example .env          # puis adapter DATABASE_URL
npm install
SEED_DEMO=true npm run dev    # http://localhost:3000
```

La base est créée automatiquement au démarrage. Avec `SEED_DEMO=true`, des comptes d'exemple sont créés :

| Rôle | Téléphone | Mot de passe |
|---|---|---|
| Client | 07 00 00 00 01 | demo1234 |
| Livreur | 07 00 00 00 02 | demo1234 |
| Admin | 07 00 00 00 00 | admin1234 (si `ADMIN_PHONE` n'est pas défini) |

Tests : `DATABASE_URL=postgres://…/biosaveur_test npm test`

## Déployer sur Render

1. Sur [render.com](https://render.com) : **New → Blueprint**, choisir ce dépôt. Render lit `render.yaml` et crée le service web et la base PostgreSQL.
2. Renseigner `ADMIN_PHONE` et `ADMIN_PASSWORD` : ce sera votre compte administrateur.
3. Après le déploiement, connectez-vous avec ce compte, puis créez les comptes livreurs dans **Admin → Équipe**.
4. Dans **Admin → Produits & stock**, mettez vos vrais prix, stocks, photos (lien https) et informations de traçabilité.
5. Réglez `DEPOT_LAT` / `DEPOT_LNG` sur la position réelle de l'entrepôt (départ des tournées).

> La base PostgreSQL gratuite de Render est limitée dans le temps. Pour la production, passez la base sur une offre payante afin de ne pas perdre de données.

## Activer CinetPay

Tant que les clés ne sont pas renseignées, le paiement en ligne est **masqué** en production (et simulé en développement). Les clients paient à la livraison ou par cotisation.

1. Dans Render → service → **Environment**, ajouter `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY`.
2. Dans le back-office CinetPay, déclarer l'URL de notification : `https://<votre-app>.onrender.com/api/cinetpay/notify`.
3. Dans **Admin → Paiement CinetPay**, lancer la transaction de test (100 FCFA), puis activer l'interrupteur.

Fonctionnement : la commande est créée « en attente de paiement » (stock réservé), le client est envoyé vers le guichet CinetPay, et la commande n'est confirmée que lorsque le serveur a vérifié la transaction auprès de l'API CinetPay (`/payment/check`). Un paiement refusé annule la commande et rend le stock ; une commande non payée sous 1 heure est annulée automatiquement.

## Sécurité

- Mots de passe hachés (bcrypt), session dans un cookie `httpOnly`.
- Accès vérifiés côté serveur selon le rôle (client, livreur, admin).
- Prix, stock et totaux toujours recalculés côté serveur.
- Les clés CinetPay restent dans les variables d'environnement, jamais dans le navigateur.
- Remise d'une commande possible uniquement avec le bon code QR.
