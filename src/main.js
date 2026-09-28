const {app,BrowserWindow,session,ipcMain,shell,dialog}=require('electron');
const path=require('path');
const crypto=require('crypto');
const fs=require('fs');
const https=require('https');
const querystring=require('querystring');
const CLIENT_UA='Schoology Android v2025.04.0';
const API_HOST='api.schoology.com';
const WEB_HOST='app.schoology.com';
const CONSUMER_KEY='89b659ae6f6631f10b0bd7a513aab9fb04bfb014f';
const CONSUMER_SECRET='7ab6b83e0c89bec71010582da6e82ed9';
const storeFile=path.join(app.getPath('userData'),'auth.json');
let win;
function loadAuth(){try{return JSON.parse(fs.readFileSync(storeFile,'utf8'))}catch{return null}}
function saveAuth(v){fs.mkdirSync(path.dirname(storeFile),{recursive:true});fs.writeFileSync(storeFile,JSON.stringify(v,null,2),'utf8')}
function enc(v){return encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}
function parseBody(s){return Object.fromEntries(s.split('&').filter(Boolean).map(x=>{let i=x.indexOf('=');return [decodeURIComponent(x.slice(0,i)),decodeURIComponent((x.slice(i+1)||'').replace(/\+/g,' '))]}))}
function oauthHeader(method,url,params,tokenSecret='',qr=''){
  const u=new URL(url), all=[]; for(const [k,v] of Object.entries(params||{})) all.push([k,String(v)]);
  const nonce=crypto.randomBytes(12).toString('hex'), ts=Math.floor(Date.now()/1000).toString();
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:nonce,oauth_signature_method:'HMAC-SHA1',oauth_timestamp:ts,oauth_version:'1.0'};
  if(params.oauth_token) delete params.oauth_token;
  const combined=[...all,...Object.entries(oauth)].sort((a,b)=>a[0]===b[0]?enc(a[1]).localeCompare(enc(b[1])):enc(a[0]).localeCompare(enc(b[0])));
  const norm=combined.map(([k,v])=>enc(k)+'='+enc(v)).join('&');
  const base=method.toUpperCase()+'&'+enc(u.origin+u.pathname)+'&'+enc(norm+(qr?'&'+enc(qr):''));
  const key=enc(CONSUMER_SECRET)+'&'+enc(tokenSecret);
  oauth.oauth_signature=crypto.createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth '+Object.entries(oauth).map(([k,v])=>k+'="'+enc(v)+'"').join(', ');
}
function request(method,url,body={},opts={}){return new Promise((resolve,reject)=>{const u=new URL(url); const data=method==='POST'?querystring.stringify(body):''; const params=method==='GET'?{...body}:{}; const headers={'User-Agent':CLIENT_UA,'X-Schoology-Client':'Android','X-Schoology-App-Version':'2025.04.0','Accept':'application/json'}; if(opts.sign){headers.Authorization=oauthHeader(method,url,{...params,...(method==='POST'?{}:{} )},opts.tokenSecret||'',opts.qr||'');} if(method==='POST'){headers['Content-Type']='application/x-www-form-urlencoded';headers['Content-Length']=Buffer.byteLength(data)} const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method,headers},r=>{let out='';r.on('data',c=>out+=c);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,text:out}))});req.on('error',reject);if(data)req.write(data);req.end()})}
async function getRequestToken(){const r=await request('GET',`https://${API_HOST}/v1/oauth/request_token`,{}, {sign:true});if(r.status<200||r.status>=300)throw new Error('Request token failed: '+r.status+' '+r.text);return parseBody(r.text)}
async function authorizeCredentials(user,password,schoolId){const t=await getRequestToken();const body={user,password,oauth_token:t.oauth_token};if(schoolId)body.school_id=String(schoolId);const r=await request('POST',`https://${WEB_HOST}/oauth/authorize_auto`,body);if(r.status<200||r.status>=300)throw new Error('Schoology rejected login: '+r.status+' '+r.text);return exchangeToken(t)}
async function authorizeQR(qr){const t=await getRequestToken();const body={scanned_qr_data:qr,oauth_token:t.oauth_token};const r=await request('POST',`https://${WEB_HOST}/oauth/qr_code_authorize_auto`,body,{sign:true,tokenSecret:t.oauth_token_secret,qr});if(r.status<200||r.status>=300)throw new Error('QR authorization failed: '+r.status+' '+r.text);return exchangeToken(t)}
async function exchangeToken(t){const r=await request('GET',`https://${API_HOST}/v1/oauth/access_token`,{},{sign:true,tokenSecret:t.oauth_token_secret});if(r.status<200||r.status>=300)throw new Error('Access token failed: '+r.status+' '+r.text);const x=parseBody(r.text);const auth={oauth_token:x.oauth_token,oauth_token_secret:x.oauth_token_secret,createdAt:Date.now()};saveAuth(auth);return auth}
async function api(pathname,method='GET',params={}){const a=loadAuth();if(!a)throw new Error('Not signed in');const url=`https://${API_HOST}/v1/${pathname.replace(/^\//,'')}`;const r=await request(method,url,params,{sign:true,tokenSecret:a.oauth_token_secret});if(r.status===401||r.status===403)throw new Error('Schoology session expired');if(r.status<200||r.status>=300)throw new Error('Schoology API '+r.status+': '+r.text);try{return JSON.parse(r.text)}catch{return r.text}}
function create(){win=new BrowserWindow({width:430,height:850,minWidth:360,minHeight:650,show:false,backgroundColor:'#44505d',icon:path.join(__dirname,'../assets/ic_launcher.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,webviewTag:true,media:true}});win.removeMenu();win.once('ready-to-show',()=>win.show());win.loadFile(path.join(__dirname,'index.html'));}
app.whenReady().then(()=>{session.defaultSession.setUserAgent(CLIENT_UA+'; Android 14; Pixel 8') ;ipcMain.handle('auth-state',()=>loadAuth());ipcMain.handle('login-credentials',(_,x)=>authorizeCredentials(x.user,x.password,x.schoolId));ipcMain.handle('login-qr',(_,qr)=>authorizeQR(qr));ipcMain.handle('logout',()=>{try{fs.unlinkSync(storeFile)}catch{};return true});ipcMain.handle('school-search',async(_,q)=>{const r=await request('GET',`https://${API_HOST}/v1/login/school_search`,{query:q});if(r.status<200||r.status>=300)throw new Error('School search failed: '+r.status);let j;try{j=JSON.parse(r.text)}catch{j={}};return j.school||[]});ipcMain.handle('api',(_,x)=>api(x.path,x.method||'GET',x.params||{}));ipcMain.handle('open-external',(_,u)=>shell.openExternal(u));ipcMain.handle('pick-file',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile']});return r.canceled?null:r.filePaths[0]});create();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
