'use strict';
// Espace administrateur.
const express = require('express');
const config = require('../config');
const db = require('../db');
const cinetpay = require('../cinetpay');
const services = require('../services');
const { need, hash } = require('../auth');
const { ensureUser } = require('../seed');
const { h, bad, notFound, int, str, normPhone, notify, audit, fcfa } = require('../util');

const CATS = ['entier', 'decoupes', 'packs', 'fume', 'abats', 'evenements'];

const r = express.Router();
r.use(need('admin'));

r.get('/overview', h(async (req, res) => {
  const k = await db.one(`SELECT
    (SELECT count(*) FROM users WHERE role='client')::int AS clients,
    (SELECT count(*) FROM cotisations WHERE status='active')::int AS cot_actives,
    (SELECT count(*) FROM cotisations WHERE status='complete')::int AS cot_completes,
    (SELECT coalesce(sum(amount),0) FROM cotisation_payments)::int AS collecte,
    (SELECT count(DISTINCT user_id) FROM messages m WHERE NOT from_team AND NOT read)::int AS threads_non_lus,
    (SELECT count(*) FROM orders WHERE status='livree')::int AS livrees,
    (SELECT count(*) FROM orders WHERE status='confirmee')::int AS a_preparer,
    (SELECT count(*) FROM users WHERE role='client' AND last_active < now() - interval '30 days')::int AS inactifs,
    (SELECT coalesce(sum(total),0) FROM orders WHERE paid AND status <> 'annulee' AND created_at > date_trunc('month', now()))::int AS ventes_mois`);
  const low = await db.many('SELECT id,name,stock,threshold FROM products WHERE visible AND stock <= threshold ORDER BY stock');
  const months = await db.many(`
    SELECT to_char(m, 'YYYY-MM') AS month,
      coalesce((SELECT sum(amount) FROM cotisation_payments p WHERE date_trunc('month', p.created_at)=m),0)::int AS cotisations,
      coalesce((SELECT sum(total) FROM orders o WHERE o.paid AND o.kind='commande' AND o.status <> 'annulee' AND date_trunc('month', o.created_at)=m),0)::int AS ventes
    FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
    ORDER BY m`);
  const objectif = int(await db.getSetting('objectif_mensuel', '0'));
  const recent = await db.many(`SELECT o.id,o.number,o.kind,o.day,o.slot,o.status,o.total,o.paid,o.pay_method,u.name AS client_name,o.commune
    FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status <> 'attente_paiement' ORDER BY o.created_at DESC LIMIT 6`);
  for (const o of recent) await services.orderWithItems(o);
  res.json({ kpis: k, low, months, objectif, recent });
}));

r.put('/settings', h(async (req, res) => {
  if (req.body.objectif_mensuel !== undefined) await db.setSetting('objectif_mensuel', Math.max(0, int(req.body.objectif_mensuel)));
  res.json({ ok: true });
}));

// --- clients ---
r.get('/clients', h(async (req, res) => {
  const f = req.query.filter;
  const where = ["u.role='client'"];
  if (f === 'inactifs') where.push("u.last_active < now() - interval '30 days'");
  if (f === 'actifs') where.push("u.last_active >= now() - interval '30 days'");
  const params = [];
  if (req.query.q) { params.push(`%${str(req.query.q, 60)}%`); where.push(`(u.name ILIKE $1 OR u.phone LIKE $1 OR u.commune ILIKE $1)`); }
  res.json(await db.many(`
    SELECT u.id,u.name,u.phone,u.commune,u.address,u.landmark,u.lat,u.lng,u.referral_code,u.points,u.created_at,u.last_active,u.active,
      c.chickens, c.paid, c.unit_price, c.status AS cot_status,
      (SELECT count(*) FROM orders o WHERE o.user_id=u.id AND o.status='livree')::int AS livraisons
    FROM users u
    LEFT JOIN LATERAL (SELECT * FROM cotisations WHERE user_id=u.id ORDER BY id DESC LIMIT 1) c ON true
    WHERE ${where.join(' AND ')} ORDER BY u.last_active DESC LIMIT 500`, params));
}));

r.post('/clients/:id/relance', h(async (req, res) => {
  const u = await db.one("SELECT * FROM users WHERE id=$1 AND role='client'", [int(req.params.id)]);
  if (!u) throw notFound('Client introuvable.');
  const body = str(req.body.body, 1000) || `Bonjour ${u.name.split(' ')[0]}, vous nous manquez ! Votre cotisation BIOSAVEUR vous attend, et le poulet du jour est en offre flash.`;
  await db.query('INSERT INTO messages(user_id,from_team,author_id,body) VALUES ($1,true,$2,$3)', [u.id, req.user.id, body]);
  await notify(u.id, 'Nouveau message de l’équipe BIOSAVEUR.');
  res.json({ ok: true });
}));

r.put('/users/:id/active', h(async (req, res) => {
  const id = int(req.params.id);
  if (id === req.user.id) throw bad('Vous ne pouvez pas désactiver votre propre compte.');
  await db.query('UPDATE users SET active=$2 WHERE id=$1', [id, !!req.body.active]);
  await audit(req.user.id, req.body.active ? 'compte réactivé' : 'compte désactivé', String(id));
  res.json({ ok: true });
}));

// --- équipe (livreurs, admins) ---
r.get('/staff', h(async (req, res) => {
  res.json(await db.many("SELECT id,role,name,phone,active,created_at,last_active FROM users WHERE role IN ('livreur','admin') ORDER BY role, name"));
}));

r.post('/staff', h(async (req, res) => {
  const role = req.body.role === 'admin' ? 'admin' : 'livreur';
  const name = str(req.body.name, 80);
  const phone = normPhone(req.body.phone);
  const password = String(req.body.password || '');
  if (name.length < 2 || !/^\d{10}$/.test(phone) || password.length < 6) throw bad('Nom, téléphone (10 chiffres) et mot de passe (6 caractères min.) sont obligatoires.');
  if (await db.one('SELECT 1 FROM users WHERE phone=$1', [phone])) throw bad('Ce numéro a déjà un compte.');
  const id = await ensureUser({ role, name, phone, password });
  await audit(req.user.id, 'compte équipe créé', `${role} ${phone}`);
  res.json({ id });
}));

r.put('/staff/:id/password', h(async (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 6) throw bad('Mot de passe trop court.');
  await db.query("UPDATE users SET password_hash=$2 WHERE id=$1 AND role IN ('livreur','admin')", [int(req.params.id), await hash(pw)]);
  res.json({ ok: true });
}));

// --- cotisations ---
r.get('/cotisations', h(async (req, res) => {
  res.json(await db.many(`SELECT c.*, (c.chickens*c.unit_price) AS target, u.name AS client_name, u.phone
    FROM cotisations c JOIN users u ON u.id=c.user_id WHERE c.status IN ('active','complete') ORDER BY c.status DESC, c.id DESC`));
}));

r.post('/cotisations/:id/payments', h(async (req, res) => {
  const amount = int(req.body.amount);
  if (amount <= 0 || amount > 10000000) throw bad('Montant invalide.');
  const method = ['Espèces', 'Mobile Money', 'Virement'].includes(req.body.method) ? req.body.method : 'Espèces';
  const paid = await db.tx((c) => services.addCotisationPayment(int(req.params.id), amount, method, str(req.body.reference, 60), req.user.id, c));
  await audit(req.user.id, 'versement enregistré', `cotisation ${req.params.id} · ${fcfa(amount)} · ${method}`);
  res.json({ paid });
}));

r.get('/transactions', h(async (req, res) => {
  const cot = await db.many(`SELECT p.created_at, p.amount, p.method, p.reference, u.name AS client_name
    FROM cotisation_payments p JOIN cotisations c ON c.id=p.cotisation_id JOIN users u ON u.id=c.user_id
    ORDER BY p.created_at DESC LIMIT 100`);
  res.json(cot);
}));

// --- commandes & livraisons ---
r.get('/orders', h(async (req, res) => {
  const where = ["o.status <> 'attente_paiement'"];
  const params = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '')) { params.push(req.query.day); where.push(`o.day=$${params.length}`); }
  if (req.query.status && services.STATUS_LABEL[req.query.status]) { params.push(req.query.status); where.push(`o.status=$${params.length}`); }
  const rows = await db.many(`SELECT o.*, u.name AS client_name, u.phone AS client_phone, d.name AS driver_name
    FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN users d ON d.id=o.driver_id
    WHERE ${where.join(' AND ')} ORDER BY o.day DESC, o.slot, o.id DESC LIMIT 300`, params);
  for (const o of rows) await services.orderWithItems(o);
  res.json(rows);
}));

const NEXT = { confirmee: ['preparee', 'annulee'], preparee: ['confirmee', 'en_route', 'annulee'], en_route: ['preparee', 'livree', 'annulee'], livree: [], annulee: [] };

r.put('/orders/:id/status', h(async (req, res) => {
  const o = await db.one('SELECT * FROM orders WHERE id=$1', [int(req.params.id)]);
  if (!o) throw notFound('Commande introuvable.');
  const s = req.body.status;
  if (!(NEXT[o.status] || []).includes(s)) throw bad(`Passage de « ${services.STATUS_LABEL[o.status]} » à « ${services.STATUS_LABEL[s] || s} » impossible.`);
  if (s === 'annulee') {
    await services.cancelOrder(o.id, 'annulée par BIOSAVEUR');
  } else {
    const driver = req.body.driver_id ? int(req.body.driver_id) : o.driver_id;
    await db.query(`UPDATE orders SET status=$2, driver_id=$3, delivered_at=CASE WHEN $2='livree' THEN now() ELSE delivered_at END,
      paid = CASE WHEN $2='livree' THEN true ELSE paid END WHERE id=$1`, [o.id, s, driver]);
    await notify(o.user_id, `Commande ${o.number} : ${services.STATUS_LABEL[s]}.`);
  }
  await audit(req.user.id, 'statut commande', `${o.number} → ${s}`);
  res.json({ ok: true });
}));

r.put('/orders/:id/driver', h(async (req, res) => {
  const d = req.body.driver_id ? int(req.body.driver_id) : null;
  if (d && !(await db.one("SELECT 1 FROM users WHERE id=$1 AND role='livreur'", [d]))) throw bad('Livreur inconnu.');
  await db.query('UPDATE orders SET driver_id=$2 WHERE id=$1', [int(req.params.id), d]);
  res.json({ ok: true });
}));

// --- produits & stock ---
r.get('/products', h(async (req, res) => res.json(await db.many('SELECT * FROM products ORDER BY sort, id'))));

function productFields(b, cur = {}) {
  const pick = (k, f) => (b[k] !== undefined ? f(b[k]) : cur[k]);
  const opts = b.options !== undefined
    ? String(Array.isArray(b.options) ? b.options.join(',') : b.options).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8)
    : cur.options;
  return {
    name: pick('name', (v) => str(v, 120)),
    category: pick('category', (v) => (CATS.includes(v) ? v : 'entier')),
    price: pick('price', (v) => Math.max(0, int(v))),
    old_price: pick('old_price', (v) => (int(v) > 0 ? int(v) : null)),
    weight: pick('weight', (v) => str(v, 40)),
    options: opts && opts.length ? opts : ['Entier'],
    tag: pick('tag', (v) => str(v, 30)),
    flash: pick('flash', (v) => !!v),
    image_url: pick('image_url', (v) => (/^https:\/\//.test(str(v, 500)) ? str(v, 500) : '')),
    description: pick('description', (v) => str(v, 2000)),
    stock: pick('stock', (v) => Math.max(0, int(v))),
    threshold: pick('threshold', (v) => Math.max(0, int(v))),
    supplier: pick('supplier', (v) => str(v, 120)),
    lead_time: pick('lead_time', (v) => str(v, 40)),
    lot_code: pick('lot_code', (v) => str(v, 40)),
    farm: pick('farm', (v) => str(v, 120)),
    feed: pick('feed', (v) => str(v, 200)),
    vet: pick('vet', (v) => str(v, 200)),
    slaughter_date: pick('slaughter_date', (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
    cold_chain: pick('cold_chain', (v) => str(v, 120)),
    halal: pick('halal', (v) => str(v, 200)),
    visible: pick('visible', (v) => !!v),
  };
}
const PCOLS = ['name', 'category', 'price', 'old_price', 'weight', 'options', 'tag', 'flash', 'image_url', 'description', 'stock', 'threshold', 'supplier', 'lead_time', 'lot_code', 'farm', 'feed', 'vet', 'slaughter_date', 'cold_chain', 'halal', 'visible'];

r.post('/products', h(async (req, res) => {
  const f = productFields(req.body, { visible: true, flash: false, options: ['Entier'] });
  if (!f.name || !f.price) throw bad('Nom et prix obligatoires.');
  const vals = PCOLS.map((c) => (f[c] === undefined ? null : f[c]));
  const cols = PCOLS.filter((c, i) => vals[i] !== null);
  const p = await db.one(`INSERT INTO products(${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals.filter((v) => v !== null));
  res.json(p);
}));

r.put('/products/:id', h(async (req, res) => {
  const cur = await db.one('SELECT * FROM products WHERE id=$1', [int(req.params.id)]);
  if (!cur) throw notFound('Produit introuvable.');
  const f = productFields(req.body, cur);
  const p = await db.one(`UPDATE products SET ${PCOLS.map((c, i) => `${c}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [cur.id, ...PCOLS.map((c) => f[c])]);
  if (req.body.stock !== undefined && f.stock !== cur.stock) await audit(req.user.id, 'stock', `${cur.name} : ${cur.stock} → ${f.stock}`);
  res.json(p);
}));

// --- messagerie ---
r.get('/threads', h(async (req, res) => {
  res.json(await db.many(`SELECT u.id, u.name, u.phone, m.body AS last_body, m.created_at AS last_at,
      (SELECT count(*) FROM messages x WHERE x.user_id=u.id AND NOT x.from_team AND NOT x.read)::int AS unread
    FROM users u JOIN LATERAL (SELECT body, created_at FROM messages WHERE user_id=u.id ORDER BY created_at DESC LIMIT 1) m ON true
    ORDER BY m.created_at DESC LIMIT 200`));
}));

r.get('/threads/:uid', h(async (req, res) => {
  const uid = int(req.params.uid);
  await db.query('UPDATE messages SET read=true WHERE user_id=$1 AND NOT from_team AND NOT read', [uid]);
  const u = await db.one('SELECT id,name,phone,commune FROM users WHERE id=$1', [uid]);
  if (!u) throw notFound('Client introuvable.');
  res.json({ user: u, messages: await db.many('SELECT id, from_team, body, created_at FROM messages WHERE user_id=$1 ORDER BY created_at', [uid]) });
}));

r.post('/threads/:uid', h(async (req, res) => {
  const uid = int(req.params.uid);
  const body = str(req.body.body, 1000);
  if (!body) throw bad('Message vide.');
  const m = await db.one('INSERT INTO messages(user_id,from_team,author_id,body) VALUES ($1,true,$2,$3) RETURNING id, from_team, body, created_at', [uid, req.user.id, body]);
  await notify(uid, 'Nouveau message de l’équipe BIOSAVEUR.');
  res.json(m);
}));

// --- CinetPay ---
r.get('/cinetpay', h(async (req, res) => {
  res.json({
    mode: cinetpay.mode(),
    configured: config.cinetpay.configured,
    secretKey: Boolean(config.cinetpay.secretKey),
    siteId: config.cinetpay.siteId ? `${config.cinetpay.siteId.slice(0, 3)}…` : '',
    enabled: await services.onlinePaymentEnabled(),
    notifyUrl: `${config.publicUrl}/api/cinetpay/notify`,
    returnUrl: `${config.publicUrl}/api/cinetpay/return`,
    payments: await db.many(`SELECT p.transaction_id, p.purpose, p.amount, p.status, p.method, p.message, p.created_at, u.name AS client_name
      FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50`),
  });
}));

r.put('/cinetpay', h(async (req, res) => {
  if (req.body.enabled && cinetpay.mode() === 'off') throw bad('Renseignez d’abord CINETPAY_API_KEY et CINETPAY_SITE_ID dans les variables d’environnement.');
  await db.setSetting('cinetpay_enabled', req.body.enabled ? 'true' : 'false');
  await audit(req.user.id, 'paiement en ligne', req.body.enabled ? 'activé' : 'désactivé');
  res.json({ ok: true });
}));

r.post('/cinetpay/test', h(async (req, res) => {
  if (cinetpay.mode() === 'off') throw bad('CinetPay n’est pas configuré.');
  const p = await services.startPayment(req.user, 'test', null, 100, 'Transaction de test BIOSAVEUR');
  res.json(p);
}));

r.post('/cinetpay/sync/:tx', h(async (req, res) => {
  const p = await services.syncPayment(str(req.params.tx, 60));
  res.json({ status: p.status });
}));

r.get('/audit', h(async (req, res) => {
  res.json(await db.many(`SELECT a.created_at, a.action, a.detail, u.name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200`));
}));

module.exports = r;
