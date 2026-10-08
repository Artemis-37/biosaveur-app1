# BIOSAVEUR · Poulet Molo Molo

Site web et applis Android / iOS de BIOSAVEUR / AGRO VIVDURABLE SARL :
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

## Applis Android et iOS

Les applis mobiles reprennent la même interface, embarquée dans l'appli (Capacitor), et dialoguent avec le serveur Render. Un seul code pour le site web, Android et iOS.

- Identifiant de l'appli : `ci.biosaveur.molomolo` · nom affiché : **BIOSAVEUR**
- Fonctions natives : caméra (scan du QR par le livreur), localisation (position de livraison du client), ouverture de Google Maps / Waze, paiement CinetPay dans le navigateur du téléphone puis retour automatique dans l'appli, bouton retour Android.
- Adresse du serveur utilisée par les applis : variable `APP_API_URL` (par défaut `https://biosaveur-app.onrender.com`). Si votre service Render a une autre adresse, définissez-la dans GitHub → **Settings → Secrets and variables → Actions → Variables** → `APP_API_URL`.

### Android

- **APK de test** : à chaque envoi sur `main`, GitHub compile l'appli (onglet **Actions → Appli Android → Artifacts**). Le fichier `.apk` s'installe directement sur un téléphone (autoriser « sources inconnues »).
- **Play Store** : créer une clé de signature une seule fois et la garder précieusement :
  ```bash
  keytool -genkey -v -keystore biosaveur.keystore -alias biosaveur -keyalg RSA -keysize 2048 -validity 10000
  base64 -w0 biosaveur.keystore   # à copier dans le secret ANDROID_KEYSTORE_BASE64
  ```
  Puis ajouter dans GitHub → **Settings → Secrets → Actions** : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`biosaveur`), `ANDROID_KEY_PASSWORD`. La compilation suivante produit le fichier `.aab` à envoyer sur la [Play Console](https://play.google.com/console) (compte développeur Google : 25 $ une fois).
- En local : `npm run app:android` ouvre le projet dans Android Studio ; `npm run app:apk` compile un APK.

### iOS

Apple impose un Mac avec Xcode et un compte Apple Developer (99 $/an) pour publier.

1. Sur un Mac : `npm install` puis `npm run app:ios` (ouvre Xcode).
2. Dans Xcode : **Signing & Capabilities** → choisir votre équipe Apple, puis **Product → Archive** → **Distribute App** → App Store Connect.
3. Sur [App Store Connect](https://appstoreconnect.apple.com) : fiche de l'appli, captures d'écran, puis envoi en vérification (TestFlight possible avant).

Le workflow GitHub **Appli iOS** (à lancer depuis l'onglet Actions) vérifie que le projet iOS compile sur un Mac fourni par GitHub.

### Mettre à jour les applis

Les écrans font partie de l'appli : après une modification de l'interface (`public/`), il faut publier une nouvelle version sur les stores. Les changements côté serveur (prix, produits, règles) sont pris en compte immédiatement, sans mise à jour.

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
