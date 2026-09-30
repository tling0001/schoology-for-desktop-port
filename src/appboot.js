(function(){
  const app=document.getElementById('app');
  function showError(title,detail){
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
  if(!window.schoology){
    showError('Schoology could not start','The Electron authentication bridge is unavailable.');
    return;
  }
  const s=document.createElement('script');
  s.src='renderer.js';
  s.onload=function(){console.log('Schoology renderer loaded.');};
  s.onerror=function(){showError('Schoology could not start','renderer.js could not be loaded.');};
  document.body.appendChild(s);
})();
