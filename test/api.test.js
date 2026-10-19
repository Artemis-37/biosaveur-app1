'use strict';
// Tests d'intégration de l'API. Nécessite une base PostgreSQL de test :
//   DATABASE_URL=postgres://localhost:5432/biosaveur_test npm test
const test = require('node:test');
const assert = require('node:assert');

process.env.SEED_DEMO = 'true';
process.env.RATE_LIMIT_OFF = '1';
process.env.CINETPAY_SIMULATE = 'true';
// faux serveur SMTP pour vérifier l'envoi des e-mails
const net = require('node:net');
const mails = [];
const smtp = net.createServer((s) => {
  let data = false, buf = '', cur = '';
  s.write('220 test ESMTP\r\n');
  s.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; mails.push(cur); cur = ''; s.write('250 ok\r\n'); } else cur += line + '\n'; continue; }
      const u = line.toUpperCase();
      if (u.startsWith('EHLO')) s.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (u.startsWith('AUTH')) s.write('235 ok\r\n');
      else if (u.startsWith('DATA')) { data = true; s.write('354 go\r\n'); }
      else if (u.startsWith('QUIT')) { s.write('221 bye\r\n'); s.end(); }
      else s.write('250 ok\r\n');
    }
  });
});
smtp.listen(0, '127.0.0.1');
process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_USER = 'x@test'; process.env.SMTP_PASS = 'pw';
const { app } = require('../src/server');
const db = require('../src/db');
const { seed } = require('../src/seed');

let server, base;
test.before(async () => {
  await new Promise((r) => (smtp.listening ? r() : smtp.once('listening', r)));
  process.env.SMTP_PORT = String(smtp.address().port);
  await db.migrate();
  await seed();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { smtp.close(); server.close(); await db.pool.end(); });

function agent() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'biosaveur', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
const today = new Date().toISOString().slice(0, 10);

test('parcours complet : inscription, commande, préparation, remise par QR', async () => {
  const c = agent();
  const phone = `07${String(Date.now()).slice(-8)}`;
  let r = await c('POST', '/auth/register', { name: 'Test Client', phone, password: 'secret12', commune: 'Cocody', address: 'Rue test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  r = await c('PUT', '/client/me', { name: 'Test Client', commune: 'Cocody', address: 'Rue test', landmark: 'Portail bleu', lat: 5.36, lng: -3.97 });
  assert.equal(r.body.lat, 5.36);

  const prods = (await c('GET', '/products')).body;
  const p = prods.find((x) => x.stock > 2);
  r = await c('POST', '/client/orders', { items: [{ product_id: p.id, qty: 2, option: p.options[0] }], day: today, slot: '10h – 12h', pay_method: 'livraison' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const order = r.body.order;
  assert.equal(order.total, p.price * 2 + 1000);
  const after = (await c('GET', `/products/${p.id}`)).body;
  assert.equal(after.stock, p.stock - 2, 'stock réservé');

  const qr = (await c('GET', `/client/orders/${order.id}`)).body.qr_code;

  const admin = agent();
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  r = await admin('PUT', `/admin/orders/${order.id}/status`, { status: 'livree' });
  assert.equal(r.status, 400, 'transition interdite');
  r = await admin('PUT', `/admin/orders/${order.id}/status`, { status: 'preparee' });
  assert.equal(r.status, 200);

  const drv = agent();
  await drv('POST', '/auth/login', { phone: '0700000002', password: 'demo1234' });
  const tour = (await drv('GET', '/driver/tour')).body.orders;
  assert.ok(tour.find((o) => o.id === order.id && o.lat === 5.36), 'commande visible avec GPS');
  r = await drv('POST', `/driver/orders/${order.id}/start`);
  assert.equal(r.status, 200);
  r = await drv('POST', `/driver/orders/${order.id}/deliver`, { code: 'QR-FAUX00' });
  assert.equal(r.status, 400, 'mauvais QR refusé');
  r = await drv('POST', `/driver/orders/${order.id}/deliver`, { code: qr });
  assert.equal(r.status, 200);
  const done = (await c('GET', `/client/orders/${order.id}`)).body;
  assert.equal(done.status, 'livree');
  assert.equal(done.paid, true);
});

test('stock insuffisant refusé', async () => {
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  const p = (await c('GET', '/products')).body[0];
  const r = await c('POST', '/client/orders', { items: [{ product_id: p.id, qty: p.stock + 1 }], day: today, slot: '10h – 12h', pay_method: 'livraison' });
  assert.equal(r.status, 400);
});

test('paiement en ligne simulé : refus puis acceptation', async () => {
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  const p = (await c('GET', '/products')).body.find((x) => x.stock > 1);
  let r = await c('POST', '/client/orders', { items: [{ product_id: p.id, qty: 1 }], day: today, slot: '14h – 16h', pay_method: 'cinetpay' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const tx = decodeURIComponent(r.body.payment_url.split('/').pop());
  r = await c('POST', `/cinetpay/simulate/${tx}`, { result: 'REFUSED' });
  let o = (await c('GET', `/client/orders/${r.body.ref_id}`)).body;
  assert.equal(o.status, 'annulee', 'commande annulée si refus');
  const stockBack = (await c('GET', `/products/${p.id}`)).body.stock;
  assert.equal(stockBack, p.stock, 'stock rendu');

  r = await c('POST', '/client/orders', { items: [{ product_id: p.id, qty: 1 }], day: today, slot: '14h – 16h', pay_method: 'cinetpay' });
  const tx2 = decodeURIComponent(r.body.payment_url.split('/').pop());
  r = await c('POST', `/cinetpay/simulate/${tx2}`, { result: 'ACCEPTED' });
  o = (await c('GET', `/client/orders/${r.body.ref_id}`)).body;
  assert.equal(o.status, 'confirmee');
  assert.equal(o.paid, true);
  // idempotence : une seconde notification ne change rien
  r = await c('POST', `/cinetpay/simulate/${tx2}`, { result: 'REFUSED' });
  o = (await c('GET', `/client/orders/${o.id}`)).body;
  assert.equal(o.status, 'confirmee');
});

test('cotisation : versements, complétion, livraison et renouvellement', async () => {
  const c = agent();
  const phone = `05${String(Date.now()).slice(-8)}`;
  await c('POST', '/auth/register', { name: 'Cot Test', phone, password: 'secret12', commune: 'Yopougon', address: 'Niangon' });
  let r = await c('POST', '/client/cotisation', { chickens: 2, delivery_day: 'Samedi' });
  assert.equal(r.status, 200);
  const cotId = r.body.id;
  const admin = agent();
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  r = await admin('POST', `/admin/cotisations/${cotId}/payments`, { amount: 10000, method: 'Espèces' });
  assert.equal(r.status, 200);
  const cot = (await c('GET', '/client/cotisation')).body.cotisation;
  assert.equal(cot.status, 'complete');
  r = await c('POST', '/client/cotisation/livrer', { day: today, slot: '08h – 10h' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'cotisation');
  const next = (await c('GET', '/client/cotisation')).body.cotisation;
  assert.ok(next && next.id !== cotId && next.paid === 0, 'nouvelle cotisation créée');
});

test('accès protégés', async () => {
  const anon = agent();
  assert.equal((await anon('GET', '/client/orders')).status, 401);
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  assert.equal((await c('GET', '/admin/overview')).status, 403);
  assert.equal((await c('GET', '/driver/tour')).status, 403);
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403, 'requête sans en-tête anti-CSRF refusée');
});

test('les rôles partenaire et fournisseur n’existent plus', async () => {
  for (const ph of ['0700000003', '0700000004']) assert.ok((await agent()('POST', '/auth/login', { phone: ph, password: 'demo1234' })).status >= 400, 'compte supprimé');
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  assert.equal((await c('GET', '/partner/overview')).status, 404);
  assert.equal((await c('GET', '/supplier/overview')).status, 404);
});

test('photo : téléversement admin, lecture publique, refus pour un client', async () => {
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(200, 1)]).toString('base64');
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  assert.equal((await c('POST', '/admin/upload', { data: png })).status, 403);
  const admin = agent();
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  assert.equal((await admin('POST', '/admin/upload', { data: 'data:image/png;base64,AAAA' })).status, 400);
  assert.equal((await admin('POST', '/admin/upload', { data: 'data:text/html;base64,PGI+' })).status, 400);
  const r = await admin('POST', '/admin/upload', { data: png });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const img = await fetch(base + r.body.url.replace('/api', ''));
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const p = (await admin('GET', '/admin/products')).body[0];
  assert.equal((await admin('PUT', `/admin/products/${p.id}`, { image_url: r.body.url })).status, 200);
  assert.equal((await admin('GET', `/products/${p.id}`)).body.image_url, r.body.url);
});

test('client : e-mail, QR personnel, photo de profil, badges', async () => {
  const c = agent();
  const phone = `07${String(Date.now()).slice(-8)}`;
  const email = `t${Date.now()}@exemple.com`;
  let r = await c('POST', '/auth/register', { name: 'Qr Test', phone, password: 'secret12', commune: 'Cocody', address: 'Rue', email });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.email, email);
  const byMail = agent();
  r = await byMail('POST', '/auth/login', { phone: email.toUpperCase(), password: 'secret12' });
  assert.equal(r.status, 200, 'connexion par e-mail');
  r = await c('GET', '/client/me/qr');
  assert.ok(r.body.token && r.body.svg.startsWith('<?xml') || r.body.svg.includes('<svg'));
  const tok = r.body.token;
  const viaQr = agent();
  r = await viaQr('POST', '/auth/qr', { token: `BSVQ:${tok}` });
  assert.equal(r.status, 200, 'connexion par QR');
  assert.equal((await viaQr('POST', '/auth/qr', { token: 'BSVQ:inconnuinconnuinconnuinconnu' })).status, 400);
  await c('POST', '/client/me/qr/regenerate');
  assert.equal((await agent()('POST', '/auth/qr', { token: tok })).status, 400, 'ancien QR invalide');
  const jpg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(300, 7)]).toString('base64');
  r = await c('PUT', '/client/me/avatar', { data: jpg });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.avatar_url, /^\/api\/images\/\d+$/);
  const l = (await c('GET', '/client/loyalty')).body;
  assert.equal(l.badges.find((b) => b.key === 'bienvenue').earned, true);
  assert.equal(l.badges.find((b) => b.key === 'premiere').earned, false);
  const demo = agent();
  await demo('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  assert.ok((await demo('GET', '/client/loyalty')).body.earned >= 3, 'client démo : plusieurs badges');
});

test('admin : graphiques, calendrier, zones, annonces, comptes équipe, sauvegarde', async () => {
  const admin = agent();
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  const ov = (await admin('GET', '/admin/overview')).body;
  assert.ok(ov.cotStatus.length > 0 && ov.evolution.length === 6);
  const cal = (await admin('GET', `/admin/calendar?month=${today.slice(0, 7)}`)).body;
  assert.ok(cal.days.length > 0, 'des livraisons dans le mois');
  const zones = (await admin('GET', '/admin/zones')).body;
  assert.ok(zones.length >= 3 && zones[0].clients > 0);
  let r = await admin('POST', '/admin/announcements', { audience: 'tous', body: 'Promo poulet fermier samedi !' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.recipients >= 10);
  assert.equal((await admin('POST', '/admin/announcements', { audience: 'nimporte', body: 'Message valide ici' })).status, 400);
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  assert.ok((await c('GET', '/client/notifications')).body.some((n) => n.body.includes('Promo poulet fermier')));
  assert.equal((await c('POST', '/admin/announcements', { audience: 'tous', body: 'Pirate message' })).status, 403);
  const staff = (await admin('GET', '/admin/staff')).body;
  const drv = staff.find((s) => s.phone === '0700000012');
  r = await admin('PUT', `/admin/staff/${drv.id}`, { name: 'Awa Diallo (livreuse démo)', phone: '0700000012' });
  assert.equal(r.status, 200);
  assert.equal((await admin('PUT', `/admin/staff/${drv.id}`, { phone: '0700000002' })).status, 400, 'numéro déjà pris');
  const bk = await fetch(base + '/admin/backup', { headers: { 'X-Requested-With': 'biosaveur', cookie: '' } });
  assert.equal(bk.status, 401);
  const raw = await (async () => { const a = agent(); await a('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' }); return a('GET', '/admin/backup'); })();
  assert.equal(raw.status, 200);
  assert.ok(raw.body.tables.orders.length > 100);
  assert.ok(!JSON.stringify(raw.body).includes('password_hash'), 'aucun hash de mot de passe');
});

test('push : clé publique, abonnement, envoi sans erreur', async () => {
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  const k = (await c('GET', '/client/push/key')).body.key;
  assert.ok(k && k.length > 60);
  assert.equal((await c('POST', '/client/push/subscribe', { subscription: { endpoint: 'http://x', keys: {} } })).status, 400);
  const r = await c('POST', '/client/push/subscribe', { subscription: { endpoint: 'https://127.0.0.1:1/fake', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } } });
  assert.equal(r.status, 200);
  const admin = agent();
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  assert.equal((await c('POST', '/client/push/device', { token: 'short' })).status, 400);
  const tok = 'fcm-token-de-test-' + 'x'.repeat(60);
  assert.equal((await c('POST', '/client/push/device', { token: tok, platform: 'android' })).status, 200);
  assert.equal((await admin('POST', '/admin/announcements', { audience: 'tous', body: 'Test push sans erreur' })).status, 200);
  assert.equal((await c('POST', '/client/push/device/remove', { token: tok })).status, 200);
});

test('précommande événementielle : 3 jours minimum, 60 jours maximum', async () => {
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  const ev = (await c('GET', '/products')).body.find((p) => p.category === 'evenements');
  const plus = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
  const order = (day) => c('POST', '/client/orders', { items: [{ product_id: ev.id, qty: 1, option: ev.options[0] }], day, slot: '10h – 12h', pay_method: 'livraison' });
  assert.equal((await order(plus(1))).status, 400, 'trop tôt');
  assert.equal((await order(plus(70))).status, 400, 'trop tard');
  const ok = await order(plus(30));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const norm = (await c('GET', '/products')).body.find((p) => p.category !== 'evenements' && p.stock > 1);
  assert.equal((await c('POST', '/client/orders', { items: [{ product_id: norm.id, qty: 1 }], day: plus(30), slot: '10h – 12h', pay_method: 'livraison' })).status, 400, 'produit normal : 14 jours max');
});

test('e-mail : notification envoyée au client qui en a un, sauf s\'il la désactive', async () => {
  const c = agent();
  const phone = `07${String(Date.now()).slice(-8)}`;
  const email = `mail${Date.now()}@exemple.com`;
  mails.length = 0;
  await c('POST', '/auth/register', { name: 'Mail Test', phone, password: 'secret12', commune: 'Cocody', address: 'Rue', email });
  await new Promise((r) => setTimeout(r, 3500));
  const m = mails.find((x) => x.includes(email));
  assert.ok(m, 'e-mail de bienvenue reçu');
  assert.match(m, /Bienvenue chez BIOSAVEUR/);
  const r = await c('PUT', '/client/me', { name: 'Mail Test', commune: 'Cocody', address: 'Rue', email, email_notifs: false });
  assert.equal(r.body.email_notifs, false);
  const admin = agent();
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  mails.length = 0;
  await admin('POST', '/admin/announcements', { audience: 'commune:Cocody', body: 'Annonce par e-mail test' });
  await new Promise((r2) => setTimeout(r2, 3500));
  assert.ok(!mails.some((x) => x.includes(email)), 'pas d’e-mail si désactivé');
});

test('sécurité : prix/total falsifiés (Burp / MITM) ignorés ou refusés et signalés', async () => {
  const c = agent();
  await c('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  const p = (await c('GET', '/products')).body.find((x) => x.stock > 5 && x.category !== 'evenements');
  const opt = p.options && p.options.length ? { option: p.options[0] } : {};
  const day = new Date().toISOString().slice(0, 10);
  const base = { items: [{ product_id: p.id, qty: 1, ...opt }], day, slot: '10h – 12h', pay_method: 'livraison' };
  // Total affiché falsifié à la baisse : refus
  let r = await c('POST', '/client/orders', { ...base, expected_total: 100 });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  // Prix injecté dans les lignes : ignoré, le serveur recalcule
  r = await c('POST', '/client/orders', { ...base, items: [{ product_id: p.id, qty: 1, ...opt, price: 1, unit_price: 1 }], total: 1, fee: 0, expected_total: p.price + 1000 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.total, p.price + 1000);
  // Quantité négative ou non entière : refus
  r = await c('POST', '/client/orders', { ...base, items: [{ product_id: p.id, qty: -3, ...opt }] });
  assert.equal(r.status, 400);
  // Alerte enregistrée pour l'administrateur
  const a = agent();
  await a('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  const log = await a('GET', '/admin/audit');
  assert.ok(JSON.stringify(log.body).includes('ALERTE sécurité'), 'alerte sécurité journalisée');
});

test('enveloppe chiffrée : prix illisibles pour un proxy, requête altérée refusée', async () => {
  const { seal, open } = require('../src/envelope');
  const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'biosaveur', 'X-Enc': '1' };
  const raw = await fetch(base + '/products', { headers: H });
  const txt = await raw.text();
  assert.ok(!txt.includes('price'), 'aucun prix en clair dans la réponse');
  const list = open(JSON.parse(txt).e);
  assert.ok(Array.isArray(list) && list[0].price > 0, 'déchiffrable avec la clé de l’appli');
  // connexion chiffrée puis corps altéré
  let r = await fetch(base + '/auth/login', { method: 'POST', headers: H, body: JSON.stringify(seal({ phone: '0700000001', password: 'demo1234' })) });
  assert.equal(r.status, 200);
  const env = seal({ phone: '0700000001', password: 'demo1234' });
  const flipped = env.e.slice(0, 20) + (env.e[20] === 'A' ? 'B' : 'A') + env.e.slice(21);
  r = await fetch(base + '/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ e: flipped }) });
  assert.equal(r.status, 400, 'octet modifié = rejeté (GCM)');
});

test('CORS : l’appli mobile peut envoyer l’en-tête X-Enc', async () => {
  const r = await fetch(base + '/products', { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-enc,x-requested-with' } });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-headers'), /X-Enc/);
});

test('notifications équipe : admin (nouvelle commande) et livreur (affectation)', async () => {
  const cl = agent(), ad = agent(), lv = agent();
  await cl('POST', '/auth/login', { phone: '0700000001', password: 'demo1234' });
  await ad('POST', '/auth/login', { phone: '0700000000', password: 'demo1234' });
  await lv('POST', '/auth/login', { phone: '0700000012', password: 'demo1234' });
  assert.equal((await cl('GET', '/staff/notifications')).status, 403, 'réservé à l’équipe');
  const p = (await cl('GET', '/products')).body.find((x) => x.stock > 5 && x.category !== 'evenements');
  const opt = p.options && p.options.length ? { option: p.options[0] } : {};
  const day = new Date().toISOString().slice(0, 10);
  const o = await cl('POST', '/client/orders', { items: [{ product_id: p.id, qty: 1, ...opt }], day, slot: '10h – 12h', pay_method: 'livraison' });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  const before = (await ad('GET', '/staff/notifications/count')).body.unread;
  assert.ok(before >= 1);
  const list = (await ad('GET', '/staff/notifications')).body;
  assert.ok(list.some((n) => n.body.includes(o.body.order.number) && n.body.includes('Nouvelle commande')));
  await ad('POST', '/staff/notifications/read', {});
  assert.equal((await ad('GET', '/staff/notifications/count')).body.unread, 0);
  const drv = (await ad('GET', '/admin/staff')).body;
  const driver = (Array.isArray(drv) ? drv : []).find((u) => u.phone === '0700000012') || (Array.isArray(drv) ? drv : []).find((u) => u.role === 'livreur');
  assert.ok(driver, 'un livreur existe');
  {
    await ad('PUT', `/admin/orders/${o.body.order.id}/driver`, { driver_id: driver.id });
    const l2 = agent();
    await l2('POST', '/auth/login', { phone: driver.phone, password: 'demo1234' });
    const n = (await l2('GET', '/staff/notifications')).body;
    assert.ok(n.some((x) => x.body.includes('Nouvelle livraison')), 'livreur notifié');
  }
});

test('rôles directeur et informaticien : accès adaptés', async () => {
  const dir = agent(), inf = agent();
  assert.equal((await dir('POST', '/auth/login', { phone: '0700000015', password: 'demo1234' })).status, 200);
  assert.equal((await inf('POST', '/auth/login', { phone: '0700000016', password: 'demo1234' })).status, 200);
  assert.equal((await dir('GET', '/admin/overview')).status, 200, 'directeur : accès complet');
  assert.equal((await dir('GET', '/admin/clients')).status, 200);
  assert.equal((await inf('GET', '/admin/products')).status, 200, 'informaticien : produits');
  assert.equal((await inf('GET', '/admin/audit')).status, 200, 'informaticien : journal');
  assert.equal((await inf('GET', '/admin/cinetpay')).status, 200, 'informaticien : CinetPay');
  for (const p of ['/admin/clients', '/admin/overview', '/admin/cotisations', '/admin/backup', '/admin/staff']) {
    assert.equal((await inf('GET', p)).status, 403, `informaticien refusé : ${p}`);
  }
  const anon = agent();
  assert.equal((await anon('GET', '/admin/overview')).status, 401);
});
