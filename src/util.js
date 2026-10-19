'use strict';
const crypto = require('crypto');
const db = require('./db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'Introuvable.') => new HttpError(404, msg);
const forbidden = (msg = 'Accès refusé.') => new HttpError(403, msg);

// Enveloppe les routes async pour transmettre les erreurs à Express.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(n) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s;
}

// Numéros ivoiriens : on garde uniquement les chiffres, sans indicatif 225.
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00225')) d = d.slice(5);
  else if (d.startsWith('225') && d.length > 10) d = d.slice(3);
  return d;
}
function fmtPhone(d) {
  return String(d || '').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

// Abidjan est en UTC+0 toute l'année.
function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function addDays(n, from = new Date()) {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function nextWeekday(name, from = new Date()) {
  const target = DAYS.indexOf(name);
  for (let i = 0; i < 8; i++) {
    const d = addDays(i, from);
    if (d.getUTCDay() === target) return isoDate(d);
  }
  return isoDate(from);
}

function fcfa(n) {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

function int(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function str(v, max = 500) {
  return String(v == null ? '' : v).trim().slice(0, max);
}
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function notify(userId, body, client = db) {
  await client.query('INSERT INTO notifications(user_id, body) VALUES ($1,$2)', [userId, body]);
  require('./push').sendPush(userId, body); // sans attendre
  require('./mailer').mailUser(userId, body);
}
// Notification à tous les comptes actifs d'un rôle (ex. les administrateurs).
async function notifyRole(role, body, client = db) {
  const rows = (await client.query('SELECT id FROM users WHERE role=$1 AND active', [role])).rows;
  for (const u of rows) await notify(u.id, body, client);
}
// Alerte de sécurité : journal + notification à tous les administrateurs.
async function securityAlert(userId, detail) {
  await db.query("INSERT INTO audit_log(user_id, action, detail) VALUES ($1,'ALERTE sécurité',$2)", [userId || null, String(detail).slice(0, 300)]);
  const admins = await db.many("SELECT id FROM users WHERE role='admin' AND active");
  for (const a of admins) await notify(a.id, `⚠ Alerte sécurité : ${String(detail).slice(0, 160)}`);
}
async function audit(userId, action, detail = '', client = db) {
  await client.query('INSERT INTO audit_log(user_id, action, detail) VALUES ($1,$2,$3)', [userId || null, action, detail]);
}

module.exports = {
  HttpError, bad, notFound, forbidden, h, code, normPhone, fmtPhone,
  isoDate, addDays, nextWeekday, DAYS, fcfa, int, str, num, notify, notifyRole, audit, securityAlert,
};
