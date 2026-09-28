// Splash failsafe. This is an external script so it is allowed by the
// application's Content-Security-Policy (script-src 'self').
(function () {
  'use strict';

  var MIN_SPLASH_MS = 1500;
  var started = Date.now();
  var removed = false;

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
    window.setTimeout(removeSplash, Math.max(0, MIN_SPLASH_MS - elapsed));
  }

  // The timer is independent of renderer.js, preload, IPC, authentication,
  // and Electron ready-to-show. Nothing else can prevent splash dismissal.
  schedule();
})();
