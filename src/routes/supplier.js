'use strict';
// Espace fournisseur : produits fournis, stock chez BIOSAVEUR, commandes d'approvisionnement.
const express = require('express');
const db = require('../db');
const { need } = require('../auth');
const { h, bad, notFound, int, str, notify, audit } = require('../util');

const r = express.Router();
r.use(need('fournisseur', 'admin'));

async function notifyAdmins(body, c = db) {
  const admins = (await c.query("SELECT id FROM users WHERE role='admin' AND active")).rows;
  for (const a of admins) await notify(a.id, body, c);
}

r.get('/overview', h(async (req, res) => {
  const sid = req.user.role === 'admin' && req.query.supplier ? int(req.query.supplier) : req.user.id;
  const [products, orders, stats] = await Promise.all([
    db.many('SELECT id, name, category, stock, threshold, lead_time, weight FROM products WHERE supplier_id=$1 ORDER BY sort, id', [sid]),
    db.many('SELECT * FROM supply_orders WHERE supplier_id=$1 ORDER BY created_at DESC LIMIT 100', [sid]),
    db.one(`SELECT
        count(*) FILTER (WHERE status='demandee')::int AS a_confirmer,
        count(*) FILTER (WHERE status='confirmee')::int AS a_livrer,
        count(*) FILTER (WHERE status='livree' AND delivered_at > date_trunc('month', now()))::int AS livrees_mois,
        coalesce(sum(qty*unit_cost) FILTER (WHERE status='livree' AND delivered_at > date_trunc('month', now())),0)::int AS montant_mois
      FROM supply_orders WHERE supplier_id=$1`, [sid]),
  ]);
  res.json({ products, orders, stats });
}));

async function own(req, id) {
  const o = await db.one('SELECT * FROM supply_orders WHERE id=$1', [int(id)]);
  if (!o || (req.user.role !== 'admin' && o.supplier_id !== req.user.id)) throw notFound('Commande introuvable.');
  return o;
}

r.post('/orders/:id/confirm', h(async (req, res) => {
  const o = await own(req, req.params.id);
  if (o.status !== 'demandee') throw bad('Cette commande a déjà été traitée.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.due_date || '') ? req.body.due_date : o.due_date;
  await db.query("UPDATE supply_orders SET status='confirmee', confirmed_at=now(), due_date=$2, supplier_note=$3 WHERE id=$1", [o.id, date, str(req.body.note, 300)]);
  await notifyAdmins(`${req.user.company || req.user.name} confirme l’approvisionnement ${o.number} (${o.qty} × ${o.product_name}) pour le ${date || 'délai prévu'}.`);
  res.json({ ok: true });
}));

r.post('/orders/:id/refuse', h(async (req, res) => {
  const o = await own(req, req.params.id);
  if (o.status !== 'demandee') throw bad('Cette commande a déjà été traitée.');
  const note = str(req.body.note, 300);
  if (!note) throw bad('Indiquez la raison du refus.');
  await db.query("UPDATE supply_orders SET status='refusee', supplier_note=$2 WHERE id=$1", [o.id, note]);
  await notifyAdmins(`${req.user.company || req.user.name} ne peut pas livrer ${o.number} : ${note}`);
  res.json({ ok: true });
}));

// Livraison à l'entrepôt : le stock du produit augmente automatiquement.
r.post('/orders/:id/deliver', h(async (req, res) => {
  const o = await own(req, req.params.id);
  if (o.status !== 'confirmee') throw bad('Confirmez d’abord la commande.');
  await db.tx(async (c) => {
    await c.query("UPDATE supply_orders SET status='livree', delivered_at=now() WHERE id=$1", [o.id]);
    if (o.product_id) await c.query('UPDATE products SET stock = stock + $2 WHERE id=$1', [o.product_id, o.qty]);
    await notifyAdmins(`Approvisionnement ${o.number} livré : +${o.qty} « ${o.product_name} » en stock.`, c);
    await audit(req.user.id, 'approvisionnement livré', `${o.number} · ${o.qty} × ${o.product_name}`, c);
  });
  res.json({ ok: true });
}));

module.exports = { router: r, notifyAdmins };
