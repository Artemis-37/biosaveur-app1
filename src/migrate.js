'use strict';
// Usage : npm run migrate — crée/met à jour les tables et insère les données de départ.
const db = require('./db');
const { seed } = require('./seed');

(async () => {
  await db.migrate();
  await seed();
  console.log('Base de données prête.');
  await db.pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
