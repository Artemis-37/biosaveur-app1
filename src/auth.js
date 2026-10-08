'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./util');

const COOKIE = 'bsv_session';
const MAX_AGE = 30 * 24 * 3600 * 1000; // 30 jours

const hash = (pw) => bcrypt.hash(pw, 10);
const check = (pw, h) => bcrypt.compare(pw, h);

// Ouvre une session : cookie httpOnly pour le site web, jeton renvoyé pour les applis mobiles.
function setSession(res, user) {
  const token = jwt.sign({ uid: user.id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: MAX_AGE,
  });
  return token;
}
function clearSession(res) {
  res.clearCookie(COOKIE);
}

// Charge l'utilisateur connecté (ou null) dans req.user.
async function loadUser(req, _res, next) {
  req.user = null;
  const auth = req.get('authorization') || '';
  const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '') || (req.cookies && req.cookies[COOKIE]);
  if (!token) return next();
  try {
    const p = jwt.verify(token, config.jwtSecret);
    const u = await db.one('SELECT * FROM users WHERE id=$1 AND active', [p.uid]);
    if (u) {
      req.user = u;
      // dernière activité, au plus une écriture par heure
      if (Date.now() - new Date(u.last_active).getTime() > 3600e3) {
        db.query('UPDATE users SET last_active=now() WHERE id=$1', [u.id]).catch(() => {});
      }
    }
  } catch (_) { /* jeton invalide ou expiré */ }
  next();
}

function need(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Connectez-vous pour continuer.'));
    if (roles.length && !roles.includes(req.user.role)) return next(new HttpError(403, 'Accès réservé.'));
    next();
  };
}

module.exports = { hash, check, setSession, clearSession, loadUser, need };
