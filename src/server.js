'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const { seed } = require('./seed');
const { loadUser } = require('./auth');
const services = require('./services');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  next();
});
// CORS : les applis mobiles appellent l'API depuis capacitor://localhost (iOS) ou https://localhost (Android).
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && config.appOrigins.includes(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Client',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(cookieParser());
app.use(loadUser);

// Protection CSRF simple : les requêtes d'écriture de l'API doivent venir de notre propre page.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/cinetpay/notify') || req.path.startsWith('/cinetpay/return')) return next();
  if (req.get('X-Requested-With') !== 'biosaveur') return res.status(403).json({ error: 'Requête refusée.' });
  next();
});

// État du service : toujours 200 pour Render, avec l'état de la base pour le diagnostic.
const status = { started: false, db: 'démarrage', error: null, since: new Date().toISOString() };
app.get('/api/health', (req, res) => res.json({ ok: status.db === 'ok', db: status.db, error: status.error, dbHost: db.dbHost, since: status.since }));
// Tant que la base n'est pas prête, l'API répond 503 avec un message clair.
app.use('/api', (req, res, next) => {
  if (!status.started || status.db === 'ok') return next();
  res.status(503).json({ error: 'Le service démarre, réessayez dans un instant.' });
});
app.use('/api', require('./routes/public').router);
app.use('/api/client', require('./routes/client'));
app.use('/api/driver', require('./routes/driver'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/cinetpay', require('./routes/cinetpay'));
app.use('/api/supplier', require('./routes/supplier').router);
app.use('/api/partner', require('./routes/partner').router);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '1h' : 0, index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Erreurs : message lisible pour l'utilisateur, détail dans les journaux.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur interne. Réessayez dans un instant.' : err.message });
});

async function prepareDb(attempt = 1) {
  if (db.dbInvalid) {
    status.db = 'erreur';
    status.error = 'DATABASE_URL invalide : elle doit contenir une adresse qui commence par postgresql://';
    console.error(`[db] ${status.error}`);
    return;
  }
  try {
    await db.migrate();
    await seed();
    status.db = 'ok';
    status.error = null;
    console.log('[db] base prête');
  } catch (e) {
    status.db = 'erreur';
    status.error = `${e.code || ''} ${e.message}`.trim();
    console.error(`[db] tentative ${attempt} échouée : ${status.error}`);
    setTimeout(() => prepareDb(attempt + 1), Math.min(60000, 5000 * attempt));
  }
}

async function start() {
  status.started = true;
  await new Promise((resolve) => app.listen(config.port, resolve));
  console.log(`BIOSAVEUR Molo Molo en ligne sur le port ${config.port} — paiement : ${require('./cinetpay').mode()} — base : ${db.dbHost || 'non configurée'}`);
  await prepareDb();
  setInterval(() => services.expireStalePayments().catch((e) => console.error('[expire]', e.message)), 10 * 60e3);
}

if (require.main === module) {
  start().catch((e) => {
    console.error('Démarrage impossible :', e);
    process.exit(1);
  });
}

module.exports = { app, start };
