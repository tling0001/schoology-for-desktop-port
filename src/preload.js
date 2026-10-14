const {contextBridge,ipcRenderer}=require('electron');
// Sandboxed Electron preloads expose only a restricted require() API. Resolve the
// sibling preload URL from the current local document instead of requiring Node's path module.
const webviewPreloadUrl=new URL('webview-preload.js',window.location.href).href;
try{document.documentElement.dataset.electronPlatform=process.platform}catch{}

// The QR decoder is loaded as a browser script in app.html. Sandboxed preloads
// cannot reliably require arbitrary npm packages, so keep this preload built-in-only.

contextBridge.exposeInMainWorld('schoology',{
  onDeepLink:fn=>{const h=(_,url)=>fn(url);ipcRenderer.on('schoology-deep-link',h);ipcRenderer.invoke('renderer-deep-link-ready').catch(e=>console.warn('Could not signal deep-link readiness:',e));return()=>ipcRenderer.removeListener('schoology-deep-link',h)},
  authState:()=>ipcRenderer.invoke('auth-state'),
  getThemeMode:()=>ipcRenderer.invoke('get-theme-mode'),
  getAppVersion:()=>ipcRenderer.invoke('app-version'),
  getOpenSchoologyLinks:()=>ipcRenderer.invoke('get-open-schoology-links'),
  setOpenSchoologyLinks:enabled=>ipcRenderer.invoke('set-open-schoology-links',enabled),
  getDesktopNotifications:()=>ipcRenderer.invoke('get-desktop-notifications'),
  setDesktopNotifications:enabled=>ipcRenderer.invoke('set-desktop-notifications',enabled),
  getNotificationSound:()=>ipcRenderer.invoke('get-notification-sound'),
  setNotificationSound:enabled=>ipcRenderer.invoke('set-notification-sound',enabled),
  setThemeMode:mode=>ipcRenderer.invoke('set-theme-mode',mode),
  getExperimentalForceDark:()=>ipcRenderer.invoke('get-experimental-force-dark'),
  setExperimentalForceDark:enabled=>ipcRenderer.invoke('set-experimental-force-dark',enabled),
  networkOnline:()=>ipcRenderer.invoke('network-online'),
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
  submitAssignmentResource:x=>ipcRenderer.invoke('submit-assignment-resource',x),
  uploadSchoologyFile:x=>ipcRenderer.invoke('upload-schoology-file',x),
  updateAssignmentGrade:x=>ipcRenderer.invoke('update-assignment-grade',x),
  checkForUpdates:()=>ipcRenderer.invoke('check-for-updates'),
  downloadLiquidGlass:()=>ipcRenderer.invoke('download-liquid-glass'),
  downloadExpressive:()=>ipcRenderer.invoke('download-expressive'),
  installUpdate:info=>ipcRenderer.invoke('install-update',info),
  onUpdateAvailable:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('update-available',h);return()=>ipcRenderer.removeListener('update-available',h)},
  onUpdateDownloadProgress:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('update-download-progress',h);return()=>ipcRenderer.removeListener('update-download-progress',h)},
  setWindowChrome:x=>ipcRenderer.invoke('set-window-chrome',x),
  getWindowChromeMode:()=>ipcRenderer.invoke('get-window-chrome-mode'),
  setWindowChromeMode:x=>ipcRenderer.invoke('set-window-chrome-mode',x),
  downloadFile:x=>ipcRenderer.invoke('download-file',x),
  onFileDownloadProgress:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('file-download-progress',h);return()=>ipcRenderer.removeListener('file-download-progress',h)},
  onFileUploadProgress:fn=>{const h=(_,data)=>fn(data);ipcRenderer.on('file-upload-progress',h);return()=>ipcRenderer.removeListener('file-upload-progress',h)},
  launchCourseApp:x=>ipcRenderer.invoke('launch-course-app',x),
  openDownloadedFile:x=>ipcRenderer.invoke('open-downloaded-file',x),
  revealDownloadedFile:x=>ipcRenderer.invoke('reveal-downloaded-file',x),
  openExternal:u=>ipcRenderer.invoke('open-external',u),
  openChromeExtensionFolder:()=>ipcRenderer.invoke('open-chrome-extension-folder'),
  platform:process.platform,
  webviewPreloadUrl,
  pickFile:()=>ipcRenderer.invoke('pick-file')
});
