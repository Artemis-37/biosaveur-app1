'use strict';
// Badges de fidélité : calculés à partir de l'activité réelle du client.
const crypto = require('crypto');
const db = require('./db');

function newQrToken() { return crypto.randomBytes(18).toString('base64url').replace(/[-_]/g, 'x'); }

const BADGES = [
  { key: 'bienvenue', label: 'Bienvenue', desc: 'Compte créé chez BIOSAVEUR', stat: () => 1, target: 1 },
  { key: 'premiere', label: 'Première commande', desc: 'Une première livraison reçue', stat: (s) => s.livrees, target: 1 },
  { key: 'fidele', label: 'Client fidèle', desc: '5 commandes livrées', stat: (s) => s.livrees, target: 5 },
  { key: 'habitue', label: 'Habitué', desc: '15 commandes livrées', stat: (s) => s.livrees, target: 15 },
  { key: 'epargnant', label: 'Épargnant', desc: 'Une cotisation poulet menée à terme', stat: (s) => s.cotisations, target: 1 },
  { key: 'ambassadeur', label: 'Ambassadeur', desc: 'Un proche parrainé', stat: (s) => s.filleuls, target: 1 },
  { key: 'super', label: 'Super ambassadeur', desc: '5 proches parrainés', stat: (s) => s.filleuls, target: 5 },
  { key: 'gourmet', label: 'Grand gourmet', desc: '100 000 FCFA d’achats livrés', stat: (s) => s.depense, target: 100000 },
];

async function loyalty(userId) {
  const s = await db.one(`SELECT
      (SELECT count(*) FROM orders WHERE user_id=$1 AND status='livree')::int AS livrees,
      (SELECT count(*) FROM orders WHERE user_id=$1 AND status='livree' AND kind='cotisation')::int AS cotisations,
      (SELECT count(*) FROM users WHERE referred_by=$1)::int AS filleuls,
      (SELECT coalesce(sum(subtotal),0) FROM orders WHERE user_id=$1 AND status='livree')::int AS depense`, [userId]);
  const badges = BADGES.map((b) => {
    const v = Math.min(b.target, b.stat(s));
    return { key: b.key, label: b.label, desc: b.desc, earned: v >= b.target, progress: v, target: b.target };
  });
  const n = badges.filter((b) => b.earned).length;
  const level = n >= 7 ? 'Or' : n >= 4 ? 'Argent' : n >= 2 ? 'Bronze' : 'Nouveau';
  return { badges, level, earned: n, total: badges.length };
}
module.exports = { loyalty, newQrToken };
