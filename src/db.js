'use strict';
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('./config');

// DATE -> chaîne 'AAAA-MM-JJ' (pas de décalage de fuseau)
types.setTypeParser(1082, (v) => v);

// Les adresses Neon contiennent ?sslmode=require&channel_binding=require : on retire ces
// paramètres (gérés ci-dessous) pour éviter les conflits avec l'option ssl du pilote.
function cleanUrl(raw) {
  const s = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
  try {
    const u = new URL(s);
    const needSsl = ['require', 'verify-ca', 'verify-full'].includes(u.searchParams.get('sslmode'));
    ['sslmode', 'channel_binding', 'sslrootcert'].forEach((k) => u.searchParams.delete(k));
    return { url: u.toString(), needSsl, host: u.hostname };
  } catch (_) {
    return { url: s, needSsl: false, host: '' };
  }
}
const conn = cleanUrl(config.databaseUrl);

const pool = new Pool({
  connectionString: conn.url,
  ssl: config.databaseSsl || conn.needSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});
// une coupure réseau ne doit pas arrêter le serveur
pool.on('error', (e) => console.error('[db] connexion perdue :', e.message));

function query(text, params) {
  return pool.query(text, params);
}

async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

async function many(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

// Exécute fn(client) dans une transaction.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function getSetting(key, def = null) {
  const r = await one('SELECT value FROM settings WHERE key=$1', [key]);
  return r ? r.value : def;
}

async function setSetting(key, value) {
  await query(
    'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
    [key, String(value)]
  );
}

module.exports = { dbHost: conn.host, pool, query, one, many, tx, migrate, getSetting, setSetting };
