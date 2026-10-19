'use strict';
// Enregistrement des photos (produits, profils) envoyées en « data URL » depuis le navigateur.
const db = require('./db');
const { bad } = require('./util');

async function saveImage(dataUrl, userId, maxKb = 700) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad('Image invalide (JPEG, PNG ou WebP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || buf.length > maxKb * 1024) throw bad(`Image trop lourde (${maxKb} Ko maximum).`);
  const sig = buf.subarray(0, 4).toString('hex');
  const ok = (m[1] === 'image/jpeg' && sig.startsWith('ffd8ff')) || (m[1] === 'image/png' && sig === '89504e47') || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF');
  if (!ok) throw bad('Le fichier n’est pas une image valide.');
  const img = await db.one('INSERT INTO images(mime,data,created_by) VALUES ($1,$2,$3) RETURNING id', [m[1], buf, userId]);
  return `/api/images/${img.id}`;
}
module.exports = { saveImage };
