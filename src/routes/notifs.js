'use strict';
// Notifications de l'équipe (administrateurs et livreurs) : liste, compteur, marquage comme lues.
const express = require('express');
const db = require('../db');
const { need } = require('../auth');
const { h } = require('../util');

const r = express.Router();
r.use(need('admin', 'livreur'));

r.get('/', h(async (req, res) => {
  res.json(await db.many('SELECT id, body, read, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]));
}));
r.get('/count', h(async (req, res) => {
  const n = await db.one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT read', [req.user.id]);
  res.json({ unread: n.n });
}));
r.post('/read', h(async (req, res) => {
  await db.query('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
}));
module.exports = r;
