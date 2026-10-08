'use strict';
// Données de départ : catalogue, compte administrateur et (en démo) comptes et commandes d'exemple.
const config = require('./config');
const db = require('./db');
const { hash } = require('./auth');
const { code, normPhone, isoDate, addDays } = require('./util');

const FEED = 'Démarrage, croissance, finition (sans antibiotique en finition)';
const PRODUCTS = [
  ['Poulet entier fermier prêt à cuire', 'entier', 5000, 5500, '1,5 kg', ['Entier', 'Découpé 8 morceaux'], 'Halal', true, 42, 20, 'Coopérative de Bingerville', '3 jours'],
  ['Poulet entier grand format', 'entier', 6500, null, '2 kg', ['Entier', 'Découpé 8 morceaux'], 'Traçable', false, 18, 10, 'Coopérative d’Azaguié', '4 jours'],
  ['Pack famille découpé (2 poulets)', 'packs', 11500, 12500, '3 kg', ['Découpé 16 morceaux'], 'Promo', true, 12, 8, 'Atelier découpe BIOSAVEUR', '1 jour'],
  ['Cuisses de poulet', 'decoupes', 3800, null, '1 kg', ['Nature', 'Marinées'], 'Halal', false, 25, 15, 'Atelier découpe BIOSAVEUR', '1 jour'],
  ['Ailes de poulet', 'decoupes', 3200, 3600, '1 kg', ['Nature', 'Marinées'], 'Promo', true, 8, 10, 'Atelier découpe BIOSAVEUR', '1 jour'],
  ['Filets de poulet', 'decoupes', 4800, null, '1 kg', ['Nature'], 'Halal', false, 14, 10, 'Atelier découpe BIOSAVEUR', '1 jour'],
  ['Poulet braisé entier', 'fume', 7000, null, '1,2 kg cuit', ['Épices douces', 'Pimenté'], 'Nouveau', false, 9, 6, 'Cuisine BIOSAVEUR', 'Le jour même'],
  ['Poulet fumé entier', 'fume', 7500, 8000, '1,2 kg', ['Entier'], 'Promo', true, 6, 6, 'Fumoir partenaire', '2 jours'],
  ['Gésiers de poulet', 'abats', 1800, null, '500 g', ['Nettoyés'], 'Halal', false, 5, 8, 'Atelier découpe BIOSAVEUR', '1 jour'],
  ['Pack fête 10 poulets (précommande)', 'evenements', 48000, 52000, '10 × 1,5 kg', ['Entiers', 'Découpés'], 'Précommande', false, 30, 10, 'Coopérative de Bingerville', '7 jours'],
];

async function seedProducts() {
  const n = await db.one('SELECT count(*)::int AS n FROM products');
  if (n.n > 0) return;
  let i = 0;
  for (const p of PRODUCTS) {
    const [name, cat, price, old, w, opts, tag, flash, stock, thr, sup, lead] = p;
    await db.query(
      `INSERT INTO products(name,category,price,old_price,weight,options,tag,flash,stock,threshold,supplier,lead_time,
        lot_code,farm,feed,vet,slaughter_date,cold_chain,halal,sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [name, cat, price, old, w, opts, tag, flash, stock, thr, sup, lead,
        `LOT-${isoDate().slice(2, 7).replace('-', '')}-${String.fromCharCode(65 + (i % 3))}`,
        sup.startsWith('Coopérative') ? sup : 'Coopérative de Bingerville', FEED, 'Délai d’attente respecté',
        isoDate(addDays(-1 - (i % 3))), '2 °C en chambre froide', 'Certificat halal en cours de validité', i++]
    );
  }
}

async function ensureUser({ role, name, phone, password, commune = '', address = '', landmark = '', lat = null, lng = null }) {
  phone = normPhone(phone);
  const ex = await db.one('SELECT id FROM users WHERE phone=$1', [phone]);
  if (ex) return ex.id;
  const u = await db.one(
    `INSERT INTO users(role,name,phone,password_hash,commune,address,landmark,lat,lng,referral_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [role, name, phone, await hash(password), commune, address, landmark, lat, lng, `BSV-${code(4)}`]
  );
  return u.id;
}

async function seedDemo() {
  const has = await db.one("SELECT count(*)::int AS n FROM users WHERE role='client'");
  if (has.n > 0) return;
  const today = isoDate();
  const clients = [
    ['Aya Kouassi', '0708123456', 'Cocody', 'Riviera 3, rue des Jardins', 'Portail vert après la boulangerie Les Délices', 5.3612, -3.9681],
    ['Koffi N’Guessan', '0544982107', 'Yopougon', 'Niangon Sud, près de la pharmacie', 'Face à la pharmacie Niangon', 5.3262, -4.0893],
    ['Serge Bamba', '0759886644', 'Plateau', 'Immeuble Alpha, 4e étage', 'Accueil de l’immeuble Alpha', 5.3239, -4.0187],
    ['Yao Konan', '0777102030', 'Abobo', 'Abobo Baoulé, carrefour Samaké', 'Derrière la station du carrefour', 5.4236, -4.0198],
  ];
  const ids = [];
  for (const c of clients) {
    ids.push(await ensureUser({ role: 'client', name: c[0], phone: c[1], password: 'demo1234', commune: c[2], address: c[3], landmark: c[4], lat: c[5], lng: c[6] }));
  }
  const demoClient = await ensureUser({ role: 'client', name: 'Client Démo', phone: '0700000001', password: 'demo1234', commune: 'Marcory', address: 'Zone 4, rue du Canal', landmark: 'Immeuble beige, 2e porte', lat: 5.2971, lng: -3.9862 });
  const driver = await ensureUser({ role: 'livreur', name: 'Ibrahim Ouattara', phone: '0700000002', password: 'demo1234' });

  const cot = await db.one(
    `INSERT INTO cotisations(user_id,chickens,unit_price,paid,delivery_day) VALUES ($1,6,$2,18500,'Samedi') RETURNING id`,
    [demoClient, config.shop.chickenPrice]
  );
  for (const [d, m, how] of [[-28, 5000, 'Mobile Money'], [-21, 5000, 'Espèces'], [-14, 4500, 'Mobile Money'], [-7, 4000, 'Mobile Money']]) {
    await db.query('INSERT INTO cotisation_payments(cotisation_id,amount,method,created_at) VALUES ($1,$2,$3,$4)', [cot.id, m, how, addDays(d)]);
  }

  const prods = await db.many('SELECT id,name,price,options FROM products ORDER BY sort');
  const mk = async (uid, items, status, pay, slot, paid) => {
    const u = await db.one('SELECT * FROM users WHERE id=$1', [uid]);
    const sub = items.reduce((s, [pi, q]) => s + prods[pi].price * q, 0);
    const fee = config.shop.deliveryFee;
    const num = await db.one("SELECT 'CMD-' || nextval('order_number_seq') AS n");
    const o = await db.one(
      `INSERT INTO orders(number,user_id,day,slot,status,pay_method,paid,subtotal,fee,total,qr_code,driver_id,address,commune,landmark,lat,lng,delivered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [num.n, uid, today, config.shop.slots[slot], status, pay, paid, sub, fee, sub + fee, `QR-${code(6)}`, driver,
        u.address, u.commune, u.landmark, u.lat, u.lng, status === 'livree' ? new Date() : null]
    );
    for (const [pi, q] of items) {
      await db.query('INSERT INTO order_items(order_id,product_id,name,option,qty,unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [o.id, prods[pi].id, prods[pi].name, prods[pi].options[0], q, prods[pi].price]);
    }
  };
  await mk(ids[1], [[1, 2]], 'livree', 'livraison', 0, true);
  await mk(ids[0], [[0, 1], [4, 2]], 'en_route', 'livraison', 1, false);
  await mk(ids[2], [[2, 1]], 'preparee', 'livraison', 2, false);
  await mk(ids[3], [[3, 2], [8, 1]], 'confirmee', 'livraison', 3, false);

  await db.query('INSERT INTO messages(user_id,from_team,body) VALUES ($1,false,$2)', [ids[3], 'Bonjour, livrez-vous aussi à Anyama ?']);
  await db.query('INSERT INTO notifications(user_id,body) VALUES ($1,$2)', [demoClient, 'Bienvenue chez BIOSAVEUR ! Votre cotisation est active.']);
}

async function seed() {
  await seedProducts();
  if (config.admin.phone && config.admin.password) {
    await ensureUser({ role: 'admin', name: config.admin.name, phone: config.admin.phone, password: config.admin.password });
  } else if (config.seedDemo) {
    await ensureUser({ role: 'admin', name: 'Admin Démo', phone: '0700000000', password: 'admin1234' });
  }
  if (config.seedDemo) await seedDemo();
}

module.exports = { seed, ensureUser };
