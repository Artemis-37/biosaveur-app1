'use strict';
// Notifications push navigateur (Web Push, clés VAPID).
const webpush = require('web-push');
const db = require('./db');

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
module.exports = { publicKey, sendPush };
