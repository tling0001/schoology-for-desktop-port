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
  logout:()=>ipcRenderer.invoke('logout'),
  schoolSearch:q=>ipcRenderer.invoke('school-search',q),
  api:x=>ipcRenderer.invoke('api',x),
  openExternal:u=>ipcRenderer.invoke('open-external',u),
  pickFile:()=>ipcRenderer.invoke('pick-file'),
  decodeQR:(data,width,height)=>{
    if(!jsQR) throw new Error('QR decoder is unavailable: '+(qrLoadError||'unknown error'));
    return jsQR(data,width,height,{inversionAttempts:'dontInvert'});
  },
  qrDecoderAvailable:()=>!!jsQR,
  qrDecoderError:()=>qrLoadError
});
