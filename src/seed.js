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

  // clients fictifs
  const CL = [
    ['Aya Kouassi', '0708123456', 'Cocody', 'Riviera 3, rue des Jardins', 'Portail vert après la boulangerie', 5.3612, -3.9681, null],
    ['Koffi N’Guessan', '0544982107', 'Yopougon', 'Niangon Sud, près de la pharmacie', 'Face à la pharmacie Niangon', 5.3262, -4.0893, null],
    ['Serge Bamba', '0759886644', 'Plateau', 'Immeuble Alpha, 4e étage', 'Accueil de l’immeuble Alpha', 5.3239, -4.0187, null],
    ['Yao Konan', '0777102030', 'Abobo', 'Abobo Baoulé, carrefour Samaké', 'Derrière la station', 5.4236, -4.0198, null],
    ['Mariam Traoré', '0123456789', 'Marcory', 'Zone 4, rue du Docteur Blanchard', 'Portail bleu', 5.2950, -3.9905, null],
    ['Fatou Diabaté', '0501020304', 'Treichville', 'Avenue 12, rue 21', 'À côté de la mosquée', 5.2958, -4.0069, null],
    ['Jean-Marc Ehui', '0711223344', 'Bingerville', 'Cité Feh Kessé, villa 18', 'Portail noir', 5.3561, -3.8912, null],
    ['Awa Coulibaly', '0140506070', 'Koumassi', 'Remblais, derrière le marché', '', 5.2934, -3.9527, null],
    ['Didier Yapi', '0767890123', 'Cocody', 'Angré 8e tranche, villa 45', 'Près du château d’eau', 5.3950, -3.9890, null],
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

  for (const [aud, body, n, off] of [
    ['tous', 'Nouveau : le poulet braisé est disponible chaque samedi. Commandez avant vendredi 18h !', 11, -21],
    ['inactifs', 'Vous nous manquez ! -10 % sur votre prochaine commande de poulet fermier cette semaine.', 2, -9],
    ['cotisation_complete', 'Votre cotisation est complète : programmez votre livraison depuis l’appli.', 2, -3],
  ]) await db.query('INSERT INTO announcements(audience,body,recipients,created_by,created_at) VALUES ($1,$2,$3,$4,$5)', [aud, body, n, ids.admin, addDays(off)]);
  await db.setSetting('objectif_mensuel', '150000');
  console.log('[démo] données de démonstration créées');
}


// --- démo : dates toujours d'actualité ---------------------------------------------------------
// Les données fictives sont créées à une date donnée. Pour que « la tournée du jour », les commandes
// d'aujourd'hui, etc. restent cohérentes, on décale toutes les dates du nombre de jours écoulés.
async function rebaseDemo() {
  const today = isoDate();
  let anchor = await db.getSetting('demo_anchor');
  if (!anchor) {
    const a = await db.one("SELECT created_at::date::text AS d FROM notifications WHERE body='Votre commande est en route.' ORDER BY id LIMIT 1");
    anchor = a ? a.d : today;
  }
  const n = Math.round((Date.parse(today) - Date.parse(anchor)) / 86400000);
  if (n > 0) {
    await db.tx(async (c) => {
      const iv = `${n} days`;
      await c.query('UPDATE orders SET day = day + $1::interval, created_at = created_at + $1::interval, delivered_at = delivered_at + $1::interval', [iv]);
      await c.query('UPDATE cotisations SET created_at = created_at + $1::interval', [iv]);
      await c.query('UPDATE cotisation_payments SET created_at = created_at + $1::interval', [iv]);
      await c.query('UPDATE announcements SET created_at = created_at + $1::interval', [iv]);
      await c.query('UPDATE messages SET created_at = created_at + $1::interval', [iv]);
      await c.query('UPDATE notifications SET created_at = created_at + $1::interval', [iv]);
      await c.query('UPDATE products SET slaughter_date = slaughter_date + $1::interval', [iv]);
      await c.query('UPDATE users SET created_at = created_at + $1::interval WHERE demo', [iv]);
    });
    console.log(`[démo] dates décalées de ${n} jour(s)`);
  }
  await db.setSetting('demo_anchor', today);
}

// --- démo : photos illustrées des produits -------------------------------------------------------
const PHOTO_COLORS = { entier: ['#fde7b0', '#d98324'], decoupes: ['#ffd9cc', '#c8472c'], packs: ['#d7f0c2', '#2f8f1e'], fume: ['#e6d3c0', '#6d4426'], abats: ['#f3d0d6', '#a23b52'], evenements: ['#dcd6f5', '#5a49b5'] };
function photoSvg(name, cat) {
  const [bg, fg] = PHOTO_COLORS[cat] || PHOTO_COLORS.entier;
  const esc = (s) => String(s).replace(/[<>&"]/g, '');
  const words = esc(name).split(' '); const l1 = []; const l2 = []; let len = 0;
  for (const w of words) { (len + w.length < 17 ? l1 : l2).push(w); len += w.length + 1; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${bg}"/>` +
    `<ellipse cx="200" cy="262" rx="130" ry="14" fill="${fg}" opacity=".18"/>` +
    `<ellipse cx="200" cy="150" rx="105" ry="78" fill="${fg}"/><ellipse cx="200" cy="140" rx="88" ry="60" fill="#fff" opacity=".22"/>` +
    `<ellipse cx="108" cy="178" rx="26" ry="14" fill="${fg}" transform="rotate(-28 108 178)"/><ellipse cx="292" cy="178" rx="26" ry="14" fill="${fg}" transform="rotate(28 292 178)"/>` +
    `<circle cx="262" cy="92" r="26" fill="${fg}"/><circle cx="270" cy="86" r="4" fill="#fff"/>` +
    `<text x="200" y="${l2.length ? 36 : 44}" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#103d3a">${l1.join(' ')}</text>` +
    (l2.length ? `<text x="200" y="64" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#103d3a">${l2.join(' ')}</text>` : '') +
    `</svg>`;
}
async function seedDemoPhotos() {
  const list = await db.many("SELECT id, name, category FROM products WHERE image_url = '' ORDER BY id");
  for (const p of list) {
    const img = await db.one('INSERT INTO images(mime,data) VALUES ($1,$2) RETURNING id', ['image/svg+xml', Buffer.from(photoSvg(p.name, p.category))]);
    await db.query('UPDATE products SET image_url=$2 WHERE id=$1', [p.id, `/api/images/${img.id}`]);
  }
}

async function seed() {
  await seedProducts();
  if (config.admin.phone && config.admin.password) {
    await ensureUser({ role: 'admin', name: config.admin.name, phone: config.admin.phone, password: config.admin.password });
  }
  if (config.seedDemo) { await seedDemo(); await seedDemoPhotos(); await rebaseDemo(); }
}

module.exports = { seed, rebaseDemo, ensureUser, DEMO_ACCOUNTS, DEMO_PASSWORD };
