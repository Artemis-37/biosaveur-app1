/* BIOSAVEUR Molo Molo — noyau de l'interface : API, routage, outils d'affichage. */
(function () {
  'use strict';
  var App = (window.App = {});

  /* ---------- icônes ---------- */
  var P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    cart: '<path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.5a1.75 1.75 0 0 1 0 3.5h-2a1.75 1.75 0 0 0 0 3.5h3.5"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 20h4v-3M20 14v.01"/>',
    scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    gift: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    box: '<path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10"/>',
    list: '<path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c1-4 4-6 7-6s6 2 7 6M17 11a3 3 0 1 0 0-6M22 20c-.6-2.5-2-4-4-4.6"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    drum: '<path d="M15.5 4.5a4.5 4.5 0 0 1 0 9c-1.2 0-2.3-.5-3.1-1.2L7 17.7a1.8 1.8 0 1 1-2.6 2.6 1.8 1.8 0 1 1-2.1-2.9 1.8 1.8 0 1 1 2.9-.4l5.4-5.4A4.5 4.5 0 0 1 15.5 4.5z"/>',
    knife: '<path d="M6 3l12 12M9 3H6v3M14 21l-9-9M18 21h3v-3"/>',
    pack: '<path d="M4 8h16v12H4zM8 8V5h8v3"/>',
    flame: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
    abats: '<path d="M8 4a4 4 0 0 0 0 8h8a4 4 0 0 0 0-8zM6 12v6a3 3 0 0 0 6 0M18 12v6a3 3 0 0 1-6 0"/>',
    party: '<path d="M3 21l5-14 9 9zM13 3v3M18 6l-2 2M21 11h-3"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    gps: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
    store: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>'
  };
  App.ic = function (n, c) { return '<svg class="ic' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>'; };
  App.P = P;

  App.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  App.fcfa = function (n) { return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'; };
  App.phone = function (d) { return String(d || '').replace(/(\d{2})(?=\d)/g, '$1 ').trim(); };

  var JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  App.JOURS = JOURS; App.MOIS = MOIS;
  App.iso = function (d) { return d.toISOString().slice(0, 10); };
  App.addDays = function (n) { var d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d; };
  App.fdate = function (s) { if (!s) return ''; var d = new Date(String(s).length === 10 ? s + 'T12:00:00Z' : s); return d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  App.fday = function (s) {
    if (s === App.iso(new Date())) return "Aujourd'hui";
    if (s === App.iso(App.addDays(1))) return 'Demain';
    var d = new Date(s + 'T12:00:00Z'); return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()];
  };
  App.ftime = function (s) { var d = new Date(s); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
  App.fdt = function (s) { return App.fdate(s) + ' · ' + App.ftime(s); };
  App.ago = function (s) {
    var days = Math.floor((Date.now() - new Date(s).getTime()) / 864e5);
    return days <= 0 ? "Aujourd'hui" : days === 1 ? 'Hier' : 'Il y a ' + days + ' j';
  };

  /* ---------- API ---------- */
  var ENV = window.BSV_ENV || {};
  App.native = !!ENV.native;
  App.apiBase = (ENV.apiBase || '').replace(/\/$/, '');
  if (App.native) { try { var ov = localStorage.getItem('bsv-server'); if (ov) App.apiBase = JSON.parse(ov); } catch (e) { /* rien */ } }
  App.token = function (t) {
    if (t === undefined) return App.store.get('token', null);
    App.store.set('token', t);
  };
  App.api = function (method, url, body) {
    var opt = { method: method, headers: { 'X-Requested-With': 'biosaveur' }, credentials: App.apiBase ? 'omit' : 'same-origin' };
    var tk = App.token(); if (tk) opt.headers.Authorization = 'Bearer ' + tk;
    if (App.native) opt.headers['X-Client'] = 'app';
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    // délai maximal : un serveur gratuit qui se réveille peut mettre ~1 min
    var ctl = window.AbortController ? new AbortController() : null, timedOut = false;
    var to = ctl ? setTimeout(function () { timedOut = true; ctl.abort(); }, 75000) : null;
    if (ctl) opt.signal = ctl.signal;
    return fetch(App.apiBase + '/api' + url, opt).then(function (r) {
      clearTimeout(to);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Erreur ' + r.status); e.status = r.status;
          if (r.status === 401) { App.cfg.user = null; if (tk) App.token(null); }
          throw e;
        }
        return j;
      });
    }, function () {
      clearTimeout(to);
      if (timedOut) throw new Error('Le serveur met trop de temps à répondre.');
      throw new Error(App.native ? 'Le serveur ' + App.apiBase.replace(/^https?:\/\//, '') + ' ne répond pas.' : 'Pas de connexion internet. Vérifiez votre réseau et réessayez.'); });
  };
  App.get = function (u) { return App.api('GET', u); };
  App.post = function (u, b) { return App.api('POST', u, b || {}); };
  App.put = function (u, b) { return App.api('PUT', u, b || {}); };

  /* ---------- stockage local (panier) ---------- */
  App.store = {
    get: function (k, d) { try { var v = localStorage.getItem('bsv-' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('bsv-' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- toast & modale ---------- */
  var toastT;
  App.toast = function (m) {
    var t = document.getElementById('toast'); t.textContent = m; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
  };
  App.modal = function (html, onClose) {
    var el = document.getElementById('ov');
    if (!html) { el.innerHTML = ''; if (App._mClose) { var f = App._mClose; App._mClose = null; f(); } return; }
    App._mClose = onClose || null;
    el.innerHTML = '<div class="ov" data-act="ovClose"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    var f2 = el.querySelector('input:not([type=radio]):not([type=hidden]),select,button'); if (f2) f2.focus();
  };
  App.err = function (e) { App.toast(e && e.message ? e.message : String(e)); };

  /* ---------- routage ---------- */
  App.routes = {};
  App.route = function (name, fn) { App.routes[name] = fn; };
  App.go = function (hash) { if (location.hash === hash) App.render(); else location.hash = hash; };
  App.parse = function () {
    var h = location.hash.replace(/^#\/?/, '');
    var q = '';
    var i = h.indexOf('?'); if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    var params = {}; q.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    return { name: parts[0] || '', args: parts.slice(1), q: params };
  };

  var renderSeq = 0;
  App.after = [];
  App.render = function () {
    var r = App.parse();
    var u = App.cfg.user;
    // redirections selon le rôle
    if (!r.name) {
      if (u && u.role === 'livreur') return App.go('#/livreur');
      if (u && u.role === 'admin') return App.go('#/admin');
    }
    var fn = App.routes[r.name] || App.routes[''];
    var seq = ++renderSeq;
    App.cleanup();
    var shell = fn.shell || 'client';
    App.paintShell(shell, r);
    var main = document.getElementById('main');
    main.innerHTML = '<div class="loading"><div class="spin" role="status" aria-label="Chargement"></div></div>';
    Promise.resolve().then(function () { return fn(r); }).then(function (html) {
      if (seq !== renderSeq || html === undefined) return;
      main.innerHTML = html;
      var q = App.after; App.after = [];
      q.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
      App.refreshBadges();
    }).catch(function (e) {
      if (seq !== renderSeq) return;
      if (e.status === 401) { App.go('#/connexion?suite=' + encodeURIComponent(location.hash)); return; }
      main.innerHTML = '<div class="card empty"><span class="o">' + App.ic('x', 'l') + '</span><strong>Impossible d’afficher cette page</strong><span class="muted small">' + App.esc(e.message) + '</span><button class="btn o sm" data-act="reload">Réessayer</button></div>';
    });
  };
  App.cleanups = [];
  App.cleanup = function () { App.cleanups.forEach(function (f) { try { f(); } catch (e) { /* rien */ } }); App.cleanups = []; };

  /* ---------- actions déléguées ---------- */
  App.A = {}; App.F = {};
  App.A.reload = function () { App.render(); };
  App.A.ovClose = function (d, el, ev) { if (ev.target === el) App.modal(null); };
  App.A.closeM = function () { App.modal(null); };
  App.A.nav = function (d) { App.go(d.h); window.scrollTo(0, 0); };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el) return;
    var f = App.A[el.getAttribute('data-act')]; if (!f) return;
    if (el.getAttribute('data-act') !== 'ovClose') ev.preventDefault();
    if (el.disabled) return;
    f(el.dataset, el, ev);
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target.closest('[data-chg]'); if (!el) return;
    var f = App.A[el.getAttribute('data-chg')]; if (f) f(el.dataset, el, ev);
  });
  document.addEventListener('submit', function (ev) {
    var form = ev.target.closest('[data-form]'); if (!form) return;
    ev.preventDefault();
    var f = App.F[form.getAttribute('data-form')]; if (!f) return;
    var btn = form.querySelector('[type=submit]');
    if (btn) { if (btn.disabled) return; btn.disabled = true; }
    Promise.resolve().then(function () { return f(new FormData(form), form); })
      .catch(App.err).then(function () { if (btn && document.body.contains(btn)) btn.disabled = false; });
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && document.querySelector('.ov')) App.modal(null); });
  window.addEventListener('hashchange', function () { App.modal(null); App.render(); window.scrollTo(0, 0); });

  /* ---------- démarrage ---------- */
  App.cfg = {};
  App.loadConfig = function () { return App.get('/config').then(function (c) { App.cfg = c; }); };
  App.start = function () {
    App.loadConfig().then(App.render, function (e) {
      document.getElementById('app').innerHTML = '<div class="wrap"><div class="card empty" style="margin-top:40px"><span class="o">' + App.ic('truck', 'l') + '</span><strong>Connexion au service impossible</strong><span class="muted small">' + App.esc(e.message) + ' Le serveur peut mettre jusqu’à une minute à se réveiller.</span><button class="btn p" onclick="location.reload()">Réessayer</button>' +
        (App.native ? '<form class="stack" style="gap:8px;width:100%;max-width:420px;margin-top:12px" data-form="server"><label class="small" for="srv" style="font-weight:600">Adresse du serveur</label><input id="srv" name="u" value="' + App.esc(App.apiBase) + '" inputmode="url" autocapitalize="off" style="min-height:44px;border:1.5px solid #c9d3cf;border-radius:8px;padding:0 10px"><button class="btn o sm" type="submit">Enregistrer et réessayer</button></form>' : '') +
        '</div></div>';
    });
    setInterval(function () { if (App.cfg.user && document.visibilityState === 'visible') App.refreshBadges(); }, 60000);
  };
  App.F.server = function (fd) {
    var u = String(fd.get('u') || '').trim().replace(/\/$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(u)) { App.toast('Adresse invalide. Exemple : https://biosaveur-molomolo.onrender.com'); return; }
    App.store.set('server', u); location.reload();
  };
  App.badges = { notifications: 0, messages: 0 };
  App.refreshBadges = function () {
    var u = App.cfg.user; if (!u || u.role !== 'client') return;
    App.get('/client/badges').then(function (b) {
      var changed = b.notifications !== App.badges.notifications || b.messages !== App.badges.messages;
      App.badges = b;
      if (changed) document.querySelectorAll('[data-badge=acct]').forEach(function (el) { var n = b.notifications + b.messages; el.textContent = n; el.hidden = !n; });
    }).catch(function () { /* silencieux */ });
  };
})();
