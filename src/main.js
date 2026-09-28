const { app, BrowserWindow, ipcMain, shell, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Schoology Android v2025.04.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 Schoology Android v2025.04.0';
const API_HOST = 'api.schoology.com';
const WEB_HOST = 'app.schoology.com';
// Values recovered from the supplied Android decompile's LIVE ServerConfig.
const CONSUMER_KEY = process.env.SCHOOLOGY_CONSUMER_KEY || '998121f221d5dc0f4956ee6946d27d5e04e55635e';
const CONSUMER_SECRET = process.env.SCHOOLOGY_CONSUMER_SECRET || '5cff9d3780d64695d762ba8e05a34e9e';
const STORE = path.join(app.getPath('userData'), 'schoology-account.json');
let win;

function saveAccount(account) { fs.writeFileSync(STORE, JSON.stringify(account, null, 2), 'utf8'); }
function loadAccount() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return null; } }
function nonce() { return crypto.randomBytes(16).toString('hex'); }
function enc(s) { return encodeURIComponent(String(s)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function normalizedParams(params) { return Object.keys(params).sort().map(k => `${enc(k)}=${enc(params[k])}`).join('&'); }
function oauthHeader(method, url, extra, tokenSecret='') {
  const base = Object.assign({ oauth_consumer_key: CONSUMER_KEY, oauth_nonce: nonce(), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now()/1000), oauth_version: '1.0' }, extra || {});
  const u = new URL(url); const all = {};
  u.searchParams.forEach((v,k)=>all[k]=v); Object.keys(base).forEach(k=>all[k]=base[k]);
  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
  const signing = `${method.toUpperCase()}&${enc(baseUrl)}&${enc(normalizedParams(all))}`;
  base.oauth_signature = crypto.createHmac('sha1', `${enc(CONSUMER_SECRET)}&${enc(tokenSecret)}`).update(signing).digest('base64');
  return 'OAuth ' + Object.keys(base).filter(k=>k.startsWith('oauth_')).sort().map(k=>`${enc(k)}="${enc(base[k])}"`).join(', ');
}
async function oauthRequestToken() {
  const url = `https://${API_HOST}/v1/oauth/request_token`;
  const r = await fetch(url, { method:'POST', headers:{Authorization:oauthHeader('POST',url,{oauth_callback:'oob'}), 'User-Agent':ANDROID_UA} });
  const text = await r.text(); if (!r.ok) throw new Error(`Request token ${r.status}: ${text}`);
  const p = new URLSearchParams(text); return { token:p.get('oauth_token'), secret:p.get('oauth_token_secret') };
}
async function oauthAccessToken(request, verifier) {
  const url = `https://${API_HOST}/v1/oauth/access_token`;
  const r = await fetch(url,{method:'POST',headers:{Authorization:oauthHeader('POST',url,{oauth_token:request.token,oauth_verifier:verifier},request.secret),'User-Agent':ANDROID_UA}});
  const text=await r.text(); if(!r.ok) throw new Error(`Access token ${r.status}: ${text}`);
  const p=new URLSearchParams(text); return {token:p.get('oauth_token'),secret:p.get('oauth_token_secret')};
}
async function api(pathname, method='GET', body) {
  const account=loadAccount(); if(!account?.token) throw new Error('Not signed in');
  const url=`https://${API_HOST}/v1/${pathname.replace(/^\//,'')}`;
  const headers={'User-Agent':ANDROID_UA,'Accept':'application/json','Authorization':oauthHeader(method,url,{oauth_token:account.token},account.secret)};
  if(body){headers['Content-Type']='application/x-www-form-urlencoded';}
  const r=await fetch(url,{method,headers,body:body?new URLSearchParams(body):undefined});
  const t=await r.text(); if(!r.ok) throw new Error(`Schoology API ${r.status}: ${t.slice(0,500)}`);
  try{return JSON.parse(t)}catch{return t;}
}

function createWindow(){
  const partition='persist:schoology-android-port';
  const ses=session.fromPartition(partition);
  ses.setUserAgent(ANDROID_UA);
  ses.webRequest.onBeforeSendHeaders((details, cb)=>{ details.requestHeaders['User-Agent']=ANDROID_UA; details.requestHeaders['X-Schoology-Client']='Android'; details.requestHeaders['X-Schoology-App-Version']='2025.04.0'; cb({cancel:false,requestHeaders:details.requestHeaders}); });
  win=new BrowserWindow({width:1280,height:820,minWidth:980,minHeight:650,backgroundColor:'#f4f5f5',show:false,autoHideMenuBar:true,title:'Schoology',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,partition}});
  win.once('ready-to-show',()=>win.show());
  win.on('closed',()=>win=null);
  win.loadFile(path.join(__dirname,'index.html'));
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(!win)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

ipcMain.handle('account:get',()=>loadAccount());
ipcMain.handle('oauth:start',async()=>{
  const req=await oauthRequestToken();
  const url=`https://${WEB_HOST}/oauth/authorize?oauth_token=${encodeURIComponent(req.token)}&oauth_callback=oob`;
  await shell.openExternal(url);
  return req;
});
ipcMain.handle('oauth:finish',async(_,req,verifier)=>{const tok=await oauthAccessToken(req,verifier);saveAccount(tok);return tok;});
ipcMain.handle('account:logout',()=>{try{fs.unlinkSync(STORE)}catch{};return true;});
ipcMain.handle('api',(_,pathname,method,body)=>api(pathname,method,body));
ipcMain.handle('open:external',(_,url)=>shell.openExternal(url));
ipcMain.handle('file:open',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});return r.canceled?[]:r.filePaths;});
ipcMain.handle('file:save',async(_,suggested)=>{const r=await dialog.showSaveDialog(win,{defaultPath:suggested||'download'});return r.canceled?null:r.filePath;});
