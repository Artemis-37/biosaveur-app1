'use strict';
// Points d'entrée CinetPay : notification serveur à serveur, retour client, simulation.
const express = require('express');
const db = require('../db');
const cinetpay = require('../cinetpay');
const services = require('../services');
const { need } = require('../auth');
const { h, bad, notFound, str } = require('../util');

const r = express.Router();

// CinetPay vérifie parfois l'URL par un GET.
r.get('/notify', (req, res) => res.status(200).send('OK'));

// Notification de paiement (POST application/x-www-form-urlencoded).
r.post('/notify', h(async (req, res) => {
  const tx = str(req.body.cpm_trans_id, 60);
  if (!tx) return res.status(400).send('cpm_trans_id manquant');
  const sig = cinetpay.verifyNotifyToken(req.body, req.get('x-token'));
  if (sig === false) console.warn(`[cinetpay] x-token invalide pour ${tx} — vérification par l'API.`);
  // Quelle que soit la signature, on ne fait foi que de la réponse de /payment/check.
  try {
    await services.syncPayment(tx);
  } catch (e) {
    console.error('[cinetpay] notify', tx, e.message);
  }
  res.status(200).send('OK');
}));

// Retour du client après le guichet (GET ou POST selon la configuration CinetPay).
async function back(req, res) {
  const tx = str(req.query.tx || req.body.transaction_id || req.body.cpm_trans_id, 60);
  if (tx) {
    try { await services.syncPayment(tx); } catch (_) { /* l'écran de suivi réessaiera */ }
  }
  if (req.query.app === '1') {
    // Paiement lancé depuis l'appli : le client est dans le navigateur du téléphone.
    const p = tx ? await db.one('SELECT status FROM payments WHERE transaction_id=$1', [tx]) : null;
    const ok = p && p.status === 'ACCEPTED';
    res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BIOSAVEUR</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f3f5f1;color:#17211f;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.c{background:#fff;border-radius:16px;padding:28px;max-width:380px;text-align:center}h1{color:#103d3a;font-size:22px}</style></head>
<body><div class="c"><h1>${ok ? 'Paiement reçu' : 'Paiement en cours de vérification'}</h1><p>Vous pouvez fermer cette page et revenir dans l’application BIOSAVEUR : votre commande s’y met à jour automatiquement.</p></div></body></html>`);
    return;
  }
  res.redirect(303, `/#/paiement/${encodeURIComponent(tx)}`);
}
r.get('/return', h(back));
r.post('/return', h(back));

// Guichet simulé (uniquement quand CinetPay n'est pas configuré et que la simulation est active).
r.post('/simulate/:tx', need(), h(async (req, res) => {
  if (cinetpay.mode() !== 'simulation') throw bad('Simulation désactivée.');
  const p = await db.one('SELECT * FROM payments WHERE transaction_id=$1', [str(req.params.tx, 60)]);
  if (!p) throw notFound('Transaction inconnue.');
  if (p.user_id !== req.user.id && req.user.role !== 'admin') throw notFound('Transaction inconnue.');
  const result = req.body.result === 'ACCEPTED' ? 'ACCEPTED' : 'REFUSED';
  const out = await services.applyPayment(p.transaction_id, result, str(req.body.method, 40) || 'SIMULATION', 'simulation');
  res.json({ status: out.status, purpose: out.purpose, ref_id: out.ref_id });
}));

r.get('/tx/:tx', need(), h(async (req, res) => {
  const p = await db.one('SELECT transaction_id, user_id, purpose, ref_id, amount, status, applied FROM payments WHERE transaction_id=$1', [str(req.params.tx, 60)]);
  if (!p || (p.user_id !== req.user.id && req.user.role !== 'admin')) throw notFound('Transaction inconnue.');
  delete p.user_id;
  res.json(p);
}));

module.exports = r;
