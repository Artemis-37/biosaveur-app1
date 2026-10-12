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

async function ensureUser({ role, name, phone, password, commune = '', address = '', landmark = '', lat = null, lng = null, demo = false, company = '', referredBy = null, createdAt = null }) {
  phone = normPhone(phone);
  const ex = await db.one('SELECT id FROM users WHERE phone=$1', [phone]);
  if (ex) return ex.id;
  const u = await db.one(
    `INSERT INTO users(role,name,phone,password_hash,commune,address,landmark,lat,lng,referral_code,demo,company,referred_by,created_at,last_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,now()),COALESCE($14,now())) RETURNING id`,
    [role, name, phone, await hash(password), commune, address, landmark, lat, lng, `BSV-${code(4)}`, demo, company, referredBy, createdAt]
  );
  return u.id;
}

/* ---------------- Démonstration ---------------- */
const DEMO_PASSWORD = 'demo1234';
const DEMO_ACCOUNTS = [
  { role: 'admin', name: 'Admin Démo', phone: '0700000000' },
  { role: 'client', name: 'Client Démo', phone: '0700000001', commune: 'Marcory', address: 'Zone 4, rue du Canal', landmark: 'Immeuble beige, 2e porte', lat: 5.2971, lng: -3.9862 },
  { role: 'livreur', name: 'Ibrahim Ouattara (livreur démo)', phone: '0700000002' },
  { role: 'fournisseur', name: 'Moussa Koné', company: 'Coopérative avicole de Bingerville', phone: '0700000003' },
  { role: 'partenaire', name: 'Adjoua Brou', company: 'Superette Le Bon Coin · Cocody', phone: '0700000004' },
];

// générateur pseudo-aléatoire reproductible
function rng(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

async function seedDemo() {
  if (await db.one('SELECT 1 FROM users WHERE demo LIMIT 1')) return;
  const R = rng(20261012);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const today = new Date();
  const ids = {};
  for (const a of DEMO_ACCOUNTS) ids[a.role] = await ensureUser({ ...a, password: DEMO_PASSWORD, demo: true, createdAt: addDays(-200) });
  await db.query('UPDATE users SET demo=true WHERE id = ANY($1)', [Object.values(ids)]);

  // équipe complémentaire
  const driver2 = await ensureUser({ role: 'livreur', name: 'Awa Diallo (livreuse démo)', phone: '0700000012', password: DEMO_PASSWORD, demo: true });
  const supplier2 = await ensureUser({ role: 'fournisseur', name: 'Paul Assi', company: 'Coopérative d’Azaguié', phone: '0700000013', password: DEMO_PASSWORD, demo: true });
  const partner2 = await ensureUser({ role: 'partenaire', name: 'Issa Traoré', company: 'Boutique Chez Issa · Yopougon', phone: '0700000014', password: DEMO_PASSWORD, demo: true });
  await db.query('UPDATE users SET commission_rate=0.07 WHERE id=$1', [partner2]);

  // fournisseurs des produits
  await db.query("UPDATE products SET supplier_id=$1 WHERE supplier ILIKE '%Bingerville%' OR supplier ILIKE '%BIOSAVEUR%' OR supplier ILIKE '%Fumoir%'", [ids.fournisseur]);
  await db.query("UPDATE products SET supplier_id=$1 WHERE supplier ILIKE '%Azagui%'", [supplier2]);

  // clients fictifs
  const CL = [
    ['Aya Kouassi', '0708123456', 'Cocody', 'Riviera 3, rue des Jardins', 'Portail vert après la boulangerie', 5.3612, -3.9681, ids.partenaire],
    ['Koffi N’Guessan', '0544982107', 'Yopougon', 'Niangon Sud, près de la pharmacie', 'Face à la pharmacie Niangon', 5.3262, -4.0893, partner2],
    ['Serge Bamba', '0759886644', 'Plateau', 'Immeuble Alpha, 4e étage', 'Accueil de l’immeuble Alpha', 5.3239, -4.0187, null],
    ['Yao Konan', '0777102030', 'Abobo', 'Abobo Baoulé, carrefour Samaké', 'Derrière la station', 5.4236, -4.0198, null],
    ['Mariam Traoré', '0123456789', 'Marcory', 'Zone 4, rue du Docteur Blanchard', 'Portail bleu', 5.2950, -3.9905, ids.partenaire],
    ['Fatou Diabaté', '0501020304', 'Treichville', 'Avenue 12, rue 21', 'À côté de la mosquée', 5.2958, -4.0069, null],
    ['Jean-Marc Ehui', '0711223344', 'Bingerville', 'Cité Feh Kessé, villa 18', 'Portail noir', 5.3561, -3.8912, null],
    ['Awa Coulibaly', '0140506070', 'Koumassi', 'Remblais, derrière le marché', '', 5.2934, -3.9527, partner2],
    ['Didier Yapi', '0767890123', 'Cocody', 'Angré 8e tranche, villa 45', 'Près du château d’eau', 5.3950, -3.9890, ids.partenaire],
    ['Nadia Kacou', '0556677889', 'Port-Bouët', 'Gonzagueville, rue des Pêcheurs', 'Maison jaune', 5.2560, -3.9350, null],
  ];
  const clients = [ids.client];
  for (let i = 0; i < CL.length; i++) {
    const c = CL[i];
    const id = await ensureUser({ role: 'client', name: c[0], phone: c[1], password: DEMO_PASSWORD, commune: c[2], address: c[3], landmark: c[4], lat: c[5], lng: c[6], demo: true, referredBy: c[7], createdAt: addDays(-170 + i * 12) });
    clients.push(id);
  }
  // deux clients inactifs depuis plus de 30 jours
  await db.query("UPDATE users SET last_active = now() - interval '45 days' WHERE phone IN ('0501020304','0140506070')");
  await db.query("UPDATE users SET last_active = now() - interval '2 days' WHERE demo AND role='client' AND phone NOT IN ('0501020304','0140506070')");
  await db.query('UPDATE users SET points=1500 WHERE id=$1', [ids.client]);
  await db.query('UPDATE users SET referred_by=$2 WHERE id=$1', [clients[6], ids.client]); // Fatou, filleule du client démo

  const prods = await db.many('SELECT id,name,price,options FROM products ORDER BY sort');
  const users = await db.many('SELECT * FROM users WHERE id = ANY($1)', [clients]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const slots = config.shop.slots;
  const fee = config.shop.deliveryFee;

  async function order(uid, items, dayOffset, status, pay, slotIdx, driver, kind = 'commande') {
    const u = byId.get(uid);
    const day = isoDate(addDays(dayOffset, today));
    const created = addDays(dayOffset - 1, today);
    const sub = kind === 'cotisation' ? items.reduce((s, [pi, q]) => s + config.shop.chickenPrice * q, 0) : items.reduce((s, [pi, q]) => s + prods[pi].price * q, 0);
    const f = kind === 'cotisation' ? 0 : fee;
    const paid = status === 'livree' || pay !== 'livraison';
    const num = await db.one("SELECT 'CMD-' || nextval('order_number_seq') AS n");
    const delivered = status === 'livree' ? new Date(new Date(`${day}T${['09', '11', '15', '18'][slotIdx]}:20:00Z`).getTime()) : null;
    const o = await db.one(
      `INSERT INTO orders(number,user_id,kind,day,slot,status,pay_method,paid,subtotal,fee,total,qr_code,driver_id,address,commune,landmark,lat,lng,created_at,delivered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [num.n, uid, kind, day, slots[slotIdx], status, pay, paid, sub, f, sub + f, `QR-${code(6)}`, driver, u.address, u.commune, u.landmark, u.lat, u.lng, created, delivered]);
    for (const [pi, q] of items) {
      const name = kind === 'cotisation' ? 'Poulet entier (cotisation)' : prods[pi].name;
      await db.query('INSERT INTO order_items(order_id,product_id,name,option,qty,unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [o.id, kind === 'cotisation' ? null : prods[pi].id, name, kind === 'cotisation' ? 'Entier' : prods[pi].options[0], q, kind === 'cotisation' ? config.shop.chickenPrice : prods[pi].price]);
    }
    return o.id;
  }
  const basket = () => {
    const n = 1 + Math.floor(R() * 3), items = [], used = new Set();
    for (let i = 0; i < n; i++) { const pi = Math.floor(R() * 9); if (!used.has(pi)) { used.add(pi); items.push([pi, 1 + Math.floor(R() * 3)]); } }
    return items;
  };
  const drivers = [ids.livreur, driver2];
  // historique : environ 6 mois de livraisons
  for (let d = -175; d <= -1; d += 1 + Math.floor(R() * 3)) {
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      await order(pick(clients), basket(), d, R() < 0.04 ? 'annulee' : 'livree', pick(['livraison', 'livraison', 'cotisation', 'cinetpay']), Math.floor(R() * 4), pick(drivers));
    }
  }
  // aujourd'hui : une tournée complète à tous les stades
  await order(clients[2], [[1, 2]], 0, 'livree', 'livraison', 0, ids.livreur);
  await order(clients[1], [[0, 1], [4, 2]], 0, 'en_route', 'livraison', 1, ids.livreur);
  await order(clients[3], [[2, 1]], 0, 'preparee', 'cinetpay', 1, ids.livreur);
  await order(clients[9], [[3, 2], [8, 1]], 0, 'preparee', 'livraison', 2, null);
  await order(clients[4], [[5, 1]], 0, 'confirmee', 'livraison', 3, null);
  await order(ids.client, [[0, 1], [6, 1]], 0, 'en_route', 'livraison', 2, ids.livreur);
  await order(clients[7], [[0, 3]], 1, 'confirmee', 'cotisation', 0, null, 'cotisation');
  await order(clients[10], [[9, 1]], 2, 'confirmee', 'cinetpay', 1, null);

  // cotisations
  const cots = [
    [ids.client, 6, 18500, 'Samedi'], [clients[1], 4, 20000, 'Vendredi'], [clients[4], 10, 32000, 'Dimanche'],
    [clients[6], 3, 6000, 'Samedi'], [clients[9], 8, 40000, 'Mercredi'], [clients[5], 5, 5000, 'Samedi'], [clients[3], 2, 4000, 'Jeudi'],
  ];
  for (const [uid, n, paid, day] of cots) {
    const target = n * config.shop.chickenPrice;
    const cot = await db.one('INSERT INTO cotisations(user_id,chickens,unit_price,paid,delivery_day,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [uid, n, config.shop.chickenPrice, paid, day, paid >= target ? 'complete' : 'active', addDays(-120)]);
    let rest = paid, d = -110;
    while (rest > 0) {
      const m = Math.min(rest, pick([2000, 4000, 5000, 10000]));
      await db.query('INSERT INTO cotisation_payments(cotisation_id,amount,method,created_at) VALUES ($1,$2,$3,$4)', [cot.id, m, pick(['Espèces', 'Mobile Money', 'Mobile Money']), addDays(d)]);
      rest -= m; d += 8 + Math.floor(R() * 10); if (d > -1) d = -1;
    }
  }
  // cotisations déjà livrées (historique de fidélité)
  for (const uid of [ids.client, clients[1], clients[4]]) {
    const c = await db.one("INSERT INTO cotisations(user_id,chickens,unit_price,paid,delivery_day,status,created_at) VALUES ($1,6,$2,$3,'Samedi','livree',$4) RETURNING id", [uid, config.shop.chickenPrice, 6 * config.shop.chickenPrice, addDays(-170)]);
    await db.query("INSERT INTO cotisation_payments(cotisation_id,amount,method,created_at) VALUES ($1,$2,'Mobile Money',$3)", [c.id, 6 * config.shop.chickenPrice, addDays(-150)]);
  }

  // approvisionnements
  const supply = [
    [ids.fournisseur, 0, 60, 'livree', -40], [ids.fournisseur, 2, 20, 'livree', -25], [supplier2, 1, 30, 'livree', -18],
    [ids.fournisseur, 0, 50, 'livree', -9], [ids.fournisseur, 4, 25, 'confirmee', 2], [ids.fournisseur, 8, 30, 'demandee', 3],
    [supplier2, 1, 15, 'demandee', 4], [ids.fournisseur, 7, 12, 'demandee', 2],
  ];
  for (const [sid, pi, qty, st, due] of supply) {
    const num = await db.one("SELECT 'APP-' || nextval('supply_number_seq') AS n");
    await db.query(`INSERT INTO supply_orders(number,supplier_id,product_id,product_name,qty,unit_cost,due_date,status,created_by,created_at,confirmed_at,delivered_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [num.n, sid, prods[pi].id, prods[pi].name, qty, Math.round(prods[pi].price * 0.62), isoDate(addDays(due)), st, ids.admin, addDays(due - 4),
        st !== 'demandee' ? addDays(due - 3) : null, st === 'livree' ? addDays(due) : null]);
  }
  // commissions déjà versées
  await db.query("INSERT INTO partner_payouts(partner_id,amount,method,note,created_by,created_at) VALUES ($1,15000,'Mobile Money','Commissions août',$2,$3)", [ids.partenaire, ids.admin, addDays(-40)]);

  // messages et notifications
  const msg = (uid, team, body, d, read = true) => db.query('INSERT INTO messages(user_id,from_team,author_id,body,read,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [uid, team, team ? ids.admin : uid, body, read, addDays(d)]);
  await msg(ids.client, false, 'Bonjour, puis-je changer mon jour de livraison de cotisation ?', -3);
  await msg(ids.client, true, 'Bonjour ! Oui, depuis « Ma cotisation » vous pouvez choisir un autre jour.', -3);
  await msg(ids.client, true, 'Votre commande du jour est en route, le livreur vous appellera à l’arrivée.', 0, false);
  await msg(clients[4], false, 'Je voudrais reprendre ma cotisation le mois prochain. Est-ce possible ?', -1, false);
  await msg(clients[8], false, 'Livrez-vous à Anyama ?', 0, false);
  await msg(clients[1], false, 'Merci pour la livraison rapide !', -2);
  const note = (uid, body, d, read = false) => db.query('INSERT INTO notifications(user_id,body,read,created_at) VALUES ($1,$2,$3,$4)', [uid, body, read, addDays(d)]);
  await note(ids.client, 'Bienvenue sur la démo BIOSAVEUR ! Toutes les données sont fictives.', -10, true);
  await note(ids.client, 'Versement de cotisation reçu : 4 000 FCFA.', -7);
  await note(ids.client, 'Votre commande est en route.', 0);
  await note(ids.fournisseur, 'Nouvelle commande d’approvisionnement : 30 × Gésiers de poulet.', -1);
  await note(ids.partenaire, 'Nouveau client apporté : Didier Yapi.', -5);

  await db.setSetting('objectif_mensuel', '150000');
  console.log('[démo] données de démonstration créées');
}

async function seed() {
  await seedProducts();
  if (config.admin.phone && config.admin.password) {
    await ensureUser({ role: 'admin', name: config.admin.name, phone: config.admin.phone, password: config.admin.password });
  }
  if (config.seedDemo) await seedDemo();
}

module.exports = { seed, ensureUser, DEMO_ACCOUNTS, DEMO_PASSWORD };
