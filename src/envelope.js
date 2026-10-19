'use strict';
// Enveloppe chiffrée (AES-256-GCM) des échanges de l'appli : dans Burp Suite ou un proxy,
// on voit {"e":"..."} au lieu des prix en clair, et une requête modifiée sans la clé est rejetée.
// Ce n'est PAS la protection principale (le serveur recalcule toujours les prix) : c'est un frein de plus.
const crypto = require('crypto');
const config = require('./config');

const key = crypto.createHash('sha256').update(config.apiEncSecret).digest();

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { e: Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64') };
}
function open(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  if (raw.length < 29) throw new Error('court');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8'));
}

function middleware(req, res, next) {
  if (req.get('X-Enc') !== '1' || req.path.startsWith('/cinetpay/notify') || req.path.startsWith('/cinetpay/return')) return next();
  if (req.body && typeof req.body.e === 'string' && Object.keys(req.body).length === 1) {
    try { req.body = open(req.body.e); } catch (_) { return res.status(400).json({ error: 'Requête altérée ou invalide.' }); }
  }
  const json = res.json.bind(res);
  res.json = (o) => json(seal(o));
  next();
}
module.exports = { middleware, seal, open };
