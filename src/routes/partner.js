'use strict';
// Espace partenaire (revendeur, point relais, apporteur d'affaires) : clients apportés et commissions.
const express = require('express');
const db = require('../db');
const { need } = require('../auth');
const { h, int } = require('../util');

const r = express.Router();
r.use(need('partenaire', 'admin'));

// Commission : taux du partenaire × sous-total des commandes livrées de ses clients.
async function partnerStats(pid) {
  const p = await db.one('SELECT id, name, company, referral_code, commission_rate FROM users WHERE id=$1', [pid]);
  if (!p) return null;
  const rate = Number(p.commission_rate);
  const totals = await db.one(`
    SELECT count(DISTINCT u.id)::int AS clients,
      count(o.id) FILTER (WHERE o.status='livree')::int AS commandes,
      coalesce(sum(o.subtotal) FILTER (WHERE o.status='livree'),0)::int AS ventes,
      coalesce(sum(o.subtotal) FILTER (WHERE o.status='livree' AND o.delivered_at > date_trunc('month', now())),0)::int AS ventes_mois
    FROM users u LEFT JOIN orders o ON o.user_id=u.id AND o.kind='commande'
    WHERE u.referred_by=$1`, [pid]);
  const paid = await db.one('SELECT coalesce(sum(amount),0)::int AS n FROM partner_payouts WHERE partner_id=$1', [pid]);
  const earned = Math.round(totals.ventes * rate);
  return {
    partner: { ...p, commission_rate: rate },
    clients: totals.clients, commandes: totals.commandes, ventes: totals.ventes,
    commission_mois: Math.round(totals.ventes_mois * rate),
    earned, paid: paid.n, balance: Math.max(0, earned - paid.n),
  };
}

r.get('/overview', h(async (req, res) => {
  const pid = req.user.role === 'admin' && req.query.partner ? int(req.query.partner) : req.user.id;
  const stats = await partnerStats(pid);
  const clients = await db.many(`
    SELECT u.id, u.name, u.commune, u.created_at,
      count(o.id) FILTER (WHERE o.status='livree')::int AS commandes,
      coalesce(sum(o.subtotal) FILTER (WHERE o.status='livree'),0)::int AS ventes,
      max(o.created_at) AS derniere
    FROM users u LEFT JOIN orders o ON o.user_id=u.id AND o.kind='commande'
    WHERE u.referred_by=$1 GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`, [pid]);
  // nom abrégé pour la confidentialité des clients
  for (const c of clients) { const [f, ...rest] = c.name.split(' '); c.name = `${f} ${rest.map((x) => `${x[0]}.`).join(' ')}`.trim(); }
  const months = await db.many(`
    SELECT to_char(m,'YYYY-MM') AS month,
      coalesce((SELECT sum(o.subtotal) FROM orders o JOIN users u ON u.id=o.user_id
        WHERE u.referred_by=$1 AND o.kind='commande' AND o.status='livree' AND date_trunc('month', o.delivered_at)=m),0)::int AS ventes
    FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m ORDER BY m`, [pid]);
  const payouts = await db.many('SELECT amount, method, note, created_at FROM partner_payouts WHERE partner_id=$1 ORDER BY created_at DESC LIMIT 50', [pid]);
  res.json({ ...stats, clientsList: clients, months, payouts });
}));

module.exports = { router: r, partnerStats };
