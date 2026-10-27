/* Native Tauri compatibility bridge for the Schoology application renderer. */
(function () {
  'use strict';
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) return;
  const invoke = (name, args) => tauri.core.invoke('schoology_invoke', { name, args: args === undefined ? null : args });
  // The main Schoology app intentionally has no browser right-click menu. The native
  // context menu is handled separately inside embedded Schoology webviews only.
  document.addEventListener('contextmenu', event => event.preventDefault(), true);
  const listeners = new Map();
  let webSessionCache = null;
  let webSessionPending = null;
  const embeddedViews = new Set();
  // Explicitly detach native child surfaces whenever the renderer leaves its embedded-page state.
  window.addEventListener('schoology-close-embedded-webviews', () => { for (const view of [...embeddedViews]) { try { view.remove(); } catch (_) {} } });
  let currentThemeMode = 'system';
  let forceDarkMode = false;
  const resolvedDark = () => forceDarkMode || currentThemeMode === 'dark' || (currentThemeMode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const prepareWebSession = () => {
    if (webSessionCache) return Promise.resolve(webSessionCache);
    if (webSessionPending) return webSessionPending;
    webSessionPending = invoke('prepare-web-session').then(value => {
      webSessionCache = value;
      return value;
    }).finally(() => { webSessionPending = null; });
    return webSessionPending;
  };
  if (tauri.event?.listen) tauri.event.listen('schoology-clear-web-session', () => {
    webSessionCache = null;
    webSessionPending = null;
    window.dispatchEvent(new Event('schoology-clear-web-session'));
  }).catch(() => {});
  if (tauri.event?.listen) tauri.event.listen('embedded-download-finished', event => {
    const payload = event?.payload || {};
    window.dispatchEvent(new CustomEvent('schoology-embedded-download-finished', { detail: payload }));
  }).catch(() => {});
  if (tauri.event?.listen) tauri.event.listen('embedded-download-requested', async event => {
    const payload = event?.payload || {};
    const requestedUrl = String(payload.url || '');
    const label = String(payload.label || '');
    try {
      const result = await invoke('download-file', { url: requestedUrl, filename: payload.filename || 'Schoology-file', mime: payload.mime || 'application/octet-stream', webviewLabel: label, progressId: `webview-${Date.now()}` });
      await invoke('open-downloaded-file', { path: result.path });
    } catch (error) {
      console.error('Schoology download failed:', error);
      const view = [...embeddedViews].find(item => item._label === label);
      if (view) dispatchCompatEvent(view, 'download-failed', { url: requestedUrl, errorDescription: String(error?.message || error) });
    }
  }).catch(() => {});
  const emit = (name, payload) => {
    for (const callback of listeners.get(name) || []) {
      try { callback(payload); } catch (error) { console.error('Schoology event callback failed:', error); }
    }
  };
  const subscribe = (name, callback) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    let unlisten;
    if (tauri.event?.listen) tauri.event.listen(name, event => callback(event.payload)).then(fn => { unlisten = fn; }).catch(() => {});
    if (name === 'schoology-deep-link') invoke('renderer-deep-link-ready').catch(() => {});
    return () => { listeners.get(name)?.delete(callback); if (unlisten) unlisten(); };
  };
  const dispatchCompatEvent = (target, name, values = {}, cancelable = false) => {
    const event = new CustomEvent(name, { detail: values, cancelable });
    for (const [key, value] of Object.entries(values)) {
      try { Object.defineProperty(event, key, { configurable: true, enumerable: true, value }); } catch (_) {}
    }
    return target.dispatchEvent(event);
  };
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const platform = /Android/i.test(ua) ? 'android' : isIOS ? 'ios' : /Windows/i.test(ua) ? 'win32' : /Macintosh/i.test(ua) ? 'darwin' : 'linux';
  document.documentElement.dataset.electronPlatform = platform;
  const schoologyLayoutStyle = document.createElement('style');
  schoologyLayoutStyle.textContent = '.profileAndroidPage:not(.profileLandscapePage){display:flex!important;flex-direction:column!important;min-height:100%}.profileAndroidPage:not(.profileLandscapePage)>.profileTabs{order:0!important;flex:0 0 auto!important}.profileAndroidPage:not(.profileLandscapePage)>.profileHeader{order:1!important;flex:0 0 auto!important}.profileAndroidPage:not(.profileLandscapePage)>#profileTabContent{order:2!important;flex:1 1 auto!important;min-height:0!important}html[data-electron-platform="android"] .settingsPage label:has(#windowChromeOverlayToggle),html[data-electron-platform="ios"] .settingsPage label:has(#windowChromeOverlayToggle){display:none!important}';
  document.head.appendChild(schoologyLayoutStyle);
  const syncToolbarIdentity = () => { if (document.querySelector('#content .courseLandscapePage')) return; const profile = document.querySelector('#content .profileHeader h1'); const desired = String(profile?.textContent || '').trim(); const title = document.querySelector('.toolbarTitle'); if (desired && title && title.textContent !== desired) title.textContent = desired; }; // Course titles are managed by the renderer so the official `Course : Section` title is not overwritten by the plain identity-card title.
  if (typeof MutationObserver !== 'undefined') { const titleObserver = new MutationObserver(() => requestAnimationFrame(syncToolbarIdentity)); titleObserver.observe(document.documentElement, {subtree:true,childList:true,characterData:true}); }
  document.addEventListener('DOMContentLoaded', syncToolbarIdentity);
  const isExternalLoginCandidate = (raw, expectedDomain) => {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'https:') return false;
      const host = url.hostname.toLowerCase();
      if (url.search.includes('sgyInitialPage')) return true;
      if (host === 'schoology.com' || host.endsWith('.schoology.com') || host === 'schoologyca.com' || host.endsWith('.schoologyca.com') || host === 'lms.lausd.net' || host.endsWith('.lms.lausd.net')) return true;
      const expected = String(expectedDomain || '').replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      return !!expected && (host === expected || host.endsWith('.' + expected));
    } catch (_) { return false; }
  };
  const loginExternalSchool = info => new Promise((resolve, reject) => {
    const initial = String(info?.url || '');
    let parsed;
    try { parsed = new URL(initial); } catch (_) { reject(new Error('This school provided an invalid login URL.')); return; }
    if (parsed.protocol !== 'https:') { reject(new Error('School sign-in must use HTTPS.')); return; }
    const Constructor = tauri.webviewWindow?.WebviewWindow;
    if (!Constructor) { reject(new Error('The native district sign-in window is unavailable.')); return; }
    const label = `schoology-sso-${Math.random().toString(36).slice(2, 11)}`;
    let child;
    let settled = false;
    let processing = false;
    let latestUrl = initial;
    let timeout;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) reject(error); else resolve(value);
      try { child?.close(); } catch (_) {}
    };
    const inspect = async raw => {
      if (settled || processing || !isExternalLoginCandidate(raw, info?.domain)) return;
      processing = true;
      try {
        const result = await invoke('login-external-school', { label, url: String(raw), domain: String(info?.domain || '') });
        if (result?.ready === false) { processing = false; return; }
        finish(null, result?.auth || result);
      } catch (error) {
        const message = String(error?.message || error || 'District sign-in failed.');
        if (/no SESS cookie|session cookie is not available/i.test(message)) { processing = false; return; }
        finish(new Error(message));
      }
    };
    try {
      child = new Constructor(label, {
        url: initial,
        title: 'Sign in to your school',
        width: 1100,
        height: 800,
        minWidth: 720,
        minHeight: 520,
        center: true,
        focus: true,
        resizable: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 Schoology Android v2026.10.0'
      });
      child.onNavigation(url => { latestUrl = String(url || latestUrl); return true; }).catch(error => finish(error));
      child.onPageLoad(event => {
        const payload = event?.payload || event || {};
        if (payload.event !== 'Finished') return;
        latestUrl = String(payload.url || latestUrl);
        void inspect(latestUrl);
      }).catch(error => finish(error));
      child.onCloseRequested(() => {
        if (!settled) finish(new Error('School login window was closed.'));
      }).catch(() => {});
      timeout = setTimeout(() => finish(new Error('Timed out waiting for school sign-in. Finish signing in and wait for Schoology to return to the app.')), 10 * 60 * 1000);
    } catch (error) { finish(error); }
  });

  const schoology = {
    onDeepLink: callback => subscribe('schoology-deep-link', callback),
    onNotificationOpen: callback => subscribe('schoology-notification-open', callback),
    onNotificationError: callback => subscribe('schoology-notification-error', callback),
    onNotificationPollError: callback => subscribe('schoology-notification-poll-error', callback),
    testDesktopNotification: () => invoke('test-desktop-notification'),
    annotationRequest: args => invoke('annotation-request', args),
    authState: () => invoke('auth-state'),
    getServerInstance: () => invoke('get-server-instance'),
    setServerInstance: enabled => invoke('set-server-instance', enabled),
    getThemeMode: () => invoke('get-theme-mode'),
    getAppVersion: () => invoke('app-version'),
    getOpenSchoologyLinks: () => invoke('get-open-schoology-links'),
    setOpenSchoologyLinks: enabled => invoke('set-open-schoology-links', enabled),
    getDesktopNotifications: () => invoke('get-desktop-notifications'),
    setDesktopNotifications: enabled => invoke('set-desktop-notifications', enabled),
    getNotificationSound: () => invoke('get-notification-sound'),
    setNotificationSound: enabled => invoke('set-notification-sound', enabled),
    getReducedMotion: () => invoke('get-reduced-motion'),
    setReducedMotion: enabled => invoke('set-reduced-motion', enabled),
    setThemeMode: async mode => { const result = await invoke('set-theme-mode', mode); currentThemeMode = String(mode || 'system'); window.dispatchEvent(new CustomEvent('schoology-tauri-theme-changed')); return result; },
    getExperimentalForceDark: () => invoke('get-experimental-force-dark'),
    setExperimentalForceDark: async enabled => { const result = await invoke('set-experimental-force-dark', enabled); forceDarkMode = !!enabled; window.dispatchEvent(new CustomEvent('schoology-tauri-theme-changed')); return result; },
    networkOnline: () => invoke('network-online'),
    loginCredentials: value => invoke('login-credentials', value),
    loginQR: value => invoke('login-qr', value),
    loginSchoolBrowser: value => invoke('login-school-browser', value),
    loginExternalSchool: value => loginExternalSchool(value),
    logout: async () => { const result = await invoke('logout'); webSessionCache = null; webSessionPending = null; return result; },
    schoolSearch: query => invoke('school-search', query),
    api: value => invoke('api', value),
    prepareWebSession,
    fetchImage: url => invoke('fetch-image', url),
    submitAssignmentFile: value => invoke('submit-assignment-file', value),
    submitAssignmentText: value => invoke('submit-assignment-text', value),
    submitAssignmentResource: value => invoke('submit-assignment-resource', value),
    uploadSchoologyFile: value => invoke('upload-schoology-file', value),
    updateAssignmentGrade: value => invoke('update-assignment-grade', value),
    checkForUpdates: () => invoke('check-for-updates'),
    downloadLiquidGlass: () => invoke('download-liquid-glass'),
    downloadExpressive: () => invoke('download-expressive'),
    installUpdate: value => invoke('install-update', value),
    onUpdateAvailable: callback => subscribe('update-available', callback),
    onUpdateDownloadProgress: callback => subscribe('update-download-progress', callback),
    setWindowChrome: value => invoke('set-window-chrome', value),
    getWindowChromeMode: () => invoke('get-window-chrome-mode'),
    setWindowChromeMode: value => invoke('set-window-chrome-mode', value),
    startWindowDragging: () => invoke('window-start-dragging'),
    downloadFile: value => invoke('download-file', value),
    onFileDownloadProgress: callback => subscribe('file-download-progress', callback),
    onEmbeddedDownloadFinished: callback => subscribe('embedded-download-finished', callback),
    onFileUploadProgress: callback => subscribe('file-upload-progress', callback),
    launchCourseApp: value => invoke('launch-course-app', value),
    openDownloadedFile: value => invoke('open-downloaded-file', value),
    revealDownloadedFile: value => invoke('reveal-downloaded-file', value),
    openExternal: url => invoke('open-external', url),
    openChromeExtensionFolder: () => invoke('open-chrome-extension-folder'),
    platform,
    webviewPreloadUrl: new URL('webview-preload.js', window.location.href).href,
    pickFile: () => invoke('pick-file')
  };
  window.schoology = schoology;

  // The native overlay is created only when the saved preference is enabled.
  // The Rust host removes the system frame on restart, so these controls are
  // the actual minimize/maximize/close affordances rather than a visual mock.
  const installWindowControls = async () => {
    let mode;
    try { mode = await invoke('get-window-chrome-mode'); } catch (_) { return; }
    const overlayEnabled = mode?.overlay === true && platform !== 'android' && platform !== 'ios';
    document.documentElement.dataset.windowControlsOverlay = String(overlayEnabled);
    if (platform === 'darwin') {
      const syncNativeMacControls = () => {
        const drawerOpen = !!document.getElementById('drawer')?.classList.contains('open');
        invoke('set-macos-window-controls-visible', { visible: !(overlayEnabled && drawerOpen) }).catch(error => console.warn('Could not synchronize native macOS window controls:', error));
      };
      syncNativeMacControls();
      const drawerObserver = new MutationObserver(syncNativeMacControls);
      drawerObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
      document.addEventListener('click', event => {
        if (event.target?.closest?.('#menuButton, #drawerShade, #drawer [data-action], #drawer button, #drawer a')) setTimeout(syncNativeMacControls, 80);
      }, true);
      return;
    }
    if (!overlayEnabled || document.getElementById('tauriWindowControls')) return;
    const controls = document.createElement('div');
    controls.id = 'tauriWindowControls';
    controls.setAttribute('data-tauri-drag-region', '');
    controls.setAttribute('role', 'toolbar');
    controls.setAttribute('aria-label', 'Window controls');
    const dragArea = '<div class="tauriWindowDragArea" data-tauri-drag-region></div>';
    const controlButtons = '<button type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize"></button><button type="button" data-window-action="maximize" aria-label="Maximize" title="Maximize"></button><button type="button" data-window-action="close" aria-label="Close" title="Close"></button>';
    const macControlButtons = '<button type="button" data-window-action="close" aria-label="Close" title="Close"></button><button type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize"></button><button type="button" data-window-action="maximize" aria-label="Maximize" title="Maximize"></button>';
    controls.innerHTML = platform === 'darwin' ? macControlButtons + dragArea : dragArea + controlButtons;
    controls.addEventListener('click', async event => {
      const button = event.target.closest('button[data-window-action]');
      if (!button) return;
      event.preventDefault(); event.stopPropagation();
      const action = button.dataset.windowAction;
      try {
        if (action === 'minimize') await invoke('window-minimize');
        if (action === 'maximize') {
          await invoke('window-toggle-maximize');
          const maximized = await invoke('window-is-maximized').catch(() => false);
          button.dataset.maximized = String(maximized);
          button.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
          button.title = maximized ? 'Restore' : 'Maximize';
        }
        if (action === 'close') await invoke('window-close');
      } catch (error) { console.warn('Window-control action failed:', action, error); }
    });
    controls.addEventListener('dblclick', event => {
      if (event.target.closest('button')) return;
      invoke('window-toggle-maximize').catch(() => {});
    });
    document.body.appendChild(controls);
    const overlayStyle = document.createElement('style');
    overlayStyle.textContent = platform === 'darwin' ? 'html[data-window-controls-overlay="true"] .shell>.toolbar{padding-left:82px!important;box-sizing:border-box!important}html[data-window-controls-overlay="true"] .shell>.toolbar>.toolbarActionSlot{margin-left:auto!important}' : 'html[data-window-controls-overlay="true"] .toolbar{display:grid!important;grid-template-columns:44px minmax(0,1fr) auto var(--tauri-window-controls-width,138px)!important;column-gap:0!important;padding:0!important;overflow:hidden!important;box-sizing:border-box!important}html[data-window-controls-overlay="true"] .toolbar>.toolbarActionSlot{grid-column:3!important;grid-row:1!important;position:static!important;width:auto!important;min-width:0!important;max-width:none!important;height:56px!important;margin:0!important;padding:0!important;flex:0 0 auto!important;justify-content:flex-end!important}';
    document.head.appendChild(overlayStyle);
    const updateControlWidth = () => {
      const width = controls.getBoundingClientRect().width;
      if (width > 0) document.documentElement.style.setProperty('--tauri-window-controls-width', `${Math.ceil(width)}px`);
      const toolbar = document.querySelector('.shell > .toolbar');
      if (toolbar) {
        const background = getComputedStyle(toolbar).backgroundColor;
        if (background && background !== 'rgba(0, 0, 0, 0)') document.documentElement.style.setProperty('--tauri-window-controls-bg', background);
      }
    };
    updateControlWidth();
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(updateControlWidth); observer.observe(controls); }
    window.addEventListener('resize', updateControlWidth);
  };
  // With overlay enabled, unused app-bar space starts a native drag. Controls stay clickable.
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (document.documentElement.dataset.windowControlsOverlay !== 'true') return;
    const target = event.target;
    const toolbar = target?.closest?.('.shell > .toolbar');
    const controlsWidth = document.getElementById('tauriWindowControls')?.getBoundingClientRect().width || 0;
    const topStrip = event.clientY >= 0 && event.clientY <= 56 && event.clientX < Math.max(0, window.innerWidth - controlsWidth);
    if (!toolbar && !topStrip) return;
    if (target?.closest?.('button,a,input,textarea,select,[role="button"],.toolbarActionSlot,#tauriWindowControls,img')) return;
    invoke('window-start-dragging').catch(() => {});
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWindowControls, { once: true });
  else installWindowControls();

  const makeEmbeddedThemeBootstrap = (dark, session = null, viewLabel = '') => `(() => {
    const session = ${JSON.stringify(session && typeof session === 'object' ? session : null)};
    const nativeLabel = ${JSON.stringify(String(viewLabel || ''))};
    const host = String(location.hostname || '').toLowerCase();
    if (session && (host === 'app.schoology.com' || host.endsWith('.schoology.com') || host === 'app.schoologyca.com' || host.endsWith('.schoologyca.com'))) {
      const setCookie = (name, value, path = '/', domain = '') => {
        if (!name || /[\\r\\n;,=]/.test(name) || /[\\r\\n;,]/.test(value)) return;
        let line = name + '=' + value + '; Path=' + (String(path || '/').startsWith('/') ? path : '/');
        const safeDomain = String(domain || '').trim().replace(/^\\./, '').toLowerCase();
        if (safeDomain === 'schoology.com' || safeDomain.endsWith('.schoology.com') || safeDomain === 'schoologyca.com' || safeDomain.endsWith('.schoologyca.com')) line += '; Domain=.' + safeDomain;
        line += '; Secure';
        document.cookie = line;
      };
      const defaultDomain = host === 'app.schoologyca.com' || host.endsWith('.schoologyca.com') ? '.schoologyca.com' : '.schoology.com';
      for (const cookie of (Array.isArray(session.cookies) ? session.cookies : [])) {
        setCookie(String(cookie.key || cookie.name || ''), String(cookie.value || ''), String(cookie.path || '/'), String(cookie.domain || defaultDomain));
      }
      if (session.mobileCookie) setCookie('s_mobile', String(session.mobileCookie), '/', defaultDomain);
      window.__schoologySessionBootstrapReady = true;
    }
    const dark = ${JSON.stringify(!!dark)};
    const styleId = 'schoology-shared-webview-theme-style';
    const css = 'html[data-schoology-shade-inversion="true"]{color-scheme:dark!important;background:#17191c!important}html[data-schoology-shade-inversion="true"] body{filter:invert(1) hue-rotate(180deg)!important}html[data-schoology-shade-inversion="true"] img,html[data-schoology-shade-inversion="true"] picture,html[data-schoology-shade-inversion="true"] video,html[data-schoology-shade-inversion="true"] canvas,html[data-schoology-shade-inversion="true"] svg,html[data-schoology-shade-inversion="true"] iframe,html[data-schoology-shade-inversion="true"] object,html[data-schoology-shade-inversion="true"] embed{filter:invert(1) hue-rotate(180deg)!important}';
    const root = document.documentElement;
    if (!root) return;
    // Disable all browser/native context menus inside embedded Schoology pages.
    document.addEventListener('contextmenu', event => event.preventDefault(), true);
Tauri child webviews do not implement Electron's native allowpopups/preload
    // contract. Keep Schoology pages inside this view, but send non-Schoology
    // destinations to the user's default browser.
    const internalHost = value => { try { const u = new URL(value, location.href); const h = u.hostname.toLowerCase(); return ['app.schoology.com','schoology.com','app.schoologyca.com','schoologyca.com','lms.lausd.net'].includes(h) || h.endsWith('.schoology.com') || h.endsWith('.schoologyca.com') || h.endsWith('.lms.lausd.net'); } catch (_) { return false; } };
    const openExternal = value => { try { const href = new URL(String(value || ''), location.href); if (href.protocol === 'https:' || href.protocol === 'http:') location.href = href.href; } catch (_) {} };
    if (!window.__schoologyTauriPopupShim) {
      window.__schoologyTauriPopupShim = true;
      window.open = (value) => { const href = new URL(String(value || ''), location.href).href; if (internalHost(href)) location.href = href; else openExternal(href); return null; };
      document.addEventListener('click', event => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor) return;
        const href = new URL(anchor.href, location.href).href;
        if (anchor.hasAttribute('download')) {
          event.preventDefault(); event.stopImmediatePropagation();
          if (!internalHost(href)) { openExternal(href); return; }
          const filename = anchor.download || (new URL(href)).pathname.split('/').filter(Boolean).pop() || 'Schoology-file';
          const mime = anchor.type || '';
          location.href = 'schoology-download://request?url=' + encodeURIComponent(href) + '&filename=' + encodeURIComponent(filename) + '&mime=' + encodeURIComponent(mime);
          return;
        }
        if (anchor.target === '_blank' || anchor.relList?.contains('external')) {
          event.preventDefault(); event.stopImmediatePropagation();
          if (internalHost(href)) location.href = href; else openExternal(href);
        }
      }, true);
    }
    root.dataset.schoologyNativeDark = dark ? 'true' : 'false';
    let style = document.getElementById(styleId);
    if (!style) { style = document.createElement('style'); style.id = styleId; style.textContent = css; (document.head || root).appendChild(style); }
    const rgb = value => { const m = String(value || '').match(/^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+%?))?\\s*\\)$/i); if (!m) return null; const a = m[4] === undefined ? 1 : (String(m[4]).endsWith('%') ? Number(m[4].slice(0,-1))/100 : Number(m[4])); return {r:Number(m[1]),g:Number(m[2]),b:Number(m[3]),a}; };
    const apply = () => {
      const body = document.body;
      if (!body) return;
      const nodes = [document.querySelector('main'), document.querySelector('[role="main"]'), document.querySelector('#page'), document.querySelector('#container'), document.querySelector('#content'), body, root].filter(Boolean);
      const surfaces = nodes.map(el => { const c = rgb(getComputedStyle(el).backgroundColor); if (!c || c.a < .08) return null; const r = el.getBoundingClientRect(); return {area:Math.max(0,r.width)*Math.max(0,r.height), luminance:.2126*c.r+.7152*c.g+.0722*c.b, chroma:Math.max(c.r,c.g,c.b)-Math.min(c.r,c.g,c.b)}; }).filter(Boolean).sort((a,b) => b.area-a.area);
      const light = surfaces.length ? surfaces[0].luminance >= 145 && surfaces[0].chroma < 100 : true;
      root.toggleAttribute('data-schoology-shade-inversion', dark && light);
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true}); else apply();
    setTimeout(apply, 150);
    setTimeout(apply, 700);
    setTimeout(apply, 1800);
  })();`;

  // A deliberately narrow custom-element adapter for the renderer's existing <webview> markup.
  // Tauri child webviews are separate native surfaces; full event/preload parity is still pending.
  if (tauri.webview?.Webview && !customElements.get('schoology-webview')) {
    class TauriEmbeddedWebview extends HTMLElement {
      constructor() {
        super();
        this.nativeView = null;
        this.loading = false;
        this._url = '';
        this._observer = null;
        this._parentObserver = null;
        this._mutationObserver = null;
        this._syncFrame = 0;
        this._motionSyncFrame = 0;
        this._motionSyncActive = false;
        this._motionTargets = new Set();
        this._motionStartHandler = event => {
          const target = event?.target;
          if (!this.isConnected || !target || !(target === this || target.contains?.(this) || this.contains?.(target))) return;
          this._startMotionBoundsSync(target);
        };
        this._motionEndHandler = event => {
          const target = event?.target;
          if (!target || !(target === this || target.contains?.(this) || this.contains?.(target))) return;
          const stillAnimating = typeof target.getAnimations === "function" && target.getAnimations().some(animation => animation.playState === "running" || animation.playState === "pending");
          if (!stillAnimating) this._motionTargets.delete(target);
          if (!this._motionTargets.size) this._stopMotionBoundsSync();
          this._syncHandler();
        };
        this._boundsSyncRunning = false;
        this._boundsSyncAgain = false;
        this._closingNativeView = false;
        this._syncHandler = () => {
          if (this._syncFrame) return;
          this._syncFrame = requestAnimationFrame(() => { this._syncFrame = 0; void this._syncBounds(); });
        };
        this._clearSessionHandler = () => {
          if (!this.nativeView) return;
          // Clear the native cookie/storage partition as well as JS-visible cookies;
          // document.cookie alone cannot clear HttpOnly district SSO cookies.
          this.nativeView.clearAllBrowsingData().catch(() => {});
          this.nativeView.eval(`(() => { const host = location.hostname.toLowerCase(); if (host !== 'app.schoology.com' && !host.endsWith('.schoology.com') && host !== 'app.schoologyca.com' && !host.endsWith('.schoologyca.com')) return; for (const item of document.cookie.split(';')) { const name = item.split('=')[0].trim(); if (!name) continue; document.cookie = name + '=; Max-Age=0; Path=/; Secure'; document.cookie = name + '=; Max-Age=0; Path=/; Domain=.schoology.com; Secure'; document.cookie = name + '=; Max-Age=0; Path=/; Domain=.schoologyca.com; Secure'; } })()`).catch(() => {});
        };
        this._unlistenPageLoad = null;
        this._settingSrc = false;
        this._ltiNavigation = false;
        this._hasLoadedPage = false;
      }
      static get observedAttributes() { return ['src']; }
      attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'src' && oldValue !== newValue && this.isConnected && this.nativeView && !this._settingSrc && newValue) {
          this.loadURL(newValue).catch(error => dispatchCompatEvent(this, 'did-fail-load', { errorDescription: String(error), isMainFrame: true }));
        }
      }
      get src() { return this.getAttribute('src') || ''; }
      set src(value) {
        const next = String(value || '');
        if (this.getAttribute('src') === next) { if (this.nativeView && next) this.loadURL(next).catch(() => {}); return; }
        this.setAttribute('src', next);
      }
      connectedCallback() {
        this._closingNativeView = false;
        embeddedViews.add(this);
        this._themeHandler = () => {
          if (!this.nativeView) return;
          const dark = resolvedDark();
          this._darkTheme = dark;
          this.nativeView.eval(makeEmbeddedThemeBootstrap(dark, null, this._label)).catch(() => {});
        };
        window.addEventListener('schoology-tauri-theme-changed', this._themeHandler);
        this.style.display = 'block';
        this.style.position = 'absolute';
        this.style.inset = '0';
        this.style.width = '100%';
        this.style.height = '100%';
        this.style.minWidth = '1px';
        this.style.minHeight = '1px';
        this.style.background = '#fff';
        this._observer = new ResizeObserver(this._syncHandler);
        this._observer.observe(this);
        this._observeLayoutAncestors();
        this._mutationObserver = new MutationObserver(this._syncHandler);
        this._mutationObserver.observe(document.getElementById('app') || document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class','style','hidden','aria-hidden'] });
        window.addEventListener('scroll', this._syncHandler, true);
        window.addEventListener('resize', this._syncHandler);
        document.addEventListener('transitionrun', this._motionStartHandler, true);
        document.addEventListener('animationstart', this._motionStartHandler, true);
        document.addEventListener('transitionend', this._motionEndHandler, true);
        document.addEventListener('transitioncancel', this._motionEndHandler, true);
        document.addEventListener('animationend', this._motionEndHandler, true);
        document.addEventListener('animationcancel', this._motionEndHandler, true);
        window.addEventListener('schoology-clear-web-session', this._clearSessionHandler);
        const initial = this.getAttribute('src');
        if (initial) this.loadURL(initial).catch(error => dispatchCompatEvent(this, 'did-fail-load', { errorDescription: String(error), isMainFrame: true }));
      }
      _observeLayoutAncestors() {
        this._parentObserver?.disconnect();
        this._parentObserver = new ResizeObserver(this._syncHandler);
        let parent = this.parentElement;
        while (parent) { this._parentObserver.observe(parent); parent = parent.parentElement; }
      }
      disconnectedCallback() {
        this._closingNativeView = true;
        this._observer?.disconnect();
        this._parentObserver?.disconnect();
        this._mutationObserver?.disconnect();
        if (this._syncFrame) cancelAnimationFrame(this._syncFrame);
        this._syncFrame = 0;
        window.removeEventListener('scroll', this._syncHandler, true);
        window.removeEventListener('resize', this._syncHandler);
        document.removeEventListener('transitionrun', this._motionStartHandler, true);
        document.removeEventListener('animationstart', this._motionStartHandler, true);
        document.removeEventListener('transitionend', this._motionEndHandler, true);
        document.removeEventListener('transitioncancel', this._motionEndHandler, true);
        document.removeEventListener('animationend', this._motionEndHandler, true);
        document.removeEventListener('animationcancel', this._motionEndHandler, true);
        this._motionTargets.clear();
        this._stopMotionBoundsSync();
        window.removeEventListener('schoology-clear-web-session', this._clearSessionHandler);
        window.removeEventListener('schoology-tauri-theme-changed', this._themeHandler);
        embeddedViews.delete(this);
        this._unlistenNavigation?.();
        this._unlistenPageLoad?.();
        if (this.nativeView) {
          const view = this.nativeView;
          const label = this._label;
          this.nativeView = null;
          // Keep the native handle alive until Rust has detached the child from its
          // parent window. Closing it in JS first can make get_webview(label) fail,
          // leaving a stale native surface over the renderer and stealing clicks.
          void (async () => {
            try { await view.setPosition(new tauri.dpi.LogicalPosition(-10000, -10000)); } catch (_) {}
            try { await view.setSize(new tauri.dpi.LogicalSize(1, 1)); } catch (_) {}
            try { await view.hide(); } catch (_) {}
            let hostClosed = false;
            if (label) {
              try { hostClosed = (await invoke('close-embedded-webview', { label })) === true; }
              catch (error) { console.warn('Rust could not detach the embedded Schoology webview:', error); }
            }
            // Only use the JS close as a fallback when the native host no longer
            // owns the child. Do not race two close operations against the same view.
            if (!hostClosed) {
              try { await view.close(); } catch (error) { console.warn('Could not close the embedded Schoology webview:', error); }
            }
          })();
        }
      }
      _startMotionBoundsSync(target) {
        this._motionTargets.add(target);
        if (this._motionSyncFrame || this._motionSyncActive) return;
        this._motionSyncActive = true;
        const tick = () => {
          this._motionSyncFrame = 0;
          if (!this.isConnected || !this.nativeView || !this._motionTargets.size) { this._stopMotionBoundsSync(); return; }
          this._syncHandler();
          this._motionSyncFrame = requestAnimationFrame(tick);
        };
        this._motionSyncFrame = requestAnimationFrame(tick);
      }
      _stopMotionBoundsSync() {
        this._motionSyncActive = false;
        if (this._motionSyncFrame) cancelAnimationFrame(this._motionSyncFrame);
        this._motionSyncFrame = 0;
      }
      async _syncBounds() {
        if (this._boundsSyncRunning) { this._boundsSyncAgain = true; return; }
        this._boundsSyncRunning = true;
        try { do { this._boundsSyncAgain = false; await this._syncBoundsOnce(); } while (this._boundsSyncAgain && this.isConnected && this.nativeView); }
        finally { this._boundsSyncRunning = false; }
      }
      async _syncBoundsOnce() {
        const view = this.nativeView;
        if (!view || !this.isConnected || this._closingNativeView) return;
        const rect=this.getBoundingClientRect(),style=getComputedStyle(this);
        let left=rect.left,top=rect.top,right=rect.right,bottom=rect.bottom;
        let visible=this._hasLoadedPage&&!this.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;
        // A native child surface is not clipped by CSS overflow, transforms, or scroll containers.
        // Intersect its rectangle with every clipping ancestor and the viewport before positioning it.
        for(let ancestor=this.parentElement;visible&&ancestor;ancestor=ancestor.parentElement){
          const astyle=getComputedStyle(ancestor),ar=ancestor.getBoundingClientRect();
          if(ancestor.hidden||astyle.display==='none'||astyle.visibility==='hidden'||astyle.visibility==='collapse'||Number(astyle.opacity)===0){visible=false;break}
          if(['hidden','clip','auto','scroll'].includes(astyle.overflowX)){left=Math.max(left,ar.left);right=Math.min(right,ar.right)}
          if(['hidden','clip','auto','scroll'].includes(astyle.overflowY)){top=Math.max(top,ar.top);bottom=Math.min(bottom,ar.bottom)}
        }
        const toolbar=document.querySelector('.toolbar');
        if(platform==='win32'&&toolbar){const tr=toolbar.getBoundingClientRect();if(left<tr.right&&right>tr.left&&top<tr.bottom&&bottom>tr.top)top=Math.max(top,tr.bottom);}
        left=Math.max(0,left);top=Math.max(0,top);right=Math.min(innerWidth,right);bottom=Math.min(innerHeight,bottom);
        const width=right-left,height=bottom-top;
        if(width<=1||height<=1)visible=false;
        try{
          if(!visible){
            await view.setPosition(new tauri.dpi.LogicalPosition(-10000,-10000)).catch(()=>{});
            await view.setSize(new tauri.dpi.LogicalSize(1,1)).catch(()=>{});
            await view.hide();return;
          }
          await view.setPosition(new tauri.dpi.LogicalPosition(left,top));
          if (this._closingNativeView || !this.isConnected || this.nativeView !== view) { await view.hide().catch(()=>{}); return; }
          await view.setSize(new tauri.dpi.LogicalSize(width,height));
          if (this._closingNativeView || !this.isConnected || this.nativeView !== view) { await view.hide().catch(()=>{}); return; }
          await view.show();
        }catch(error){console.warn('Could not synchronize Schoology embedded webview bounds:',error)}
      }
      async loadURL(url) {
        this._url = String(url);
        if(!this.nativeView)this._hasLoadedPage = false;
        this._ltiNavigation = this.hasAttribute('data-lti') && this.getAttribute('data-lti') !== 'false';
        this._settingSrc = true;
        this.setAttribute('src', this._url);
        this._settingSrc = false;
        dispatchCompatEvent(this, 'did-start-navigation', { url: this._url, isMainFrame: true });
        if (!this.nativeView) {
          const parent = tauri.webviewWindow?.getCurrentWebviewWindow?.();
          if (!parent) throw new Error('Tauri child webview host is unavailable.');
          const rect = this.getBoundingClientRect();
          currentThemeMode = await invoke('get-theme-mode').catch(() => currentThemeMode);
          forceDarkMode = await invoke('get-experimental-force-dark').catch(() => forceDarkMode);
          const dark = resolvedDark();
          const session = /^https:\/\/(?:[^/]+\.)?schoology(?:ca)?\.com(?:[/:?#]|$)/i.test(this._url)
            ? await prepareWebSession().catch(() => null) : null;
          this._darkTheme = dark;
          // The sessionstart cookies are installed by the initialization script only after the first document starts. Retry the original URL once after that bootstrap load so its authenticated request carries those cookies.
          this._sessionBootstrapPending = !!session;
          this._sessionBootstrapUrl = this._url;
          const label = `schoology-embedded-${Math.random().toString(36).slice(2, 10)}`;
          this._label = label;
          let nativeCreated = false;
          try {
            await invoke('create-embedded-webview', {
              label,
              url: this._url,
              x: Math.max(0, rect.left),
              y: Math.max(0, rect.top),
              width: Math.max(1, rect.width),
              height: Math.max(1, rect.height),
              userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 Schoology Android v2026.10.0',
              initializationScript: makeEmbeddedThemeBootstrap(dark, session, label),
              forceDark: dark,
              lti: this._ltiNavigation,
              allowExternalNavigation: this.getAttribute('data-external-links') !== 'false',
              openPopupsExternally: this.getAttribute('data-open-popups-external') === 'true',
              jsNavigationHookAvailable: typeof tauri.webview.Webview.prototype?.onNavigation === 'function',
              deferNavigation: true
            });
            nativeCreated = true;
            this.nativeView = await tauri.webview.Webview.getByLabel(label);
            if (!this.nativeView) throw new Error('The native embedded Schoology webview could not be retrieved.');
          } catch (error) {
            // The Rust child can exist even if JS cannot obtain its handle. Always
            // detach it before surfacing the failure so it cannot intercept clicks.
            if (nativeCreated) {
              try { await invoke('close-embedded-webview', { label }); }
              catch (closeError) { console.warn('Could not clean up an unbound Schoology webview:', closeError); }
            }
            this.nativeView = null;
            throw error;
          }
          if (!this.isConnected) {
            await invoke('close-embedded-webview', { label }).catch(() => {});
            this.nativeView = null;
            return;
          }
          this.dispatchEvent(new Event('dom-ready'));
          this.nativeView.once('tauri://error', event => {
            const failure = event?.payload || {};
            console.error('Native Schoology webview failed:', failure);
            dispatchCompatEvent(this, 'did-fail-load', { ...failure, isMainFrame: true, errorDescription: failure.message || failure.error || 'The embedded Schoology page failed to load.' });
            // A failed native surface can still sit above and intercept pointer
            // events even when it paints nothing. Detach it instead of leaving a
            // blank overlay on top of the application.
            const failedView = this.nativeView;
            const failedLabel = this._label;
            this.nativeView = null;
            void (async () => {
              let closed = false;
              if (failedLabel) {
                try { closed = (await invoke('close-embedded-webview', { label: failedLabel })) === true; }
                catch (closeError) { console.warn('Could not detach failed Schoology webview:', closeError); }
              }
              if (!closed && failedView) { try { await failedView.close(); } catch (_) {} }
            })();
          }).catch(() => {});
          if (typeof this.nativeView.onNavigation === 'function') {
          this._unlistenNavigation = await this.nativeView.onNavigation(url => {
            const nextUrl = String(url || this._url);
            let parsed = null;
            try { parsed = new URL(nextUrl); } catch (_) {}
            const host = String(parsed?.hostname || '').toLowerCase();
            if (parsed?.protocol === 'schoology-download:') {
              const requestedUrl = parsed.searchParams.get('url') || '';
              const filename = parsed.searchParams.get('filename') || 'Schoology-file';
              const mime = parsed.searchParams.get('mime') || 'application/octet-stream';
              invoke('download-file', { url: requestedUrl, filename, mime, webviewLabel: this._label, progressId: `webview-${Date.now()}` })
                .then(result => invoke('open-downloaded-file', { path: result.path }))
                .catch(error => {
                  console.error('Schoology download failed:', error);
                  dispatchCompatEvent(this, 'download-failed', { url: requestedUrl, errorDescription: String(error?.message || error) });
                });
              return false;
            }
            const internalSchoology = !!parsed && ['http:', 'https:'].includes(parsed.protocol) && (host === 'app.schoology.com' || host === 'schoology.com' || host === 'app.schoologyca.com' || host === 'schoologyca.com' || host === 'lms.lausd.net' || host.endsWith('.schoology.com') || host.endsWith('.schoologyca.com') || host.endsWith('.lms.lausd.net'));
            if (parsed && ['http:', 'https:'].includes(parsed.protocol) && !internalSchoology && !this._ltiNavigation) {
              const allowed = dispatchCompatEvent(this, 'will-navigate', { url: nextUrl, isMainFrame: true }, true);
              if (!allowed) return false;
              invoke('open-external', nextUrl).catch(error => console.warn('Could not open external Schoology link:', error));
              return false;
            }
            const allowed = dispatchCompatEvent(this, 'will-navigate', { url: nextUrl, isMainFrame: true }, true);
            if (!allowed) return false;
            // Keep the child surface visible during navigation. Hiding it here left
            // redirected account/assessment pages blank when Finished was not emitted.
            this.nativeView.show().catch(() => {});
            this.loading = true;
            this._url = nextUrl;
            dispatchCompatEvent(this, 'did-start-navigation', { url: nextUrl, isMainFrame: true });
            this.dispatchEvent(new Event('did-start-loading'));
            return true;
          }).catch(() => null);
          } else {
            // Tauri does not expose this event on every platform/version (notably some macOS builds).
            // Keep the child view alive and let the native WebView navigation policy handle routing.
            console.info('Schoology embedded webview: native onNavigation hook unavailable; using native navigation policy.');
          }
          if (typeof this.nativeView.onPageLoad === 'function') {
          this._unlistenPageLoad = await this.nativeView.onPageLoad(async event => {
            const payload = event?.payload || event || {};
            let rawEvent = payload.event ?? payload.type ?? event?.event ?? '';
            if (rawEvent && typeof rawEvent === 'object') rawEvent = Object.keys(rawEvent)[0] || '';
            const eventName = String(rawEvent).toLowerCase().replace(/[^a-z]/g, '');
            if (eventName.includes('started') || eventName === 'start') {
              this.loading = true;
              this.dispatchEvent(new Event('did-start-loading'));
              return;
            }
            if (eventName.includes('finished') || eventName === 'finish') {
              // The initialization script has installed the sessionstart cookies by
              // the time the first document finishes. Retry the ORIGINAL destination,
              // not a login redirect that may have replaced this._url.
              if (this._sessionBootstrapPending) {
                let cookiesInstalled = false;
                try { cookiesInstalled = await this.nativeView.eval('window.__schoologySessionBootstrapReady === true'); } catch (_) {}
                if (cookiesInstalled) {
                  this._sessionBootstrapPending = false;
                  const retryUrl = this._sessionBootstrapUrl || this._url;
                  await new Promise(resolve => setTimeout(resolve, 180));
                  if (!this.isConnected || !this.nativeView) return;
                  try {
                    this._url = retryUrl;
                    await (typeof this.nativeView.navigate === 'function' ? this.nativeView.navigate(retryUrl) : typeof this.nativeView.setUrl === 'function' ? this.nativeView.setUrl(retryUrl) : invoke('navigate-embedded-webview', { label: this._label, url: retryUrl, lti: this._ltiNavigation }));
                    return;
                  } catch (error) {
                    console.warn('Could not retry the original Schoology WebView destination after session bootstrap:', error);
                  }
                }
              }
              this._hasLoadedPage = true;
              this.loading = false;
              this.dispatchEvent(new Event('did-stop-loading'));
              this.dispatchEvent(new Event('did-finish-load'));
              dispatchCompatEvent(this, 'did-navigate', { url: this._url, isMainFrame: true });
              try { await this.nativeView.eval(makeEmbeddedThemeBootstrap(!!this._darkTheme, null, this._label)); } catch (_) {}
              await this._syncBounds();
              await this.nativeView.show().catch(() => {});
            }
          });
          } else {
            // Some Tauri WebView builds omit onPageLoad; don't crash while wiring the shared view.
            // The native surface is still navigated and shown below, even without renderer load events.
            console.info('Schoology embedded webview: native onPageLoad hook unavailable; continuing without load events.');
          }
          // Start from about:blank so load/navigation handlers are subscribed before the first Schoology request. The first completed request installs the JS-visible session cookies, then the handler retries the original URL once.
          this._hasLoadedPage = false;
          this.loading = true;
          this.dispatchEvent(new Event('did-start-loading'));
          await (typeof this.nativeView.navigate === 'function' ? this.nativeView.navigate(this._url) : typeof this.nativeView.setUrl === 'function' ? this.nativeView.setUrl(this._url) : invoke('navigate-embedded-webview', { label: this._label, url: this._url, lti: this._ltiNavigation }));
          await this._syncBounds();
          this._syncHandler();
          // Some WebView2 builds expose onPageLoad but occasionally omit its Finished
          // notification. Poll as a fallback, allowing the event handler time to win.
          if (this._sessionBootstrapPending) {
            const initialView = this.nativeView;
            let attempts = 0;
            const retryAfterBootstrap = async () => {
              if (!this._sessionBootstrapPending || !this.isConnected || this.nativeView !== initialView) return;
              let readyState = '';
              try { readyState = await initialView.eval('document.readyState'); } catch (_) {}
              let cookiesInstalled = false;
              try { cookiesInstalled = await initialView.eval('window.__schoologySessionBootstrapReady === true'); } catch (_) {}
              if (readyState === 'complete' && cookiesInstalled && attempts >= 10) {
                this._sessionBootstrapPending = false;
                const retryUrl = this._sessionBootstrapUrl || this._url;
                await new Promise(resolve => setTimeout(resolve, 180));
                if (!this.isConnected || this.nativeView !== initialView) return;
                try {
                  this._url = retryUrl;
                  await (typeof initialView.navigate === 'function' ? initialView.navigate(retryUrl) : typeof initialView.setUrl === 'function' ? initialView.setUrl(retryUrl) : invoke('navigate-embedded-webview', { label: this._label, url: retryUrl, lti: this._ltiNavigation }));
                } catch (error) { console.warn('Could not retry the original Schoology WebView destination after session bootstrap:', error); }
                return;
              }
              if (attempts++ < 100) setTimeout(retryAfterBootstrap, 100);
            };
            setTimeout(retryAfterBootstrap, 100);
          }
          requestAnimationFrame(()=>requestAnimationFrame(()=>this._syncHandler()));
        } else {
          await this._syncBounds();
          await (typeof this.nativeView.navigate === 'function' ? this.nativeView.navigate(this._url) : typeof this.nativeView.setUrl === 'function' ? this.nativeView.setUrl(this._url) : invoke('navigate-embedded-webview', { label: this._label, url: this._url, lti: this._ltiNavigation }));
          this._hasLoadedPage = true;
          await this._syncBounds();
          this._syncHandler();
        }
      }
      getURL() { return this._url; }
      isLoading() { return this.loading; }
      async reload() { if (!this.nativeView) return; this.loading = true; this.dispatchEvent(new Event('did-start-loading')); try { if (typeof this.nativeView.reload === 'function') await this.nativeView.reload(); else await this.nativeView.eval('location.reload()'); } catch (error) { try { await invoke('navigate-embedded-webview', { label: this._label, url: this._url, lti: this._ltiNavigation }); } catch (fallbackError) { this.loading = false; this.dispatchEvent(new Event('did-stop-loading')); throw fallbackError || error; } } }
      async goBack() { if (this.nativeView) await this.nativeView.eval('history.back()'); }
      async goForward() { if (this.nativeView) await this.nativeView.eval('history.forward()'); }
      async executeJavaScript(script) { if (!this.nativeView) return null; return this.nativeView.eval(String(script)); }
      async send(channel, ...args) { if (this.nativeView) return this.nativeView.emit(channel, args); }
      async setUserAgent(value) { this._userAgent = value; }
      async openDevTools() { console.warn('Developer tools are not exposed for Tauri embedded webviews.'); }
    }
    customElements.define('schoology-webview', TauriEmbeddedWebview);
  }
})();
