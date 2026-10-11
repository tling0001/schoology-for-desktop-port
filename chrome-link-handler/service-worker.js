// Chrome cannot hand an HTTPS URL to a desktop app based only on an in-app setting.
// This companion extension bridges ordinary Schoology web navigations to the
// registered schoology:// protocol. OAuth/login callback pages must remain in the
// browser so Schoology's own mobile_login_success page can issue its app callback.
const supported = url => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (!(host === 'lms.lausd.net' || host === 'app.schoology.com' || host === 'schoology.com' || host.endsWith('.schoology.com'))) return false;
    const path = u.pathname.toLowerCase();
    // Never hijack OAuth, login, SSO, or callback traffic. In particular, the
    // Android-compatible OAuth flow must reach /mobile_login_success and let the
    // page redirect to schoology://external_login_callback?request_token=...
    if (/^\/(oauth|login|logout|mobile_login_success|saml|auth)(?:\/|$)/i.test(path)) return false;
    if (['oauth_token', 'oauth_callback', 'request_token', 'login_landing_dest', 'sgyInitialPage'].some(k => u.searchParams.has(k))) return false;
    if (u.searchParams.get('__schoology_desktop_external') === '1') return false;
    return true;
  } catch { return false; }
};

const recent = new Map();
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0 || !supported(details.url)) return;
  const url = details.url;
  const now = Date.now();
  const previous = recent.get(url) || 0;
  if (now - previous < 5000) return;
  recent.set(url, now);
  for (const [key, timestamp] of recent) if (now - timestamp > 10000) recent.delete(key);

  const protocolUrl = 'schoology://link?url=' + encodeURIComponent(url);
  // Navigate the current tab rather than creating a background tab. Chrome's
  // external-application confirmation then appears in the tab the user is using.
  // Do not close or auto-dismiss it: the user must be able to accept the prompt.
  chrome.tabs.update(details.tabId, { url: protocolUrl }, () => {
    if (chrome.runtime.lastError) console.warn('Could not hand Schoology link to the desktop app:', chrome.runtime.lastError.message);
  });
}, { url: [{ hostEquals: 'lms.lausd.net' }, { hostEquals: 'app.schoology.com' }, { hostEquals: 'schoology.com' }, { hostSuffix: '.schoology.com' }] });
