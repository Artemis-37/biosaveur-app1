/* Espace client : boutique, panier, commandes, cotisation, compte. */
(function () {
  'use strict';
  var App = window.App, ic = App.ic, esc = App.esc, fcfa = App.fcfa;

  var CATS = [
    { id: 'entier', label: 'Poulet entier', icon: 'drum' },
    { id: 'decoupes', label: 'Découpes', icon: 'knife' },
    { id: 'packs', label: 'Packs famille', icon: 'pack' },
    { id: 'fume', label: 'Fumé & braisé', icon: 'flame' },
    { id: 'abats', label: 'Abats', icon: 'abats' },
    { id: 'evenements', label: 'Événements', icon: 'party' }
  ];
  function catOf(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return CATS[0]; }
  var STATUS = [['confirmee', 'Confirmée'], ['preparee', 'Préparée'], ['en_route', 'En route'], ['livree', 'Livrée']];
  var ST_LABEL = { attente_paiement: 'Paiement en attente', confirmee: 'Confirmée', preparee: 'Préparée', en_route: 'En route', livree: 'Livrée', annulee: 'Annulée' };
  var ST_PILL = { attente_paiement: 'neutral', confirmee: 'neutral', preparee: 'info', en_route: 'warn', livree: 'ok', annulee: 'err' };
  App.stPill = function (s) { return '<span class="pill ' + (ST_PILL[s] || 'neutral') + '">' + (ST_LABEL[s] || s) + '</span>'; };
  App.ST_LABEL = ST_LABEL;
  App.payTxt = function (o) { return { livraison: 'à la livraison' + (o.paid ? ' (encaissé)' : ' (à régler au livreur)'), cinetpay: 'en ligne CinetPay' + (o.paid ? ' (payé)' : ''), cotisation: 'débité de la cotisation' }[o.pay_method] || o.pay_method; };
  App.itemsTxt = function (o) { return (o.items || []).map(function (it) { return it.qty + ' × ' + it.name; }).join(', '); };

  function needLogin() { if (!App.cfg.user) { var e = new Error('Connexion requise'); e.status = 401; throw e; } }
  App.needLogin = needLogin;

  /* ---------- panier (navigateur) ---------- */
  var Cart = App.cart = {
    items: function () { return App.store.get('cart', []); },
    save: function (c) { App.store.set('cart', c); updateCartBadge(); },
    count: function () { return Cart.items().reduce(function (s, c) { return s + c.q; }, 0); },
    add: function (pid, opt, q) {
      var c = Cart.items(), f = null;
      c.forEach(function (x) { if (x.pid === pid && x.opt === opt) f = x; });
      if (f) f.q += q; else c.push({ pid: pid, opt: opt, q: q });
      Cart.save(c);
    },
    clear: function () { Cart.save([]); }
  };
  function updateCartBadge() { var n = Cart.count(); document.querySelectorAll('[data-badge=cart]').forEach(function (el) { el.textContent = n; el.hidden = !n; }); }

  /* ---------- coque ---------- */
  App.shells = App.shells || {};
  var lastShell = null;
  App.paintShell = function (shell, r) {
    var app = document.getElementById('app');
    if (lastShell !== shell || !document.getElementById('main')) {
      app.innerHTML = '<div id="hdr"></div><main id="main"></main><div id="ftr"></div>';
      lastShell = shell;
    }
    document.body.classList.toggle('has-bnav', shell === 'client');
    App.shells[shell](r);
  };
  App.shells.client = function (r) {
    var u = App.cfg.user;
    var n = Cart.count(), nb = App.badges.notifications + App.badges.messages;
    var staff = u && u.role !== 'client' ? '<div class="staffbar"><div class="wrap"><span class="small">Connecté en tant que ' + esc(u.name) + '</span><span class="sp"></span><a href="#/' + (u.role === 'admin' ? 'admin' : 'livreur') + '">' + ic(u.role === 'admin' ? 'grid' : 'truck', 's') + 'Retour à mon espace</a></div></div>' : '';
    document.getElementById('hdr').innerHTML = staff +
      '<header class="ch"><div class="wrap">' +
      '<a class="logo" href="#/" aria-label="BIOSAVEUR, accueil" style="text-decoration:none">biosaveur</a>' +
      '<form class="srch" data-form="search" role="search"><label for="q">' + ic('search', 's') + '<input id="q" name="q" type="search" placeholder="Rechercher poulet, découpes, packs…" value="' + esc(r.name === 'recherche' ? (r.q.q || '') : '') + '" autocomplete="off"></label><button type="submit">Rechercher</button></form>' +
      '<nav class="ch-links" aria-label="Raccourcis">' +
      '<button data-act="nav" data-h="#/cotisation">' + ic('coin') + '<span class="lbl">Cotisation</span></button>' +
      '<button data-act="nav" data-h="' + (u ? '#/compte' : '#/connexion') + '">' + ic('user') + '<span class="lbl">' + (u ? 'Compte' : 'Se connecter') + '</span><span class="badge" data-badge="acct"' + (nb ? '' : ' hidden') + '>' + nb + '</span></button>' +
      '<button data-act="nav" data-h="#/panier" aria-label="Panier">' + ic('cart') + '<span class="lbl">Panier</span><span class="badge num" data-badge="cart"' + (n ? '' : ' hidden') + '>' + n + '</span></button>' +
      '</nav></div></header>' +
      '<div class="strip"><div class="wrap">' + ic('truck', 's') + '<span>' + (u && u.commune ? 'Livraison à ' + esc(u.commune) : 'Livraison dans tout Abidjan') + ' · créneaux de 2 h, remise contrôlée par QR code</span></div></div>';
    document.getElementById('main').className = 'wrap';
    var pg = r.name;
    function b(h, icn, l, names, extra) {
      var cur = names.indexOf(pg) >= 0;
      return '<button data-act="nav" data-h="' + h + '"' + (cur ? ' aria-current="page"' : '') + '>' + ic(icn) + l + (extra || '') + '</button>';
    }
    document.getElementById('ftr').innerHTML =
      '<footer class="cf"><div class="wrap">' +
      '<div><strong>BIOSAVEUR</strong><br>AGRO VIVDURABLE SARL<br>Poulet halal et traçable, livré à Abidjan</div>' +
      '<div><strong>Mon compte</strong><button data-act="nav" data-h="#/cotisation">Ma cotisation</button><button data-act="nav" data-h="#/commandes">Mes commandes</button><button data-act="nav" data-h="#/parrainage">Parrainage</button></div>' +
      '<div><strong>Aide</strong><button data-act="nav" data-h="#/commandes">Suivre ma livraison</button><button data-act="nav" data-h="#/messages">Écrire à l’équipe</button></div>' +
      '<div><strong>Paiement</strong><br>À la livraison, par cotisation' + (App.cfg.onlinePayment ? ' ou en ligne (Mobile Money, carte) avec CinetPay' : '') + '</div>' +
      '</div></footer>' +
      '<nav class="bnav" aria-label="Navigation principale">' +
      b('#/', 'home', 'Accueil', ['', 'produit']) + b('#/cat', 'grid', 'Catégories', ['cat', 'recherche']) + b('#/cotisation', 'coin', 'Cotisation', ['cotisation']) +
      b('#/panier', 'cart', 'Panier', ['panier'], '<span class="badge" data-badge="cart"' + (n ? '' : ' hidden') + '>' + n + '</span>') +
      b(u ? '#/compte' : '#/connexion', 'user', 'Compte', ['compte', 'commandes', 'commande', 'messages', 'profil', 'parrainage', 'connexion']) +
      '</nav>';
  };

  /* ---------- produits ---------- */
  function pct(p) { return p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0; }
  function art(p, big) {
    if (p.image_url) return '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">';
    return '<svg class="art" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (big ? 1.1 : 1.3) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + App.P[catOf(p.category).icon] + '</svg>';
  }
  App.prodArt = art;
  function pcard(p, flash) {
    var fill = Math.max(8, Math.min(100, Math.round(p.stock / 50 * 100)));
    return '<article class="pc">' +
      '<a class="open" href="#/produit/' + p.id + '" style="text-decoration:none">' +
      '<span class="ph">' + art(p) + (p.old_price ? '<span class="disc">-' + pct(p) + ' %</span>' : '') + (!flash && p.tag ? '<span class="tg">' + esc(p.tag) + '</span>' : '') + '</span>' +
      '<span class="nm">' + esc(p.name) + '</span>' +
      '<span class="price num">' + fcfa(p.price) + '</span>' +
      (p.old_price ? '<span class="old num">' + fcfa(p.old_price) + '</span>' : '<span class="xs muted">' + esc(p.weight) + '</span>') +
      '</a>' +
      (flash ? '<div class="bar"><i style="width:' + fill + '%"></i></div><span class="xs muted">' + (p.stock > 0 ? p.stock + ' restants' : 'Épuisé') + '</span>' : '') +
      '<button class="btn sm o add" data-act="quickAdd" data-id="' + p.id + '" data-opt="' + esc(p.options[0]) + '"' + (p.stock <= 0 ? ' disabled' : '') + '>' + ic('cart', 's') + (p.stock <= 0 ? 'Épuisé' : 'Ajouter') + '</button>' +
      '</article>';
  }
  App.A.quickAdd = function (d) { Cart.add(+d.id, d.opt, 1); App.toast('Ajouté au panier.'); };

  function catNav() { return CATS.map(function (c) { return '<a href="#/cat/' + c.id + '">' + ic(c.icon) + esc(c.label) + '</a>'; }).join(''); }

  App.route('', function () {
    var u = App.cfg.user;
    return Promise.all([App.get('/products'), u && u.role === 'client' ? App.get('/client/cotisation').catch(function () { return null; }) : null]).then(function (res) {
      var prods = res[0], c = res[1] && res[1].cotisation;
      var pc = c ? Math.min(100, Math.round(c.paid / c.target * 100)) : 0;
      var flash = prods.filter(function (p) { return p.flash; });
      var reco = prods.filter(function (p) { return !p.flash; }).slice(0, 6);
      return '<div class="stack">' +
        '<div class="hero-grid">' +
        '<nav class="card catnav" aria-label="Catégories">' + catNav().replace(/<a /g, '<a style="text-decoration:none;display:flex;align-items:center;gap:12px;padding:0 12px;min-height:44px;border-radius:8px;font-size:14px;color:var(--encre)" ') + '</nav>' +
        '<div class="hero"><div style="flex:1 1 280px;display:flex;flex-direction:column;gap:12px">' +
        '<span class="eye">Cotisation poulet</span><h1>Cotisez à votre rythme, recevez votre poulet</h1>' +
        '<p>Fixez un objectif en poulets, versez quand vous voulez, choisissez votre jour de livraison.</p>' +
        '<div class="row" style="flex-wrap:wrap"><a class="btn y" style="text-decoration:none" href="#/cotisation">' + (c ? 'Voir ma cotisation' : 'Commencer ma cotisation') + '</a></div></div>' +
        (c ? '<div class="coin"><strong class="num">' + pc + ' %</strong><span class="xs">de votre objectif</span></div>' : '') +
        '</div>' +
        '<div class="side-promos">' +
        '<a class="promo w" style="text-decoration:none" href="#/parrainage">' + ic('gift', 'l') + '<strong>Parrainez vos proches</strong><span>' + App.cfg.referralPoints + ' points par filleul, convertibles en FCFA.</span></a>' +
        '<a class="promo y" style="text-decoration:none" href="#/cat/evenements">' + ic('cal', 'l') + '<strong>Précommande événements</strong><span>Fêtes, mariages, baptêmes : réservez à l’avance.</span></a>' +
        '</div></div>' +
        '<div class="cats-m">' + CATS.map(function (x) { return '<a href="#/cat/' + x.id + '" style="text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:var(--encre);text-align:center"><span class="o">' + ic(x.icon) + '</span>' + esc(x.label) + '</a>'; }).join('') + '</div>' +
        (flash.length ? '<section class="card flash" aria-labelledby="fl-t"><div class="flash-h"><svg class="ic" viewBox="0 0 24 24" style="fill:var(--j);stroke:var(--j)">' + App.P.bolt + '</svg><h2 id="fl-t">Offres flash · Poulet du jour</h2><span class="cd">Se termine dans <strong id="cd" class="num">--</strong></span><a class="linkbtn" style="margin-left:auto;color:var(--j)" href="#/cat/flash">Voir tout</a></div>' +
          '<div class="pgrid">' + flash.map(function (p) { return pcard(p, true); }).join('') + '</div></section>' : '') +
        '<div class="trust">' +
        '<div><span class="o">' + ic('shield') + '</span><span><strong>Halal certifié</strong>Dossiers de certification suivis</span></div>' +
        '<div><span class="o">' + ic('qr') + '</span><span><strong>Traçable par QR</strong>De la ferme à votre assiette</span></div>' +
        '<div><span class="o">' + ic('truck') + '</span><span><strong>Livraison par créneau</strong>Remise confirmée par QR code</span></div>' +
        '<div><span class="o">' + ic('chat') + '</span><span><strong>Équipe à l’écoute</strong>Messagerie directe BIOSAVEUR</span></div>' +
        '</div>' +
        '<section class="stack" style="gap:12px"><div class="between"><h2 class="sec-t">Recommandé pour vous</h2><a class="linkbtn" href="#/cat">Tout voir</a></div>' +
        '<div class="pgrid">' + reco.map(function (p) { return pcard(p, false); }).join('') + '</div></section>' +
        '</div>';
    });
  });

  // compte à rebours des offres flash (fin de journée)
  setInterval(function () {
    var el = document.getElementById('cd'); if (!el) return;
    var n = new Date(), e = new Date(); e.setUTCHours(23, 59, 59, 999);
    var s = Math.max(0, Math.floor((e - n) / 1000)), z = function (x) { return (x < 10 ? '0' : '') + x; };
    el.textContent = z(Math.floor(s / 3600)) + 'h : ' + z(Math.floor(s % 3600 / 60)) + 'm : ' + z(s % 60) + 's';
  }, 1000);

  function listPage(title, url, active) {
    return App.get(url).then(function (list) {
      return '<div class="stack">' +
        '<div class="crumbs"><a href="#/">Accueil</a>›<span>' + title + '</span></div>' +
        '<div class="chips" role="group" aria-label="Catégories"><a class="chip" style="text-decoration:none;display:inline-flex;align-items:center" href="#/cat" aria-pressed="' + (active === '') + '">Tout</a>' +
        CATS.map(function (c) { return '<a class="chip" style="text-decoration:none;display:inline-flex;align-items:center" href="#/cat/' + c.id + '" aria-pressed="' + (active === c.id) + '">' + esc(c.label) + '</a>'; }).join('') + '</div>' +
        '<div class="between"><h1 class="sec-t" style="font-size:22px">' + title + '</h1><span class="small muted">' + list.length + ' produit' + (list.length > 1 ? 's' : '') + '</span></div>' +
        (list.length ? '<div class="pgrid">' + list.map(function (p) { return pcard(p, false); }).join('') + '</div>' :
          '<div class="card empty"><span class="o">' + ic('search', 'l') + '</span><strong>Aucun produit trouvé</strong><span class="muted small">Essayez « poulet », « cuisses » ou « pack ».</span><a class="btn o sm" href="#/cat">Voir tous les produits</a></div>') +
        '</div>';
    });
  }
  App.route('cat', function (r) {
    var id = r.args[0] || '';
    if (id === 'flash') return listPage('Offres flash', '/products?flash=1', 'flash');
    if (id) return listPage(esc(catOf(id).label), '/products?cat=' + encodeURIComponent(id), id);
    return listPage('Tous les produits', '/products', '');
  });
  App.route('recherche', function (r) { return listPage('Résultats pour « ' + esc(r.q.q || '') + ' »', '/products?q=' + encodeURIComponent(r.q.q || ''), null); });
  App.F.search = function (fd) { var q = String(fd.get('q') || '').trim(); App.go(q ? '#/recherche?q=' + encodeURIComponent(q) : '#/cat'); };

  var PV = { opt: null, qty: 1 };
  App.route('produit', function (r) {
    return App.get('/products/' + encodeURIComponent(r.args[0])).then(function (p) {
      PV = { id: p.id, opt: p.options[0], qty: 1, stock: p.stock, name: p.name };
      var c = catOf(p.category);
      function tr(k, v) { return v ? '<div><span>' + k + '</span><strong>' + esc(v) + '</strong></div>' : ''; }
      return '<div class="stack">' +
        '<div class="crumbs"><a href="#/">Accueil</a>›<a href="#/cat/' + p.category + '">' + esc(c.label) + '</a>›<span>' + esc(p.name) + '</span></div>' +
        '<div class="pd">' +
        '<div class="card pad"><div class="ph">' + art(p, true) + (p.old_price ? '<span class="disc">-' + pct(p) + ' %</span>' : '') + '</div></div>' +
        '<div class="card pad stack" style="gap:12px">' +
        '<div class="row" style="gap:6px;flex-wrap:wrap">' + (p.halal ? '<span class="pill ok">Halal certifié</span>' : '') + (p.lot_code ? '<span class="pill info">Traçable QR</span>' : '') + (p.category === 'evenements' ? '<span class="pill warn">Précommande</span>' : '') + '</div>' +
        '<h1 style="font-size:24px;font-weight:700">' + esc(p.name) + '</h1>' +
        (p.description ? '<p class="small" style="margin:0;color:#33403c">' + esc(p.description) + '</p>' : '') +
        '<div class="row" style="align-items:baseline;gap:12px;border-top:1px solid var(--ligne);padding-top:12px;flex-wrap:wrap"><span class="price num" style="font-size:30px">' + fcfa(p.price) + '</span>' + (p.old_price ? '<span class="old num" style="font-size:15px">' + fcfa(p.old_price) + '</span><span class="disc">-' + pct(p) + ' %</span>' : '') + '</div>' +
        '<div class="small" style="color:#33403c">Poids : ' + esc(p.weight) + (p.slaughter_date ? ' · Abattu le ' + App.fdate(p.slaughter_date) : '') + ' · ' + (p.stock > 0 ? '<strong style="color:var(--ok)">En stock (' + p.stock + ')</strong>' : '<strong style="color:var(--err)">Épuisé</strong>') + '</div>' +
        '<div class="stack" style="gap:8px"><span style="font-weight:700;font-size:14px">Présentation</span><div class="chips" id="opts">' + p.options.map(function (o, i) { return '<button class="chip" data-act="pOpt" data-v="' + esc(o) + '" aria-pressed="' + (i === 0) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>' +
        '<div class="row" style="flex-wrap:wrap;gap:12px;padding-top:4px">' +
        '<div class="stepper"><button data-act="pQty" data-d="-1" aria-label="Retirer un">−</button><span class="num" id="pq" aria-live="polite">1</span><button data-act="pQty" data-d="1" aria-label="Ajouter un">+</button></div>' +
        '<button class="btn p" style="flex:1 1 200px" data-act="pAdd"' + (p.stock <= 0 ? ' disabled' : '') + '>' + ic('cart', 's') + 'Ajouter au panier</button>' +
        '</div></div>' +
        '<aside class="stack" style="gap:12px">' +
        '<div class="card pad stack" style="gap:10px"><strong style="color:var(--vf)">Livraison</strong>' +
        '<div class="row small" style="align-items:flex-start">' + ic('truck') + '<span>Livraison le jour et le créneau de votre choix. Frais : ' + fcfa(App.cfg.deliveryFee) + '.</span></div>' +
        '<div class="row small" style="align-items:flex-start">' + ic('qr') + '<span>Le livreur scanne votre QR code à la remise.</span></div></div>' +
        '<div class="parr" style="font-size:13px"><strong style="font-size:15px">Payez avec votre cotisation</strong>Utilisez votre solde de cotisation au moment de valider le panier.</div>' +
        '</aside></div>' +
        (p.lot_code || p.farm ? '<section class="card pad stack" style="gap:12px"><div class="row">' + ic('shield') + '<h2 class="sec-t">Traçabilité BIOSAVEUR TRACE™</h2>' + (p.lot_code ? '<span class="pill info" style="margin-left:auto">' + esc(p.lot_code) + '</span>' : '') + '</div>' +
          '<div class="trace">' + tr('Ferme d’origine', p.farm) + tr('Alimentation', p.feed) + tr('Suivi vétérinaire', p.vet) + tr('Date d’abattage', p.slaughter_date ? App.fdate(p.slaughter_date) : '') + tr('Chaîne du froid', p.cold_chain) + tr('Certification halal', p.halal) + '</div></section>' : '') +
        '</div>';
    });
  });
  App.A.pOpt = function (d, el) { PV.opt = d.v; document.querySelectorAll('#opts .chip').forEach(function (b) { b.setAttribute('aria-pressed', b === el); }); };
  App.A.pQty = function (d) { PV.qty = Math.max(1, Math.min(Math.max(1, PV.stock), PV.qty + (+d.d))); document.getElementById('pq').textContent = PV.qty; };
  App.A.pAdd = function () { Cart.add(PV.id, PV.opt, PV.qty); App.toast(PV.qty + ' × ' + PV.name + ' ajouté au panier.'); };

  /* ---------- panier & commande ---------- */
  var CV = { day: 0, slot: 1, pay: 'livraison' };
  function days() { var a = []; for (var i = 0; i < 6; i++) a.push(App.iso(App.addDays(i))); return a; }
  App.route('panier', function () {
    var cart = Cart.items();
    if (!cart.length) return '<div class="card empty"><span class="o">' + ic('cart', 'l') + '</span><h1 class="sec-t">Votre panier est vide</h1><span class="muted">Parcourez les offres du jour pour commencer.</span><a class="btn p" href="#/">Voir les offres</a></div>';
    var u = App.cfg.user;
    return Promise.all([App.get('/products'), u && u.role === 'client' ? App.get('/client/cotisation') : null]).then(function (res) {
      var by = {}; res[0].forEach(function (p) { by[p.id] = p; });
      var valid = cart.filter(function (c) { return by[c.pid]; });
      if (valid.length !== cart.length) Cart.save(valid);
      var sub = 0; valid.forEach(function (c) { sub += by[c.pid].price * c.q; });
      var fee = App.cfg.deliveryFee, tot = sub + fee;
      var cot = res[1] && res[1].cotisation;
      var canCot = cot && cot.paid >= tot;
      if (CV.pay === 'cotisation' && !canCot) CV.pay = 'livraison';
      if (CV.pay === 'cinetpay' && !App.cfg.onlinePayment) CV.pay = 'livraison';
      var ds = days();
      var lines = valid.map(function (c, i) {
        var p = by[c.pid];
        var warn = c.q > p.stock ? '<div class="xs" style="color:var(--err)">Il n’en reste que ' + p.stock + '.</div>' : '';
        return '<div class="cline"><div class="ph">' + art(p) + '</div><div class="inf"><div>' + esc(p.name) + '</div><div class="small muted">' + esc(c.opt) + ' · ' + esc(p.weight) + '</div>' + warn + '<button class="linkbtn" style="color:var(--err);font-weight:600;padding-left:0" data-act="cartDel" data-i="' + i + '">Retirer</button></div><div class="stepper"><button data-act="cartQ" data-i="' + i + '" data-d="-1" aria-label="Retirer un">−</button><span class="num">' + c.q + '</span><button data-act="cartQ" data-i="' + i + '" data-d="1" aria-label="Ajouter un">+</button></div><span class="price num" style="min-width:110px;text-align:right">' + fcfa(p.price * c.q) + '</span></div>';
      }).join('');
      function radio(v, t, sub2, ok) {
        return '<label class="radio"' + (ok ? '' : ' style="opacity:.5;cursor:not-allowed"') + '><input type="radio" name="pay" value="' + v + '" data-chg="setPay"' + (CV.pay === v ? ' checked' : '') + (ok ? '' : ' disabled') + '><span class="t">' + t + '<br><span class="xs muted">' + sub2 + '</span></span>' + (v === 'cinetpay' && App.cfg.paymentMode === 'simulation' ? '<span class="pill neutral">Mode test</span>' : '') + '</label>';
      }
      var addr = u ? (u.address ? '<div class="row small" style="align-items:flex-start">' + ic('pin') + '<span><strong>' + esc(u.name) + '</strong><br>' + esc(u.address) + ', ' + esc(u.commune) + ' · ' + App.phone(u.phone) + (u.landmark ? '<br>Repère : ' + esc(u.landmark) : '') + '<br>' + (u.lat != null ? '<span style="color:var(--ok);font-weight:700">Position GPS enregistrée</span>' : '<a href="#/profil">Placer ma position sur la carte</a> pour guider le livreur') + '</span></div>'
        : '<div class="note">Ajoutez votre adresse de livraison avant de commander. <a href="#/profil">Compléter mon profil</a></div>')
        : '<div class="note info">Connectez-vous ou créez un compte pour choisir la livraison et commander.</div>';
      return '<div class="two"><div class="mainc">' +
        '<section class="card pad"><h1 class="sec-t" style="margin-bottom:6px">Panier (' + Cart.count() + ')</h1>' + lines + '</section>' +
        '<section class="card pad stack" style="gap:12px"><div class="between"><h2 class="sec-t" style="font-size:17px">Livraison</h2>' + (u ? '<a class="linkbtn" href="#/profil">Modifier l’adresse</a>' : '') + '</div>' + addr +
        '<span style="font-weight:700">Jour de livraison</span><div class="chips">' + ds.map(function (d, i) { return '<button class="chip" data-act="setDay" data-i="' + i + '" aria-pressed="' + (CV.day === i) + '">' + App.fday(d) + '</button>'; }).join('') + '</div>' +
        '<span style="font-weight:700">Créneau horaire</span><div class="slots">' + App.cfg.slots.map(function (s, i) { return '<button class="chip" data-act="setSlot" data-i="' + i + '" aria-pressed="' + (CV.slot === i) + '">' + s + '</button>'; }).join('') + '</div></section>' +
        '<section class="card pad" style="padding-bottom:4px"><h2 class="sec-t" style="font-size:17px;margin-bottom:8px">Paiement</h2>' +
        radio('livraison', 'Paiement à la livraison', 'Espèces ou Mobile Money au livreur', true) +
        radio('cinetpay', 'Payer en ligne avec CinetPay', App.cfg.onlinePayment ? 'Orange Money, MTN, Moov, Wave, carte bancaire' : 'Bientôt disponible', App.cfg.onlinePayment) +
        radio('cotisation', 'Débiter ma cotisation', cot ? 'Solde : ' + fcfa(cot.paid) + (canCot ? '' : ' (insuffisant)') : 'Aucune cotisation en cours', !!canCot) +
        '</section></div>' +
        '<aside class="side sticky card pad stack" style="gap:6px"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Récapitulatif</h2>' +
        '<div class="sum"><span>Sous-total</span><span class="num">' + fcfa(sub) + '</span></div>' +
        '<div class="sum"><span>Livraison</span><span class="num">' + fcfa(fee) + '</span></div>' +
        '<div class="sum"><span>Créneau</span><span>' + App.fday(ds[CV.day]) + ' · ' + App.cfg.slots[CV.slot] + '</span></div>' +
        '<div class="sum tot"><span>Total</span><span class="num">' + fcfa(tot) + '</span></div>' +
        (u ? '<button class="btn p full" style="margin-top:10px" data-act="checkout"' + (u.address ? '' : ' disabled') + '>' + (CV.pay === 'cinetpay' ? 'Payer ' + fcfa(tot) : 'Valider la commande') + '</button>'
          : '<a class="btn p full" style="margin-top:10px" href="#/connexion?suite=' + encodeURIComponent('#/panier') + '">Se connecter pour commander</a>') +
        '<span class="xs muted" style="margin-top:4px">Un QR code de vérification vous est remis après validation.</span></aside></div>';
    });
  });
  App.A.cartQ = function (d) { var c = Cart.items(), it = c[+d.i]; if (!it) return; it.q = Math.max(1, it.q + (+d.d)); Cart.save(c); App.render(); };
  App.A.cartDel = function (d) { var c = Cart.items(); c.splice(+d.i, 1); Cart.save(c); App.render(); };
  App.A.setDay = function (d) { CV.day = +d.i; App.render(); };
  App.A.setSlot = function (d) { CV.slot = +d.i; App.render(); };
  App.A.setPay = function (d, el) { CV.pay = el.value; App.render(); };
  App.A.checkout = function (d, el) {
    el.disabled = true;
    var body = { items: Cart.items().map(function (c) { return { product_id: c.pid, option: c.opt, qty: c.q }; }), day: days()[CV.day], slot: App.cfg.slots[CV.slot], pay_method: CV.pay };
    App.post('/client/orders', body).then(function (r) {
      if (r.payment_url) { location.href = r.payment_url; return; }
      Cart.clear();
      App.go('#/commande/' + r.order.id + '?ok=1');
    }).catch(function (e) { el.disabled = false; App.err(e); });
  };

  function tracker(o) {
    var cur = STATUS.map(function (s) { return s[0]; }).indexOf(o.status);
    if (cur < 0) return '';
    return '<div class="track" aria-label="Suivi : ' + ST_LABEL[o.status] + '">' + STATUS.map(function (s, i) {
      var cls = i < cur ? 'done' : (i === cur ? (o.status === 'livree' ? 'done' : 'cur') : '');
      return '<div class="st ' + cls + '"><div class="ln"><i class="' + (i === 0 ? 'no' : (i <= cur ? 'on' : '')) + '"></i><span class="dt"></span><i class="' + (i === 3 ? 'no' : (i < cur ? 'on' : '')) + '"></i></div><span>' + s[1] + '</span></div>';
    }).join('') + '</div>';
  }
  App.tracker = tracker;

  App.route('commande', function (r) {
    needLogin();
    return App.get('/client/orders/' + encodeURIComponent(r.args[0])).then(function (o) {
      var ok = r.q.ok === '1';
      var msg = o.status === 'livree' ? 'Livrée le ' + App.fdt(o.delivered_at) + '. Merci pour votre confiance.'
        : o.status === 'annulee' ? 'Cette commande a été annulée.'
          : o.status === 'attente_paiement' ? 'Paiement en ligne en attente de confirmation.'
            : 'Livraison prévue ' + App.fday(o.day).toLowerCase() + ', créneau ' + o.slot + '. Présentez ce QR code au livreur.';
      return '<div class="two"><div class="mainc">' +
        (ok ? '<div class="card pad row" style="background:var(--ok-bg);color:var(--ok);gap:12px">' + ic('check', 'l') + '<div><strong style="font-size:17px">Commande confirmée</strong><br><span class="small">Vous recevrez une notification à chaque étape.</span></div></div>' : '') +
        '<section class="card pad stack" style="gap:14px"><div class="between"><h1 class="sec-t">' + esc(o.number) + '</h1>' + App.stPill(o.status) + '</div>' + tracker(o) + '<div class="note info">' + msg + '</div></section>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Articles</h2>' +
        o.items.map(function (it) { return '<div class="cline"><div class="inf">' + esc(it.name) + '<br><span class="small muted">' + esc(it.option) + ' · quantité ' + it.qty + '</span></div><span class="num" style="font-weight:700">' + (o.kind === 'cotisation' ? 'Cotisation' : fcfa(it.unit_price * it.qty)) + '</span></div>'; }).join('') +
        (o.kind === 'cotisation' ? '' : '<div class="sum" style="margin-top:6px"><span>Livraison</span><span class="num">' + fcfa(o.fee) + '</span></div><div class="sum tot"><span>Total</span><span class="num">' + fcfa(o.total) + '</span></div>') +
        '<div class="small muted" style="padding-top:8px">Paiement : ' + App.payTxt(o) + '</div>' +
        '<div class="small muted">Adresse : ' + esc(o.address) + ', ' + esc(o.commune) + '</div></section>' +
        '</div><aside class="side sticky stack" style="gap:12px">' +
        (o.status !== 'annulee' && o.status !== 'livree' && o.status !== 'attente_paiement' ? '<div class="qrbox"><div class="qr">' + o.qr_svg + '</div><span class="code">' + esc(o.qr_code) + '</span><span class="xs muted" style="text-align:center">À montrer au livreur à la remise</span></div>' : '') +
        '<a class="btn o full" href="#/messages">' + ic('chat', 's') + 'Contacter l’équipe</a></aside></div>';
    });
  });

  /* ---------- compte ---------- */
  function accNav(cur) {
    var it = [['compte', 'user', 'Mon compte'], ['cotisation', 'coin', 'Ma cotisation'], ['commandes', 'list', 'Mes commandes'], ['messages', 'chat', 'Messages'], ['parrainage', 'gift', 'Parrainage'], ['profil', 'pin', 'Profil et adresse']];
    return '<nav class="card" aria-label="Mon compte">' + it.map(function (x) { return '<button data-act="nav" data-h="#/' + x[0] + '"' + (cur === x[0] ? ' aria-current="page"' : '') + '>' + ic(x[1]) + x[2] + '</button>'; }).join('') +
      '<button data-act="logout">' + ic('logout') + 'Se déconnecter</button></nav>';
  }
  function shell(cur, inner) { return '<div class="acc">' + accNav(cur) + '<div class="accm">' + inner + '</div></div>'; }
  App.accShell = shell;
  App.A.logout = function () { App.post('/auth/logout').then(function () { App.cfg.user = null; App.go('#/'); App.toast('Vous êtes déconnecté.'); }); };

  App.route('commandes', function () {
    needLogin();
    return App.get('/client/orders').then(function (list) {
      return shell('commandes', '<section class="card pad"><h1 class="sec-t" style="margin-bottom:8px">Mes commandes</h1>' +
        (list.length ? list.map(function (o) { return '<a class="list-row" style="text-decoration:none;color:inherit;padding:8px 0" href="#/commande/' + o.id + '"><span style="flex:1;min-width:0"><strong>' + esc(o.number) + '</strong>' + (o.kind === 'cotisation' ? ' · Cotisation' : '') + '<br><span class="small muted">' + App.fday(o.day) + ' · ' + o.slot + ' · ' + esc(App.itemsTxt(o)) + '</span></span>' + App.stPill(o.status) + ic('right', 's') + '</a>'; }).join('') :
          '<div class="empty"><span class="o">' + ic('list', 'l') + '</span><strong>Aucune commande pour le moment</strong><a class="btn p sm" href="#/">Découvrir la boutique</a></div>') +
        '</section>');
    });
  });

  App.route('compte', function () {
    needLogin();
    var u = App.cfg.user;
    if (u.role !== 'client') return App.go('#/' + (u.role === 'admin' ? 'admin' : 'livreur'));
    return Promise.all([App.get('/client/orders'), App.get('/client/notifications')]).then(function (res) {
      var cur = res[0].filter(function (o) { return ['confirmee', 'preparee', 'en_route'].indexOf(o.status) >= 0; })[0];
      var notifs = res[1], nn = notifs.filter(function (n) { return !n.read; }).length;
      return shell('compte',
        '<section class="card pad row" style="flex-wrap:wrap;gap:14px">' +
        '<span style="width:60px;height:60px;border-radius:50%;background:var(--vf);border:3px solid var(--j);color:var(--j);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + ic('user', 'l') + '</span>' +
        '<div style="flex:1 1 180px"><h1 style="font-size:21px;color:var(--vf)">Bonjour, ' + esc(u.name.split(' ')[0]) + '</h1><span class="small muted">' + App.phone(u.phone) + ' · Code parrain ' + esc(u.referral_code) + '</span></div>' +
        '<a class="btn o sm" href="#/profil">' + ic('pin', 's') + 'Profil et adresse</a></section>' +
        '<div class="tiles">' +
        '<button data-act="nav" data-h="#/commandes">' + ic('list') + 'Mes commandes</button>' +
        '<button data-act="nav" data-h="#/cotisation">' + ic('coin') + 'Cotisation</button>' +
        '<button data-act="nav" data-h="#/messages">' + ic('chat') + 'Messages' + (App.badges.messages ? '<span class="badge">' + App.badges.messages + '</span>' : '') + '</button>' +
        '<button data-act="nav" data-h="#/parrainage">' + ic('gift') + 'Parrainage</button>' +
        '<button data-act="nav" data-h="#/profil">' + ic('pin') + 'Profil</button>' +
        '<button data-act="logout">' + ic('logout') + 'Déconnexion</button></div>' +
        (u.lat == null ? '<div class="note">Placez votre domicile sur la carte pour que le livreur vous trouve facilement. <a href="#/profil">Placer ma position</a></div>' : '') +
        (cur ? '<section class="card pad stack" style="gap:12px"><div class="between"><h2 class="sec-t" style="font-size:17px">Commande en cours · ' + esc(cur.number) + '</h2><a class="linkbtn" href="#/commande/' + cur.id + '">QR et détails</a></div>' + tracker(cur) + '<div class="note info">' + App.fday(cur.day) + ' · ' + cur.slot + ' · présentez votre QR code au livreur.</div></section>' : '') +
        '<section class="card pad"><div class="between" style="margin-bottom:4px"><h2 class="sec-t" style="font-size:17px">Notifications</h2>' + (nn ? '<button class="linkbtn" data-act="readNotifs">Tout marquer comme lu</button>' : '') + '</div>' +
        (notifs.length ? notifs.map(function (n) { return '<div class="list-row">' + (n.read ? '<span style="width:8px"></span>' : '<span class="dotn"></span>') + '<span style="flex:1">' + esc(n.body) + '<br><span class="xs muted">' + App.fdt(n.created_at) + '</span></span></div>'; }).join('') : '<p class="muted small">Aucune notification.</p>') +
        '</section>');
    });
  });
  App.A.readNotifs = function () { App.post('/client/notifications/read').then(function () { App.badges.notifications = 0; App.render(); }); };

  App.route('cotisation', function () {
    needLogin();
    return App.get('/client/cotisation').then(function (d) {
      var k = d.cotisation;
      if (!k) {
        return shell('cotisation', '<section class="card pad stack" style="gap:14px"><h1 class="sec-t">Démarrer une cotisation</h1>' +
          '<p class="muted" style="margin:0">Choisissez un objectif en poulets et versez à votre rythme. Quand l’objectif est atteint, programmez votre livraison.</p>' +
          '<form class="stack" style="gap:12px" data-form="newCot"><div class="form-grid"><div class="field"><label for="nc">Objectif (nombre de poulets)</label><input id="nc" name="chickens" type="number" min="1" max="100" value="6" required></div>' +
          '<div class="field"><label for="nd">Jour de livraison préféré</label><select id="nd" name="day">' + App.JOURS.map(function (j) { return '<option' + (j === 'Samedi' ? ' selected' : '') + '>' + j + '</option>'; }).join('') + '</select></div></div>' +
          '<label class="chk"><input type="checkbox" name="auto" checked> Relancer automatiquement une nouvelle cotisation après la livraison</label>' +
          '<span class="small muted">Prix de référence : ' + fcfa(App.cfg.chickenPrice) + ' par poulet.</span>' +
          '<button class="btn p" type="submit">Créer ma cotisation</button></form>' +
          (d.completed ? '<span class="small muted">Cotisations déjà livrées : ' + d.completed + '</span>' : '') + '</section>');
      }
      var pc = Math.min(100, Math.round(k.paid / k.target * 100)), done = k.status === 'complete';
      return shell('cotisation',
        '<section class="cot-hero"><div style="flex:2 1 300px;display:flex;flex-direction:column;gap:10px">' +
        '<div class="row"><span class="lbl-up" style="color:var(--j)">Objectif en cours</span><span class="pill ' + (done ? 'warn' : 'ok') + '">' + (done ? 'Complète' : 'Active') + '</span></div>' +
        '<span class="big num">' + k.chickens + ' poulets</span>' +
        '<div class="prog" role="progressbar" aria-valuenow="' + pc + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pc + '%"></i></div>' +
        '<div class="between small" style="color:var(--sur-vf)"><span><strong class="num" style="color:#fff">' + fcfa(k.paid) + '</strong> versés</span><span class="num">sur ' + fcfa(k.target) + ' (' + pc + ' %)</span></div></div>' +
        '<div style="flex:1 1 220px;display:flex;flex-direction:column;gap:10px">' +
        (done ? '<button class="btn y" data-act="livrerCot">Programmer ma livraison</button>' : '<button class="btn y" data-act="versement">Faire un versement</button><span class="small" style="color:var(--sur-vf)">Reste à verser : <strong class="num" style="color:#fff">' + fcfa(k.target - k.paid) + '</strong></span>') +
        '</div></section>' +
        '<div class="grid2">' +
        '<div class="card pad stack" style="gap:8px"><label class="small muted" for="jour">Jour de livraison</label><select id="jour" data-chg="setJour" style="min-height:46px;border:1.5px solid #c9d3cf;border-radius:8px;padding:0 10px;font-weight:700;background:var(--surf)">' + App.JOURS.map(function (j) { return '<option' + (k.delivery_day === j ? ' selected' : '') + '>' + j + '</option>'; }).join('') + '</select></div>' +
        '<div class="card pad row" style="justify-content:space-between"><span><span class="small muted">Renouvellement automatique</span><br><strong>' + (k.auto_renew ? 'Activé' : 'Désactivé') + '</strong></span><label class="switch"><input type="checkbox" data-chg="toggleAuto" aria-label="Renouvellement automatique"' + (k.auto_renew ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="card pad"><span class="small muted">Prix par poulet</span><br><strong class="num">' + fcfa(k.unit_price) + '</strong></div>' +
        '<div class="parr" style="gap:4px"><span class="small">Cotisations livrées</span><strong style="font-size:20px" class="num">' + d.completed + '</strong><span class="small">Chaque cotisation complète compte pour votre fidélité.</span></div>' +
        '</div>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Historique des versements</h2>' +
        (d.history.length ? '<div class="tbl"><table style="min-width:420px"><thead><tr><th>Date</th><th>Moyen</th><th style="text-align:right">Montant</th></tr></thead><tbody>' +
          d.history.map(function (h2) { return '<tr><td>' + App.fdate(h2.created_at) + '</td><td>' + esc(h2.method) + '</td><td class="num" style="text-align:right;font-weight:800;color:var(--vf)">+' + fcfa(h2.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p class="muted small">Aucun versement pour le moment.</p>') + '</section>');
    });
  });
  App.F.newCot = function (fd) {
    return App.post('/client/cotisation', { chickens: +fd.get('chickens'), delivery_day: fd.get('day'), auto_renew: !!fd.get('auto') }).then(function () { App.toast('Cotisation créée.'); App.render(); });
  };
  App.A.setJour = function (d, el) { App.put('/client/cotisation', { delivery_day: el.value }).then(function () { App.toast('Jour de livraison : ' + el.value + '.'); }).catch(App.err); };
  App.A.toggleAuto = function (d, el) { App.put('/client/cotisation', { auto_renew: el.checked }).then(function () { App.render(); }).catch(App.err); };
  App.A.versement = function () {
    App.get('/client/cotisation').then(function (d) {
      var k = d.cotisation, rest = k.target - k.paid;
      App.modal('<h2 class="sec-t">Faire un versement</h2><span class="small muted">Reste à verser : ' + fcfa(rest) + '</span>' +
        '<form class="stack" style="gap:12px" data-form="vers"><div class="field"><label for="vm">Montant (FCFA)</label><input id="vm" name="m" type="number" min="500" step="5" max="' + rest + '" value="' + Math.min(5000, rest) + '" required></div>' +
        '<div>' + (App.cfg.onlinePayment ? '<label class="radio"><input type="radio" name="moyen" value="cinetpay" checked><span class="t">Payer en ligne avec CinetPay<br><span class="xs muted">Mobile Money ou carte, crédité tout de suite</span></span></label>' : '') +
        '<label class="radio"><input type="radio" name="moyen" value="especes"' + (App.cfg.onlinePayment ? '' : ' checked') + '><span class="t">Espèces au livreur ou en agence<br><span class="xs muted">Crédité quand l’équipe enregistre le versement</span></span></label></div>' +
        '<button class="btn p" type="submit">Continuer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
    }).catch(App.err);
  };
  App.F.vers = function (fd) {
    return App.post('/client/cotisation/versement', { amount: +fd.get('m'), method: fd.get('moyen') }).then(function (r) {
      App.modal(null);
      if (r.payment_url) { location.href = r.payment_url; return; }
      App.toast('Message envoyé à l’équipe : remettez le montant au livreur ou en agence.');
    });
  };
  App.A.livrerCot = function () {
    var ds = days();
    App.modal('<h2 class="sec-t">Programmer ma livraison</h2><form class="stack" style="gap:12px" data-form="livrerCot">' +
      '<div class="field"><label for="ld">Jour</label><select id="ld" name="day">' + ds.map(function (d) { return '<option value="' + d + '">' + App.fday(d) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="ls">Créneau</label><select id="ls" name="slot">' + App.cfg.slots.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn p" type="submit">Confirmer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.livrerCot = function (fd) {
    return App.post('/client/cotisation/livrer', { day: fd.get('day'), slot: fd.get('slot') }).then(function (o) { App.modal(null); App.toast('Livraison programmée.'); App.go('#/commande/' + o.id + '?ok=1'); });
  };

  App.route('parrainage', function () {
    needLogin();
    return App.get('/client/referrals').then(function (r) {
      return shell('parrainage',
        '<section class="parr"><div class="between"><h1 style="font-size:20px">Parrainage</h1><strong class="num">' + r.points + ' points</strong></div>' +
        '<div class="row"><span class="cd">' + esc(r.code) + '</span><button class="btn p sm" style="min-height:46px" data-act="copy" data-v="' + esc(r.code) + '">Copier</button></div>' +
        '<span class="small">Votre filleul saisit ce code à l’inscription. Vous gagnez ' + App.cfg.referralPoints + ' points par filleul ; 1 point = 1 FCFA versé sur votre cotisation.</span></section>' +
        '<div class="grid2"><div class="card pad"><span class="small muted">Filleuls</span><br><strong style="font-size:24px" class="num">' + r.count + '</strong></div>' +
        '<div class="card pad"><span class="small muted">Valeur de vos points</span><br><strong style="font-size:24px" class="num">' + fcfa(r.points) + '</strong></div></div>' +
        '<section class="card pad stack" style="gap:10px"><h2 class="sec-t" style="font-size:17px">Convertir mes points</h2><span class="small muted">Les points convertis sont ajoutés à votre cotisation en cours.</span><button class="btn p" data-act="convert"' + (r.points < 100 ? ' disabled' : '') + '>Convertir ' + fcfa(r.points) + ' en versement</button></section>');
    });
  });
  App.A.convert = function () { App.post('/client/points/convert').then(function (r) { App.toast(fcfa(r.converted) + ' ajoutés à votre cotisation.'); App.loadConfig().then(App.render); }).catch(App.err); };
  App.A.copy = function (d) {
    var v = d.v;
    try { navigator.clipboard.writeText(v).then(function () { App.toast('Copié : ' + v); }, function () { App.toast('Sélectionnez le texte pour le copier.'); }); }
    catch (e) { App.toast('Sélectionnez le texte pour le copier.'); }
  };

  App.route('messages', function () {
    needLogin();
    return App.get('/client/messages').then(function (list) {
      App.badges.messages = 0;
      App.after.push(function () { var c = document.getElementById('chat'); if (c) c.scrollTop = c.scrollHeight; });
      return shell('messages', '<section class="card"><div class="pad" style="border-bottom:1px solid var(--ligne)"><h1 class="sec-t">Messages avec l’équipe BIOSAVEUR</h1><span class="small muted">Nous répondons de 7 h à 20 h.</span></div>' +
        '<div class="chat" id="chat">' + (list.length ? list.map(function (m) { return '<div class="bub ' + (m.from_team ? 'them' : 'me') + '">' + esc(m.body) + '<small>' + (m.from_team ? 'Équipe BIOSAVEUR' : 'Vous') + ' · ' + App.fdt(m.created_at) + '</small></div>'; }).join('') : '<p class="muted small">Écrivez-nous, nous répondons vite.</p>') + '</div>' +
        '<form class="chat-in" data-form="msgClient"><label for="msgc" hidden>Message</label><input id="msgc" name="t" placeholder="Votre message…" autocomplete="off" required maxlength="1000"><button class="btn p sm" style="min-height:46px" type="submit">Envoyer</button></form></section>');
    });
  });
  App.F.msgClient = function (fd) {
    return App.post('/client/messages', { body: fd.get('t') }).then(function () { App.render(); setTimeout(function () { var i = document.getElementById('msgc'); if (i) i.focus(); }, 300); });
  };

  App.route('profil', function () {
    needLogin();
    var u = App.cfg.user;
    App.after.push(function () {
      if (!App.map.available()) { document.getElementById('pmap').innerHTML = '<div class="note">La carte n’a pas pu se charger. Vérifiez votre connexion.</div>'; return; }
      var pk = App.map.picker(document.getElementById('pmap'), u.lat != null ? { lat: u.lat, lng: u.lng } : null, function (lat, lng) {
        document.getElementById('plat').value = lat; document.getElementById('plng').value = lng;
        document.getElementById('pcoord').textContent = 'GPS : ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
      });
      App._locate = pk.locate;
    });
    return shell('profil',
      '<section class="card pad stack" style="gap:14px"><h1 class="sec-t">Profil et adresse</h1>' +
      '<form class="stack" style="gap:12px" data-form="profil">' +
      '<div class="form-grid"><div class="field"><label for="pn">Nom complet</label><input id="pn" name="name" value="' + esc(u.name) + '" required maxlength="80"></div>' +
      '<div class="field"><label for="pt">Téléphone</label><input id="pt" value="' + App.phone(u.phone) + '" disabled></div></div>' +
      '<div class="form-grid"><div class="field"><label for="pc">Commune</label><select id="pc" name="commune"><option value="">Choisir…</option>' + App.cfg.communes.map(function (x) { return '<option' + (u.commune === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="pa">Adresse précise</label><input id="pa" name="address" value="' + esc(u.address) + '" required maxlength="200" placeholder="Quartier, rue, immeuble"></div></div>' +
      '<div class="field"><label for="pr">Point de repère pour le livreur</label><input id="pr" name="landmark" value="' + esc(u.landmark) + '" maxlength="200" placeholder="Ex. portail vert après la boulangerie"></div>' +
      '<div class="stack" style="gap:8px"><div class="between"><span style="font-weight:600;font-size:14px">Position de livraison</span><button class="btn o sm" type="button" data-act="locate">' + ic('gps', 's') + 'Utiliser ma position actuelle</button></div>' +
      '<span class="small muted">Touchez la carte à l’endroit exact de votre domicile, ou déplacez le repère. Le livreur sera guidé jusqu’à ce point.</span>' +
      '<div id="pmap" class="lmap sm"></div>' +
      '<input type="hidden" name="lat" id="plat" value="' + (u.lat != null ? u.lat : '') + '"><input type="hidden" name="lng" id="plng" value="' + (u.lng != null ? u.lng : '') + '">' +
      '<span class="small" id="pcoord">' + (u.lat != null ? 'GPS : ' + u.lat.toFixed(5) + ', ' + u.lng.toFixed(5) : 'Aucune position enregistrée') + '</span></div>' +
      '<button class="btn p" type="submit">Enregistrer</button></form></section>' +
      '<section class="card pad stack" style="gap:12px"><h2 class="sec-t" style="font-size:17px">Changer de mot de passe</h2><form class="form-grid" data-form="pw">' +
      '<div class="field"><label for="pw1">Mot de passe actuel</label><input id="pw1" name="current" type="password" required autocomplete="current-password"></div>' +
      '<div class="field"><label for="pw2">Nouveau mot de passe</label><input id="pw2" name="next" type="password" minlength="6" required autocomplete="new-password"></div>' +
      '<button class="btn o" type="submit" style="align-self:end">Modifier</button></form></section>');
  });
  App.A.locate = function () { if (App._locate) App._locate(); };
  App.F.profil = function (fd) {
    var b = {}; fd.forEach(function (v, k) { b[k] = v; });
    return App.put('/client/me', b).then(function (u) { App.cfg.user = u; App.toast('Profil et position enregistrés.'); });
  };
  App.F.pw = function (fd, form) { return App.put('/client/me/password', { current: fd.get('current'), next: fd.get('next') }).then(function () { form.reset(); App.toast('Mot de passe modifié.'); }); };

  /* ---------- connexion / inscription ---------- */
  function authPage(mode, r) {
    if (App.cfg.user) { App.go(r.q.suite || '#/'); return; }
    var demo = App.cfg.demo ? '<div class="card pad demo-acc"><strong style="color:var(--vf)">Comptes de démonstration</strong><span>Client : <code>07 00 00 00 01</code> / <code>demo1234</code></span><span>Livreur : <code>07 00 00 00 02</code> / <code>demo1234</code></span><span>Admin : <code>07 00 00 00 00</code> / <code>admin1234</code></span></div>' : '';
    var suite = esc(r.q.suite || '');
    var body = mode === 'login'
      ? '<form class="stack" style="gap:12px" data-form="login" data-suite="' + suite + '"><div class="field"><label for="lp">Numéro de téléphone</label><input id="lp" name="phone" inputmode="tel" autocomplete="tel" placeholder="07 00 00 00 00" required></div>' +
        '<div class="field"><label for="lw">Mot de passe</label><input id="lw" name="password" type="password" autocomplete="current-password" required></div>' +
        '<button class="btn p" type="submit">Se connecter</button><span class="small muted">Mot de passe oublié ? Écrivez-nous sur WhatsApp, l’équipe le réinitialise.</span></form>'
      : '<form class="stack" style="gap:12px" data-form="register" data-suite="' + suite + '"><div class="field"><label for="rn">Nom complet</label><input id="rn" name="name" autocomplete="name" required maxlength="80"></div>' +
        '<div class="field"><label for="rp">Numéro de téléphone</label><input id="rp" name="phone" inputmode="tel" autocomplete="tel" placeholder="07 00 00 00 00" required></div>' +
        '<div class="form-grid"><div class="field"><label for="rc">Commune</label><select id="rc" name="commune" required><option value="">Choisir…</option>' + App.cfg.communes.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="ra">Adresse</label><input id="ra" name="address" required maxlength="200" placeholder="Quartier, rue"></div></div>' +
        '<div class="field"><label for="rw">Mot de passe (6 caractères min.)</label><input id="rw" name="password" type="password" minlength="6" autocomplete="new-password" required></div>' +
        '<div class="field"><label for="rr">Code de parrainage (facultatif)</label><input id="rr" name="referral" placeholder="BSV-XXXX" value="' + esc(r.q.parrain || '') + '"></div>' +
        '<button class="btn p" type="submit">Créer mon compte</button></form>';
    return '<div class="auth"><div class="card"><div class="tabs2"><button data-act="nav" data-h="#/connexion' + (suite ? '?suite=' + encodeURIComponent(r.q.suite) : '') + '" aria-pressed="' + (mode === 'login') + '">Se connecter</button><button data-act="nav" data-h="#/inscription' + (suite ? '?suite=' + encodeURIComponent(r.q.suite) : '') + '" aria-pressed="' + (mode !== 'login') + '">Créer un compte</button></div>' +
      '<h1>' + (mode === 'login' ? 'Bon retour !' : 'Bienvenue chez BIOSAVEUR') + '</h1>' + body + '</div>' + demo + '</div>';
  }
  App.route('connexion', function (r) { return authPage('login', r); });
  App.route('inscription', function (r) { return authPage('register', r); });
  function afterAuth(u, form) {
    App.cfg.user = u;
    var s = form.getAttribute('data-suite');
    App.loadConfig().then(function () { App.go(s || (u.role === 'livreur' ? '#/livreur' : u.role === 'admin' ? '#/admin' : '#/')); });
  }
  App.F.login = function (fd, form) { return App.post('/auth/login', { phone: fd.get('phone'), password: fd.get('password') }).then(function (r) { afterAuth(r.user, form); }); };
  App.F.register = function (fd, form) {
    var b = {}; fd.forEach(function (v, k) { b[k] = v; });
    return App.post('/auth/register', b).then(function (r) { App.toast('Compte créé. Bienvenue !'); afterAuth(r.user, form); });
  };

  /* ---------- paiement en ligne ---------- */
  App.route('paiement', function (r) {
    needLogin();
    var tx = r.args[0];
    var tries = 0;
    function view(p) {
      var ok = p.status === 'ACCEPTED', ko = p.status === 'REFUSED' || p.status === 'EXPIRED';
      if (ok && p.purpose === 'commande') Cart.clear();
      var next = p.purpose === 'commande' ? '#/commande/' + p.ref_id + (ok ? '?ok=1' : '') : p.purpose === 'versement' ? '#/cotisation' : '#/';
      if (!ok && !ko) {
        if (tries++ < 40) setTimeout(function () { if (location.hash.indexOf('#/paiement/' + tx) === 0) App.render(); }, 3000);
        return '<div class="cp card pad stack" style="align-items:center;text-align:center;gap:14px;padding-block:40px"><div class="spin" role="status" aria-label="Paiement en cours"></div><strong>Confirmation du paiement en cours…</strong><span class="small muted">Si vous avez validé sur votre téléphone, cela prend quelques secondes.</span><a class="linkbtn" href="' + next + '">Continuer sans attendre</a></div>';
      }
      return '<div class="cp card pad stack" style="align-items:center;text-align:center;gap:12px;padding-block:32px">' +
        '<span style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' + (ok ? 'var(--ok-bg)' : 'var(--err-bg)') + ';color:' + (ok ? 'var(--ok)' : 'var(--err)') + '">' + ic(ok ? 'check' : 'x', 'l') + '</span>' +
        '<strong style="font-size:18px">' + (ok ? 'Paiement accepté' : 'Paiement non abouti') + '</strong>' +
        '<span class="small muted">' + (ok ? (p.purpose === 'versement' ? 'Votre versement de ' + fcfa(p.amount) + ' est crédité sur votre cotisation.' : 'Votre commande est confirmée.') : 'Aucun montant n’a été débité. ' + (p.purpose === 'commande' ? 'La commande a été annulée ; votre panier est conservé.' : '')) + '</span>' +
        '<a class="btn p" href="' + (ok ? next : (p.purpose === 'commande' ? '#/panier' : '#/cotisation')) + '">' + (ok ? 'Continuer' : 'Revenir') + '</a></div>';
    }
    return App.get('/client/payments/' + encodeURIComponent(tx)).then(view);
  });

  // Guichet simulé (tant que CinetPay n'est pas branché).
  var OPS = [['ORANGE MONEY', 'Orange Money', '#ff7900'], ['MTN MOMO', 'MTN MoMo', '#ffcc00'], ['MOOV MONEY', 'Moov Money', '#0066b3'], ['WAVE', 'Wave', '#1dc8ff'], ['CARTE', 'Carte bancaire', '#1f3b8f']];
  var SIM = { op: 'ORANGE MONEY' };
  App.route('paiement-simule', function (r) {
    needLogin();
    var tx = r.args[0];
    return App.get('/cinetpay/tx/' + encodeURIComponent(tx)).then(function (p) {
      if (p.applied) { App.go('#/paiement/' + encodeURIComponent(tx)); return; }
      return '<div class="cp stack"><div class="note small">Guichet de <strong>test</strong> : CinetPay n’est pas encore branché, aucun argent réel n’est débité. Un numéro qui se termine par 0000 simule un refus.</div>' +
        '<div class="card"><div class="cp-head"><span class="cp-mark">CinetPay</span><span class="small muted">Paiement sécurisé · BIOSAVEUR</span></div>' +
        '<div class="pad stack" style="gap:14px"><div class="between"><span class="muted small">' + (p.purpose === 'versement' ? 'Versement cotisation' : 'Commande BIOSAVEUR') + '</span><span class="price num" style="font-size:22px">' + fcfa(p.amount) + '</span></div>' +
        '<span style="font-weight:700">Moyen de paiement</span><div class="ops" id="ops">' + OPS.map(function (o) { return '<button data-act="simOp" data-v="' + o[0] + '" aria-pressed="' + (SIM.op === o[0]) + '"><span class="dot" style="background:' + o[2] + '"></span>' + o[1] + '</button>'; }).join('') + '</div>' +
        '<form class="stack" style="gap:12px" data-form="simPay" data-tx="' + esc(tx) + '"><div class="field"><label for="st">Numéro ou carte</label><input id="st" name="tel" value="' + App.phone(App.cfg.user.phone) + '" required></div>' +
        '<button class="btn full" style="background:#1f3b8f;color:#fff" type="submit">Payer ' + fcfa(p.amount) + '</button>' +
        '<button class="linkbtn" type="button" data-act="simCancel" data-tx="' + esc(tx) + '">Annuler et revenir à BIOSAVEUR</button></form></div></div></div>';
    });
  });
  App.A.simOp = function (d, el) { SIM.op = d.v; document.querySelectorAll('#ops button').forEach(function (b) { b.setAttribute('aria-pressed', b === el); }); };
  App.F.simPay = function (fd, form) {
    var tx = form.getAttribute('data-tx'), tel = String(fd.get('tel')).replace(/\s/g, '');
    return App.post('/cinetpay/simulate/' + encodeURIComponent(tx), { result: /0000$/.test(tel) ? 'REFUSED' : 'ACCEPTED', method: SIM.op }).then(function () { App.go('#/paiement/' + encodeURIComponent(tx)); });
  };
  App.A.simCancel = function (d) { App.post('/cinetpay/simulate/' + encodeURIComponent(d.tx), { result: 'REFUSED', method: 'ANNULÉ' }).then(function () { App.go('#/paiement/' + encodeURIComponent(d.tx)); }).catch(App.err); };
})();
