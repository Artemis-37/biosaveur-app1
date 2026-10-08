'use strict';
// Tests d'intégration de l'API. Nécessite une base PostgreSQL de test :
//   DATABASE_URL=postgres://localhost:5432/biosaveur_test npm test
const test = require('node:test');
const assert = require('node:assert');

process.env.SEED_DEMO = 'true';
process.env.CINETPAY_SIMULATE = 'true';
const { app } = require('../src/server');
const db = require('../src/db');
const { seed } = require('../src/seed');

let server, base;
test.before(async () => {
  await db.migrate();
  await seed();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { server.close(); await db.pool.end(); });

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
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'admin1234' });
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
  await admin('POST', '/auth/login', { phone: '0700000000', password: 'admin1234' });
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
