/* Espace administrateur. */
(function () {
  'use strict';
  var App = window.App, ic = App.ic, esc = App.esc, fcfa = App.fcfa, M = App.map;

  var MENU = [['apercu', 'home', 'Vue d’ensemble'], ['commandes', 'truck', 'Commandes & livraisons'], ['clients', 'users', 'Clients'], ['cotisations', 'coin', 'Cotisations & versements'],
    ['stock', 'box', 'Produits & stock'], ['messages', 'chat', 'Messagerie'], ['equipe', 'user', 'Équipe'], ['cinetpay', 'card', 'Paiement CinetPay'], ['journal', 'list', 'Journal']];
  var AV = { filter: 'tous', day: App.iso(new Date()), status: '', thread: null, q: '' };

  function frame(cur, body, badges) {
    badges = badges || {};
    return '<div class="adm"><aside aria-label="Menu administrateur">' +
      MENU.map(function (m) { return '<button class="mi" data-act="nav" data-h="#/admin/' + m[0] + '"' + (cur === m[0] ? ' aria-current="page"' : '') + '>' + ic(m[1], 's') + '<span>' + m[2] + '</span>' + (badges[m[0]] ? '<span class="badge">' + badges[m[0]] + '</span>' : '') + '</button>'; }).join('') +
      '</aside><section>' + body + '</section></div>';
  }
  function head(t, sub, extra) { return '<div class="row" style="flex-wrap:wrap;gap:12px"><div style="flex:1 1 240px"><h1 style="font-size:24px;font-weight:800;color:var(--vf)">' + t + '</h1><span class="small muted">' + sub + '</span></div>' + (extra || '') + '</div>'; }
  function kpi(l, v, small) { return '<div class="kpi card"><span>' + l + '</span><b class="num"' + (small ? ' style="font-size:20px"' : '') + '>' + v + '</b></div>'; }

  var S = {};
  S.apercu = function () {
    return App.get('/admin/overview').then(function (d) {
      var k = d.kpis;
      var alerts = '';
      if (k.a_preparer) alerts += '<button class="alert i" style="border:0;text-align:left" data-act="nav" data-h="#/admin/commandes"><i></i><span style="flex:1">' + k.a_preparer + ' commande(s) à préparer</span>' + ic('right', 's') + '</button>';
      d.low.forEach(function (p) { alerts += '<button class="alert e" style="border:0;text-align:left" data-act="nav" data-h="#/admin/stock"><i></i><span style="flex:1">Stock bas : ' + esc(p.name) + ' (' + p.stock + ')</span>' + ic('right', 's') + '</button>'; });
      if (k.cot_completes) alerts += '<button class="alert o" style="border:0;text-align:left" data-act="nav" data-h="#/admin/cotisations"><i></i><span style="flex:1">' + k.cot_completes + ' cotisation(s) complète(s), en attente de programmation</span>' + ic('right', 's') + '</button>';
      if (k.inactifs) alerts += '<button class="alert w" style="border:0;text-align:left" data-act="admInact"><i></i><span style="flex:1">' + k.inactifs + ' client(s) inactif(s) depuis plus de 30 jours</span>' + ic('right', 's') + '</button>';
      if (k.threads_non_lus) alerts += '<button class="alert i" style="border:0;text-align:left" data-act="nav" data-h="#/admin/messages"><i></i><span style="flex:1">' + k.threads_non_lus + ' conversation(s) non lue(s)</span>' + ic('right', 's') + '</button>';
      return frame('apercu', head('Vue d’ensemble', 'Poulet Molo Molo · ' + App.fdate(App.iso(new Date())), '<a class="btn p sm" href="#/admin/commandes">' + ic('truck', 's') + 'Livraisons du jour</a>') +
        '<div class="akpis">' + kpi('Clients inscrits', k.clients) + kpi('Cotisations actives', k.cot_actives) + kpi('FCFA collectés (cotisations)', fcfa(k.collecte), true) +
        kpi('Messages non lus', k.threads_non_lus) + kpi('Cotisations complètes', k.cot_completes) + kpi('Livraisons effectuées', k.livrees) + kpi('Ventes payées ce mois', fcfa(k.ventes_mois), true) + '</div>' +
        '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">' +
        '<section class="card pad stack chart" style="gap:10px"><div class="between"><h2 class="sec-t" style="font-size:16px">Cotisations collectées par mois</h2><button class="linkbtn" data-act="objectif">' + (d.objectif ? 'Objectif : ' + fcfa(d.objectif) : 'Fixer un objectif') + '</button></div>' + chart(d.months, d.objectif) +
        '<div class="legend"><span><i style="background:#103d3a"></i>Cotisations</span><span><i style="background:#25b810"></i>Ventes boutique</span>' + (d.objectif ? '<span><i style="background:#c08a00"></i>Objectif mensuel</span>' : '') + '</div></section>' +
        '<section class="card pad stack" style="gap:8px"><h2 class="sec-t" style="font-size:16px">À traiter</h2>' + (alerts || '<p class="muted small">Rien à signaler.</p>') + '</section></div>' +
        '<section class="card pad"><div class="between" style="margin-bottom:6px"><h2 class="sec-t" style="font-size:16px">Commandes récentes</h2><a class="linkbtn" href="#/admin/commandes">Tout voir</a></div>' + ordersTable(d.recent, false) + '</section>', { messages: k.threads_non_lus, commandes: k.a_preparer, stock: d.low.length });
    });
  };
  function chart(months, obj) {
    var W = 560, H = 230, l = 58, b = 28, t = 10, r = 8;
    var max = obj || 0; months.forEach(function (x) { max = Math.max(max, x.cotisations, x.ventes); });
    var step = max > 2000000 ? 1000000 : max > 400000 ? 250000 : max > 80000 ? 50000 : 10000;
    var top = Math.max(step, Math.ceil(max / step) * step);
    var ih = H - b - t, iw = W - l - r, gw = iw / months.length, bw = Math.min(24, gw / 3);
    var y = function (v) { return t + ih - (v / top) * ih; };
    var fmt = function (v) { return v >= 1e6 ? (v / 1e6).toString().replace('.', ',') + ' M' : v >= 1000 ? Math.round(v / 1000) + ' k' : String(v); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Collecte par mois sur six mois">';
    for (var v = 0; v <= top; v += step) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e3e8e5"/><text x="' + (l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="#56625e">' + fmt(v) + '</text>';
    months.forEach(function (x, i) {
      var cx = l + gw * i + gw / 2, mm = +x.month.slice(5, 7) - 1;
      s += '<rect x="' + (cx - bw - 2) + '" y="' + y(x.cotisations) + '" width="' + bw + '" height="' + (y(0) - y(x.cotisations)) + '" rx="3" fill="#103d3a"><title>Cotisations : ' + fcfa(x.cotisations) + '</title></rect>';
      s += '<rect x="' + (cx + 2) + '" y="' + y(x.ventes) + '" width="' + bw + '" height="' + (y(0) - y(x.ventes)) + '" rx="3" fill="#25b810"><title>Ventes : ' + fcfa(x.ventes) + '</title></rect>';
      s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#56625e">' + App.MOIS[mm] + '</text>';
    });
    if (obj) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(obj) + '" y2="' + y(obj) + '" stroke="#c08a00" stroke-width="2" stroke-dasharray="6 4"/>';
    return s + '</svg>';
  }
  App.A.objectif = function () {
    App.modal('<h2 class="sec-t">Objectif mensuel de collecte</h2><form class="stack" style="gap:12px" data-form="objectif"><div class="field"><label for="ob">Montant (FCFA)</label><input id="ob" name="v" type="number" min="0" step="1000" required></div><button class="btn p" type="submit">Enregistrer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.objectif = function (fd) { return App.put('/admin/settings', { objectif_mensuel: +fd.get('v') }).then(function () { App.modal(null); App.render(); }); };
  App.A.admInact = function () { AV.filter = 'inactifs'; App.go('#/admin/clients'); };

  var PAY = { livraison: 'À la livraison', cinetpay: 'CinetPay', cotisation: 'Cotisation' };
  var NEXT = { confirmee: ['preparee', 'annulee'], preparee: ['confirmee', 'en_route', 'annulee'], en_route: ['preparee', 'livree', 'annulee'] };
  function ordersTable(list, edit) {
    if (!list.length) return '<p class="muted small">Aucune commande.</p>';
    return '<div class="tbl"><table><thead><tr><th>N°</th><th>Client</th><th>Jour · créneau</th><th>Articles</th><th>Montant</th><th>Paiement</th><th>Statut</th>' + (edit ? '<th>Livreur</th>' : '') + '</tr></thead><tbody>' +
      list.map(function (o) {
        var st = App.stPill(o.status);
        if (edit && NEXT[o.status]) {
          st = '<label for="st-' + o.id + '" hidden>Statut ' + esc(o.number) + '</label><select id="st-' + o.id + '" data-chg="admStatus" data-id="' + o.id + '"><option value="">' + App.ST_LABEL[o.status] + '</option>' +
            NEXT[o.status].map(function (s) { return '<option value="' + s + '">→ ' + App.ST_LABEL[s] + '</option>'; }).join('') + '</select>';
        }
        return '<tr><td><strong>' + esc(o.number) + '</strong>' + (o.kind === 'cotisation' ? '<br><span class="xs muted">Cotisation</span>' : '') + '</td><td>' + esc(o.client_name) + '<br><span class="xs muted">' + esc(o.commune) + (o.client_phone ? ' · ' + App.phone(o.client_phone) : '') + '</span></td>' +
          '<td>' + App.fday(o.day) + '<br><span class="xs muted">' + o.slot + '</span></td>' +
          '<td class="small">' + esc(App.itemsTxt(o)) + '</td>' +
          '<td class="num">' + (o.kind === 'cotisation' ? '—' : fcfa(o.total)) + '</td>' +
          '<td>' + (o.paid ? '<span class="pill ok">Payé</span>' : '<span class="pill warn">À encaisser</span>') + '<br><span class="xs muted">' + PAY[o.pay_method] + '</span></td>' +
          '<td>' + st + '</td>' +
          (edit ? '<td><label for="dr-' + o.id + '" hidden>Livreur</label><select id="dr-' + o.id + '" data-chg="admDriver" data-id="' + o.id + '"><option value="">Non attribué</option>' + (AV.drivers || []).map(function (d) { return '<option value="' + d.id + '"' + (o.driver_id === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></td>' : '') +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  S.commandes = function () {
    var qs = '?day=' + AV.day + (AV.status ? '&status=' + AV.status : '');
    return Promise.all([App.get('/admin/orders' + qs), App.get('/admin/staff')]).then(function (res) {
      var list = res[0];
      AV.drivers = res[1].filter(function (u) { return u.role === 'livreur' && u.active; });
      var withPos = list.filter(function (o) { return M.hasPos(o) && o.status !== 'annulee'; });
      App.after.push(function () {
        var el = document.getElementById('amap'); if (!el || !M.available()) return;
        var map = M.create(el, { scroll: false });
        var d = App.cfg.depot, pts = [[d.lat, d.lng]];
        L.marker([d.lat, d.lng], { icon: M.depotIcon() }).addTo(map).bindPopup(esc(d.name));
        withPos.forEach(function (o, i) {
          pts.push([o.lat, o.lng]);
          L.marker([o.lat, o.lng], { icon: M.pin(String(i + 1), o.status === 'livree' ? 'done' : o.status === 'en_route' ? 'next' : 'todo') }).addTo(map)
            .bindPopup('<strong>' + esc(o.number) + '</strong><br>' + esc(o.client_name) + '<br>' + esc(o.slot) + ' · ' + App.ST_LABEL[o.status]);
        });
        if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15, animate: false }); else map.setView(pts[0], 12, { animate: false });
      });
      var stc = {}; list.forEach(function (o) { stc[o.status] = (stc[o.status] || 0) + 1; });
      return frame('commandes', head('Commandes & livraisons', list.length + ' commande(s) · ' + App.fday(AV.day),
        '<label class="small" for="aday">Jour</label><input id="aday" type="date" value="' + AV.day + '" data-chg="admDay" style="min-height:40px;border:1.5px solid #c9d3cf;border-radius:8px;padding:0 8px">') +
        '<div class="chips">' + [['', 'Toutes'], ['confirmee', 'À préparer'], ['preparee', 'Prêtes'], ['en_route', 'En route'], ['livree', 'Livrées'], ['annulee', 'Annulées']].map(function (x) { return '<button class="chip" data-act="admStatusF" data-v="' + x[0] + '" aria-pressed="' + (AV.status === x[0]) + '">' + x[1] + (x[0] && stc[x[0]] ? ' (' + stc[x[0]] + ')' : '') + '</button>'; }).join('') + '</div>' +
        '<div class="note info small">Passer une commande à « Préparée » la fait apparaître comme prête au départ chez le livreur. La remise est confirmée quand le livreur scanne le QR du client.</div>' +
        (withPos.length ? '<section class="card pad stack" style="gap:8px"><h2 class="sec-t" style="font-size:16px">Carte des livraisons</h2><div id="amap" class="lmap sm"></div></section>' : '') +
        '<section class="card pad">' + ordersTable(list, true) + '</section>');
    });
  };
  App.A.admDay = function (d, el) { AV.day = el.value || App.iso(new Date()); App.render(); };
  App.A.admStatusF = function (d) { AV.status = d.v; App.render(); };
  App.A.admStatus = function (d, el) {
    if (!el.value) return;
    App.put('/admin/orders/' + d.id + '/status', { status: el.value }).then(function () { App.toast('Statut mis à jour. Le client est prévenu.'); App.render(); }).catch(function (e) { App.err(e); App.render(); });
  };
  App.A.admDriver = function (d, el) { App.put('/admin/orders/' + d.id + '/driver', { driver_id: el.value || null }).then(function () { App.toast('Livreur attribué.'); }).catch(App.err); };

  S.clients = function () {
    return App.get('/admin/clients?filter=' + AV.filter + (AV.q ? '&q=' + encodeURIComponent(AV.q) : '')).then(function (list) {
      return frame('clients', head('Clients', list.length + ' client(s)',
        '<form class="row" data-form="admSearch"><label for="cq" hidden>Rechercher</label><input id="cq" name="q" value="' + esc(AV.q) + '" placeholder="Nom, téléphone, commune" style="min-height:40px;border:1.5px solid #c9d3cf;border-radius:8px;padding:0 10px"><button class="btn o sm" type="submit">Rechercher</button></form>') +
        '<div class="chips">' + [['tous', 'Tous'], ['actifs', 'Actifs'], ['inactifs', 'Inactifs (+30 j)']].map(function (x) { return '<button class="chip" data-act="admFilter" data-v="' + x[0] + '" aria-pressed="' + (AV.filter === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<section class="card pad tbl"><table><thead><tr><th>Client</th><th>Téléphone</th><th>Adresse</th><th>Inscrit le</th><th>Dernière activité</th><th>Cotisation</th><th>Livraisons</th><th></th></tr></thead><tbody>' +
        list.map(function (c) {
          var inact = (Date.now() - new Date(c.last_active).getTime()) > 30 * 864e5;
          var cot = c.chickens ? Math.min(100, Math.round(c.paid / (c.chickens * c.unit_price) * 100)) + ' %' : '—';
          return '<tr><td><strong>' + esc(c.name) + '</strong><br><span class="xs muted">' + esc(c.referral_code) + (c.active ? '' : ' · désactivé') + '</span></td><td class="num">' + App.phone(c.phone) + '</td>' +
            '<td class="small">' + esc(c.commune) + '<br><span class="muted">' + esc(c.address) + '</span>' + (c.lat != null ? '<br><a href="' + M.gDir(c) + '" target="_blank" rel="noopener">Voir sur la carte</a>' : '<br><span class="muted">Pas de position</span>') + '</td>' +
            '<td>' + App.fdate(c.created_at) + '</td><td>' + App.ago(c.last_active) + (inact ? '<br><span class="pill err">Inactif</span>' : '') + '</td><td>' + cot + '</td><td class="num">' + c.livraisons + '</td>' +
            '<td><div class="row" style="gap:6px">' + (inact ? '<button class="btn o sm" data-act="relance" data-id="' + c.id + '">Relancer</button>' : '') + '<button class="btn o sm" data-act="nav" data-h="#/admin/messages/' + c.id + '">Écrire</button></div></td></tr>';
        }).join('') + '</tbody></table></section>');
    });
  };
  App.A.admFilter = function (d) { AV.filter = d.v; App.render(); };
  App.F.admSearch = function (fd) { AV.q = String(fd.get('q') || '').trim(); App.render(); };
  App.A.relance = function (d) { App.post('/admin/clients/' + d.id + '/relance').then(function () { App.toast('Relance envoyée.'); }).catch(App.err); };

  S.cotisations = function () {
    return Promise.all([App.get('/admin/cotisations'), App.get('/admin/transactions')]).then(function (res) {
      var cots = res[0], tx = res[1];
      AV.cots = cots;
      return frame('cotisations', head('Cotisations & versements', cots.length + ' cotisation(s) en cours', '<button class="btn p sm" data-act="admVers">' + ic('coin', 's') + 'Enregistrer un versement</button>') +
        '<section class="card pad tbl"><table><thead><tr><th>Client</th><th>Objectif</th><th>Versé</th><th style="min-width:140px">Progression</th><th>Jour</th><th>Auto</th><th>Statut</th><th></th></tr></thead><tbody>' +
        (cots.length ? cots.map(function (k) { var pc = Math.min(100, Math.round(k.paid / k.target * 100)); return '<tr><td><strong>' + esc(k.client_name) + '</strong><br><span class="xs muted">' + App.phone(k.phone) + '</span></td><td class="num">' + k.chickens + ' poulets<br><span class="xs muted">' + fcfa(k.target) + '</span></td><td class="num">' + fcfa(k.paid) + '</td><td><div class="prog lt"><i style="width:' + pc + '%"></i></div><span class="xs muted num">' + pc + ' %</span></td><td>' + k.delivery_day + '</td><td>' + (k.auto_renew ? 'Oui' : 'Non') + '</td><td>' + (k.status === 'complete' ? '<span class="pill warn">Complète</span>' : '<span class="pill ok">Active</span>') + '</td><td>' + (k.status === 'active' ? '<button class="btn o sm" data-act="admVers" data-id="' + k.id + '">Versement</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="8" class="muted">Aucune cotisation en cours.</td></tr>') +
        '</tbody></table></section>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:16px;margin-bottom:6px">Historique des versements</h2><div class="tbl"><table><thead><tr><th>Date</th><th>Client</th><th>Moyen</th><th>Référence</th><th style="text-align:right">Montant</th></tr></thead><tbody>' +
        tx.map(function (h) { return '<tr><td>' + App.fdt(h.created_at) + '</td><td>' + esc(h.client_name) + '</td><td>' + esc(h.method) + '</td><td class="small muted">' + esc(h.reference) + '</td><td class="num" style="text-align:right;font-weight:700">' + fcfa(h.amount) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>');
    });
  };
  App.A.admVers = function (d) {
    var cots = (AV.cots || []).filter(function (k) { return k.status === 'active'; });
    if (!cots.length) { App.toast('Aucune cotisation active.'); return; }
    App.modal('<h2 class="sec-t">Enregistrer un versement</h2><form class="stack" style="gap:12px" data-form="admVers">' +
      '<div class="field"><label for="ak">Cotisation</label><select id="ak" name="k">' + cots.map(function (k) { return '<option value="' + k.id + '"' + (String(k.id) === d.id ? ' selected' : '') + '>' + esc(k.client_name) + ' · ' + fcfa(k.paid) + ' / ' + fcfa(k.target) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="am">Montant (FCFA)</label><input id="am" name="m" type="number" min="100" step="5" value="5000" required></div>' +
      '<div class="field"><label for="amo">Moyen</label><select id="amo" name="moyen"><option>Espèces</option><option>Mobile Money</option><option>Virement</option></select></div>' +
      '<div class="field"><label for="are">Référence (facultatif)</label><input id="are" name="ref" maxlength="60" placeholder="N° de reçu ou de transaction"></div>' +
      '<button class="btn p" type="submit">Enregistrer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.admVers = function (fd) {
    return App.post('/admin/cotisations/' + fd.get('k') + '/payments', { amount: +fd.get('m'), method: fd.get('moyen'), reference: fd.get('ref') }).then(function () { App.modal(null); App.toast('Versement enregistré. Le client est prévenu.'); App.render(); });
  };

  S.stock = function () {
    return App.get('/admin/products').then(function (list) {
      AV.products = list;
      return frame('stock', head('Produits & stock', list.length + ' produit(s)', '<button class="btn p sm" data-act="prodEdit">+ Nouveau produit</button>') +
        '<section class="card pad tbl"><table><thead><tr><th>Produit</th><th>Prix</th><th>Disponible</th><th>Seuil</th><th>Fournisseur</th><th>Délai</th><th>État</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          var state = !p.visible ? '<span class="pill neutral">Masqué</span>' : p.stock <= 0 ? '<span class="pill err">Épuisé</span>' : p.stock <= p.threshold ? '<span class="pill err">Stock bas</span>' : '<span class="pill ok">OK</span>';
          return '<tr><td><strong>' + esc(p.name) + '</strong>' + (p.flash ? ' <span class="pill warn">Flash</span>' : '') + '</td><td class="num">' + fcfa(p.price) + '</td>' +
            '<td><label for="sq-' + p.id + '" hidden>Disponible ' + esc(p.name) + '</label><input id="sq-' + p.id + '" type="number" min="0" value="' + p.stock + '" data-chg="stockSet" data-id="' + p.id + '"></td>' +
            '<td class="num">' + p.threshold + '</td><td class="small">' + esc(p.supplier) + '</td><td class="small">' + esc(p.lead_time) + '</td><td>' + state + '</td><td><button class="btn o sm" data-act="prodEdit" data-id="' + p.id + '">Modifier</button></td></tr>';
        }).join('') + '</tbody></table></section>');
    });
  };
  App.A.stockSet = function (d, el) { App.put('/admin/products/' + d.id, { stock: +el.value }).then(function () { App.toast('Stock mis à jour.'); }).catch(App.err); };
  App.A.prodEdit = function (d) {
    var p = d.id ? (AV.products || []).filter(function (x) { return String(x.id) === d.id; })[0] : { name: '', category: 'entier', price: '', old_price: '', weight: '', options: ['Entier'], tag: '', flash: false, image_url: '', description: '', stock: 0, threshold: 5, supplier: '', lead_time: '', lot_code: '', farm: '', feed: '', vet: '', slaughter_date: '', cold_chain: '', halal: '', visible: true };
    function f(n, l, t, extra) { return '<div class="field"><label for="pe-' + n + '">' + l + '</label><input id="pe-' + n + '" name="' + n + '" type="' + (t || 'text') + '" value="' + esc(p[n] == null ? '' : p[n]) + '"' + (extra || '') + '></div>'; }
    var cats = [['entier', 'Poulet entier'], ['decoupes', 'Découpes'], ['packs', 'Packs famille'], ['fume', 'Fumé & braisé'], ['abats', 'Abats'], ['evenements', 'Événements']];
    App.modal('<h2 class="sec-t">' + (d.id ? 'Modifier le produit' : 'Nouveau produit') + '</h2><form class="stack" style="gap:12px" data-form="prodSave" data-id="' + (d.id || '') + '">' +
      f('name', 'Nom', 'text', ' required') +
      '<div class="form-grid"><div class="field"><label for="pe-cat">Catégorie</label><select id="pe-cat" name="category">' + cats.map(function (c) { return '<option value="' + c[0] + '"' + (p.category === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></div>' + f('weight', 'Poids') + '</div>' +
      '<div class="form-grid">' + f('price', 'Prix (FCFA)', 'number', ' min="0" required') + f('old_price', 'Ancien prix (barré)', 'number', ' min="0"') + '</div>' +
      '<div class="field"><label for="pe-opt">Présentations (séparées par des virgules)</label><input id="pe-opt" name="options" value="' + esc((p.options || []).join(', ')) + '"></div>' +
      '<div class="form-grid">' + f('stock', 'Stock', 'number', ' min="0"') + f('threshold', 'Seuil d’alerte', 'number', ' min="0"') + '</div>' +
      '<div class="form-grid">' + f('supplier', 'Fournisseur') + f('lead_time', 'Délai d’approvisionnement') + '</div>' +
      '<div class="form-grid">' + f('tag', 'Étiquette (Halal, Promo…)') + f('image_url', 'Photo (lien https)') + '</div>' +
      '<div class="field"><label for="pe-desc">Description</label><textarea id="pe-desc" name="description">' + esc(p.description) + '</textarea></div>' +
      '<strong class="small" style="color:var(--vf)">Traçabilité</strong>' +
      '<div class="form-grid">' + f('lot_code', 'Code lot') + f('farm', 'Ferme d’origine') + '</div>' +
      '<div class="form-grid">' + f('slaughter_date', 'Date d’abattage', 'date') + f('cold_chain', 'Chaîne du froid') + '</div>' +
      f('feed', 'Alimentation') + f('vet', 'Suivi vétérinaire') + f('halal', 'Certification halal') +
      '<label class="chk"><input type="checkbox" name="flash"' + (p.flash ? ' checked' : '') + '> Offre flash (poulet du jour)</label>' +
      '<label class="chk"><input type="checkbox" name="visible"' + (p.visible ? ' checked' : '') + '> Visible dans la boutique</label>' +
      '<button class="btn p" type="submit">Enregistrer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.prodSave = function (fd, form) {
    var b = {}; fd.forEach(function (v, k) { b[k] = v; });
    b.flash = !!fd.get('flash'); b.visible = !!fd.get('visible');
    var id = form.getAttribute('data-id');
    return (id ? App.put('/admin/products/' + id, b) : App.post('/admin/products', b)).then(function () { App.modal(null); App.toast('Produit enregistré.'); App.render(); });
  };

  S.messages = function (r) {
    return App.get('/admin/threads').then(function (threads) {
      var id = r.args[1] ? +r.args[1] : (AV.thread || (threads[0] && threads[0].id));
      AV.thread = id;
      var conv = id ? App.get('/admin/threads/' + id) : Promise.resolve(null);
      return conv.then(function (c) {
        App.after.push(function () { var el = document.getElementById('chat'); if (el) el.scrollTop = el.scrollHeight; });
        var list = threads.map(function (t) { return '<button class="th" data-act="nav" data-h="#/admin/messages/' + t.id + '" aria-current="' + (t.id === id) + '"><span class="row"><strong style="flex:1">' + esc(t.name) + '</strong>' + (t.unread && t.id !== id ? '<span class="dotn"></span>' : '') + '</span><span class="xs muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.last_body) + '</span></button>'; }).join('');
        if (c && !threads.some(function (t) { return t.id === id; })) list = '<button class="th" aria-current="true"><strong>' + esc(c.user.name) + '</strong><span class="xs muted">Nouvelle conversation</span></button>' + list;
        return frame('messages', head('Messagerie', threads.length + ' conversation(s)') +
          '<section class="card msg-l"><div>' + (list || '<p class="pad muted small">Aucun message.</p>') + '</div>' +
          (c ? '<div style="display:flex;flex-direction:column;min-width:0"><div class="pad" style="border-bottom:1px solid var(--ligne)"><strong>' + esc(c.user.name) + '</strong> <span class="small muted">· ' + App.phone(c.user.phone) + ' · ' + esc(c.user.commune) + '</span></div>' +
            '<div class="chat" id="chat" style="flex:1">' + c.messages.map(function (m) { return '<div class="bub ' + (m.from_team ? 'me' : 'them') + '">' + esc(m.body) + '<small>' + (m.from_team ? 'Équipe' : esc(c.user.name.split(' ')[0])) + ' · ' + App.fdt(m.created_at) + '</small></div>'; }).join('') + '</div>' +
            '<form class="chat-in" data-form="msgAdmin" data-id="' + c.user.id + '"><label for="msga" hidden>Réponse</label><input id="msga" name="t" placeholder="Répondre…" autocomplete="off" required maxlength="1000"><button class="btn p sm" style="min-height:46px" type="submit">Envoyer</button></form></div>' : '<div class="pad muted">Choisissez une conversation.</div>') +
          '</section>', {});
      });
    });
  };
  App.F.msgAdmin = function (fd, form) { return App.post('/admin/threads/' + form.getAttribute('data-id'), { body: fd.get('t') }).then(function () { App.render(); }); };

  S.equipe = function () {
    return App.get('/admin/staff').then(function (list) {
      return frame('equipe', head('Équipe', 'Comptes livreurs et administrateurs') +
        '<section class="card pad tbl"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Téléphone</th><th>Dernière activité</th><th>État</th><th></th></tr></thead><tbody>' +
        list.map(function (u) { return '<tr><td><strong>' + esc(u.name) + '</strong></td><td>' + (u.role === 'admin' ? 'Administrateur' : 'Livreur') + '</td><td class="num">' + App.phone(u.phone) + '</td><td>' + App.ago(u.last_active) + '</td><td>' + (u.active ? '<span class="pill ok">Actif</span>' : '<span class="pill neutral">Désactivé</span>') + '</td><td><div class="row" style="gap:6px"><button class="btn o sm" data-act="staffPw" data-id="' + u.id + '">Mot de passe</button>' + (u.id !== App.cfg.user.id ? '<button class="btn o sm" data-act="staffActive" data-id="' + u.id + '" data-v="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Désactiver' : 'Réactiver') + '</button>' : '') + '</div></td></tr>'; }).join('') +
        '</tbody></table></section>' +
        '<section class="card pad stack" style="gap:12px"><h2 class="sec-t" style="font-size:16px">Ajouter un membre</h2><form class="form-grid" data-form="staffAdd">' +
        '<div class="field"><label for="sn">Nom</label><input id="sn" name="name" required></div>' +
        '<div class="field"><label for="sp">Téléphone</label><input id="sp" name="phone" inputmode="tel" required></div>' +
        '<div class="field"><label for="sr">Rôle</label><select id="sr" name="role"><option value="livreur">Livreur</option><option value="admin">Administrateur</option></select></div>' +
        '<div class="field"><label for="sw">Mot de passe provisoire</label><input id="sw" name="password" type="text" minlength="6" required></div>' +
        '<button class="btn p" type="submit" style="align-self:end">Créer le compte</button></form></section>');
    });
  };
  App.F.staffAdd = function (fd, form) { var b = {}; fd.forEach(function (v, k) { b[k] = v; }); return App.post('/admin/staff', b).then(function () { form.reset(); App.toast('Compte créé. Transmettez le mot de passe à la personne.'); App.render(); }); };
  App.A.staffActive = function (d) { App.put('/admin/users/' + d.id + '/active', { active: d.v === '1' }).then(function () { App.render(); }).catch(App.err); };
  App.A.staffPw = function (d) {
    App.modal('<h2 class="sec-t">Nouveau mot de passe</h2><form class="stack" style="gap:12px" data-form="staffPw" data-id="' + d.id + '"><div class="field"><label for="np">Mot de passe (6 caractères min.)</label><input id="np" name="p" type="text" minlength="6" required></div><button class="btn p" type="submit">Enregistrer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.staffPw = function (fd, form) { return App.put('/admin/staff/' + form.getAttribute('data-id') + '/password', { password: fd.get('p') }).then(function () { App.modal(null); App.toast('Mot de passe modifié.'); }); };

  S.cinetpay = function () {
    return App.get('/admin/cinetpay').then(function (c) {
      var modeTxt = { live: 'Connecté à CinetPay', simulation: 'Mode test (simulation)', off: 'Non configuré' }[c.mode];
      return frame('cinetpay', head('Paiement CinetPay', 'Paiement en ligne Mobile Money et carte bancaire') +
        '<div class="card pad row" style="flex-wrap:wrap;gap:14px;align-items:flex-start">' +
        '<span style="width:46px;height:46px;border-radius:50%;background:' + (c.enabled ? 'var(--ok-bg)' : 'var(--warn-bg)') + ';color:' + (c.enabled ? 'var(--ok)' : 'var(--warn)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' + ic(c.enabled ? 'check' : 'card') + '</span>' +
        '<div style="flex:1 1 260px"><strong style="font-size:16px">' + modeTxt + ' · paiement en ligne ' + (c.enabled ? 'proposé aux clients' : 'masqué') + '</strong><br><span class="small muted">' +
        (c.mode === 'live' ? 'Site ID ' + esc(c.siteId) + (c.secretKey ? ' · clé secrète présente' : ' · clé secrète absente (les notifications sont vérifiées par l’API)') : c.mode === 'simulation' ? 'Les paiements passent par un guichet de test, sans argent réel. Ajoutez les clés CinetPay sur Render pour passer en réel.' : 'Ajoutez CINETPAY_API_KEY et CINETPAY_SITE_ID dans les variables d’environnement Render.') + '</span></div>' +
        '<label class="switch"><input type="checkbox" data-chg="cpToggle" aria-label="Proposer le paiement en ligne"' + (c.enabled ? ' checked' : '') + (c.mode === 'off' ? ' disabled' : '') + '><span></span></label></div>' +
        '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">' +
        '<section class="card pad stack" style="gap:12px"><h2 class="sec-t" style="font-size:16px">Mise en service</h2>' +
        '<ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">' +
        '<li>Dans le tableau de bord Render, ouvrez le service, puis <strong>Environment</strong>, et ajoutez <code>CINETPAY_API_KEY</code>, <code>CINETPAY_SITE_ID</code> et <code>CINETPAY_SECRET_KEY</code>.' + (c.configured ? ' <span class="pill ok">Fait</span>' : '') + '</li>' +
        '<li>Dans le back-office CinetPay, déclarez l’URL de notification ci-dessous.</li>' +
        '<li>Faites une transaction de test de 100 FCFA.</li>' +
        '<li>Activez le paiement en ligne avec l’interrupteur.</li></ol>' +
        '<button class="btn o" data-act="cpTest"' + (c.mode === 'off' ? ' disabled' : '') + '>Lancer une transaction de test (100 FCFA)</button></section>' +
        '<section class="card pad stack" style="gap:12px"><h2 class="sec-t" style="font-size:16px">Adresses à déclarer</h2>' + url('URL de notification (notify_url)', c.notifyUrl) + url('URL de retour (return_url)', c.returnUrl) + '</section></div>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:16px;margin-bottom:6px">Transactions en ligne</h2><div class="tbl"><table><thead><tr><th>Date</th><th>Transaction</th><th>Client</th><th>Objet</th><th>Moyen</th><th>Montant</th><th>État</th><th></th></tr></thead><tbody>' +
        (c.payments.length ? c.payments.map(function (p) {
          var st = { ACCEPTED: '<span class="pill ok">Accepté</span>', REFUSED: '<span class="pill err">Refusé</span>', EXPIRED: '<span class="pill neutral">Expiré</span>' }[p.status] || '<span class="pill warn">En attente</span>';
          return '<tr><td>' + App.fdt(p.created_at) + '</td><td class="small num">' + esc(p.transaction_id) + '</td><td>' + esc(p.client_name || '—') + '</td><td>' + esc(p.purpose) + '</td><td class="small">' + esc(p.method) + '</td><td class="num">' + fcfa(p.amount) + '</td><td>' + st + '</td><td>' + (p.status === 'PENDING' && c.mode === 'live' ? '<button class="btn o sm" data-act="cpSync" data-v="' + esc(p.transaction_id) + '">Vérifier</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="8" class="muted">Aucune transaction.</td></tr>') + '</tbody></table></div></section>');
    });
  };
  function url(l, u) { return '<div class="stack" style="gap:4px"><span class="small" style="font-weight:600">' + l + '</span><div class="row"><code style="flex:1;min-width:0;overflow-wrap:anywhere;background:var(--fond);border-radius:6px;padding:8px 10px;font-size:13px;user-select:all">' + esc(u) + '</code><button class="btn o sm" data-act="copy" data-v="' + esc(u) + '">Copier</button></div></div>'; }
  App.A.cpToggle = function (d, el) { App.put('/admin/cinetpay', { enabled: el.checked }).then(function () { return App.loadConfig(); }).then(function () { App.toast(el.checked ? 'Paiement en ligne proposé aux clients.' : 'Paiement en ligne masqué.'); App.render(); }).catch(function (e) { App.err(e); App.render(); }); };
  App.A.cpTest = function () { App.post('/admin/cinetpay/test').then(function (r) { location.href = r.payment_url; }).catch(App.err); };
  App.A.cpSync = function (d) { App.post('/admin/cinetpay/sync/' + encodeURIComponent(d.v)).then(function (r) { App.toast('État : ' + r.status); App.render(); }).catch(App.err); };

  S.journal = function () {
    return App.get('/admin/audit').then(function (list) {
      return frame('journal', head('Journal', 'Les 200 dernières actions de l’équipe') +
        '<section class="card pad"><div class="log">' + (list.length ? list.map(function (a) { return '<div><span class="muted">' + App.fdt(a.created_at) + '</span><strong>' + esc(a.name || 'Système') + '</strong><span>' + esc(a.action) + '</span><span class="muted">' + esc(a.detail) + '</span></div>'; }).join('') : '<span class="muted">Aucune action.</span>') + '</div></section>');
    });
  };

  App.route('admin', function (r) {
    App.needStaff('admin');
    if (App.cfg.user.role !== 'admin') { var e = new Error('Espace réservé aux administrateurs.'); e.status = 403; throw e; }
    var s = S[r.args[0]] || S.apercu;
    return s(r);
  });
  App.routes.admin.shell = 'staff';
})();
