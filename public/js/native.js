/* Intégration des applis Android / iOS (Capacitor). Sans effet sur le site web. */
(function () {
  'use strict';
  var App = window.App;
  var Cap = window.Capacitor;
  var plugins = (Cap && Cap.Plugins) || {};

  // Paiement en ligne : sur le web on quitte la page vers le guichet ;
  // dans l'appli on ouvre le guichet dans le navigateur et on suit l'état ici.
  App.openPayment = function (url, tx) {
    var sim = url.indexOf('#/paiement-simule/');
    if (sim >= 0) { App.go(url.slice(sim)); return; }
    if (App.native && plugins.Browser) {
      plugins.Browser.open({ url: url, presentationStyle: 'fullscreen', toolbarColor: '#103d3a' });
      if (tx) App.go('#/paiement/' + encodeURIComponent(tx));
      return;
    }
    location.href = url;
  };

  if (!App.native || !Cap) return;
  document.documentElement.classList.add('native', 'native-' + Cap.getPlatform());

  // Liens externes (Google Maps, Waze, CinetPay…) : application dédiée ou navigateur du téléphone.
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="http"]');
    if (!a) return;
    ev.preventDefault();
    var url = a.href;
    var launcher = plugins.AppLauncher;
    var fallback = function () { if (plugins.Browser) plugins.Browser.open({ url: url }); };
    if (launcher && /google\.com\/maps|waze\.com/.test(url)) launcher.openUrl({ url: url }).catch(fallback);
    else fallback();
  }, true);

  if (plugins.App) {
    // Retour dans l'appli (après le paiement, après la navigation GPS) : rafraîchir l'écran.
    plugins.App.addListener('resume', function () {
      var n = App.parse().name;
      if (['paiement', 'livreur', 'commande', 'cotisation', 'compte'].indexOf(n) >= 0) App.render();
      App.refreshBadges();
    });
    // Bouton retour Android
    plugins.App.addListener('backButton', function () {
      if (document.querySelector('.ov')) { App.modal(null); return; }
      var n = App.parse().name;
      if (!n || n === 'livreur' || (n === 'admin' && !App.parse().args.length)) plugins.App.exitApp();
      else history.back();
    });
  }
  if (plugins.Browser) plugins.Browser.addListener('browserFinished', function () { if (App.parse().name === 'paiement') App.render(); });

  if (plugins.StatusBar) {
    plugins.StatusBar.setStyle({ style: 'DARK' }).catch(function () {});
    if (Cap.getPlatform() === 'android') plugins.StatusBar.setBackgroundColor({ color: '#103d3a' }).catch(function () {});
  }
  var start = App.start;
  App.start = function () {
    start();
    if (plugins.SplashScreen) setTimeout(function () { plugins.SplashScreen.hide(); }, 300);
  };
})();
