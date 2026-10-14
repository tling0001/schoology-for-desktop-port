const {ipcRenderer}=require('electron');
(()=> {
  const STYLE_ID='__schoology_shared_webview_shade_inversion_css__';
  const ATTR='data-schoology-shade-inversion';
  const attr='html['+ATTR+'="true"]';
  const css=attr+'{filter:invert(1) hue-rotate(180deg)!important;background:#17191c!important}'+
    attr+' img,'+attr+' picture,'+attr+' video,'+attr+' canvas,'+attr+' svg,'+attr+' iframe,'+attr+' object,'+attr+' embed,'+attr+' [style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}'+
    attr+' input,'+attr+' textarea,'+attr+' select,'+attr+' [contenteditable="true"]{color-scheme:dark!important}';
  let darkEnabled=process.argv.some(arg=>arg==='--schoology-shared-webview-dark=1');
  let rootObserver=null,pageObserver=null,paintQueued=false;
  const ensureStyle=()=>{
    const root=document.documentElement;if(!root)return false;
    let style=document.getElementById(STYLE_ID);
    if(!style){style=document.createElement('style');style.id=STYLE_ID;style.textContent=css}
    const parent=document.head||root;
    if(style.parentNode!==parent)parent.appendChild(style);
    return true;
  };
  const pageIsLight=()=>{
    const nodes=[document.querySelector('main'),document.querySelector('[role="main"]'),document.querySelector('#content'),document.querySelector('#container'),document.body,document.documentElement].filter(Boolean);
    const surfaces=nodes.map(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el).backgroundColor,m=c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);if(!m||Number(m[4]??1)<.08)return null;return {area:Math.max(0,r.width)*Math.max(0,r.height),luminance:(.2126*Number(m[1])+.7152*Number(m[2])+.0722*Number(m[3]))}}).filter(Boolean).sort((a,b)=>b.area-a.area);
    return surfaces.length?surfaces[0].luminance>=145:true;
  };
  const apply=()=>{
    paintQueued=false;if(!ensureStyle())return;
    const root=document.documentElement;
    if(!darkEnabled){root.removeAttribute(ATTR);return}
    if(!document.body)return;
    root.toggleAttribute(ATTR,pageIsLight());
  };
  const scheduleApply=()=>{
    if(paintQueued)return;paintQueued=true;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(apply);else Promise.resolve().then(apply);
  };
  const observe=()=>{
    if(!ensureStyle())return false;
    if(!pageObserver){pageObserver=new MutationObserver(scheduleApply);pageObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','bgcolor','color']})}
    return true;
  };
  const initialize=()=>{
    if(!observe()){
      if(!rootObserver){rootObserver=new MutationObserver(()=>{if(observe())rootObserver.disconnect()});rootObserver.observe(document,{subtree:true,childList:true})}
      return;
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleApply,{once:true});
    else scheduleApply();
  };
  initialize();
  ipcRenderer.invoke('get-experimental-force-dark').then(enabled=>{
    darkEnabled=!!enabled;
    if(darkEnabled)initialize();
    else if(document.documentElement)document.documentElement.removeAttribute(ATTR);
  }).catch(()=>{if(darkEnabled)initialize()});
})();
