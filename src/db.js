'use strict';
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('./config');

// DATE -> chaîne 'AAAA-MM-JJ' (pas de décalage de fuseau)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

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

module.exports = { pool, query, one, many, tx, migrate, getSetting, setSetting };
