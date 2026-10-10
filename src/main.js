const {app,BrowserWindow,session,ipcMain,shell,dialog,nativeTheme,Notification}=require('electron');
const path=require('path');
const crypto=require('crypto');
const fs=require('fs');
const https=require('https');
const querystring=require('querystring');

// Match the Android app's public identity/version as closely as Electron allows.
const ANDROID_WEBVIEW_UA='Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 Schoology Android v2026.06.0';
const CLIENT_UA=ANDROID_WEBVIEW_UA;
const API_HOST='api.schoology.com';
const WEB_HOST='app.schoology.com';
const CONSUMER_KEY='998121f221d5dc0f4956ee6946d27d5e04e55635e';
const CONSUMER_SECRET='5cff9d3780d64695d762ba8e05a34e9e';
const ANDROID_OKHTTP_UA='okhttp/4.8.0';
const MOBILE_COOKIE='s_mobile=03447c0175ac0c7299a5508fde9569fc';
// Keep OAuth credentials in a stable per-user location across portable/unpacked/installer builds.
// Migrate the older Electron default location once so existing logins are not lost.
const legacyUserData=app.getPath('userData');
const stableUserData=path.join(app.getPath('appData'),'Schoology');
try{app.setPath('userData',stableUserData)}catch{}
const storeFile=path.join(stableUserData,'auth.json');
const legacyStoreFile=path.join(legacyUserData,'auth.json');
let win;
const attachedGuestWebContents=new Set();
function styleAttachedGuest(guest){
  if(!guest||guest.isDestroyed?.())return;
  const dark=isDarkAppearance();
  try{guest.setBackgroundColor?.(dark?'#17191c':'#ffffff')}catch{}
  try{guest.insertCSS(`:root{color-scheme:${dark?'dark':'light'}!important;scrollbar-width:thin!important;scrollbar-color:${dark?'#3a3f46 transparent':'#9aa0a6 transparent'}!important}*::-webkit-scrollbar{width:8px!important;height:8px!important}*::-webkit-scrollbar-track{background:transparent!important}*::-webkit-scrollbar-thumb{background:${dark?'#3a3f46':'#9aa0a6'}!important;border:2px solid transparent!important;border-radius:999px!important;background-clip:padding-box!important}`).catch(()=>{})}catch{}
}
let pendingSchoologyDeepLink=null;
let pendingExternalSchoolLogin=null;
const hasSingleInstanceLock=app.requestSingleInstanceLock();
if(!hasSingleInstanceLock)app.quit();
function extractSchoologyDeepLink(argv){return (argv||[]).find(value=>typeof value==='string'&&/^schoology:\/\//i.test(value))||null}
pendingSchoologyDeepLink=extractSchoologyDeepLink(process.argv);
function deliverSchoologyDeepLink(url){
  if(!url||!/^schoology:\/\//i.test(url))return;
  try{
    const parsed=new URL(url);
    if(parsed.hostname.toLowerCase()==='external_login_callback'&&pendingExternalSchoolLogin){
      const expected=pendingExternalSchoolLogin.requestToken;
      const received=parsed.searchParams.get('request_token')||parsed.searchParams.get('oauth_token')||'';
      if(received&&received===expected){const pending=pendingExternalSchoolLogin;if(pending.processing)return;pending.processing=true;exchangeToken(pending.credential).then(auth=>pending.finish(null,auth)).catch(error=>pending.finish(error));return;}
      console.warn('Ignored Schoology external-login callback with an unexpected request token.');return;
    }
  }catch{}
  if(!win||win.isDestroyed()||win.webContents.isLoading()){pendingSchoologyDeepLink=url;return}
  try{win.webContents.send('schoology-deep-link',url)}catch{pendingSchoologyDeepLink=url}
}
app.on('second-instance',(_event,argv)=>{const url=extractSchoologyDeepLink(argv);if(url)deliverSchoologyDeepLink(url);if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.focus()}});
app.on('open-url',(event,url)=>{event.preventDefault();deliverSchoologyDeepLink(url)});
let updateProgressWindow;
let serverTimeOffset=0;
const windowChromeSettingsFile=path.join(stableUserData,'window-chrome.json');
const themeSettingsFile=path.join(stableUserData,'theme-settings.json');
const appSettingsFile=path.join(stableUserData,'app-settings.json');
const notificationSeenFile=path.join(stableUserData,'notification-seen.json');
function readAppSettings(){try{const value=JSON.parse(fs.readFileSync(appSettingsFile,'utf8'))||{};return {openSchoologyLinks:value.openSchoologyLinks!==false,desktopNotifications:value.desktopNotifications!==false,notificationSound:value.notificationSound===true}}catch{return {openSchoologyLinks:true,desktopNotifications:true,notificationSound:false}}}
function saveAppSettings(patch){const settings={...readAppSettings(),...(patch||{})};fs.mkdirSync(path.dirname(appSettingsFile),{recursive:true});fs.writeFileSync(appSettingsFile,JSON.stringify(settings,null,2),'utf8');return settings}
function saveOpenSchoologyLinks(enabled){return saveAppSettings({openSchoologyLinks:!!enabled}).openSchoologyLinks}
function saveDesktopNotifications(enabled){return saveAppSettings({desktopNotifications:!!enabled}).desktopNotifications}
function saveNotificationSound(enabled){return saveAppSettings({notificationSound:!!enabled}).notificationSound}
function defaultExperimentalForceDark(mode='system'){return isDarkAppearance(mode)}
function readThemeSettings(){try{const v=JSON.parse(fs.readFileSync(themeSettingsFile,'utf8'))||{};const mode=['light','dark','system'].includes(v.mode)?v.mode:'system';return {mode,experimentalForceDark:v.experimentalForceDarkConfigured===true&&typeof v.experimentalForceDark==='boolean'?v.experimentalForceDark:defaultExperimentalForceDark(mode)}}catch{return {mode:'system',experimentalForceDark:defaultExperimentalForceDark('system')}}}
function readThemeMode(){return readThemeSettings().mode}
function isDarkAppearance(mode=readThemeMode()){return mode==='dark'||(mode==='system'&&require('electron').nativeTheme?.shouldUseDarkColors===true)}
function isExperimentalForceDarkActive(mode=readThemeMode(),enabled=readThemeSettings().experimentalForceDark){return !!enabled&&isDarkAppearance(mode)}
function saveThemeMode(mode){const safe=['light','dark','system'].includes(mode)?mode:'system';const settings=readThemeSettings();fs.mkdirSync(path.dirname(themeSettingsFile),{recursive:true});fs.writeFileSync(themeSettingsFile,JSON.stringify({...settings,mode:safe},null,2),'utf8');return safe}
function saveExperimentalForceDark(enabled){const settings=readThemeSettings();settings.experimentalForceDark=!!enabled;settings.experimentalForceDarkConfigured=true;fs.mkdirSync(path.dirname(themeSettingsFile),{recursive:true});fs.writeFileSync(themeSettingsFile,JSON.stringify(settings,null,2),'utf8');return settings.experimentalForceDark}
function resolveThemeColors(mode=readThemeMode()){const dark=isDarkAppearance(mode);return dark?{background:'#17191c',foreground:'#e6e8eb',muted:'#a9afb7',track:'#34383e',accent:'#7ab7ff'}:{background:'#ffffff',foreground:'#202124',muted:'#5f6368',track:'#e5e7eb',accent:'#2e66a3'}}
function getWindowsInstallContext(){const installDir=path.dirname(path.resolve(app.getPath('exe')));const programFiles=[process.env.ProgramFiles||'C:\\Program Files',process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)'];const normalized=value=>path.resolve(value).replace(/[\\/]+$/,'').toLowerCase();const allUsers=programFiles.some(root=>normalized(installDir)===normalized(path.join(root,'Schoology')));return {installDir,installMode:allUsers?'all-users':'per-user'};}
// Keep Chromium's native color scheme in sync with Schoology's saved appearance.
// The renderer data-theme attribute does not affect nativeTheme or isolated webviews.
try{nativeTheme.themeSource=readThemeMode()}catch(e){console.error('Could not set native theme source:',e.message)}
// This Chromium feature must be enabled before app.whenReady() creates renderers.
const forceDarkAtLaunch=isExperimentalForceDarkActive();
let lastForceDarkActive=forceDarkAtLaunch;
nativeTheme.on('updated',()=>{
  for(const guest of attachedGuestWebContents)styleAttachedGuest(guest);
  const next=isExperimentalForceDarkActive();
  if(readThemeSettings().experimentalForceDark&&next!==lastForceDarkActive){lastForceDarkActive=next;try{app.relaunch();app.exit(0)}catch(e){console.error('Could not refresh embedded dark mode:',e.message)}}
});
try{
  const enabledFeatures=['OverlayScrollbar','OverlayScrollbarFlashAfterAnyScrollUpdate','OverlayScrollbarFlashWhenMouseEnter'];
  if(forceDarkAtLaunch)enabledFeatures.unshift('WebContentsForceDark');
  // Chromium's enable-features switch takes a comma-separated list. Supplying
  // this switch twice makes the effective value ambiguous/last-one-wins.
  app.commandLine.appendSwitch('overlay-scrollbars');
  app.commandLine.appendSwitch('enable-features',enabledFeatures.join(','));
  if(forceDarkAtLaunch)app.commandLine.appendSwitch('force-dark-mode');
}catch(e){console.error('Could not enable Chromium features:',e.message)}
function windowChromeOverlayEnabled(){
  if(process.platform==='darwin'){try{const v=JSON.parse(fs.readFileSync(windowChromeSettingsFile,'utf8'));return v?.overlay===true}catch{};return false}
  try{const v=JSON.parse(fs.readFileSync(windowChromeSettingsFile,'utf8'));return v?.overlay===true}catch{return false}
}
function saveWindowChromeOverlay(enabled){fs.mkdirSync(path.dirname(windowChromeSettingsFile),{recursive:true});fs.writeFileSync(windowChromeSettingsFile,JSON.stringify({overlay:!!enabled},null,2),'utf8')}


function loadAuth(){
  for(const f of [storeFile,legacyStoreFile]){
    try{
      const v=JSON.parse(fs.readFileSync(f,'utf8'));
      if(v?.oauth_token&&v?.oauth_token_secret){
        if(f!==storeFile){try{saveAuth(v)}catch{}}
        return v;
      }
    }catch{}
  }
  return null;
}
function saveAuth(v){
  fs.mkdirSync(path.dirname(storeFile),{recursive:true});
  const tmp=storeFile+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(v,null,2),'utf8');
  fs.renameSync(tmp,storeFile);
}
function enc(v){return encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g,'+')}
function parseBody(s){return Object.fromEntries(String(s||'').split('&').filter(Boolean).map(x=>{const i=x.indexOf('=');const k=i<0?x:x.slice(0,i);const v=i<0?'':x.slice(i+1);return [decodeURIComponent(k.replace(/\+/g,' ')),decodeURIComponent(v.replace(/\+/g,' '))]}))}
function oauthTimestamp(){return Math.floor(Date.now()/1000)+serverTimeOffset}
function sortedOAuthBaseParams(method,url,oauth,extra=[]){
  const u=new URL(url);
  const pairs=[];
  for(const [k,v] of new URLSearchParams(u.search)) pairs.push([k,v]);
  for(const [k,v] of Object.entries(oauth)) pairs.push([k,String(v)]);
  for(const [k,v] of extra) pairs.push([k,String(v)]);
  pairs.sort((a,b)=>{if(a[0]!==b[0])return a[0]<b[0]?-1:1;if(a[1]!==b[1])return a[1]<b[1]?-1:1;return 0});
  return pairs.map(([k,v])=>k+'='+v).join('&');
}
function makePlaintextOAuthHeader(authToken,authSecret){
  // Android OAuthRequestSigner.generatePlainTextAuthorizationHeader() does not
  // RFC3986-encode the whole secret. It places the literal %26 separator in the
  // OAuth header, while the request is otherwise signed exactly as Android does.
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:(()=>{let n=crypto.randomBytes(8).readBigInt64BE();if(n<0n)n=-n;return n.toString(16)})(),oauth_signature_method:'PLAINTEXT',oauth_timestamp:String(oauthTimestamp()),oauth_token:authToken==null?'':String(authToken)};
  return 'OAuth '+['oauth_consumer_key','oauth_nonce','oauth_signature_method','oauth_timestamp','oauth_token'].map(k=>k+'=\"'+String(oauth[k])+'\"').join(', ')+', oauth_signature=\"'+String(CONSUMER_SECRET)+'%26'+String(authSecret||'')+'\"';
}
function makeOAuthHeader(method,url,authToken,authSecret,qrData=''){
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:crypto.randomBytes(8).readBigUInt64BE(0).toString(16),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(oauthTimestamp()),oauth_version:'1.0'};
  // Android OAuthRequestSigner always includes oauth_token; for the initial
  // request-token request its value is explicitly the empty string.
  oauth.oauth_token=authToken==null?'':String(authToken);
  const extra=[];
  if(qrData) extra.push(['scanned_qr_data',qrData]);
  const normalized=sortedOAuthBaseParams(method,url,oauth,extra);
  const u=new URL(url);
  const base=method.toUpperCase()+'&'+enc(u.protocol+'//'+u.host+u.pathname)+'&'+enc(normalized);
  const key=enc(CONSUMER_SECRET)+'&'+enc(authSecret||'');
  oauth.oauth_signature=crypto.createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth '+['oauth_consumer_key','oauth_token','oauth_nonce','oauth_timestamp','oauth_signature_method','oauth_version'].map(k=>k+'="'+String(oauth[k])+'"').join(', ')+', oauth_signature="'+enc(oauth.oauth_signature)+'"';
}
function makeLegacyOAuthHeader(method,url,authToken,authSecret){
  // Android's legacy SchoologyOauthParameters first RFC3986-escapes each
  // parameter key/value, sorts those escaped pairs by key, then escapes the
  // complete normalized parameter string again when building the signature.
  const encRfc=v=>encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  const u=new URL(url);
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:crypto.randomBytes(8).readBigUInt64BE(0).toString(16),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(oauthTimestamp()),oauth_token:authToken==null?'':String(authToken),oauth_version:'1.0'};
  const pairs=[];
  for(const [k,v] of new URLSearchParams(u.search))pairs.push([encRfc(k),encRfc(v)]);
  for(const [k,v] of Object.entries(oauth))pairs.push([encRfc(k),encRfc(v)]);
  pairs.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  const normalized=pairs.map(([k,v])=>k+'='+v).join('&');
  const base=method.toUpperCase()+'&'+encRfc(u.protocol+'//'+u.host+u.pathname)+'&'+encRfc(normalized);
  const key=encRfc(CONSUMER_SECRET)+'&'+encRfc(authSecret||'');
  const signature=crypto.createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth '+['oauth_consumer_key','oauth_nonce','oauth_signature_method','oauth_timestamp','oauth_token','oauth_version'].map(k=>k+'=\"'+String(oauth[k])+'\"').join(', ')+', oauth_signature=\"'+encRfc(signature)+'\"';
}
function request(method,url,body={},opts={},redirectDepth=0){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const isGet=method.toUpperCase()==='GET';
    if(isGet){for(const [k,v] of Object.entries(body||{}))u.searchParams.set(k,String(v))}
    const data=!isGet && opts.json?JSON.stringify(body||{}):(!isGet?querystring.stringify(body||{}):'');
    const headers={
      'User-Agent':ANDROID_OKHTTP_UA,
      'Accept':'application/json'
    };
    if(opts.clientIdentity){
      headers['X-Schoology-Client']='Android';
      headers['X-Schoology-App-Version']='2026.06.0';
    }
    if(opts.headers) Object.assign(headers,opts.headers);
    if(opts.sign){
      headers.Authorization=opts.legacyOAuth?makeLegacyOAuthHeader(method,u.toString(),opts.authToken||'',opts.tokenSecret||''):makeOAuthHeader(method,u.toString(),opts.authToken||'',opts.tokenSecret||'',opts.qr||'');
      headers.Cookie=MOBILE_COOKIE;
    }
    if(!isGet){headers['Content-Type']=opts.json?'application/json':'application/x-www-form-urlencoded';headers['Content-Length']=Buffer.byteLength(data)}
    const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method,headers},r=>{
      let out='';r.setEncoding('utf8');r.on('data',c=>out+=c);r.on('end',()=>{
        const code=r.statusCode||0;
        const location=r.headers.location;
        // Android uses OkHttp, which follows HTTP redirects. Electron's Node
        // https client does not, so reproduce that behavior here. Re-sign the
        // redirected request because Android's OAuth interceptor sees each
        // redirected request as a new request.
        if(location && [301,302,303,307,308].includes(code) && redirectDepth<6){
          let next;
          try{next=new URL(location,u).toString()}catch(e){return reject(e)}
          let nextMethod=method;
          let nextBody=body;
          if(code===303 || ((code===301||code===302)&&method.toUpperCase()!=='GET'&&method.toUpperCase()!=='HEAD')){
            nextMethod='GET'; nextBody={};
          }
          request(nextMethod,next,nextBody,opts,redirectDepth+1).then(resolve,reject);
          return;
        }
        resolve({status:code,headers:r.headers,text:out})
      })
    });
    const timeoutMs=Number(opts.timeoutMs)||20000;
    req.setTimeout(timeoutMs,()=>req.destroy(new Error(timeoutMs>=30000?'Schoology login request timed out.':'Schoology request timed out')));
    req.on('error',reject);if(data)req.write(data);req.end();
  })
}
async function syncServerTime(){
  const r=await request('GET',`https://${WEB_HOST}/oauth/timestamp`);
  if(r.status>=200&&r.status<300){const t=parseInt(r.text.trim(),10);if(Number.isFinite(t))serverTimeOffset=t-Math.floor(Date.now()/1000)}
}
async function getRequestToken(){
  const r=await request('GET',`https://${API_HOST}/v1/oauth/request_token`,{}, {sign:true});
  if(r.status<200||r.status>=300)throw new Error('Request token failed: '+r.status+' '+r.text+' [Android OAuth GET /v1/oauth/request_token]');
  return parseBody(r.text);
}
async function authorizeCredentials(user,password,schoolId){
  await syncServerTime().catch(()=>{});
  const t=await getRequestToken();
  const body={password,user,oauth_token:t.oauth_token};
  if(schoolId!=null&&schoolId!=='')body.school_id=String(schoolId);
  // Android EmailAuthorizer/UsernameAuthorizer sends the form without an OAuth
  // Authorization header to /oauth/authorize_auto.
  const r=await request('POST',`https://${WEB_HOST}/oauth/authorize_auto`,body,{clientIdentity:true});
  if(r.status<200||r.status>=300)throw new Error('Schoology rejected login: '+r.status+' '+r.text);
  return exchangeToken(t);
}
async function authorizeQR(qr){
  await syncServerTime().catch(()=>{});
  const t=await getRequestToken();
  const body={scanned_qr_data:qr,oauth_token:t.oauth_token};
  // Android QRCodeAuthorizer signs this endpoint with the request-token secret
  // and includes scanned_qr_data in the HMAC normalized parameter set.
  const r=await request('POST',`https://${WEB_HOST}/oauth/qr_code_authorize_auto`,body,{sign:true,clientIdentity:true,authToken:t.oauth_token,tokenSecret:t.oauth_token_secret,qr,timeoutMs:30000});
  if(r.status<200||r.status>=300)throw new Error('QR authorization failed: '+r.status+' '+r.text);
  return exchangeToken(t);
}
async function exchangeToken(t){
  const r=await request('GET',`https://${API_HOST}/v1/oauth/access_token`,{}, {sign:true,clientIdentity:true,authToken:t.oauth_token,tokenSecret:t.oauth_token_secret});
  if(r.status<200||r.status>=300)throw new Error('Access token failed: '+r.status+' '+r.text);
  const x=parseBody(r.text);if(!x.oauth_token||!x.oauth_token_secret)throw new Error('Schoology returned an invalid access token.');
  // Android's AbstractLoginFlow resolves the current user as a required
  // part of authentication before it considers login successful. Never persist
  // a token that cannot be tied to a valid Schoology user.
  const userResp=await request('GET',`https://${API_HOST}/v1/users/me`,{}, {sign:true,clientIdentity:true,authToken:x.oauth_token,tokenSecret:x.oauth_token_secret});
  if(userResp.status<200||userResp.status>=300)throw new Error('Schoology signed in but could not load your user profile (HTTP '+userResp.status+'). Please try again.');
  let user;
  try{user=JSON.parse(userResp.text)}catch{throw new Error('Schoology returned an invalid user profile. Please try signing in again.')}
  const userId=Number(user?.id);
  if(!Number.isSafeInteger(userId)||userId<=0)throw new Error('Schoology did not return a valid user profile. Please try signing in again.');
  const auth={oauth_token:x.oauth_token,oauth_token_secret:x.oauth_token_secret,createdAt:Date.now(),userId,user};
  saveAuth(auth);return auth;
}
async function fetchSchoologyImage(imageUrl){
  const a=loadAuth(); if(!a) return null;
  let u;
  try{u=new URL(imageUrl,'https://app.schoology.com')}catch{return null}
  const cookies=await session.defaultSession.cookies.get({url:u.toString()}).catch(()=>[]);
  const cookieHeader=cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'GET',headers:{
      'User-Agent':ANDROID_WEBVIEW_UA,'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      ...(cookieHeader?{Cookie:cookieHeader}:{}),Referer:'https://app.schoology.com/'
    }},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
        const code=res.statusCode||0;
        if(code<200||code>=300){resolve(null);return}
        const type=String(res.headers['content-type']||'image/png').split(';')[0];
        resolve(`data:${type};base64,${Buffer.concat(chunks).toString('base64')}`);
      });
    });
    req.on('error',reject);req.setTimeout(15000,()=>req.destroy());req.end();
  });
}
async function prepareWebSession(){
  const a=loadAuth();
  if(!a) throw new Error('Not signed in');
  // Android SchoologyCookieProvider starts a legacy session for the web
  // domain and installs every returned cookie plus the fixed s_mobile cookie
  // before HybridWebSession loads Course Dashboard.
  const r=await request('GET',`https://${API_HOST}/v1/sessionstart`,{for_domain:'app.schoology.com'},{sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret});
  if(r.status<200||r.status>=300)throw new Error('Schoology web session failed: '+r.status+' '+r.text);
  let j={};try{j=JSON.parse(r.text)}catch{}
  const cookies=Array.isArray(j.cookie)?j.cookie:Array.isArray(j.cookies)?j.cookies:[];
  for(const c of cookies){
    if(c?.key&&c?.value){
      try{await session.defaultSession.cookies.set({url:'https://app.schoology.com',name:String(c.key),value:String(c.value),domain:c.domain||undefined,path:c.path||'/',secure:true})}catch(e){console.error('Unable to install Schoology web cookie',e)}
    }
  }
  try{await session.defaultSession.cookies.set({url:'https://app.schoology.com',name:'s_mobile',value:'03447c0175ac0c7299a5508fde9569fc',path:'/',secure:true})}catch{}
  return true;
}

async function downloadAuthenticatedFile(info, sender){
  const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.url)throw new Error('File URL is missing.');
  let raw=String(info.url);
  let u;
  try{u=new URL(raw,`https://${API_HOST}`)}catch{throw new Error('Schoology returned an invalid file URL.')}
  const base=path.basename(u.pathname)||'Schoology-file';
  const requested=String(info.filename||base).replace(/[\\/:*?"<>|]+/g,'_').trim()||base;
  const safeName=requested.slice(0,180);
  const ext=path.extname(safeName);
  const finalName=ext?safeName:safeName;
  const tmpDir=path.join(app.getPath('temp'),'Schoology');
  fs.mkdirSync(tmpDir,{recursive:true});
  const target=path.join(tmpDir,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${finalName}`);
  let downloadedPath=null;
  await new Promise((resolve,reject)=>{
    const doGet=async(url,depth=0)=>{
      if(depth>6)return reject(new Error('Too many redirects while downloading the Schoology file.'));
      const uu=new URL(url);
      const headers={'User-Agent':ANDROID_OKHTTP_UA,'Accept':'*/*'};
      // Match Android RestAdapterFactory/OAuthRequestSigner: only requests to
      // the configured API host receive the OAuth Authorization header.
      if(uu.hostname===API_HOST) headers.Authorization=makeOAuthHeader('GET',uu.toString(),a.oauth_token,a.oauth_token_secret);
      try{const cookies=await session.defaultSession.cookies.get({url:uu.origin});if(cookies.length)headers.Cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');else headers.Cookie=MOBILE_COOKIE}catch{headers.Cookie=MOBILE_COOKIE}
      const req=https.request({hostname:uu.hostname,path:uu.pathname+uu.search,method:'GET',headers},res=>{
        const code=res.statusCode||0;
        if([301,302,303,307,308].includes(code)&&res.headers.location){
          res.resume();
          return doGet(new URL(res.headers.location,uu).toString(),depth+1);
        }
        if(code<200||code>=300){
          const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>reject(new Error(`Schoology file download failed (HTTP ${code}): ${Buffer.concat(chunks).toString('utf8').slice(0,500)}`)));return;
        }
        const progressId=String(info.progressId||'');
        const total=Number(res.headers['content-length']||0);
        let received=0;
        const sendProgress=(done=false)=>{try{if(sender&&!sender.isDestroyed())sender.send('file-download-progress',{id:progressId,received,total,done})}catch{}};
        sendProgress(false);
        res.on('data',chunk=>{received+=chunk.length;sendProgress(false)});
        res.on('end',()=>sendProgress(true));
        let resolvedName=safeName;
        if(!path.extname(resolvedName)){
          const cd=String(res.headers['content-disposition']||'');
          const m=cd.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^;\"]+)\"?/i);
          if(m){try{const fromHeader=decodeURIComponent(m[1]||m[2]||'').trim();if(path.extname(fromHeader))resolvedName=fromHeader}catch{}}
        }
        if(!path.extname(resolvedName)){
          const mime=String(info.mime||res.headers['content-type']||'').split(';')[0].toLowerCase();
          const mimeExt={'application/pdf':'.pdf','application/msword':'.doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx','application/vnd.ms-excel':'.xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.xlsx','application/vnd.ms-powerpoint':'.ppt','application/vnd.openxmlformats-officedocument.presentationml.presentation':'.pptx','text/plain':'.txt','text/csv':'.csv','application/zip':'.zip','image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','audio/mpeg':'.mp3','video/mp4':'.mp4'}[mime];
          if(mimeExt)resolvedName+=mimeExt;
        }
        const finalTarget=path.join(tmpDir,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${resolvedName.slice(0,180)}`);
        const out=fs.createWriteStream(finalTarget);
        res.pipe(out);
        out.on('finish',()=>{
          try{
            const fd=fs.openSync(finalTarget,'r');const head=Buffer.alloc(16);const n=fs.readSync(fd,head,0,16,0);fs.closeSync(fd);
            const sig=head.subarray(0,n).toString('latin1');
            let corrected=resolvedName;
            if(sig.startsWith('%PDF-')&&!/\.pdf$/i.test(corrected)) corrected=corrected.replace(/\.[A-Za-z0-9]{1,8}$/,'')+'.pdf';
            if(/^<!doctype html|^<html/i.test(sig.trim())) throw new Error('Schoology returned an HTML page instead of the submitted file.');
            if(corrected!==resolvedName){const correctedTarget=path.join(tmpDir,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${corrected.slice(0,180)}`);fs.renameSync(finalTarget,correctedTarget);downloadedPath=correctedTarget;}else downloadedPath=finalTarget;
          }catch(e){try{fs.unlinkSync(finalTarget)}catch{};return reject(e)}
          out.close(()=>resolve(downloadedPath));
        });
        out.on('error',e=>{try{out.close()}catch{};reject(e)});
      });
      req.on('error',reject);req.setTimeout(60000,()=>req.destroy(new Error('Schoology file download timed out')));req.end();
    };
    doGet(u.toString());
  });
  const actual=downloadedPath;
  if(!actual || !fs.existsSync(actual)) throw new Error('Downloaded file was not found after Schoology download completed.');
  return {path:actual,filename:path.basename(actual).replace(/^\d+-[a-f0-9]+-/i,''),mime:String(info.mime||'application/octet-stream')};
}

function sendFileUploadProgress(percent,phase='Uploading…'){try{if(win&&!win.isDestroyed())win.webContents.send('file-upload-progress',{percent,phase})}catch{}}
async function writeUploadBuffer(req,buffer,onProgress,startPercent,endPercent){
  const chunkSize=64*1024; let sent=0;
  for(let off=0;off<buffer.length;off+=chunkSize){const chunk=buffer.subarray(off,Math.min(off+chunkSize,buffer.length));if(!req.write(chunk))await new Promise(resolve=>req.once('drain',resolve));sent+=chunk.length;const p=buffer.length?startPercent+(sent/buffer.length)*(endPercent-startPercent):endPercent;onProgress(Math.round(p));}
}
async function uploadSchoologyFile(info){
  await syncServerTime().catch(()=>{}); const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.filePath)throw new Error('File information is incomplete.');
  const filePath=info.filePath, filename=path.basename(filePath), file=fs.readFileSync(filePath);
  const mimeByExt={'.pdf':'application/pdf','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.txt':'text/plain','.csv':'text/csv','.zip':'application/zip','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif'};
  const mime=mimeByExt[path.extname(filename).toLowerCase()]||String(info.mime||'application/octet-stream'); let fileId=null,primaryError=null;
  try{
    const boundary=crypto.randomUUID(),quoted=s=>String(s).replace(/\\/g,'\\\\').replace(/"/g,'%22').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
    const pre=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${quoted(filename)}\"\r\nContent-Type: multipart/form-data\r\nContent-Length: ${file.length}\r\n\r\n`),post=Buffer.from(`\r\n--${boundary}--\r\n`),multipart=Buffer.concat([pre,file,post]);
    const uploadUrl=new URL(`https://${API_HOST}/v1/file`);uploadUrl.searchParams.set('name',filename);
    const headers={'User-Agent':ANDROID_OKHTTP_UA,'Accept':'application/json','Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':multipart.length,'Authorization':makePlaintextOAuthHeader(a.oauth_token,a.oauth_token_secret),'Cookie':MOBILE_COOKIE};
    sendFileUploadProgress(0,'Uploading attachment…');
    const uploaded=await new Promise((resolve,reject)=>{const req=https.request({hostname:uploadUrl.hostname,path:uploadUrl.pathname+uploadUrl.search,method:'POST',headers},res=>{let out='';res.setEncoding('utf8');res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode||0,text:out}))});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('File upload timed out')));writeUploadBuffer(req,multipart,p=>sendFileUploadProgress(p,'Uploading attachment…'),0,85).then(()=>req.end()).catch(reject)});
    if(uploaded.status>=200&&uploaded.status<300){try{fileId=JSON.parse(uploaded.text).fileMetadataId}catch{}} if(!fileId)throw new Error(`FileService ${uploaded.status}: ${uploaded.text}`);
  }catch(e){primaryError=e}
  if(!fileId){
    try{
      const md5=crypto.createHash('md5').update(file).digest('hex');const holder=await request('POST',`https://${API_HOST}/v1/upload`,{filename,md5_checksum:md5,filesize:file.length},{sign:true,legacyOAuth:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
      if(holder.status<200||holder.status>=300)throw new Error(`legacy metadata upload failed: ${holder.status} ${holder.text}`);let j={};try{j=JSON.parse(holder.text)}catch{};const uploadId=j.id??j.upload_file_id??j.uploadFileID;if(uploadId==null)throw new Error('legacy metadata upload did not return an upload id.');
      const putUrl=`https://${API_HOST}/v1/upload/${encodeURIComponent(String(uploadId))}`,putHeaders={'User-Agent':ANDROID_OKHTTP_UA,'Accept':'application/json','Content-Type':mime,'Content-Length':file.length,'Authorization':makeOAuthHeader('PUT',putUrl,a.oauth_token,a.oauth_token_secret),'Cookie':MOBILE_COOKIE};
      const put=await new Promise((resolve,reject)=>{const u=new URL(putUrl),req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'PUT',headers:putHeaders},res=>{let out='';res.setEncoding('utf8');res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode||0,text:out}))});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('File upload timed out')));writeUploadBuffer(req,file,p=>sendFileUploadProgress(5+Math.round(p*.85),'Uploading attachment…'),0,100).then(()=>req.end()).catch(reject)});
      if(put.status<200||put.status>=300)throw new Error(`legacy file upload failed: ${put.status} ${put.text}`);fileId=String(uploadId);
    }catch(e){throw new Error(`File upload failed: ${primaryError?.message||primaryError}; ${e.message||e}`)}
  }
  sendFileUploadProgress(100,'Attachment uploaded');return String(fileId);
}

async function submitAssignmentFile(info){
  await syncServerTime().catch(()=>{});
  const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.sectionId||!info?.assignmentId||!info?.filePath)throw new Error('Submission information is incomplete.');
  const filePath=info.filePath, filename=path.basename(filePath), file=fs.readFileSync(filePath);
  const mimeByExt={'.pdf':'application/pdf','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.txt':'text/plain','.csv':'text/csv','.zip':'application/zip','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif'};
  const mime=mimeByExt[path.extname(filename).toLowerCase()]||String(info.mime||'application/octet-stream');
  let fileId=null, primaryError=null;
  try{
    // This reproduces tc.z.a()/MultipartBody from Android 2026.06.0. In
    // particular, the file part itself has the multipart/form-data media type,
    // includes a Content-Length header, and the multipart boundary is a UUID.
    const boundary=crypto.randomUUID();
    const quoted=s=>String(s).replace(/\\/g,'\\\\').replace(/\"/g,'%22').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
    const pre=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${quoted(filename)}\"\r\nContent-Type: multipart/form-data\r\nContent-Length: ${file.length}\r\n\r\n`);
    const post=Buffer.from(`\r\n--${boundary}--\r\n`);
    const multipart=Buffer.concat([pre,file,post]);
    const uploadUrl=new URL(`https://${API_HOST}/v1/file`);
    // Android Multipart upload adds @Query("name") to the request URL.
    uploadUrl.searchParams.set('name',filename);
    const headers={
      'User-Agent':ANDROID_OKHTTP_UA,
      'Accept':'application/json',
      'Content-Type':`multipart/form-data; boundary=${boundary}`,
      'Content-Length':multipart.length,
      'Authorization':makePlaintextOAuthHeader(a.oauth_token,a.oauth_token_secret),
      'Cookie':MOBILE_COOKIE
    };
    sendFileUploadProgress(0,'Uploading submission…');
    const uploaded=await new Promise((resolve,reject)=>{const req=https.request({hostname:uploadUrl.hostname,path:uploadUrl.pathname+uploadUrl.search,method:'POST',headers},res=>{let out='';res.setEncoding('utf8');res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode||0,text:out}))});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('File upload timed out')));writeUploadBuffer(req,multipart,p=>sendFileUploadProgress(p,'Uploading submission…'),0,85).then(()=>req.end()).catch(reject)});
    sendFileUploadProgress(90,'Processing uploaded file…');
    if(uploaded.status>=200&&uploaded.status<300){try{fileId=JSON.parse(uploaded.text).fileMetadataId}catch{}}
    if(!fileId)throw new Error(`FileService ${uploaded.status}: ${uploaded.text}`);
  }catch(e){primaryError=e}
  if(!fileId){
    // The Android 2026.06.0 legacy implementation is only used when the
    // FileServiceApi dependency is unavailable. Reproduce its exact request:
    // POST /v1/upload with UploadAttachmentObject JSON fields (filename/md5_checksum/filesize) in the BODY (not query parameters), then
    // PUT /v1/upload/{id} with the raw file bytes. The previous port incorrectly
    // put upload_filename/upload_file_md5/upload_file_size into the URL, which
    // changed the OAuth signature and caused the 401/400 failures seen here.
    try{
      const md5=crypto.createHash('md5').update(file).digest('hex');
      const meta={filename,md5_checksum:md5,filesize:file.length};
      sendFileUploadProgress(0,'Preparing upload…');
      const holder=await request('POST',`https://${API_HOST}/v1/upload`,meta,{sign:true,legacyOAuth:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
      sendFileUploadProgress(5,'Uploading submission…');
      if(holder.status<200||holder.status>=300)throw new Error(`legacy metadata upload failed: ${holder.status} ${holder.text}`);
      let holderJson={};try{holderJson=JSON.parse(holder.text)}catch{}
      const uploadId=holderJson.id??holderJson.upload_file_id??holderJson.uploadFileID;
      if(uploadId==null)throw new Error('legacy metadata upload did not return an upload id.');
      const putUrl=`https://${API_HOST}/v1/upload/${encodeURIComponent(String(uploadId))}`;
      const putHeaders={'User-Agent':ANDROID_OKHTTP_UA,'Accept':'application/json','Content-Type':mime,'Content-Length':file.length,'Authorization':makeOAuthHeader('PUT',putUrl,a.oauth_token,a.oauth_token_secret),'Cookie':MOBILE_COOKIE};
      const put=await new Promise((resolve,reject)=>{const u=new URL(putUrl);const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'PUT',headers:putHeaders},res=>{let out='';res.setEncoding('utf8');res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode||0,text:out}))});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('File upload timed out')));writeUploadBuffer(req,file,p=>sendFileUploadProgress(5+Math.round(p*.85),'Uploading submission…'),0,100).then(()=>req.end()).catch(reject)});
      if(put.status<200||put.status>=300)throw new Error(`legacy file upload failed: ${put.status} ${put.text}`);
      fileId=String(uploadId);
    }catch(legacyError){
      const pmsg=primaryError?.message||String(primaryError||'FileService upload failed');
      throw new Error(`File upload failed: ${pmsg}; ${legacyError.message||legacyError}`);
    }
  }
  sendFileUploadProgress(92,'Submitting assignment…');
  const result=await request('POST',`https://${API_HOST}/v1/section/${info.sectionId}/assignment/${info.assignmentId}/submission`,{files:[{id:String(fileId)}]},{sign:true,signBody:false,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
  if(result.status<200||result.status>=300)throw new Error('Assignment submission failed: '+result.status+' '+result.text);sendFileUploadProgress(100,'Upload complete');return true;
}

async function submitAssignmentResource(info){
  const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.sectionId||!info?.assignmentId||!info?.resourceId)throw new Error('Resource submission information is incomplete.');
  const url=`https://${API_HOST}/v1/course/${encodeURIComponent(info.sectionId)}/materials/assignments/${encodeURIComponent(info.assignmentId)}/dropbox/create_resource_submission`;
  const result=await request('POST',url,{files:[{schoology_resource_id:String(info.resourceId)}]},{sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
  if(result.status<200||result.status>=300)throw new Error('Resource submission failed: '+result.status+' '+result.text);
  return true;
}

async function submitAssignmentText(info){
  const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.sectionId||!info?.gradeItemId)throw new Error('Text submission information is incomplete.');
  const body=String(info.text||'').trim(); if(!body)throw new Error('Enter a submission before posting.');
  const submissionUrl=new URL(`https://${API_HOST}/v1/sections/${info.sectionId}/submissions/${info.gradeItemId}/create`);submissionUrl.searchParams.set('realm','sections');submissionUrl.searchParams.set('realm_id',String(info.sectionId));submissionUrl.searchParams.set('grade_item_id',String(info.gradeItemId));submissionUrl.searchParams.set('action','create');const result=await request('POST',submissionUrl.toString(),{body,draft:info.draft?1:0},{sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
  if(result.status<200||result.status>=300)throw new Error('Text submission failed: '+result.status+' '+result.text); return true;
}

async function api(pathname,method='GET',params={},options={}){
  const a=loadAuth();if(!a)throw new Error('Not signed in');
  const clean=String(pathname||'').replace(/^\//,'');
  const version=clean.startsWith('v2/')?'v2':'v1';
  const resource=clean.startsWith('v2/')?clean.slice(3):clean;
  const url=`https://${API_HOST}/${version}/${resource}`;
  const isMultioptions=clean==='multioptions' && method.toUpperCase()==='POST';
  const r=await request(method,url,params,{sign:true,signBody:false,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:!!options.json||isMultioptions});
  if(r.status===401)throw new Error('Schoology session expired (HTTP 401)');
  if(r.status===403)throw new Error('Schoology denied this request (HTTP 403)');
  if(r.status<200||r.status>=300)throw new Error('Schoology API '+r.status+': '+r.text);
  try{return JSON.parse(r.text)}catch{return r.text}
}
let schoologyNotificationTimer=null;
function notificationKey(item){return String(item?.id??item?.notification_id??item?.notificationId??`${item?.type||''}:${item?.created||item?.timestamp||''}:${item?.body||item?.message||item?.title||''}`)}
function notificationText(item){const body=String(item?.body||item?.message||item?.title||'You have a new Schoology notification');const args=item?.body_args||item?.bodyArgs||[];const rendered=Array.isArray(args)?args.reduce((out,arg)=>out.replace('%s',String(arg?.title||arg?.name||'')),body):body;return rendered.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,220)}
function readNotificationSeen(){try{const value=JSON.parse(fs.readFileSync(notificationSeenFile,'utf8'))||{};return {userId:String(value.userId||''),ids:Array.isArray(value.ids)?value.ids.map(String):[]}}catch{return {userId:'',ids:[]}}}
function writeNotificationSeen(userId,ids){try{fs.mkdirSync(path.dirname(notificationSeenFile),{recursive:true});fs.writeFileSync(notificationSeenFile,JSON.stringify({userId:String(userId||''),ids:ids.slice(0,200)},null,2),'utf8')}catch{}}
async function pollSchoologyNotifications(){
  const auth=loadAuth();if(!auth)return;
  try{
    // Android's NotificationApiHelper uses NotificationsApi at /v1/notifications.
    // /v1/mobile/notifications is a separate in-app message feed.
    const response=await api('notifications');
    const raw=response?.notification??response?.notifications??response?.data?.notification??response?.data?.notifications??[];
    const items=(Array.isArray(raw)?raw:(raw?.notification||raw?.notifications||raw?.items||[])).filter(Boolean);
    const userId=String(auth.userId||auth.user?.id||'');
    const keys=items.map(notificationKey);const previous=readNotificationSeen();
    const sameUser=previous.userId===userId;const seen=new Set(sameUser?previous.ids:[]);
    // On first run (or account switch), establish a baseline instead of notifying
    // for the account's entire existing notification history.
    if(sameUser&&readAppSettings().desktopNotifications&&Notification.isSupported()){
      const fresh=items.filter(item=>!seen.has(notificationKey(item))).slice(0,3).reverse();
      for(const item of fresh){
        const title=String(item?.title||item?.type_label||'Schoology');
        const notification=new Notification({title:'Schoology',body:notificationText(item)||title,silent:!readAppSettings().notificationSound});
        notification.on('click',()=>{if(!win||win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();});
        notification.show();
      }
    }
    writeNotificationSeen(userId,keys);
  }catch(error){if(!/Not signed in|session expired/i.test(String(error?.message||error)))console.warn('Schoology notification check failed:',error?.message||error)}
}
function scheduleSchoologyNotifications(){if(schoologyNotificationTimer)clearInterval(schoologyNotificationTimer);schoologyNotificationTimer=setInterval(()=>{pollSchoologyNotifications().catch(()=>{})},5*60*1000);schoologyNotificationTimer.unref?.();setTimeout(()=>pollSchoologyNotifications().catch(()=>{}),15000).unref?.()}
function buildAndroidOAuthLoginUrl(domain,requestToken){
  const host=String(domain||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!host) throw new Error('This school did not provide a valid domain.');
  // The official Android manifest accepts schoology://external_login_callback.
  // Using that callback lets the system browser return to the installed desktop
  // app without reading or copying browser cookies.
  const callback=`schoology://external_login_callback?request_token=${encodeURIComponent(requestToken)}&app_origin=${encodeURIComponent(`https://${WEB_HOST}`)}&os=desktop&app_version=${encodeURIComponent(app.getVersion())}`;
  const oauthPath=`oauth/authorize?oauth_token=${encodeURIComponent(requestToken)}&oauth_callback=${encodeURIComponent(callback)}`;
  return `https://${host}/${oauthPath}&login_landing_dest=${encodeURIComponent(oauthPath)}`;
}
async function loginThroughSchoolBrowser(info){
  if(!info||!info.domain)throw new Error('This school did not provide a login domain.');
  await syncServerTime().catch(()=>{});
  const credential=await getRequestToken();
  const loginUrl=buildAndroidOAuthLoginUrl(info.domain,credential.oauth_token);
  return new Promise((resolve,reject)=>{
    let settled=false;let timeout=null;
    const finish=(err,value)=>{
      if(settled)return;settled=true;if(timeout)clearTimeout(timeout);
      if(pendingExternalSchoolLogin===pending)pendingExternalSchoolLogin=null;
      err?reject(err):resolve(value);
    };
    const pending={requestToken:credential.oauth_token,credential,finish};
    pendingExternalSchoolLogin=pending;
    timeout=setTimeout(()=>finish(new Error('Timed out waiting for the school sign-in to return to Schoology. Keep the browser open until sign-in completes, then try again.')),10*60*1000);
    shell.openExternal(loginUrl).catch(error=>finish(new Error('Could not open the system browser for school sign-in: '+(error?.message||error))));
  });
}

async function loginExternalSchool(info){
  if(!info||!info.url)throw new Error('This school did not provide a login URL.');
  const rawUrl=String(info.url);
  let launch;
  try{launch=new URL(rawUrl)}catch{throw new Error('This school provided an invalid login URL.');}

  // This mirrors LoginExternalActivity + ExternalAuthWebViewClient from Android.
  // Android does NOT poll the whole cookie jar. It waits for a navigation to an
  // expected Schoology domain (or sgyInitialPage), then reads the SESS cookie
  // associated with that navigation URL.
  const expectedDomain=String(info.domain||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const defaultUrl='https://app.schoology.com';
  let defaultDomain='app.schoology.com';
  try{defaultDomain=new URL(defaultUrl).hostname}catch{}
  const expectedHost=expectedDomain.split('/')[0].split(':')[0].toLowerCase();

  const hostMatchesSuffix=(hostname,suffix)=>{
    const h=String(hostname||'').toLowerCase();
    const s=String(suffix||'').toLowerCase().replace(/^\./,'');
    return !!s && (h===s || h.endsWith('.'+s));
  };
  const shouldIntercept=(url)=>{
    try{
      const u=new URL(url);
      const host=u.hostname.toLowerCase();
      // Android ExternalAuthWebViewClient accepts any URL whose query contains
      // sgyInitialPage, even when the host is not a Schoology domain. This is
      // how some district SSO redirects signal that the session is ready.
      const sgyInitialPage=String(u.search||'').includes('sgyInitialPage');
      // External SSO providers (Microsoft, Google, etc.) are otherwise
      // intermediate pages. LAUSD also uses its district LMS host.
      const schoologyHost=hostMatchesSuffix(host,'schoology.com');
      const lausdHost=host==='lms.lausd.net' || hostMatchesSuffix(host,'lms.lausd.net');
      const expectedSchoolHost=expectedHost &&
        (hostMatchesSuffix(host,expectedHost) && (
          hostMatchesSuffix(expectedHost,'schoology.com') ||
          expectedHost==='lms.lausd.net' ||
          hostMatchesSuffix(expectedHost,'lms.lausd.net')
        ));
      return sgyInitialPage || schoologyHost || lausdHost || !!expectedSchoolHost;
    }catch{return false}
  };

  const getSessionCookieForUrl=async(url)=>{
    const cookies=await session.defaultSession.cookies.get({url});
    // Match Android's ExternalAuthWebViewClient: find the first cookie whose
    // name begins with SESS and pass the complete name=value pair onward.
    const c=cookies.find(x=>/^SESS/i.test(x.name));
    return c ? `${c.name}=${c.value}` : null;
  };

  // Android creates ExternalSessionLoginFlow only after the WebView client
  // reports the session cookie. That flow then obtains the OAuth request token,
  // POSTs /oauth/authorize_auto with the SESS cookie, and exchanges the token.
  return new Promise((resolve,reject)=>{
    let child=null,settled=false,processing=false;
    const finish=(err,value)=>{
      if(settled)return;
      settled=true;
      if(child&&!child.isDestroyed())child.close();
      err?reject(err):resolve(value);
    };
    const handleCandidate=async(url,event)=>{
      if(settled||processing||!shouldIntercept(url))return;
      const cookie=await getSessionCookieForUrl(url).catch(()=>null);
      if(!cookie)return;
      processing=true;
      if(event&&typeof event.preventDefault==='function')event.preventDefault();
      try{
        await syncServerTime().catch(()=>{});
        const t=await getRequestToken();
        const base=new URL(url);
        const r=await request('POST',`${base.protocol}//${base.host}/oauth/authorize_auto`,{oauth_token:t.oauth_token},{
          clientIdentity:true,
          headers:{Cookie:cookie}
        });
        if(r.status<200||r.status>=300)throw new Error('School session authorization failed: '+r.status+' '+r.text);
        const auth=await exchangeToken(t);
        finish(null,auth);
      }catch(e){
        processing=false;
        finish(e);
      }
    };

    child=new BrowserWindow({
      width:1100,height:800,modal:true,parent:win,show:true,autoHideMenuBar:true,
      backgroundColor:'#ffffff',
      webPreferences:{contextIsolation:true,nodeIntegration:false,javascript:true,webSecurity:true,session:session.defaultSession}
    });
    child.webContents.setUserAgent(ANDROID_WEBVIEW_UA);
    child.webContents.on('will-navigate',(event,url)=>{handleCandidate(url,event)});
    child.webContents.on('will-redirect',(event,url)=>{handleCandidate(url,event)});
    child.webContents.on('did-navigate',(event,url)=>{handleCandidate(url,null)});
    child.webContents.on('did-navigate-in-page',(event,url)=>{handleCandidate(url,null)});
    child.webContents.on('did-fail-load',(_,code,desc)=>{if(code!==-3)console.error('School external login failed:',code,desc)});
    child.webContents.on('console-message',(_,level,message,line,source)=>console.log('School external login:',message,'at',source+':'+line));
    child.on('closed',()=>{if(!settled)finish(new Error('School login window was closed.'))});
    child.loadURL(rawUrl).catch(e=>{if(String(e?.message||e).includes('ERR_ABORTED')||e?.errno===-3)return;finish(e)});
  });
}


const UPDATE_REPO='tling0001/schoology-for-desktop-port';
const UPDATE_INTERVAL_MS=12*60*60*1000, UPDATE_RETRY_MS=5*60*1000, UPDATE_STATE_FILE=path.join(stableUserData,'update-state.json');
function readUpdateState(){try{return JSON.parse(fs.readFileSync(UPDATE_STATE_FILE,'utf8'))}catch{return {}}}
function writeUpdateState(v){try{fs.mkdirSync(path.dirname(UPDATE_STATE_FILE),{recursive:true});fs.writeFileSync(UPDATE_STATE_FILE,JSON.stringify(v,null,2),'utf8')}catch{}}
function localReleaseNumber(){const m=String(app.getVersion()).match(/port\.(\d+)/i);return m?Number(m[1]):0}
function fetchJson(url){return new Promise((resolve,reject)=>{const u=new URL(url);const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'GET',headers:{'User-Agent':'Schoology-Desktop-Port-Updater','Accept':'application/vnd.github+json'}},res=>{let s='';res.setEncoding('utf8');res.on('data',c=>s+=c);res.on('end',()=>{if((res.statusCode||0)<200||(res.statusCode||0)>=300)return reject(new Error(`Update check failed (HTTP ${res.statusCode})`));try{resolve(JSON.parse(s))}catch{reject(new Error('Update service returned invalid JSON.'))}})});req.setTimeout(15000,()=>req.destroy(new Error('Update check timed out')));req.on('error',reject);req.end()})}
async function sha256File(file){return await new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(file);s.on('data',d=>h.update(d));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')))});}
function downloadUrl(url,target,totalHint=0){return new Promise((resolve,reject)=>{const get=(href,depth=0)=>{if(depth>8)return reject(new Error('Too many update redirects.'));const u=new URL(href);const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'GET',headers:{'User-Agent':'Schoology-Desktop-Port-Updater','Accept':'application/octet-stream'}},res=>{const code=res.statusCode||0;if([301,302,303,307,308].includes(code)&&res.headers.location){res.resume();return get(new URL(res.headers.location,u).toString(),depth+1)}if(code<200||code>=300){res.resume();return reject(new Error(`Update download failed (HTTP ${code})`))}const headerTotal=Number(res.headers['content-length']||0);const expected=headerTotal||Number(totalHint||0);let received=0;const sendProgress=done=>{try{if(win&&!win.isDestroyed()){const percent=expected?Math.min(100,Math.round(received*100/expected)):null;win.webContents.send('update-download-progress',{received,total:expected||received,percent,done:!!done});if(process.platform==='darwin')updateMacProgress('Downloading update…',percent==null?0:percent)}}catch{}};sendProgress(false);const out=fs.createWriteStream(target);res.on('data',d=>{received+=d.length;sendProgress(false)});res.pipe(out);out.on('finish',()=>out.close(()=>{if(expected&&received!==expected){try{fs.unlinkSync(target)}catch{};return reject(new Error(`Update download was incomplete (${received}/${expected} bytes).`))}sendProgress(true);resolve(target)}));out.on('error',e=>{try{out.close()}catch{};try{fs.unlinkSync(target)}catch{};reject(e)})});req.setTimeout(10*60*1000,()=>req.destroy(new Error('Update download timed out')));req.on('error',e=>{try{fs.unlinkSync(target)}catch{};reject(e)});req.end()};get(url)})}

function updateAssetForPlatform(release){const assets=Array.isArray(release?.assets)?release.assets:[];const arch=process.arch;let wanted=[];if(process.platform==='win32')wanted=['Setup-x64.exe'];else if(process.platform==='darwin'){wanted=['.app.zip',arch==='arm64'?'arm64.dmg':'x64.dmg'];}else if(process.platform==='linux')wanted=[fs.existsSync('/usr/bin/rpm')&&!fs.existsSync('/usr/bin/dpkg')?'x86_64.rpm':'amd64.deb'];for(const suffix of wanted){const found=assets.find(a=>String(a.name||'').endsWith(suffix));if(found)return found;}return null}
async function checkForUpdates(force=false){const now=Date.now(),st=readUpdateState();if(!force&&st.lastSuccessfulCheck&&now-st.lastSuccessfulCheck<UPDATE_INTERVAL_MS)return {checked:false,available:false};if(!require('electron').net.isOnline())throw new Error('Computer is offline.');const release=await fetchJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);const tag=String(release.tag_name||'');const remote=Number((tag.match(/(\d+)$/)||[])[1]||0),local=localReleaseNumber();if(!remote||remote<=local||release.draft||release.prerelease){writeUpdateState({lastSuccessfulCheck:now,lastRemoteTag:tag});return {checked:true,available:false,version:local};}const asset=updateAssetForPlatform(release);if(!asset)throw new Error('No compatible update package was found for this computer.');writeUpdateState({lastSuccessfulCheck:now,lastRemoteTag:tag});return {checked:true,available:true,version:remote,tag,assetName:asset.name,url:asset.browser_download_url,size:Number(asset.size||0),digest:asset.digest||null,useWindowsUpdater:process.platform==='win32'};}
async function getLatestRepoReleaseAsset(repo,productName='Schoology'){if(!require('electron').net.isOnline())throw new Error('Computer is offline.');const release=await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);if(release.draft||release.prerelease)throw new Error('No stable release is currently available.');const asset=updateAssetForPlatform(release);if(!asset)throw new Error('No compatible release package was found for this computer.');return {checked:true,tag:String(release.tag_name||''),version:String(release.tag_name||'').replace(/^v/i,''),assetName:asset.name,url:asset.browser_download_url,size:Number(asset.size||0),digest:asset.digest||null,repository:repo,productName,useWindowsUpdater:process.platform==='win32'};}
async function downloadLiquidGlass(){return getLatestRepoReleaseAsset('tling0001/SchoologyDesktopLiquidGlass','Schoology Liquid Glass');}
async function downloadExpressive(){return getLatestRepoReleaseAsset('tling0001/SchoologyDesktopM3E','Schoology Expressive');}
async function downloadAndVerifyUpdate(info){if(!info?.url)throw new Error('The update download URL is missing.');const tag=String(info.tag||'update').replace(/[^A-Za-z0-9._-]/g,'_');const name=String(info.assetName||path.basename(new URL(info.url).pathname)||'schoology-update').replace(/[^A-Za-z0-9._-]/g,'_');const tmp=path.join(app.getPath('temp'),`schoology-update-${tag}-${name}`);let valid=false;if(fs.existsSync(tmp)){try{if(info.size&&fs.statSync(tmp).size!==Number(info.size))throw new Error('size');if(info.digest&&/^sha256:/i.test(String(info.digest))){const actual=await sha256File(tmp);if(actual.toLowerCase()!==String(info.digest).split(':').pop().toLowerCase())throw new Error('digest')}valid=true}catch{try{fs.unlinkSync(tmp)}catch{}}}if(!valid)await downloadUrl(info.url,tmp,Number(info.size||0));if(info.size&&fs.statSync(tmp).size!==Number(info.size))throw new Error('Downloaded update size does not match GitHub release metadata.');if(info.digest&&/^sha256:/i.test(String(info.digest))){const actual=await sha256File(tmp);const expected=String(info.digest).split(':').pop().toLowerCase();if(actual.toLowerCase()!==expected){try{fs.unlinkSync(tmp)}catch{};throw new Error('Downloaded update failed its SHA-256 integrity check.');}}return tmp;}
function showMacUpdateProgressWindow(){
  if(process.platform!=='darwin')return null;
  if(updateProgressWindow&&!updateProgressWindow.isDestroyed()){updateProgressWindow.show();return updateProgressWindow;}
  const colors=resolveThemeColors();updateProgressWindow=new BrowserWindow({width:420,height:180,resizable:false,fullscreenable:false,minimizable:false,maximizable:false,alwaysOnTop:true,center:true,title:'Schoology Update',backgroundColor:colors.background,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  updateProgressWindow.removeMenu();
  updateProgressWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:28px 30px;color:${colors.foreground};background:${colors.background}}h2{font-size:20px;font-weight:600;margin:0 0 18px}p{font-size:14px;color:${colors.muted};margin:0 0 16px}#track{height:6px;background:${colors.track};border-radius:4px;overflow:hidden}#bar{height:100%;width:0;background:${colors.accent};transition:width .15s}#percent{text-align:right;font-size:12px;color:${colors.muted};margin-top:7px}</style></head><body><h2>Updating Schoology</h2><p id="status">Downloading update…</p><div id="track"><div id="bar"></div></div><div id="percent">0%</div></body></html>`));
  updateProgressWindow.on('closed',()=>{updateProgressWindow=null});
  return updateProgressWindow;
}
function updateMacProgress(status,percent){
  if(!updateProgressWindow||updateProgressWindow.isDestroyed())return;
  const payload=JSON.stringify({status:String(status||''),percent:Math.max(0,Math.min(100,Number(percent)||0))});
  updateProgressWindow.webContents.executeJavaScript(`(()=>{const d=${payload};const s=document.getElementById('status'),b=document.getElementById('bar'),p=document.getElementById('percent');if(s)s.textContent=d.status;if(b)b.style.width=d.percent+'%';if(p)p.textContent=d.percent+'%'})()`).catch(()=>{});
}
async function installUpdate(info){
  if(process.platform==='win32'&&info&&typeof info==='object'&&info.useWindowsUpdater){
    const updaterPath=path.join(process.resourcesPath,'SchoologyUpdater.exe');
    const devUpdater=path.join(__dirname,'../updater/dist/SchoologyUpdater.exe');
    const helper=fs.existsSync(updaterPath)?updaterPath:(fs.existsSync(devUpdater)?devUpdater:null);
    if(!helper)throw new Error('The Schoology Windows updater is not installed with this build.');
    const installContext=getWindowsInstallContext();
    const stagedUpdater=path.join(app.getPath('temp'),`SchoologyUpdater-${process.pid}-${Date.now()}.exe`);
    fs.copyFileSync(helper,stagedUpdater);
    const payload={url:String(info.url||''),size:Number(info.size||0),digest:info.digest||null,version:String(info.version||info.tag||''),productName:String(info.productName||'Schoology'),themeMode:readThemeMode(),darkTheme:isDarkAppearance(),parentPid:process.pid,stagedUpdaterPath:stagedUpdater,...installContext};
    const encoded=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
    const {spawn}=require('child_process');
    let child;
    if(installContext.installMode==='all-users'){
      const quotePowerShell=value=>`'${String(value).replace(/'/g,"''")}'`;
      const command=`Start-Process -FilePath ${quotePowerShell(stagedUpdater)} -ArgumentList ${quotePowerShell(`--payload-base64=${encoded}`)} -Verb RunAs`;
      child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',command],{detached:true,stdio:'ignore',windowsHide:true});
    }else child=spawn(stagedUpdater,[`--payload-base64=${encoded}`],{detached:true,stdio:'ignore',windowsHide:false});
    child.unref();
    app.quit();
    return true;
  }
  const macProgress=process.platform==='darwin'?showMacUpdateProgressWindow():null;
  if(macProgress)macProgress.once('ready-to-show',()=>{macProgress.show();updateMacProgress('Downloading update…',0)});
  const file=typeof info==='string'?info:await downloadAndVerifyUpdate(info);
  if(!file||!fs.existsSync(file))throw new Error('The update installer is no longer available.');
  if(process.platform==='win32'){
    // Alternate builds use their own installer when the Windows updater is not
    // selected, such as a non-Windows platform.
    const {spawn}=require('child_process');
    const child=spawn(file,[],{detached:true,stdio:'ignore',windowsHide:false});
    child.unref();
    app.quit();
    return true;
  }
  if(process.platform==='darwin'){
    const {spawn}=require('child_process'); updateMacProgress('Installing update…',100);
    const targetApp=path.dirname(path.dirname(path.dirname(process.execPath))); const parentDir=path.dirname(targetApp);
    const shPath=path.join(app.getPath('temp'),`schoology-update-${process.pid}-${Date.now()}.sh`),q=v=>String(v).replace(/'/g,"'\"'\"'");
    const mount=path.join(app.getPath('temp'),`schoology-dmg-${process.pid}-${Date.now()}`);fs.mkdirSync(mount,{recursive:true});
    const stagedApp=path.join(parentDir,`.Schoology-update-${process.pid}-${Date.now()}.app`);
    const logPath=path.join(app.getPath('temp'),`schoology-update-${process.pid}.log`);const script=`#!/bin/bash\nset -euo pipefail\nexec >>'${q(logPath)}' 2>&1\nDMG='${q(file)}'\nTARGET='${q(targetApp)}'\nSTAGED='${q(stagedApp)}'\nMOUNT='${q(mount)}'\nPID=${process.pid}\ncleanup(){ hdiutil detach "$MOUNT" >/dev/null 2>&1 || true; rm -f "$DMG" "$0"; rm -rf "$MOUNT"; }\ntrap cleanup EXIT\nif [[ "$DMG" == *.dmg ]]; then hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" >/dev/null; else ditto -x -k "$DMG" "$MOUNT"; fi\nAPP=$(find "$MOUNT" -maxdepth 4 -name '*.app' -type d -print -quit)\nif [ -z "$APP" ]; then echo 'No .app bundle found in update image'; exit 1; fi\nrm -rf "$STAGED"\nditto --rsrc --extattr --qtn "$APP" "$STAGED"\n# Remove the DMG's quarantine flag and restore an ad-hoc signature so macOS accepts the copied bundle.\nxattr -dr com.apple.quarantine "$STAGED" 2>/dev/null || true\ncodesign --force --deep --sign - "$STAGED" >/dev/null 2>&1 || true\nfor i in {1..300}; do kill -0 $PID 2>/dev/null || break; sleep .2; done\nBACKUP="${TARGET}.schoology-backup-$$"\nif [ -e "$TARGET" ]; then mv "$TARGET" "$BACKUP"; fi\nif mv "$STAGED" "$TARGET"; then rm -rf "$BACKUP"; else [ ! -e "$BACKUP" ] || mv "$BACKUP" "$TARGET"; exit 1; fi\nopen "$TARGET"\n`;
    fs.writeFileSync(shPath,script,{encoding:'utf8',mode:0o755});spawn('/bin/bash',[shPath],{detached:true,stdio:'ignore'}).unref();app.quit();return true;
  }
  const r=await shell.openPath(file);if(r)throw new Error(r);return true;
}
let updateTimer=null;function scheduleUpdateChecks(){const run=async()=>{try{const result=await checkForUpdates(false);if(result?.available){try{win?.webContents?.send('update-available',result)}catch(e){console.error('Automatic Schoology update notification failed:',e.message)}}if(updateTimer)clearTimeout(updateTimer);updateTimer=setTimeout(run,UPDATE_INTERVAL_MS)}catch(e){console.log('Schoology update check deferred:',e.message);if(updateTimer)clearTimeout(updateTimer);updateTimer=setTimeout(run,UPDATE_RETRY_MS)}};const st=readUpdateState();const due=!st.lastSuccessfulCheck||Date.now()-st.lastSuccessfulCheck>=UPDATE_INTERVAL_MS;setTimeout(()=>{if(due)run();else updateTimer=setTimeout(run,Math.max(1000,UPDATE_INTERVAL_MS-(Date.now()-st.lastSuccessfulCheck)))},8000)}

function create(){
  const appIcon=path.join(__dirname,'../assets/ic_launcher_256.png');
  const overlay=windowChromeOverlayEnabled();
  const titlebarOptions=process.platform==='darwin'
    ? (overlay ? {titleBarStyle:'hidden',titleBarOverlay:{color:'#002137',symbolColor:'#ffffff',height:56}} : {})
    : (overlay ? {titleBarStyle:'hidden',titleBarOverlay:{color:'#002137',symbolColor:'#ffffff',height:56}} : {});
  win=new BrowserWindow({show:false,backgroundColor:'#002137',icon:appIcon,...titlebarOptions,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,webviewTag:true,media:true}});
  win.removeMenu();
  win.webContents.setUserAgent(CLIENT_UA+'; Android 14; Pixel 8');
  win.webContents.on('did-fail-load',(_,code,desc)=>console.error('Schoology renderer failed to load:',code,desc));
  win.webContents.on('render-process-gone',(_,details)=>console.error('Schoology renderer process gone:',details));
  win.webContents.on('console-message',(_,level,message,line,source)=>console.log('Renderer:',message,'at',source+':'+line));
  win.webContents.on('did-navigate',(_,url)=>console.log('Schoology navigated to:',url));
  win.webContents.on('did-navigate-in-page',(_,url)=>console.log('Schoology in-page navigation:',url));
  win.webContents.on('did-finish-load',()=>{if(pendingSchoologyDeepLink){const url=pendingSchoologyDeepLink;pendingSchoologyDeepLink=null;deliverSchoologyDeepLink(url)}});
  win.webContents.on('did-attach-webview',(_event,guest)=>{
    attachedGuestWebContents.add(guest);
    const applyGuestTheme=()=>styleAttachedGuest(guest);
    applyGuestTheme();
    guest.on('dom-ready',applyGuestTheme);
    guest.once('destroyed',()=>attachedGuestWebContents.delete(guest));
  });
  win.once('ready-to-show',()=>{try{if(overlay)win.setTitleBarOverlay?.({color:'#002137',symbolColor:'#ffffff',height:56})}catch{};win.show();});
  win.loadFile(path.join(__dirname,'index.html')).catch(e=>console.error('Failed to load Schoology UI:',e));
}
app.whenReady().then(()=>{
  if(!hasSingleInstanceLock)return;
  try{app.setAsDefaultProtocolClient('schoology')}catch(e){console.error('Could not register Schoology URL protocol:',e.message)}
  require('electron').nativeTheme.on('updated',()=>{if(readThemeMode()==='system'&&readThemeSettings().experimentalForceDark&&isExperimentalForceDarkActive()!==forceDarkAtLaunch){app.relaunch();app.exit(0)}});
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='media'||permission==='camera'||permission==='microphone'));
  session.defaultSession.setPermissionCheckHandler((_wc,permission)=>permission==='media'||permission==='camera'||permission==='microphone');
  ipcMain.handle('auth-state',()=>loadAuth());
  ipcMain.handle('get-theme-mode',()=>readThemeMode());
  ipcMain.handle('app-version',()=>app.getVersion());
  ipcMain.handle('get-open-schoology-links',()=>readAppSettings().openSchoologyLinks);
  ipcMain.handle('set-open-schoology-links',(_,enabled)=>saveOpenSchoologyLinks(enabled));
  ipcMain.handle('get-desktop-notifications',()=>readAppSettings().desktopNotifications);
  ipcMain.handle('set-desktop-notifications',(_,enabled)=>saveDesktopNotifications(enabled));
  ipcMain.handle('get-notification-sound',()=>readAppSettings().notificationSound);
  ipcMain.handle('set-notification-sound',(_,enabled)=>saveNotificationSound(enabled));
  ipcMain.handle('set-theme-mode',(_,mode)=>{const wasActive=isExperimentalForceDarkActive();const safe=saveThemeMode(mode);try{nativeTheme.themeSource=safe}catch(e){console.error('Could not update native theme source:',e.message)}for(const guest of attachedGuestWebContents)styleAttachedGuest(guest);const isActive=isExperimentalForceDarkActive(safe);lastForceDarkActive=isActive;if(readThemeSettings().experimentalForceDark&&wasActive!==isActive){app.relaunch();app.exit(0)}return safe});
  ipcMain.handle('get-experimental-force-dark',()=>readThemeSettings().experimentalForceDark);
  ipcMain.handle('set-experimental-force-dark',(_,enabled)=>{const wasActive=isExperimentalForceDarkActive();saveExperimentalForceDark(!!enabled);const isActive=isExperimentalForceDarkActive();lastForceDarkActive=isActive;if(wasActive!==isActive){app.relaunch();app.exit(0)}return !!enabled});
  ipcMain.handle('network-online',()=>require('electron').net.isOnline());
  ipcMain.handle('login-credentials',(_,x)=>authorizeCredentials(x.user,x.password,x.schoolId));
  ipcMain.handle('login-qr',(_,qr)=>authorizeQR(qr));
  ipcMain.handle('login-school-browser',(_,info)=>loginThroughSchoolBrowser(info));
  ipcMain.handle('login-external-school',(_,info)=>loginExternalSchool(info));
  ipcMain.handle('logout',async()=>{
  try{fs.unlinkSync(storeFile)}catch{}
  // Match Android CleanupTask/ApplicationUtil.b(): logout must clear the
  // WebView cookie jar, not only the persisted OAuth credentials. Otherwise
  // a stale SESS cookie can be reused by an external Microsoft SSO flow.
  try{await session.defaultSession.clearStorageData({storages:['cookies','localstorage','sessionstorage','serviceworkers','cachestorage']})}catch(e){console.error('Unable to clear Schoology web session on logout:',e)}
  try{await session.defaultSession.clearCache()}catch{}
  return true
});
  ipcMain.handle('school-search',async(_,q)=>{
    const r=await request('GET',`https://${API_HOST}/v1/login/school_search`,{query:q},{clientIdentity:true});
    if(r.status<200||r.status>=300)throw new Error('School search failed: '+r.status+' '+r.text);
    let j={};try{j=JSON.parse(r.text)}catch{throw new Error('School search returned invalid data.')}
    return Array.isArray(j.school)?j.school:[];
  });
  ipcMain.handle('api',(_,x)=>api(x.path,x.method||'GET',x.params||{},{json:!!x.json}));
  ipcMain.handle('fetch-image',(_,u)=>fetchSchoologyImage(u));
  ipcMain.handle('prepare-web-session',()=>prepareWebSession());
  ipcMain.handle('submit-assignment-file',(_,x)=>submitAssignmentFile(x));
  ipcMain.handle('submit-assignment-text',(_,x)=>submitAssignmentText(x));
  ipcMain.handle('submit-assignment-resource',(_,x)=>submitAssignmentResource(x));
  ipcMain.handle('upload-schoology-file',(_,x)=>uploadSchoologyFile(x));
  ipcMain.handle('update-assignment-grade',(_,x)=>updateAssignmentGrade(x));
  ipcMain.handle('check-for-updates',()=>checkForUpdates(true));
  ipcMain.handle('download-liquid-glass',()=>downloadLiquidGlass());
  ipcMain.handle('download-expressive',()=>downloadExpressive());
  ipcMain.handle('set-window-chrome',(_,x)=>{if(process.platform==='win32'||process.platform==='linux'){try{if(windowChromeOverlayEnabled())win?.setTitleBarOverlay?.({color:String(x?.color||'#002137'),symbolColor:String(x?.symbolColor||'#ffffff'),height:Number(x?.height||56)})}catch{}}return true});
  ipcMain.handle('get-window-chrome-mode',()=>({overlay:windowChromeOverlayEnabled(),platform:process.platform}));
  ipcMain.handle('set-window-chrome-mode',(_,enabled)=>{saveWindowChromeOverlay(!!enabled);app.relaunch();app.exit(0);return true});
  ipcMain.handle('install-update',(_,file)=>installUpdate(file));
  ipcMain.handle('download-file',(event,x)=>downloadAuthenticatedFile(x,event.sender));
  ipcMain.handle('launch-course-app',async(_,x)=>{
    const a=loadAuth(); if(!a)throw new Error('Not signed in');
    const sectionId=Number(x?.sectionId??x?.section_id??0);
    const appId=Number(x?.appId??x?.app_id??0);
    const rawLaunchUrl=String(x?.launchUrl||x?.href||'').trim();
    let launchUrl='',resourceApp=false;
    if(rawLaunchUrl){
      let candidate;try{candidate=new URL(rawLaunchUrl,`https://${API_HOST}`)}catch{throw new Error('Schoology returned an invalid course-app launch link.');}
      // Android passes the section app's @links.launch URL to Retrofit directly.
      if(candidate.protocol!=='https:'||candidate.hostname.toLowerCase()!==API_HOST||!/^\/v2\/sections\/\d+\/applications\/\d+\/launch\/?$/i.test(candidate.pathname))throw new Error('Schoology returned an unsupported course-app launch link.');
      launchUrl=candidate.toString();
    }else if(Number.isSafeInteger(sectionId)&&sectionId>0&&Number.isSafeInteger(appId)&&appId>0){
      launchUrl=`https://${API_HOST}/v2/sections/${sectionId}/applications/${appId}/launch`;
    }else if(Number.isSafeInteger(appId)&&appId>0){
      // The Resources > Apps screen uses the distinct Resource Apps endpoint.
      launchUrl=`https://${API_HOST}/v2/resources/applications/${appId}/launch`;resourceApp=true;
    }else throw new Error('The course app did not provide a valid launch link.');
    const r=await request('GET',launchUrl,{}, {sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret});
    if(r.status<200||r.status>=300)throw new Error(`${resourceApp?'Resource app':'Course app'} launch failed (HTTP ${r.status}): ${r.text}`);
    let j={};try{j=JSON.parse(r.text)}catch{throw new Error(`Schoology returned an invalid ${resourceApp?'resource-app':'course-app'} launch response.`)}
    return j;
  });
  ipcMain.handle('open-downloaded-file',(_,x)=>shell.openPath(String(x?.path||'')));
  ipcMain.handle('open-external',(_,u)=>shell.openExternal(u));
  ipcMain.handle('pick-file',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile']});return r.canceled?null:r.filePaths[0]});
  create();
  scheduleUpdateChecks();
  scheduleSchoologyNotifications();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});