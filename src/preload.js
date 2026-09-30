const {contextBridge,ipcRenderer}=require('electron');

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
  downloadFile:x=>ipcRenderer.invoke('download-file',x),
  launchCourseApp:x=>ipcRenderer.invoke('launch-course-app',x),
  openDownloadedFile:x=>ipcRenderer.invoke('open-downloaded-file',x),
  openExternal:u=>ipcRenderer.invoke('open-external',u),
  pickFile:()=>ipcRenderer.invoke('pick-file'),
  decodeQR:(data,width,height)=>{
    if(!jsQR) throw new Error('QR decoder is unavailable: '+(qrLoadError||'unknown error'));
    return jsQR(data,width,height,{inversionAttempts:'attemptBoth',greyScaleWeights:{red:0.299,green:0.587,blue:0.114},canOverwriteImage:true});
  },
  qrDecoderAvailable:()=>!!jsQR,
  qrDecoderError:()=>qrLoadError
});
