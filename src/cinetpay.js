'use strict';
// Client CinetPay (API checkout v2). Documentation : https://docs.cinetpay.com
const crypto = require('crypto');
const config = require('./config');

const cp = config.cinetpay;

function mode() {
  if (cp.configured) return 'live';
  if (cp.simulate) return 'simulation';
  return 'off';
}

async function post(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${cp.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch (_) { return { code: String(r.status), message: text.slice(0, 300) }; }
  } finally {
    clearTimeout(t);
  }
}

// Montant : CinetPay exige un multiple de 5 (XOF).
function roundAmount(n) {
  return Math.ceil(n / 5) * 5;
}

/**
 * Crée un guichet de paiement. Renvoie { payment_url } ou lève une erreur lisible.
 */
async function initPayment({ transactionId, amount, description, user, fromApp }) {
  if (mode() === 'simulation') {
    return { payment_url: `${config.publicUrl}/#/paiement-simule/${encodeURIComponent(transactionId)}`, simulated: true };
  }
  if (mode() === 'off') throw new Error('Le paiement en ligne n’est pas disponible pour le moment.');
  const [first, ...rest] = String(user.name || 'Client').split(' ');
  const body = {
    apikey: cp.apiKey,
    site_id: cp.siteId,
    transaction_id: transactionId,
    amount: roundAmount(amount),
    currency: 'XOF',
    description: String(description).replace(/[^\p{L}\p{N} .,'-]/gu, ' ').slice(0, 120),
    notify_url: `${config.publicUrl}/api/cinetpay/notify`,
    return_url: `${config.publicUrl}/api/cinetpay/return?tx=${encodeURIComponent(transactionId)}${fromApp ? '&app=1' : ''}`,
    channels: 'ALL',
    lang: 'fr',
    customer_id: String(user.id),
    customer_name: first,
    customer_surname: rest.join(' ') || first,
    customer_phone_number: user.phone,
    customer_email: `client${user.id}@biosaveur.ci`,
    customer_address: user.address || 'Abidjan',
    customer_city: 'Abidjan',
    customer_country: 'CI',
    customer_state: 'CI',
    customer_zip_code: '00225',
    metadata: transactionId,
  };
  const r = await post('/payment', body);
  if (String(r.code) !== '201' || !r.data || !r.data.payment_url) {
    const msg = r.description || r.message || 'erreur inconnue';
    throw new Error(`CinetPay a refusé la demande : ${msg}`);
  }
  return { payment_url: r.data.payment_url };
}

/**
 * Interroge CinetPay sur l'état réel d'une transaction (source de vérité).
 * Renvoie { status: 'ACCEPTED'|'REFUSED'|'PENDING'|..., method, amount, message }.
 */
async function checkPayment(transactionId) {
  if (mode() !== 'live') return null; // en simulation, l'état est géré localement
  const r = await post('/payment/check', { apikey: cp.apiKey, site_id: cp.siteId, transaction_id: transactionId });
  const d = r.data || {};
  let status = d.status || 'PENDING';
  // 627 = transaction annulée / 662 = en attente selon la doc ; on ne traite comme définitif que ACCEPTED/REFUSED.
  if (String(r.code) === '00' && status === 'ACCEPTED') status = 'ACCEPTED';
  return { status, method: d.payment_method || '', amount: Number(d.amount) || 0, message: r.message || '' };
}

// Vérifie l'en-tête x-token des notifications (HMAC-SHA256 avec la clé secrète).
function verifyNotifyToken(body, token) {
  if (!cp.secretKey || !token) return null; // impossible à vérifier
  const fields = ['cpm_site_id', 'cpm_trans_id', 'cpm_trans_date', 'cpm_amount', 'cpm_currency', 'signature',
    'payment_method', 'cel_phone_num', 'cpm_phone_prefixe', 'cpm_language', 'cpm_version', 'cpm_payment_config',
    'cpm_page_action', 'cpm_custom', 'cpm_designation', 'cpm_error_message'];
  const data = fields.map((f) => (body[f] == null ? '' : String(body[f]))).join('');
  const expected = crypto.createHmac('sha256', cp.secretKey).update(data).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
  } catch (_) {
    return false;
  }
}

module.exports = { mode, initPayment, checkPayment, verifyNotifyToken, roundAmount };
