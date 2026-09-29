const {app,BrowserWindow,session,ipcMain,shell,dialog}=require('electron');
const path=require('path');
const crypto=require('crypto');
const fs=require('fs');
const https=require('https');
const querystring=require('querystring');

// Match the Android app's public identity/version as closely as Electron allows.
const ANDROID_WEBVIEW_UA='Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 Schoology Android v2025.04.0';
const CLIENT_UA=ANDROID_WEBVIEW_UA;
const API_HOST='api.schoology.com';
const WEB_HOST='app.schoology.com';
const CONSUMER_KEY='89b659ae6f6631f10b0bd7a513aab9fb04bfb014f';
const CONSUMER_SECRET='7ab6b83e0c89bec71010582da6e82ed9';
const ANDROID_OKHTTP_UA='okhttp/4.8.0';
const MOBILE_COOKIE='s_mobile=03447c0175ac0c7299a5508fde9569fc';
const storeFile=path.join(app.getPath('userData'),'auth.json');
let win;
let serverTimeOffset=0;

function loadAuth(){try{return JSON.parse(fs.readFileSync(storeFile,'utf8'))}catch{return null}}
function saveAuth(v){fs.mkdirSync(path.dirname(storeFile),{recursive:true});fs.writeFileSync(storeFile,JSON.stringify(v,null,2),'utf8')}
function enc(v){return encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}
function parseBody(s){return Object.fromEntries(String(s||'').split('&').filter(Boolean).map(x=>{const i=x.indexOf('=');const k=i<0?x:x.slice(0,i);const v=i<0?'':x.slice(i+1);return [decodeURIComponent(k.replace(/\+/g,' ')),decodeURIComponent(v.replace(/\+/g,' '))]}))}
function oauthTimestamp(){return Math.floor(Date.now()/1000)+serverTimeOffset}
function sortedOAuthBaseParams(method,url,oauth,extra=[]){
  const u=new URL(url);
  const pairs=[];
  for(const [k,v] of new URLSearchParams(u.search)) pairs.push([k,v]);
  for(const [k,v] of Object.entries(oauth)) pairs.push([k,String(v)]);
  for(const [k,v] of extra) pairs.push([k,String(v)]);
  pairs.sort((a,b)=>{const ak=enc(a[0]),bk=enc(b[0]);if(ak!==bk)return ak<bk?-1:1;const av=enc(a[1]),bv=enc(b[1]);return av< bv?-1:av>bv?1:0});
  return pairs.map(([k,v])=>enc(k)+'='+enc(v)).join('&');
}
function oauthHeader(method,url,tokenSecret='',qrData=''){
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:crypto.randomBytes(12).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(oauthTimestamp()),oauth_version:'1.0'};
  const token=arguments.length>2 && tokenSecret!==null ? tokenSecret : '';
  if(token) oauth.oauth_token=arguments.length>2 ? (arguments[5]||'') : '';
  // Caller supplies the token separately below; keeping this helper explicit avoids
  // accidentally signing the POST body as OAuth headers.
  return oauth;
}
function makeOAuthHeader(method,url,authToken,authSecret,qrData=''){
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:crypto.randomBytes(12).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(oauthTimestamp()),oauth_version:'1.0'};
  if(authToken) oauth.oauth_token=authToken;
  const extra=qrData?[['scanned_qr_data',qrData]]:[];
  const normalized=sortedOAuthBaseParams(method,url,oauth,extra);
  const u=new URL(url);
  const base=method.toUpperCase()+'&'+enc(u.origin+u.pathname)+'&'+enc(normalized);
  const key=enc(CONSUMER_SECRET)+'&'+enc(authSecret||'');
  oauth.oauth_signature=crypto.createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth '+Object.entries(oauth).map(([k,v])=>k+'="'+enc(v)+'"').join(', ');
}
function request(method,url,body={},opts={}){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const isGet=method.toUpperCase()==='GET';
    if(isGet){for(const [k,v] of Object.entries(body||{}))u.searchParams.set(k,String(v))}
    const data=!isGet?querystring.stringify(body||{}):'';
    const headers={
      'User-Agent':ANDROID_OKHTTP_UA,
      'Accept':'application/json'
    };
    if(opts.clientIdentity) {
      headers['X-Schoology-Client']='Android';
      headers['X-Schoology-App-Version']='2025.04.0';
    }
    if(opts.headers) Object.assign(headers,opts.headers);
    if(opts.sign){headers.Authorization=makeOAuthHeader(method,u.toString(),opts.authToken||'',opts.tokenSecret||'',opts.qr||'');headers.Cookie=MOBILE_COOKIE;}
    if(!isGet){headers['Content-Type']='application/x-www-form-urlencoded';headers['Content-Length']=Buffer.byteLength(data)}
    const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method,headers},r=>{
      let out='';r.setEncoding('utf8');r.on('data',c=>out+=c);r.on('end',()=>resolve({status:r.statusCode||0,headers:r.headers,text:out}))
    });
    req.setTimeout(20000,()=>req.destroy(new Error('Schoology request timed out')));
    req.on('error',reject);if(data)req.write(data);req.end();
  });
}
async function syncServerTime(){
  const r=await request('GET',`https://${WEB_HOST}/oauth/timestamp`);
  if(r.status>=200&&r.status<300){const t=parseInt(r.text.trim(),10);if(Number.isFinite(t))serverTimeOffset=t-Math.floor(Date.now()/1000)}
}
async function getRequestToken(){
  const r=await request('GET',`https://${API_HOST}/v1/oauth/request_token`,{}, {sign:true,clientIdentity:true});
  if(r.status<200||r.status>=300)throw new Error('Request token failed: '+r.status+' '+r.text);
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
  const r=await request('POST',`https://${WEB_HOST}/oauth/qr_code_authorize_auto`,body,{sign:true,clientIdentity:true,authToken:t.oauth_token,tokenSecret:t.oauth_token_secret,qr});
  if(r.status<200||r.status>=300)throw new Error('QR authorization failed: '+r.status+' '+r.text);
  return exchangeToken(t);
}
async function exchangeToken(t){
  const r=await request('GET',`https://${API_HOST}/v1/oauth/access_token`,{}, {sign:true,clientIdentity:true,authToken:t.oauth_token,tokenSecret:t.oauth_token_secret});
  if(r.status<200||r.status>=300)throw new Error('Access token failed: '+r.status+' '+r.text);
  const x=parseBody(r.text);if(!x.oauth_token||!x.oauth_token_secret)throw new Error('Schoology returned an invalid access token.');
  const auth={oauth_token:x.oauth_token,oauth_token_secret:x.oauth_token_secret,createdAt:Date.now()};saveAuth(auth);return auth;
}
async function api(pathname,method='GET',params={}){
  const a=loadAuth();if(!a)throw new Error('Not signed in');
  const url=`https://${API_HOST}/v1/${pathname.replace(/^\//,'')}`;
  const r=await request(method,url,params,{sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret});
  if(r.status===401||r.status===403)throw new Error('Schoology session expired');
  if(r.status<200||r.status>=300)throw new Error('Schoology API '+r.status+': '+r.text);
  try{return JSON.parse(r.text)}catch{return r.text}
}
function buildAndroidOAuthLoginUrl(domain,requestToken){
  const host=String(domain||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!host) throw new Error('This school did not provide a valid domain.');
  // This mirrors LoginOAuthManagementActivity.R0() from the Android source.
  const callback=`https://${host}/mobile_login_success?os=android&os_version=34&app_version=600000472`;
  const oauthPath=`oauth/authorize?oauth_token=${encodeURIComponent(requestToken)}&oauth_callback=${encodeURIComponent(callback)}`;
  return `https://${host}/${oauthPath}&login_landing_dest=${encodeURIComponent(oauthPath)}`;
}
async function loginThroughSchoolBrowser(info){
  if(!info||!info.domain)throw new Error('This school did not provide a login domain.');
  await syncServerTime().catch(()=>{});
  const requestCredential=await getRequestToken();
  const loginUrl=buildAndroidOAuthLoginUrl(info.domain,requestCredential.oauth_token);
  return new Promise((resolve,reject)=>{
    let child=null,settled=false;
    const finish=(err,value)=>{
      if(settled)return;
      settled=true;
      if(child&&!child.isDestroyed())child.close();
      err?reject(err):resolve(value);
    };
    const callbackMatches=(url)=>{
      try{
        const u=new URL(url);
        if(!/\/mobile_login_success$/.test(u.pathname))return false;
        return u.searchParams.get('request_token')===requestCredential.oauth_token;
      }catch{return false}
    };
    const handleNavigation=(event,url)=>{
      if(!callbackMatches(url))return;
      event.preventDefault();
      exchangeToken(requestCredential).then(auth=>finish(null,auth)).catch(finish);
    };
    child=new BrowserWindow({width:1100,height:800,modal:true,parent:win,show:true,autoHideMenuBar:true,backgroundColor:'#ffffff',webPreferences:{contextIsolation:true,nodeIntegration:false,javascript:true,webSecurity:true,session:session.defaultSession}});
    // Android SchoologyWebView appends its identity to the normal Android WebView UA.
    child.webContents.setUserAgent(ANDROID_WEBVIEW_UA);
    child.webContents.on('will-navigate',handleNavigation);
    child.webContents.on('will-redirect',handleNavigation);
    child.webContents.on('did-fail-load',(_,code,desc)=>console.error('School login browser failed:',code,desc));
    child.webContents.on('console-message',(_,level,message,line,source)=>console.log('School login browser:',message,'at',source+':'+line));
    child.on('closed',()=>{if(!settled)reject(new Error('School login window was closed.'))});
    child.loadURL(loginUrl).catch(e=>finish(e));
  });
}

async function loginExternalSchool(info){
  if(!info||!info.url)throw new Error('This school did not provide a login URL.');
  const rawUrl=String(info.url);
  const parsed=new URL(rawUrl);
  const host=parsed.host;
  const base=`${parsed.protocol}//${host}`;
  const schoolDomain=String(info.domain||host).replace(/^https?:\/\//,'').replace(/\/$/,'');
  return new Promise((resolve,reject)=>{
    let child=null,settled=false,poll=null;
    const finish=(err,value)=>{
      if(settled)return;
      settled=true;
      if(poll)clearInterval(poll);
      if(child&&!child.isDestroyed())child.close();
      err?reject(err):resolve(value);
    };
    const domainMatches=(url)=>{
      try{
        const h=new URL(url).hostname;
        return h===host.split(':')[0] || h.endsWith('.'+host.split(':')[0]) ||
          h===schoolDomain.split(':')[0] || h.endsWith('.'+schoolDomain.split(':')[0]);
      }catch{return false}
    };
    const checkSession=async()=>{
      try{
        const cookies=await session.defaultSession.cookies.get({});
        const c=cookies.find(x=>/^SESS/i.test(x.name) &&
          (domainMatches(`${x.secure?'https':'http'}://${x.domain.replace(/^\\./,'')}/`) || x.domain.replace(/^\\./,'')===host.split(':')[0]));
        if(!c)return;
        const cookie=`${c.name}=${c.value}`;
        const t=await getRequestToken();
        // This is the Android ExternalSessionLoginFlow / SessionAuthorizer:
        // POST oauth_token to /oauth/authorize_auto with the SESS cookie.
        const r=await request('POST',`${base}/oauth/authorize_auto`,{oauth_token:t.oauth_token},{
          clientIdentity:true,
          headers:{Cookie:cookie}
        });
        if(r.status<200||r.status>=300)throw new Error('School session authorization failed: '+r.status+' '+r.text);
        const auth=await exchangeToken(t);
        finish(null,auth);
      }catch(e){finish(e)}
    };
    child=new BrowserWindow({
      width:1100,height:800,modal:true,parent:win,show:true,autoHideMenuBar:true,
      backgroundColor:'#ffffff',
      webPreferences:{contextIsolation:true,nodeIntegration:false,javascript:true,webSecurity:true,session:session.defaultSession}
    });
    child.webContents.setUserAgent(ANDROID_WEBVIEW_UA);
    child.webContents.on('did-navigate',()=>checkSession());
    child.webContents.on('did-navigate-in-page',()=>checkSession());
    child.webContents.on('will-redirect',()=>setTimeout(checkSession,100));
    child.webContents.on('did-fail-load',(_,code,desc)=>console.error('School external login failed:',code,desc));
    child.on('closed',()=>{if(!settled)finish(new Error('School login window was closed.'))});
    poll=setInterval(checkSession,750);
    child.loadURL(rawUrl).catch(finish);
  });
}

function create(){
  win=new BrowserWindow({width:430,height:850,minWidth:360,minHeight:650,show:false,backgroundColor:'#22303e',icon:path.join(__dirname,'../assets/ic_launcher_256.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,webviewTag:true,media:true}});
  win.removeMenu();
  win.webContents.setUserAgent(CLIENT_UA+'; Android 14; Pixel 8');
  win.webContents.on('did-fail-load',(_,code,desc)=>console.error('Schoology renderer failed to load:',code,desc));
  win.webContents.on('render-process-gone',(_,details)=>console.error('Schoology renderer process gone:',details));
  win.webContents.on('console-message',(_,level,message,line,source)=>console.log('Renderer:',message,'at',source+':'+line));
  win.webContents.on('did-navigate',(_,url)=>console.log('Schoology navigated to:',url));
  win.webContents.on('did-navigate-in-page',(_,url)=>console.log('Schoology in-page navigation:',url));
  win.once('ready-to-show',()=>{win.show();});
  win.loadFile(path.join(__dirname,'index.html')).catch(e=>console.error('Failed to load Schoology UI:',e));
}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='media'||permission==='camera'||permission==='microphone'));
  session.defaultSession.setPermissionCheckHandler((_wc,permission)=>permission==='media'||permission==='camera'||permission==='microphone');
  session.defaultSession.setUserAgent(CLIENT_UA+'; Android 14; Pixel 8');
  ipcMain.handle('auth-state',()=>loadAuth());
  ipcMain.handle('login-credentials',(_,x)=>authorizeCredentials(x.user,x.password,x.schoolId));
  ipcMain.handle('login-qr',(_,qr)=>authorizeQR(qr));
  ipcMain.handle('login-school-browser',(_,info)=>loginThroughSchoolBrowser(info));
  ipcMain.handle('login-external-school',(_,info)=>loginExternalSchool(info));
  ipcMain.handle('logout',()=>{try{fs.unlinkSync(storeFile)}catch{};return true});
  ipcMain.handle('school-search',async(_,q)=>{
    const r=await request('GET',`https://${API_HOST}/v1/login/school_search`,{query:q},{clientIdentity:true});
    if(r.status<200||r.status>=300)throw new Error('School search failed: '+r.status+' '+r.text);
    let j={};try{j=JSON.parse(r.text)}catch{throw new Error('School search returned invalid data.')}
    return Array.isArray(j.school)?j.school:[];
  });
  ipcMain.handle('api',(_,x)=>api(x.path,x.method||'GET',x.params||{}));
  ipcMain.handle('open-external',(_,u)=>shell.openExternal(u));
  ipcMain.handle('pick-file',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile']});return r.canceled?null:r.filePaths[0]});
  create();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
