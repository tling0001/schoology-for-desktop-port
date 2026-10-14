(function(){
  const app=document.getElementById('app');
  const splash=document.getElementById('startupSplash');
  document.body.classList.add('splashVisible');
  let appReady=false;
  function hideSplash(){
    if(appReady)return;
    appReady=true;
    if(splash){splash.classList.add('hidden'); requestAnimationFrame(()=>{splash.remove(); document.body.classList.remove('splashVisible'); void document.body.offsetWidth;});}
  }
  window.schoologyAppReady=hideSplash;
  function showError(title,detail){
    hideSplash();
    if(window.schoologyShowError && document.querySelector('.shell')){ try{window.schoologyShowError(new Error(detail));return;}catch{} }
    if(!app)return;
    app.innerHTML='<div class="fatal"><h2>'+title+'</h2><p>'+detail+'</p><p style="font-size:12px;word-break:break-word">If this persists, the application renderer or Electron preload bridge failed to initialize.</p></div>';
  }
  window.addEventListener('error',function(e){
    const msg=e&&e.error&&e.error.stack ? e.error.stack : (e&&e.message||'Unknown renderer error');
    console.error('Schoology renderer error:',msg);
    showError('Schoology could not start',msg);
  });
  window.addEventListener('unhandledrejection',function(e){
    const reason=e&&e.reason;
    const msg=reason&&reason.stack ? reason.stack : String(reason||'Unknown promise error');
    console.error('Schoology renderer promise error:',msg);
    showError('Schoology could not start',msg);
  });
  // Electron normally exposes the preload bridge before page scripts run. Give
  // startup a short grace period before showing a fatal error, rather than treating
  // a transient initialization delay as a permanently missing bridge.
  let bridgeAttempts=0;
  function loadRendererWhenReady(){
    if(!window.schoology){
      if(++bridgeAttempts<20){setTimeout(loadRendererWhenReady,50);return;}
      showError('Schoology could not start','The Electron authentication bridge is unavailable.');
      return;
    }
    const s=document.createElement('script');
    s.src='renderer.js';
    s.onload=function(){console.log('Schoology renderer loaded.');};
    s.onerror=function(){showError('Schoology could not start','renderer.js could not be loaded.');};
    document.body.appendChild(s);
  }
  loadRendererWhenReady();
})();
