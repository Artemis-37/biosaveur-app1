'use strict';
// Règles métier partagées : commandes, cotisations, paiements.
const config = require('./config');
const db = require('./db');
const cinetpay = require('./cinetpay');
const { bad, notFound, code, isoDate, addDays, nextWeekday, fcfa, notify, audit } = require('./util');

const STATUS_LABEL = {
  attente_paiement: 'en attente de paiement', confirmee: 'confirmée', preparee: 'préparée',
  en_route: 'en route', livree: 'livrée', annulee: 'annulée',
};

function cotTarget(c) { return c.chickens * c.unit_price; }

async function nextNumber(client) {
  const r = await client.query("SELECT 'CMD-' || nextval('order_number_seq') AS n");
  return r.rows[0].n;
}

function checkDelivery(day, slot) {
  const today = isoDate();
  const max = isoDate(addDays(14));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today || day > max) throw bad('Choisissez un jour de livraison dans les 14 prochains jours.');
  if (!config.shop.slots.includes(slot)) throw bad('Créneau horaire invalide.');
}

/**
 * Crée une commande boutique. Le stock est réservé immédiatement.
 * Renvoie { order, payment_url? }.
 */
async function createOrder(user, { items, day, slot, pay_method }) {
  if (!Array.isArray(items) || !items.length) throw bad('Votre panier est vide.');
  if (items.length > 30) throw bad('Trop d’articles dans une même commande.');
  checkDelivery(day, slot);
  if (!['livraison', 'cinetpay', 'cotisation'].includes(pay_method)) throw bad('Mode de paiement invalide.');
  if (!user.address || !user.commune) throw bad('Renseignez votre adresse de livraison dans votre profil.');
  if (pay_method === 'cinetpay' && !(await onlinePaymentEnabled())) throw bad('Le paiement en ligne n’est pas encore disponible. Choisissez le paiement à la livraison.');

  const result = await db.tx(async (c) => {
    let subtotal = 0;
    const lines = [];
    // regrouper par produit pour contrôler le stock
    const want = new Map();
    for (const it of items) {
      const pid = parseInt(it.product_id, 10);
      const qty = parseInt(it.qty, 10);
      if (!pid || !(qty > 0) || qty > 100) throw bad('Quantité invalide.');
      want.set(pid, (want.get(pid) || 0) + qty);
    }
    const prods = (await c.query('SELECT * FROM products WHERE id = ANY($1) AND visible FOR UPDATE', [[...want.keys()]])).rows;
    const byId = new Map(prods.map((p) => [p.id, p]));
    for (const [pid, qty] of want) {
      const p = byId.get(pid);
      if (!p) throw bad('Un produit de votre panier n’est plus disponible.');
      if (p.stock < qty) throw bad(`Stock insuffisant : il reste ${p.stock} « ${p.name} ».`);
    }
    for (const it of items) {
      const p = byId.get(parseInt(it.product_id, 10));
      const option = p.options.includes(it.option) ? it.option : p.options[0];
      const qty = parseInt(it.qty, 10);
      subtotal += p.price * qty;
      lines.push({ p, option, qty });
    }
    const fee = config.shop.deliveryFee;
    const total = subtotal + fee;

    let paid = false;
    let status = 'confirmee';
    if (pay_method === 'cotisation') {
      const cot = (await c.query("SELECT * FROM cotisations WHERE user_id=$1 AND status IN ('active','complete') ORDER BY id DESC LIMIT 1 FOR UPDATE", [user.id])).rows[0];
      if (!cot || cot.paid < total) throw bad(`Solde de cotisation insuffisant (${fcfa(cot ? cot.paid : 0)} disponible).`);
      const newPaid = cot.paid - total;
      await c.query('UPDATE cotisations SET paid=$2, status=$3 WHERE id=$1', [cot.id, newPaid, newPaid >= cotTarget(cot) ? 'complete' : 'active']);
      paid = true;
    }
    if (pay_method === 'cinetpay') status = 'attente_paiement';

    for (const [pid, qty] of want) await c.query('UPDATE products SET stock = stock - $2 WHERE id=$1', [pid, qty]);

    const number = await nextNumber(c);
    const o = (await c.query(
      `INSERT INTO orders(number,user_id,kind,day,slot,status,pay_method,paid,subtotal,fee,total,qr_code,address,commune,landmark,lat,lng)
       VALUES ($1,$2,'commande',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [number, user.id, day, slot, status, pay_method, paid, subtotal, fee, total, `QR-${code(6)}`,
        user.address, user.commune, user.landmark, user.lat, user.lng]
    )).rows[0];
    for (const l of lines) {
      await c.query('INSERT INTO order_items(order_id,product_id,name,option,qty,unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [o.id, l.p.id, l.p.name, l.option, l.qty, l.p.price]);
    }
    if (status === 'confirmee') await notify(user.id, `Commande ${o.number} confirmée pour le ${o.day}, ${o.slot}.`, c);
    return o;
  });

  if (pay_method === 'cinetpay') {
    try {
      const pay = await startPayment(user, 'commande', result.id, result.total, `Commande ${result.number} BIOSAVEUR`);
      return { order: result, payment_url: pay.payment_url };
    } catch (e) {
      await cancelOrder(result.id, 'paiement non initialisé');
      throw bad(e.message);
    }
  }
  return { order: result };
}

async function cancelOrder(orderId, reason, client) {
  const run = async (c) => {
    const o = (await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!o || o.status === 'annulee' || o.status === 'livree') return;
    const items = (await c.query('SELECT * FROM order_items WHERE order_id=$1', [orderId])).rows;
    for (const it of items) if (it.product_id) await c.query('UPDATE products SET stock = stock + $2 WHERE id=$1', [it.product_id, it.qty]);
    await c.query("UPDATE orders SET status='annulee' WHERE id=$1", [orderId]);
    await notify(o.user_id, `Commande ${o.number} annulée (${reason}).`, c);
  };
  return client ? run(client) : db.tx(run);
}

async function onlinePaymentEnabled() {
  if (cinetpay.mode() === 'off') return false;
  return (await db.getSetting('cinetpay_enabled', cinetpay.mode() === 'simulation' ? 'true' : 'false')) === 'true';
}

async function startPayment(user, purpose, refId, amount, description) {
  const transactionId = `BSV${Date.now().toString(36).toUpperCase()}${code(4)}`;
  const amt = cinetpay.roundAmount(amount);
  await db.query('INSERT INTO payments(transaction_id,user_id,purpose,ref_id,amount) VALUES ($1,$2,$3,$4,$5)',
    [transactionId, user ? user.id : null, purpose, refId, amt]);
  const r = await cinetpay.initPayment({ transactionId, amount: amt, description, user: user || { id: 0, name: 'Test BIOSAVEUR', phone: '0000000000' } });
  await db.query('UPDATE payments SET payment_url=$2, updated_at=now() WHERE transaction_id=$1', [transactionId, r.payment_url]);
  return { transaction_id: transactionId, payment_url: r.payment_url, simulated: !!r.simulated };
}

/**
 * Applique le résultat définitif d'une transaction (idempotent).
 * status : 'ACCEPTED' ou 'REFUSED'.
 */
async function applyPayment(transactionId, status, method = '', message = '') {
  return db.tx(async (c) => {
    const p = (await c.query('SELECT * FROM payments WHERE transaction_id=$1 FOR UPDATE', [transactionId])).rows[0];
    if (!p) throw notFound('Transaction inconnue.');
    if (p.applied) return p;
    if (status !== 'ACCEPTED' && status !== 'REFUSED') {
      await c.query('UPDATE payments SET status=$2, updated_at=now() WHERE id=$1', [p.id, status]);
      return { ...p, status };
    }
    await c.query('UPDATE payments SET status=$2, method=$3, message=$4, applied=true, updated_at=now() WHERE id=$1',
      [p.id, status, method, message]);

    if (p.purpose === 'commande') {
      const o = (await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [p.ref_id])).rows[0];
      if (o && o.status === 'attente_paiement') {
        if (status === 'ACCEPTED') {
          await c.query("UPDATE orders SET status='confirmee', paid=true WHERE id=$1", [o.id]);
          await notify(o.user_id, `Paiement reçu. Commande ${o.number} confirmée pour le ${o.day}, ${o.slot}.`, c);
        } else {
          await cancelOrder(o.id, 'paiement refusé', c);
        }
      }
    } else if (p.purpose === 'versement' && status === 'ACCEPTED') {
      await addCotisationPayment(p.ref_id, p.amount, `CinetPay${method ? ` · ${method}` : ''}`, transactionId, null, c);
    }
    return { ...p, status, applied: true };
  });
}

async function addCotisationPayment(cotId, amount, method, reference, recordedBy, c) {
  const cot = (await c.query('SELECT * FROM cotisations WHERE id=$1 FOR UPDATE', [cotId])).rows[0];
  if (!cot) throw notFound('Cotisation introuvable.');
  if (cot.status === 'livree' || cot.status === 'annulee') throw bad('Cette cotisation est clôturée.');
  await c.query('INSERT INTO cotisation_payments(cotisation_id,amount,method,reference,recorded_by) VALUES ($1,$2,$3,$4,$5)',
    [cot.id, amount, method, reference || '', recordedBy]);
  const paid = cot.paid + amount;
  const complete = paid >= cotTarget(cot);
  await c.query('UPDATE cotisations SET paid=$2, status=$3 WHERE id=$1', [cot.id, paid, complete ? 'complete' : 'active']);
  await notify(cot.user_id, complete
    ? `Bravo ! Votre cotisation de ${cot.chickens} poulets est complète. Programmez votre livraison.`
    : `Versement de cotisation reçu : ${fcfa(amount)}.`, c);
  return paid;
}

// Synchronise une transaction en attente avec CinetPay (retour client, ou consultation).
async function syncPayment(transactionId) {
  const p = await db.one('SELECT * FROM payments WHERE transaction_id=$1', [transactionId]);
  if (!p) throw notFound('Transaction inconnue.');
  if (p.applied || cinetpay.mode() !== 'live') return p;
  const r = await cinetpay.checkPayment(transactionId);
  if (r && (r.status === 'ACCEPTED' || r.status === 'REFUSED')) {
    if (r.status === 'ACCEPTED' && r.amount && r.amount < p.amount) {
      return applyPayment(transactionId, 'REFUSED', r.method, `montant reçu ${r.amount} inférieur à ${p.amount}`);
    }
    return applyPayment(transactionId, r.status, r.method, r.message);
  }
  return p;
}

// Programme la livraison d'une cotisation complète.
async function deliverCotisation(user, cotId, day, slot) {
  checkDelivery(day, slot);
  if (!user.address) throw bad('Renseignez votre adresse de livraison dans votre profil.');
  return db.tx(async (c) => {
    const cot = (await c.query('SELECT * FROM cotisations WHERE id=$1 AND user_id=$2 FOR UPDATE', [cotId, user.id])).rows[0];
    if (!cot) throw notFound('Cotisation introuvable.');
    if (cot.status !== 'complete') throw bad('La cotisation n’est pas encore complète.');
    const number = await nextNumber(c);
    const o = (await c.query(
      `INSERT INTO orders(number,user_id,kind,day,slot,status,pay_method,paid,subtotal,fee,total,qr_code,address,commune,landmark,lat,lng)
       VALUES ($1,$2,'cotisation',$3,$4,'confirmee','cotisation',true,$5,0,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [number, user.id, day, slot, cotTarget(cot), `QR-${code(6)}`, user.address, user.commune, user.landmark, user.lat, user.lng]
    )).rows[0];
    await c.query('INSERT INTO order_items(order_id,product_id,name,option,qty,unit_price) VALUES ($1,NULL,$2,$3,$4,$5)',
      [o.id, 'Poulet entier (cotisation)', 'Entier', cot.chickens, cot.unit_price]);
    const surplus = cot.paid - cotTarget(cot);
    await c.query("UPDATE cotisations SET status='livree', order_id=$2, paid=$3 WHERE id=$1", [cot.id, o.id, cotTarget(cot)]);
    if (cot.auto_renew) {
      await c.query('INSERT INTO cotisations(user_id,chickens,unit_price,paid,delivery_day,auto_renew) VALUES ($1,$2,$3,$4,$5,true)',
        [user.id, cot.chickens, config.shop.chickenPrice, Math.max(0, surplus), cot.delivery_day]);
    }
    await notify(user.id, `Livraison de votre cotisation programmée : ${o.number}, le ${o.day}, ${o.slot}.`, c);
    return o;
  });
}

// Annule les commandes restées sans paiement en ligne plus d'une heure.
async function expireStalePayments() {
  const stale = await db.many("SELECT id FROM orders WHERE status='attente_paiement' AND created_at < now() - interval '1 hour'");
  for (const o of stale) {
    const p = await db.one("SELECT transaction_id FROM payments WHERE purpose='commande' AND ref_id=$1 AND NOT applied ORDER BY id DESC LIMIT 1", [o.id]);
    if (p) {
      try { await syncPayment(p.transaction_id); } catch (_) { /* réessai plus tard */ }
    }
    const still = await db.one('SELECT status FROM orders WHERE id=$1', [o.id]);
    if (still && still.status === 'attente_paiement') {
      if (p) await db.query("UPDATE payments SET status='EXPIRED', applied=true, updated_at=now() WHERE transaction_id=$1 AND NOT applied", [p.transaction_id]);
      await cancelOrder(o.id, 'paiement non reçu');
    }
  }
}

async function orderWithItems(o) {
  if (!o) return null;
  o.items = await db.many('SELECT name, option, qty, unit_price FROM order_items WHERE order_id=$1 ORDER BY id', [o.id]);
  return o;
}

module.exports = {
  STATUS_LABEL, cotTarget, createOrder, cancelOrder, onlinePaymentEnabled, startPayment, applyPayment,
  addCotisationPayment, syncPayment, deliverCotisation, expireStalePayments, orderWithItems, nextWeekday, audit,
};
