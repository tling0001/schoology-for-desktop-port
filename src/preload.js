const {contextBridge,ipcRenderer}=require('electron');
const jsQR=require('jsqr');
contextBridge.exposeInMainWorld('schoology',{
  authState:()=>ipcRenderer.invoke('auth-state'),
  loginCredentials:x=>ipcRenderer.invoke('login-credentials',x),
  loginQR:x=>ipcRenderer.invoke('login-qr',x),
  logout:()=>ipcRenderer.invoke('logout'),
  schoolSearch:q=>ipcRenderer.invoke('school-search',q),
  api:x=>ipcRenderer.invoke('api',x),
  openExternal:u=>ipcRenderer.invoke('open-external',u),
  pickFile:()=>ipcRenderer.invoke('pick-file'),
  decodeQR:(data,width,height)=>jsQR(data,width,height,{inversionAttempts:'dontInvert'})
});
