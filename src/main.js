const {app,BrowserWindow,session,ipcMain,shell,dialog}=require('electron');
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
const storeFile=path.join(app.getPath('userData'),'auth.json');
let win;
let serverTimeOffset=0;

function loadAuth(){try{return JSON.parse(fs.readFileSync(storeFile,'utf8'))}catch{return null}}
function saveAuth(v){fs.mkdirSync(path.dirname(storeFile),{recursive:true});fs.writeFileSync(storeFile,JSON.stringify(v,null,2),'utf8')}
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
function makeOAuthHeader(method,url,authToken,authSecret,qrData=''){
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:crypto.randomBytes(8).readBigUInt64BE(0).toString(16),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(oauthTimestamp()),oauth_version:'1.0'};
  // Android OAuthRequestSigner always includes oauth_token; for the initial
  // request-token request its value is explicitly the empty string.
  oauth.oauth_token=authToken==null?'':String(authToken);
  const extra=qrData?[['scanned_qr_data',qrData]]:[];
  const normalized=sortedOAuthBaseParams(method,url,oauth,extra);
  const u=new URL(url);
  const base=method.toUpperCase()+'&'+enc(u.protocol+'//'+u.host+u.pathname)+'&'+enc(normalized);
  const key=enc(CONSUMER_SECRET)+'&'+enc(authSecret||'');
  oauth.oauth_signature=crypto.createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth '+['oauth_consumer_key','oauth_token','oauth_nonce','oauth_timestamp','oauth_signature_method','oauth_version'].map(k=>k+'="'+String(oauth[k])+'"').join(', ')+', oauth_signature="'+enc(oauth.oauth_signature)+'"';
}
function request(method,url,body={},opts={},redirectDepth=0){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const isGet=method.toUpperCase()==='GET';
    if(isGet){for(const [k,v] of Object.entries(body||{}))u.searchParams.set(k,String(v))}
    const data=!isGet?querystring.stringify(body||{}):'';
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
      headers.Authorization=makeOAuthHeader(method,u.toString(),opts.authToken||'',opts.tokenSecret||'',opts.qr||'');
      headers.Cookie=MOBILE_COOKIE;
    }
    if(!isGet){headers['Content-Type']='application/x-www-form-urlencoded';headers['Content-Length']=Buffer.byteLength(data)}
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
    req.setTimeout(20000,()=>req.destroy(new Error('Schoology request timed out')));
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
  const r=await request('POST',`https://${WEB_HOST}/oauth/qr_code_authorize_auto`,body,{sign:true,clientIdentity:true,authToken:t.oauth_token,tokenSecret:t.oauth_token_secret,qr});
  if(r.status<200||r.status>=300)throw new Error('QR authorization failed: '+r.status+' '+r.text);
  return exchangeToken(t);
}
async function exchangeToken(t){
  const r=await request('GET',`https://${API_HOST}/v1/oauth/access_token`,{}, {sign:true,clientIdentity:true,authToken:t.oauth_token,tokenSecret:t.oauth_token_secret});
  if(r.status<200||r.status>=300)throw new Error('Access token failed: '+r.status+' '+r.text);
  const x=parseBody(r.text);if(!x.oauth_token||!x.oauth_token_secret)throw new Error('Schoology returned an invalid access token.');
  const auth={oauth_token:x.oauth_token,oauth_token_secret:x.oauth_token_secret,createdAt:Date.now()};
  // Android's AbstractLoginFlow immediately resolves the current User and
  // stores ACCOUNT_USERID before MenuActivity/HomePagerFragment is shown.
  try{
    const userResp=await request('GET',`https://${API_HOST}/v1/users/me`,{}, {sign:true,clientIdentity:true,authToken:x.oauth_token,tokenSecret:x.oauth_token_secret});
    if(userResp.status>=200&&userResp.status<300){
      const user=JSON.parse(userResp.text);
      if(user && user.id!=null) auth.userId=Number(user.id);
      auth.user=user;
    }
  }catch(_e){}
  saveAuth(auth);return auth;
}
async function api(pathname,method='GET',params={}){
  const a=loadAuth();if(!a)throw new Error('Not signed in');
  const clean=String(pathname||'').replace(/^\//,'');
  const version=clean.startsWith('v2/')?'v2':'v1';
  const resource=clean.startsWith('v2/')?clean.slice(3):clean;
  const url=`https://${API_HOST}/${version}/${resource}`;
  const r=await request(method,url,params,{sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret});
  if(r.status===401)throw new Error('Schoology session expired (HTTP 401)');
  if(r.status===403)throw new Error('Schoology denied this request (HTTP 403)');
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
      const initial=u.searchParams.has('sgyInitialPage');
      return initial || hostMatchesSuffix(u.hostname,expectedHost) || hostMatchesSuffix(u.hostname,defaultDomain);
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
    child.webContents.on('did-fail-load',(_,code,desc)=>console.error('School external login failed:',code,desc));
    child.webContents.on('console-message',(_,level,message,line,source)=>console.log('School external login:',message,'at',source+':'+line));
    child.on('closed',()=>{if(!settled)finish(new Error('School login window was closed.'))});
    child.loadURL(rawUrl).catch(e=>finish(e));
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
