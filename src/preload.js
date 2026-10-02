const {contextBridge,ipcRenderer}=require('electron');
try{document.documentElement.dataset.electronPlatform=process.platform}catch{}

// Keep the Electron authentication bridge alive even if the optional QR decoder
// cannot be loaded. A failed decoder must never abort the entire preload.
let jsQR=null;
let qrLoadError=null;
try {
  jsQR=require('jsqr');
} catch (e) {
  qrLoadError=String(e && e.message || e);
  console.error('Schoology QR decoder could not load:', qrLoadError);
}

contextBridge.exposeInMainWorld('schoology',{
  authState:()=>ipcRenderer.invoke('auth-state'),
  loginCredentials:x=>ipcRenderer.invoke('login-credentials',x),
  loginQR:x=>ipcRenderer.invoke('login-qr',x),
  loginSchoolBrowser:x=>ipcRenderer.invoke('login-school-browser',x),
  loginExternalSchool:x=>ipcRenderer.invoke('login-external-school',x),
  logout:()=>ipcRenderer.invoke('logout'),
  schoolSearch:q=>ipcRenderer.invoke('school-search',q),
  api:x=>ipcRenderer.invoke('api',x),
  prepareWebSession:()=>ipcRenderer.invoke('prepare-web-session'),
  fetchImage:u=>ipcRenderer.invoke('fetch-image',u),
  submitAssignmentFile:x=>ipcRenderer.invoke('submit-assignment-file',x),
  submitAssignmentText:x=>ipcRenderer.invoke('submit-assignment-text',x),
  updateAssignmentGrade:x=>ipcRenderer.invoke('update-assignment-grade',x),
  checkForUpdates:()=>ipcRenderer.invoke('check-for-updates'),
  installUpdate:info=>ipcRenderer.invoke('install-update',info),
  onUpdateAvailable:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('update-available',h);return()=>ipcRenderer.removeListener('update-available',h)},
  onUpdateDownloadProgress:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('update-download-progress',h);return()=>ipcRenderer.removeListener('update-download-progress',h)},
  setWindowChrome:x=>ipcRenderer.invoke('set-window-chrome',x),
  getWindowChromeMode:()=>ipcRenderer.invoke('get-window-chrome-mode'),
  setWindowChromeMode:x=>ipcRenderer.invoke('set-window-chrome-mode',x),
  downloadFile:x=>ipcRenderer.invoke('download-file',x),
  onFileDownloadProgress:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('file-download-progress',h);return()=>ipcRenderer.removeListener('file-download-progress',h)},
  launchCourseApp:x=>ipcRenderer.invoke('launch-course-app',x),
  openDownloadedFile:x=>ipcRenderer.invoke('open-downloaded-file',x),
  openExternal:u=>ipcRenderer.invoke('open-external',u),
  platform:process.platform,
  pickFile:()=>ipcRenderer.invoke('pick-file'),
  // QR camera scanning normally uses Chromium's native BarcodeDetector in renderer.js.
  // Keep jsQR only as a compatibility fallback; its failure must never prevent startup.
  decodeQR:(data,width,height)=>{
    if(!jsQR) throw new Error('QR fallback decoder is unavailable: '+(qrLoadError||'unknown error'));
    return jsQR(data,width,height,{inversionAttempts:'attemptBoth',greyScaleWeights:{red:0.299,green:0.587,blue:0.114},canOverwriteImage:true});
  },
  qrDecoderAvailable:()=>!!jsQR,
  qrDecoderError:()=>qrLoadError
});
