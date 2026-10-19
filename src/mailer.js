'use strict';
// Notifications par e-mail (SMTP : Brevo, Gmail avec mot de passe d'application, OVH, etc.).
const nodemailer = require('nodemailer');
const db = require('./db');

const env = process.env;
const configured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
let transport = null;
function tx() {
  if (!transport) {
    const port = parseInt(env.SMTP_PORT, 10) || 587;
    transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  }
  return transport;
}
const from = () => env.MAIL_FROM || `BIOSAVEUR <${env.SMTP_USER}>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function html(name, body) {
  return `<div style="font-family:Arial,sans-serif;background:#f3f5f1;padding:20px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">` +
    `<div style="background:#103d3a;padding:16px 20px"><span style="background:#25b810;color:#fff;font-weight:800;border-radius:20px;padding:6px 14px;border:2px solid #eaf624">biosaveur</span></div>` +
    `<div style="padding:22px 20px;color:#17211f;font-size:15px;line-height:1.5"><p>Bonjour ${esc(name)},</p><p>${esc(body)}</p>` +
    `<p style="color:#56625e;font-size:13px;margin-top:24px">Poulet Molo Molo · AGRO VIVDURABLE SARL<br>Vous recevez cet e-mail car vous avez un compte BIOSAVEUR. Vous pouvez le désactiver dans Profil → Notifications par e-mail.</p></div></div></div>`;
}

async function sendMail(to, subject, name, body) {
  if (!configured) return false;
  await tx().sendMail({ from: from(), to, subject, text: `Bonjour ${name},\n\n${body}\n\nPoulet Molo Molo — BIOSAVEUR`, html: html(name, body) });
  return true;
}

// Envoi « au mieux » : n'échoue jamais. Léger délai pour laisser se terminer la transaction qui a créé la notification.
function mailUser(userId, body) {
  if (!configured) return;
  setTimeout(async () => {
    try {
      const u = await db.one("SELECT name, email FROM users WHERE id=$1 AND role='client' AND email IS NOT NULL AND email <> '' AND email_notifs AND active", [userId]);
      if (u) await sendMail(u.email, 'BIOSAVEUR — ' + (body.length > 55 ? body.slice(0, 52) + '…' : body), u.name.split(' ')[0], body);
    } catch (e) { console.error('[mail]', e.message); }
  }, 1500);
}
module.exports = { configured, sendMail, mailUser };
