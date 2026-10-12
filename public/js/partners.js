/* Espaces fournisseur et partenaire. */
(function () {
  'use strict';
  var App = window.App, ic = App.ic, esc = App.esc, fcfa = App.fcfa;

  var SUP_ST = { demandee: ['warn', 'À confirmer'], confirmee: ['info', 'Confirmée · à livrer'], livree: ['ok', 'Livrée'], refusee: ['err', 'Refusée'], annulee: ['neutral', 'Annulée'] };
  App.supPill = function (s) { var x = SUP_ST[s] || ['neutral', s]; return '<span class="pill ' + x[0] + '">' + x[1] + '</span>'; };

  function head(title, sub) {
    return '<div class="lv-h"><div class="wrap"><div class="row" style="flex-wrap:wrap"><div style="flex:1 1 220px"><span class="lbl-up" style="color:var(--sur-vf)">' + sub + '</span><h1 style="font-size:22px;font-weight:800">' + esc(title) + '</h1></div></div>';
  }
  function kpi(v, l) { return '<div class="kpi"><b class="num">' + v + '</b><span>' + l + '</span></div>'; }

  /* ---------- fournisseur ---------- */
  App.route('fournisseur', function () {
    App.needStaff('fournisseur');
    return App.get('/supplier/overview').then(function (d) {
      var u = App.cfg.user, s = d.stats;
      var open = d.orders.filter(function (o) { return o.status === 'demandee' || o.status === 'confirmee'; });
      var past = d.orders.filter(function (o) { return !(o.status === 'demandee' || o.status === 'confirmee'); });
      function card(o) {
        var act = '';
        if (o.status === 'demandee') act = '<button class="btn p sm" data-act="supConfirm" data-id="' + o.id + '" data-due="' + (o.due_date || '') + '">' + ic('check', 's') + 'Confirmer</button><button class="btn o sm" data-act="supRefuse" data-id="' + o.id + '">Je ne peux pas</button>';
        if (o.status === 'confirmee') act = '<button class="btn p sm" data-act="supDeliver" data-id="' + o.id + '">' + ic('truck', 's') + 'Marquer comme livrée</button>';
        return '<article class="card run"><div class="row"><strong style="color:var(--vf)">' + esc(o.number) + '</strong><span style="margin-left:auto">' + App.supPill(o.status) + '</span></div>' +
          '<div style="font-size:16px"><strong class="num">' + o.qty + ' ×</strong> ' + esc(o.product_name) + '</div>' +
          '<div class="small muted">Livraison souhaitée : <strong style="color:var(--encre)">' + (o.due_date ? App.fday(o.due_date) : 'dès que possible') + '</strong>' + (o.unit_cost ? ' · ' + fcfa(o.unit_cost) + ' / unité · total ' + fcfa(o.unit_cost * o.qty) : '') + '</div>' +
          (o.note ? '<div class="small">Note BIOSAVEUR : ' + esc(o.note) + '</div>' : '') +
          (o.supplier_note ? '<div class="small muted">Votre réponse : ' + esc(o.supplier_note) + '</div>' : '') +
          '<div class="row" style="flex-wrap:wrap;gap:8px">' + act + '</div></article>';
      }
      return head(u.company || u.name, 'Espace fournisseur') +
        '<div class="kpis">' + kpi(s.a_confirmer, 'À confirmer') + kpi(s.a_livrer, 'À livrer') + kpi(s.livrees_mois, 'Livrées ce mois') + kpi('<span style="font-size:18px">' + fcfa(s.montant_mois) + '</span>', 'Montant livré ce mois') + '</div></div></div>' +
        '<div class="wrap stack" style="padding-block:16px 40px"><div class="lv-grid">' +
        '<div class="stack" style="gap:10px"><h2 class="sec-t" style="font-size:17px">Commandes en cours</h2>' +
        (open.length ? open.map(card).join('') : '<div class="card empty"><span class="o">' + ic('box', 'l') + '</span><strong>Aucune commande en cours</strong><span class="small muted">Vous recevez une notification à chaque nouvelle demande de BIOSAVEUR.</span></div>') +
        '</div>' +
        '<aside class="stack" style="gap:12px"><section class="card pad"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Vos produits chez BIOSAVEUR</h2>' +
        '<span class="small muted">Stock disponible à l’entrepôt. En rouge : sous le seuil, une commande va arriver.</span>' +
        d.products.map(function (p) {
          var low = p.stock <= p.threshold;
          return '<div class="list-row"><span style="flex:1"><strong>' + esc(p.name) + '</strong><br><span class="xs muted">Seuil ' + p.threshold + ' · délai ' + esc(p.lead_time || '—') + '</span></span><span class="num" style="font-weight:800;color:' + (low ? 'var(--err)' : 'var(--ok)') + '">' + p.stock + '</span></div>';
        }).join('') + '</section>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Historique</h2>' +
        (past.length ? past.slice(0, 15).map(function (o) { return '<div class="list-row"><span style="flex:1"><strong>' + esc(o.number) + '</strong> · ' + o.qty + ' × ' + esc(o.product_name) + '<br><span class="xs muted">' + App.fdate(o.delivered_at || o.created_at) + '</span></span>' + App.supPill(o.status) + '</div>'; }).join('') : '<p class="muted small">Aucun historique.</p>') +
        '</section></aside></div></div>';
    });
  });
  App.routes.fournisseur.shell = 'staff';
  App.A.supConfirm = function (d) {
    App.modal('<h2 class="sec-t">Confirmer la commande</h2><form class="stack" style="gap:12px" data-form="supConfirm" data-id="' + d.id + '">' +
      '<div class="field"><label for="sd">Date de livraison à l’entrepôt</label><input id="sd" name="due" type="date" value="' + esc(d.due) + '" required></div>' +
      '<div class="field"><label for="sn">Message (facultatif)</label><input id="sn" name="note" maxlength="300" placeholder="Ex. livraison le matin"></div>' +
      '<button class="btn p" type="submit">Confirmer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.supConfirm = function (fd, form) { return App.post('/supplier/orders/' + form.getAttribute('data-id') + '/confirm', { due_date: fd.get('due'), note: fd.get('note') }).then(function () { App.modal(null); App.toast('Commande confirmée. BIOSAVEUR est prévenu.'); App.render(); }); };
  App.A.supRefuse = function (d) {
    App.modal('<h2 class="sec-t">Refuser la commande</h2><form class="stack" style="gap:12px" data-form="supRefuse" data-id="' + d.id + '"><div class="field"><label for="sr2">Raison</label><input id="sr2" name="note" required maxlength="300" placeholder="Ex. stock insuffisant cette semaine"></div><button class="btn p" type="submit">Envoyer</button><button class="linkbtn" type="button" data-act="closeM">Annuler</button></form>');
  };
  App.F.supRefuse = function (fd, form) { return App.post('/supplier/orders/' + form.getAttribute('data-id') + '/refuse', { note: fd.get('note') }).then(function () { App.modal(null); App.toast('Réponse envoyée.'); App.render(); }); };
  App.A.supDeliver = function (d, el) { el.disabled = true; App.post('/supplier/orders/' + d.id + '/deliver').then(function () { App.toast('Livraison enregistrée : le stock BIOSAVEUR est mis à jour.'); App.render(); }).catch(function (e) { el.disabled = false; App.err(e); }); };

  /* ---------- partenaire ---------- */
  function bars(months) {
    var max = 1; months.forEach(function (m) { max = Math.max(max, m.ventes); });
    return '<div style="display:flex;align-items:flex-end;gap:10px;height:140px;border-bottom:1px solid var(--ligne);padding-top:10px">' + months.map(function (m) {
      var h = Math.round(m.ventes / max * 120);
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end;height:100%"><span class="xs num muted">' + (m.ventes ? Math.round(m.ventes / 1000) + ' k' : '') + '</span><div title="' + fcfa(m.ventes) + '" style="width:100%;max-width:38px;height:' + Math.max(2, h) + 'px;background:var(--vf);border-radius:4px 4px 0 0"></div></div>';
    }).join('') + '</div><div style="display:flex;gap:10px">' + months.map(function (m) { return '<span class="xs muted" style="flex:1;text-align:center">' + App.MOIS[+m.month.slice(5, 7) - 1] + '</span>'; }).join('') + '</div>';
  }
  App.route('partenaire', function () {
    App.needStaff('partenaire');
    return App.get('/partner/overview').then(function (d) {
      var p = d.partner, pct = Math.round(p.commission_rate * 1000) / 10;
      var link = location.origin.indexOf('http') === 0 && !App.native ? location.origin + '/#/inscription?parrain=' + encodeURIComponent(p.referral_code) : (App.apiBase || '') + '/#/inscription?parrain=' + encodeURIComponent(p.referral_code);
      return head(p.company || p.name, 'Espace partenaire') +
        '<div class="kpis">' + kpi(d.clients, 'Clients apportés') + kpi('<span style="font-size:18px">' + fcfa(d.commission_mois) + '</span>', 'Commission ce mois') + kpi('<span style="font-size:18px">' + fcfa(d.earned) + '</span>', 'Commission totale') + kpi('<span style="font-size:18px">' + fcfa(d.balance) + '</span>', 'À vous verser') + '</div></div></div>' +
        '<div class="wrap stack" style="padding-block:16px 40px">' +
        '<section class="parr"><div class="between"><h2 style="font-size:18px">Votre code partenaire</h2><strong>' + pct + ' % de commission</strong></div>' +
        '<div class="row"><span class="cd">' + esc(p.referral_code) + '</span><button class="btn p sm" style="min-height:46px" data-act="copy" data-v="' + esc(p.referral_code) + '">Copier</button></div>' +
        '<span class="small">Vos clients saisissent ce code en créant leur compte, ou utilisent votre lien : <span style="user-select:all;word-break:break-all">' + esc(link) + '</span>. Vous touchez ' + pct + ' % de chacune de leurs commandes livrées (hors frais de livraison).</span>' +
        '<div><button class="btn p sm" data-act="copy" data-v="' + esc(link) + '">Copier le lien d’inscription</button></div></section>' +
        '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">' +
        '<section class="card pad stack" style="gap:8px"><h2 class="sec-t" style="font-size:17px">Ventes de vos clients · 6 mois</h2>' + bars(d.months) + '<span class="xs muted">Total des commandes livrées : ' + fcfa(d.ventes) + ' (' + d.commandes + ' commandes)</span></section>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Commissions versées</h2>' +
        (d.payouts.length ? d.payouts.map(function (x) { return '<div class="list-row"><span style="flex:1">' + App.fdate(x.created_at) + ' · ' + esc(x.method) + (x.note ? '<br><span class="xs muted">' + esc(x.note) + '</span>' : '') + '</span><strong class="num" style="color:var(--ok)">' + fcfa(x.amount) + '</strong></div>'; }).join('') : '<p class="muted small">Aucun versement pour le moment.</p>') +
        '<div class="sum tot" style="margin-top:8px"><span>Reste à verser</span><span class="num">' + fcfa(d.balance) + '</span></div></section></div>' +
        '<section class="card pad"><h2 class="sec-t" style="font-size:17px;margin-bottom:6px">Vos clients</h2><div class="tbl"><table style="min-width:520px"><thead><tr><th>Client</th><th>Commune</th><th>Inscrit le</th><th>Commandes livrées</th><th style="text-align:right">Ventes</th><th style="text-align:right">Votre commission</th></tr></thead><tbody>' +
        (d.clientsList.length ? d.clientsList.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.commune) + '</td><td>' + App.fdate(c.created_at) + '</td><td class="num">' + c.commandes + '</td><td class="num" style="text-align:right">' + fcfa(c.ventes) + '</td><td class="num" style="text-align:right;font-weight:700;color:var(--vf)">' + fcfa(Math.round(c.ventes * p.commission_rate)) + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="muted">Partagez votre code pour apporter vos premiers clients.</td></tr>') +
        '</tbody></table></div></section></div>';
    });
  });
  App.routes.partenaire.shell = 'staff';
})();
