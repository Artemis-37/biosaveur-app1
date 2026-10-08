'use strict';
// Espace livreur : tournée du jour, départ, confirmation de remise par QR.
const express = require('express');
const db = require('../db');
const services = require('../services');
const { need } = require('../auth');
const { h, bad, notFound, isoDate, int, str, notify, audit } = require('../util');

const r = express.Router();
r.use(need('livreur', 'admin'));

r.get('/tour', h(async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : isoDate();
  const rows = await db.many(
    `SELECT o.id, o.number, o.kind, o.day, o.slot, o.status, o.pay_method, o.paid, o.total, o.address, o.commune, o.landmark,
            o.lat, o.lng, o.delivered_at, o.driver_id, u.name AS client_name, u.phone AS client_phone
       FROM orders o JOIN users u ON u.id=o.user_id
      WHERE o.day=$1 AND o.status IN ('confirmee','preparee','en_route','livree')
        AND (o.driver_id IS NULL OR o.driver_id=$2 OR $3)
      ORDER BY o.slot, o.id`,
    [day, req.user.id, req.user.role === 'admin']
  );
  for (const o of rows) await services.orderWithItems(o);
  res.json({ day, orders: rows });
}));

r.post('/orders/:id/start', h(async (req, res) => {
  const o = await db.one('SELECT * FROM orders WHERE id=$1', [int(req.params.id)]);
  if (!o) throw notFound('Livraison introuvable.');
  if (o.status !== 'preparee') throw bad('Cette commande n’est pas prête au départ.');
  await db.query("UPDATE orders SET status='en_route', driver_id=$2 WHERE id=$1", [o.id, req.user.id]);
  await notify(o.user_id, `Votre commande ${o.number} est en route.`);
  res.json({ ok: true });
}));

async function deliver(o, user) {
  await db.tx(async (c) => {
    await c.query("UPDATE orders SET status='livree', delivered_at=now(), paid=true, driver_id=COALESCE(driver_id,$2) WHERE id=$1", [o.id, user.id]);
    await notify(o.user_id, `Commande ${o.number} livrée. Merci pour votre confiance !`, c);
    await audit(user.id, 'remise', `${o.number}${o.pay_method === 'livraison' && !o.paid ? ` · encaissé ${o.total}` : ''}`, c);
  });
}

// Confirmation de remise : le code QR doit correspondre à la commande.
r.post('/orders/:id/deliver', h(async (req, res) => {
  const o = await db.one('SELECT * FROM orders WHERE id=$1', [int(req.params.id)]);
  if (!o) throw notFound('Livraison introuvable.');
  if (o.status !== 'en_route') throw bad('Démarrez d’abord la livraison.');
  const codeIn = str(req.body.code, 20).toUpperCase();
  if (codeIn !== o.qr_code) throw bad(`Ce code ne correspond pas à la commande ${o.number}. Vérifiez le QR du client.`);
  await deliver(o, req.user);
  res.json({ ok: true, number: o.number });
}));

// Scan direct : retrouve la commande en route à partir du code.
r.post('/scan', h(async (req, res) => {
  const codeIn = str(req.body.code, 20).toUpperCase();
  const o = await db.one("SELECT * FROM orders WHERE qr_code=$1", [codeIn]);
  if (!o) throw bad('QR code inconnu.');
  if (o.status === 'livree') throw bad(`La commande ${o.number} est déjà livrée.`);
  if (o.status !== 'en_route') throw bad(`La commande ${o.number} n’est pas en route.`);
  await deliver(o, req.user);
  res.json({ ok: true, number: o.number });
}));

module.exports = r;
