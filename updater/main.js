const {app,BrowserWindow} = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const {spawn,execFile} = require('child_process');

const args = process.argv.slice(1);
const payloadArg = args.find(a => a.startsWith('--payload-base64='));
let payload = {};
try { const encoded = payloadArg ? payloadArg.slice('--payload-base64='.length) : ''; payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); } catch (e) { payload = {}; }

const TEMP_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'Temp', 'schoology-updater');
const fallbackInstallDir=payload.installMode==='all-users'?path.join(process.env.ProgramFiles || 'C:\\Program Files','Schoology'):path.join(process.env.LOCALAPPDATA || app.getPath('temp'),'Programs','Schoology');
const SCHOOLGY_DIR = path.resolve(String(payload.installDir||fallbackInstallDir));
const LOCAL_7ZIP = path.join(SCHOOLGY_DIR, '7-Zip');
const SEVENZIP_URL = 'https://github.com/ip7z/7zip/releases/download/26.04/7z2604-x64.msi';
const schoologyExe = path.join(SCHOOLGY_DIR, 'Schoology.exe');
let win;
let activeStep='';
let activeRequest=null;
const activeProcesses=new Set();
let cancelled=false;
let completed=false;
const LOG_FILE = path.join(TEMP_DIR, 'updater.log');
const productName = String(payload.productName || 'Schoology');
const darkTheme = typeof payload.darkTheme === 'boolean' ? payload.darkTheme : (payload.themeMode === 'dark' || (payload.themeMode !== 'light' && require('electron').nativeTheme?.shouldUseDarkColors === true));
const theme = darkTheme ? {background:'#17191c',foreground:'#e6e8eb',muted:'#a9afb7',track:'#34383e',accent:'#7ab7ff'} : {background:'#ffffff',foreground:'#202124',muted:'#5f6368',track:'#e5e7eb',accent:'#2e66a3'};

function log(message, details){
  try{
    fs.mkdirSync(TEMP_DIR,{recursive:true});
    const suffix=details===undefined?'':` ${typeof details==='string'?details:JSON.stringify(details)}`;
    fs.appendFileSync(LOG_FILE,`${new Date().toISOString()} ${message}${suffix}\r\n`,'utf8');
  }catch{}
}

function cleanupArtifacts(paths){
  for(const target of paths){
    try{
      fs.rmSync(target,{recursive:true,force:true});
      log('cleanup-complete',{target,exists:fs.existsSync(target)});
    }catch(error){
      log('cleanup-error',{target,error:error?.stack||String(error)});
    }
  }
}

function scheduleSelfCleanup(){
  const target=String(payload.stagedUpdaterPath||'');
  if(!target)return;
  try{
    const command=`timeout /t 2 /nobreak >nul & taskkill /F /IM SchoologyUpdater*.exe >nul 2>&1 & del /f /q "${target.replace(/"/g,'')}" >nul 2>&1`;
    spawn('cmd.exe',['/d','/c',command],{detached:true,stdio:'ignore',windowsHide:true}).unref();
    log('self-cleanup-scheduled',{target});
  }catch(error){log('self-cleanup-error',error?.stack||String(error));}
}

process.on('uncaughtException',error=>{log('uncaughtException',error?.stack||String(error));if(!cancelled)fail(error);});
process.on('unhandledRejection',reason=>{log('unhandledRejection',reason?.stack||String(reason));if(!cancelled)fail(reason);});

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function createWindow(){
  win = new BrowserWindow({width:520,height:430,resizable:false,fullscreenable:false,minimizable:false,maximizable:false,closable:true,alwaysOnTop:true,center:true,backgroundColor:theme.background,title:'Schoology Update',icon:path.join(__dirname,'../assets/ic_launcher_256.png'),webPreferences:{contextIsolation:true,nodeIntegration:false}});
  win.removeMenu();
  win.on('close',event=>{if(!completed&&!cancelled){event.preventDefault();cancelUpdate();}});
  const switchMode=productName!=='Schoology';
  const steps=[['sevenDownload','Download 7-Zip'],['sevenInstall','Install 7-Zip'],['schoologyDownload',`Download ${productName}`],['install',`Install ${productName}`]];
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{color-scheme:${darkTheme?'dark':'light'};margin:0;padding:28px 30px;font-family:"Segoe UI",system-ui,sans-serif;color:${theme.foreground};background:${theme.background}}h1{font-size:21px;margin:0 0 8px;font-weight:600;color:${theme.foreground}}#status{font-size:14px;color:${theme.muted};margin:0 0 22px}.screen{margin:0 0 18px}.screen[hidden]{display:none}.row{display:flex;justify-content:space-between;gap:16px;font-size:13px;margin-bottom:7px}.name{font-weight:600;color:${theme.foreground}}.state{color:${theme.muted}}.track{height:7px;background:${theme.track};border-radius:5px;overflow:hidden}.bar{height:100%;width:0;background:${theme.accent}}.indeterminate .bar{width:38%;animation:slide 1.15s ease-in-out infinite}@keyframes slide{0%{transform:translateX(-110%)}50%{transform:translateX(165%)}100%{transform:translateX(290%)}}.done .bar{width:100%;animation:none}.error{color:#f28b82}.foot{font-size:12px;color:${theme.muted};margin-top:4px}</style></head><body><h1>${switchMode?'Switching to ':''}${esc(productName)}</h1><p id="status">Preparing…</p>${steps.map(([id,name])=>`<div class="screen" id="${id}" hidden><div class="row"><span class="name">${name}</span><span class="state">Waiting</span></div><div class="track"><div class="bar"></div></div></div>`).join('')}<div class="foot" id="foot">Please keep this window open.</div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  win.webContents.on('did-finish-load',()=>{win.webContents.executeJavaScript(`(()=>{const b=document.createElement('button');b.id='cancelUpdate';b.textContent='Cancel';b.style.cssText='display:block;margin:20px 0 0 auto;padding:7px 18px;border:1px solid #9aa0a6;border-radius:4px;background:${theme.background};color:${theme.foreground};font:inherit;cursor:pointer';b.onclick=()=>console.log('schoology-updater-cancel');document.body.appendChild(b)})()`).catch(()=>{});});
  win.webContents.on('console-message',(_,level,message)=>{if(message==='schoology-updater-cancel')cancelUpdate();});
  log('window-created',{productName,logFile:LOG_FILE});
}
function cancelUpdate(){
  if(cancelled||completed)return;
  cancelled=true;
  log('cancel-requested');
  try{activeRequest?.destroy(new Error('Update cancelled by user.'))}catch{}
  for(const child of activeProcesses){try{child.kill()}catch{}}
  status('Cancelling…');
  if(win&&!win.isDestroyed())win.webContents.executeJavaScript(`(()=>{const b=document.getElementById('cancelUpdate');if(b){b.disabled=true;b.textContent='Cancelling…'}})()`).catch(()=>{});
  setTimeout(()=>{try{if(win&&!win.isDestroyed())win.destroy()}finally{app.quit()}},250);
}
function configureSevenZip(required){
  if(!win||win.isDestroyed())return;
  const hidden=required?'false':'true';
  win.webContents.executeJavaScript(`['sevenDownload','sevenInstall'].forEach(id=>{const e=document.getElementById(id);if(e)e.hidden=${hidden}})`).catch(()=>{});
}
function ui(id,state,text,percent){
  if(!win||win.isDestroyed())return;
  activeStep=id;
  const p=JSON.stringify({id,state,text,percent});
  win.webContents.executeJavaScript(`(()=>{const d=${p},e=document.getElementById(d.id);if(!e)return;document.querySelectorAll('.screen').forEach(screen=>{screen.hidden=screen.id!==d.id});e.hidden=false;const s=e.querySelector('.state'),b=e.querySelector('.bar');if(s)s.textContent=d.text||'';e.classList.toggle('done',d.state==='done');e.classList.toggle('indeterminate',d.state==='indeterminate');if(b&&d.percent!=null)b.style.width=Math.max(0,Math.min(100,d.percent))+'%';if(d.state==='error'){if(s)s.className='state error';}})()`).catch(()=>{});
}
function status(text){if(!win||win.isDestroyed())return;win.webContents.executeJavaScript(`document.getElementById('status').textContent=${JSON.stringify(String(text))}`).catch(()=>{});}
function fail(err){log('failure',err?.stack||String(err||'Unknown error'));if(activeStep)ui(activeStep,'error','Failed');status('Update failed.');if(win&&!win.isDestroyed())win.webContents.executeJavaScript(`document.getElementById('foot').textContent=${JSON.stringify(String(err?.message||err||'Unknown error'))};document.getElementById('foot').className='foot error'`).catch(()=>{});}
function download(url,target,onProgress){return new Promise((resolve,reject)=>{log('download-start',{url,target});fs.mkdirSync(path.dirname(target),{recursive:true});const get=(href,depth=0)=>{if(depth>8)return reject(new Error('Too many redirects.'));const u=new URL(href);const req=https.request({hostname:u.hostname,path:u.pathname+u.search,headers:{'User-Agent':'Schoology-Updater/1.0','Accept':'application/octet-stream'}});activeRequest=req;req.on('response',res=>{const code=res.statusCode||0;log('download-response',{url:href,status:code});if([301,302,303,307,308].includes(code)&&res.headers.location){res.resume();activeRequest=null;return get(new URL(res.headers.location,u).toString(),depth+1)}if(code<200||code>=300){res.resume();activeRequest=null;return reject(new Error(`Download failed (HTTP ${code})`))}const total=Number(res.headers['content-length']||0),out=fs.createWriteStream(target);let received=0;res.on('data',d=>{received+=d.length;if(onProgress)onProgress(received,total)});res.pipe(out);out.on('finish',()=>out.close(()=>{activeRequest=null;log('download-complete',{target,bytes:received});resolve(target)}));out.on('error',error=>{activeRequest=null;log('download-write-error',error.stack||String(error));reject(error)})});req.setTimeout(15*60*1000,()=>req.destroy(new Error('Download timed out')));req.on('error',error=>{activeRequest=null;log('download-error',error.stack||String(error));reject(error)});req.end()};get(url)});}
function sha256(file){return new Promise((resolve,reject)=>{log('hash-start',{file});const crypto=require('crypto'),h=crypto.createHash('sha256'),s=fs.createReadStream(file);s.on('data',d=>h.update(d));s.on('end',()=>{const digest=h.digest('hex');log('hash-complete',{file,digest});resolve(digest)});s.on('error',error=>{log('hash-error',error.stack||String(error));reject(error)})})}
function find7z(){
  const names=['7z.exe','7zz.exe','7zg.exe'];
  const candidates=[];
  for(const name of names)candidates.push(path.join(LOCAL_7ZIP,name));
  for(const name of names)candidates.push(path.join(process.env.ProgramFiles||'C:\\Program Files','7-Zip',name));
  const pathDirs=String(process.env.PATH||'').split(';').filter(Boolean);
  for(const dir of pathDirs)for(const name of names)candidates.push(path.join(dir,name));
  return candidates.find(p=>{try{return fs.existsSync(p)}catch{return false}})||null;
}
function run(exe,args,options={}){return new Promise((resolve,reject)=>{log('process-start',{exe,args});const cp=spawn(exe,args,{windowsHide:true,...options});activeProcesses.add(cp);let stderr='';let stdout='';const output=(stream,data)=>{const text=String(data);if(stream==='stdout')stdout+=text;else stderr+=text;log(`process-${stream}`,text.trim());options.onOutput?.(text,stream)};cp.stdout?.on('data',d=>output('stdout',d));cp.stderr?.on('data',d=>output('stderr',d));cp.on('error',error=>{activeProcesses.delete(cp);log('process-error',error.stack||String(error));reject(error)});cp.on('close',code=>{activeProcesses.delete(cp);log('process-exit',{exe,code});const ok=options.acceptCodes?options.acceptCodes.includes(code):code===0;ok?resolve({code,stderr,stdout}):reject(new Error(`${path.basename(exe)} exited with code ${code}${stderr?`: ${stderr.trim().slice(0,400)}`:''}`))})});}
function waitForPid(pid,timeoutMs=15000){if(!pid){log('wait-for-schoology-skipped');return Promise.resolve();}return new Promise(resolve=>{const started=Date.now();let settled=false;let timer=null;log('wait-for-schoology-start',{pid,timeoutMs});const finish=(event,details={})=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);log(event,{pid,elapsedMs:Date.now()-started,...details});resolve();};const tick=()=>{if(settled)return;log('wait-for-schoology-check',{pid});const child=execFile('tasklist',['/FI',`PID eq ${pid}`],{windowsHide:true,timeout:2000},(error,stdout,stderr)=>{activeProcesses.delete(child);if(settled)return;if(error)log('wait-for-schoology-tasklist-result',{error:String(error),stderr:String(stderr||'')});const present=new RegExp(`\\b${pid}\\b`).test(String(stdout||''));if(!present)return finish('wait-for-schoology-complete');if(Date.now()-started>=timeoutMs)return finish('wait-for-schoology-timeout');setTimeout(tick,250)});activeProcesses.add(child);};timer=setTimeout(()=>finish('wait-for-schoology-timeout'),timeoutMs+2500);tick()});}
async function main(){
  if(process.platform!=='win32')throw new Error('This updater is Windows-only.');
  if(!payload.url)throw new Error('The Schoology installer URL is missing.');
  fs.mkdirSync(TEMP_DIR,{recursive:true});
  log('startup',{payload:{...payload,parentPid:payload.parentPid},tempDir:TEMP_DIR,schoologyDir:SCHOOLGY_DIR});
  const sevenMsi=path.join(TEMP_DIR,'7z2604-x64.msi');
  const installer=path.join(TEMP_DIR,'schoology-installer.exe');
  const outer=path.join(TEMP_DIR,'installer-outer');
  const inner=path.join(TEMP_DIR,'inner-installer');
  let seven=find7z();
  log('paths',{sevenMsi,installer,outer,inner,seven});
  if(seven){configureSevenZip(false);}
  else{
    configureSevenZip(true);
    status('Downloading 7-Zip…');ui('sevenDownload','determinate','Downloading…',0);await download(SEVENZIP_URL,sevenMsi,(n,t)=>ui('sevenDownload','determinate',t?`${Math.round(n*100/t)}%`:'Downloading…',t?Math.round(n*100/t):0));ui('sevenDownload','done','Complete',100);
    status('Installing 7-Zip…');ui('sevenInstall','indeterminate','Installing…');fs.mkdirSync(LOCAL_7ZIP,{recursive:true});await run('msiexec.exe',['/a',sevenMsi,'/qb',`TARGETDIR=${LOCAL_7ZIP}`]);
    const installed=find7z();if(!installed)throw new Error('7-Zip installation completed but no console extractor was found.');seven=installed;ui('sevenInstall','done','Complete',100);
  }
  status(`Downloading ${productName}…`);ui('schoologyDownload','determinate','Downloading…',0);await download(String(payload.url),installer,(n,t)=>ui('schoologyDownload','determinate',t?`${Math.round(n*100/t)}%`:'Downloading…',t?Math.round(n*100/t):0));
  status(`Verifying ${productName}…`);log('verification-start',{installer,expectedSize:payload.size||0,expectedDigest:payload.digest||null});
  const downloadedSize=fs.statSync(installer).size;log('size-check',{downloadedSize,expectedSize:Number(payload.size||0)});if(payload.size&&downloadedSize!==Number(payload.size))throw new Error('The downloaded Schoology installer size does not match the release metadata.');
  if(payload.digest&&/^sha256:/i.test(String(payload.digest))){const actual=await sha256(installer);const expected=String(payload.digest).split(':').pop().toLowerCase();if(actual.toLowerCase()!==expected)throw new Error('The downloaded Schoology installer failed its SHA-256 integrity check.');}
  log('verification-complete');
  ui('schoologyDownload','done','Complete',100);
  status(`Installing ${productName}…`);ui('install','determinate','Preparing installation…',5);
  await waitForPid(Number(payload.parentPid||0));
  ui('install','determinate','Preparing extraction…',10);log('prepare-extraction',{outer,inner});fs.rmSync(outer,{recursive:true,force:true});fs.rmSync(inner,{recursive:true,force:true});fs.mkdirSync(outer,{recursive:true});fs.mkdirSync(inner,{recursive:true});log('extraction-directories-created',{outerExists:fs.existsSync(outer),innerExists:fs.existsSync(inner)});
  log('extract-installer-start',{installer,outer});
  await run(seven,['x',installer,`-o${outer}`,'-y']);
  ui('install','determinate','Installer extracted…',45);log('extract-installer-complete',{outerEntries:fs.existsSync(outer)?fs.readdirSync(outer):[]});
  const app7z=path.join(outer,'$PLUGINSDIR','app-64.7z');if(!fs.existsSync(app7z))throw new Error('The Schoology installer did not contain $PLUGINSDIR\\app-64.7z.');
  log('extract-application-start',{app7z,inner});
  await run(seven,['x',app7z,`-o${inner}`,'-y']);
  ui('install','determinate','Application files extracted…',70);log('extract-application-complete',{innerEntries:fs.existsSync(inner)?fs.readdirSync(inner):[]});
  const uninstallSource=path.join(outer,'$R0','Uninstall Schoology.exe');const uninstallTarget=path.join(SCHOOLGY_DIR,'Uninstall Schoology.exe');fs.mkdirSync(SCHOOLGY_DIR,{recursive:true});if(fs.existsSync(uninstallSource))fs.copyFileSync(uninstallSource,uninstallTarget);
  log('copy-application-start',{inner,schoologyDir:SCHOOLGY_DIR});let copyOutputSeen=false;await run('robocopy.exe',[inner,SCHOOLGY_DIR,'/E'],{acceptCodes:[0,1,2,3,4,5,6,7],onOutput:(text)=>{if(!copyOutputSeen){copyOutputSeen=true;ui('install','determinate','Copying application files…',80);}else ui('install','determinate','Copying application files…',90)}});
  ui('install','determinate','Finalizing installation…',97);log('copy-application-complete',{schoologyExeExists:fs.existsSync(schoologyExe),copyOutputSeen});
  ui('install','done','Complete',100);cleanupArtifacts([outer,inner,installer,sevenMsi]);completed=true;log('update-complete',{schoologyExe});status('Update complete. Launching Schoology…');
  setTimeout(()=>{try{require('child_process').spawn(schoologyExe,[],{detached:true,stdio:'ignore',windowsHide:false}).unref();}finally{scheduleSelfCleanup();if(win&&!win.isDestroyed())win.close();app.quit()}},700);
}
app.whenReady().then(()=>{createWindow();setTimeout(()=>main().catch(e=>{if(!cancelled)fail(e);}),300);});
app.on('window-all-closed',()=>{});
