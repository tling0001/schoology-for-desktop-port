/* Tauri compatibility layer. Electron remains the supported release runtime until parity is complete. */
(function () {
  'use strict';
  // Match Electron: suppress the WebView's native browser context menu.
  document.addEventListener('contextmenu', event => event.preventDefault(), true);
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) return;
  const invoke = (name, args) => tauri.core.invoke('schoology_invoke', { name, args: args === undefined ? null : args });
  const listeners = new Map();
  let webSessionCache = null;
  let webSessionPending = null;
  const embeddedViews = new Set();
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
  const platform = /Windows/i.test(navigator.userAgent) ? 'win32' : /Macintosh/i.test(navigator.userAgent) ? 'darwin' : 'linux';
  document.documentElement.dataset.electronPlatform = platform;
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
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 Schoology Android v2026.06.0'
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
    document.documentElement.dataset.windowControlsOverlay = String(mode?.overlay === true);
    if (!mode?.overlay || document.getElementById('tauriWindowControls')) return;
    const controls = document.createElement('div');
    controls.id = 'tauriWindowControls';
    controls.setAttribute('data-tauri-drag-region', '');
    controls.setAttribute('role', 'toolbar');
    controls.setAttribute('aria-label', 'Window controls');
    controls.innerHTML = '<div class="tauriWindowDragArea" data-tauri-drag-region></div><button type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize">'+(platform === 'win32'?'&#xE921;':'−')+'</button><button type="button" data-window-action="maximize" aria-label="Maximize" title="Maximize">'+(platform === 'win32'?'&#xE922;':'□')+'</button><button type="button" data-window-action="close" aria-label="Close" title="Close">'+(platform === 'win32'?'&#xE8BB;':'×')+'</button>';
    controls.addEventListener('click', async event => {
      const button = event.target.closest('button[data-window-action]');
      if (!button) return;
      event.preventDefault(); event.stopPropagation();
      const action = button.dataset.windowAction;
      if (action === 'minimize') await invoke('window-minimize');
      if (action === 'maximize') {
        await invoke('window-toggle-maximize');
        const maximized = await invoke('window-is-maximized').catch(() => false);
        button.textContent = platform === 'win32' ? (maximized ? '\uE923' : '\uE922') : (maximized ? '❐' : '□');
        button.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
        button.title = maximized ? 'Restore' : 'Maximize';
      }
      if (action === 'close') await invoke('window-close');
    });
    controls.addEventListener('dblclick', event => {
      if (event.target.closest('button')) return;
      invoke('window-toggle-maximize').catch(() => {});
    });
    document.body.appendChild(controls);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWindowControls, { once: true });
  else installWindowControls();

  const makeEmbeddedThemeBootstrap = (dark, session = null) => `(() => {
    const session = ${JSON.stringify(session && typeof session === 'object' ? session : null)};
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
    }
    const dark = ${JSON.stringify(!!dark)};
    const styleId = 'schoology-shared-webview-theme-style';
    const css = 'html[data-schoology-shade-inversion="true"]{color-scheme:dark!important;background:#17191c!important}html[data-schoology-shade-inversion="true"] body{filter:invert(1) hue-rotate(180deg)!important}html[data-schoology-shade-inversion="true"] img,html[data-schoology-shade-inversion="true"] picture,html[data-schoology-shade-inversion="true"] video,html[data-schoology-shade-inversion="true"] canvas,html[data-schoology-shade-inversion="true"] svg,html[data-schoology-shade-inversion="true"] iframe,html[data-schoology-shade-inversion="true"] object,html[data-schoology-shade-inversion="true"] embed{filter:invert(1) hue-rotate(180deg)!important}';
    const root = document.documentElement;
    if (!root) return;
    // Tauri child webviews do not implement Electron's native allowpopups/preload
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
        this._syncHandler = () => this._syncBounds();
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
        embeddedViews.add(this);
        this._themeHandler = () => {
          if (!this.nativeView) return;
          const dark = resolvedDark();
          this._darkTheme = dark;
          this.nativeView.eval(makeEmbeddedThemeBootstrap(dark)).catch(() => {});
        };
        window.addEventListener('schoology-tauri-theme-changed', this._themeHandler);
        this.style.display = 'block';
        this.style.position = 'relative';
        this.style.minWidth = '1px';
        this.style.minHeight = '1px';
        this._observer = new ResizeObserver(this._syncHandler);
        this._observer.observe(this);
        window.addEventListener('scroll', this._syncHandler, true);
        window.addEventListener('resize', this._syncHandler);
        window.addEventListener('schoology-clear-web-session', this._clearSessionHandler);
        const initial = this.getAttribute('src');
        if (initial) this.loadURL(initial).catch(error => dispatchCompatEvent(this, 'did-fail-load', { errorDescription: String(error), isMainFrame: true }));
      }
      disconnectedCallback() {
        this._observer?.disconnect();
        window.removeEventListener('scroll', this._syncHandler, true);
        window.removeEventListener('resize', this._syncHandler);
        window.removeEventListener('schoology-clear-web-session', this._clearSessionHandler);
        window.removeEventListener('schoology-tauri-theme-changed', this._themeHandler);
        embeddedViews.delete(this);
        this._unlistenPageLoad?.();
        if (this.nativeView) {
          const view = this.nativeView;
          this.nativeView = null;
          // Move the native surface away before destroying it: otherwise it can
          // briefly remain above the app and swallow clicks after navigation.
          try { view.hide().catch(() => {}); } catch (_) {}
          try { view.setPosition(new tauri.dpi.LogicalPosition(-10000, -10000)).catch(() => {}); } catch (_) {}
          try { view.setSize(new tauri.dpi.LogicalSize(1, 1)).catch(() => {}); } catch (_) {}
          try { view.close().catch(() => {}); } catch (_) {}
        }
      }
      async _syncBounds() {
        if (!this.nativeView || !this.isConnected) return;
        const rect = this.getBoundingClientRect();
        const style = getComputedStyle(this);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        try {
          await this.nativeView.setPosition(new tauri.dpi.LogicalPosition(visible ? Math.max(0, rect.left) : -10000, visible ? Math.max(0, rect.top) : -10000));
          await this.nativeView.setSize(new tauri.dpi.LogicalSize(visible ? Math.max(1, rect.width) : 1, visible ? Math.max(1, rect.height) : 1));
        } catch (_) {}
      }
      async loadURL(url) {
        this._url = String(url);
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
          const label = `schoology-embedded-${Math.random().toString(36).slice(2, 10)}`;
          this._label = label;
          await invoke('create-embedded-webview', {
            label,
            url: this._url,
            x: Math.max(0, rect.left),
            y: Math.max(0, rect.top),
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
            userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 Schoology Android v2026.06.0',
            initializationScript: makeEmbeddedThemeBootstrap(dark, session),
            forceDark: dark,
            deferNavigation: true
          });
          this.nativeView = await tauri.webview.Webview.getByLabel(label);
          if (!this.nativeView) throw new Error('The native embedded Schoology webview could not be retrieved.');
          await this.nativeView.hide().catch(() => {});
          this.dispatchEvent(new Event('dom-ready'));
          this.nativeView.once('tauri://error', event => { dispatchCompatEvent(this, 'did-fail-load', { ...(event.payload || {}), isMainFrame: true }); this.nativeView?.show().catch(() => {}); }).catch(() => {});
          this.nativeView.onNavigation(url => {
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
            // Native child surfaces otherwise cover the parent DOM's loading overlay.
            this.nativeView.hide().catch(() => {});
            this.loading = true;
            this._url = nextUrl;
            dispatchCompatEvent(this, 'did-start-navigation', { url: nextUrl, isMainFrame: true });
            this.dispatchEvent(new Event('did-start-loading'));
            return true;
          }).catch(() => {});
          this._unlistenPageLoad = await this.nativeView.onPageLoad(async event => {
            const payload = event?.payload || event || {};
            const eventName = String(payload.event || payload.type || event?.event || '').toLowerCase();
            if (eventName === 'started' || eventName === 'start') {
              this.loading = true;
              this.dispatchEvent(new Event('did-start-loading'));
              return;
            }
            if (eventName === 'finished' || eventName === 'finish') {
              this.loading = false;
              this.dispatchEvent(new Event('did-stop-loading'));
              this.dispatchEvent(new Event('did-finish-load'));
              dispatchCompatEvent(this, 'did-navigate', { url: this._url, isMainFrame: true });
              try {
                await this.nativeView.eval(makeEmbeddedThemeBootstrap(!!this._darkTheme));
              } catch (_) {}
              await this._syncBounds();
              await this.nativeView.show().catch(() => {});
            }
          });
          await this._syncBounds();
          // Navigation starts only after event listeners are attached, so the
          // renderer receives the initial loading and completion events too.
          await this.nativeView.navigate(this._url);
          const firstUrl = this._url;
          // A provider may omit the normal top-level Finished event. Avoid a
          // permanently hidden native surface in that case.
          setTimeout(() => { if (this.nativeView && this._url === firstUrl) this.nativeView.show().catch(() => {}); }, 8000);
        } else {
          await this.nativeView.navigate(this._url);
        }
      }
      getURL() { return this._url; }
      isLoading() { return this.loading; }
      async reload() { if (this.nativeView) { this.loading = true; this.dispatchEvent(new Event('did-start-loading')); await this.nativeView.reload(); } }
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
