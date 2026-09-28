const { app, BrowserWindow, ipcMain, shell, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const APP_VERSION = '2025.04.0';
const ANDROID_UA = `Mozilla/5.0 (Linux; Android 14; SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 Schoology Android v${APP_VERSION}`;
const API_HOST = 'api.schoology.com';
const WEB_HOST = 'app.schoology.com';
const CONSUMER_KEY = process.env.SCHOOLOGY_CONSUMER_KEY || '998121f221d5dc0f4956ee6946d27d5e04e55635e';
const CONSUMER_SECRET = process.env.SCHOOLOGY_CONSUMER_SECRET || '5cff9d3780d64695d762ba8e05a34e9e';
const STORE = path.join(app.getPath('userData'), 'schoology-account.json');
let win, loginWin;
function saveAccount(a){fs.mkdirSync(path.dirname(STORE),{recursive:true});fs.writeFileSync(STORE,JSON.stringify(a,null,2));}
function loadAccount(){try{return JSON.parse(fs.readFileSync(STORE,'utf8'));}catch{return null;}}
function nonce(){return crypto.randomBytes(16).toString('hex');}
function enc(s){return encodeURIComponent(String(s)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}
function normalizedParams(p){return Object.keys(p).sort().map(k=>`${enc(k)}=${enc(p[k])}`).join('&');}
function oauthHeader(method,url,extra={},tokenSecret=''){
 const base=Object.assign({oauth_consumer_key:CONSUMER_KEY,oauth_nonce:nonce(),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:Math.floor(Date.now()/1000),oauth_version:'1.0'},extra);
 const u=new URL(url), all={}; u.searchParams.forEach((v,k)=>all[k]=v); Object.assign(all,base);
 const baseUrl=`${u.protocol}//${u.host}${u.pathname}`;
 const signing=`${method.toUpperCase()}&${enc(baseUrl)}&${enc(normalizedParams(all))}`;
 base.oauth_signature=crypto.createHmac('sha1',`${enc(CONSUMER_SECRET)}&${enc(tokenSecret)}`).update(signing).digest('base64');
 return 'OAuth '+Object.keys(base).filter(k=>k.startsWith('oauth_')).sort().map(k=>`${enc(k)}="${enc(base[k])}"`).join(', ');
}
async function oauthRequestToken(){const url=`https://${API_HOST}/v1/oauth/request_token`;const r=await fetch(url,{method:'POST',headers:{Authorization:oauthHeader('POST',url,{oauth_callback:'oob'}),'User-Agent':ANDROID_UA,'X-Schoology-Client':'Android','X-Schoology-App-Version':APP_VERSION}});const t=await r.text();if(!r.ok)throw Error(`Request token ${r.status}: ${t}`);const p=new URLSearchParams(t);return {token:p.get('oauth_token'),secret:p.get('oauth_token_secret')};}
async function oauthAccessToken(req,verifier){const url=`https://${API_HOST}/v1/oauth/access_token`;const r=await fetch(url,{method:'POST',headers:{Authorization:oauthHeader('POST',url,{oauth_token:req.token,oauth_verifier:verifier},req.secret),'User-Agent':ANDROID_UA,'X-Schoology-Client':'Android','X-Schoology-App-Version':APP_VERSION}});const t=await r.text();if(!r.ok)throw Error(`Access token ${r.status}: ${t}`);const p=new URLSearchParams(t);return {token:p.get('oauth_token'),secret:p.get('oauth_token_secret')};}
async function api(pathname,method='GET',body){const a=loadAccount();if(!a?.token)throw Error('Not signed in');const url=`https://${API_HOST}/v1/${pathname.replace(/^\//,'')}`;const headers={'User-Agent':ANDROID_UA,'Accept':'application/json','Authorization':oauthHeader(method,url,{oauth_token:a.token},a.secret),'X-Schoology-Client':'Android','X-Schoology-App-Version':APP_VERSION};if(body)headers['Content-Type']='application/x-www-form-urlencoded';const r=await fetch(url,{method,headers,body:body?new URLSearchParams(body):undefined});const t=await r.text();if(!r.ok)throw Error(`Schoology API ${r.status}: ${t.slice(0,700)}`);try{return JSON.parse(t);}catch{return t;}}
function configureSession(ses){ses.setUserAgent(ANDROID_UA);ses.webRequest.onBeforeSendHeaders((d,cb)=>{d.requestHeaders['User-Agent']=ANDROID_UA;d.requestHeaders['X-Schoology-Client']='Android';d.requestHeaders['X-Schoology-App-Version']=APP_VERSION;cb({cancel:false,requestHeaders:d.requestHeaders});});}
function createWindow(){const partition='persist:schoology-android-port';const ses=session.fromPartition(partition);configureSession(ses);win=new BrowserWindow({width:1280,height:820,minWidth:980,minHeight:650,backgroundColor:'#f4f5f5',show:false,autoHideMenuBar:true,title:'Schoology',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,partition}});win.once('ready-to-show',()=>win.show());win.on('closed',()=>win=null);win.loadFile(path.join(__dirname,'index.html'));}
function createLoginWindow(url){if(loginWin&&!loginWin.isDestroyed()){loginWin.focus();loginWin.loadURL(url);return;}const ses=session.fromPartition('persist:schoology-login');configureSession(ses);loginWin=new BrowserWindow({parent:win,width:520,height:760,minWidth:420,minHeight:600,modal:true,autoHideMenuBar:true,title:'Sign in to Schoology',webPreferences:{contextIsolation:true,nodeIntegration:false,partition:'persist:schoology-login'}});loginWin.loadURL(url);loginWin.on('closed',()=>loginWin=null);}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(!win)createWindow();});});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
ipcMain.handle('account:get',()=>loadAccount());
ipcMain.handle('oauth:start',async()=>{const req=await oauthRequestToken();const url=`https://${WEB_HOST}/oauth/authorize?oauth_token=${encodeURIComponent(req.token)}&oauth_callback=oob`;createLoginWindow(url);return req;});
ipcMain.handle('oauth:finish',async(_,req,v)=>{const tok=await oauthAccessToken(req,v);saveAccount(tok);if(loginWin&&!loginWin.isDestroyed())loginWin.close();return tok;});
ipcMain.handle('account:logout',async()=>{try{fs.unlinkSync(STORE);}catch{};try{await session.fromPartition('persist:schoology-android-port').clearStorageData();}catch{};return true;});
ipcMain.handle('api',(_,p,m,b)=>api(p,m,b));
ipcMain.handle('open:external',(_,u)=>shell.openExternal(u));
ipcMain.handle('file:open',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});return r.canceled?[]:r.filePaths;});
ipcMain.handle('file:save',async(_,suggested)=>{const r=await dialog.showSaveDialog(win,{defaultPath:suggested||'download'});return r.canceled?null:r.filePath;});
ipcMain.handle('deep-link',(_,url)=>{try{const u=new URL(url);return {host:u.host,path:u.pathname,query:Object.fromEntries(u.searchParams)};}catch{return null;}});
