const {app,BrowserWindow} = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const {spawn} = require('child_process');

const args = process.argv.slice(1);
const payloadArg = args.find(a => a.startsWith('--payload-base64='));
let payload = {};
try { const encoded = payloadArg ? payloadArg.slice('--payload-base64='.length) : ''; payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); } catch (e) { payload = {}; }

const TEMP_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'Temp', 'schoology-updater');
const SCHOOLGY_DIR = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Schoology');
const LOCAL_7ZIP = path.join(SCHOOLGY_DIR, '7-Zip');
const SEVENZIP_URL = 'https://github.com/ip7z/7zip/releases/download/26.04/7z2604-x64.msi';
const schoologyExe = path.join(SCHOOLGY_DIR, 'Schoology.exe');
let win;
let activeStep='';
const LOG_FILE = path.join(TEMP_DIR, 'updater.log');
const productName = String(payload.productName || 'Schoology');

function log(message, details){
  try{
    fs.mkdirSync(TEMP_DIR,{recursive:true});
    const suffix=details===undefined?'':` ${typeof details==='string'?details:JSON.stringify(details)}`;
    fs.appendFileSync(LOG_FILE,`${new Date().toISOString()} ${message}${suffix}\r\n`,'utf8');
  }catch{}
}

process.on('uncaughtException',error=>{log('uncaughtException',error?.stack||String(error));fail(error);});
process.on('unhandledRejection',reason=>{log('unhandledRejection',reason?.stack||String(reason));fail(reason);});

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function createWindow(){
  win = new BrowserWindow({width:520,height:430,resizable:false,fullscreenable:false,minimizable:false,maximizable:false,closable:false,alwaysOnTop:true,center:true,backgroundColor:'#ffffff',title:'Schoology Update',icon:path.join(__dirname,'../assets/ic_launcher_256.png'),webPreferences:{contextIsolation:true,nodeIntegration:false}});
  win.removeMenu();
  const switchMode=productName!=='Schoology';
  const steps=[['sevenDownload','Download 7-Zip'],['sevenInstall','Install 7-Zip'],['schoologyDownload',`Download ${productName}`],['install',`Install ${productName}`]];
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:28px 30px;font-family:"Segoe UI",system-ui,sans-serif;color:#202124;background:#fff}h1{font-size:21px;margin:0 0 8px;font-weight:600}#status{font-size:14px;color:#5f6368;margin:0 0 22px}.screen{margin:0 0 18px}.screen[hidden]{display:none}.row{display:flex;justify-content:space-between;gap:16px;font-size:13px;margin-bottom:7px}.name{font-weight:600}.state{color:#6b7280}.track{height:7px;background:#e5e7eb;border-radius:5px;overflow:hidden}.bar{height:100%;width:0;background:#2e66a3}.indeterminate .bar{width:38%;animation:slide 1.15s ease-in-out infinite}@keyframes slide{0%{transform:translateX(-110%)}50%{transform:translateX(165%)}100%{transform:translateX(290%)}}.done .bar{width:100%;animation:none}.error{color:#b3261e}.foot{font-size:12px;color:#777;margin-top:4px}</style></head><body><h1>${switchMode?'Switching to ':''}${esc(productName)}</h1><p id="status">Preparing…</p>${steps.map(([id,name])=>`<div class="screen" id="${id}" hidden><div class="row"><span class="name">${name}</span><span class="state">Waiting</span></div><div class="track"><div class="bar"></div></div></div>`).join('')}<div class="foot" id="foot">Please keep this window open.</div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  log('window-created',{productName,logFile:LOG_FILE});
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
function download(url,target,onProgress){return new Promise((resolve,reject)=>{log('download-start',{url,target});fs.mkdirSync(path.dirname(target),{recursive:true});const get=(href,depth=0)=>{if(depth>8)return reject(new Error('Too many redirects.'));const u=new URL(href);const req=https.request({hostname:u.hostname,path:u.pathname+u.search,headers:{'User-Agent':'Schoology-Updater/1.0','Accept':'application/octet-stream'}},res=>{const code=res.statusCode||0;log('download-response',{url:href,status:code});if([301,302,303,307,308].includes(code)&&res.headers.location){res.resume();return get(new URL(res.headers.location,u).toString(),depth+1)}if(code<200||code>=300){res.resume();return reject(new Error(`Download failed (HTTP ${code})`));}const total=Number(res.headers['content-length']||0),out=fs.createWriteStream(target);let received=0;res.on('data',d=>{received+=d.length;if(onProgress)onProgress(received,total)});res.pipe(out);out.on('finish',()=>out.close(()=>{log('download-complete',{target,bytes:received});resolve(target)}));out.on('error',error=>{log('download-write-error',error.stack||String(error));reject(error)})});req.setTimeout(15*60*1000,()=>req.destroy(new Error('Download timed out')));req.on('error',error=>{log('download-error',error.stack||String(error));reject(error)});req.end()};get(url)});}
function sha256(file){return new Promise((resolve,reject)=>{const crypto=require('crypto'),h=crypto.createHash('sha256'),s=fs.createReadStream(file);s.on('data',d=>h.update(d));s.on('end',()=>resolve(h.digest('hex')));s.on('error',reject)})}
function find7z(){
  const names=['7z.exe','7zz.exe','7zg.exe'];
  const candidates=[];
  for(const name of names)candidates.push(path.join(LOCAL_7ZIP,name));
  for(const name of names)candidates.push(path.join(process.env.ProgramFiles||'C:\\Program Files','7-Zip',name));
  const pathDirs=String(process.env.PATH||'').split(';').filter(Boolean);
  for(const dir of pathDirs)for(const name of names)candidates.push(path.join(dir,name));
  return candidates.find(p=>{try{return fs.existsSync(p)}catch{return false}})||null;
}
function run(exe,args,options={}){return new Promise((resolve,reject)=>{log('process-start',{exe,args});const cp=spawn(exe,args,{windowsHide:true,...options});let stderr='';let stdout='';cp.stdout?.on('data',d=>{stdout+=d;log('process-stdout',String(d).trim())});cp.stderr?.on('data',d=>{stderr+=d;log('process-stderr',String(d).trim())});cp.on('error',error=>{log('process-error',error.stack||String(error));reject(error)});cp.on('close',code=>{log('process-exit',{exe,code});const ok=options.acceptCodes?options.acceptCodes.includes(code):code===0;ok?resolve({code,stderr,stdout}):reject(new Error(`${path.basename(exe)} exited with code ${code}${stderr?`: ${stderr.trim().slice(0,400)}`:''}`))})});}
function waitForPid(pid){if(!pid)return Promise.resolve();return new Promise(resolve=>{const tick=()=>{spawn('tasklist',['/FI',`PID eq ${pid}`],{windowsHide:true},(_,stdout)=>{if(!stdout||!new RegExp(`\\b${pid}\\b`).test(String(stdout)))return resolve();setTimeout(tick,250)});};tick()});}
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
  if(payload.size&&fs.statSync(installer).size!==Number(payload.size))throw new Error('The downloaded Schoology installer size does not match the release metadata.');
  if(payload.digest&&/^sha256:/i.test(String(payload.digest))){const actual=await sha256(installer);const expected=String(payload.digest).split(':').pop().toLowerCase();if(actual.toLowerCase()!==expected)throw new Error('The downloaded Schoology installer failed its SHA-256 integrity check.');}
  ui('schoologyDownload','done','Complete',100);
  status(`Installing ${productName}…`);ui('install','indeterminate',`Closing Schoology and extracting ${productName}…`);
  await waitForPid(Number(payload.parentPid||0));
  log('prepare-extraction',{outer,inner});fs.rmSync(outer,{recursive:true,force:true});fs.rmSync(inner,{recursive:true,force:true});fs.mkdirSync(outer,{recursive:true});fs.mkdirSync(inner,{recursive:true});log('extraction-directories-created',{outerExists:fs.existsSync(outer),innerExists:fs.existsSync(inner)});
  log('extract-installer-start',{installer,outer});
  await run(seven,['x',installer,`-o${outer}`,'-y']);
  log('extract-installer-complete',{outerEntries:fs.existsSync(outer)?fs.readdirSync(outer):[]});
  const app7z=path.join(outer,'$PLUGINSDIR','app-64.7z');if(!fs.existsSync(app7z))throw new Error('The Schoology installer did not contain $PLUGINSDIR\\app-64.7z.');
  log('extract-application-start',{app7z,inner});
  await run(seven,['x',app7z,`-o${inner}`,'-y']);
  log('extract-application-complete',{innerEntries:fs.existsSync(inner)?fs.readdirSync(inner):[]});
  const uninstallSource=path.join(outer,'$R0','Uninstall Schoology.exe');const uninstallTarget=path.join(SCHOOLGY_DIR,'Uninstall Schoology.exe');fs.mkdirSync(SCHOOLGY_DIR,{recursive:true});if(fs.existsSync(uninstallSource))fs.copyFileSync(uninstallSource,uninstallTarget);
  log('copy-application-start',{inner,schoologyDir:SCHOOLGY_DIR});await run('robocopy.exe',[inner,SCHOOLGY_DIR,'/E'],{acceptCodes:[0,1,2,3,4,5,6,7]});
  log('copy-application-complete',{schoologyExeExists:fs.existsSync(schoologyExe)});
  ui('install','done','Complete',100);status('Update complete. Launching Schoology…');
  setTimeout(()=>{try{require('child_process').spawn(schoologyExe,[],{detached:true,stdio:'ignore',windowsHide:false}).unref();}finally{app.quit()}},700);
}
app.whenReady().then(()=>{createWindow();setTimeout(()=>main().catch(e=>{fail(e);}),300);});
app.on('window-all-closed',()=>{});
