const {app,BrowserWindow,session,ipcMain,shell,dialog}=require('electron');
const path=require('path');
const crypto=require('crypto');
const fs=require('fs');
const https=require('https');
const querystring=require('querystring');

// Match the Android app's public identity/version as closely as Electron allows.
const CLIENT_UA='Schoology Android v2025.04.0';
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
function create(){
  win=new BrowserWindow({width:430,height:850,minWidth:360,minHeight:650,show:false,backgroundColor:'#22303e',icon:path.join(__dirname,'../assets/ic_launcher_256.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,webviewTag:true,media:true}});
  win.removeMenu();
  win.webContents.setUserAgent(CLIENT_UA+'; Android 14; Pixel 8');
  win.webContents.on('did-fail-load',(_,code,desc)=>console.error('Schoology renderer failed to load:',code,desc));
  win.webContents.on('render-process-gone',(_,details)=>console.error('Schoology renderer process gone:',details));
  win.webContents.on('console-message',(_,level,message,line,source)=>console.log('Renderer:',message,'at',source+':'+line));
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
