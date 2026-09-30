// The real startup splash is hosted by app.html so it remains visible until
// the renderer has completed its initial authenticated load. This page only
// bridges into app.html; app.html enforces the minimum one-second display.
setTimeout(function(){ window.location.replace('app.html'); }, 100);
