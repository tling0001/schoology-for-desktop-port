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

function findExtractedApplicationRoot(root){
 const pending=[{dir:root,depth:0}],seen=new Set();
 while(pending.length){
  const current=pending.shift();if(!current||current.depth>10)continue;
  const dir=path.resolve(current.dir);if(seen.has(dir))continue;seen.add(dir);
  let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{continue}
  const byLower=new Map(entries.map(entry=>[entry.name.toLowerCase(),entry]));
  const exe=byLower.get('schoology.exe');
  if(exe&&exe.isFile())return {root:dir,exe:path.join(dir,exe.name)};
  for(const entry of entries){
   if(!entry.isDirectory()||entry.isSymbolicLink())continue;
   if(['locales','swiftshader','resources'].includes(entry.name.toLowerCase()))continue;
   pending.push({dir:path.join(dir,entry.name),depth:current.depth+1});
  }
 }
 return null;
}
function cleanupArtifacts(paths){
  for(const target of paths){
    try{
      if(!fs.existsSync(target)){log('cleanup-complete',{target,exists:false});continue;}
      const stat=fs.lstatSync(target);
      if(stat.isDirectory())fs.rmSync(target,{recursive:true,force:true});
      else fs.unlinkSync(target);
      log('cleanup-complete',{target,exists:fs.existsSync(target)});
    }catch(error){
      log('cleanup-error',{target,error:error?.stack||String(error)});
    }
  }
}
async function deleteFileWithCmd(file){
  if(!file||!fs.existsSync(file))return;
  await run('cmd.exe',['/d','/s','/c',`del /f /q "${file}"`],{acceptCodes:[0]});
  if(fs.existsSync(file))throw new Error('Windows could not delete the file: '+file);
}

function scheduleSelfCleanup(outerPath,runTempPath){
  const target=String(payload.stagedUpdaterPath||'');
  const stagedInstallDir=payload.stagedInstallDir?path.resolve(String(payload.stagedInstallDir)):'';
  const outer=path.resolve(String(outerPath||path.join(TEMP_DIR,'installer-outer')));
  const runTemp=path.resolve(String(runTempPath||path.dirname(outer)));
  const updaterPid=process.pid;
  const resourcesPath=path.resolve(process.resourcesPath||'');
  const tempRoot=path.resolve(TEMP_DIR)+path.sep;
  const resourcesInsideTemp=resourcesPath.toLowerCase().startsWith(tempRoot.toLowerCase());
  const finalizeLog=path.join(app.getPath('temp'),'schoology-update-finalize.log');
  try{
    // The helper's own resources may be locked while it runs. A detached
    // PowerShell process waits for this PID, then removes only updater-owned files.
    const ps=value=>String(value).replace(/'/g,"''");
    const lines=[
      "$ErrorActionPreference='Continue'",
      `$pidToWait=${updaterPid}`,
      `$log='${ps(finalizeLog)}'`,
      "function Write-FinalizeLog($m){try{Add-Content -LiteralPath $log -Value ((Get-Date -Format o)+' '+$m)}catch{}}",
      "Write-FinalizeLog 'finalizer-start'",
      "while(Get-Process -Id $pidToWait -ErrorAction SilentlyContinue){Start-Sleep -Milliseconds 250}",
      `$outer='${ps(outer)}'; if(Test-Path -LiteralPath $outer){Remove-Item -LiteralPath $outer -Recurse -Force -ErrorAction SilentlyContinue; Write-FinalizeLog 'outer-cleaned'}`,
      `$target='${ps(target)}'; if($target -and (Test-Path -LiteralPath $target)){Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue; Write-FinalizeLog ('file-cleaned '+$target)}`,
      ...(resourcesInsideTemp?[ `$resources='${ps(resourcesPath)}'; if(Test-Path -LiteralPath $resources){Remove-Item -LiteralPath $resources -Recurse -Force -ErrorAction SilentlyContinue; Write-FinalizeLog 'updater-resources-cleaned'}` ]:[]),
      `$runTemp='${ps(runTemp)}'; if(Test-Path -LiteralPath $runTemp){Remove-Item -LiteralPath $runTemp -Recurse -Force -ErrorAction SilentlyContinue; Write-FinalizeLog ('run-temp-cleaned '+$runTemp)}`,
      `$stagedInstall='${ps(stagedInstallDir)}'; if($stagedInstall -and (Test-Path -LiteralPath $stagedInstall)){Remove-Item -LiteralPath $stagedInstall -Recurse -Force -ErrorAction SilentlyContinue; if(Test-Path -LiteralPath $stagedInstall){Write-FinalizeLog 'staged-install-cleanup-failed'}else{Write-FinalizeLog ('staged-install-cleaned '+$stagedInstall)}}`,
    ];
    const encoded=Buffer.from(lines.join('\r\n'),'utf16le').toString('base64');
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',encoded],{detached:true,stdio:'ignore',windowsHide:true});
    child.unref();
    log('self-cleanup-scheduled',{target,outer,updaterPid,resourcesPath,resourcesInsideTemp,finalizeLog});
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
function waitForPid(pid,timeoutMs=15000){
  if(!pid){log('wait-for-schoology-skipped');return Promise.resolve();}
  return new Promise((resolve,reject)=>{
    const started=Date.now();let settled=false;let timer=null;
    const finish=(event,details={},error=null)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);log(event,{pid,elapsedMs:Date.now()-started,...details});error?reject(error):resolve();};
    const tick=()=>{
      if(settled)return;
      const child=execFile('tasklist.exe',['/FI',`PID eq ${pid}`],{windowsHide:true,timeout:2500},(error,stdout,stderr)=>{
        activeProcesses.delete(child);if(settled)return;
        if(error){log('wait-for-schoology-tasklist-result',{error:String(error),stderr:String(stderr||'')});if(Date.now()-started>=timeoutMs)return finish('wait-for-schoology-timeout',{},new Error('Could not verify that Schoology has exited. Please close Schoology and retry the update.'));setTimeout(tick,300);return;}
        const output=String(stdout||'');
        const present=new RegExp(`\\b${pid}\\b`).test(output)&&!(/No tasks are running/i.test(output));
        if(!present)return finish('wait-for-schoology-complete');
        if(Date.now()-started>=timeoutMs)return finish('wait-for-schoology-timeout',{stdout:output.slice(0,500)},new Error('Schoology is still running, so the update was stopped safely. Close Schoology and try again.'));
        setTimeout(tick,300);
      });
      activeProcesses.add(child);
    };
    timer=setTimeout(()=>finish('wait-for-schoology-timeout',{},new Error('Timed out waiting for Schoology to exit. Close Schoology and retry the update.')),timeoutMs+3000);
    tick();
  });
}
function launchSchoologyBeforeUpdaterExit(){
  return new Promise((resolve,reject)=>{
    if(!fs.existsSync(schoologyExe)){
      const error=new Error('Schoology.exe is missing after the update.');
      log('schoology-launch-before-exit-failed',{error:error.message,schoologyExe});
      return reject(error);
    }
    let settled=false;
    const child=spawn(schoologyExe,[],{cwd:SCHOOLGY_DIR,detached:true,stdio:'ignore',windowsHide:false});
    child.once('error',error=>{
      log('schoology-launch-before-exit-error',{error:error?.stack||String(error),schoologyExe});
      if(!settled){settled=true;reject(error);}
    });
    child.once('spawn',()=>{
      child.unref();
      log('schoology-launch-requested-before-updater-exit',{pid:child.pid,schoologyExe,workingDirectory:SCHOOLGY_DIR});
      if(!settled){settled=true;resolve(child.pid||true);}
    });
  });
}
async function main(){
  if(process.platform!=='win32')throw new Error('This updater is Windows-only.');
  if(!payload.url)throw new Error('The Schoology installer URL is missing.');
  fs.mkdirSync(TEMP_DIR,{recursive:true});
  log('startup',{payload:{...payload,parentPid:payload.parentPid},tempDir:TEMP_DIR,schoologyDir:SCHOOLGY_DIR});
  const extractionId=process.pid+'-'+Date.now();
  // Isolate each update attempt so another updater run cannot remove its temporary files.
  const runTempDir=path.join(TEMP_DIR,'run-'+extractionId);
  fs.mkdirSync(runTempDir,{recursive:true});
  const sevenMsi=path.join(runTempDir,'7z2604-x64.msi');
  const installer=path.join(runTempDir,'schoology-installer.exe');
  const outer=path.join(runTempDir,'installer-outer');
  let seven=find7z();
  log('paths',{sevenMsi,installer,outer,seven});
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
  ui('install','determinate','Preparing extraction…',10);log('prepare-extraction',{outer});fs.mkdirSync(outer,{recursive:true});log('extraction-directory-created',{outerExists:fs.existsSync(outer)});
  log('extract-installer-start',{installer,outer});
  await run(seven,['x',installer,`-o${outer}`,'-y']);
  ui('install','determinate','Installer extracted…',45);log('extract-installer-complete',{outerEntries:fs.existsSync(outer)?fs.readdirSync(outer):[]});
  ui('install','determinate','Application files extracted…',70);
  const appRoot=outer;
  fs.mkdirSync(SCHOOLGY_DIR,{recursive:true});
  log('copy-application-start',{outer,appRoot,schoologyDir:SCHOOLGY_DIR,stagedInstallDir:payload.stagedInstallDir||null});
  await run('cmd.exe',['/d','/s','/c','del /q "'+SCHOOLGY_DIR+'\\*"'],{acceptCodes:[0]});
  await run('robocopy.exe',[appRoot,SCHOOLGY_DIR,'/E','/R:2','/W:1'],{
    acceptCodes:[0,1,2,3,4,5,6,7],
    onOutput:()=>ui('install','determinate','Copying application files…',85)
  });
  if(!fs.existsSync(schoologyExe))throw new Error('The update copy finished, but Schoology.exe is missing. Schoology was not relaunched.');
  ui('install','done','Complete',100);cleanupArtifacts([installer,sevenMsi]);completed=true;log('update-complete',{schoologyExe});status('Update complete. Finalizing cleanup…');
  try{
    await launchSchoologyBeforeUpdaterExit();
  }catch(error){
    // The update itself has completed. Keep the updater's cleanup path intact,
    // but record the launch failure instead of falsely reporting install failure.
    log('schoology-relaunch-failed-after-update',{error:error?.stack||String(error)});
    status('Update complete, but Schoology could not be launched.');
  }
  scheduleSelfCleanup(outer,runTempDir);
  if(win&&!win.isDestroyed())win.close();
  app.quit();
}
app.whenReady().then(()=>{createWindow();setTimeout(()=>main().catch(e=>{if(!cancelled)fail(e);}),300);});
app.on('window-all-closed',()=>{});
