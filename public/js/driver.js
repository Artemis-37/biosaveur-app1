/* Espace livreur : tournée du jour sur la carte, navigation, remise par QR. */
(function () {
  'use strict';
  var App = window.App, ic = App.ic, esc = App.esc, fcfa = App.fcfa, M = App.map;

  App.shells.staff = function () {
    var u = App.cfg.user;
    document.getElementById('hdr').innerHTML = '<div class="staffbar"><div class="wrap"><span class="logo">biosaveur</span><span class="small">' + (u ? esc(u.name) + ' · ' + (u.role === 'admin' ? 'Administrateur' : 'Livreur') : '') + '</span><span class="sp"></span>' +
      (u && u.role === 'admin' ? '<a href="#/admin">' + ic('grid', 's') + 'Admin</a><a href="#/livreur">' + ic('truck', 's') + 'Tournée</a>' : '') +
      '<a href="#/">' + ic('store', 's') + 'Boutique</a><button data-act="logout">' + ic('logout', 's') + 'Déconnexion</button></div></div>';
    document.getElementById('main').className = '';
    document.getElementById('ftr').innerHTML = '';
  };

  var LV = { filter: 'toutes', sel: null };
  function needStaff(role) {
    App.needLogin();
    var u = App.cfg.user;
    if (u.role !== role && u.role !== 'admin') { var e = new Error('Cet espace est réservé à l’équipe BIOSAVEUR.'); e.status = 403; throw e; }
  }
  App.needStaff = needStaff;

  function tourView(d) {
    var slots = App.cfg.slots, depot = App.cfg.depot;
    var all = d.orders;
    var pend = M.routeOrder(all.filter(function (o) { return o.status !== 'livree'; }), slots, depot);
    pend.forEach(function (r, i) { r.n = i + 1; });
    var done = all.filter(function (o) { return o.status === 'livree'; }).map(function (o) { return { o: o, leg: null, n: '✓' }; });
    var rows = (LV.filter === 'livrees' ? [] : pend).concat(LV.filter === 'alivrer' ? [] : done);
    var totKm = 0; pend.forEach(function (r) { if (r.leg) totKm += r.leg; });
    var aEnc = 0; all.forEach(function (o) { if (o.pay_method === 'livraison' && !o.paid && o.status !== 'livree') aEnc += o.total; });
    var next = pend.filter(function (r) { return r.o.status === 'en_route'; })[0] || pend[0];
    var ids = all.map(function (o) { return o.id; });
    if (!LV.sel || ids.indexOf(LV.sel) < 0) LV.sel = next ? next.o.id : null;
    var sel = null; pend.concat(done).forEach(function (r) { if (r.o.id === LV.sel) sel = r; });
    var stops = pend.filter(function (r) { return M.hasPos(r.o); }).map(function (r) { return r.o; });

    App.after.push(function () {
      var el = document.getElementById('tmap');
      if (!el) return;
      if (!M.available()) { el.innerHTML = '<div class="note">La carte n’a pas pu se charger. Les boutons Google Maps restent utilisables.</div>'; return; }
      var map = M.create(el, { scroll: false });
      var pts = [[depot.lat, depot.lng]];
      L.marker([depot.lat, depot.lng], { icon: M.depotIcon(), title: depot.name }).addTo(map).bindPopup(esc(depot.name));
      done.forEach(function (r) { if (M.hasPos(r.o)) L.marker([r.o.lat, r.o.lng], { icon: M.pin('✓', 'done'), title: r.o.client_name }).addTo(map).on('click', function () { pick(r.o.id); }); });
      pend.forEach(function (r) {
        if (!M.hasPos(r.o)) return;
        pts.push([r.o.lat, r.o.lng]);
        L.marker([r.o.lat, r.o.lng], { icon: M.pin(String(r.n), next && r.o.id === next.o.id ? 'next' : 'todo'), title: 'Arrêt ' + r.n + ' · ' + r.o.client_name, zIndexOffset: 100 }).addTo(map).on('click', function () { pick(r.o.id); });
      });
      if (pts.length > 1) L.polyline(pts, { color: '#103d3a', weight: 3, dashArray: '7 6' }).addTo(map);
      var all2 = pts.concat(done.filter(function (r) { return M.hasPos(r.o); }).map(function (r) { return [r.o.lat, r.o.lng]; }));
      if (sel && M.hasPos(sel.o)) { L.circleMarker([sel.o.lat, sel.o.lng], { radius: 22, color: '#25b810', weight: 3, fill: false }).addTo(map); }
      if (all2.length > 1) map.fitBounds(all2, { padding: [30, 30], maxZoom: 15, animate: false }); else map.setView([depot.lat, depot.lng], 13, { animate: false });
    });

    var selCard = '';
    if (sel) {
      var o = sel.o;
      selCard = '<div class="selstop">' +
        '<div class="row"><strong style="flex:1;color:var(--vf)">' + (sel.n === '✓' ? 'Livrée' : 'Arrêt ' + sel.n) + ' · ' + esc(o.client_name) + '</strong>' + App.stPill(o.status) + '</div>' +
        '<div class="small">' + esc(o.address) + ', ' + esc(o.commune) + '</div>' +
        (o.landmark ? '<div class="small"><strong>Repère :</strong> ' + esc(o.landmark) + '</div>' : '') +
        '<div class="small muted">' + o.slot + (sel.leg != null ? ' · ' + M.fkm(sel.leg) + ' depuis l’arrêt précédent, environ ' + M.fmin(sel.leg) : '') + '</div>' +
        '<div class="small">Téléphone : <span class="num" style="user-select:all;font-weight:700">' + App.phone(o.client_phone) + '</span></div>' +
        (M.hasPos(o) ? '<div class="row" style="flex-wrap:wrap;gap:8px"><a class="btn p sm" href="' + M.gDir(o) + '" target="_blank" rel="noopener">' + ic('map', 's') + 'Naviguer (Google Maps)</a><a class="btn o sm" href="' + M.waze(o) + '" target="_blank" rel="noopener">Waze</a><button class="btn o sm" data-act="copy" data-v="' + o.lat + ', ' + o.lng + '">Copier GPS</button></div>'
          : '<div class="note">Ce client n’a pas placé sa position. Appelez-le pour le guider.</div>') +
        '</div>';
    }

    var cards = rows.length ? rows.map(function (r) {
      var o = r.o, act = '';
      if (o.status === 'confirmee') act = '<span class="small muted">En attente de préparation à l’entrepôt</span>';
      else if (o.status === 'preparee') act = '<button class="btn p sm" data-act="livStart" data-id="' + o.id + '">' + ic('truck', 's') + 'Démarrer la livraison</button>';
      else if (o.status === 'en_route') act = (M.hasPos(o) ? '<a class="btn o sm" href="' + M.gDir(o) + '" target="_blank" rel="noopener">' + ic('map', 's') + 'Itinéraire</a>' : '') + '<button class="btn p sm" data-act="scan" data-id="' + o.id + '">' + ic('scan', 's') + 'Scanner le QR</button>';
      else act = '<span class="small" style="color:var(--ok);font-weight:700">Remise confirmée à ' + App.ftime(o.delivered_at) + '</span>';
      return '<article class="card run' + (o.id === LV.sel ? ' on' : '') + '"><div class="row"><span class="n num' + (r.n === '✓' ? ' ok' : '') + '">' + r.n + '</span><strong style="color:var(--vf)">' + o.slot + '</strong>' + (r.leg != null ? '<span class="xs muted">' + M.fkm(r.leg) + ' · ' + M.fmin(r.leg) + '</span>' : '') + '<span style="margin-left:auto">' + App.stPill(o.status) + '</span></div>' +
        '<div><strong>' + esc(o.client_name) + '</strong> · <span class="muted small">' + esc(o.number) + '</span><br><span class="small muted">' + esc(o.address) + ', ' + esc(o.commune) + '</span>' + (o.landmark ? '<br><span class="small">Repère : ' + esc(o.landmark) + '</span>' : '') + '</div>' +
        '<div class="small">' + esc(App.itemsTxt(o)) + '</div>' +
        '<div class="small">' + (o.pay_method === 'livraison' && !o.paid && o.status !== 'livree' ? '<strong style="color:var(--warn)">À encaisser : ' + fcfa(o.total) + '</strong>' : '<span class="muted">Déjà payé (' + App.payTxt(o) + ')</span>') + '</div>' +
        '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn o sm" data-act="livSel" data-id="' + o.id + '">' + ic('pin', 's') + 'Voir sur la carte</button>' + act + '</div></article>';
    }).join('') : '<div class="card empty"><span class="o">' + ic('truck', 'l') + '</span><strong>Aucune livraison dans ce filtre</strong></div>';

    return '<div class="lv-h"><div class="wrap">' +
      '<div class="row" style="flex-wrap:wrap"><div style="flex:1 1 200px"><span class="lbl-up" style="color:var(--sur-vf)">Espace livreur</span><h1 style="font-size:22px;font-weight:800">Tournée du ' + App.fdate(d.day) + '</h1></div>' +
      '<label class="small" for="tday" style="color:var(--sur-vf)">Jour</label><input id="tday" type="date" value="' + d.day + '" data-chg="tourDay" style="min-height:44px;border-radius:8px;border:0;padding:0 10px">' +
      '<button class="btn y" data-act="scan">' + ic('scan', 's') + 'Scanner un QR</button></div>' +
      '<div class="kpis"><div class="kpi"><b class="num">' + pend.length + '</b><span>Arrêts restants</span></div><div class="kpi"><b class="num">' + M.fkm(totKm) + '</b><span>Distance estimée</span></div><div class="kpi"><b class="num">' + done.length + '</b><span>Livrées</span></div><div class="kpi"><b class="num" style="font-size:18px">' + fcfa(aEnc) + '</b><span>À encaisser</span></div></div>' +
      '</div></div>' +
      '<div class="wrap stack" style="padding-block:16px 40px"><div class="lv-grid">' +
      '<aside class="card lv-map"><div class="pad between" style="padding-bottom:8px"><h2 class="sec-t" style="font-size:17px">Carte de la tournée</h2><button class="linkbtn" data-act="reload">Actualiser</button></div>' +
      '<div style="padding:0 12px"><div id="tmap" class="lmap"></div></div>' +
      '<div class="legend" style="padding:10px 16px 0"><span><i style="background:var(--j);border:1.5px solid var(--vf)"></i>Prochain arrêt</span><span><i style="background:var(--vf)"></i>À livrer</span><span><i style="background:var(--v)"></i>Livré</span><span><i style="background:#fff;border:1.5px solid var(--vf)"></i>Entrepôt</span></div>' +
      '<div class="pad stack" style="gap:12px">' + selCard +
      (stops.length ? '<a class="btn y full" href="' + M.tourUrl(depot, stops) + '" target="_blank" rel="noopener">' + ic('truck', 's') + 'Ouvrir toute la tournée dans Google Maps</a>' : '') +
      '<span class="xs muted">Touchez un repère pour voir l’arrêt. La navigation s’ouvre dans Google Maps ou Waze avec la position GPS du client.</span></div></aside>' +
      '<div class="stack" style="gap:10px"><div class="chips" role="group" aria-label="Filtre">' + [['toutes', 'Toutes'], ['alivrer', 'À livrer'], ['livrees', 'Livrées']].map(function (x) { return '<button class="chip" data-act="livFilter" data-v="' + x[0] + '" aria-pressed="' + (LV.filter === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      cards + '</div></div></div>';
  }
  function pick(id) {
    LV.sel = id; App.render();
    if (window.innerWidth < 900) setTimeout(function () { var m = document.querySelector('.lv-map'); if (m) m.scrollIntoView({ block: 'start' }); }, 400);
  }

  var tourDay = null;
  App.route('livreur', function () {
    needStaff('livreur');
    return App.get('/driver/tour' + (tourDay ? '?day=' + tourDay : '')).then(tourView);
  });
  App.routes.livreur.shell = 'staff';
  App.A.tourDay = function (d, el) { tourDay = el.value || null; LV.sel = null; App.render(); };
  App.A.livFilter = function (d) { LV.filter = d.v; App.render(); };
  App.A.livSel = function (d) { pick(+d.id); };
  App.A.livStart = function (d) { App.post('/driver/orders/' + d.id + '/start').then(function () { App.toast('Livraison démarrée. Le client est prévenu.'); LV.sel = +d.id; App.render(); }).catch(App.err); };

  /* --- scan QR --- */
  var scanner = null;
  function stopScanner() { if (scanner) { var s = scanner; scanner = null; s.stop().catch(function () {}).then(function () { try { s.clear(); } catch (e) { /* rien */ } }); } }
  App.A.scan = function (d) {
    var id = d.id ? +d.id : null;
    App.modal('<h2 class="sec-t">Scanner le QR du client</h2>' +
      '<div id="qrv" class="scanbox"></div><span class="xs muted" id="qrs">Ouverture de la caméra…</span>' +
      '<form class="stack" style="gap:10px" data-form="scanCode" data-id="' + (id || '') + '"><div class="field"><label for="sc">Ou saisissez le code affiché par le client</label><input id="sc" name="code" placeholder="QR-XXXXXX" autocomplete="off" autocapitalize="characters"></div>' +
      '<div id="scerr"></div><button class="btn p" type="submit">Confirmer la remise</button><button class="linkbtn" type="button" data-act="closeM">Fermer</button></form>', stopScanner);
    if (!window.Html5Qrcode) { document.getElementById('qrs').textContent = 'Caméra indisponible : saisissez le code.'; document.getElementById('qrv').hidden = true; return; }
    scanner = new Html5Qrcode('qrv');
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (text) {
      if (!scanner) return;
      stopScanner();
      submitCode(String(text).trim(), id);
    }, function () { /* pas encore de code lisible */ }).then(function () {
      var s = document.getElementById('qrs'); if (s) s.textContent = 'Visez le QR code du client.';
    }).catch(function () {
      var s = document.getElementById('qrs'); if (s) s.textContent = 'Caméra non autorisée : saisissez le code ci-dessous.';
      var v = document.getElementById('qrv'); if (v) v.hidden = true;
      scanner = null;
    });
  };
  function submitCode(code, id) {
    var req = id ? App.post('/driver/orders/' + id + '/deliver', { code: code }) : App.post('/driver/scan', { code: code });
    return req.then(function (r) { App.modal(null); App.toast(r.number + ' livrée et confirmée.'); App.render(); })
      .catch(function (e) { var el = document.getElementById('scerr'); if (el) el.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; else App.err(e); });
  }
  App.F.scanCode = function (fd, form) {
    var code = String(fd.get('code') || '').trim().toUpperCase();
    if (!code) { document.getElementById('scerr').innerHTML = '<div class="err">Saisissez le code du client.</div>'; return; }
    var id = form.getAttribute('data-id');
    return submitCode(code, id ? +id : null);
  };
})();
