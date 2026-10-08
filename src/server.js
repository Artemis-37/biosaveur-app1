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

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/public').router);
app.use('/api/client', require('./routes/client'));
app.use('/api/driver', require('./routes/driver'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/cinetpay', require('./routes/cinetpay'));

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

async function start() {
  await db.migrate();
  await seed();
  setInterval(() => services.expireStalePayments().catch((e) => console.error('[expire]', e.message)), 10 * 60e3);
  app.listen(config.port, () => {
    console.log(`BIOSAVEUR Molo Molo en ligne sur le port ${config.port} — paiement : ${require('./cinetpay').mode()}`);
  });
}

if (require.main === module) {
  start().catch((e) => {
    console.error('Démarrage impossible :', e);
    process.exit(1);
  });
}

module.exports = { app, start };
