'use strict';
// Prépare le contenu embarqué dans les applis Android / iOS : copie public/ vers www/
// et indique à l'appli l'adresse du serveur (API).
//   APP_API_URL=https://biosaveur-app.onrender.com npm run app:prepare
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'www');
const api = (process.env.APP_API_URL || 'https://biosaveur-app.onrender.com').replace(/\/$/, '');

if (!/^https:\/\//.test(api) && !/^http:\/\/(localhost|10\.0\.2\.2|192\.168\.)/.test(api)) {
  console.error(`APP_API_URL doit commencer par https:// (reçu : ${api})`);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.writeFileSync(path.join(out, 'js', 'env.js'),
  `/* Généré par scripts/prepare-app.js */\nwindow.BSV_ENV = { native: true, apiBase: ${JSON.stringify(api)} };\n`);
// le manifeste PWA n'a pas de sens dans l'appli
fs.rmSync(path.join(out, 'manifest.webmanifest'), { force: true });
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`www/ prêt — API : ${api}`);
