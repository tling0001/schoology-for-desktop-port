// Configurable Schoology Desktop companion link handler.
const DEFAULTS={courseMaterials:true,courses:true,courseUpdates:true,courseGrades:true,groups:true,homepage:true,resources:true,peopleDirectory:true,profiles:true,messages:true,accountSettings:true,calendar:true,grades:true,other:true};
function categoryFor(url){
 try{
  const u=new URL(url);if(u.protocol!=='https:')return null;
  const host=u.hostname.toLowerCase();if(!(host==='lms.lausd.net'||host==='app.schoology.com'||host==='schoology.com'||host.endsWith('.schoology.com')))return null;
  const path=u.pathname.replace(/\/+$/,'')||'/';
  if(/^\/(oauth|login|logout|mobile_login_success|saml|auth)(?:\/|$)/i.test(path))return null;
  if(['oauth_token','oauth_callback','request_token','login_landing_dest','sgyInitialPage'].some(k=>u.searchParams.has(k)))return null;
  if(u.searchParams.get('__schoology_desktop_external')==='1')return null;
  if(/^\/(?:course|courses)\/\d+\/(?:materials|folder|documents|files|attachments?)(?:\/|$)/i.test(path)||/^\/(?:section|sections)\/s?\d+\/(?:materials|folder|documents|files|attachments?)(?:\/|$)/i.test(path)||/^\/(?:document|documents|file|files|attachment|attachments)(?:\/|$)/i.test(path))return 'courseMaterials';
  if(/^\/course(?:s)?\/\d+\/student_grades(?:\/|$)/i.test(path))return 'courseGrades';
  if(/^\/course(?:s)?\/\d+\/updates(?:\/|$)/i.test(path))return 'courseUpdates';
  if(/^\/course(?:s)?\/\d+(?:\/|$)/i.test(path)||/^\/sections?\/\d+(?:\/|$)/i.test(path))return 'courses';
  if(/^\/groups?(?:\/|$)/i.test(path))return 'groups';
  if(path==='/'||/^\/home(?:\/|$)/i.test(path))return 'homepage';
  if(/^\/(?:resource|resources|collection|collections)(?:\/|$)/i.test(path))return 'resources';
  if(/^\/people(?:\/|$)/i.test(path))return 'peopleDirectory';
  if(/^\/(?:user|users|profile|profiles|school|schools)\/\d+(?:\/|$)/i.test(path)||/^\/profile(?:\/|$)/i.test(path))return 'profiles';
  if(/^\/messages(?:\/|$)/i.test(path))return 'messages';
  if(/^\/(?:settings|account)(?:\/|$)/i.test(path))return 'accountSettings';
  if(/^\/(?:calendar|events?)(?:\/|$)/i.test(path))return 'calendar';
  if(/^\/(?:grades|gradebook|grade)(?:\/|$)/i.test(path))return 'grades';
  if(/^\/apps(?:\/|$)/i.test(path))return null;
  return 'other';
 }catch{return null}
}
function getOptions(callback){chrome.storage.sync.get(DEFAULTS,values=>callback({...DEFAULTS,...values}));}
const recent=new Map();
chrome.webNavigation.onCommitted.addListener(details=>{if(details.frameId!==0)return;const category=categoryFor(details.url);if(!category)return;getOptions(options=>{if(options[category]!==true)return;const url=details.url,now=Date.now(),previous=recent.get(url)||0;if(now-previous<5000)return;recent.set(url,now);for(const [key,timestamp] of recent)if(now-timestamp>10000)recent.delete(key);chrome.tabs.update(details.tabId,{url:'schoology://link?url='+encodeURIComponent(url)},()=>{if(chrome.runtime.lastError)console.warn('Could not hand Schoology link to the desktop app:',chrome.runtime.lastError.message)});});},{url:[{hostEquals:'lms.lausd.net'},{hostEquals:'app.schoology.com'},{hostEquals:'schoology.com'},{hostSuffix:'.schoology.com'}]});