// Splash failsafe. This is an external script so it is allowed by the
// application's Content-Security-Policy (script-src 'self').
(function () {
  'use strict';

  var MIN_SPLASH_MS = 1500;
  var started = Date.now();
  var removed = false;

  function fallbackUI() {
    var app = document.getElementById('app');
    if (!app || app.children.length) return;
    app.innerHTML = '<div class="login"><img class="logo" src="../assets/logo_schoology.png"><div class="loginBody"><button id="bootSchoolLogin" class="primary">Log in through your School</button><button id="bootContinue" class="secondary">Log in using schoology.com</button><button id="bootQr" class="qrButton">Sign in with a QR code</button></div><div class="loginBottom">I need help signing in</div></div>';
    var bridge = window.schoology;
    var school = document.getElementById('bootSchoolLogin');
    var cont = document.getElementById('bootContinue');
    var qr = document.getElementById('bootQr');
    if (school) school.onclick=function(){ location.reload(); };
    if (cont) cont.onclick=function(){ location.reload(); };
    if (qr) qr.onclick=function(){ location.reload(); };
  }

  function removeSplash() {
    if (removed) return;
    removed = true;
    var splash = document.getElementById('bootSplash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.pointerEvents = 'none';
      window.setTimeout(function () {
        if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
      }, 120);
    }
  }

  function schedule() {
    var elapsed = Date.now() - started;
    window.setTimeout(function(){ removeSplash(); window.setTimeout(fallbackUI, 50); }, Math.max(0, MIN_SPLASH_MS - elapsed));
  }

  // The timer is independent of renderer.js, preload, IPC, authentication,
  // and Electron ready-to-show. Nothing else can prevent splash dismissal.
  schedule();
})();
