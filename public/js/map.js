/* Cartes (Leaflet + OpenStreetMap) et itinéraires. */
(function () {
  'use strict';
  var App = window.App;
  var M = (App.map = {});
  var ABIDJAN = [5.345, -4.02];

  M.available = function () { return typeof window.L !== 'undefined'; };

  M.create = function (el, opts) {
    opts = opts || {};
    var map = L.map(el, { zoomControl: true, scrollWheelZoom: opts.scroll !== false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(opts.center || ABIDJAN, opts.zoom || 12);
    var t = App.cfg.map || {};
    L.tileLayer(t.tiles || 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd', attribution: t.attribution || '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    App.cleanups.push(function () { try { map.off(); map.remove(); } catch (e) { /* déjà retirée */ } });
    setTimeout(function () { if (map._container && map._container.isConnected) map.invalidateSize(); }, 50);
    return map;
  };

  var COLORS = { next: ['#eaf624', '#103d3a'], todo: ['#103d3a', '#eaf624'], done: ['#25b810', '#ffffff'], me: ['#eaf624', '#103d3a'] };
  M.pin = function (label, cls) {
    var c = COLORS[cls] || COLORS.todo;
    return L.divIcon({
      className: '',
      iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -34],
      html: '<div class="bsv-pin"><svg viewBox="0 0 30 38"><path d="M15 37C11 29 2 25 2 14.5A13 13 0 0 1 28 14.5C28 25 19 29 15 37Z" fill="' + c[0] + '" stroke="#103d3a" stroke-width="2"/></svg><span style="color:' + c[1] + '">' + App.esc(label) + '</span></div>'
    });
  };
  M.depotIcon = function () {
    return L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="bsv-depot">' + App.ic('store', 's') + '</div>' });
  };

  /* Sélecteur de position : clic sur la carte, repère déplaçable, bouton « ma position ». */
  M.picker = function (el, pos, onPick) {
    var has = pos && typeof pos.lat === 'number';
    var map = M.create(el, { center: has ? [pos.lat, pos.lng] : ABIDJAN, zoom: has ? 16 : 12 });
    var marker = null;
    function set(lat, lng, fly) {
      lat = Math.round(lat * 1e6) / 1e6; lng = Math.round(lng * 1e6) / 1e6;
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true, icon: M.pin('', 'me') }).addTo(map);
        marker.on('dragend', function () { var p = marker.getLatLng(); set(p.lat, p.lng); });
      } else marker.setLatLng([lat, lng]);
      if (fly) map.setView([lat, lng], 17, { animate: false });
      onPick(lat, lng);
    }
    if (has) set(pos.lat, pos.lng);
    map.on('click', function (e) { set(e.latlng.lat, e.latlng.lng); });
    return {
      map: map,
      locate: function () {
        if (!navigator.geolocation) { App.toast('La localisation n’est pas disponible sur cet appareil.'); return; }
        App.toast('Recherche de votre position…');
        navigator.geolocation.getCurrentPosition(function (p) { set(p.coords.latitude, p.coords.longitude, true); App.toast('Position trouvée. Ajustez le repère si besoin.'); },
          function () { App.toast('Position introuvable. Autorisez la localisation ou touchez la carte.'); },
          { enableHighAccuracy: true, timeout: 15000 });
      }
    };
  };

  /* --- distances et itinéraires --- */
  M.hasPos = function (p) { return p && typeof p.lat === 'number' && typeof p.lng === 'number'; };
  M.km = function (a, b) {
    var R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    var h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) * Math.sin(dg / 2);
    return 2 * R * Math.asin(Math.sqrt(h)) * 1.35; // facteur route
  };
  M.fkm = function (d) { return (d < 10 ? d.toFixed(1) : Math.round(d)).toString().replace('.', ',') + ' km'; };
  M.fmin = function (d) { return Math.max(3, Math.round(d / 22 * 60)) + ' min'; };
  M.gDir = function (p) { return 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '&travelmode=driving'; };
  M.waze = function (p) { return 'https://waze.com/ul?ll=' + p.lat + ',' + p.lng + '&navigate=yes'; };
  M.tourUrl = function (origin, stops) {
    if (!stops.length) return '';
    var last = stops[stops.length - 1], mid = stops.slice(0, -1).slice(0, 9); // Google limite à 9 étapes
    return 'https://www.google.com/maps/dir/?api=1&origin=' + origin.lat + ',' + origin.lng + '&destination=' + last.lat + ',' + last.lng +
      (mid.length ? '&waypoints=' + mid.map(function (p) { return p.lat + ',' + p.lng; }).join('%7C') : '') + '&travelmode=driving';
  };
  /* ordre de passage : par créneau, puis plus proche voisin */
  M.routeOrder = function (orders, slots, start) {
    var groups = {};
    orders.forEach(function (o) { (groups[o.slot] = groups[o.slot] || []).push(o); });
    var res = [], prev = start;
    slots.forEach(function (s) {
      var g = (groups[s] || []).slice();
      while (g.length) {
        var bi = 0, bd = 1e9;
        g.forEach(function (o, i) { var d = M.hasPos(o) ? M.km(prev, o) : 999; if (d < bd) { bd = d; bi = i; } });
        var o = g.splice(bi, 1)[0];
        res.push({ o: o, leg: M.hasPos(o) ? M.km(prev, o) : null });
        if (M.hasPos(o)) prev = o;
      }
    });
    return res;
  };
})();
