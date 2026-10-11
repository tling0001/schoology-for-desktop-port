// Chrome cannot hand an HTTPS URL to a desktop app based only on an in-app setting.
// This companion extension bridges supported Schoology web navigations to the
// app's registered schoology:// protocol. Load this folder via chrome://extensions.
const supported = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'lms.lausd.net' || u.hostname === 'app.schoology.com' || u.hostname.endsWith('.schoology.com')) && !u.searchParams.has('__schoology_desktop_external');
  } catch { return false; }
};
const recent = new Map();
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0 || !supported(details.url)) return;
  const url = details.url;
  const now = Date.now();
  const previous = recent.get(url) || 0;
  if (now - previous < 5000) { recent.delete(url); return; }
  recent.set(url, now);
  for (const [key, timestamp] of recent) if (now - timestamp > 10000) recent.delete(key);
  const protocolUrl = 'schoology://link?url=' + encodeURIComponent(url);
  // Open the custom protocol in a background tab; remove that temporary tab
  // after Windows/macOS has had time to dispatch the registered protocol.
  chrome.tabs.create({ url: protocolUrl, active: false }, tab => {
    if (chrome.runtime.lastError || !tab?.id) return;
    setTimeout(() => chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError), 1800);
  });
}, { url: [{ hostEquals: 'lms.lausd.net' }, { hostEquals: 'app.schoology.com' }, { hostSuffix: '.schoology.com' }] });
