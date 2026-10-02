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
// Keep OAuth credentials in a stable per-user location across portable/unpacked/installer builds.
// Migrate the older Electron default location once so existing logins are not lost.
const legacyUserData=app.getPath('userData');
const stableUserData=path.join(app.getPath('appData'),'Schoology');
try{app.setPath('userData',stableUserData)}catch{}
const storeFile=path.join(stableUserData,'auth.json');
const legacyStoreFile=path.join(legacyUserData,'auth.json');
let win;
let serverTimeOffset=0;
const windowChromeSettingsFile=path.join(stableUserData,'window-chrome.json');
function windowChromeOverlayEnabled(){
  if(process.platform==='darwin'){try{const v=JSON.parse(fs.readFileSync(windowChromeSettingsFile,'utf8'));return v?.overlay===true}catch{};return false}
  try{const v=JSON.parse(fs.readFileSync(windowChromeSettingsFile,'utf8'));return v?.overlay!==false}catch{return true}
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
  const oauth={oauth_consumer_key:CONSUMER_KEY,oauth_nonce:crypto.randomBytes(8).readBigUInt64BE(0).toString(16),oauth_signature_method:'PLAINTEXT',oauth_timestamp:String(oauthTimestamp()),oauth_version:'1.0',oauth_token:authToken==null?'':String(authToken)};
  return 'OAuth '+['oauth_consumer_key','oauth_nonce','oauth_signature_method','oauth_timestamp','oauth_token','oauth_version'].map(k=>k+'=\"'+String(oauth[k])+'\"').join(', ')+', oauth_signature=\"'+enc(CONSUMER_SECRET+'&'+String(authSecret||''))+'\"';
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
      headers.Authorization=makeOAuthHeader(method,u.toString(),opts.authToken||'',opts.tokenSecret||'',opts.qr||'');
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

async function submitAssignmentFile(info){
  const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.sectionId||!info?.assignmentId||!info?.filePath)throw new Error('Submission information is incomplete.');
  const filePath=info.filePath, filename=path.basename(filePath), file=fs.readFileSync(filePath);
  const mimeByExt={'.pdf':'application/pdf','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.txt':'text/plain','.csv':'text/csv','.zip':'application/zip','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif'};
  const mime=mimeByExt[path.extname(filename).toLowerCase()]||'application/octet-stream';
  let fileId=null;
  try{
    const boundary='----SchoologyElectron'+crypto.randomBytes(12).toString('hex');
    const pre=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename.replace(/"/g,'')}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const post=Buffer.from(`\r\n--${boundary}--\r\n`), multipart=Buffer.concat([pre,file,post]);
    const uploadUrl=new URL(`https://${API_HOST}/v1/file`);uploadUrl.searchParams.set('name',filename);
    const headers={'User-Agent':ANDROID_OKHTTP_UA,'Accept':'application/json','Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':multipart.length,Authorization:makePlaintextOAuthHeader(a.oauth_token,a.oauth_token_secret),Cookie:MOBILE_COOKIE};
    const uploaded=await new Promise((resolve,reject)=>{const req=https.request({hostname:uploadUrl.hostname,path:uploadUrl.pathname+uploadUrl.search,method:'POST',headers},res=>{let out='';res.setEncoding('utf8');res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode||0,text:out}))});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('File upload timed out')));req.write(multipart);req.end()});
    if(uploaded.status>=200&&uploaded.status<300){try{fileId=JSON.parse(uploaded.text).fileMetadataId}catch{}}
    if(!fileId)throw new Error(`FileService ${uploaded.status}: ${uploaded.text}`);
  }catch(primaryError){
    // Android 2026.06.0 retains a legacy upload path when FileServiceApi is unavailable.
    // Reproduce that documented fallback: POST metadata to /v1/upload, then PUT bytes to /v1/upload/{id}.
    const md5=crypto.createHash('md5').update(file).digest('hex');
    const meta={upload_filename:filename,upload_file_md5:md5,upload_file_size:file.length};
    const metadataUrl=new URL(`https://${API_HOST}/v1/upload`);
    for(const [k,v] of Object.entries(meta)) metadataUrl.searchParams.set(k,String(v));
    const holder=await request('POST',metadataUrl.toString(),meta,{sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
    if(holder.status<200||holder.status>=300)throw new Error(`File upload failed: ${primaryError.message}; legacy metadata upload failed: ${holder.status} ${holder.text}`);
    let h={};try{h=JSON.parse(holder.text)}catch{}
    fileId=h.upload_file_id||h.uploadFileID||h.upload_id||h.id;
    if(!fileId)throw new Error('Schoology did not return an upload file ID.');
    const u=new URL(`https://${API_HOST}/v1/upload/${fileId}`);
    const headers={'User-Agent':ANDROID_OKHTTP_UA,'Accept':'application/json','Content-Type':mime,'Content-Length':file.length,Authorization:makeOAuthHeader('PUT',u.toString(),a.oauth_token,a.oauth_token_secret,null,null),Cookie:MOBILE_COOKIE};
    const put=await new Promise((resolve,reject)=>{const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'PUT',headers},res=>{let out='';res.setEncoding('utf8');res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode||0,text:out}))});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('File upload timed out')));req.write(file);req.end()});
    if(put.status<200||put.status>=300)throw new Error(`File upload failed: ${put.status} ${put.text}`);
  }
  if(!fileId)throw new Error('Schoology did not return a file metadata ID.');
  const result=await request('POST',`https://${API_HOST}/v1/section/${info.sectionId}/assignment/${info.assignmentId}/submission`,{files:[{id:String(fileId)}]},{sign:true,signBody:false,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
  if(result.status<200||result.status>=300)throw new Error('Assignment submission failed: '+result.status+' '+result.text);return true;
}
async function updateAssignmentGrade(info){
  const a=loadAuth(); if(!a)throw new Error('Not signed in');
  if(!info?.sectionId||!info?.assignmentId||!info?.enrollmentId)throw new Error('Grade information is incomplete.');
  const body={grades:{grade:[{type:'assignment',assignment_id:String(info.assignmentId),enrollment_id:String(info.enrollmentId),grade:info.grade===''?null:info.grade,comment:String(info.comment||''),comment_status:info.commentStatus?1:0}]}};
  const result=await request('PUT',`https://${API_HOST}/v1/sections/${info.sectionId}/grades`,body,{sign:true,signBody:false,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret,json:true});
  if(result.status<200||result.status>=300)throw new Error('Grade update failed: '+result.status+' '+result.text);
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
    child.webContents.on('did-fail-load',(_,code,desc)=>{if(code!==-3)console.error('School login browser failed:',code,desc)});
    child.webContents.on('console-message',(_,level,message,line,source)=>console.log('School login browser:',message,'at',source+':'+line));
    child.on('closed',()=>{if(!settled)reject(new Error('School login window was closed.'))});
    child.loadURL(loginUrl).catch(e=>{if(e?.code==='ERR_ABORTED'||/ERR_ABORTED|(-3)/i.test(String(e?.message||''))){if(!settled&&!processing)return;return}finish(e)});
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
      // External SSO providers (Microsoft, Google, etc.) are intermediate
      // pages. Android completes this flow only after the WebView reaches a
      // Schoology-owned session page. For LAUSD the district LMS host is also
      // an accepted completion host.
      const schoologyHost=hostMatchesSuffix(host,'schoology.com');
      const lausdHost=host==='lms.lausd.net' || hostMatchesSuffix(host,'lms.lausd.net');
      const expectedSchoolHost=expectedHost &&
        (hostMatchesSuffix(host,expectedHost) && (
          hostMatchesSuffix(expectedHost,'schoology.com') ||
          expectedHost==='lms.lausd.net' ||
          hostMatchesSuffix(expectedHost,'lms.lausd.net')
        ));
      return schoologyHost || lausdHost || !!expectedSchoolHost;
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
function downloadUrl(url,target,totalHint=0){return new Promise((resolve,reject)=>{const get=(href,depth=0)=>{if(depth>8)return reject(new Error('Too many update redirects.'));const u=new URL(href);const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'GET',headers:{'User-Agent':'Schoology-Desktop-Port-Updater','Accept':'application/octet-stream'}},res=>{const code=res.statusCode||0;if([301,302,303,307,308].includes(code)&&res.headers.location){res.resume();return get(new URL(res.headers.location,u).toString(),depth+1)}if(code<200||code>=300){res.resume();return reject(new Error(`Update download failed (HTTP ${code})`))}const headerTotal=Number(res.headers['content-length']||0);const expected=headerTotal||Number(totalHint||0);let received=0;const sendProgress=done=>{try{if(win&&!win.isDestroyed()){const percent=expected?Math.min(100,Math.round(received*100/expected)):null;win.webContents.send('update-download-progress',{received,total:expected||received,percent,done:!!done})}}catch{}};sendProgress(false);const out=fs.createWriteStream(target);res.on('data',d=>{received+=d.length;sendProgress(false)});res.pipe(out);out.on('finish',()=>out.close(()=>{if(expected&&received!==expected){try{fs.unlinkSync(target)}catch{};return reject(new Error(`Update download was incomplete (${received}/${expected} bytes).`))}sendProgress(true);resolve(target)}));out.on('error',e=>{try{out.close()}catch{};try{fs.unlinkSync(target)}catch{};reject(e)})});req.setTimeout(10*60*1000,()=>req.destroy(new Error('Update download timed out')));req.on('error',e=>{try{fs.unlinkSync(target)}catch{};reject(e)});req.end()};get(url)})}

function updateAssetForPlatform(release){const assets=Array.isArray(release?.assets)?release.assets:[];const arch=process.arch;let wanted=[];if(process.platform==='win32')wanted=['Setup-x64.exe'];else if(process.platform==='darwin')wanted=[arch==='arm64'?'arm64.dmg':'x64.dmg'];else if(process.platform==='linux')wanted=[fs.existsSync('/usr/bin/rpm')&&!fs.existsSync('/usr/bin/dpkg')?'x86_64.rpm':'amd64.deb'];return assets.find(a=>wanted.some(s=>String(a.name||'').endsWith(s)))||null}
async function checkForUpdates(force=false){const now=Date.now(),st=readUpdateState();if(!force&&st.lastSuccessfulCheck&&now-st.lastSuccessfulCheck<UPDATE_INTERVAL_MS)return {checked:false,available:false};if(!require('electron').net.isOnline())throw new Error('Computer is offline.');const release=await fetchJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);const tag=String(release.tag_name||'');const remote=Number((tag.match(/(\d+)$/)||[])[1]||0),local=localReleaseNumber();if(!remote||remote<=local||release.draft||release.prerelease){writeUpdateState({lastSuccessfulCheck:now,lastRemoteTag:tag});return {checked:true,available:false,version:local};}const asset=updateAssetForPlatform(release);if(!asset)throw new Error('No compatible update package was found for this computer.');writeUpdateState({lastSuccessfulCheck:now,lastRemoteTag:tag});return {checked:true,available:true,version:remote,tag,assetName:asset.name,url:asset.browser_download_url,size:Number(asset.size||0),digest:asset.digest||null};}
async function downloadAndVerifyUpdate(info){if(!info?.url)throw new Error('The update download URL is missing.');const tag=String(info.tag||'update').replace(/[^A-Za-z0-9._-]/g,'_');const name=String(info.assetName||path.basename(new URL(info.url).pathname)||'schoology-update').replace(/[^A-Za-z0-9._-]/g,'_');const tmp=path.join(app.getPath('temp'),`schoology-update-${tag}-${name}`);let valid=false;if(fs.existsSync(tmp)){try{if(info.size&&fs.statSync(tmp).size!==Number(info.size))throw new Error('size');if(info.digest&&/^sha256:/i.test(String(info.digest))){const actual=await sha256File(tmp);if(actual.toLowerCase()!==String(info.digest).split(':').pop().toLowerCase())throw new Error('digest')}valid=true}catch{try{fs.unlinkSync(tmp)}catch{}}}if(!valid)await downloadUrl(info.url,tmp,Number(info.size||0));if(info.size&&fs.statSync(tmp).size!==Number(info.size))throw new Error('Downloaded update size does not match GitHub release metadata.');if(info.digest&&/^sha256:/i.test(String(info.digest))){const actual=await sha256File(tmp);const expected=String(info.digest).split(':').pop().toLowerCase();if(actual.toLowerCase()!==expected){try{fs.unlinkSync(tmp)}catch{};throw new Error('Downloaded update failed its SHA-256 integrity check.');}}return tmp;}
async function installUpdate(info){
  const file=typeof info==='string'?info:await downloadAndVerifyUpdate(info);
  if(!file||!fs.existsSync(file))throw new Error('The update installer is no longer available.');
  if(process.platform==='win32'){
    const {spawn}=require('child_process'); const installDir=path.dirname(process.execPath),exePath=process.execPath;
    const psPath=path.join(app.getPath('temp'),`schoology-update-${process.pid}-${Date.now()}.ps1`),q=v=>String(v).replace(/'/g,"''");
    const script=`$ErrorActionPreference='SilentlyContinue'\n$installer='${q(file)}'\n$installDir='${q(installDir)}'\n$exe='${q(exePath)}'\n$appPid=${process.pid}\nfor($i=0;$i -lt 300;$i++){if(-not(Get-Process -Id $appPid -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 200}\nStart-Process -FilePath $installer -ArgumentList @('/S',('/D='+$installDir)) -Wait\nif(Test-Path -LiteralPath $exe){Start-Process -FilePath $exe}\nRemove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue\nRemove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue\n`;
    fs.writeFileSync(psPath,script,'utf8');spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',psPath],{detached:true,stdio:'ignore',windowsHide:true}).unref();app.quit();return true;
  }
  if(process.platform==='darwin'){
    const {spawn}=require('child_process'); const targetApp=path.dirname(path.dirname(process.execPath)); const parentDir=path.dirname(targetApp);
    const shPath=path.join(app.getPath('temp'),`schoology-update-${process.pid}-${Date.now()}.sh`),q=v=>String(v).replace(/'/g,"'\"'\"'");
    const mount=path.join(app.getPath('temp'),`schoology-dmg-${process.pid}-${Date.now()}`);fs.mkdirSync(mount,{recursive:true});
    const script=`#!/bin/bash\nset -e\nDMG='${q(file)}'\nTARGET='${q(targetApp)}'\nPARENT='${q(parentDir)}'\nMOUNT='${q(mount)}'\nPID=${process.pid}\nfor i in {1..300}; do kill -0 $PID 2>/dev/null || break; sleep .2; done\nhdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" >/dev/null\nAPP=$(find "$MOUNT" -maxdepth 2 -name '*.app' -type d -print -quit)\nif [ -z "$APP" ]; then hdiutil detach "$MOUNT" >/dev/null; exit 1; fi\nrm -rf "$TARGET"\nditto "$APP" "$TARGET"\nhdiutil detach "$MOUNT" >/dev/null\nopen "$TARGET"\nrm -f "$DMG" "$0"\n`;
    fs.writeFileSync(shPath,script,{encoding:'utf8',mode:0o755});spawn('/bin/bash',[shPath],{detached:true,stdio:'ignore'}).unref();app.quit();return true;
  }
  const r=await shell.openPath(file);if(r)throw new Error(r);return true;
}
let updateTimer=null;function scheduleUpdateChecks(){const run=async()=>{try{const result=await checkForUpdates(false);if(result?.available){try{win?.webContents?.send('update-available',result)}catch(e){console.error('Automatic Schoology update notification failed:',e.message)}}if(updateTimer)clearTimeout(updateTimer);updateTimer=setTimeout(run,UPDATE_INTERVAL_MS)}catch(e){console.log('Schoology update check deferred:',e.message);if(updateTimer)clearTimeout(updateTimer);updateTimer=setTimeout(run,UPDATE_RETRY_MS)}};const st=readUpdateState();const due=!st.lastSuccessfulCheck||Date.now()-st.lastSuccessfulCheck>=UPDATE_INTERVAL_MS;setTimeout(()=>{if(due)run();else updateTimer=setTimeout(run,Math.max(1000,UPDATE_INTERVAL_MS-(Date.now()-st.lastSuccessfulCheck)))},8000)}

function create(){
  const appIcon=path.join(__dirname,'../assets/ic_launcher_256.png');
  const overlay=windowChromeOverlayEnabled();
  const titlebarOptions=process.platform==='darwin'
    ? (overlay ? {titleBarStyle:'hidden',titleBarOverlay:{color:'#002137',symbolColor:'#ffffff',height:56}} : {titleBarStyle:'hiddenInset'})
    : (overlay ? {titleBarStyle:'hidden',titleBarOverlay:{color:'#44505d',symbolColor:'#ffffff',height:56}} : {});
  win=new BrowserWindow({show:false,backgroundColor:'#002137',icon:appIcon,...titlebarOptions,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,webviewTag:true,media:true}});
  win.removeMenu();
  win.webContents.setUserAgent(CLIENT_UA+'; Android 14; Pixel 8');
  win.webContents.on('did-fail-load',(_,code,desc)=>console.error('Schoology renderer failed to load:',code,desc));
  win.webContents.on('render-process-gone',(_,details)=>console.error('Schoology renderer process gone:',details));
  win.webContents.on('console-message',(_,level,message,line,source)=>console.log('Renderer:',message,'at',source+':'+line));
  win.webContents.on('did-navigate',(_,url)=>console.log('Schoology navigated to:',url));
  win.webContents.on('did-navigate-in-page',(_,url)=>console.log('Schoology in-page navigation:',url));
  win.once('ready-to-show',()=>{try{win.setTitleBarOverlay?.({color:'#44505d',symbolColor:'#ffffff',height:56})}catch{};win.show();});
  win.loadFile(path.join(__dirname,'index.html')).catch(e=>console.error('Failed to load Schoology UI:',e));
}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission==='media'||permission==='camera'||permission==='microphone'));
  session.defaultSession.setPermissionCheckHandler((_wc,permission)=>permission==='media'||permission==='camera'||permission==='microphone');
  ipcMain.handle('auth-state',()=>loadAuth());
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
  ipcMain.handle('update-assignment-grade',(_,x)=>updateAssignmentGrade(x));
  ipcMain.handle('check-for-updates',()=>checkForUpdates(true));
  ipcMain.handle('set-window-chrome',(_,x)=>{if(process.platform==='win32'||process.platform==='linux'){try{if(windowChromeOverlayEnabled())win?.setTitleBarOverlay?.({color:String(x?.color||'#002137'),symbolColor:String(x?.symbolColor||'#ffffff'),height:Number(x?.height||56)})}catch{}}return true});
  ipcMain.handle('get-window-chrome-mode',()=>({overlay:windowChromeOverlayEnabled(),platform:process.platform}));
  ipcMain.handle('set-window-chrome-mode',(_,enabled)=>{saveWindowChromeOverlay(!!enabled);app.relaunch();app.exit(0);return true});
  ipcMain.handle('install-update',(_,file)=>installUpdate(file));
  ipcMain.handle('download-file',(event,x)=>downloadAuthenticatedFile(x,event.sender));
  ipcMain.handle('launch-course-app',async(_,x)=>{
    const a=loadAuth(); if(!a)throw new Error('Not signed in');
    const appId=Number(x?.appId ?? x);
    if(!Number.isFinite(appId)){const href=String(x?.launchUrl||x?.href||'');if(/^https?:\/\//i.test(href))return {url:href};throw new Error('Resource app launch target is missing.');}
    const u=new URL(`https://${API_HOST}/v2/resources/applications/${appId}/launch`);
    const r=await request('GET',u.toString(),{}, {sign:true,clientIdentity:true,authToken:a.oauth_token,tokenSecret:a.oauth_token_secret});
    if(r.status<200||r.status>=300)throw new Error(`Resource app launch failed (HTTP ${r.status}): ${r.text}`);
    let j={};try{j=JSON.parse(r.text)}catch{throw new Error('Schoology returned an invalid resource-app launch response.')}
    return j;
  });
  ipcMain.handle('open-downloaded-file',(_,x)=>shell.openPath(String(x?.path||'')));
  ipcMain.handle('open-external',(_,u)=>shell.openExternal(u));
  ipcMain.handle('pick-file',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile']});return r.canceled?null:r.filePaths[0]});
  create();
  scheduleUpdateChecks();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
