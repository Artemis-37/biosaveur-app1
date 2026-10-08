'use strict';
// Routes publiques : configuration, catalogue, inscription et connexion.
const express = require('express');
const config = require('../config');
const db = require('../db');
const cinetpay = require('../cinetpay');
const services = require('../services');
const { hash, check, setSession, clearSession } = require('../auth');
const { h, bad, notFound, code, normPhone, str, notify, audit } = require('../util');

const r = express.Router();

const COMMUNES = ['Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville', 'Yopougon'];

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, role: u.role, name: u.name, phone: u.phone, commune: u.commune, address: u.address,
    landmark: u.landmark, lat: u.lat, lng: u.lng, referral_code: u.referral_code, points: u.points,
    created_at: u.created_at,
  };
}

r.get('/config', h(async (req, res) => {
  res.json({
    user: publicUser(req.user),
    slots: config.shop.slots,
    deliveryFee: config.shop.deliveryFee,
    chickenPrice: config.shop.chickenPrice,
    referralPoints: config.shop.referralPoints,
    depot: config.shop.depot,
    map: config.map,
    communes: COMMUNES,
    onlinePayment: await services.onlinePaymentEnabled(),
    paymentMode: cinetpay.mode(),
    demo: config.seedDemo,
  });
}));

const CATS = ['entier', 'decoupes', 'packs', 'fume', 'abats', 'evenements'];

r.get('/products', h(async (req, res) => {
  const where = ['visible'];
  const params = [];
  if (req.query.cat && CATS.includes(req.query.cat)) { params.push(req.query.cat); where.push(`category=$${params.length}`); }
  if (req.query.flash === '1') where.push('flash');
  if (req.query.q) { params.push(`%${str(req.query.q, 60)}%`); where.push(`(name ILIKE $${params.length} OR category ILIKE $${params.length})`); }
  const rows = await db.many(
    `SELECT id,name,category,price,old_price,weight,options,tag,flash,image_url,stock FROM products WHERE ${where.join(' AND ')} ORDER BY sort, id`,
    params
  );
  res.json(rows);
}));

r.get('/products/:id', h(async (req, res) => {
  const p = await db.one(
    `SELECT id,name,category,price,old_price,weight,options,tag,flash,image_url,description,stock,
      lot_code,farm,feed,vet,slaughter_date,cold_chain,halal FROM products WHERE id=$1 AND visible`, [parseInt(req.params.id, 10) || 0]);
  if (!p) throw notFound('Produit introuvable.');
  res.json(p);
}));

// --- comptes ---
const attempts = new Map(); // limitation simple des tentatives de connexion
function throttle(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  if (a.length >= 10) throw bad('Trop de tentatives. Réessayez dans 15 minutes.');
  a.push(now);
  attempts.set(key, a);
}

r.post('/auth/register', h(async (req, res) => {
  const name = str(req.body.name, 80);
  const phone = normPhone(req.body.phone);
  const password = String(req.body.password || '');
  const commune = COMMUNES.includes(req.body.commune) ? req.body.commune : '';
  const address = str(req.body.address, 200);
  const ref = str(req.body.referral, 20).toUpperCase();
  if (name.length < 2) throw bad('Indiquez votre nom.');
  if (!/^\d{10}$/.test(phone)) throw bad('Numéro de téléphone invalide (10 chiffres).');
  if (password.length < 6) throw bad('Le mot de passe doit faire au moins 6 caractères.');
  throttle(`reg:${req.ip}`);
  if (await db.one('SELECT 1 FROM users WHERE phone=$1', [phone])) throw bad('Un compte existe déjà avec ce numéro. Connectez-vous.');

  let referrer = null;
  if (ref) {
    referrer = await db.one("SELECT id FROM users WHERE referral_code=$1 AND role='client'", [ref]);
    if (!referrer) throw bad('Code de parrainage inconnu.');
  }
  const u = await db.tx(async (c) => {
    const user = (await c.query(
      `INSERT INTO users(role,name,phone,password_hash,commune,address,referral_code,referred_by)
       VALUES ('client',$1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, phone, await hash(password), commune, address, `BSV-${code(4)}`, referrer ? referrer.id : null]
    )).rows[0];
    if (referrer) {
      await c.query('UPDATE users SET points = points + $2 WHERE id=$1', [referrer.id, config.shop.referralPoints]);
      await notify(referrer.id, `${name} s’est inscrit avec votre code : +${config.shop.referralPoints} points.`, c);
    }
    await notify(user.id, 'Bienvenue chez BIOSAVEUR ! Placez votre position sur la carte pour faciliter vos livraisons.', c);
    return user;
  });
  setSession(res, u);
  res.json({ user: publicUser(u) });
}));

r.post('/auth/login', h(async (req, res) => {
  const phone = normPhone(req.body.phone);
  throttle(`login:${phone}`);
  const u = await db.one('SELECT * FROM users WHERE phone=$1 AND active', [phone]);
  if (!u || !(await check(String(req.body.password || ''), u.password_hash))) throw bad('Numéro ou mot de passe incorrect.');
  attempts.delete(`login:${phone}`);
  await db.query('UPDATE users SET last_active=now() WHERE id=$1', [u.id]);
  await audit(u.id, 'connexion');
  setSession(res, u);
  res.json({ user: publicUser(u) });
}));

r.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

module.exports = { router: r, publicUser, COMMUNES };
