const {ipcRenderer}=require('electron');

const STYLE_ID='schoology-shared-webview-theme-style';
const THEME_CHANNEL='shared-webview-theme-changed';
let dark=false;
try{dark=!!ipcRenderer.sendSync('get-shared-webview-theme')?.dark}catch(error){console.warn('Could not read initial shared-webview theme:',error?.message||error)}

const THEME_CSS=`
  html[data-schoology-shade-inversion="true"]{color-scheme:dark!important;background:#17191c!important}
  html[data-schoology-shade-inversion="true"] body{filter:invert(1) hue-rotate(180deg)!important}
  html[data-schoology-shade-inversion="true"] img,
  html[data-schoology-shade-inversion="true"] picture,
  html[data-schoology-shade-inversion="true"] video,
  html[data-schoology-shade-inversion="true"] canvas,
  html[data-schoology-shade-inversion="true"] svg,
  html[data-schoology-shade-inversion="true"] iframe,
  html[data-schoology-shade-inversion="true"] object,
  html[data-schoology-shade-inversion="true"] embed{filter:invert(1) hue-rotate(180deg)!important}
`;

function ensureStyles(){
  const root=document.documentElement;
  if(!root)return false;
  let style=document.getElementById(STYLE_ID);
  if(!style){style=document.createElement('style');style.id=STYLE_ID;style.textContent=THEME_CSS;}
  const target=document.head||root;
  if(style.parentNode!==target)target.appendChild(style);
  return true;
}
function rgb(color){
  const match=String(color||'').match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
  if(!match)return null;
  const alpha=match[4]===undefined?1:(String(match[4]).endsWith('%')?Number(match[4].slice(0,-1))/100:Number(match[4]));
  return {r:Number(match[1]),g:Number(match[2]),b:Number(match[3]),a:alpha};
}
function isLightPage(){
  try{
    const root=document.documentElement,body=document.body;
    const candidates=[document.querySelector('main'),document.querySelector('[role="main"]'),document.querySelector('#page'),document.querySelector('#container'),document.querySelector('#content'),body,root].filter(Boolean);
    const surfaces=candidates.map(el=>{
      const color=rgb(getComputedStyle(el).backgroundColor);
      if(!color||color.a<.08)return null;
      const rect=el.getBoundingClientRect(),luminance=.2126*color.r+.7152*color.g+.0722*color.b;
      const chroma=Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b);
      return {area:Math.max(0,rect.width)*Math.max(0,rect.height),luminance,chroma};
    }).filter(Boolean).sort((a,b)=>b.area-a.area);
    if(surfaces.length)return surfaces[0].luminance>=145&&surfaces[0].chroma<100;
    const textColor=rgb(getComputedStyle(body||root).color);
    return !textColor||(.2126*textColor.r+.7152*textColor.g+.0722*textColor.b)<145;
  }catch{return true}
}
function applyTheme(nextDark){
  dark=!!nextDark;
  const ready=ensureStyles();
  const root=document.documentElement;
  if(!ready||!root)return;
  if(!dark){root.removeAttribute('data-schoology-theme-pending');root.removeAttribute('data-schoology-shade-inversion');return}
  const invert=isLightPage();
  root.toggleAttribute('data-schoology-shade-inversion',invert);
  root.removeAttribute('data-schoology-theme-pending');
}
function scheduleInitialTheme(){
  // Do not install theme CSS while the page is still loading. This one-shot
  // callback reads the latest theme value after the document is fully loaded.
  if(document.readyState==='complete'){applyTheme(dark);return}
  window.addEventListener('load',()=>applyTheme(dark),{once:true});
}
scheduleInitialTheme();
ipcRenderer.on(THEME_CHANNEL,(_event,payload)=>{
  dark=!!payload?.dark;
  // Theme changes during navigation update state only; the load callback
  // applies the theme once the page has finished loading.
  if(document.readyState!=='complete')return;
  applyTheme(dark);
});
