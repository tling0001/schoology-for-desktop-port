// Android-style startup splash. The renderer is loaded on a separate page so
// renderer initialization can never leave the splash overlay stuck on screen.
setTimeout(function(){
  window.location.replace('app.html');
}, 1200);
