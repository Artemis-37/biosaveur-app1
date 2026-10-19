'use strict';
// Notifications push navigateur (Web Push, clés VAPID).
const webpush = require('web-push');
const db = require('./db');

// Firebase Cloud Messaging (appli Android) : compte de service dans FIREBASE_SERVICE_ACCOUNT (JSON ou JSON en base64).
let fcm = null;
function fcmInit() {
  if (fcm !== null) return fcm;
  fcm = false;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return fcm;
  try {
    const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    const admin = require('firebase-admin');
    const app = admin.initializeApp({ credential: admin.credential.cert(json) }, 'biosaveur');
    fcm = admin.messaging(app);
  } catch (e) { console.error('[push] FIREBASE_SERVICE_ACCOUNT invalide :', e.message); }
  return fcm;
}

let ready = null;
async function init() {
  if (ready) return ready;
  ready = (async () => {
    let pub = process.env.VAPID_PUBLIC_KEY || await db.getSetting('vapid_public_key', '');
    let priv = process.env.VAPID_PRIVATE_KEY || await db.getSetting('vapid_private_key', '');
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      await db.setSetting('vapid_public_key', pub);
      await db.setSetting('vapid_private_key', priv);
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contact@biosaveur.ci', pub, priv);
    return pub;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

async function publicKey() { return init(); }

// Envoi « au mieux » : n'échoue jamais et ne bloque pas l'action qui a déclenché la notification.
async function sendPush(userId, body) {
  try {
    await init();
    const m = fcmInit();
    if (m) {
      const devs = await db.many('SELECT id, token FROM device_tokens WHERE user_id=$1', [userId]);
      for (const d of devs) {
        try {
          await m.send({ token: d.token, notification: { title: 'BIOSAVEUR', body }, android: { priority: 'high', notification: { channelId: 'default' } } });
        } catch (e) {
          if (/registration-token-not-registered|invalid-argument|invalid-registration-token/.test(e.code || '')) await db.query('DELETE FROM device_tokens WHERE id=$1', [d.id]);
        }
      }
    }
    const subs = await db.many('SELECT * FROM push_subs WHERE user_id=$1', [userId]);
    const payload = JSON.stringify({ title: 'BIOSAVEUR', body });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await db.query('DELETE FROM push_subs WHERE id=$1', [s.id]);
      }
    }
  } catch (e) { /* push indisponible : la notification reste visible dans l'appli */ }
}
module.exports = { publicKey, sendPush, fcmConfigured: () => !!fcmInit() };
