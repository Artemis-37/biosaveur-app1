'use strict';
// Espace client : profil, commandes, cotisation, parrainage, messages, notifications.
const express = require('express');
const QRCode = require('qrcode');
const { saveImage } = require('../images');
const { loyalty, newQrToken } = require('../loyalty');
const config = require('../config');
const db = require('../db');
const services = require('../services');
const { need, hash, check } = require('../auth');
const { h, bad, notFound, str, num, int, DAYS, fcfa } = require('../util');
const { publicUser, COMMUNES } = require('./public');

const r = express.Router();
r.use(need('client', 'admin'));

r.get('/me', h(async (req, res) => res.json(publicUser(req.user))));

r.put('/me', h(async (req, res) => {
  const b = req.body;
  const name = str(b.name, 80) || req.user.name;
  const commune = COMMUNES.includes(b.commune) ? b.commune : req.user.commune;
  const address = str(b.address, 200);
  const landmark = str(b.landmark, 200);
  let lat = num(b.lat);
  let lng = num(b.lng);
  // Grand Abidjan seulement
  if (lat !== null && (lat < 5.1 || lat > 5.7 || lng === null || lng < -4.4 || lng > -3.6)) throw bad('Position hors de la zone de livraison (Grand Abidjan).');
  if (lat === null || lng === null) { lat = null; lng = null; }
  const email = b.email === undefined ? (req.user.email || '') : str(b.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Adresse e-mail invalide.');
  if (email && await db.one('SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2', [email, req.user.id])) throw bad('Cet e-mail est déjà utilisé.');
  const u = await db.one(
    'UPDATE users SET name=$2, commune=$3, address=$4, landmark=$5, lat=$6, lng=$7, email=$8 WHERE id=$1 RETURNING *',
    [req.user.id, name, commune, address, landmark, lat, lng, email || null]
  );
  res.json(publicUser(u));
}));

// Photo de profil (compressée côté navigateur).
r.put('/me/avatar', h(async (req, res) => {
  const url = await saveImage(req.body.data, req.user.id, 300);
  const u = await db.one('UPDATE users SET avatar_url=$2 WHERE id=$1 RETURNING *', [req.user.id, url]);
  res.json(publicUser(u));
}));
r.delete('/me/avatar', h(async (req, res) => {
  const u = await db.one("UPDATE users SET avatar_url='' WHERE id=$1 RETURNING *", [req.user.id]);
  res.json(publicUser(u));
}));

// QR code personnel : permet de se connecter sans saisir le mot de passe. Il peut être remplacé à tout moment.
async function qrOf(user, regen) {
  let t = user.qr_token;
  if (!t || regen) { t = newQrToken(); await db.query('UPDATE users SET qr_token=$2 WHERE id=$1', [user.id, t]); }
  return { token: t, svg: await QRCode.toString(`BSVQ:${t}`, { type: 'svg', margin: 1, color: { dark: '#103d3a', light: '#ffffff' } }) };
}
r.get('/me/qr', h(async (req, res) => res.json(await qrOf(req.user, false))));
r.post('/me/qr/regenerate', h(async (req, res) => res.json(await qrOf(req.user, true))));

// --- notifications push navigateur ---
r.get('/push/key', h(async (req, res) => res.json({ key: await require('../push').publicKey() })));
r.post('/push/subscribe', h(async (req, res) => {
  const s = req.body.subscription || {};
  if (!/^https:\/\//.test(s.endpoint || '') || !s.keys || !s.keys.p256dh || !s.keys.auth) throw bad('Abonnement invalide.');
  await db.query(`INSERT INTO push_subs(user_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4)
    ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4`, [req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth]);
  res.json({ ok: true });
}));
r.post('/push/unsubscribe', h(async (req, res) => {
  await db.query('DELETE FROM push_subs WHERE user_id=$1 AND endpoint=$2', [req.user.id, String(req.body.endpoint || '')]);
  res.json({ ok: true });
}));

r.get('/loyalty', h(async (req, res) => res.json(await loyalty(req.user.id))));

r.put('/me/password', h(async (req, res) => {
  const { current, next } = req.body;
  if (!(await check(String(current || ''), req.user.password_hash))) throw bad('Mot de passe actuel incorrect.');
  if (String(next || '').length < 6) throw bad('Le nouveau mot de passe doit faire au moins 6 caractères.');
  await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await hash(String(next))]);
  res.json({ ok: true });
}));

// --- commandes ---
r.get('/orders', h(async (req, res) => {
  const rows = await db.many("SELECT * FROM orders WHERE user_id=$1 AND (status <> 'attente_paiement' OR created_at > now() - interval '1 hour') ORDER BY created_at DESC LIMIT 50", [req.user.id]);
  for (const o of rows) await services.orderWithItems(o);
  res.json(rows);
}));

r.post('/orders', h(async (req, res) => {
  const out = await services.createOrder(req.user, req.body, req.get('X-Client') === 'app');
  res.json({ order: await services.orderWithItems(out.order), payment_url: out.payment_url || null, transaction_id: out.transaction_id || null });
}));

r.get('/orders/:id', h(async (req, res) => {
  const o = await db.one('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [int(req.params.id), req.user.id]);
  if (!o) throw notFound('Commande introuvable.');
  await services.orderWithItems(o);
  o.qr_svg = await QRCode.toString(o.qr_code, { type: 'svg', margin: 1, color: { dark: '#17211f', light: '#ffffff' } });
  const pay = await db.one("SELECT transaction_id,status FROM payments WHERE purpose='commande' AND ref_id=$1 ORDER BY id DESC LIMIT 1", [o.id]);
  o.payment = pay;
  res.json(o);
}));

// --- cotisation ---
async function currentCot(uid) {
  return db.one("SELECT * FROM cotisations WHERE user_id=$1 AND status IN ('active','complete') ORDER BY id DESC LIMIT 1", [uid]);
}

r.get('/cotisation', h(async (req, res) => {
  const cot = await currentCot(req.user.id);
  let history = [];
  if (cot) {
    history = await db.many(
      `SELECT p.amount, p.method, p.created_at FROM cotisation_payments p JOIN cotisations c ON c.id=p.cotisation_id
       WHERE c.user_id=$1 ORDER BY p.created_at DESC LIMIT 50`, [req.user.id]);
  }
  const done = await db.one("SELECT count(*)::int AS n FROM cotisations WHERE user_id=$1 AND status='livree'", [req.user.id]);
  res.json({ cotisation: cot ? { ...cot, target: services.cotTarget(cot) } : null, history, completed: done.n });
}));

r.post('/cotisation', h(async (req, res) => {
  if (await currentCot(req.user.id)) throw bad('Vous avez déjà une cotisation en cours.');
  const chickens = int(req.body.chickens);
  if (chickens < 1 || chickens > 100) throw bad('Objectif entre 1 et 100 poulets.');
  const day = DAYS.includes(req.body.delivery_day) ? req.body.delivery_day : 'Samedi';
  const c = await db.one('INSERT INTO cotisations(user_id,chickens,unit_price,delivery_day,auto_renew) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, chickens, config.shop.chickenPrice, day, req.body.auto_renew !== false]);
  res.json(c);
}));

r.put('/cotisation', h(async (req, res) => {
  const cot = await currentCot(req.user.id);
  if (!cot) throw notFound('Aucune cotisation en cours.');
  const day = DAYS.includes(req.body.delivery_day) ? req.body.delivery_day : cot.delivery_day;
  const auto = typeof req.body.auto_renew === 'boolean' ? req.body.auto_renew : cot.auto_renew;
  res.json(await db.one('UPDATE cotisations SET delivery_day=$2, auto_renew=$3 WHERE id=$1 RETURNING *', [cot.id, day, auto]));
}));

r.post('/cotisation/versement', h(async (req, res) => {
  const cot = await currentCot(req.user.id);
  if (!cot || cot.status !== 'active') throw bad('Aucune cotisation à compléter.');
  const rest = services.cotTarget(cot) - cot.paid;
  const amount = Math.min(int(req.body.amount), rest);
  if (amount < 500) throw bad('Montant minimum : 500 FCFA.');
  if (req.body.method === 'especes') {
    await db.query('INSERT INTO messages(user_id,from_team,body) VALUES ($1,false,$2)',
      [req.user.id, `Je souhaite verser ${fcfa(amount)} en espèces pour ma cotisation.`]);
    return res.json({ cash: true });
  }
  if (!(await services.onlinePaymentEnabled())) throw bad('Le paiement en ligne n’est pas encore disponible. Choisissez le versement en espèces.');
  const pay = await services.startPayment(req.user, 'versement', cot.id, amount, `Versement cotisation BIOSAVEUR`, req.get('X-Client') === 'app');
  res.json({ payment_url: pay.payment_url, transaction_id: pay.transaction_id });
}));

r.post('/cotisation/livrer', h(async (req, res) => {
  const cot = await currentCot(req.user.id);
  if (!cot) throw notFound('Aucune cotisation en cours.');
  const o = await services.deliverCotisation(req.user, cot.id, str(req.body.day, 10), str(req.body.slot, 20));
  res.json(o);
}));

r.post('/points/convert', h(async (req, res) => {
  const out = await db.tx(async (c) => {
    const u = (await c.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
    if (u.points < 100) throw bad('Il faut au moins 100 points.');
    const cot = (await c.query("SELECT id FROM cotisations WHERE user_id=$1 AND status='active' ORDER BY id DESC LIMIT 1", [req.user.id])).rows[0];
    if (!cot) throw bad('Créez d’abord une cotisation pour y verser vos points.');
    await c.query('UPDATE users SET points=0 WHERE id=$1', [req.user.id]);
    await services.addCotisationPayment(cot.id, u.points, 'Points de parrainage', '', req.user.id, c);
    return u.points;
  });
  res.json({ converted: out });
}));

r.get('/referrals', h(async (req, res) => {
  const n = await db.one('SELECT count(*)::int AS n FROM users WHERE referred_by=$1', [req.user.id]);
  res.json({ code: req.user.referral_code, points: req.user.points, count: n.n });
}));

// --- messages & notifications ---
r.get('/messages', h(async (req, res) => {
  await db.query('UPDATE messages SET read=true WHERE user_id=$1 AND from_team AND NOT read', [req.user.id]);
  res.json(await db.many('SELECT id, from_team, body, created_at FROM messages WHERE user_id=$1 ORDER BY created_at LIMIT 200', [req.user.id]));
}));

r.post('/messages', h(async (req, res) => {
  const body = str(req.body.body, 1000);
  if (!body) throw bad('Message vide.');
  res.json(await db.one('INSERT INTO messages(user_id,from_team,author_id,body) VALUES ($1,false,$1,$2) RETURNING id, from_team, body, created_at', [req.user.id, body]));
}));

r.get('/notifications', h(async (req, res) => {
  res.json(await db.many('SELECT id, body, read, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]));
}));

r.post('/notifications/read', h(async (req, res) => {
  await db.query('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
}));

r.get('/badges', h(async (req, res) => {
  const [n, m] = await Promise.all([
    db.one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT read', [req.user.id]),
    db.one('SELECT count(*)::int AS n FROM messages WHERE user_id=$1 AND from_team AND NOT read', [req.user.id]),
  ]);
  res.json({ notifications: n.n, messages: m.n });
}));

// état d'un paiement (après retour du guichet)
r.get('/payments/:tx', h(async (req, res) => {
  const p = await db.one('SELECT * FROM payments WHERE transaction_id=$1 AND user_id=$2', [str(req.params.tx, 60), req.user.id]);
  if (!p) throw notFound('Transaction introuvable.');
  const s = await services.syncPayment(p.transaction_id);
  res.json({ transaction_id: s.transaction_id, status: s.status, purpose: s.purpose, ref_id: s.ref_id, amount: s.amount });
}));

module.exports = r;
