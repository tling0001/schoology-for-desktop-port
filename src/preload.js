const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('schoologyDesktop', {
  account: { get:()=>ipcRenderer.invoke('account:get'), logout:()=>ipcRenderer.invoke('account:logout') },
  oauth: { start:()=>ipcRenderer.invoke('oauth:start'), finish:(req,verifier)=>ipcRenderer.invoke('oauth:finish',req,verifier) },
  api: (path,method='GET',body=null)=>ipcRenderer.invoke('api',path,method,body),
  openExternal:(url)=>ipcRenderer.invoke('open:external',url),
  openFiles:()=>ipcRenderer.invoke('file:open'),
  saveFile:(name)=>ipcRenderer.invoke('file:save',name)
});
