const app=document.getElementById('app');
const A=window.schoology;
if(!A){
  app.innerHTML='<div class="fatal"><h2>Schoology</h2><p>The application interface could not initialize.</p><p>The Electron authentication bridge did not load.</p></div>';
  throw new Error('Schoology preload bridge is unavailable');
}
const C={graphite:'#44505d',dark:'#22303e',blue:'#2e66a3',blueText:'#3183c8',bg:'#e7ebee',light:'#f4f5f5',white:'#fff',muted:'#868e96'};
let qrStream=null;
let qrBusy=false;
let qrLastAttempt=0;
let loadTabGeneration=0;
let pendingDeepLinkAfterLogin=null;
let schoologyStartupComplete=false;
let queuedIncomingDeepLink=null;
let state={openSchoologyLinks:true,desktopNotifications:true,notificationSound:false,appVersion:'',screen:'login',school:null,schools:[],q:'',loading:false,error:'',auth:null,user:null,tab:'home',homeTab:'recent',searchToken:0,drawerPage:null,message:null,messageTab:'inbox',messageFolder:'inbox',messageThread:null,composeMessage:false,selectedCourse:null,mobileMe:null,courseDashboardEnabled:false,preferredHomepage:'recent',toolbarTitle:'Home',embeddedReturn:null,embeddedCanOpenExternal:false,homeUpcomingReturn:false,assignmentTab:'info',assignmentCanSubmit:false,assignmentIsTeacher:false,assignmentSubpage:null,submissionMenu:false,assignmentAllowComments:false,assignmentLandscape:false,folderId:0,folderStack:[],currentFolderTitle:'Materials',courseView:null,activityUsers:{},activityComments:null,currentFolderId:0,currentGroup:null,profileUser:null,profileTab:'updates',groupTab:'updates',resourceCollection:null,windowChromeOverlay:false,homeCreateMenu:false,calendarDate:null,calendarSelectedDate:null,calendarCanCreate:false,calendarEvents:[],calendarEventsMonth:'',calendarTab:'calendar',calendarUpcomingEvents:null,groupJoinOpen:false,embeddedTheme:'',profileReturn:null,themeMode:'system',reducedMotion:false,canadianInstance:false,experimentalForceDark:false,peopleEnabled:false,courseCanAddResources:false,courseCanPostUpdates:false,groupCanCreateDiscussion:false,groupCanCreateEvent:false};
function resolveTheme(mode){if(mode==='dark'||mode==='light')return mode;return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'}
function applyTheme(mode,save=false){const selected=['light','dark','system'].includes(mode)?mode:'system';state.themeMode=selected;document.documentElement.dataset.theme=resolveTheme(selected);document.documentElement.dataset.themeMode=selected;if(document.documentElement.dataset.theme==='dark')requestAnimationFrame(()=>fixDarkRichTextColors());if(save){try{Promise.resolve(A.setThemeMode?.(selected)).catch(()=>{})}catch{}}}
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.themeMode==='system')applyTheme('system')});
A.getThemeMode?.().then(mode=>applyTheme(mode||'system')).catch(()=>applyTheme('system'));
A.getServerInstance?.().then(enabled=>{state.canadianInstance=!!enabled;const b=document.getElementById('switchCanada');if(b)b.textContent=state.canadianInstance?'I sign in to app.schoology.com':'I sign in to app.schoologyca.com'}).catch(()=>{});
A.getOpenSchoologyLinks?.().then(enabled=>{state.openSchoologyLinks=enabled!==false}).catch(()=>{state.openSchoologyLinks=true});
A.getDesktopNotifications?.().then(enabled=>{state.desktopNotifications=enabled!==false}).catch(()=>{});
A.getNotificationSound?.().then(enabled=>{state.notificationSound=enabled===true}).catch(()=>{});
A.getReducedMotion?.().then(enabled=>{state.reducedMotion=enabled===true;document.documentElement.dataset.reducedMotion=state.reducedMotion?'true':'false'}).catch(()=>{state.reducedMotion=false;document.documentElement.dataset.reducedMotion='false'});
A.getAppVersion?.().then(version=>{state.appVersion=String(version||'');const label=document.querySelector('.settingsVersion');if(label)label.textContent='Version: '+state.appVersion}).catch(()=>{});
A.getExperimentalForceDark?.().then(enabled=>{state.experimentalForceDark=!!enabled;const toggle=document.getElementById('experimentalForceDarkToggle');if(toggle)toggle.checked=state.experimentalForceDark}).catch(()=>{});
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fixDarkRichTextColors(root=document.getElementById('content')){
 if(document.documentElement.dataset.theme!=='dark'||!root?.querySelectorAll)return;
 const neutralDark=color=>{const m=String(color||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);if(!m)return false;const rgb=[+m[1],+m[2],+m[3]];return Math.max(...rgb)-Math.min(...rgb)<34&&rgb.reduce((a,b)=>a+b,0)/3<118};
 const nearWhite=color=>{const m=String(color||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);return !!m&&(+m[4]||1)>.8&&+m[1]>238&&+m[2]>238&&+m[3]>238};
 const elements=[];if(root.nodeType===1)elements.push(root);elements.push(...root.querySelectorAll('*'));
 for(const el of elements){if(!el.isConnected||/^(IMG|SVG|PATH|VIDEO|CANVAS|IFRAME)$/.test(el.tagName))continue;let node=el,lightSurface=false;while(node&&node!==root.parentElement){if(nearWhite(getComputedStyle(node).backgroundColor)){lightSurface=true;break}node=node.parentElement}if(lightSurface)continue;if(neutralDark(getComputedStyle(el).color))el.style.setProperty('color','var(--theme-text,#e6e8eb)','important');}
}
if(!window.__schoologyDarkTextObserver){window.__schoologyDarkTextObserver=new MutationObserver(records=>{if(document.documentElement.dataset.theme!=='dark')return;for(const record of records){for(const node of record.addedNodes||[]){if(node.nodeType===1)fixDarkRichTextColors(node)}if(record.target?.nodeType===1)fixDarkRichTextColors(record.target)}});window.__schoologyDarkTextObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','color']});}
document.addEventListener('click',async event=>{
 const anchor=event.target?.closest?.('a[href]');if(!anchor)return;
 const rich=anchor.closest('.activityBody,.schoolProfileUpdateBody,.schoolProfileUpdate,.assignmentDescription,.commentBodyHtml,.discussionBody,.messageThreadBody,.notificationBodyRich,.groupFullUpdate,.androidCommentContent,.activityMedia');
 if(!rich)return;
 const href=anchor.href||anchor.getAttribute('href')||'';if(!(href.startsWith('http://')||href.startsWith('https://')))return;
 event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
 try{const result=await A.openExternal(href);if(typeof result==='string'&&result)showAppDialog('Unable to open link',result)}catch(error){showAppDialog('Unable to open link',error.message||String(error))}
},true);
function alert(message){showAppDialog('Schoology',String(message));}
function showAppDialog(title,message,actions=[{label:'OK',action:null}]){let el=document.getElementById('appDialog');if(!el){el=document.createElement('div');el.id='appDialog';el.className='appDialogOverlay';document.body.appendChild(el)}el.innerHTML=`<div class="appDialog" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="appDialogMessage">${esc(message)}</div><div class="appDialogActions">${actions.map((a,i)=>`<button data-dialog-action="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;el.classList.add('open');el.querySelectorAll('[data-dialog-action]').forEach((b,i)=>b.onclick=async()=>{el.classList.remove('open');const fn=actions[i]?.action;if(fn)await fn()});return el}
function showUpdateDialog(u){
  const iosInstall=A.platform==='ios';
  showAppDialog('Update available',iosInstall?`Schoology iOS v${u.version} is available. Install will open Apple's Ad Hoc installation link used by the website and QR code.`:`Schoology Desktop Port v${u.version} is available. The update will download only after you choose Install update.`,[{label:'Later',action:null},{label:iosInstall?'Open install link':'Install update',action:async()=>{
    if(iosInstall){
      try{await A.installUpdate(u);showAppDialog('Opening Schoology installation','Safari/iOS will open the Schoology installation link. Follow the iOS prompts to install the update.')}
      catch(e){showAppDialog('Unable to open installation link',e.message||String(e))}
      return;
    }
    const dlg=showAppDialog('Downloading update','Downloading…',[]);
    const msg=dlg?.querySelector('.appDialogMessage');
    if(msg)msg.innerHTML='<div class="updateDownloadProgressWrap"><div class="updateDownloadProgressTrack"><div id="updateDownloadProgressBar" class="updateDownloadProgressBar" style="width:0%"></div></div><div id="updateDownloadProgressText" class="updateDownloadProgressText">Downloading…</div></div>';
    const off=window.schoology?.onUpdateDownloadProgress?.(d=>{const bar=document.getElementById('updateDownloadProgressBar'),txt=document.getElementById('updateDownloadProgressText');if(bar&&d?.percent!=null)bar.style.width=d.percent+'%';if(txt)txt.textContent=d?.total?`Downloading… ${d.percent||0}%`:'Downloading…';});
    try{await A.installUpdate(u);off?.()}catch(e){off?.();dlg?.classList.remove('open');showAppDialog('Unable to install update',e.message||String(e))}
  }}]);
}

window.closeDrawerThen=function closeDrawerThen(fn){const drawer=document.getElementById('drawer'),shade=document.getElementById('drawerShade');drawer?.classList.remove('open');shade?.classList.remove('open');setTimeout(()=>{state.drawerPage=null;if(typeof fn==='function')fn()},280)};const closeDrawerThen=(fn)=>window.closeDrawerThen(fn);
function messageDetail(){
 const m=state.message||{}; const thread=state.messageThread;
 const msgs=thread?.messages||[]; const users=thread?.users||{};
 const subject=m.subject||msgs[0]?.subject||'Message';
 const cards=msgs.length?msgs.map(msg=>{
   const uid=Number(msg.author_id||msg.authorId||msg.author?.id||msg.author?.user_id||msg.uid||msg.user_id||msg.sender_id||msg.senderId||msg.sender?.id||msg.sender?.user_id||msg.creator_id||0); const u=users[uid]||msg.author?.user||msg.author||msg.sender?.user||msg.sender||msg.user||{};
   const me=uid && Number(state.auth?.userId||state.auth?.user?.id||0)===uid;
   const name=me?'You':(u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology');
   const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||'');
   const ts=msg.last_updated||msg.lastUpdated||msg.created||msg.timestamp;
   const date=ts?(typeof ts==='number'||/^\d+$/.test(String(ts))?new Date(Number(ts)*1000).toLocaleString():String(ts)):'';
   const body=msg.message||msg.body||'';
   const attachments=renderMessageAttachments(msg.attachments||msg.attachment||{});
   return `<article class="messageThreadItem"><div class="messageThreadHeader">${avatar?`<img class="messageThreadAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="messageThreadAvatarFallback">${esc(String(name).charAt(0))}</span>`}<div class="messageThreadAuthorBlock"><b class="messageThreadAuthor">${esc(name)}</b><small>${esc(date)}</small></div></div><div class="messageThreadBody">${esc(body)}</div>${attachments}</article>`;
 }).join(''):`<div class="messageThreadLoading">Loading message…</div>`;
 return `<div class="shell"><header class="toolbar"><button id="messageBack" class="iconButton" aria-label="Back">${officialBackIcon()}</button><span class="toolbarTitle">${esc(subject)}</span><button id="messageRefresh" class="iconButton messageActionButton" aria-label="Refresh">${officialIcon('ic_action_refresh.png','Refresh')||'↻'}</button><button id="messageReply" class="iconButton messageActionButton" aria-label="Reply">${officialIcon('ic_action_reply.png','Reply')||'↩'}</button></header><main class="messageDetail">${thread?cards:'<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading message…</span></div>'}</main></div>`;
}
function renderMessageAttachments(a){
 const out=[];
 const files=a?.files?.file||a?.files?.list||a?.files||a?.['file-attachment']||[];
 const list=Array.isArray(files)?files:(files&&typeof files==='object'?(files.file||files.list||[]):[]);
 for(const f of list){const url=f.resolveDownloadUrl||f.download_path||f.downloadPath||f.converted_download_path||f.convertedDownloadPath; if(!url)continue; const title=(f.title||f.fileTitle||f.filename||f.fileName||'File').trim(); const mime=f.filemime||f.fileMIME||f.converted_filemime||f.convertedFileMime||'application/octet-stream'; out.push(`<button class="messageAttachment" data-download-url="${esc(url)}" data-download-name="${esc(title)}" data-download-mime="${esc(mime)}">📎 ${esc(title)}</button>`)}
 const links=a?.links?.link||a?.links||[]; const ll=Array.isArray(links)?links:(links?.link||[]); for(const l of ll){const url=l.url||l.linkURL||l.href;if(url)out.push(`<button class="messageAttachment" data-open-url="${esc(url)}">🔗 ${esc(l.title||l.linkTitle||url)}</button>`)}
 const embeds=a?.embeds?.embed||a?.embeds||[]; const ee=Array.isArray(embeds)?embeds:(embeds?.embed||[]); for(const e of ee){if(e.embed_code||e.embedCode)out.push(`<button class="messageAttachment" data-embed-html="${esc(e.embed_code||e.embedCode)}">▧ Embedded content</button>`)}
 return out.length?`<div class="messageAttachments">${out.join('')}</div>`:'';
}
function officialBackIcon(){return "<svg class='officialBackIcon' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' aria-hidden='true' focusable='false'><path fill='currentColor' d='M22 10.9H6.2l5.7-5.7-1.5-1.5L2 12l8.4 8.4l1.5-1.5l-5.7-5.7H22V10.9z'/></svg>"}

(function installSynchronousBackIconRepair(){
 const placeholder='${officialBackIcon()}';
 const replace=value=>typeof value==='string'&&value.includes(placeholder)?value.split(placeholder).join(officialBackIcon()):value;
 const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
 if(descriptor?.set&&!Element.prototype.__schoologyBackIconRepairInstalled){
  Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(value){return descriptor.set.call(this,replace(value))}});
  const insert=Element.prototype.insertAdjacentHTML;
  if(typeof insert==='function')Element.prototype.insertAdjacentHTML=function(position,value){return insert.call(this,position,replace(value))};
  Object.defineProperty(Element.prototype,'__schoologyBackIconRepairInstalled',{value:true});
 }
})();
const menuImg="<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'><path fill='white' d='M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z'/></svg>";
const officialIconData={"ic_test_quiz.png":"data:image/png;base64,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","ic_action_new.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAj0lEQVRo3u3YsQ2AIBRF0YdYuJMjuJEDsJEjuBMN0UJjISaCFGi8t7HxkxNoUImI/p4pGV4GWUnBTLUAszpJ3vTP12hqHwEAAAAAAAAAAACA6gBzcdMdk6e7/emTJ9z5Bt1Gr9hjWWVD7rOvO4J4B0LGhuYfQeDDBAAAAAAAAAAAAMAHbsU5ue13vYiICloBd7gS8a1wnOgAAAAASUVORK5CYII=","ic_notifications_comment_add.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACH0lEQVQ4y32TXUiTURjHf+/r3pWNYWrma/iFc7E0civMIggGdRd1VTQJAy8q61aIAinookLvwpKCBD+o6EL6IJCgiyiCFjLXCqcblpp7d2FFsZWbvaeLfbC5jwMPB57zP//n+f+fcySA3wOnqgPGrxpFVnOsQTX3joXX56Wf1zur502LWkt7N8ZWK+jxbISsEPs0x2f3fZoitWrZpQdZJIZ506LWeuAsyvYG+DUN8T8ZxwJKSjDa2tgpuvB9GNEAKYsfQLHWQTSYyCilYKoC8xZQNoG8AaIzGFoseaUZEoV0WIvAxhooEYR/KLgmG3PRxkGcQwiARoQ6fK4tbEh1CsDfEOF/VlyTKt32WvbZytHFOkskmA5+Z9D9TTt9e0qVASJeP5h2AOB6odLTXk+HrZxVHWLrYlWHXZYKevZsY0E2aPKd0ZBjzjNOdOYLlNoAcFjKiOkgRK4KIRJEDmtloqO77oDv6eOVw7Pvh9MgXeS/nEmSkiYDa0ePV760d13DM3Y1rVOSChNIUgKTHiOAZ6SP5+NL/QDv/GGMcn4SSQKjDO7ZxMNNQZqT+1L9wZPNls7LH8/vrcLepOadgnt2mXtTK4Qe3dhtSOYDKcDC64cz5s1bB/w1Z3qPOVRuPvHxSss1ZGH0Skfw7YQvr8ZDfRNvQnEh+p/5xP6eWxeSHWZGHaAUNMk55BXOIa+wn7h4BKgo9ksLeZ3yZBmIFiP4D7sOv7gcN2P7AAAAAElFTkSuQmCC","ic_action_download.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD8AAAA/CAQAAAD9VthUAAABnklEQVRYw+2YP2vCQBiHEwtCQFwEXXR1Egr2C4hdHP0IdivS0UU/gNDNjq5209HF2c1FP4CLDkJBkFrIkmqfDtWYU5OWaJKK95sO3j/P3fG+d8cpipSUlJTUJYgQj7zyxE0w+Gd+9BIM/m2Dfw8G/8lWrrc/FGz9nIJXg8Ur/wXPVa9elp4sPVl6V7f5qiw9Wfly8yVe4n3D4xGeKHlSJ8wrRZ6o2+Asc8CgZmPf6svGXsMA5mTd4XsmoEX4wKo64QnTMu09d/ghO/WJ/R1PjL4ldugOX8WqMWkb/HovLs1YiKy6/b1oCmkW5H7Hk2MhRDVx311UWFtSGTw44ylhWPzXVE5t6iK6sJo66nE8KnXBU6d4jlPljpmQtoOmKIREPBodwWvmsuGOTCDJSEg9ICHiSTAQPEYkz/mPE6ErpJ9ya45XZJgK1i6Rc38khWgIiI9d31vGAA28ucgos8JZK8oeXpAUWDrAlxQ8vqHJMLGBT8j48EQ4qHKzG3x6o6DR3oO30Xx8JO2dcJuT0FdRQgd0SgE9FIlzT1yRukx9Ax0Ep3nLYXR9AAAAAElFTkSuQmCC","ic_assignment.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABGCAMAAABG8BK2AAAB8lBMVEVfTDF+bFwAAABsVToAAABWXlMAAABBmNIAAAAAAABmPxEAAABBmNIAAAAAAAAAAABQUFeYbjL/4qX+ulzEoGzOzs6urq6SXijtu2t1styUYCr/u17KdR6ysbDt1bfDrpT///7//vivr6/MeyazsbD39fb/zGz///uRXifCbRr//fmRXib08/OSXif8+vrFcR7/+/b/9/Hy8PD/vGH/23mAc1z/+fT/9O/v7u7DbhqzsrHCbRn/9vH1596bXyDGcx/67+rUf7zDbxu0srH/vWF1dnHPfijcg7f38Ov17ObYo9n/vF//yWrQaZp0gHrUf7mkq7awsLCan6FueYb17unh29iBiobAwsOzsrBBmNL89O/w5+HJy8zKcJ/bodv59/iQmZf/yWv+xXT46N7v6OSUYCi0s7Ls5N9lo8z////h2NT88uzDxcb/vGD37ef6+vrPe6vr49/Nycnf1tJqqNDYptprqdHjruS1tLPHxcVycHDy6eSYnKLq49/k4N7q5eHIa5j68e3yvGnb09DYk0HUz83g3NqTnquUYSppp9Hr5N92s9y1s7KZ1PfWzsqTXSVtqtL/vWLy5t7+/P3s493/zHzrvWf/y2zYz8ppYEnj2tbz6+fSzMr26N7m4NzEw8TQm9Td29rXn9jt5N7JcBalZCQE59oaAAAAEHRSTlOP6wL6CLMR8wcGkwC0FwEFaEHXZgAAAr1JREFUWMPt2GdTGkEAgGFEBM4gWGNBLFiwiw3F3hs2VNSzayyA5RRUsBfEEg161ojY9X/GzQ1znkKCzm1mksn7gQ/M3DPs3S7swvhES4z/zN/E8Pk8HvqBeDw+n35GIEBRzQdCUYGAfobLBYxOZ7NZLN9dyGKx2XQ6wHC59DMsFmDMZrXa1ZurVpvNgGGxYDEmE4p+czEUNZngMnr9exi9Hi6j1b6H0WrhMlbrexirFS6jUs3MuDr9dndVKrjM1tbJSUHBl59dXR0dPTxMT3912PLyysrdXWNjVRU85vp6bo782IeHq6vz80bjvoOMxpubkhKDYXZ2agpB4DCjoy8fOIoODe3vY05qbu7v7+2trTUYenrgMF1dVOby0hmztNTd3d7e1nZ/f3u7tgaHWVykMq2tIyPgIuVzL18fH5uaxsfbn2toqK9/88BpYmpqqEx1NcFQq6ysq8Px7W3AVFQ4mH40MZOTVGZ9vazMPij7gEpLBwZwvLwcx1taFhYcLk2amOJiKtPZSTBkRUXn5/hzCgWOFxY6+aKgiRkbozL5+bm55KCUSrmcQAAzPJyTA5fJzqYyMhnBEMnlmZmAyMhQKHZ2lMr0dLhMWhqVkUo7OuyDSk0lB5ScDN5LSoLLyGRUJiGBYDAsPp5E4uIIOiYGLiOVUhmJJDoaXBIVBRYAaGIiMREsCwwTi/v64DKRkVQmIkIkwrC8PBIBN5dILE5JgctIJFRGoxGJQkNjYwEhFOJ4SAg5GcXi42O4jEYTHEz++O7taTTh4UFBYDBgCQQGfn5RQABx9IDJvM7fH8cHB/38hMKDA8cHoT/HhIWdnfn6np5ubj49OTuWwWE4nLfbxIuLrKyNDR8f5xtJDgcGgyBstterPDy8vd3dPT29fhGbTWzZ6GWYTARhvcrNjcFg/SYEYTLpZ/61P15+ANmGakjyc+W3AAAAAElFTkSuQmCC","ic_notifications_test_quiz.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAYAAADUryzEAAACSklEQVQ4y42SS0hUcRTGf/fOvQ6TLzKYcfI5DoYpZIs0K81BBFu0aOFegtkYBLUzalu0iFbhLBqiq0ibgghahFIOJtMDeiySHlxnFHWcIR/cUcaZuTO3xTwsnSHP6s/5znf+3znfESgQzXcZ7bU7hwF8IdXza4QrFAlTMbKr00pjTSlo5o5o14ZtfYqXhRqIexM5smb2o5n9uDqt5NQcSEG0a8OGZu5oO2bBIpXzeiaBL6R6iikQ3IrTKAT098cAmJqy7MO8Q6qQe0sAF8+dZCu58k/RetwPgKvzTD4ni6VMvguwdHvSMIw0dbcGBAkgZcRJGTvo6R0SKY2UkYS4FYBN1N15BZn6hcsI7c1saXHUm08NEeB7YJ2ZjxqrK4c5JFdjEuR9smOmCIvPhjnvGuDRzycAJH+HMy4EQmG8Q2pjIBRmaclMialiX4Oexw3c6Z3nzewnek534/06yr2z9xGAhmzNAtDgVpzBno4KoonlPLl9rILuwVqINfFts54H01H0U8/xhVSP5Facwdxm3Yoz6LDbkEWR8pIa9PQOrUqKrsE6iGX+eftiHL1v90IlAIfdhlvBcNhttDZZmZuPEAhpXJ0zOHHBBRlHGR3387kPvENqY1ZxxsYWRxW1tTFkUcySwzystMK1SzD3AwDP2CyVI1XwIZIbd/eUY/oa0cQyyfR2fqETX6p5Nb0NthbGJnykr28UPGUJoEw+CoBFOoLDbsGtEJz36yyuvKdtFcpuHMekr2XrIgc75exSi2L5Bn/ZuDcW/oMB8AdPJOq18j24LwAAAABJRU5ErkJggg=="};
const officialIconExtraData={"ic_attach_resourcesv3.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAAAbUlEQVRYw+3UTQ5AMBCG4W/EHiduXBg3GAsrkVElIniny0n6NJ0fc90blQAAAACeB+r9dC/ltqGlK8ByhbogM2b5Q4A0hDRdBCCZxxNQEOlEmzaaSh76ghrY6rRs0204kwzwv23KFwEAAHwJmAF0XwtqZQqlrAAAAABJRU5ErkJggg==","ic_action_ic_menu_folder.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAABFElEQVRYw+2Wuw4BQRSGZ9a6FIJEIVFqFK6h0GhEIfEwSg+hVnoCvccQ624l2JCIhkRhY7MmR6VZwZlhK/OVZzfny5yc+XcJkUgkkj+AOgvZkrfiKN2ObeMqKlCfjGFIOGvRqtETFSiot2r5iKsCCHjqPxvRC8rF0OuHjGkdAl8JQCWFN2OwuU9AD9cW1ySAUwBL4vM38P0fx4PuYIYb0TyQgzj3pWLUQG0RZZclyQiszKpv4tZ0q1qQ5O8PE+Q9gIWaIl7+/paGFeiKyID20wNKQJm5o2kBwQgZFeAJNolA9thDdBZBTCD3T+ONeJriNghcFSjaN9+Dz1iguyvQ+7arAqqh0xTOdM0vYBP5/ySRSP6aO8hVS+x558quAAAAAElFTkSuQmCC","ic_action_discard_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAYAAABU1PscAAABD0lEQVRYw+2X0Q2CMBCGP40DMAFhBJ95ATZwBEZwg4YJHEHcQDfgiWfcgDgBI/hyJo3hQckhrfRPGpLjaO8v91+vEBCwbmy0J6zaxwk4jrzqgcKkca+53lY5+MQKvgMaGQAJUGpv2E55vlyejUnjwiJWAmcgcy6FZNcPQCQB5pIudqpEwF5sF7FdTRp3LvyBEjBvtkQGI/aXbwYUTmlgCWgQ6EWwc3/zmzJq6cJOoUEj32cjULWPXMTbfOCeAJg0rl0qo7mI03zo3wC1KxrgrWR6J+IpBAYnW4kvcPedgPcp5BaBCS2y9xroggZmIND5TmBYjQY0G7uggaU1oHmpr4Cbdf8dO+z6JQ+9gIB/xBON3T2KYvt1bAAAAABJRU5ErkJggg==","ic_action_send_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAYAAABU1PscAAABEUlEQVRYw+3XwW2DMBiG4RfEAEyAGIEzp2wQNoANMgLyCJ0gzQZskJvP3aCVF2g2aA91pAjRJMV/Yrvyd0Igo+8BDBhSUlL+FKXNu9JmCKVPtgLwZTc/ADW21WusAEKASAC8QiQBXiD5ijGnG8drYP+syZ6tGaS06YAtcE/Bh96RzGWw0qYEzpjOBySTOtEFZgc0z4K43oEBOI1tNc321xbTX8GIQFwBR2BjJ/YEvIxt9baAGSymloZIAeaFJuCwgGkspFvArILkRJ5C6Dy3HqHdL1fd+RFyBRxs6Tgn8X94jcb5IbO/Ev0dpcP7lVDafAKl7+Iuk7gMobj0a9TbgqaItbgEIIhFfRFr8ZSUlJ98Awi3lNmk+OSWAAAAAElFTkSuQmCC","ic_action_new.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAj0lEQVRo3u3YsQ2AIBRF0YdYuJMjuJEDsJEjuBMN0UJjISaCFGi8t7HxkxNoUImI/p4pGV4GWUnBTLUAszpJ3vTP12hqHwEAAAAAAAAAAACA6gBzcdMdk6e7/emTJ9z5Bt1Gr9hjWWVD7rOvO4J4B0LGhuYfQeDDBAAAAAAAAAAAAMAHbsU5ue13vYiICloBd7gS8a1wnOgAAAAASUVORK5CYII=","ic_notifications_test_quiz.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAYAAADUryzEAAACSklEQVQ4y42SS0hUcRTGf/fOvQ6TLzKYcfI5DoYpZIs0K81BBFu0aOFegtkYBLUzalu0iFbhLBqiq0ibgghahFIOJtMDeiySHlxnFHWcIR/cUcaZuTO3xTwsnSHP6s/5znf+3znfESgQzXcZ7bU7hwF8IdXza4QrFAlTMbKr00pjTSlo5o5o14ZtfYqXhRqIexM5smb2o5n9uDqt5NQcSEG0a8OGZu5oO2bBIpXzeiaBL6R6iikQ3IrTKAT098cAmJqy7MO8Q6qQe0sAF8+dZCu58k/RetwPgKvzTD4ni6VMvguwdHvSMIw0dbcGBAkgZcRJGTvo6R0SKY2UkYS4FYBN1N15BZn6hcsI7c1saXHUm08NEeB7YJ2ZjxqrK4c5JFdjEuR9smOmCIvPhjnvGuDRzycAJH+HMy4EQmG8Q2pjIBRmaclMialiX4Oexw3c6Z3nzewnek534/06yr2z9xGAhmzNAtDgVpzBno4KoonlPLl9rILuwVqINfFts54H01H0U8/xhVSP5Facwdxm3Yoz6LDbkEWR8pIa9PQOrUqKrsE6iGX+eftiHL1v90IlAIfdhlvBcNhttDZZmZuPEAhpXJ0zOHHBBRlHGR3387kPvENqY1ZxxsYWRxW1tTFkUcySwzystMK1SzD3AwDP2CyVI1XwIZIbd/eUY/oa0cQyyfR2fqETX6p5Nb0NthbGJnykr28UPGUJoEw+CoBFOoLDbsGtEJz36yyuvKdtFcpuHMekr2XrIgc75exSi2L5Bn/ZuDcW/oMB8AdPJOq18j24LwAAAABJRU5ErkJggg=="};
function officialIcon(name,alt=''){const src=officialIconData[name]||officialIconExtraData[name]||'';return src?`<img class="officialEmbeddedIcon" src="${src}" alt="${esc(alt)}">`:''}
function officialOrAssetIcon(name,alt=''){const embedded=officialIcon(name,alt);if(embedded)return embedded;const src=String(name||'').endsWith('.svg')||String(name||'').endsWith('.png')?name:`${name}.png`;return `<img class="officialEmbeddedIcon" src="../assets/icons/${src}" onerror="this.onerror=null;this.src='../assets/icons/attachment_document_icon.png'" alt="${esc(alt)}">`}

let backIconRepairObserver=null;
function repairBackIconPlaceholders(root=app){
 if(!root||!document.createTreeWalker)return;
 const placeholder='${officialBackIcon()}';const walker=document.createTreeWalker(root,4);const nodes=[];
 while(walker.nextNode())if(String(walker.currentNode.nodeValue||'').includes(placeholder))nodes.push(walker.currentNode);
 for(const node of nodes){
  const value=node.nodeValue||'',parts=value.split(placeholder),fragment=document.createDocumentFragment();
  parts.forEach((part,index)=>{if(part)fragment.appendChild(document.createTextNode(part));if(index<parts.length-1){const icon=document.createElement('span');icon.className='officialBackIconRepair';icon.innerHTML=officialBackIcon();fragment.appendChild(icon)}});
  node.parentNode?.replaceChild(fragment,node);
 }
}
function watchBackIconPlaceholders(){
 if(backIconRepairObserver||!app||typeof MutationObserver==='undefined')return;
 backIconRepairObserver=new MutationObserver(()=>repairBackIconPlaceholders(app));
 backIconRepairObserver.observe(app,{subtree:true,childList:true,characterData:true});
}
function render(){let h=state.message?messageDetail():state.screen==='login'?login():state.screen==='search'?schoolSearchScreen():state.screen==='credentials'?credentials():state.screen==='externalSelect'?externalSelect():state.screen==='qr'?qr():shell();app.innerHTML=h;repairBackIconPlaceholders(app);watchBackIconPlaceholders();bind();syncWindowChrome();requestAnimationFrame(positionLoginLogo);return h}
function syncWindowChrome(){let color='#002137';if(document.body.classList.contains('splashVisible')&&document.getElementById('startupSplash'))color='#44505d';else if(state.screen!=='app'){color=(state.screen==='login'||state.screen==='search'||state.screen==='credentials'||state.screen==='externalSelect'||state.screen==='qr')?'#44505d':'#22303e'}else if(document.getElementById('drawer')?.classList.contains('open'))color='#001827';document.documentElement.style.setProperty('--tauri-window-controls-bg',color);if(A.platform!=='win32'&&A.platform!=='linux')return;A.setWindowChrome?.({color,symbolColor:'#ffffff',height:56}).catch?.(()=>{})}
function positionLoginLogo(){const button=document.getElementById('schoolLogin');const logo=button?.closest('.login')?.querySelector('.logo');if(!button||!logo)return;const buttonTop=button.getBoundingClientRect().top;const logoHeight=logo.getBoundingClientRect().height;if(buttonTop>0&&logoHeight>0)logo.style.setProperty('top',Math.max(8,(buttonTop-logoHeight)/2)+'px','important')}
window.addEventListener('resize',()=>requestAnimationFrame(positionLoginLogo));
function login(){return `<div class="login loginAnimated"><img class="logo" src="../assets/logo_schoology.png" alt="Schoology"><div class="loginBody loginActionCenter"><button id="schoolLogin" class="primary loginIconButton"><img src="../assets/icons/ic_school.svg" alt=""><span>Sign in through my school</span></button><button id="continueSchoology" class="secondary loginIconButton accountSignInButton"><img src="../assets/icons/ic_sgy_logo.svg" alt=""><span>Sign in with my account</span></button><button id="qrLogin" class="qrButton loginIconButton"><img src="../assets/icons/ic_qr_code.svg" alt=""><span>Sign in with a QR code</span></button></div><button type="button" id="loginHelp" class="loginBottom">I need help signing in</button>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function schoolSearchScreen(){return `<div class="login loginAnimated"><button id="back" class="back">${officialBackIcon()}</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="label">School</div><div class="searchWrap"><input id="schoolSearch" autocomplete="off" autofocus placeholder="Enter your School or domain" value="${esc(state.q)}"><span>⌕</span></div><div id="schoolSearchStatus"></div><div id="schoolSuggestions"></div></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function credentials(){return `<div class="login loginAnimated accountLoginScreen"><button id="back" class="back" aria-label="Back">${officialBackIcon()}</button><img class="logo small" src="../assets/logo_schoology.png" alt="Schoology"><div class="loginBody accountLoginBody">${state.school?`<div class="selected">${esc(state.school.title||'School')}</div>`:'<div class="accountTitle">Sign in with my account</div>'}<div class="label">Username or Email</div><input id="user" class="field" autocomplete="username"><div class="label">Password</div><input id="pass" class="field" type="password" autocomplete="current-password"><button id="signIn" class="primary">Sign in</button></div><div class="loginSecondaryBottom"><button id="switchCanada" class="linkbtn">${state.canadianInstance?'I sign in to app.schoology.com':'I sign in to app.schoologyca.com'}</button><button id="loginHelpCredentials" class="linkbtn">I need help signing in</button></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function schoolLoginDomain(school){
  for(const candidate of [school?.domain,school?.school_domain,school?.schoolDomain,school?.url]){
    const value=String(candidate||'').trim();if(!value)continue;
    try{const parsed=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value)?value:`https://${value}`);if(['http:','https:'].includes(parsed.protocol)&&parsed.hostname)return parsed.host}catch{}
  }
  return '';
}
async function startSchoolBrowserLogin(){
  state.loading=true;state.error='';render();
  try{const domain=schoolLoginDomain(state.school);if(!domain)throw new Error('This school did not provide a valid login domain.');state.auth=await A.loginSchoolBrowser({domain});await afterLogin();}
  catch(e){state.loading=false;state.error=typeof e==='string'?e:(e?.message||String(e||'Browser sign-in failed.'));render();}
}

function externalSelect(){
  const name=state.school?.title||'School';
  return `<div class="login loginAnimated"><button id="back" class="back" ${state.loading?'disabled':''}>${officialBackIcon()}</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="selected">${esc(name)}</div>${state.loading?`<div class="qrAuthorizationLoading"><img src="../assets/android_loading_spinner_72.gif" alt=""><p>Continue signing in in your browser…</p></div>`:`<button id="browserLogin" class="primary">Try browser sign-in again</button>`}</div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`
}

function qr(){return `<div class="qr loginAnimated qrLoginScreen"><button id="back" class="back" ${state.loading?'disabled':''}>${officialBackIcon()}</button><img class="logo small" src="../assets/logo_schoology.png" alt="Schoology"><h1>QR Code Login</h1>${state.loading?`<div class="qrAuthorizationLoading"><img src="../assets/android_loading_spinner_72.gif" alt=""><p>Signing in to Schoology…</p></div>`:`<p>Scan Your Code</p><video id="video" autoplay playsinline muted></video><canvas id="canvas"></canvas><p class="qrhint">Point your camera at the QR code shown in Schoology.</p>`}${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function drawerItemMarkup(id,label,icon){
 return `<button class="drawerItem" data-drawer="${id}"><span class="drawerIcon"><img src="../assets/icons/${icon}.svg" alt=""></span><span class="drawerLabel">${label}</span>${['messages','notifications','requests'].includes(id)?'<span class="drawerBadge"></span>':''}${id==='courses'||id==='groups'||id==='grades'?'<span class="disclosure">›</span>':''}</button>`;
}
function shell(){
 const drawerItems=[
  ['messages','Messages','ic_menu_messages'],['notifications','Notifications','ic_menu_notifications'],['requests','Requests','ic_menu_requests'],
  ['home','Home','ic_menu_home'],['courses','Courses','ic_menu_courses'],['groups','Groups','ic_menu_groups'],['resources','Resources','ic_menu_resources'],['grades','Grades','ic_menu_grades'],['calendar','Calendar','ic_menu_calender'],
  ...(state.peopleEnabled?[['people','People','ic_menu_people']]:[]),['settings','Settings','ic_menu_account_settings'],['logout','Logout','ic_menu_logout']
 ];
 const drawerPage=state.drawerPage==='courses'||state.drawerPage==='groups'||state.drawerPage==='grades'?`
   <div class="drawerSub">
    <div class="drawerSubHeader"><button id="drawerBack" class="drawerBack">${officialBackIcon()}</button><span>${state.drawerPage==='grades'?'Grades':state.drawerPage==='groups'?'Groups':'Courses'}</span>${state.drawerPage==='courses'?'<button id="joinCourse" class="drawerHeaderAction" style="display:none">+</button>':state.drawerPage==='groups'?'<button id="joinGroup" class="drawerHeaderAction" style="display:none">+</button>':'<span class="drawerHeaderSpacer"></span>'}</div>
    <div id="courseSubList" class="courseSubList"><div class="drawerLoading">Loading ${state.drawerPage==='grades'?'grades':state.drawerPage==='groups'?'groups':'courses'}…</div></div>
   </div>`:'';
 const drawerList=drawerItems.map(([id,label,icon],i)=>`${i===3?'<div class="drawerDivider"></div>':''}${id==='settings'?'<div class="drawerDivider"></div>':''}${drawerItemMarkup(id,label,icon)}`).join('');
 return `<div class="shell">
 <header class="toolbar">${state.assignmentView||state.embeddedTitle?`<button id="toolbarBack" class="iconButton" aria-label="Back">${officialBackIcon()}</button>`:`<button id="menuButton" class="iconButton" aria-label="Navigation menu">${menuImg}</button>`}<span class="toolbarTitle">${esc(state.toolbarTitle||'Home')}</span><span id="toolbarActionSlot" class="toolbarActionSlot"></span></header>
 <main id="content"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></main>
 <div id="drawerShade" class="drawerShade ${drawerPage?'submenuShade':''}"></div><aside id="drawer" class="drawer ${drawerPage?'drawerSubMode':''}">
   ${drawerPage||`<button id="drawerProfile" class="profileRow" aria-label="Open profile"><span class="profileAvatarCircle"><img data-profile-drawer-image="1" src="../assets/icons/profile_default_website.png" alt=""></span><span>${esc(state.auth?.user?.name_display||state.auth?.user?.name||'Profile')}</span></button><div class="drawerList">${drawerList}</div>`}
 </aside>
 </div>`;
}
function setDownloadButtonState(button,active,label='Downloading…'){
  if(!button)return;
  if(active){
    button.dataset.downloadBusy='1';button.disabled=true;button.classList.add('downloadBusy');
    if(!button.querySelector('.downloadProgressWrap')) button.insertAdjacentHTML('beforeend',`<span class="downloadProgressWrap"><img src="../assets/android_loading_spinner_72.gif" alt=""><span>${esc(label)}</span></span>`);
  }else{
    button.disabled=false;button.classList.remove('downloadBusy');button.querySelector('.downloadProgressWrap')?.remove();delete button.dataset.downloadBusy;
  }
}
async function downloadWithFeedback(button,params){
  const progressId='dl-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  setDownloadButtonState(button,true);
  const stop=A.onFileDownloadProgress?.(d=>{if(!d||d.id!==progressId)return;if(d.total){const pct=Math.min(100,Math.round((d.received/d.total)*100));const wrap=button.querySelector('.downloadProgressWrap span:last-child');if(wrap)wrap.textContent=`Downloading… ${pct}%`;}});
  try{return await A.downloadFile({...params,progressId});}
  finally{stop?.();setDownloadButtonState(button,false);}
}

async function showJoinCourseDialog(){
  const old=document.getElementById('joinCourseDialog');old?.remove();const wrap=document.createElement('div');wrap.id='joinCourseDialog';wrap.className='assignmentCommentDialogOverlay';
  wrap.innerHTML=`<section class="androidSimpleDialog" role="dialog" aria-modal="true"><header><b>Join Course</b><button id="joinCourseCancel" class="androidDialogIcon">${officialIcon('ic_action_discard_icon.png','Cancel')}</button></header><div class="androidSimpleDialogBody"><label>Access Code</label><input id="joinCourseCode" autocomplete="off" placeholder="Enter access code"><div id="joinCourseStatus"></div></div><footer><button id="joinCourseSubmit" class="androidPrimary">Join</button></footer></section>`;
  document.body.appendChild(wrap);const close=()=>wrap.remove();wrap.querySelector('#joinCourseCancel')?.addEventListener('click',close);wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('#joinCourseSubmit')?.addEventListener('click',async()=>{const code=wrap.querySelector('#joinCourseCode')?.value.trim();const st=wrap.querySelector('#joinCourseStatus');if(!code){st.textContent='Enter an access code.';return}try{st.textContent='Joining…';const x=await A.api({path:'sections/accesscode',method:'POST',json:true,params:{access_code:code}});const status=String(x?.status||x?.enrollment?.status||'').toLowerCase();st.textContent=status==='pending'?'Course request sent.':status==='active'?'You joined the course.':'Course request submitted.';setTimeout(()=>{close();loadCourseSubmenu()},500)}catch(e){st.textContent='Unable to join course: '+e.message}});requestAnimationFrame(()=>wrap.querySelector('#joinCourseCode')?.focus());
}
async function showJoinGroupDialog(){
  const old=document.getElementById('joinGroupDialog');old?.remove();
  const wrap=document.createElement('div');wrap.id='joinGroupDialog';wrap.className='assignmentCommentDialogOverlay';
  wrap.innerHTML=`<section class="androidSimpleDialog" role="dialog" aria-modal="true"><header><b>Join Group</b><button id="joinGroupCancel" class="androidDialogIcon">${officialIcon('ic_action_discard_icon.png','Cancel')}</button></header><div class="androidSimpleDialogBody"><label>Access Code</label><input id="joinGroupCode" autocomplete="off" placeholder="Enter access code"><div id="joinGroupStatus"></div></div><footer><button id="joinGroupSubmit" class="androidPrimary">Join</button></footer></section>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();wrap.querySelector('#joinGroupCancel')?.addEventListener('click',close);wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('#joinGroupSubmit')?.addEventListener('click',async()=>{const code=wrap.querySelector('#joinGroupCode')?.value.trim();const st=wrap.querySelector('#joinGroupStatus');if(!code){st.textContent='Enter an access code.';return}try{st.textContent='Joining…';const x=await A.api({path:'groups/accesscode',method:'POST',json:true,params:{access_code:code}});const status=String(x?.status||x?.enrollment?.status||'').toLowerCase();st.textContent=status==='pending'?'Group request sent.':status==='active'?'You joined the group.':'Group request submitted.';setTimeout(()=>{close();loadCourseSubmenu()},500)}catch(e){st.textContent='Unable to join group: '+e.message}});
  requestAnimationFrame(()=>wrap.querySelector('#joinGroupCode')?.focus());
}
function showHomeCreateMenu(){
  document.getElementById('homeCreateMenu')?.remove();const plus=document.getElementById('homeCreatePlus');if(!plus)return;const r=plus.getBoundingClientRect();
  const m=document.createElement('div');m.id='homeCreateMenu';m.className='assignmentActionMenu';m.innerHTML=`<button id="createHomeDiscussion"><span>Discussion</span></button><button id="createHomeEvent"><span>Event</span></button>`;document.body.appendChild(m);m.style.top=(r.bottom+6)+'px';m.style.right=(window.innerWidth-r.right)+'px';
  document.getElementById('createHomeDiscussion')?.addEventListener('click',()=>{m.remove();showCreatePostDialog('discussion','',null)});
  document.getElementById('createHomeEvent')?.addEventListener('click',()=>{m.remove();showCreatePostDialog('event','',null)});
  setTimeout(()=>document.addEventListener('mousedown',function f(e){if(!m.contains(e.target)&&e.target!==plus){m.remove();document.removeEventListener('mousedown',f)}},0),0);
}
function showCreatePostDialog(kind,realm,realmId){
  const old=document.getElementById('createPostDialog');old?.remove();
  const wrap=document.createElement('div');wrap.id='createPostDialog';wrap.className='assignmentCommentDialogOverlay';
  const isEvent=kind==='event', title=isEvent?'New Event':'New Discussion';
  if(isEvent)wrap.classList.add('createEventDialogOverlay');
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const dateValue=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const timeValue=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const postTo=(realm==='users'?'My Account':`${realm.charAt(0).toUpperCase()+realm.slice(1)} ${realmId||''}`).trim();
  wrap.innerHTML=`<section class="androidCreatePostDialog ${isEvent?'androidCreateEventDialog':''}" role="dialog" aria-modal="true">
    <header class="androidCommentDialogBar"><button id="createPostCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">${isEvent?esc(postTo):title}</div><button id="createPostSend" class="androidDialogIcon" aria-label="Post">${officialIcon('ic_action_send_icon.png','Post')}</button></header>
    <div class="androidCreatePostBody">
      ${isEvent?`<div class="androidPostToField androidEventPostTo" aria-label="Post to">${esc(postTo)}</div>`:`<label class="androidFieldLabel">Post To</label><div class="androidPostToField">${esc(postTo)}</div>`}
      ${isEvent?`<label class="androidSwitchRow androidEventSwitchRow"><span>All Day</span><input id="createEventAllDay" class="androidEventSwitchInput" type="checkbox" checked><span class="androidEventSwitchTrack" aria-hidden="true"></span></label>
      <div class="androidDateRow androidEventWhenRow"><span>When</span><input id="createEventStartDate" aria-label="Start date" type="date" value="${dateValue}"><input id="createEventStartTime" aria-label="Start time" type="time" value="${timeValue}"></div>
      <label class="androidCheckRow androidEventEndToggle"><input id="createEventAddEnd" type="checkbox"><span>End Date</span></label>
      <div id="createEventEndWrap" class="androidDateRow androidEventWhenRow" style="display:none"><input id="createEventEndDate" aria-label="End date" type="date" value="${dateValue}"><input id="createEventEndTime" aria-label="End time" type="time" value="${timeValue}"><button id="createEventEndCancel" type="button" aria-label="Remove end date">×</button></div>`:''}
      <input id="createPostTitle" placeholder="Title" autocomplete="off">
      <textarea id="createPostBody" placeholder="Description"></textarea>
      ${isEvent?`<div class="androidEventRsvpRow"><label class="androidFieldLabel" for="createEventRsvp">RSVP</label><select id="createEventRsvp"><option value="0">No RSVP</option><option value="1">Yes</option><option value="2">Maybe</option></select></div>
      <label class="androidSwitchRow androidEventSwitchRow"><span>Enable comments</span><input id="createEventComments" class="androidEventSwitchInput" type="checkbox" checked><span class="androidEventSwitchTrack" aria-hidden="true"></span></label>`:
      `<label class="androidCheckRow"><input id="createDiscussionDue" type="checkbox"> Due Date</label>
      <div id="createDiscussionDueWrap" class="androidDateRow" style="display:none"><input id="createDiscussionDueDate" type="date" value="${dateValue}"><input id="createDiscussionDueTime" type="time" value="${timeValue}"></div>
      <label class="androidCheckRow"><input id="createDiscussionGrading" type="checkbox"> Enable Grading</label>
      <div id="createDiscussionGradingWrap" class="androidGradingBox" style="display:none"><label>Max Points <input id="createDiscussionMaxPoints" type="number" min="0" step="0.01"></label><label>Factor <input id="createDiscussionFactor" type="number" min="0" step="0.01" value="1.0"></label></div>
      <label class="androidCheckRow"><input id="createDiscussionPublished" type="checkbox" checked> Published</label>`}
      <div class="messageAttachmentChoices createPostAttachmentChoices"><button id="createPostAttachFile" type="button">${officialOrAssetIcon('ic_action_ic_menu_folder.png','File')}File</button><button id="createPostAttachResource" type="button">${officialOrAssetIcon('ic_attach_resourcesv3.png','')}Resources</button></div><div id="createPostAttachmentList"></div>
      <div id="createPostStatus" class="androidCreatePostStatus"></div>
    </div>
  </section>`;
  document.body.appendChild(wrap);
  let selectedRealm=realm||'', selectedId=realmId||null;
  const postToEl=wrap.querySelector('.androidPostToField');
  if(!selectedRealm){
    postToEl.innerHTML='<span class="androidPostToLoading">Loading destinations…</span>';
    (async()=>{try{
      const uid=state.auth?.userId||state.auth?.user?.id;const [sx,gx]=await Promise.all([A.api({path:`users/${uid}/sections`,params:{limit:100}}).catch(()=>({})),A.api({path:`users/${uid}/groups`,params:{limit:100}}).catch(()=>({}))]);
      const sections=sx?.section||sx?.sections||[],groups=gx?.group||gx?.groups||[];const opts=[{realm:'users',id:uid,label:'My Account'},...sections.map(x=>({realm:'sections',id:x.id||x.section_id,label:x.section_title||x.course_title||x.title||'Course'})),...groups.map(x=>({realm:'groups',id:x.id||x.group_id,label:x.name||x.title||'Group'}))].filter(x=>x.id!=null);
      if(!opts.length)throw new Error('No posting destinations were found.');
      postToEl.innerHTML='<select id="createPostDestination">'+opts.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join('')+'</select>';
      const sel=postToEl.querySelector('#createPostDestination');const apply=()=>{const o=opts[Number(sel.value)||0];selectedRealm=o.realm;selectedId=o.id};sel?.addEventListener('change',apply);apply();
    }catch(e){postToEl.innerHTML='<span class="androidCreatePostStatus">Unable to load posting destinations.</span>';postToEl.dataset.error=e.message||String(e)}})();
  }

  const close=()=>wrap.remove();
  const postAttachments={files:[],resources:[]};
  wrap.querySelector('#createPostAttachFile')?.addEventListener('click',async()=>{try{const picked=await A.pickFile?.();if(!picked)return;const filePath=typeof picked==='string'?picked:(picked.path||picked.filePath);if(!filePath)throw new Error('The selected file has no local path.');const fileId=await A.uploadSchoologyFile({filePath,mime:typeof picked==='object'?picked.mime:''});postAttachments.files.push(String(fileId));const row=document.createElement('div');row.className='messageAttachedItem';row.textContent=(typeof picked==='object'&&(picked.name||picked.fileName))||(filePath.split(/[\\/]/).pop());wrap.querySelector('#createPostAttachmentList')?.appendChild(row)}catch(e){showAppDialog('Unable to attach file',e.message||String(e))}});
  wrap.querySelector('#createPostAttachResource')?.addEventListener('click',async()=>{try{await chooseSchoologyResource(resource=>{const id=resource.template_id??resource.templateID??resource.resource_id??resource.resourceId??resource.template?.id??resource.id;if(id==null)throw new Error('This resource does not have a usable Schoology resource ID.');postAttachments.resources.push(String(id));const row=document.createElement('div');row.className='messageAttachedItem';row.textContent=resourceTitle(resource);wrap.querySelector('#createPostAttachmentList')?.appendChild(row)},'Attach Resource')}catch(e){showAppDialog('Unable to attach resource',e.message||String(e))}});
  wrap.querySelector('#createPostCancel')?.addEventListener('click',close);
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  if(isEvent){
    const all=wrap.querySelector('#createEventAllDay'),end=wrap.querySelector('#createEventAddEnd'),endWrap=wrap.querySelector('#createEventEndWrap');
    const sync=()=>{wrap.querySelector('#createEventStartTime').disabled=all.checked;wrap.querySelector('#createEventEndWrap').style.display=end.checked?'flex':'none';};
    all?.addEventListener('change',sync);end?.addEventListener('change',sync); wrap.querySelector('#createEventStartTime')?.addEventListener('focus',()=>{if(all.checked){all.checked=false;sync()}}); wrap.querySelector('#createEventEndTime')?.addEventListener('focus',()=>{if(all.checked){all.checked=false;sync()}});wrap.querySelector('#createEventEndCancel')?.addEventListener('click',()=>{end.checked=false;sync()});sync();
  }else{
    const due=wrap.querySelector('#createDiscussionDue'),grading=wrap.querySelector('#createDiscussionGrading');
    due?.addEventListener('change',()=>wrap.querySelector('#createDiscussionDueWrap').style.display=due.checked?'flex':'none');
    grading?.addEventListener('change',()=>wrap.querySelector('#createDiscussionGradingWrap').style.display=grading.checked?'block':'none');
  }
  wrap.querySelector('#createPostSend')?.addEventListener('click',async()=>{
    const titleText=wrap.querySelector('#createPostTitle')?.value.trim(), body=wrap.querySelector('#createPostBody')?.value.trim(), st=wrap.querySelector('#createPostStatus'), send=wrap.querySelector('#createPostSend');
    if(!titleText){st.textContent=isEvent?'Enter a title.':'Enter a title.';return}
    if(!selectedRealm||!selectedId){st.textContent=wrap.querySelector('.androidPostToField')?.dataset.error||'Choose where to post this first.';return}
    send.disabled=true;st.textContent='Posting…';
    try{
      if(isEvent){
        const all=!!wrap.querySelector('#createEventAllDay')?.checked;
        const sd=wrap.querySelector('#createEventStartDate')?.value,stt=wrap.querySelector('#createEventStartTime')?.value||'00:00';
        const ed=wrap.querySelector('#createEventEndDate')?.value,ett=wrap.querySelector('#createEventEndTime')?.value||'00:00';
        const start=all?`${sd} 00:00:00`:`${sd} ${stt}:00`;
        const hasEnd=!!wrap.querySelector('#createEventAddEnd')?.checked;
        if(hasEnd && ed && new Date(`${ed}T${ett}`)<new Date(`${sd}T${stt}`))throw new Error('The end date cannot be before the start date.');
        const params={title:titleText,description:body,start,is_all_day:all?1:0,rsvp:Number(wrap.querySelector('#createEventRsvp')?.value||0),comments_enabled:wrap.querySelector('#createEventComments')?.checked?1:0};
        if(hasEnd){params.has_end=1;params.end=all?`${ed} 23:59:00`:`${ed} ${ett}:00`}
        if(postAttachments.files.length)params['file-attachment']={id:postAttachments.files};
        if(postAttachments.resources.length)params.attachments=postAttachments.resources.map(resource=>({resource:Number(resource)}));
        await A.api({path:`${selectedRealm}/${selectedId}/events`,method:'POST',params,json:true});
      }else{
        const params={title:titleText,body,published:wrap.querySelector('#createDiscussionPublished')?.checked?1:0};
        if(postAttachments.files.length)params['file-attachment']={id:postAttachments.files};
        if(postAttachments.resources.length)params.attachments=postAttachments.resources.map(resource=>({resource:Number(resource)}));
        if(wrap.querySelector('#createDiscussionDue')?.checked){const d=wrap.querySelector('#createDiscussionDueDate')?.value,t=wrap.querySelector('#createDiscussionDueTime')?.value||'00:00';params.due_date=`${d} ${t}:00`}
        if(wrap.querySelector('#createDiscussionGrading')?.checked){const max=wrap.querySelector('#createDiscussionMaxPoints')?.value;if(!max){throw new Error('Enter maximum points.')}params.graded=1;params.max_points=Number(max);params.factor=Number(wrap.querySelector('#createDiscussionFactor')?.value||1)}
        await A.api({path:`${selectedRealm}/${selectedId}/discussions`,method:'POST',params,json:true});
      }
      close();loadTab();
    }catch(e){send.disabled=false;st.textContent='Unable to create '+kind+': '+(e.message||e)}
  });
  requestAnimationFrame(()=>wrap.querySelector('#createPostTitle')?.focus());
}

async function hydrateProfileDrawer(){const el=document.querySelector('[data-profile-drawer-image]');let u=state.auth?.user||{};let url=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||'');if(!url){const uid=state.auth?.userId||u.id;if(uid){try{const r=await A.api({path:`users/${uid}`,params:{picture_size:'sm'}});u=r?.user||r||u;state.auth.user={...(state.auth.user||{}),...u};url=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||'')}catch{}}}if(el&&url){try{const d=await A.fetchImage(url);if(d)el.src=d}catch{}}}

async function updateDrawerBadges(){
  const checks=[['messages','messages/inbox'],['notifications','notifications'],['requests',`users/${state.auth?.userId||state.auth?.user?.id||0}/requests/friends`]];
  for(const [id,path] of checks){try{const x=await A.api({path,params:{limit:1}});const n=id==='notifications'?Number(x?.notifications?.unviewed_count??x?.notifications?.unviewedCount??x?.unviewed_count??x?.unviewedCount??0):Number(x?.total||x?.unread||x?.count||0);document.querySelector(`[data-drawer="${id}"] .drawerBadge`)?.classList.toggle('visible',n>0)}catch{}}
}

function bind(){
  const openLoginHelp=()=>A.openExternal('https://docs.powerschool.com/SGYH/en/students/schoology-mobile-apps/logging-into-the-schoology-mobile-app-students').catch(e=>{state.error=e.message||'Unable to open the sign-in help page.';render()});
  document.getElementById('loginHelp')?.addEventListener('click',openLoginHelp);
  document.getElementById('loginHelpCredentials')?.addEventListener('click',openLoginHelp);
  document.getElementById('switchCanada')?.addEventListener('click',async()=>{try{state.canadianInstance=await A.setServerInstance(!state.canadianInstance);state.schools=[];state.q='';state.error='';state.searchToken++;render()}catch(e){showAppDialog('Unable to switch Schoology instance',e.message||String(e))}});
  document.getElementById('composeMessage')?.addEventListener('click',()=>showComposeMessage());document.getElementById('joinGroup')?.addEventListener('click',showJoinGroupDialog);
  document.getElementById('toolbarBack')?.addEventListener('click',()=>navigateBack());
  const schoolBtn=document.getElementById('schoolLogin');if(schoolBtn)schoolBtn.onclick=()=>{state.error='';state.q='';state.schools=[];state.screen='search';render();document.getElementById('schoolSearch')?.focus()};
  const accountBtn=document.getElementById('continueSchoology');if(accountBtn)accountBtn.onclick=()=>{state.error='';state.school=null;state.screen='credentials';render();document.getElementById('user')?.focus()};
  const qrbtn=document.getElementById('qrLogin');if(qrbtn)qrbtn.onclick=()=>{state.error='';state.screen='qr';render();startQR()};
  const back=document.getElementById('back');if(back)back.onclick=()=>{stopQR();state.error='';state.screen=state.school?'search':'login';if(state.screen==='search')state.schools=[];render()};
  const q=document.getElementById('schoolSearch');
  if(q){
    const status=document.getElementById('schoolSearchStatus'), list=document.getElementById('schoolSuggestions');
    const updateSearchUi=()=>{
      if(status)status.innerHTML=state.loading?'<div class="searchStatus">Searching…</div>':(!state.error&&state.q&&state.schools.length===0?'<div class="searchStatus">No schools found.</div>':'');
      if(list)list.innerHTML=state.schools.length?`<div class="suggestions">${state.schools.map((s,i)=>`<button class="suggestion" data-school="${i}"><b>${esc(s.title||'')}</b><small>${esc([s.id,s.domain,s.location].filter(Boolean).join(' • '))}</small></button>`).join('')}</div>`:'';
      list?.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{state.school=state.schools[+b.dataset.school];state.schools=[];state.error='';state.screen='externalSelect';void startSchoolBrowserLogin();});
    };
    q.oninput=async()=>{
      const query=q.value.trim();state.q=q.value;state.error='';
      if(query.length<1){state.schools=[];state.loading=false;updateSearchUi();return;}
      const token=++state.searchToken;state.loading=true;updateSearchUi();
      try{const results=await A.schoolSearch(query);if(token!==state.searchToken)return;state.schools=Array.isArray(results)?results:[]}
      catch(e){if(token===state.searchToken){state.schools=[];state.error=e.message||'Unable to search for schools.'}}
      finally{if(token===state.searchToken){state.loading=false;updateSearchUi()}}
    };
    updateSearchUi();
  }

  const browserLogin=document.getElementById('browserLogin');
  if(browserLogin)browserLogin.onclick=()=>{void startSchoolBrowserLogin()};
  const si=document.getElementById('signIn');if(si)si.onclick=async()=>{const user=document.getElementById('user')?.value||'',password=document.getElementById('pass')?.value||'';state.error='';if(!user||!password){state.error='Enter your username or email and password.';render();return}si.disabled=true;si.textContent='Logging you in…';try{state.auth=await A.loginCredentials({user,password,schoolId:state.school?.id??null});await afterLogin()}catch(e){state.error=e.message||'Login failed.';render()}};

  const shade=document.getElementById('drawerShade'),drawer=document.getElementById('drawer');
  const setDrawer=(open)=>{drawer?.classList.toggle('open',open);shade?.classList.toggle('open',open);if(!open)state.drawerPage=null;syncWindowChrome()};
  document.getElementById('menuButton')?.addEventListener('click',()=>setDrawer(true));
  shade?.addEventListener('click',()=>setDrawer(false));

  hydrateProfileDrawer();updateDrawerBadges();document.getElementById('drawerProfile')?.addEventListener('click',()=>{closeDrawerThen(()=>{state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.embeddedTitle=null;state.profileUser=state.auth?.user||null;state.profileTab='updates';state.tab='profile';state.toolbarTitle='Profile';render();loadTab()})});
  document.getElementById('drawerBack')?.addEventListener('click',()=>{const d=document.getElementById('drawer'); if(!d)return; d.classList.add('noSlide'); state.drawerPage=null; render(); requestAnimationFrame(()=>{document.getElementById('drawer')?.classList.add('open'); requestAnimationFrame(()=>document.getElementById('drawer')?.classList.remove('noSlide'))})});
  document.getElementById('joinCourse')?.addEventListener('click',()=>{state.drawerPage=null;render();document.getElementById('drawer')?.classList.add('open')});

  document.querySelectorAll('[data-drawer]').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.drawer;
    if(id==='courses'||id==='groups'||id==='grades'){
      state.drawerPage=id;const drawer=document.getElementById('drawer');if(drawer){drawer.innerHTML=`<div class="drawerSub"><div class="drawerSubHeader"><button id="drawerBack" class="drawerBack">${officialBackIcon()}</button><span>${id==='grades'?'Grades':id==='groups'?'Groups':'Courses'}</span>${id==='courses'?'<button id="joinCourse" class="drawerHeaderAction" style="display:none">+</button>':id==='groups'?'<button id="joinGroup" class="drawerHeaderAction" style="display:none">+</button>':'<span class="drawerHeaderSpacer"></span>'}</div><div id="courseSubList" class="courseSubList"><div class="drawerLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading ${id==='grades'?'grades':id==='groups'?'groups':'courses'}…</span></div></div></div>`;drawer.classList.add('open');document.getElementById('drawerShade')?.classList.add('open')}bind();loadCourseSubmenu();return;
    }
    closeDrawerThen(async()=>{
      if(id==='logout'){showAppDialog('Logout','Do you want to log out?',[{label:'No',action:null},{label:'Yes',action:async()=>{await A.logout();state.auth=null;state.user=null;state.school=null;state.tab='home';state.screen='login';state.error='';render()}}]);return}
      if(id==='settings'){state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.currentGroup=null;state.profileUser=null;state.embeddedTitle=null;state.tab='settings';state.toolbarTitle='Settings';state.screen='app';render();loadTab();return}
      if(['home','calendar','grades','messages','notifications','requests','resources','profile','groups','people'].includes(id)){state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.currentGroup=null;state.profileUser=null;state.embeddedTitle=null;state.tab=id;state.toolbarTitle=id.charAt(0).toUpperCase()+id.slice(1);state.screen='app';render();loadTab()}
    });
  }));

  document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{const order=['recent','dashboard','upcoming'];const oldIndex=order.indexOf(state.homeTab),newIndex=order.indexOf(b.dataset.homeTab);state.homeTabDirection=newIndex>=oldIndex?'forward':'back';state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(m){state.message=m;render();}});
  document.getElementById('messageBack')?.addEventListener('click',()=>{state.message=null;state.messageThread=null;render();loadTab()});
  document.querySelectorAll('[data-message-tab]').forEach(b=>b.onclick=()=>{state.messageTab=b.dataset.messageTab;loadTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(!m)return;state.message=m;state.messageFolder=state.messageTab;state.messageThread=null;render();await loadMessageThread(m)});
  document.querySelectorAll('[data-download-url]').forEach(b=>b.onclick=async()=>{
    const info={url:b.dataset.downloadUrl,filename:b.dataset.downloadName,mime:b.dataset.downloadMime};
    const download=async()=>{const r=await downloadWithFeedback(b,info);const err=await A.openDownloadedFile({path:r.path});if(typeof err==='string'&&err)throw new Error(err)};
    if(isPdfAttachment(info)){showPdfAttachmentOptions(info,download);return}
    try{await download()}catch(e){alert('Unable to open file: '+e.message)}
  });
  document.querySelectorAll('[data-open-url]').forEach(b=>b.onclick=()=>openWithPressTransition(b,()=>showEmbeddedWeb(b.dataset.openUrl,'Link')));
  document.querySelectorAll('[data-embed-html]').forEach(b=>b.onclick=()=>showEmbeddedWeb('data:text/html;charset=utf-8,'+encodeURIComponent(b.dataset.embedHtml),'Embedded content'));
  document.querySelectorAll('[data-course-sub]').forEach(b=>b.onclick=()=>{const i=+b.dataset.courseSub;const c=window.__schoologyCourses?.[i];state.drawerPage=null;state.tab='courses';state.courseView='course';state.toolbarTitle=courseToolbarTitleOf(c);state.screen='app';render();showCourse(c)});
}
function directoryIsPublic(user){
 const objects=[user,user?.user_permissions,user?.userPermissions,user?.permissions,user?.user?.user_permissions,user?.user?.userPermissions,user?.user?.permissions].filter(Boolean);
 const truthy=v=>v===true||v===1||String(v??'').toLowerCase()==='true'||String(v??'')==='1';
 return objects.some(o=>['is_directory_public','directory_public','isDirectoryPublic','directoryPublic'].some(key=>Object.prototype.hasOwnProperty.call(o,key)&&truthy(o[key])));
}
async function resolvePeopleDrawerVisibility(){
 const uid=state.auth?.userId||state.auth?.user?.id;let user=state.auth?.user||{};
 try{if(uid){const response=await A.api({path:'users/'+uid,params:{}});user=response?.user||response?.data?.user||response||user;}}catch(e){console.warn('Unable to check School Directory visibility:',e?.message||e)}
 const mobile=state.mobileMe||{};
 const objects=[user,user?.user_permissions,user?.userPermissions,user?.permissions,mobile,mobile?.user,mobile?.user_permissions,mobile?.userPermissions,state.auth,state.auth?.user,state.auth?.user_permissions,state.auth?.userPermissions].filter(Boolean);
 const truthy=v=>v===true||v===1||String(v??'').toLowerCase()==='true'||String(v??'')==='1';
 let enterprise=false;
 for(const o of objects){for(const key of ['is_enterprise_user','isEnterpriseUser','enterprise','is_enterprise','isEnterprise','enterprise_enabled'])if(Object.prototype.hasOwnProperty.call(o,key)&&truthy(o[key]))enterprise=true;for(const key of ['ent_stat','entStat','ENT_STAT'])if(Number(o[key])===573)enterprise=true;}
 state.peopleEnabled=enterprise&&directoryIsPublic(user);
}

async function afterLogin(){
  stopQR();
  try{
    const mm=await A.api({path:'mobile/me',params:{}});
    state.mobileMe=mm||{};
    const settings=mm?.settings||{};
    state.courseDashboardEnabled=settings.course_dashboard_enabled===true;
    try{state.windowChromeOverlay=(await A.getWindowChromeMode?.())?.overlay!==false}catch{}
    document.documentElement.dataset.windowControlsOverlay=String(state.windowChromeOverlay);
    state.preferredHomepage=settings.default_start_page==='course_dashboard'?'dashboard':'recent';
    if(state.preferredHomepage==='dashboard'&&!state.courseDashboardEnabled)state.preferredHomepage='recent';
    state.homeTab=state.preferredHomepage;
  }catch(e){
    // Login itself has already succeeded. A preferences endpoint failure must
    // not strand QR/browser sign-in on the login screen.
    console.warn('Unable to load mobile homepage preferences:',e?.message||e);
    state.mobileMe={};state.courseDashboardEnabled=false;state.preferredHomepage='recent';state.homeTab='recent';
  }
  await resolvePeopleDrawerVisibility();
  state.loading=false;state.screen='app';render();await loadTab();
  if(pendingDeepLinkAfterLogin){const pending=pendingDeepLinkAfterLogin;pendingDeepLinkAfterLogin=null;setTimeout(async()=>{try{if(await routeSchoologyLink(pending))return;await showEmbeddedWeb(pending,'Schoology Link',{openInitialExternalInBrowser:false})}catch(e){showAppDialog('Unable to open Schoology link',e.message||String(e))}},0)}
}
async function hydrateCourseImages(root=document){
  const els=root.querySelectorAll?.('[data-course-image-url]')||[];
  await Promise.all([...els].map(async el=>{
    const url=el.getAttribute('data-course-image-url');if(!url)return;
    const fallback=el.parentElement?.querySelector?.('.dashboardCourseFallback,.sectionProfileFallback,.courseAppFallback,.groupImageFallback,.courseImageFallback');
    try{const data=await A.fetchImage(url);if(data){el.src=data;el.style.display='block';if(fallback)fallback.style.setProperty('display','none','important');return}}catch{}
    if(fallback)fallback.style.setProperty('display','flex','important');
  }));
}
async function canJoinByAccessCode(path){
  try{
    const x=await A.api({path:'multioptions',method:'POST',params:{request:[`/v1/${path}`]},json:true});
    const responses=Array.isArray(x?.response)?x.response:(Array.isArray(x?.responses)?x.responses:[]);
    const hasPost=v=>{if(v==null)return false;if(typeof v==='boolean')return v;if(typeof v==='number')return v===1;if(typeof v==='string'){const z=v.trim().toLowerCase();if(z==='true'||z==='1'||z==='post')return true;try{return hasPost(JSON.parse(v))}catch{return false}}if(Array.isArray(v))return v.some(hasPost);if(typeof v==='object')return !!(v.post??v.POST??v.create??v.CREATE)||Object.entries(v).some(([k,val])=>String(k).toLowerCase()==='post'&&hasPost(val));return false};
    return responses.some(r=>{if(Number(r?.response_code??r?.responseCode)===403)return false;let body=r?.body??r?.data??r;try{if(typeof body==='string')body=JSON.parse(body)}catch{}return hasPost(r?.permission_map??r?.permissionMap)||hasPost(body?.permission_map??body?.permissionMap)||hasPost(body?.permissions)||hasPost(body)});
  }catch{return false}
}
async function loadCourseSubmenu(){
 const c=document.getElementById('courseSubList');if(!c)return;
 try{
   const page=state.drawerPage;
   const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('No logged-in user ID.');
   if(page==='groups'){
     const x=await A.api({path:`users/${uid}/groups`,params:{limit:100}});const arr=x.group||x.groups||[];window.__schoologyGroups=arr;
     c.innerHTML=arr.length?arr.map((g,i)=>{const gi=normalizeImageUrl(g.picture_url||g.pictureUrl||g.picture||g.image||'');return `<button class="courseSubItem" data-group-sub="${i}"><span class="courseThumb groupThumb">${gi?`<img data-course-image-url="${esc(gi)}" alt="" style="display:none">`:''}<span class="courseImageFallback">${esc(String(g.name||g.title||'G').charAt(0))}</span></span><span class="courseText"><b>${esc(g.name||g.title||'Group')}</b><small>${esc(g.description||g.group_description||'')}</small></span>${g.admin?'<span class="courseAdmin">★</span>':''}<span class="disclosure">›</span></button>`}).join(''):'<div class="drawerEmpty">No groups found.</div>';
     await hydrateCourseImages(c);
     document.getElementById('joinGroup')?.addEventListener('click',showJoinGroupDialog);
     const jb=document.getElementById('joinGroup');if(jb)jb.style.display=await canJoinByAccessCode('groups/accesscode')?'':'none';
     document.querySelectorAll('[data-group-sub]').forEach(b=>b.onclick=()=>{const g=window.__schoologyGroups[+b.dataset.groupSub];if(!g)return;closeDrawerThen(()=>{state.drawerPage=null;state.tab='groups';state.currentGroup=g;state.toolbarTitle=g?.name||'Group';render();showGroup(g);syncToolbar();});});
     return;
   }
   const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});const arr=x.section||x.sections||[];window.__schoologyCourses=arr;
   c.innerHTML=arr.length?arr.map((s,i)=>{const courseTitle=s.course_title||s.courseTitle||s.title||s.section_title||'Course';const sectionTitle=s.section_title||s.sectionTitle||'';const image=normalizeImageUrl(s.profile_url||s.profileUrl||s.course_profile_url||s.courseProfileUrl||s.course_theme||s.courseTheme||s.image||s.course_image||'');return `<button class="courseSubItem" data-course-sub="${i}"><span class="courseThumb">${image?`<img data-course-image-url="${esc(image)}" alt="" style="display:none">`:''}<span class="courseImageFallback">${esc(courseTitle.charAt(0))}</span></span><span class="courseText"><b>${esc(courseTitle)}</b><small>${esc(sectionTitle)}</small></span><span class="disclosure">›</span></button>`}).join(''):'<div class="drawerEmpty">No courses found.</div>';
   const joinCourseButton=document.getElementById('joinCourse');
   if(page==='courses'&&joinCourseButton){joinCourseButton.style.display=await canJoinByAccessCode('sections/accesscode')?'':'none';joinCourseButton.onclick=showJoinCourseDialog;}
   document.querySelectorAll('[data-course-sub]').forEach(b=>b.onclick=()=>{const course=window.__schoologyCourses[+b.dataset.courseSub];closeDrawerThen(()=>{state.drawerPage=null;state.tab=page==='grades'?'grades':'courses';state.courseView='course';state.toolbarTitle=courseToolbarTitleOf(course);state.screen='app';render();showCourse(course,page==='grades'?'grades':'materials')});});
   await hydrateCourseImages(c);
 }catch(e){c.innerHTML=`<div class="drawerError">${esc(e.message)}</div>`}
}
function showGradeSection(course){
 state.selectedCourse=course;
 const c=document.getElementById('content');if(!c)return;
 const title=courseTitleOf(course),section=sectionTitleOf(course),sid=course?.id||course?.section_id||course?.sectionId;
 c.innerHTML=`<section class="gradesNativePage"><div class="gradesHeader"><h1>${esc(section||title)}</h1><p>${esc(title)}</p></div><div id="gradesContent" class="gradesContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></section>`;
 (async()=>{try{
   const x=await A.api({path:`sections/${sid}/grades`,params:{}});
   const rows=x.grade||x.grades||x.assignment||x.assignments||[];
   document.getElementById('gradesContent').innerHTML=renderGrades(rows);
 }catch(e){document.getElementById('gradesContent').innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}})();
}

function normalizeImageUrl(value){
  if(!value)return '';
  const s=String(value).trim();
  if(s.startsWith('//'))return 'https:'+s;
  if(s.startsWith('http://'))return s.replace(/^http:/,'https:');
  if(s.startsWith('/'))return 'https://app.schoology.com'+s;
  return s;
}
function normalizeSchoologyWebUrl(value){
  if(!value)return '';
  let s=String(value).trim();
  if(!s)return '';
  if(s.startsWith('//'))return 'https:'+s;
  if(/^https?:\/\//i.test(s))return s;
  if(s.startsWith('/'))return 'https://app.schoology.com'+s;
  return 'https://'+s;
}
async function resolveCourseSchoolName(course){
  const sid=course?.id??course?.section_id??course?.sectionId;
  let schoolId=null;
  try{
    // Match the official Android SectionProfileViewModel: SectionData.getSchoolId()
    // is the source of the school relationship; do not use a course-list fallback
    // when it could point at the district instead of the actual section school.
    if(sid){const sx=await A.api({path:`sections/${sid}`,params:{}});const section=sx?.section||sx;schoolId=section?.school_id??section?.schoolId??null;}
    else schoolId=course?.school_id??course?.schoolId??null;
    if(!schoolId)return '';
    const x=await A.api({path:`schools/${schoolId}`,params:{}});const school=x?.school||x;return String(school?.title||'');
  }catch{return ''}
}
function courseTitleOf(course){return course?.course_title||course?.courseTitle||course?.title||course?.section_title||'Course'}
function sectionTitleOf(course){return course?.section_title||course?.sectionTitle||''}
// Official Android SectionProfileViewModel formats the app-bar title as course title, colon, and section title.
function courseToolbarTitleOf(course){const title=courseTitleOf(course),section=sectionTitleOf(course);return section?`${title} : ${section}`:title}
function materialDescriptionText(value){return String(value||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<\/(?:p|div|li|h[1-6])\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim()}
function openProfileById(id,name='Profile'){
  const uid=Number(id); if(!uid)return;
  const returnGroup=state.currentGroup;
  state.profileReturn={tab:state.tab,homeTab:state.homeTab,group:returnGroup,groupTab:state.groupTab||'updates',course:state.selectedCourse,courseTab:state.courseTab||'materials',title:state.toolbarTitle||'Home'};
  state.profileUser={id:uid}; state.profileTab='updates'; state.tab='profile'; state.toolbarTitle='Profile';
  state.assignmentView=null; state.embeddedTitle=null; state.embeddedTheme=''; state.currentGroup=null; state.courseView=null; state.selectedCourse=null;
  render(); loadTab();
}
function syncToolbar(){
  const header=document.querySelector('.toolbar');if(!header)return;
  const needs=!!(state.assignmentView||state.embeddedTitle||state.resourceCollection||state.profileReturn) && !(state.courseView && !state.assignmentView && !state.embeddedTitle);
  const existing=header.querySelector('#toolbarBack');
  const menu=header.querySelector('#menuButton');
  if(needs&&!existing){const b=document.createElement('button');b.id='toolbarBack';b.className='iconButton';b.setAttribute('aria-label','Back');b.innerHTML=officialBackIcon();b.addEventListener('click',navigateBack);header.insertBefore(b,header.firstChild);if(menu)menu.remove();}
  if(!needs&&!existing&&menu===null){const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.innerHTML=`${menuImg}`;header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open');syncWindowChrome()});}
  if(!needs&&existing){existing.remove();const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.innerHTML=`${menuImg}`;header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open');syncWindowChrome()});}
  const title=header.querySelector('.toolbarTitle');if(title)title.textContent=state.toolbarTitle||'Home';header.classList.toggle('toolbarAccountInfo',state.embeddedTheme==='account');header.classList.toggle('toolbarLti',state.embeddedTheme==='lti');
  const slot=header.querySelector('#toolbarActionSlot');if(!slot)return;
  slot.innerHTML='';
  if(state.tab==='home'&&!state.courseView&&!state.assignmentView&&!state.embeddedTitle){slot.innerHTML=`<button id="homeCreatePlus" class="iconButton toolbarImageButton" aria-label="Create">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('homeCreatePlus')?.addEventListener('click',showHomeCreateMenu);return;}
  if(state.tab==='calendar'&&!state.courseView&&!state.embeddedTitle){if(state.calendarCanCreate){slot.innerHTML=`<button id="calendarCreatePlus" class="iconButton toolbarImageButton" aria-label="Create event">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('calendarCreatePlus')?.addEventListener('click',()=>showCreatePostDialog('event','',null));}return;}
  if(state.eventView){
    slot.innerHTML=`<button id="eventCommentPlus" class="iconButton toolbarImageButton" aria-label="Post comment">${officialIcon('ic_action_new.png','')}</button>`;
    document.getElementById('eventCommentPlus')?.addEventListener('click',()=>openNativeCommentComposer('event',state.eventView));return;
  }
  if(state.discussionView){
    if(state.discussionView.tab==='comments'){
      slot.innerHTML=`<button id="discussionCommentPlus" class="iconButton toolbarImageButton" aria-label="Post comment">${officialIcon('ic_action_new.png','')}</button>`;
      document.getElementById('discussionCommentPlus')?.addEventListener('click',()=>openNativeCommentComposer('discussion',state.discussionView));
    }
    return;
  }
  if(state.currentGroup&&!state.courseView&&!state.embeddedTitle&&!state.profileUser){
    if(state.groupTab==='discussions'&&state.groupCanCreateDiscussion){slot.innerHTML=`<button id="groupDiscussionCreatePlus" class="iconButton toolbarImageButton" aria-label="Create discussion">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('groupDiscussionCreatePlus')?.addEventListener('click',()=>{const gid=state.currentGroup?.id||state.currentGroup?.group_id;if(gid)showCreatePostDialog('discussion','groups',gid)});}
    else if(state.groupTab==='upcoming'&&state.groupCanCreateEvent){slot.innerHTML=`<button id="groupEventCreatePlus" class="iconButton toolbarImageButton" aria-label="Create event">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('groupEventCreatePlus')?.addEventListener('click',()=>{const gid=state.currentGroup?.id||state.currentGroup?.group_id;if(gid)showCreatePostDialog('event','groups',gid)});}
    return;
  }
  if(state.albumView){ return; }
  if(state.embeddedTitle && state.embeddedTheme!=='quiz' && state.embeddedTheme!=='school-profile'){
    slot.innerHTML=`<button id="embeddedReload" class="iconButton toolbarImageButton" aria-label="Reload"><img src="../assets/icons/ic_action_refresh.png" alt=""></button>${state.embeddedCanOpenExternal?'<button id="embeddedOpenBrowser" class="iconButton toolbarImageButton" aria-label="Open in browser" title="Open in browser">↗</button>':''}`;
    document.getElementById('embeddedReload')?.addEventListener('click',()=>{const w=document.getElementById('schoologyWebview');try{w?.reload()}catch{}});
    document.getElementById('embeddedOpenBrowser')?.addEventListener('click',()=>{const w=document.getElementById('schoologyWebview');const u=normalizeSchoologyWebUrl(w?.getURL?.()||'');if(u)A.openExternal(u).catch(e=>{console.warn('External browser failed:',e);showEmbeddedWeb(u,state.embeddedTitle||'Link',{allowBrowser:false})})});return;
  }
  if(state.embeddedTitle && state.embeddedCanOpenExternal){slot.innerHTML='<button id="embeddedOpenBrowser" class="iconButton toolbarImageButton" aria-label="Open in browser" title="Open in browser">↗</button>';document.getElementById('embeddedOpenBrowser')?.addEventListener('click',()=>{const w=document.getElementById('schoologyWebview');const u=normalizeSchoologyWebUrl(w?.getURL?.()||'');if(u)A.openExternal(u).catch(e=>{console.warn('External browser failed:',e);showEmbeddedWeb(u,state.embeddedTitle||'Link',{allowBrowser:false})})});return;}
  if(state.assignmentView&&state.assignmentLandscape&&!state.assignmentSubpage&&(state.assignmentTab==='info'||state.assignmentTab==='comments')){
    if(state.assignmentAllowComments||state.assignmentCanSubmit){
      slot.innerHTML=`<button id="assignmentPlus" class="iconButton toolbarImageButton" aria-label="Assignment actions">${officialIcon('ic_action_new.png','')}</button>`;
      document.getElementById('assignmentPlus')?.addEventListener('click',showAssignmentActionMenu);
    }
  }else if(state.assignmentView&&state.assignmentTab==='comments'&&!state.assignmentSubpage){
    slot.innerHTML=`<button id="assignmentPlus" class="iconButton toolbarImageButton" aria-label="Post comment">${officialIcon('ic_action_new.png','')}</button>`;
    document.getElementById('assignmentPlus')?.addEventListener('click',()=>openAssignmentCommentComposer(state.assignmentView.sectionId,state.assignmentView.assignmentId,'0'));
  }else if(state.assignmentView&&state.assignmentCanSubmit&&state.assignmentTab==='submit'&&!state.assignmentIsTeacher&&!state.assignmentSubpage){
    slot.innerHTML='<button id="assignmentPlus" class="iconButton toolbarImageButton" aria-label="Submit assignment"><img src="../assets/icons/ic_action_new.png" alt=""></button>';
    document.getElementById('assignmentPlus')?.addEventListener('click',()=>showSubmissionMenu());
  }else if(state.assignmentView&&state.assignmentIsTeacher&&state.assignmentSubpage==='teacherSubmission'){
    slot.innerHTML='<button id="assignmentSaveGrade" class="iconButton" aria-label="Save grade">✓</button>';
    document.getElementById('assignmentSaveGrade')?.addEventListener('click',()=>document.getElementById('saveTeacherGrade')?.click());
  }else if(state.courseView&&!state.assignmentView&&!state.embeddedTitle&&!state.currentGroup&&!state.profileUser&&state.courseTab==='updates'){
    if(state.courseCanPostUpdates&&state.selectedCourse){slot.innerHTML='<button id="courseUpdatePlus" class="iconButton toolbarImageButton" aria-label="Post update"><img src="../assets/icons/ic_action_new.png" alt=""></button>';document.getElementById('courseUpdatePlus')?.addEventListener('click',()=>state.selectedCourse&&openCourseUpdateComposer(state.selectedCourse));}
  }else if(state.courseView&&!state.assignmentView&&!state.embeddedTitle&&!state.currentGroup&&!state.profileUser&&state.courseTab==='materials'){
    if(state.courseCanAddResources&&state.selectedCourse){slot.innerHTML=`<button id="courseResourcePlus" class="iconButton toolbarImageButton" aria-label="Add resources" title="Add resources">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('courseResourcePlus')?.addEventListener('click',async()=>{const sid=Number(state.selectedCourse?.id||state.selectedCourse?.section_id||state.selectedCourse?.sectionId);if(!sid)return;try{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/course/${sid}/materials`,'Add Resources',{allowBrowser:false})}catch(e){showAppDialog('Unable to open resource creator',e.message||String(e))}})}
  }else if(state.tab==='messages'&&!state.courseView&&!state.embeddedTitle&&!state.message){
    slot.innerHTML='<button id="composeMessage" class="iconButton toolbarPlus" aria-label="Compose message">+</button>';
    document.getElementById('composeMessage')?.addEventListener('click',()=>showComposeMessage());document.getElementById('joinGroup')?.addEventListener('click',showJoinGroupDialog);
  }
}

function navigateBack(){
  const commentDialog=document.getElementById('assignmentCommentDialog');
  if(commentDialog){commentDialog.remove();state.assignmentSubpage=null;syncToolbar();return}
  document.getElementById('assignmentActionMenu')?.remove();
  if(state.composeMessage){state.composeMessage=false;state.toolbarTitle='Messages';state.tab='messages';state.message=null;state.messageThread=null;render();loadTab();return}
  if(state.assignmentView){
    if(state.assignmentSubpage==='submissionComposer'){
      document.getElementById('assignmentUploadSubmissionDialog')?.remove();
      document.getElementById('textSubmissionComposer')?.remove();
      state.assignmentSubpage=null;state.submissionMenu=false;syncToolbar();return;
    }
    if(state.assignmentSubpage){
      state.assignmentSubpage=null; state.toolbarTitle=state.assignmentTab==='comments'?'Comments':'Assignment'; syncToolbar();
      if(state.assignmentTab==='comments')openAssignmentComments(state.assignmentView.sectionId,state.assignmentView.assignmentId,state.assignmentData||{}); else openAssignmentSubmissions(state.assignmentView.sectionId,state.assignmentView.assignmentId,state.assignmentData||{},state.assignmentIsTeacher);
      return;
    }
    state.assignmentView=null;state.assignmentCanSubmit=false;state.assignmentIsTeacher=false;state.assignmentAllowComments=false;state.assignmentLandscape=false;state.assignmentSubpage=null;state.assignmentData=null;state.assignmentEnrollmentId=null;state.assignmentTab='info';state.submissionMenu=false;state.embeddedTitle=null;state.profileUser=null;
    syncToolbar();
    if(state.homeUpcomingReturn){state.homeUpcomingReturn=false;state.courseView=null;state.selectedCourse=null;state.tab='home';state.homeTab=state.preferredHomepage||'recent';state.toolbarTitle='Home';render();loadTab();return;}
    if(state.selectedCourse){showCourse(state.selectedCourse,state.courseTab||'materials');}
    else {state.toolbarTitle='Home';state.courseView=null;render();loadTab();}
    return;
  }
  if(state.profileUser&&state.profileReturn){
    const ret=state.profileReturn;state.profileUser=null;state.profileReturn=null;state.tab=ret.tab||'home';state.homeTab=ret.homeTab||state.homeTab;state.toolbarTitle=ret.title||'Home';
    if(ret.course){state.selectedCourse=ret.course;state.courseView='course';showCourse(ret.course,ret.courseTab||'materials');return;}
    if(ret.group){state.currentGroup=ret.group;state.groupTab=ret.groupTab||'updates';showGroup(ret.group,state.groupTab);return;}
    render();loadTab();return;
  }
  if(state.resourceCollection){
    state.resourceCollection=null;state.toolbarTitle='Resources';state.tab='resources';
    render();loadResourcesHome(document.getElementById('content'));return;
  }
  if(state.eventView||state.discussionView||state.albumView){
    const ret=state.embeddedReturn;
    state.eventView=null;state.discussionView=null;state.albumView=null;state.embeddedTitle=null;state.embeddedTheme='';state.embeddedReturn=null;
    if(ret?.group){state.currentGroup=ret.group;state.groupTab=ret.groupTab||'updates';state.tab='groups';state.toolbarTitle=ret.group.name||ret.title||'Group';showGroup(ret.group,state.groupTab);return;}
    state.tab=ret?.tab||'home';state.homeTab=ret?.homeTab||state.homeTab;state.toolbarTitle=ret?.title||'Home';render();loadTab();return;
  }
  if(state.embeddedTitle){
    const ret=state.embeddedReturn;
    state.embeddedTitle=null; state.embeddedTheme=''; state.embeddedReturn=null;
    if(ret){if(ret.group){state.currentGroup=ret.group;state.groupTab=ret.groupTab||'updates';state.tab='groups';state.toolbarTitle=ret.group.name||ret.title||'Group';showGroup(ret.group,state.groupTab);return;}if(ret.course){state.tab=ret.tab||'courses';state.homeTab=ret.homeTab||state.homeTab;state.currentGroup=null;state.profileUser=null;state.selectedCourse=ret.course;state.courseView='course';state.toolbarTitle=ret.title||courseToolbarTitleOf(ret.course);showCourse(ret.course,ret.courseTab||'materials');return;}state.tab=ret.tab;state.homeTab=ret.homeTab||state.homeTab;state.toolbarTitle=ret.title||'Settings';state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;render();loadTab();return;}
    syncToolbar();
    if(state.selectedCourse){showCourse(state.selectedCourse,state.courseTab||'materials');}
    else if(state.currentGroup){showGroup(state.currentGroup,state.groupTab||'updates');}
    else {state.toolbarTitle='Home';render();loadTab();}
    return;
  }
  if(state.folderStack.length){
    state.folderStack.pop();
    const prev=state.folderStack[state.folderStack.length-1];
    state.currentFolderId=prev?.id||0;
    syncToolbar();
    if(state.selectedCourse)loadFolder(state.selectedCourse,state.currentFolderId,false,prev?.title||'Materials');
    return;
  }
  if(state.currentGroup){
    state.currentGroup=null;state.groupTab='updates';state.toolbarTitle='Groups';syncToolbar();render();loadTab();return;
  }
  if(state.profileUser){
    state.profileUser=null;state.profileTab='updates';state.toolbarTitle='Profile';syncToolbar();render();loadTab();return;
  }
  if(state.courseView){
    state.courseView=null;state.selectedCourse=null;
    state.toolbarTitle=state.tab==='home'?'Home':'Home';state.tab='home';state.homeTab=state.preferredHomepage||'recent';
    render();loadTab();
  }
}
async function getCourseNavigationPermissions(sectionId,userId){
 if(!sectionId||!userId)throw new Error('Missing course/user ID');
 const request=[`/v1/sections/${sectionId}/grades`,`/v1/users/${userId}/grades`,`/v1/sections/${sectionId}/attendance`,`/v1/sections/${sectionId}/documents`,`/v1/sections/${sectionId}/updates`];
 const x=await A.api({path:'multioptions',method:'POST',params:{request}});
 const list=Array.isArray(x?.response)?x.response:(Array.isArray(x?.responses)?x.responses:[]);
 const by={};
 for(const r of list){if(r?.location){const body=r.body??'';by[String(r.location)]=(typeof body==='string'?body:JSON.stringify(body)).toLowerCase()}}
 const sectionGradeBody=by[`/v1/sections/${sectionId}/grades`]||'';
 const userGradeBody=by[`/v1/users/${userId}/grades`]||'';
 const attendanceBody=by[`/v1/sections/${sectionId}/attendance`]||'';
 const documentsBody=by[`/v1/sections/${sectionId}/documents`]||'';
 const updatesBody=by[`/v1/sections/${sectionId}/updates`]||'';
 const sectionDocumentsPost=/\bpost\b/i.test(documentsBody);
 const sectionUpdatesPost=/\bpost\b/i.test(updatesBody);
 if(state.courseView==='course'&&String(state.selectedCourse?.id||state.selectedCourse?.section_id||state.selectedCourse?.sectionId)===String(sectionId)){state.courseCanAddResources=sectionDocumentsPost;state.courseCanPostUpdates=sectionUpdatesPost;syncToolbar()}
 return {sectionGradesPut:sectionGradeBody.includes('put'),userGradesGet:userGradeBody.includes('get'),attendanceGet:attendanceBody.includes('get'),sectionDocumentsPost,sectionUpdatesPost};
}

async function showCourse(course,activeTab='materials',forceRebuild=false){
 const c=document.getElementById('content');if(!c)return;
 const renderToken=++courseRenderToken;
 if(!course){loadTab();return}
 const sid=course.id||course.section_id||course.sectionId;
 const sameCourse=!forceRebuild&&state.courseView==='course'&&state.selectedCourse&&String(state.selectedCourse.id||state.selectedCourse.section_id||state.selectedCourse.sectionId)===String(sid)&&!!c.querySelector('.courseLandscapePage');
 if(sameCourse){
   const tab=activeTab;const buttons=[...c.querySelectorAll('[data-course-tab]')];const target=buttons.find(b=>b.dataset.courseTab===tab);
   if(target){buttons.forEach(b=>b.classList.toggle('active',b===target));}
   state.courseTab=tab;state.toolbarTitle=courseToolbarTitleOf(course)||'Course';state.folderStack=[];state.currentFolderId=0;state.assignmentView=null;state.embeddedTitle=null;syncToolbar();
   const tabContent=document.getElementById('sectionProfileContent');if(tabContent)tabContent.innerHTML='<div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
   await loadCourseTab(course,tab).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});return;
 }
 // Mount the course screen synchronously. Network lookups run only after the course
 // identity, tabs, and loading indicators are visible, so slow connections don't leave
 // the previous screen under a changed app bar.
 state.courseCanAddResources=false;state.courseCanPostUpdates=false;state.selectedCourse=course;state.courseView='course';state.courseTab=activeTab;state.folderStack=[];state.currentFolderId=0;state.assignmentView=null;state.embeddedTitle=null;
 state.toolbarTitle=courseToolbarTitleOf(course)||'Course';syncToolbar();
 const title=courseTitleOf(course), section=sectionTitleOf(course);
 const image=normalizeImageUrl(course.profile_url||course.profileUrl||course.course_profile_url||course.courseProfileUrl||course.course_theme||course.courseTheme||course.image||course.course_image||'');
 const landscape=window.matchMedia('(min-width: 1000px)').matches;
 const baseTabs=[['materials','Materials'],['updates','Updates']];
 let effectiveTab=activeTab;if(landscape&&['upcoming','courseapp'].includes(effectiveTab))effectiveTab='materials';
 state.courseTab=effectiveTab;
 c.innerHTML=`<section class="sectionProfilePage courseLandscapePage">
   <aside class="courseAppsSidePane"><div class="homePaneHeader">Course Apps</div><div id="courseAppsSideContent" class="courseAppsSideContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></aside>
   <section class="courseMainPane"><div class="sectionProfileTabs">${baseTabs.map(([id,label])=>`<button class="sectionProfileTab ${effectiveTab===id?'active':''}" data-course-tab="${id}">${label}</button>`).join('')}</div>
    <div class="sectionProfileHeader courseIdentityCard"><div class="courseIdentityImageWrap"><img class="sectionProfileImage" data-course-image-url="${esc(image)}" style="display:none" alt=""><span class="sectionProfileFallback" style="display:${image?'none':'flex'}">${esc(title.charAt(0)||'C')}</span></div><div class="courseIdentityInfoBar"><div class="sectionProfileTitle">${esc(title)}</div><div class="sectionProfileSubtitle">${esc(section||'')}</div><div id="courseSchoolName" class="courseSchoolName"></div></div></div>
    <div class="sectionProfileRule"></div><div id="sectionProfileContent" class="sectionProfileContent tabSlidePage"><div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></section>
   <aside id="courseUpcomingPane" class="courseUpcomingPane"><div class="homePaneHeader">Upcoming</div><div id="courseUpcomingContent" class="courseUpcomingContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></aside></section>`;
 hydrateCourseImages(c);
 document.querySelectorAll('[data-course-tab]').forEach(b=>b.onclick=()=>{const id=b.dataset.courseTab;state.courseTab=id;state.toolbarTitle=courseToolbarTitleOf(course)||'Course';document.querySelectorAll('[data-course-tab]').forEach(x=>x.classList.toggle('active',x===b));state.folderStack=[];state.currentFolderId=0;syncToolbar();const tabContent=document.getElementById('sectionProfileContent');if(tabContent)tabContent.innerHTML='<div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';loadCourseTab(course,id).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});});
 // First show the page, then resolve school metadata and permissions in parallel.
 const [sectionResponse,schoolFromList,navPerms]=await Promise.all([
   A.api({path:`sections/${sid}`,params:{}}).catch(()=>course),
   resolveCourseSchoolName(course),
   getCourseNavigationPermissions(sid,state.auth?.userId||state.auth?.user?.id).catch(()=>null)
 ]);
 if(renderToken!==courseRenderToken||state.screen!=='app'||state.courseView!=='course'||state.selectedCourse!==course)return;
 const sectionDetail=sectionResponse?.section||sectionResponse||course;
 let school=await resolveCourseSchoolName(sectionDetail)||schoolFromList;
 const schoolId=sectionDetail?.school_id??sectionDetail?.schoolId??'';
 const schoolEl=document.getElementById('courseSchoolName');if(schoolEl&&school){const safeSchoolId=Number(schoolId||0);schoolEl.innerHTML=safeSchoolId?`<button class="courseSchoolLink" data-course-school-id="${safeSchoolId}" type="button">${esc(school)}</button>`:`<span class="courseSchoolLink">${esc(school)}</span>`;const btn=schoolEl.querySelector('button');if(btn)btn.onclick=()=>{const id=Number(btn.dataset.courseSchoolId||0);if(id)openSchoolProfile(id,btn.textContent||'School')}}
 const canGradebook=!!navPerms?.sectionGradesPut,canGrades=!!navPerms?.userGradesGet,attendanceEnabled=!!navPerms?.attendanceGet;
 const tabs=[['materials','Materials'],['updates','Updates'],...(landscape?[]:[['upcoming','Upcoming']]),...(canGradebook?[['gradebook','Gradebook']]:canGrades?[['grades','Grades']]:[]),...(attendanceEnabled?[['attendance','Attendance']]:[]),...(landscape?[]:[['courseapp','Course App']])];
 if(effectiveTab==='grades'&&canGradebook)effectiveTab='gradebook';if(effectiveTab==='gradebook'&&!canGradebook)effectiveTab=canGrades?'grades':'materials';if(effectiveTab==='attendance'&&!attendanceEnabled)effectiveTab='materials';
 const tabBar=document.querySelector('.sectionProfileTabs');if(tabBar)tabBar.innerHTML=tabs.map(([id,label])=>`<button class="sectionProfileTab ${effectiveTab===id?'active':''}" data-course-tab="${id}">${label}</button>`).join('');
 document.querySelectorAll('[data-course-tab]').forEach(b=>b.onclick=()=>{const id=b.dataset.courseTab;state.courseTab=id;state.toolbarTitle=b.textContent||'Course';document.querySelectorAll('[data-course-tab]').forEach(x=>x.classList.toggle('active',x===b));state.folderStack=[];state.currentFolderId=0;syncToolbar();const tabContent=document.getElementById('sectionProfileContent');if(tabContent)tabContent.innerHTML='<div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';loadCourseTab(course,id).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});});
 state.courseTab=effectiveTab;state.toolbarTitle=courseToolbarTitleOf(course)||'Course';syncToolbar();
 const contentEl=document.getElementById('sectionProfileContent');if(contentEl)contentEl.innerHTML='<div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
 loadCourseTab(course,effectiveTab).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});
 loadCourseUpcomingPane(course).catch(e=>{const el=document.getElementById('courseUpcomingContent');if(el)el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`});
 loadCourseApps(course,document.getElementById('courseAppsSideContent')).catch(e=>{const el=document.getElementById('courseAppsSideContent');if(el)el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`});installCourseLayoutWatcher();
}
async function schoologyAssignmentSupportsAnnotations(sectionId,assignmentId){
  if(!sectionId||!assignmentId||!A.annotationRequest)return false;
  try{
    const isCa=await A.getServerInstance?.().catch(()=>false);
    const host=isCa?'api.schoologyca.com':'api.schoology.com';
    const result=await A.annotationRequest({url:'https://'+host+'/v2/sections/'+encodeURIComponent(sectionId)+'/assignments/'+encodeURIComponent(assignmentId)});
    const actions=result?.['@actions']||result?.actions||[];
    const hasAction=type=>Array.isArray(actions)&&actions.some(action=>{
      const types=Array.isArray(action?.['@type'])?action['@type']:[action?.['@type']||action?.type];
      return types.includes(type)&&!!(action?.['@href']||action?.href);
    });
    return hasAction('assignment:startAssignment')||hasAction('assignment:restoreAssignment');
  }catch(error){console.debug('Could not verify Schoology annotation availability:',error);return false;}
}

function collectAssignmentAttachments(a){
  const out=[],seen=new Set();
  const add=(kind,v)=>{if(!v||typeof v!=='object')return;const id=String(v.id||v.file_id||v.fileId||v.link_id||v.linkId||v.url||v.href||v.title||'');const key=kind+':'+id;if(seen.has(key))return;seen.add(key);out.push({kind,...v});};
  const walk=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v!=='object')return;
    const files=v.files?.file||v.files?.list||v.files||v.file; if(files){for(const f of (Array.isArray(files)?files:(files.file||files.list||[files])))add('file',f)}
    const links=v.links?.link||v.links||v.link; if(links){for(const l of (Array.isArray(links)?links:(links.link||links.list||[links])))add('link',l)}
    const videos=v.videos?.video||v.videos||v.video; if(videos){for(const x of (Array.isArray(videos)?videos:(videos.video||videos.list||[videos])))add('video',x)}
    const embeds=v.embeds?.embed||v.embeds||v.embed; if(embeds){for(const x of (Array.isArray(embeds)?embeds:(embeds.embed||embeds.list||[embeds])))add('embed',x)}
    const tools=v.external_tools?.external_tool||v.external_tools||v.external_tool||v.externalTool||v.tools;if(tools){for(const x of (Array.isArray(tools)?tools:(tools.external_tool||tools.list||[tools])))add('external_tool',x)}
    const t=String(v.type||v.attachmentType||v.attachment_type||'').toLowerCase();if(t==='file'||v.download_path||v.downloadPath||v.resolveDownloadUrl)add('file',v);if(t==='link'||v.linkURL||v.linkUrl)add('link',v);if(['external_tool','externaltool','lti'].includes(t)||v.launch_url||v.launchUrl)add('external_tool',v);
    for(const k of ['attachment','attachments','files','links','videos','embeds','external_tools','external_tool','tools','file','link','video','embed'])if(v[k]&&v[k]!==a)walk(v[k]);
  };walk(a);return out;
}
function assignmentAttachmentIcon(item){
  if(item.kind==='video')return 'ic_attach_audio.png';
  if(item.kind==='link'||item.kind==='external_tool')return 'attachment_link_icon.png';
  if(item.kind==='embed')return 'attachment_link_icon.png';
  const name=String(item.filename||item.fileName||item.title||item.fileTitle||'').replaceAll('#','').toLowerCase();
  const mime=String(item.filemime||item.fileMIME||item.mime||item.convertedFileMime||item.converted_filemime||'').toLowerCase().split(';')[0].trim();
  const extension=name.includes('.')?name.split('.').pop():'';
  const guess=mime||({pdf:'application/pdf',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',csv:'text/csv',zip:'application/zip',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',mp4:'video/mp4',mov:'video/quicktime',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'}[extension]||'');
  if(guess.startsWith('video')||guess.startsWith('audio'))return 'ic_attach_audio.png';
  if(guess.startsWith('text'))return 'ic_attach_text.png';
  if(guess.startsWith('image'))return 'ic_attach_image.png';
  if(guess.startsWith('application')){
    if(guess.includes('pdf'))return 'ic_attach_app_pdf.png';
    if(guess.includes('presentation')||guess.includes('powerpoint'))return 'ic_attach_app_ppt.png';
    if(guess.includes('sheet')||guess.includes('excel'))return 'ic_attach_app_excel.png';
    if(guess.includes('document')||guess.includes('msword'))return 'ic_attach_app_word.png';
    if(guess.includes('zip'))return 'ic_attach_app_zip.png';
  }
  return 'attachment_document_icon.png';
}

const assignmentAttachmentIconData={"attachment_document_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABGCAMAAABG8BK2AAAA4VBMVEUAAAAA\nAACusLAAAAClqKgAAACtr6+kp6cAAAAAAAAAAAClp6cAAACnqamqrKwAAAAA\nAAD4+Pr39/j39/n29vbx8fLv8PHu7+7t7u7+/v7s7O39/f3r6+z8/Pzq6uv5\n+/vn6er5+vrn6Ong4eLz8vTKy8vl5+bn6Oju7++rra2jpaXm5+fk5uX7+/vp\n6uvk5eb19fbj5OXm5ubt7u/09fXi4+Ty8vOkp6fz9PTh4uP4+PmipaXf4OGt\nr6/e3+Do6eqrrq7p6emrrq3s7u3////n5+esrq78/Pvl5ualp6etsLBAJgwa\nAAAAEXRSTlMCBvcRwQHHwQQIBcEHxcMXAEuwd0QAAAGLSURBVFjD7djbTsJA\nEIDhFihQTopVUWlBy0ELiBUsteK2C51y6Ps/kDRcqIGNQ8JujPF/gO9ikklm\nVzo9StKfZhQlm43jxYIyms8pJaRSKRREMIUCIfBjs1mxmM/zZ0qlxQLA998Z\n+T5ArwcQRbncLnRsRlUpBWi1PM/Zk+e1WgCuOx4DjEa7EB/G854ZeR7Aem3b\nw+E+iA/jOE+MHCdhlsvJJIGiKJP5CvFhVqs+o8EgGTHAcmnbyaBns3JZUfgx\nlgXQ798z6nYBOh3XXW9y3ekUgJDPNeXDmGbAyDTb7e9rSmmpxJcJgiGzILjd\ntCVNE8CyVJUv02joiBqbRDC6foNK10UwYXiFKgxFMLXaA6paTQRziU4Ec4FO\nBDNBJ4L5nw2beUUngnlBJ4I5RyeC0bQzVJomgqlW31BVqyKYZvMOVbMpgjGM\nR1SGIYKp1w1U9TpvJjmvAa5RbU9Inkwcw0HFMU8mlSKEUgtV8rRPpfgxspxO\nnxxUOi3LvBhJkmX1oGRZkngxv+I36QMtlmnPFJsUygAAAABJRU5ErkJggg==\n","attachment_link_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABGCAMAAABG8BK2AAAA5FBMVEUAAABl\nZ2oAAABnaWuOj5J2d3pAQEJeX2EAAABdXmAAAABHR0kAAABnaGsAAAAAAAAA\nAAAAAAA2NzhOTlAAAAAxMTIAAABeYGKDhIcAAAB7fH4AAABZWlxEREYAAAAA\nAABaW10AAAAyMjQAAABYWVtZWVsAAABZWlx6fH4+P0AAAAAxMjMAAACCg4YA\nAAAAAACMjY8AAABlZmmDhYhDREZnaGsAAABXWFoAAABwcnUAAABnaGuFh4oA\nAAAAAAAAAABDREYAAACJioyFhomHh4qAgYSIiYuGh4qJiYyHiIvd3d2IiYzY\nw3ROAAAAQnRSTlM/xDBt/b5MjhxoOX46YEYFIUJfdAdmHzA5M3wJhYURGZMG\nVyeCgzeEPXkNaS6tDBj+D2Fhhl4BVxaxAmFhBEMUhQDeovekAAAB2UlEQVRY\nw+3YYVOCMBjAcUIrTRQtxIzEiMqailFKhE40XZR9/+/TrcltUVndyVMv3At1\nvvjd7WD7K9J0LUPaMP+L8bzDw5cX8ja6XYz/kgmC0YiQxXJQyrL+igmC21uG\nUIC9398vFwbMiMjJSbV6fc0+IwTPiEir1enY9ukpnRMShtAMv9CEHB/btus6\nztERY3wflvG8y8sYOT+3bYQwvrlh30QRNKNpj48MOThgyHAYs/v7pgnLmCbf\nAs/PhjEYxPNGo1zWNFjG99mlZa93dzEymdi243gePBMj/IigCEJB8ONja23M\nbMaX9SkCxqjq01MS6fcTCBCjqg8PDKELoyOK2u0PSIqMGNgoYsh8XipVKuNx\npXJxUS47TgJJjREDG99087mi6Lr/NkxT05YbIHWGh4Qjs5miNJuq+oufSWth\n3seeb0Zd/wZJgRGRQkE8qpYRAWTEwJ6d7e3RGy+eQzNiYGnsc7l6/eoqEVgw\nhge21aLHgGHk8x8CC8awwBKyu5uMvRBYMCYO7M6O62JcLH4aWGBmschma7VM\n5ovAgjFhuL2d/FvxC2TNDEKyzPP6RWDBGIx7PUXZ2loZWDBmOrWsXk+WJWlF\nYAEZujCEwnBFYEGZzfOb5HgFKiKl5R3xHJEAAAAASUVORK5CYII=\n","ic_attach_audio.png":"data:image/png;base64,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\nRU5ErkJggg==\n","ic_attach_text.png":"data:image/png;base64,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\n9NEAAAAASUVORK5CYII=\n","ic_attach_image.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAJ80lEQVR42u2b\n74+cVRXHP+fcZ+aZ3Rn6Y/tzFyvQpRRoRSigMRqEqgkxihoxKolG/wBioqJv\nSEx8YUx8YYwxvjK+kChEY4ICahUQWgo0RAqlLKW7lJJll7b7a9rd2Z3nee69\nvpjZ3dmZabvbndmZNns2JzOZ59d9vvec7/lx78KqrMqqrMqqtK3IYk/8wyOP\nHAU2e++d9761gxZBRLDWpnbdfPN/Pnrrbd9Np4KpZjwrWMK5W4GuIAgQkZaC\nY63FOYeI8PqRI19LrA0n8vkH1q1dO9UygJxzcTqdZu8995DNZmmVFYkIJ959\nl0OHDpHNZhER3jx69L44jv84NDz8QE9391SrLAiAXC5HZ2dnS10sE4bEccyW\nLVvo6e7m4Isvcvz48fviOP7TG2+88c3du3dPtQwg5xwAURRRLBZhJd3Ne3K5\n3Kwp4azlhhtuQER44eBBTp48+cVCofDo0PDwt3q6uydaAtCsFKOI8fwERs2K\n4eO8X2C9s26+Y8cOVJQXXjzIqVOnvnDs2LF9k1NT38hls++0DCAVwYhBRVcw\n5J6f93qv70VUOHDwIP39/Xc65x4fGxv/clfX+oGWANSOsn37dtQY9h84wMDA\nwG5n3eNDQ0P39fT0vNMCgAQRbWnIryfXXnMNRpXn9+/nxMkTuxKb/G1gYOBL\nvb29l2RJyhUo27Zt45677ybb0cng4OCuvrfe+vvh117rXVmABFApRbGV1EUm\n/z09Pdyzdy/ZbJbh4eGbTpw48cTLL7/cu2pBFdK9dSuf2buXXC7HyMjIjYOD\ng0/m8/lPrAhAUo5kssI6Z0DeL4r/Nm/ezL333suGDRuYyOd3/ve55x5tSRQL\nVGg2XXs/P6PGGMbGx9l/4MBFr0sFAWEYEgQB4+Pj2RWMYiX1wGjR4ZoNkHNk\nXekzSRLy+Tyjo6OLutYYQyaTAUhW1IJUoGg9v+7LM1q0qABNqmNnrOPhzBpu\n6tnK3Z/6JGpMzVhAiJ2fH0LZFYtRRF9fH0mSsDIACRXcUAJpJvF0pAyi0hSQ\nVIWhySJbsmtYs31XzfHIWgS4Lhtgqvw9iiLefvtt4jheGYCkwsVmZ8+ocNvW\nTXSkUrgmtUOOn/UcPztVEzAc8Mr7p3A+4ae3bWRDaIidY93ataTTKZIkuaQW\nTWNIumK2UiqkjeD8xU6+NAC9l7p39GULw1VFvVYVqxfoaNVJ5jyWEEsKxSJ4\nPIpDCYhQokUngPXeWSo+Gx1Jl8lBFQluRXJtKtMVhJgsG/xxet1TbPJvYohJ\nCDklt9Kvnycv20hTuGSrmnUxqQBxiYl3EzhoQQI37zQqgpZ/KFlJyB77O/bY\n35D2Y+VHll7pWv7BLe73HAoe4i39KimmLwkkqfoiAqKC+OXnZg13MZkdIJBI\nhj3Rb7kj/hmQxXFVzfkdjPFp+0Mk7ekL7i9b0tJ4SwSkSamFLg+IWjIUSi7m\nJKTbHmbPzK/AZXEuAOdr1Lk02ICPz/ycLv8uSBoVKlRQfFmpOrZQpQKxRpF0\nw4tV1RJwqGFn9Bhqz+GcAefOq86nCZNhdsSP4zRY+OKmA6b2QeEFNOi4IEDN\nkGW5WDUHlRAXBCX0RTbER8EHiLMXv5kTNsaHCTocgpYjnSDeEk38Fcw6Mms+\nV/qtnjUvIOnyuFRbC1Bd0LREkIErEthpsIskCC+kbIFAbClCelANSQqHiQvH\nEA2h2I/JXIf3UW3o9/MMJe3AQeVceu7Pz4Z5IBAPksL6NDhbl3tq1WIJETGY\nMo8ZFaKJJ7EuJoknifL/xGj5eJVqnZFpAzKjxnNQmVSdZpgIbgRbxDuPd+4C\n6sHGjAcfwYtiBFTTuOIQMxP7cb4DS8j0+NP4ZAKV1Fw6Mac0p91y6VFMqnKh\nchCWOdL0nMh9HecziE3ACVhq1QmaRMRs5GTuKwTiECm1J6Yn/k0UncFh8KSI\nZt6jePZ5TBDUdmN1YUJUjx/bxIJKmiZitPNjHFv3IBLnkSQqpbsL3Ao0KYIt\ncGT9jzkXXk+KGKMGbwtMjf4LSOO94L3gMEyOPAU+RlXPH+bbhoPq5UEVMxf4\nmKMbfsDRTQ/jnKDxOJoU0GSm9BmPEZHh1S2/YKDrO6R8VLJAk2L67EtMT/Xj\nCLEOrANPSOHs6xQnj2A0XduOneVCbdNiVSrqsVJnwaFA38bvcyr7Wbbl/0LX\n9OsE9hxxsJ7Rjtt5b9395DM7SNto1klR78mffgLnfJVZKM4WOHvmSXLr9jDb\nwmxmqzdoDAfNl9kqgmrlIrHHEHG28xaOZG/BeIv6Ik4yWFHUQ+ijsi0LqmkK\nk31MTrwCkqlpm3jJkB/dz6ZtQ6Qz3XgXz4X52sWElrrY+W9YT1M+InQRgfeI\nhATeErqIlI8WnBcojJ96ijiexKE12YAnIJoZJX96HymVuesMbcdBFRGkDkmf\nXx0Gi4qvORaYgHhmhLHTz+LJzHFPtXpJMXLqn9hkCmOC2lKjqg3TVhYk1fnJ\nIlVEMEYZG3mWwvQwXlJzVmNFsCLzViQhk+cGyI+9RGB07vr2rcX0/HXR4tMD\ng42nGHzvz8RJhPMFvAqpCcu6/03jFSZu7yC5yiDOY5MC7598jI2b7kJLqelc\nQ2S+X86ygWtMw6wueS/tfsYo04UhMh1X09l5TQnilCLxGYL3n4bA0LXmLvyW\ntRB7wCGixNEYmY4tOOsvWES3LMxXj8FoSZfejU/I5a5jzx2/nG/ChzCZfZV+\nsw8NUuzc9RCd1/biovlGvXMJgsVoc3YDLtuCqG53iEHF4Jc82FnnKH2dc1Pv\nkDL5iHel3xeE9KDi+TJX77SFBdXz78ROkdgZbAPWoTVREjeDC0M0FZK4AlEy\nia+6uUiZvL1reLBfnovNxngBEcX7IoP9DzEmZ3A+1ZAVJJ/EZL79YRBhaOQn\nMBHUtKYFh0OJo++h5kML849WkXR9NvK44gc4hnCkGnRbRXKlYTr7ASS+zpMd\nngB83D4cNM9DLEj1E5cmIWwcQJTbIgCkzzM1Do/Bl92rMpK2wbLPwu0c1pcm\nudlbYeqOoAn75YLlEERlJJudKmsF6wWHrCBAUrKeuSxVa4rotmnaW9c6C/K0\n0dq8VLXtZzMZ60sgtQogXdC4p/2Wnq31JM7N1UYrA5CbI+g2i2K1OygSr6gL\nSmF3RQFSfEWG3ah2R8PeIrKWmUQ5Hj6IkDS5EVq/TJlxXWSTqKG7/xpQzZd2\ndu1cn2FTR4Ax1zfN3C8Kk4voDIS0Ka0BtYUFOQ+hCj+682raRZzz2AbtkWxY\nsdrif4SuzdHaolitYoErUYJGWE87y3LHeUX/t09bcdCVKku2INXL0+guddxL\ntqBCoYCq4v3lQ8siQmF6urkAqWoqSRKefuaZy9K1vPfEcYyqppplQR8Arlgs\nusuWT0p+dno19KzKqqzK5SL/B8fnNb835bOdAAAAAElFTkSuQmCC\n","ic_attach_app_pdf.png":"data:image/png;base64,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\n/QAAAABJRU5ErkJggg==\n","ic_attach_app_ppt.png":"data:image/png;base64,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\n","ic_attach_app_excel.png":"data:image/png;base64,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\n","ic_attach_app_word.png":"data:image/png;base64,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\n","ic_attach_app_zip.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAALO0lEQVR42u2b\n71Nc1RnHP+ece++yCwuBAAsJQSAFsRPyQ6cTk4khrb6rY+276tixOlPbsVHf\n9j/Q+LpOa99VnVp91/GNzjROUqfRmEgwCQkJSYDFEBN+s7Cwd+89py9298Jq\nbGDXsGDzMHeGhXvvOffZ7/P9Ps9zzoV7ds/u2T0rnYmVnvj2O+9cAarX0+SN\nMdi27e/YseOVrh073r0bY1irOLceiPq+jzGm5M6RUiKlxHVdzp8//9aJEyf8\n/fv3v18yBxlj0kop9j38MOFwuOQOunz5MsPxOFJKFhYWrCtXr749MDCwqb29\n/a+lQhBCCLZu3UpZWVnJHXTjxg1c16W9vR3P8xgaGnJOnT79Zjwer2lubn6t\nJA4C8Dwv+F1rXfDAnucxOTUNxgRMaLQhHA5TWRm9Y3hprdHGUF5ezp7duznq\n+4yMjPDvTz559eq1a2Z7W9uRkjgoCDlgYnISz/MQQqyaP2ZmZjnx6Um01sH1\n6bTPffc1sWd3F76vv+NaQX1dffDZ9zwsy+Knhw5x/PhxhuNxTnz66WsX+/vN\nA52drxfNdcWqiNa64MMYk3cASCEQSMSynxxaM8ftBcJxHA4dOkRrSwuLCwuc\nPn36SO+XX/6xZAgSmG89xIqvNQLHttm6pRFtsvcR4LpptDaMjY2jjQ6galmK\nysrK7LjfPZZt23R3dyOl5NrgIOfOnXv15MmTZu/evUfW3EHFmDaacDjMrp1d\neWE3n0xy7lwf/ZcGkHIJOeXl5XTt+PHKHsiyOHjwIFJKrly9yuWBgdeOHv3Y\nPProz15f0xAzRiBEcUculwkOITG5n+WhZ0zedXcypRQHDhygo72dVCrFyFcj\nRy5cuPBnY4xYWwQJQIjMscp0wU2luDU2lmF7AUJIFhcXUUpRW7uZXC5qjKYs\nFFoaY4Vj5ZwkpaT/0iU+P3Xq98aYEPD82jhIFKEMUpJcWKT37HlMFh0Y8H2P\nttYWOjs68Hz/W2Kw6ikKwf79+5FScuHiRT4/deq53i+/NK0tLb+tqqrSd5mk\nyZKrWLXMZ64Bk1WyHCq01iAEQgqEFnljmew53xzrTmMLIdi3bx+WbdPX10dv\nb+/zrut6wO/WLUkbYwiFQmxva81FGAiBm3JJuS6Dg8PobIwZY3Ach1h93W0f\nPuW6zMzM3NFJ93d0MDU1xejoKP39/c+sjYNEYQjSOqtiu7py+EBKxdzcHF/0\n9HL12iBCyOy5PtFolFisPqC8nOMspRiOxxkZGVlxaFuWBbC4rmU+p2BLRLZE\nwBnlAiFMHuKEyec9pRS2bWMpteLuQiFdiJI4SCnFzZu3iI+MoKQKfJRKuZSX\nlxOL1aOzJJ0LsSyPB17aubOLzs7OlalaNl1IJpMc/fjjvHryrjpIFBhiUkoS\niQTXBoewraUppNNpdu/eRVtrC+l0Ou+b930/E4wG5pNJpJQoawXTN5nk0bJU\nFrVriKBCHRQkid+4VgiZdYLJD4dcKpC1+eRCDk4rAI8mHC6jMhotKFUoSYj5\nvk9jYwPdBx8JHlxKwXwyyY3Rrzn9xRlyHtDaEImU0b79RwiZ4SgpxIrzMGPk\nqr/AdSHzkUiEaLQiyJillMzNJRgcijM3P4/IhoP2NZWVFdlsGwrp9haR0xYb\nYgVVGgE5LId8puQyiKyzgm9dikDyV1FplKbl+n1xkGVZxOMjXLo8gFJqWX3m\nEmuI0dbakqc0Ssmgui8oXDZaiAkhSCYXuHHjayzLDhDleR5bm7ZQU1P9LRUr\npr274RAkhEAqiWXZ2LaVRxYySBbNqmquO423oRDkeR7bmrZSu3lzMHkhBcn5\nJIODQ3x28vNlZYmhvDxCZ2dHpl+0xmtyxSEoYOrVq1hZWRmRSCSQcykltmWT\nXFhkNjEXOE5rHfCREAKDKWyepUKQEGL1ExC3+yDyuFR8o0GWG0UgNg6CKKhl\nD8pSxOMjXLx4CWUtqdhiKkWsro7tbW14vheUCspSQVOtMAeVkIMKGVoKyfz8\nPF9dv45t28Hf3XSa5qYmGmP1pG5Ti21YFStoYMsiHC5bJvOZKt8YQ8p1cZc5\naKk98n+iYr7vc19zMw2xWNB0s5RFYn6Oc+f6OPbJfzKxZcA3msqKKHt270TK\njaZiRSDIcRxCoRBCCLTWJJNJtO8zPz+H7+tc5w9Pa1S29Ch0rGLKk5IgiGUt\nDaUUx/99nEuX+nEcJyPraY/yigoaGpvwfZ9QKFSqaZYOQUH95brE48P4vk9Z\nWQRLWUxOjZP2XPb+5CHKwmEwJuCgwsYrfI6SEpplWdwau0XaTVO9qRrHCWE7\nDpXRSvy0z/j4OOWRSJ7SrbXJ4hBU3CGl4KuvRnAch7q6WLbfY6ipqSUcjnB9\n9Ho20zZFj7UhEeT7PpMTk4RCZUilstm0QCpFOBxmanKSdDpdVBiXGEGFb1xQ\nKrMONjY+RihUhm3bGKPxvDSWZROOlDM+Mc709DRKqaI3SmxIFYtEIsRiMdKu\nj2XZbN5ci9GZVVfXdamvqyNaYLN9ndRixWWpjuNQVVnF1PQMxoDjhIJ7KiWR\nIhRIf+E5kCitg4qxXIJo2w6p1AKTE+MA2I5DVVU142OTzM7OUlVVtXFrsWJz\noGQySSgUYWJqjN27dxGLxThz5gxTUxMYAzMzM1RXVxcVZsXMs2QqJmWmok+l\nUiwsLrBtWxO7du2ivr6eAwcOIGRGn+fn54sqVEvLQcV8M0qRSCQwCCzLCjZM\nCSnxfB+jNbZlMzM7m+khFsMlG1HFcg0ygGi0ktHr1/nss89oaGzkTE8PUtlY\nlsX01FRJ3w0pGQdpramrrcX30szOzlBZVU3fhX7One8jHA5TEa1i7OYNdu7a\nmb+QuKaVWAk5yPd9auvq6O7uxmiPucQMIccmXBbCGE1iZpLOzvvp6uoqmYKV\nFEE5J7Vt307Ttm2kUqml+xmDVIpIJILv+0XlQRuKgyzLuu2DhhwHy7KQQiIE\naGPQvs407JUKlqdz4aKNWdUmqNIhaIXRLaQglUrx1t/eYjYxG8j28hrrqV89\nRd+FPk6cOMHjP3+czvs7efudt5nKkrTWGikV9fV1PPboY9TV1a3YSYJ1jiBB\nZskmMZdgZmYm2Ew5PT3N7OwstmVhjOHmzZucPXuWRw5k9g0NDAxw69Ytmpub\ncRyHRCJBX995hoaGeOnwYSKR8rtepxW9/WVlhakmFHL4w4sv5t4zZWJigj+9\n8QbT09Mc7O5m8+aaTLiFQkglERJsyyIcDvP8c8/R2NiI53n85c036enpYeDK\nFR7cswdj9N2koLVVMaUUoVAI3/f5+7vvMjIywp49e/jlk08G5PxdRW2Owyoq\nKjDG5O3++MGoWO78995/n97eXjo6Ovj1M88stVSDZealXpPWmg8//JCKigpm\nEwl6enqora2ltaVl6TWG9dzuWI1zpJR89NFHHDt2jIZYjN88+yzRaBTf9/OU\nanlsGGP4oqcnuEdDQwO/eOIJ6uvr1yQ/WrN+kJSSU6dO8c8PPmBTdTUvvPAC\njY2NQejlZbzZexqtUUrx0uHDxGKxYIe+UmpVudG67yhKKRkeHuYf770HxrCt\nqYnR0VGG43EwBl9rHnrwwczS822uj0Qi2a0yS2XKDy6THhoaYnJykkgkQn9/\nP2fPng3+l0ql2LplC0JKUqkUJuuAtOfhum7gkFzRWij3rWsHdXV18crLL2dX\nL75duDY1NbFp0yaamppoa20F4OmnnybtulRXV38vpc26Jumamhpqamr+5zkV\nFRU0NDQEnx/o7KTUJgvhk41qa/KuxuLi4speIlmHtri4ePccJISwfd/nX0eP\nIjYogky2xSKEsO8Ggm4B6UK+hXUYZlPcs3t2z9aD/Rc0C+984vgO4gAAAABJ\nRU5ErkJggg==\n"};
function assignmentAttachmentIconUrl(item){return assignmentAttachmentIconData[assignmentAttachmentIcon(item)]||'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Cpath d=%22M8 3h11l6 6v20H8z%22 fill=%22%23e8eef4%22 stroke=%22%235e7184%22 stroke-width=%221.5%22/%3E%3Cpath d=%22M19 3v7h6M12 16h9M12 20h9M12 24h6%22 fill=%22none%22 stroke=%22%235e7184%22 stroke-width=%221.5%22/%3E%3C/svg%3E'};

async function openAssignmentAttachmentItem(item,button,dialog){
  try{
    if(item.kind==='file'){
      const url=item.resolveDownloadUrl||item.resolve_download_url||item.converted_download_path||item.convertedDownloadPath||item.download_path||item.downloadPath||item.url;
      if(!url)throw new Error('Schoology did not provide a file URL.');
      const info={url,filename:item.filename||item.fileName||item.title||item.fileTitle||'Schoology file',mime:item.filemime||item.fileMIME||item.convertedFileMime||item.converted_filemime||'application/octet-stream'};
      const download=async()=>{const result=await downloadWithFeedback(button,info);const error=await A.openDownloadedFile({path:result.path});if(error)throw new Error(error)};
      if(isPdfAttachment(info)){dialog?.classList.remove('open');showPdfAttachmentOptions(info,download);return;}
      await download();
      dialog?.classList.remove('open');
    }else if(item.kind==='link'||item.kind==='video'){
      const url=item.url||item.linkURL||item.linkUrl||item.link_url||item.href||item.videoURL||item.videoUrl||item.video_url;
      if(!url)throw new Error('Schoology did not provide a link URL.');
      dialog?.classList.remove('open');
      if(await routeSchoologyLink(url))return;
      await A.prepareWebSession();showEmbeddedWeb(url,item.linkTitle||item.title||item.videoTitle||item.video_title||'Link');
    }else if(item.kind==='embed'){
      const code=item.embed_code||item.embedCode||'';
      if(!code)throw new Error('Schoology did not provide embedded content.');
      dialog?.classList.remove('open');
      showEmbeddedWeb('data:text/html;charset=utf-8,'+encodeURIComponent(code),item.title||'Embedded content',{allowBrowser:false});
    }else if(item.kind==='external_tool'){
      const url=item.launch_url||item.launchUrl||item.url||item.tool_url||item.toolUrl||item.web_url||item.webUrl;
      if(!url)throw new Error('Schoology did not provide a launch URL for this tool.');
      dialog?.classList.remove('open');
      await A.prepareWebSession();showEmbeddedWeb(url,item.tool_name||item.toolName||item.title||'External Tool',{allowBrowser:false,lti:true});
    }
  }catch(error){dialog?.classList.remove('open');showAppDialog('Unable to open attachment',error.message||String(error))}
}
function showAssignmentAttachmentDialog(attachments){
  const items=(Array.isArray(attachments)?attachments:collectAssignmentAttachments(attachments)).slice(0,50);
  if(!items.length)return;
  let dialog=document.getElementById('assignmentAttachmentDialog');
  if(!dialog){dialog=document.createElement('div');dialog.id='assignmentAttachmentDialog';dialog.className='appDialogOverlay';document.body.appendChild(dialog)}
  dialog.innerHTML=`<section class="appDialog assignmentAttachmentDialog" role="dialog" aria-modal="true" aria-labelledby="assignmentAttachmentDialogTitle"><h2 id="assignmentAttachmentDialogTitle">Attachments</h2><div class="assignmentAttachmentList">${items.map((item,index)=>`<button type="button" class="assignmentAttachmentRow" data-assignment-attachment-index="${index}"><span class="assignmentAttachmentIcon" aria-hidden="true"><img src="${esc(assignmentAttachmentIconUrl(item))}" alt=""></span><span class="assignmentAttachmentName">${esc(String(item.title||item.fileTitle||item.filename||item.fileName||item.linkTitle||item.videoTitle||item.name||item.tool_name||'Attachment'))}</span></button>`).join('')}</div><div class="appDialogActions"><button type="button" id="assignmentAttachmentCancel">Cancel</button></div></section>`;
  dialog.classList.add('open');
  dialog.querySelector('#assignmentAttachmentCancel')?.addEventListener('click',()=>dialog.classList.remove('open'));
  dialog.querySelectorAll('[data-assignment-attachment-index]').forEach(button=>button.addEventListener('click',async()=>{
    const item=items[Number(button.dataset.assignmentAttachmentIndex)];
    if(item)await openAssignmentAttachmentItem(item,button,dialog);
  }));
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.classList.remove('open')},{once:true});
}
async function showAssignment(sectionId,assignmentId){
  const c=document.getElementById('content'); if(!c)return;
  state.toolbarTitle='Assignment'; state.screen='app'; state.assignmentView={sectionId,assignmentId}; state.courseView='course'; state.assignmentTab='info'; state.assignmentCanSubmit=false; state.assignmentIsTeacher=false; state.assignmentSubpage=null; state.submissionMenu=false; state.assignmentAllowComments=false; state.assignmentLandscape=window.matchMedia('(min-width: 801px)').matches; syncToolbar();
  c.innerHTML=`<section class="assignmentPage"><div class="assignmentLoading loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading assignment…</span></div></section>`;
  try{
    const uid=state.auth?.userId||state.auth?.user?.id;
    const [aResp,sectionResp,enrollResp]=await Promise.all([
      A.api({path:`sections/${sectionId}/assignments/${assignmentId}`,params:{richtext:1,with_attachments:'TRUE'}}),
      A.api({path:`sections/${sectionId}`,params:{}}).catch(()=>({})),
      uid?A.api({path:`sections/${sectionId}/enrollments`,params:{uid,enrollment_status:1}}).catch(()=>({})):Promise.resolve({})
    ]);
    const at=aResp.assignment||aResp;
    state.toolbarTitle=String(at.title||'Assignment');syncToolbar();
    // Android AssignmentResolverActivity sends LTI submissions to LTIAssignmentActivity,
    // which loads AssignmentData.webUrl() in a Schoology WebView. Google Drive/Docs/Slides
    // assignments use this LTI/external-tool path, so do not try to render them natively.
    const assignmentType=String(at.assignment_type||at.assignmentType||at.type||'').toLowerCase();
    const assignmentWebUrl=at.web_url||at.webUrl||at.launch_url||at.launchUrl||'';
    if(assignmentType==='lti_submission' && assignmentWebUrl){
      await A.prepareWebSession();
      showEmbeddedWeb(assignmentWebUrl,at.title||'Assignment',{allowBrowser:false,lti:true});
      return;
    }
    const html=typeof at.description==='string'?at.description:'';
    const attachments=at.attachments||at.attachment||{};
    const myEnrollment=(enrollResp.enrollment||enrollResp.enrollments||[])[0]||{};
    const isTeacher=String(myEnrollment.admin??sectionResp.admin??at.admin??(state.selectedCourse?.admin||0))==='1';
    const flag=v=>v===true||v===1||v==='1'||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes';
    let gradeItem=at;
    try{
      const gi=await A.api({path:`sections/${sectionId}/grade_items/${assignmentId}`,params:{}});
      gradeItem=gi?.assignment||gi?.grade_item||gi?.gradeItem||gi||at;
    }catch{}
    const canSubmit=flag(at.allow_dropbox)||flag(at.allowDropbox)||flag(at.allow_submission)||flag(at.allowSubmission)||flag(gradeItem.allow_dropbox)||flag(gradeItem.allowDropbox)||flag(gradeItem.allow_submission)||flag(gradeItem.allowSubmission);
    const allowComments=flag(at.allow_discussion)||flag(at.allowDiscussion)||flag(gradeItem.allow_discussion)||flag(gradeItem.allowDiscussion);
    let assignmentGrade={};
    if(uid){try{const gr=await A.api({path:`sections/${sectionId}/grades`,params:{assignment_id:gradeItem.id||assignmentId,enrollment_id:(myEnrollment.id||undefined)}});assignmentGrade=(gr.grades?.grade||gr.grade||[])[0]||{}}catch{}}
    const resolvedGradeItemId=Number(gradeItem.id||gradeItem.grade_item_id||gradeItem.gradeItemId||gradeItem.gradeitem_id||gradeItem.gradeItemID||assignmentId)||Number(assignmentId);
    state.assignmentCanSubmit=canSubmit; state.assignmentIsTeacher=isTeacher; state.assignmentAllowComments=allowComments; state.assignmentData={...at,__gradeItemId:resolvedGradeItemId}; state.assignmentEnrollmentId=myEnrollment.id||null;
    const tabs=`<button class="assignmentTab active" data-assignment-tab="info">Info</button>${allowComments?`<button class="assignmentTab" data-assignment-tab="comments">Comments</button>`:''}${!state.assignmentLandscape&&canSubmit?`<button class="assignmentTab" data-assignment-tab="submit">${isTeacher?'Grade Submissions':'Submissions'}</button>`:''}`;
    if(state.assignmentLandscape&&canSubmit){
      c.innerHTML=`<section class="assignmentAndroidPage assignmentLandscapePage"><div class="assignmentLandscapeSplit"><section class="assignmentInfoPane"><div class="assignmentTabs">${tabs}</div><div id="assignmentTabContent" class="assignmentTabContent"></div></section><aside class="assignmentSubmissionsPane"><div class="assignmentPaneHeader">${isTeacher?'Submissions':'Submissions'}</div><div id="assignmentSubmissionsPane" class="assignmentSubmissionsContent"></div></aside></div></section>`;
    }else{
      c.innerHTML=`<section class="assignmentAndroidPage"><div class="assignmentTabs">${tabs}</div><div id="assignmentTabContent" class="assignmentTabContent"></div></section>`;
    }
    const renderInfo=()=>{
      const el=document.getElementById('assignmentTabContent');if(!el)return;
      const teacherComment=typeof assignmentGrade.comment==='string'?assignmentGrade.comment:(assignmentGrade.comment?.comment||assignmentGrade.comment?.body||'');
      const attachmentItems=collectAssignmentAttachments(attachments);
      el.innerHTML=`<div class="assignmentInfoHeader"><h1>${esc(at.title||'Assignment')}</h1><div>${esc(at.due?formatSchoologyDate(at.due):'')}</div>${at.max_points!=null?`<div class="assignmentInfoPoints">${esc(at.max_points)} points</div>`:''}</div>${attachmentItems.length?`<button type="button" id="viewAssignmentAttachments" class="assignmentAttachmentsButton">View Attachments (${attachmentItems.length})</button>`:''}<div class="assignmentDescription">${html||'<span class="muted">No description.</span>'}</div>${teacherComment?`<section class="assignmentTeacherComment"><b>Teacher Comment</b><div>${teacherComment}</div></section>`:''}<div class="assignmentMeta"></div>`;
      state.assignmentTab='info';state.assignmentSubpage=null;state.submissionMenu=false;syncToolbar();
      document.getElementById('viewAssignmentAttachments')?.addEventListener('click',()=>showAssignmentAttachmentDialog(attachmentItems));
      hydrateMediaImages(el);
      el.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',async ev=>{const href=a.href||a.getAttribute('href')||'';if(!href||href==='#')return;ev.preventDefault();ev.stopPropagation();try{const result=await A.openExternal(href);if(typeof result==='string'&&result)showAppDialog('Unable to open link',result)}catch(e){showAppDialog('Unable to open assignment link',e.message||String(e))}}));
    };
    const select=async(id)=>{
      state.assignmentTab=id; state.submissionMenu=false;
      document.querySelectorAll('.assignmentTab').forEach(x=>x.classList.toggle('active',x.dataset.assignmentTab===id));
      if(id==='info'){const infoEl=document.getElementById('assignmentTabContent');if(infoEl)infoEl.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';await new Promise(resolve=>requestAnimationFrame(resolve));renderInfo();}
      else if(id==='comments')await openAssignmentComments(sectionId,assignmentId,at);
      else if(id==='submit')await openAssignmentSubmissions(sectionId,assignmentId,at,isTeacher);
      syncToolbar();
    };
    document.querySelectorAll('[data-assignment-tab]').forEach(b=>b.onclick=()=>openWithPressTransition(b,()=>select(b.dataset.assignmentTab)));
    renderInfo();
    if(state.assignmentLandscape&&canSubmit)await openAssignmentSubmissions(sectionId,assignmentId,at,isTeacher);
  }catch(e){ c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`; }
}

async function openAssignmentComments(sectionId,assignmentId,assignment){
  const c=state.assignmentLandscape?(document.getElementById('assignmentTabContent')||document.getElementById('content')):(document.getElementById('assignmentTabContent')||document.getElementById('content'));if(!c)return;
  c.innerHTML='<div class="commentsPage officialComments"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading comments…</span></div></div>';
  try{
    const x=await A.api({path:`sections/${sectionId}/assignments/${assignmentId}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});
    const arr=x.comments||x.comment||[];
    const flat=[];
    const walk=(node,depth=0)=>{if(!node||typeof node!=='object')return;flat.push({node,depth});const children=node.children||node.replies||node.comments||node.comment_replies||[];if(Array.isArray(children))children.forEach(ch=>walk(ch,depth+1));};
    arr.forEach(v=>walk(v,0));
    const userIds=[...new Set(flat.map(({node})=>Number(node.creater_id??node.creator_id??node.uid??node.user_id??node.author_id??0)).filter(Boolean))];
    const users={};await Promise.all(userIds.map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{picture_size:'sm'}});users[id]=u?.user||u}catch{}}));
    const cards=flat.map(({node,depth})=>{
      const uid=Number(node.creater_id??node.creator_id??node.uid??node.user_id??node.author_id??0),u=users[uid]||{};
      const name=u.name_display||u.display_name||u.name||node.display_name||node.user_name||'Schoology';
      const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||'');
      const body=node.comment??node.body??node.message??'';
      const created=formatSchoologyDate(node.created??node.timestamp??'');
      const likes=Number(node.likes??node.like_count??0),liked=!!(node.userLiked||node.user_liked||node.liked);
      const cid=node.comment_id??node.id??'';
      const att=renderAttachments(node.attachments||node.attachment||{});
      const deleted=Number(node.status??1)===0;
      return `<article class="androidCommentRow" style="padding-left:${12+Math.min(depth,8)*15}px"><div class="androidCommentAvatar">${avatar?`<img data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:'<span class="commentAvatar">'+esc(String(name).charAt(0))+'</span>'}</div><div class="androidCommentContent"><button class="commentUserName" data-comment-user="${esc(uid)}">${esc(name)}</button><div class="commentBodyHtml ${deleted?'commentDeleted':''}">${deleted?'Comment deleted':body}</div><div class="commentCreated">${esc(created)}</div>${att}<div class="androidCommentActions">${!deleted&&depth===0?`<button data-comment-reply="${esc(cid)}">Reply</button>`:''}<button data-comment-like="${esc(cid)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}</button><button type="button" data-comment-like-count="${esc(cid)}" data-like-assignment="${esc(assignmentId)}">♥ ${likes}</button></div></div></article>`;
    }).join('');
    c.innerHTML=`<div class="commentsAndroidList">${cards||'<div class="androidEmptyState">No comments yet.</div>'}</div>`;
    await hydrateMediaImages(c);
    document.querySelectorAll('[data-comment-like]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.commentLike;if(!id||btn.disabled)return;const liked=btn.dataset.liked==='1';btn.disabled=true;try{const result=await A.api({path:`like/${assignmentId}/comment/${id}`,method:'POST',params:{like_action:!liked},json:true});const nextLiked=typeof result?.user_like_action==='boolean'?result.user_like_action:!liked;btn.dataset.liked=nextLiked?'1':'0';btn.textContent=nextLiked?'Unlike':'Like';const countButton=document.querySelector(`[data-comment-like-count="${CSS.escape(id)}"]`);if(countButton&&Number.isFinite(Number(result?.likes)))countButton.textContent=`♥ ${Number(result.likes)}`}catch(e){const message=String(e?.message||e||'');if(/same as your previous like action/i.test(message)){const nextLiked=!liked;btn.dataset.liked=nextLiked?'1':'0';btn.textContent=nextLiked?'Unlike':'Like'}else{alert('Unable to update like: '+(message||'Unknown error'))}}finally{btn.disabled=false}});
    document.querySelectorAll('[data-comment-like-count]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.commentLikeCount,assignment=btn.dataset.likeAssignment;if(!id||!assignment||btn.dataset.loading==='1')return;btn.dataset.loading='1';try{const data=await A.api({path:`like/${assignment}/comment/${id}`,params:{}});const users=data?.users?.user||data?.users||data?.user||[];const list=(Array.isArray(users)?users:[users]).filter(Boolean);const names=list.map(u=>u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology user');showAppDialog('Liked by',list.length?names.join('\n'):'No likes yet.')}catch(e){showAppDialog('Unable to load likes',e?.message||String(e)||'Unknown error')}finally{delete btn.dataset.loading}});
    document.querySelectorAll('[data-comment-user]').forEach(btn=>btn.onclick=()=>{const uid=btn.dataset.commentUser;if(uid){state.profileUser={id:uid};state.toolbarTitle=btn.textContent||'Profile';openProfileById(uid,btn.textContent||'Profile')}});
    document.querySelectorAll('[data-comment-reply]').forEach(btn=>btn.onclick=()=>openAssignmentCommentComposer(sectionId,assignmentId,btn.dataset.commentReply));
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load comments.</b><br>${esc(e.message)}</div>`}
}

async function chooseSchoologyResource(onSelect,title='Attach Resource'){
 const old=document.getElementById('schoologyResourcePicker');old?.remove();
 const wrap=document.createElement('div');wrap.id='schoologyResourcePicker';wrap.className='assignmentCommentDialogOverlay schoologyResourcePickerOverlay';
 wrap.innerHTML=`<section class="schoologyResourcePickerDialog" role="dialog" aria-modal="true"><header><button id="resourcePickerCancel" class="iconButton">${officialIcon('ic_action_discard_icon.png','Close')}</button><b>${esc(title)}</b><button id="resourcePickerDone" class="iconButton" disabled>${officialIcon('ic_action_post_checkmark_divider.png','Save')}</button></header><div class="resourcePickerTabs"><button class="active">All</button><button>Selected</button></div><div id="resourcePickerBody"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading resources…</span></div></div></section>`;
 document.body.appendChild(wrap); const body=wrap.querySelector('#resourcePickerBody'); let selected=null;
 const close=()=>wrap.remove();wrap.querySelector('#resourcePickerCancel').onclick=close;wrap.onclick=e=>{if(e.target===wrap)close()};
 try{
  const x=await A.api({path:'collections',params:{start:0,limit:200}});const cols=x?.collection||x?.collections||x?.collection_list||[];
  if(!Array.isArray(cols)||!cols.length){body.innerHTML='<div class="resourcePickerEmpty">No resource collections available.</div>';return;}
  body.innerHTML=cols.map((col,i)=>`<button class="resourcePickerCollection" data-col-index="${i}">${resourceIconMarkup('ic_collection.png')}<span><b>${esc(col.collection_title||col.title||col.name||'Collection')}</b><small>Resources</small></span><span>›</span></button>`).join('');
  wrap.querySelectorAll('[data-col-index]').forEach(btn=>btn.onclick=async()=>{const col=cols[+btn.dataset.colIndex],cid=col.id??col.collection_id??col.collectionID;if(cid==null)return;body.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading resources…</span></div>';try{const rx=await A.api({path:`collections/${cid}/resources`,params:{start:0,limit:200,with_attachments:'TRUE'}});const rs=rx?.resource||rx?.resources||rx?.resource_list||[];body.innerHTML=`<button class="resourcePickerBack">${officialBackIcon()} ${esc(col.collection_title||col.title||'Collection')}</button>`+(rs.length?rs.map((r,i)=>`<button class="resourcePickerItem" data-res-index="${i}">${resourceIconMarkup(resourceIconForType(resourceType(r),resourceTitle(r),r))}<span><b>${esc(resourceTitle(r)||'Resource')}</b></span></button>`).join(''):'<div class="resourcePickerEmpty">No resources in this collection.</div>');body.querySelector('.resourcePickerBack')?.addEventListener('click',()=>{body.innerHTML=cols.map((col2,i)=>`<button class="resourcePickerCollection" data-col-index="${i}"><img src="../assets/icons/ic_collection.png" onerror="this.onerror=null;this.src='../assets/icons/attachment_document_icon.png'" alt=""><span><b>${esc(col2.collection_title||col2.title||col2.name||'Collection')}</b><small>Resources</small></span><span>›</span></button>`).join('');body.querySelectorAll('[data-col-index]').forEach(b=>b.onclick=wrap.querySelectorAll('[data-col-index]')[0]?.onclick)});window.__pickerResources=rs;body.querySelectorAll('[data-res-index]').forEach(rbtn=>rbtn.onclick=()=>{selected=window.__pickerResources[+rbtn.dataset.resIndex];wrap.querySelector('#resourcePickerDone').disabled=false;body.querySelectorAll('.resourcePickerItem').forEach(q=>q.classList.remove('selected'));rbtn.classList.add('selected');});}catch(e){body.innerHTML=`<div class="resourcePickerError">Unable to load resources<br>${esc(e.message)}</div>`}});
  wrap.querySelector('#resourcePickerDone').onclick=()=>{if(selected){onSelect(selected);close()}};
 }catch(e){body.innerHTML=`<div class="resourcePickerError">Unable to load resources<br>${esc(e.message)}</div>`}
}

function openAssignmentCommentComposer(sectionId,assignmentId,parentId='0'){
  state.assignmentSubpage='commentComposer';
  const old=document.getElementById('assignmentCommentDialog');old?.remove();
  const wrap=document.createElement('div');wrap.id='assignmentCommentDialog';wrap.className='assignmentCommentDialogOverlay';
  wrap.innerHTML=`<section class="assignmentCommentDialog" role="dialog" aria-modal="true"><div class="androidCommentDialogBar"><button id="assignmentCommentCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">Comment</div><button id="assignmentCommentSend" class="androidDialogIcon" aria-label="Submit">${officialIcon('ic_action_send_icon.png','Submit')}</button></div><div class="androidCommentDialogBody"><textarea id="assignmentCommentBody" placeholder="Post a comment…" autofocus></textarea><div class="commentAttachmentActions"><button id="commentAttachFile">${officialOrAssetIcon('ic_action_ic_menu_folder.png','')}File</button><button id="commentAttachResource">${officialOrAssetIcon('ic_attach_resourcesv3.png','')}Resource</button></div><div id="commentAttachmentStatus"></div></div></section>`;
  document.body.appendChild(wrap);
  const close=()=>{state.assignmentSubpage=null;wrap.remove();syncToolbar()};
  wrap.querySelector('#assignmentCommentCancel')?.addEventListener('click',close);wrap.querySelector('#commentAttachFile')?.addEventListener('click',async()=>{try{const f=await A.pickFile?.();if(f){wrap.dataset.attachment=f.path||f.filePath||'';wrap.querySelector('#commentAttachmentStatus').textContent='File attached: '+(f.name||f.fileName||f.path||'Selected file')}}catch(e){alert('Unable to select file: '+e.message)}});wrap.querySelector('#commentAttachResource')?.addEventListener('click',async()=>{try{await chooseSchoologyResource(r=>{const id=r.template_id??r.templateID??r.resource_id??r.resourceId??r.template?.id??r.id;if(id==null)throw new Error('This resource does not have a usable Schoology resource ID.');wrap.dataset.resourceId=id;wrap.querySelector('#commentAttachmentStatus').textContent='Resource attached: '+resourceTitle(r)},'Attach Resource')}catch(e){alert('Unable to load resources: '+e.message)}});
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('#assignmentCommentSend')?.addEventListener('click',async()=>{
    const body=wrap.querySelector('#assignmentCommentBody')?.value.trim();if(!body)return;
    const send=wrap.querySelector('#assignmentCommentSend');send.disabled=true;
    try{
      const params={comment:body,parent_id:Number(parentId)||0};
      const filePath=wrap.dataset.attachment||'';const resourceId=wrap.dataset.resourceId||'';
      if(filePath){const fileId=await A.uploadSchoologyFile({filePath});params['file-attachment']={id:[Number(fileId)||fileId]}}
      if(resourceId)params.attachments=[{resource:Number(resourceId)||resourceId}];
      await A.api({path:`course/${sectionId}/materials/assignments/${assignmentId}/${Number(parentId)?`create_reply/${Number(parentId)}`:'create_comment'}`,method:'POST',params,json:true});
      close();await openAssignmentComments(sectionId,assignmentId,state.assignmentData||{})
    }catch(e){send.disabled=false;alert('Unable to post comment: '+e.message)}
  });
  requestAnimationFrame(()=>wrap.querySelector('#assignmentCommentBody')?.focus());
}
function showAssignmentActionMenu(){
  const old=document.getElementById('assignmentActionMenu');old?.remove();
  const plus=document.getElementById('assignmentPlus');if(!plus)return;
  const r=plus.getBoundingClientRect();
  const menu=document.createElement('div');menu.id='assignmentActionMenu';menu.className='assignmentActionMenu';
  const canComment=!!state.assignmentAllowComments,canSubmit=!!state.assignmentCanSubmit&&!state.assignmentIsTeacher;
  menu.innerHTML=`${canComment?`<button id="assignmentNewComment"><span>Create comment</span></button>`:''}${canSubmit?`<button id="assignmentUploadSubmission"><span>Upload submission</span></button><button id="assignmentTextSubmission"><span>Create text submission</span></button>`:''}`;
  document.body.appendChild(menu);menu.style.top=(r.bottom+6)+'px';menu.style.right=(window.innerWidth-r.right)+'px';
  document.getElementById('assignmentNewComment')?.addEventListener('click',()=>{menu.remove();openAssignmentCommentComposer(state.assignmentView.sectionId,state.assignmentView.assignmentId,'0')});
  document.getElementById('assignmentUploadSubmission')?.addEventListener('click',()=>{menu.remove();showAssignmentAttachmentChooser()});
  document.getElementById('assignmentTextSubmission')?.addEventListener('click',()=>{menu.remove();openTextSubmissionComposer()});
  const dismiss=e=>{if(!menu.contains(e.target)&&e.target!==plus){menu.remove();document.removeEventListener('mousedown',dismiss)}};setTimeout(()=>document.addEventListener('mousedown',dismiss),0);
}

async function openAssignmentSubmissions(sectionId,assignmentId,assignment,isTeacher){
  const c=(state.assignmentLandscape&&document.getElementById('assignmentSubmissionsPane'))||(document.getElementById('assignmentTabContent')||document.getElementById('content'));if(!c)return;
  const gradeItemId=assignment.__gradeItemId||assignment.grade_item_id||assignment.gradeItemId||assignment.gradeitem_id||assignment.gradeItemID||assignmentId;
  c.innerHTML='<div class="gradeDropboxAndroid"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div>';
  try{
    if(isTeacher){
      const [enr,grades,subs]=await Promise.all([
        A.api({path:`sections/${sectionId}/enrollments`,params:{enrollment_status:1,limit:200}}),
        A.api({path:`sections/${sectionId}/grades`,params:{assignment_id:gradeItemId,limit:200}}),
        A.api({path:`sections/${sectionId}/submissions/${gradeItemId}`,params:{with_attachments:'TRUE',all_revisions:'TRUE',limit:200}}).catch(()=>({}))
      ]);
      const enrollments=(enr.enrollment||enr.enrollments||[]).filter(e=>String(e.admin)!=='1'&&String(e.status||1)==='1');
      const gradesArr=grades.grades?.grade||grades.grade||[];const gmap={};gradesArr.forEach(g=>gmap[String(g.enrollment_id)]=g);
      const revisions=subs.revision||subs.revisions||[];const smap={};revisions.forEach(r=>{const uid=String(r.uid||r.user_id||'');if(uid&&!smap[uid])smap[uid]=r});
      enrollments.sort((a,b)=>String(a.name_last||'').localeCompare(String(b.name_last||''))||String(a.name_first||'').localeCompare(String(b.name_first||'')));
      c.innerHTML=`<section class="gradeDropboxAndroid"><div class="gradeDropboxHeader"><b>${esc(assignment.title||'Assignment')}</b><span>${esc(assignment.max_points!=null?'/ '+assignment.max_points:'')}</span></div><div class="gradeStudentList">${enrollments.map(e=>{const g=gmap[String(e.id)]||{};const r=smap[String(e.uid)];const score=g.grade??g.calculated_grade??'';const status=r?(String(r.draft)==='1'?'Draft':(String(r.late)==='1'?'Late':'Submitted')):'Not submitted';return `<button class="gradeStudentRow" data-grade-student="${esc(e.uid)}" data-grade-enrollment="${esc(e.id)}"><span class="gradeStudentAvatar">${esc(String(e.name_first||e.name_display||'?').charAt(0))}</span><span class="gradeStudentName"><b>${esc((e.name_last||'')+', '+(e.name_first||''))}</b><small>${esc(status)}</small></span><span class="gradeStudentScore">${esc(score===''?'—':score)}</span></button>`}).join('')||'<div class="androidEmptyState">No students found.</div>'}</div></section>`;
      document.querySelectorAll('[data-grade-student]').forEach(b=>b.onclick=()=>openTeacherSubmission(sectionId,assignmentId,assignment,b.dataset.gradeStudent,b.dataset.gradeEnrollment));
    }else{
      const uid=state.auth?.userId||state.auth?.user?.id;
      const grades=await A.api({path:`sections/${sectionId}/grades`,params:{assignment_id:gradeItemId,enrollment_id:(state.assignmentEnrollmentId||undefined)}}).catch(()=>({}));
      let subs={};
      try{subs=await A.api({path:`sections/${sectionId}/submissions/${gradeItemId}/${uid}`,params:{with_attachments:'TRUE',all_revisions:'TRUE',start:0,limit:200}})}catch(e){subs={};}
      const g=(grades.grades?.grade||grades.grade||[])[0]||{};const revsRaw=subs.revision||subs.revisions||subs.data?.revision||subs.data?.revisions||[];const revs=Array.isArray(revsRaw)?revsRaw.slice():[];revs.sort((a,b)=>Number(b.revision_id??b.revisionId??b.id??0)-Number(a.revision_id??a.revisionId??a.id??0));
      const annotationAllowed=await schoologyAssignmentSupportsAnnotations(sectionId,assignmentId);
      const revisionHtml=revs.length?revs.map(r=>{const rid=r.revision_id??r.revisionId??r.id??'';return `<article class="submissionRevisionAndroid"><div><b>Revision ${esc(rid)}</b><small>${esc(formatSchoologyDate(r.created||''))}</small></div><span class="revisionStatus ${String(r.late)==='1'?'late':''}">${String(r.draft)==='1'?'Draft':String(r.late)==='1'?'Late':'On time'}</span>${renderAttachments(r.attachments||{}, {sectionId,assignmentId,gradeItemId,userId:uid,revisionId:rid,submissionId:r.submission_id||r.submissionId||r.sub_id||'',allowAnnotation:annotationAllowed})}</article>`}).join(''):'<div class="androidEmptyState">You haven’t made any submissions.</div>';
      const gradeComment=typeof g.comment==='string'?g.comment:(g.comment?.comment||g.comment?.body||'');
      c.innerHTML=`<section class="gradeDropboxAndroid studentSubmissionAndroid"><div class="gradeDropboxHeader"><b>${esc(assignment.title||'Assignment')}</b><span>${esc((g.grade??'—')+(assignment.max_points!=null?` / ${assignment.max_points}`:''))}</span></div>${gradeComment?`<div class="studentOverallComment"><b>Overall Comment</b><div>${esc(gradeComment)}</div></div>`:''}<div class="submissionSectionTitle">Your Submissions</div><div class="submissionRevisionList">${revisionHtml}</div></section>`;
      await hydrateMediaImages(c);
    }
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load submissions.</b><br>${esc(e.message)}</div>`}
}

async function openTeacherSubmission(sectionId,gradeItemId,assignment,userId,enrollmentId){
  state.assignmentSubpage='teacherSubmission'; state.toolbarTitle='Grade Submission'; syncToolbar();
  const c=document.getElementById('assignmentTabContent');if(!c)return;
  c.innerHTML='<div class="gradeDropboxAndroid"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading submission…</span></div></div>';
  try{
    const [u,grades,subs]=await Promise.all([A.api({path:`users/${userId}`,params:{picture_size:'sm'}}).catch(()=>({})),A.api({path:`sections/${sectionId}/grades`,params:{assignment_id:gradeItemId,enrollment_id:enrollmentId}}).catch(()=>({})),A.api({path:`sections/${sectionId}/submissions/${gradeItemId}/${userId}`,params:{with_attachments:'TRUE',all_revisions:'TRUE',start:0,limit:200}}).catch(()=>({}))]);
    const user=u.user||u,g=(grades.grades?.grade||grades.grade||[])[0]||{},revsRaw=subs.revision||subs.revisions||[];const revs=Array.isArray(revsRaw)?revsRaw.slice():[];revs.sort((a,b)=>Number(b.revision_id??b.revisionId??b.id??0)-Number(a.revision_id??a.revisionId??a.id??0));
    const revisionHtml=revs.length?revs.map(r=>{const rid=r.revision_id??r.revisionId??r.id??'';const comment=typeof g.comment==='string'?g.comment:(g.comment?.comment||g.comment?.body||'');return `<article class="submissionRevisionAndroid"><div><b>Revision ${esc(rid)}</b><small>${esc(formatSchoologyDate(r.created||''))}</small></div><span class="revisionStatus ${String(r.late)==='1'?'late':''}">${String(r.draft)==='1'?'Draft':String(r.late)==='1'?'Late':'On time'}</span>${renderAttachments(r.attachments||{}, {sectionId,gradeItemId,userId,revisionId:rid,submissionId:r.submission_id||r.submissionId||r.sub_id||''})}</article>`}).join(''):'<div class="androidEmptyState">No submissions.</div>';
    const gradeComment=typeof g.comment==='string'?g.comment:(g.comment?.comment||g.comment?.body||'');
    c.innerHTML=`<section class="gradeDropboxAndroid teacherSubmissionAndroid"><div class="teacherGradeHeader"><div class="teacherUser"><div class="gradeStudentAvatar">${esc(String(user.name_first||user.name_display||'?').charAt(0))}</div><b>${esc(user.name_display||`${user.name_first||''} ${user.name_last||''}`)}</b></div><div class="teacherScore"><input id="teacherGradeInput" value="${esc(g.grade??'')}" inputmode="decimal"><span>/ ${esc(assignment.max_points??'')}</span></div></div><div class="submissionSectionTitle">Submissions</div><div class="submissionRevisionList">${revisionHtml}</div><section class="teacherOverallComment"><label>Overall Comment</label><textarea id="teacherGradeComment">${esc(gradeComment)}</textarea><label class="displayComment"><input id="teacherDisplayComment" type="checkbox" ${String(g.comment_status)==='1'?'checked':''}> Display comment to student</label><button id="saveTeacherGrade" class="androidPrimary">✓</button></section></section>`;
    await hydrateMediaImages(c);
    document.getElementById('saveTeacherGrade')?.addEventListener('click',async()=>{try{await A.updateAssignmentGrade({sectionId,assignmentId:gradeItemId,enrollmentId,grade:document.getElementById('teacherGradeInput')?.value||'',comment:document.getElementById('teacherGradeComment')?.value||'',commentStatus:document.getElementById('teacherDisplayComment')?.checked});await openTeacherSubmission(sectionId,gradeItemId,assignment,userId,enrollmentId)}catch(e){alert(e.message)}});
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this submission.</b><br>${esc(e.message)}</div>`}
}

function showSubmissionMenu(){
  state.submissionMenu=!state.submissionMenu;
  const old=document.getElementById('submissionMenu'); old?.remove();
  if(!state.submissionMenu)return;
  const menu=document.createElement('div');menu.id='submissionMenu';menu.className='submissionMenu';
  menu.innerHTML='<button id="uploadSubmissionAction">Upload Submission</button><button id="textSubmissionAction">Create Text Submission</button>';
  document.body.appendChild(menu);
  const b=document.getElementById('assignmentPlus');const r=b?.getBoundingClientRect();if(r){menu.style.top=(r.bottom+6)+'px';menu.style.right=(window.innerWidth-r.right)+'px';}
  document.getElementById('uploadSubmissionAction')?.addEventListener('click',()=>{state.submissionMenu=false;menu.remove();showAssignmentAttachmentChooser()});
  document.getElementById('textSubmissionAction')?.addEventListener('click',()=>{state.submissionMenu=false;menu.remove();openTextSubmissionComposer()});
}
function showAssignmentAttachmentChooser(){
  document.getElementById('assignmentUploadSubmissionDialog')?.remove();
  const wrap=document.createElement('div');wrap.id='assignmentUploadSubmissionDialog';wrap.className='assignmentSubmissionDialogOverlay';
  wrap.innerHTML='<section class="assignmentSubmissionDialog" role="dialog" aria-modal="true"><div class="assignmentSubmissionBar"><button id="submissionDialogCancel" class="androidDialogIcon" aria-label="Cancel">'+officialIcon('ic_action_discard_icon.png','Cancel')+'</button><div class="androidDialogTitle">New Submission</div><button id="submissionDialogSend" class="androidDialogIcon" aria-label="Submit">'+officialIcon('ic_action_send_icon.png','Submit')+'</button></div><div class="assignmentSubmissionBody"><div class="assignmentSubmissionChoices"><button id="submissionFileChoice">'+officialOrAssetIcon('ic_action_ic_menu_folder.png','')+'<span>File</span></button><button id="submissionResourceChoice">'+officialOrAssetIcon('ic_attach_resourcesv3.png','')+'<span>Resource</span></button></div><div id="submissionAttachmentStatus" class="submissionAttachmentStatus">No attachment selected</div></div></section>';
  document.body.appendChild(wrap);wrap.style.zIndex='2147483647';
  let selected=null;
  const status=()=>wrap.querySelector('#submissionAttachmentStatus');
  const close=()=>wrap.remove();
  const showSelected=label=>{if(status())status().textContent=label?'Selected: '+label:'No attachment selected'};
  wrap.querySelector('#submissionDialogCancel')?.addEventListener('click',close);wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('#submissionFileChoice')?.addEventListener('click',async()=>{
    try{
      const picked=await A.pickFile();if(!picked)return;
      const filePath=typeof picked==='string'?picked:picked.path;if(!filePath)throw new Error('The selected file could not be accessed.');
      const filename=typeof picked==='object'&&picked.name?picked.name:filePath.split(/[\\/]/).pop();
      const mime=typeof picked==='object'?picked.mime:'';
      selected={type:'file',filePath,filename,mime};showSelected(filename||'File');
    }catch(e){showAppDialog('Unable to prepare file submission',e.message||String(e))}
  });
  wrap.querySelector('#submissionResourceChoice')?.addEventListener('click',async()=>{
    try{
      await chooseSchoologyResource(async r=>{
        const resourceId=r.template_id??r.templateID??r.resource_id??r.resourceId??r.id;
        if(resourceId==null)throw new Error('This resource does not have a usable Schoology resource ID.');
        const label=r.title||r.name||'Resource';selected={type:'resource',resourceId};showSelected(label);
      },'Attach Resource');
    }catch(e){showAppDialog('Unable to load resources',e.message||String(e))}
  });
  wrap.querySelector('#submissionDialogSend')?.addEventListener('click',async()=>{
    if(!selected){showAppDialog('New submission','Choose a File or Resource before submitting.');return}
    const btn=wrap.querySelector('#submissionDialogSend');if(btn)btn.disabled=true;
    try{
      const v=state.assignmentView;if(!v||!state.assignmentCanSubmit)throw new Error('This assignment is no longer available for submission.');
      if(selected.type==='resource'){
        const dlg=showAppDialog('Submitting resource','Submitting…',[]);
        try{await A.submitAssignmentResource({sectionId:v.sectionId,assignmentId:v.assignmentId,resourceId:selected.resourceId});dlg?.classList.remove('open');close();await openAssignmentSubmissions(v.sectionId,v.assignmentId,state.assignmentData||{},false)}catch(e){dlg?.classList.remove('open');throw e}
      }else{
        const dlg=showAppDialog('Uploading submission','Uploading…',[]);const msg=dlg?.querySelector('.appDialogMessage');
        if(msg)msg.innerHTML='<div class="fileUploadProgressWrap"><div class="fileUploadProgressTrack"><div id="fileUploadProgressBar" class="fileUploadProgressBar" style="width:0%"></div></div><div id="fileUploadProgressText" class="fileUploadProgressText">Uploading… 0%</div></div>';
        const off=A.onFileUploadProgress?.(d=>{const bar=document.getElementById('fileUploadProgressBar'),txt=document.getElementById('fileUploadProgressText');if(bar&&d?.percent!=null)bar.style.width=Math.max(0,Math.min(100,d.percent))+'%';if(txt)txt.textContent=d?.phase?d.phase+(d.percent!=null?' '+d.percent+'%':''):'Uploading… '+(d?.percent??0)+'%'});
        try{await A.submitAssignmentFile({sectionId:v.sectionId,assignmentId:v.assignmentId,filePath:selected.filePath,filename:selected.filename,mime:selected.mime});off?.();dlg?.classList.remove('open');close();await openAssignmentSubmissions(v.sectionId,v.assignmentId,state.assignmentData||{},false)}catch(e){off?.();dlg?.classList.remove('open');throw e}
      }
    }catch(e){if(btn)btn.disabled=false;showAppDialog('Unable to submit',e.message||String(e))}
  });
  return wrap;
}
async function chooseAndSubmitAssignmentResource(){return showAssignmentAttachmentChooser()}
async function chooseAndSubmitAssignmentFile(){return showAssignmentAttachmentChooser()}
function openTextSubmissionComposer(){
  const v=state.assignmentView;if(!v)return;
  document.getElementById('textSubmissionComposer')?.remove();
  const wrap=document.createElement('div');wrap.id='textSubmissionComposer';wrap.className='submissionComposerOverlay';
  wrap.innerHTML='<section class="submissionComposer"><header><b>Create Text Submission</b><button id="cancelTextSubmission">Cancel</button></header><textarea id="submissionText" placeholder="Enter your submission…"></textarea><label><input id="submissionDraft" type="checkbox"> Save as draft</label><button id="postTextSubmission" class="androidPrimary">Submit</button></section>';
  document.body.appendChild(wrap);
  document.getElementById('cancelTextSubmission')?.addEventListener('click',()=>wrap.remove());
  document.getElementById('postTextSubmission')?.addEventListener('click',async()=>{
    const text=document.getElementById('submissionText')?.value||'';
    if(!text.trim()){alert('Enter a submission before posting.');return}
    try{
      const a=state.assignmentData||{};const gradeItemId=a.grade_item_id||a.gradeItemId||a.gradeitem_id||v.assignmentId;
      await A.submitAssignmentText({sectionId:v.sectionId,gradeItemId,text,draft:document.getElementById('submissionDraft')?.checked});
      wrap.remove();await openAssignmentSubmissions(v.sectionId,v.assignmentId,a,false);
    }catch(e){alert('Unable to submit text: '+e.message)}
  });
  document.getElementById('submissionText')?.focus();
}

const LOCAL_ATTACHMENT_ICONS={"attachment_document_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABGCAMAAABG8BK2AAAA4VBMVEUAAAAAAACusLAAAAClqKgAAACtr6+kp6cAAAAAAAAAAAClp6cAAACnqamqrKwAAAAAAAD4+Pr39/j39/n29vbx8fLv8PHu7+7t7u7+/v7s7O39/f3r6+z8/Pzq6uv5+/vn6er5+vrn6Ong4eLz8vTKy8vl5+bn6Oju7++rra2jpaXm5+fk5uX7+/vp6uvk5eb19fbj5OXm5ubt7u/09fXi4+Ty8vOkp6fz9PTh4uP4+PmipaXf4OGtr6/e3+Do6eqrrq7p6emrrq3s7u3////n5+esrq78/Pvl5ualp6etsLBAJgwaAAAAEXRSTlMCBvcRwQHHwQQIBcEHxcMXAEuwd0QAAAGLSURBVFjD7djbTsJAEIDhFihQTopVUWlBy0ELiBUsteK2C51y6Ps/kDRcqIGNQ8JujPF/gO9ikklmVzo9StKfZhQlm43jxYIyms8pJaRSKRREMIUCIfBjs1mxmM/zZ0qlxQLA998Z+T5ArwcQRbncLnRsRlUpBWi1PM/Zk+e1WgCuOx4DjEa7EB/G854ZeR7Aem3bw+E+iA/jOE+MHCdhlsvJJIGiKJP5CvFhVqs+o8EgGTHAcmnbyaBns3JZUfgxlgXQ798z6nYBOh3XXW9y3ekUgJDPNeXDmGbAyDTb7e9rSmmpxJcJgiGzILjdtCVNE8CyVJUv02joiBqbRDC6foNK10UwYXiFKgxFMLXaA6paTQRziU4Ec4FOBDNBJ4L5nw2beUUngnlBJ4I5RyeC0bQzVJomgqlW31BVqyKYZvMOVbMpgjGMR1SGIYKp1w1U9TpvJjmvAa5RbU9Inkwcw0HFMU8mlSKEUgtV8rRPpfgxspxOnxxUOi3LvBhJkmX1oGRZkngxv+I36QMtlmnPFJsUygAAAABJRU5ErkJggg==","ic_attach_app_excel.png":"data:image/png;base64,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","ic_attach_app_pdf.png":"data:image/png;base64,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","ic_attach_app_ppt.png":"data:image/png;base64,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","ic_attach_app_word.png":"data:image/png;base64,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","ic_attach_app_zip.png":"data:image/png;base64,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","ic_attach_audio.png":"data:image/png;base64,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","ic_attach_image.png":"data:image/png;base64,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","ic_attach_text.png":"data:image/png;base64,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","ic_action_download.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD8AAAA/CAQAAAD9VthUAAABnklEQVRYw+2YP2vCQBiHEwtCQFwEXXR1Egr2C4hdHP0IdivS0UU/gNDNjq5209HF2c1FP4CLDkJBkFrIkmqfDtWYU5OWaJKK95sO3j/P3fG+d8cpipSUlJTUJYgQj7zyxE0w+Gd+9BIM/m2Dfw8G/8lWrrc/FGz9nIJXg8Ur/wXPVa9elp4sPVl6V7f5qiw9Wfly8yVe4n3D4xGeKHlSJ8wrRZ6o2+Asc8CgZmPf6svGXsMA5mTd4XsmoEX4wKo64QnTMu09d/ghO/WJ/R1PjL4ldugOX8WqMWkb/HovLs1YiKy6/b1oCmkW5H7Hk2MhRDVx311UWFtSGTw44ylhWPzXVE5t6iK6sJo66nE8KnXBU6d4jlPljpmQtoOmKIREPBodwWvmsuGOTCDJSEg9ICHiSTAQPEYkz/mPE6ErpJ9ya45XZJgK1i6Rc38khWgIiI9d31vGAA28ucgos8JZK8oeXpAUWDrAlxQ8vqHJMLGBT8j48EQ4qHKzG3x6o6DR3oO30Xx8JO2dcJuT0FdRQgd0SgE9FIlzT1yRukx9Ax0Ep3nLYXR9AAAAAElFTkSuQmCC"};
function localAttachmentIcon(name){return LOCAL_ATTACHMENT_ICONS[name]||`../assets/icons/${String(name||'attachment_document_icon.png').replace(/^.*\//,'')}`}
function isPdfAttachment(info){const mime=String(info?.mime||info?.filemime||info?.fileMIME||info?.convertedFileMime||info?.converted_filemime||'').toLowerCase(),name=String(info?.filename||info?.title||info?.fileName||info?.fileTitle||''),url=String(info?.url||info?.downloadUrl||info?.download_url||info?.resolveDownloadUrl||'');let path='';try{path=new URL(url,location.href).pathname}catch{}return mime.includes('pdf')||/\.pdf$/i.test(name)||/\.pdf$/i.test(path)}
function showPdfAttachmentOptions(info,downloadAction){
 document.getElementById('pdfAttachmentOptionsOverlay')?.remove();
 const overlay=document.createElement('div');overlay.id='pdfAttachmentOptionsOverlay';overlay.className='pdfAttachmentOptionsOverlay';
 const title=String(info?.filename||info?.title||'PDF document');
 overlay.innerHTML='<section class="pdfAttachmentOptions" role="dialog" aria-modal="true" aria-label="Open PDF"><header><b>Open PDF</b><button type="button" data-pdf-options-close aria-label="Close">×</button></header><div class="pdfAttachmentTitle">'+esc(title)+'</div><div class="pdfAttachmentActions"><button type="button" data-pdf-download>Download</button><button type="button" class="pdfViewAction" data-pdf-view>View</button></div></section>';
 const close=()=>overlay.remove();
 overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-pdf-options-close]'))close()});
 overlay.querySelector('[data-pdf-download]')?.addEventListener('click',async()=>{close();try{await downloadAction()}catch(error){showAppDialog('Unable to download PDF',error?.message||String(error))}});
 overlay.querySelector('[data-pdf-view]')?.addEventListener('click',()=>{close();openSharedPdfViewer(info)});
 document.body.appendChild(overlay);
}
async function openSharedPdfViewer(info){
 document.getElementById('sharedPdfViewerOverlay')?.remove();
 const root=document.createElement('section');root.id='sharedPdfViewerOverlay';root.className='sharedPdfViewerOverlay pdfViewerOpening';
 root.innerHTML='<header class="sharedPdfViewerAppBar"><button type="button" data-pdf-viewer-back aria-label="Back">'+officialBackIcon()+'</button><b>'+esc(info?.filename||info?.title||'PDF document')+'</b></header><div class="sharedPdfViewerPages"><div class="loading">Opening PDF…</div></div>';
 document.body.appendChild(root);
 requestAnimationFrame(()=>root.classList.add('open'));
 const close=()=>{root.classList.remove('open');root.classList.add('closing');setTimeout(()=>root.remove(),180)};
 root.querySelector('[data-pdf-viewer-back]')?.addEventListener('click',close);
 try{
   if(!info?.url)throw new Error('Schoology did not provide a PDF URL.');
   let pdfjs,pdfjsAssetRoot='./pdfjs/';
   try{pdfjs=await import('./pdfjs/pdf.mjs')}catch(_){pdfjsAssetRoot='../node_modules/pdfjs-dist/';pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.mjs')}
   const buildRoot=pdfjsAssetRoot==='./pdfjs/'?'./pdfjs/':'../node_modules/pdfjs-dist/build/';
   pdfjs.GlobalWorkerOptions.workerSrc=new URL(buildRoot+'pdf.worker.mjs',document.baseURI).toString();
   const file=await A.annotationRequest({url:info.url,binary:true});
   if(!file?.base64)throw new Error('Schoology did not return PDF file data.');
   const raw=atob(file.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   const assetRoot=pdfjsAssetRoot==='./pdfjs/'?'./pdfjs/':'../node_modules/pdfjs-dist/';
   const pdf=await pdfjs.getDocument({data:bytes,cMapUrl:new URL(assetRoot+'cmaps/',document.baseURI).toString(),cMapPacked:true,standardFontDataUrl:new URL(assetRoot+'standard_fonts/',document.baseURI).toString(),wasmUrl:new URL(assetRoot+'wasm/',document.baseURI).toString()}).promise;
   const pages=root.querySelector('.sharedPdfViewerPages');if(!pages)return;pages.innerHTML='';
   for(let number=1;number<=pdf.numPages;number++){
     const page=await pdf.getPage(number),natural=page.getViewport({scale:1}),width=Math.max(280,pages.clientWidth-24),scale=Math.min(1.6,width/natural.width),viewport=page.getViewport({scale});
     const dpr=Math.min(2,window.devicePixelRatio||1),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
     canvas.width=Math.floor(viewport.width*dpr);canvas.height=Math.floor(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';canvas.setAttribute('aria-label','PDF page '+number);
     const pageWrap=document.createElement('div');pageWrap.className='sharedPdfPage';pageWrap.appendChild(canvas);pages.appendChild(pageWrap);
     await page.render({canvasContext:ctx,viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise;
   }
 }catch(error){const pages=root.querySelector('.sharedPdfViewerPages');if(pages)pages.innerHTML='<div class="sharedPdfViewerError"><b>Unable to view this PDF</b><p>'+esc(error?.message||String(error))+'</p><button type="button" data-pdf-viewer-back>Back</button></div>';root.querySelector('[data-pdf-viewer-back]')?.addEventListener('click',close)}
}
function renderAttachments(a,submissionContext=null){
  if(!a)return '';
  const out=[];
  const addFile=(f)=>{
    const url=f?.resolveDownloadUrl||f?.resolve_download_url||f?.converted_download_path||f?.convertedDownloadPath||f?.download_path||f?.downloadPath||f?.fileDownloadURL||f?.download_url||f?.downloadUrl||f?.url;
    if(!url)return;
    const title=(f.title||f.fileTitle||f.filename||f.fileName||'File').trim();
    const mime=f.filemime||f.fileMIME||f.converted_filemime||f.convertedFileMime||'application/octet-stream';
    const ctx=submissionContext&&f?.id?` data-submission-file-id="${esc(f.id)}" data-submission-revision-id="${esc(submissionContext.revisionId||'')}" data-submission-submission-id="${esc(submissionContext.submissionId||'')}" data-submission-section-id="${esc(submissionContext.sectionId||'')}" data-submission-grade-item-id="${esc(submissionContext.gradeItemId||'')}" data-submission-user-id="${esc(submissionContext.userId||'')}"`:'';
    out.push(`<button class="activityAttachment fileAttachment" data-download-url="${esc(url)}" data-download-name="${esc(title)}" data-download-mime="${esc(mime)}"${ctx}><span class="attachmentFileIcon">${officialOrAssetIcon(mimeIconForFilename(title,mime),'')}</span><span class="attachmentFileText"><b>${esc(title)}</b><small>${esc((mime||'File').split('/').pop().toUpperCase())}</small></span><span class="attachmentDownloadIcon">${officialOrAssetIcon('ic_action_download.png','')}</span></button>`);
    if (submissionContext?.allowAnnotation && f?.id && (String(mime).toLowerCase().includes('pdf') || /\.pdf$/i.test(title))) {
      out.push(`<button type="button" class="activityAttachment annotationLaunchButton" data-annotate-pdf data-annotate-url="${esc(url)}" data-annotate-file-id="${esc(f.id)}" data-annotate-file-type="${esc(f.fileType||f.file_type||mime)}" data-annotate-name="${esc(title)}" data-annotate-section-id="${esc(submissionContext.sectionId||'')}" data-annotate-assignment-id="${esc(submissionContext.assignmentId||submissionContext.gradeItemId||'')}"><span class="attachmentFileIcon">✎</span><span class="attachmentFileText"><b>Annotate PDF</b><small>${esc(title)}</small></span><span class="attachmentDownloadIcon">›</span></button>`);
    }
  };
  const addLink=(url,title)=>{if(url)out.push(`<button class="activityAttachment" data-open-url="${esc(url)}">${esc(title||url)}</button>`)};
  const walk=(v)=>{
    if(!v)return;
    if(Array.isArray(v)){v.forEach(walk);return}
    if(typeof v!=='object')return;
    const files=v.files?.file||v.files?.list||v.files||v['file-attachment']||v.file;
    if(files){const list=Array.isArray(files)?files:(files.file||files.list||[files]);list.filter(x=>x&&typeof x==='object').forEach(addFile)}
    const type=String(v.type||v.attachmentType||'').toLowerCase();
    const title=v.title||v.fileTitle||v.fileName||v.linkTitle||v.videoTitle||'Attachment';
    if(type==='file'||v.download_path||v.downloadPath||v.converted_download_path||v.convertedDownloadPath||v.resolveDownloadUrl||v.fileDownloadURL){addFile(v)}
    else if(v.thumbnail||v.fileThumbnailURL||v.videoThumbnailURL){const thumb=v.thumbnail||v.fileThumbnailURL||v.videoThumbnailURL;out.push(`<img class="activityMediaImage authenticatedMediaImage" data-media-image-url="${esc(normalizeImageUrl(thumb))}" alt="${esc(title)}" loading="lazy" style="display:none">`)}
    if(type!=='file')addLink(v.linkURL||v.linkUrl||((type==='link'||type==='web_content')?v.url:null),title);
    for(const k of ['attachment','file','link','video','embed','links','videos'])if(v[k])walk(v[k]);
  };
  walk(a);
  return out.length?`<div class="activityMedia">${out.join('')}</div>`:'';
}

async function hydrateMediaImages(root=document){
  const els=root.querySelectorAll?.('[data-media-image-url]')||[];
  await Promise.all([...els].map(async el=>{
    const u=el.getAttribute('data-media-image-url');try{const data=await A.fetchImage(u);if(data){el.src=data;el.style.display='block';if(el.nextElementSibling)el.nextElementSibling.style.display='none'}}catch{}
  }));
  root.querySelectorAll?.('[data-open-url]')?.forEach(b=>{if(b.dataset.boundOpen)return;b.dataset.boundOpen='1';b.onclick=async()=>{const url=b.dataset.openUrl||'';try{const result=await A.openExternal(url);if(typeof result==='string'&&result)showAppDialog('Unable to open link',result)}catch(e){showAppDialog('Unable to open link',e.message||String(e))}}});
  root.querySelectorAll?.('[data-annotate-pdf]')?.forEach(b=>{if(b.dataset.boundAnnotate)return;b.dataset.boundAnnotate='1';b.onclick=async()=>{if(!window.schoologyAnnotationEditor?.open){showAppDialog('Annotation unavailable','The PDF annotation editor did not load.');return;}try{await window.schoologyAnnotationEditor.open({sectionId:b.dataset.annotateSectionId,assignmentId:b.dataset.annotateAssignmentId,fileId:b.dataset.annotateFileId,fileType:b.dataset.annotateFileType,pdfUrl:b.dataset.annotateUrl,filename:b.dataset.annotateName,onSubmitted:async()=>{await openAssignmentSubmissions(b.dataset.annotateSectionId,b.dataset.annotateAssignmentId,state.assignmentData||{},false)}})}catch(e){showAppDialog('Unable to open annotation editor',e?.message||String(e))}}});
  root.querySelectorAll?.('[data-download-url]')?.forEach(b=>{if(b.dataset.boundDownload)return;b.dataset.boundDownload='1';b.onclick=async()=>{
 try{
   let info={url:b.dataset.downloadUrl,filename:b.dataset.downloadName,mime:b.dataset.downloadMime};
   if(b.dataset.submissionFileId&&b.dataset.submissionRevisionId&&b.dataset.submissionSectionId&&b.dataset.submissionGradeItemId&&b.dataset.submissionUserId){
     const rr=await A.api({path:'sections/'+b.dataset.submissionSectionId+'/submissions/'+(b.dataset.submissionSubmissionId||b.dataset.submissionGradeItemId)+'/'+b.dataset.submissionUserId+'/revision/'+b.dataset.submissionRevisionId,params:{with_annotations:'TRUE',with_attachments:'TRUE'}});
     const revisions=rr?.revision||rr?.revisions||rr?.data?.revision||rr?.data?.revisions||[],list=Array.isArray(revisions)?revisions:[revisions];let exact=null;
     for(const rv of list){const files=rv?.attachments?.files?.file||rv?.attachments?.files||rv?.attachments?.file||[],fs=Array.isArray(files)?files:(files?[files]:[]),hit=fs.find(f=>String(f?.id??f?.fid??'')===String(b.dataset.submissionFileId));if(hit){exact=hit;break}}
     if(exact){const convertedOk=['success','converted','1'].includes(String(exact.converted_status??exact.convertedStatus??'').toLowerCase()),rawUrl=exact.download_path||exact.downloadPath||'',convertedUrl=exact.converted_download_path||exact.convertedDownloadPath||'';info.url=convertedOk&&convertedUrl?convertedUrl:(rawUrl||convertedUrl);info.filename=(convertedOk&&exact.convertedFilename)||exact.filename||exact.title||info.filename;info.mime=(convertedOk&&exact.convertedFileMime)||exact.filemime||info.mime}
   }
   const download=async()=>{const r=await downloadWithFeedback(b,info);const err=await A.openDownloadedFile({path:r.path});if(typeof err==='string'&&err)throw new Error(err)};
   if(isPdfAttachment(info)){showPdfAttachmentOptions(info,download);return}
   await download();
 }catch(e){alert('Unable to open file: '+e.message)}
}});
}
function materialIconForType(item){
 const type=String(item?.type||item?.template_type||'').toLowerCase();
 const docType=String(item?.document_type||item?.documentType||item?.template_document_type||item?.templateDocumentType||item?.template_fields?.document_type||item?.template_fields?.documentType||'').toLowerCase();
 if(type==='folder'){const color=String(item?.color||item?.folder_color||item?.folderColor||'gray').toLowerCase();const allowed=['black','blue','gray','green','orange','pink','purple','red','yellow'];return `ic_folder_${allowed.includes(color)?color:'gray'}.png`;}
 if(type==='assignment')return 'ic_assignment.png';
 if(type==='discussion')return 'ic_discussion.png';
 if(type==='assessment')return 'ic_test_quiz.png';
 if(type==='assessment_v2'||type==='managed_assessment'||type==='quiz')return 'ic_assessment_48dp.png';
 if(type==='page')return 'ic_pages.png'; if(type==='album')return 'ic_albums.png'; if(type==='scorm')return 'ic_scorm.png';
 if(type==='web_content'||docType==='external_tool')return 'ic_web_content.png';
 if(type==='document'||docType){
   if(docType==='link')return 'ic_files_links.png';
   if(docType==='embed')return 'attachment_link_icon.png';
   if(docType==='external_tool')return 'ic_external_tool.png';
   if(docType==='file'){const f=item?.filename||item?.fileName||item?.title||item?.filemime||item?.fileMIME||'';return mimeIconForFilename(f,item?.filemime||item?.fileMIME||'');}
 }
 return mimeIconForFilename(item?.filename||item?.fileName||item?.title||'');
}
function mimeIconForFilename(name,mime=''){
 const n=String(name||'').toLowerCase();
 const mt=String(mime||'').toLowerCase().split(';')[0].trim();
 if(/\.(mp3|wav|m4a|aac|ogg|flac|mp4|mov|avi|webm|mkv)$/.test(n))return 'ic_attach_audio.png';
 if(/\.(txt|csv|rtf)$/.test(n))return 'ic_attach_text.png';
 if(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(n))return 'ic_attach_image.png';
 if(/\.pdf$/.test(n)||mt==='application/pdf')return 'ic_attach_app_pdf.png';
 if(/\.(ppt|pptx|odp)$/.test(n)||mt.includes('presentation')||mt.includes('powerpoint'))return 'ic_attach_app_ppt.png';
 if(/\.(xls|xlsx|ods)$/.test(n)||mt.includes('spreadsheet')||mt.includes('excel'))return 'ic_attach_app_excel.png';
 if(/\.(doc|docx|odt)$/.test(n)||mt.includes('word')||mt.includes('msword')||mt.includes('officedocument.word'))return 'ic_attach_app_word.png';
 if(/\.(zip|rar|7z|tar|gz)$/.test(n))return 'ic_attach_app_zip.png';
 return 'attachment_document_icon.png';
}

function extensionFromMime(mime){const m=String(mime||'').toLowerCase().split(';')[0].trim();const map={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','video/mp4':'mp4','video/webm':'webm','application/pdf':'pdf','application/zip':'zip','application/x-zip-compressed':'zip','application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.ms-powerpoint':'ppt','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx','text/plain':'txt','text/csv':'csv'};return map[m]||'';}
function extensionFromUrl(url){try{const p=new URL(String(url),location.href).pathname.split('/').pop()||'';const m=p.match(/\.([A-Za-z0-9]{1,8})$/);return m?m[1]:''}catch{return''}}
async function loadFolder(course,folderId,push=true,title='Materials'){
  const el=document.getElementById('sectionProfileContent');if(!el)return;
  const sid=course.id||course.section_id||course.sectionId;
  if(push && Number(folderId||0)!==0 && Number(folderId||0)!==Number(state.currentFolderId||0)){
    state.folderStack.push({id:state.currentFolderId||0,title:(Number(state.currentFolderId||0)===0?'Materials':(state.currentFolderTitle||'Materials'))});
  }
  state.currentFolderId=folderId||0;
  state.courseTab='materials';
  syncToolbar();
  const previousTitle=title||'Materials';
  state.currentFolderTitle=previousTitle;
  const backFolderTitle=state.folderStack[state.folderStack.length-1]?.title||'Materials';
  el.innerHTML=`${folderId?`<button class="materialBackRow" id="materialBack"><span class="materialIcon">${officialBackIcon()}</span><span><b>Back to ${esc(backFolderTitle)}</b></span></button>`:''}<div class="folderLoadingState"><img src="../assets/android_loading_spinner_72.gif" alt=""><b>Loading ${esc(previousTitle)}…</b><small>Schoology is loading this folder.</small></div>`;
  el.querySelector('#materialBack')?.addEventListener('click',e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;navigateBack()});
  try{ const x=await A.api({path:`courses/${sid}/folder/${folderId||0}`,params:{}});
  const items=x['folder-item']||x.folder_item||x.folderItems||x.items||[];
  const parent=folderId?`<button class="materialBackRow" id="materialBack"><span class="materialIcon">${officialBackIcon()}</span><span><b>Back to ${esc(backFolderTitle)}</b></span></button>`:'';
  const rows=items.map((f,i)=>{
    const type=String(f.type||'');
    const icon=materialIconForType(f);
    const rawDescription=f.description||f.folder_description||f.folderDescription||(String(f.type||'').toLowerCase()==='folder'?f.body:'')||'';
    const description=materialDescriptionText(rawDescription);
    return `<button class="materialRow" data-material-index="${i}"><span class="materialIcon officialMaterialIcon"><img src="../assets/icons/${icon}" alt=""></span><span class="materialRowText"><b>${esc(f.title||'Untitled')}</b>${description?`<small>${esc(description)}</small>`:''}</span><span>›</span></button>`;
  }).join('');
  el.innerHTML=parent+(items.length?`<div class="materialList">${rows}</div>`:'<div class="empty"><h2>This folder is empty</h2></div>');
  window.__schoologyFolderItems=items;
  document.getElementById('materialBack')?.addEventListener('click',e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;navigateBack()});
  document.querySelectorAll('[data-material-index]').forEach(b=>b.onclick=async()=>{
    const f=window.__schoologyFolderItems[+b.dataset.materialIndex];
    if(String(f.type)==='folder'){if(b.disabled)return;b.disabled=true;loadFolder(course,f.id,true,f.title||'Folder').catch(e=>showSchoologyRequestError(e,()=>loadFolder(course,f.id,false,f.title||'Folder')));return}
    if(String(f.type)==='assignment'){showAssignment(sid,f.id);return}
    const directDocType=String(f.document_type||f.documentType||'').toLowerCase();
    const target=f.web_url||f.webUrl||f.url||f.href||f.launch_url||f.launchUrl||f.location;
    // Android FolderItem maps link/video documents to ACTION_VIEW, while embed
    // and external_tool documents use their dedicated WebView activities.
    if(directDocType==='link'||directDocType==='video'||String(f.type).toLowerCase()==='link'){
      try{const d=await A.api({path:`sections/${sid}/documents/${f.id}`,params:{}});const data=d?.document||d;const aa=data?.attachments||data?.attachment||{};const ll=aa?.links?.link||aa?.links||aa?.link||[];const link=Array.isArray(ll)?ll[0]:ll;const vv=aa?.videos?.video||aa?.videos||[];const video=Array.isArray(vv)?vv[0]:vv;const u=link?.url||link?.link_url||link?.linkURL||link?.href||video?.url||video?.video_url||data?.web_url||data?.webUrl;if(u){await A.prepareWebSession();showEmbeddedWeb(u,data?.title||f.title||'Link');return}}catch(e){console.warn('Unable to resolve course-material link:',e)}
      if(target && !/api\.schoology\.com\/v1\/sections\/\d+\/documents\/\d+/i.test(target)){await A.prepareWebSession();showEmbeddedWeb(target,f.title||'Link');return}alert('Schoology did not provide a valid destination URL for this link.');return;
    }
    if(directDocType==='embed'||directDocType==='external_tool'||String(f.type).toLowerCase()==='external_tool'||String(f.type).toLowerCase()==='embed'){
      if(target){await A.prepareWebSession();showEmbeddedWeb(target,f.title||'Resource');return}
    }
    if(['assessment','assessment_v2','managed_assessment','quiz'].includes(String(f.type))){(async()=>{try{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${f.id}`,f.title||'Assessment')}catch(e){alert(e.message)}})();return}
    (async()=>{try{
      let data=f; let fileUrl=f.download_path||f.downloadPath||f.converted_download_path||f.convertedDownloadPath||f.file_url||f.fileUrl||f.download_url||f.downloadUrl||f.location||f.url; if(!fileUrl){const aa=f.attachments||f.attachment||{};const ff=aa.files?.file||aa.files||aa.file||[];const af=Array.isArray(ff)?ff[0]:ff;fileUrl=af?.converted_download_path||af?.convertedDownloadPath||af?.download_path||af?.downloadPath||af?.resolveDownloadUrl||af?.url||'';if(af)data={...f,...af};}
      if(String(f.type)==='document'){
        const d=await A.api({path:`sections/${sid}/documents/${f.id}`,params:{}});
        data=d?.document||d;
        const tmpl=data.template||data.document||{};
        const docType=String(data.document_type||data.documentType||f.document_type||f.documentType||data.template_document_type||data.templateDocumentType||tmpl.document_type||tmpl.documentType||'').toLowerCase();
        const links=data.attachments?.links?.link||data.attachments?.links||data.attachment?.links?.link||data.attachment?.links||[];
        const linkObj=Array.isArray(links)?links[0]:links;
        const linkUrl=data.web_url||data.webUrl||data.url||data.href||f.web_url||f.webUrl||f.url||f.href||linkObj?.link_url||linkObj?.linkURL||tmpl.url||tmpl.web_url||tmpl.webUrl||tmpl.href||'';
        const documentTarget=linkUrl||data.location||data.launch_url||data.launchUrl;
        if(docType==='link'||docType==='video'){
          if(documentTarget && !/api\.schoology\.com\/v1\/sections\/\d+\/documents\/\d+/i.test(documentTarget)){await A.prepareWebSession();showEmbeddedWeb(documentTarget,data.title||f.title||'Link');return}
          const aa2=data?.attachments||data?.attachment||{};const ll2=aa2?.links?.link||aa2?.links||aa2?.link||[];const link2=Array.isArray(ll2)?ll2[0]:ll2;const u2=link2?.url||link2?.link_url||link2?.linkURL||link2?.href;if(u2){await A.prepareWebSession();showEmbeddedWeb(u2,data.title||f.title||'Link');return}
        }
        if(docType==='external_tool'||docType==='embed'){
          if(documentTarget){await A.prepareWebSession();showEmbeddedWeb(documentTarget,data.title||f.title||'Resource');return}
        }
        const a=data.attachments||data.attachment||{}; const files=a.files?.file||a.files||a.file||[]; const first=Array.isArray(files)?files[0]:files; fileUrl=first?.converted_download_path||first?.convertedDownloadPath||first?.download_path||first?.downloadPath||first?.url||fileUrl;
      }
      if(!fileUrl){ if(data.web_url||data.webUrl){await A.prepareWebSession();showEmbeddedWeb(data.web_url||data.webUrl,data.title||f.title||'Document');return} throw new Error('Schoology did not provide a downloadable file URL.'); }
      const rawName=data.filename||data.fileName||data.title||f.title||'Schoology file'; const mime=data.filemime||data.fileMIME||data.converted_filemime||data.convertedFileMime||f.filemime||f.fileMIME||'application/octet-stream'; const ext=data.file_extension||data.fileExtension||data.extension||data.converted_extension||data.convertedExtension||f.file_extension||f.fileExtension||f.extension||f.converted_extension||f.convertedExtension||extensionFromUrl(fileUrl)||extensionFromMime(mime); const filename=/\.[A-Za-z0-9]{1,8}$/.test(rawName)?rawName:(ext?rawName+'.'+String(ext).replace(/^\./,''):rawName); const r=await downloadWithFeedback(b,{url:fileUrl,filename,mime});const err=await A.openDownloadedFile({path:r.path});if(typeof err==='string'&&err)alert(err)
    }catch(e){alert('Unable to open file: '+e.message)}})();return
  });
  }catch(e){showSchoologyRequestError(e,()=>loadFolder(course,folderId,false,title));}
}

function showSchoologyRequestError(error,retry){
 const msg=String(error?.message||error||'Schoology could not load this page.');document.getElementById('schoologyNetworkError')?.remove();
 const isTimeout=/timed out|timeout|network|ECONN|ENOTFOUND|ERR_/i.test(msg);
 const wrap=document.createElement('div');wrap.id='schoologyNetworkError';wrap.className='schoologyErrorOverlay';wrap.innerHTML=`<div class="schoologyErrorDialog" role="dialog" aria-modal="true"><button class="schoologyErrorClose" aria-label="Close">×</button><div class="schoologyErrorSpinner"><img src="../assets/android_loading_spinner_72.gif" alt=""></div><h2>${isTimeout?'Schoology is taking longer than expected':'Schoology could not load this page'}</h2><p>${isTimeout?'The connection is slow or temporarily unavailable. Your course is still open.':esc(msg)}</p><div class="schoologyErrorActions"><button id="schoologyErrorRetry" class="androidPrimary">Retry</button><button id="schoologyErrorClose2" class="androidSecondary">Back</button></div></div>`;
 document.body.appendChild(wrap);const close=()=>{state.assignmentSubpage=null;wrap.remove();syncToolbar()};wrap.querySelector('.schoologyErrorClose')?.addEventListener('click',close);wrap.querySelector('#schoologyErrorClose2')?.addEventListener('click',close);wrap.querySelector('#schoologyErrorRetry')?.addEventListener('click',async()=>{close();if(retry){try{await retry()}catch(e){showSchoologyRequestError(e,retry)}}});
}
window.schoologyShowError=showSchoologyRequestError;

function openWithPressTransition(el,fn){if(!el){fn();return;}el.classList.add('pressTransition');setTimeout(()=>{el.classList.remove('pressTransition');fn()},110)}
async function resolveAssignmentSection(assignmentId){
 const id=Number(assignmentId); if(!id)return 0;
 const cached=window.__schoologyDashboardCourses||window.__schoologyCourses||[];
 const candidates=cached.length?cached.slice():[];
 if(!candidates.length){
   const uid=state.auth?.userId||state.auth?.user?.id;
   if(uid){try{const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});candidates.push(...(x.section||x.sections||[]));}catch{}}
 }
 const ids=[...new Set(candidates.map(x=>Number(x.id||x.section_id||x.sectionId)).filter(Boolean))];
 for(const sid of ids){
   try{const x=await A.api({path:`sections/${sid}/assignments/${id}`,params:{richtext:1,with_attachments:'TRUE'}});if(x&&(x.assignment||x.id||x.assignment_id))return sid}catch{}
 }
 return 0;
}
function isSchoologyRoutableLink(rawUrl){
 try{const u=new URL(rawUrl);const host=u.hostname.toLowerCase();if(u.protocol.toLowerCase()==='schoology:')return true;return state.openSchoologyLinks===true&&(host==='lms.lausd.net'||host==='schoology.com'||host.endsWith('.schoology.com')||host==='schoologyca.com'||host.endsWith('.schoologyca.com'))}catch{return false}
}
async function downloadMaterialWithProgress(info){
 const progressId='material-dl-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const dialog=showAppDialog('Downloading file','Preparing download…',[]);
 const message=dialog?.querySelector('.appDialogMessage');
 if(message)message.innerHTML='<div class="materialDownloadProgress"><img src="../assets/android_loading_spinner_72.gif" alt=""><div class="materialDownloadProgressText">Downloading file…</div><div class="materialDownloadProgressTrack"><div class="materialDownloadProgressBar" style="width:0%"></div></div></div>';
 const text=dialog?.querySelector('.materialDownloadProgressText'),bar=dialog?.querySelector('.materialDownloadProgressBar');
 const stop=A.onFileDownloadProgress?.(data=>{if(!data||data.id!==progressId)return;if(data.total>0){const percent=Math.min(100,Math.round(data.received*100/data.total));if(text)text.textContent='Downloading… '+percent+'%';if(bar)bar.style.width=percent+'%';}else if(text)text.textContent='Downloading file…';});
 try{const result=await A.downloadFile({...info,progressId});if(text)text.textContent='Download complete. Opening file…';if(bar)bar.style.width='100%';dialog?.classList.remove('open');return result}
 catch(error){dialog?.classList.remove('open');throw error}finally{stop?.()}
}
async function routeSchoologyLink(rawUrl){
 let u;try{u=new URL(rawUrl)}catch{return false}
 const scheme=u.protocol.toLowerCase()==='schoology:';
 let host=u.hostname.toLowerCase(), path=u.pathname.replace(/\/+$/,'');
 // URL parses schoology://course/123 as hostname=course, pathname=/123.
 if(scheme)path=`/${host}${path}`;
 const webHost=u.hostname.toLowerCase();
 const isSchoolHost=webHost==='lms.lausd.net'||webHost==='schoology.com'||webHost.endsWith('.schoology.com');
 if(!scheme&&(!state.openSchoologyLinks||!isSchoolHost))return false;
 // Android's ExternalLinkHandler launches schoology://link?url=... in the
 // system browser; external-document similarly tries its primary URI then its fallback.
 if(scheme&&host==='link'){
   const target=u.searchParams.get('url')||'';let destination;try{destination=new URL(target)}catch{return true}
   if(!['http:','https:'].includes(destination.protocol))return true;
   if(state.openSchoologyLinks&&isSchoologyRoutableLink(destination.toString())){try{if(await routeSchoologyLink(destination.toString()))return true;await A.prepareWebSession();await showEmbeddedWeb(destination.toString(),'Schoology Link',{openInitialExternalInBrowser:false});return true}catch(e){showAppDialog('Unable to open Schoology link',e.message||String(e));return true}}
   try{await A.openExternal(destination.toString())}catch(e){showAppDialog('Unable to open external link',e.message||String(e))}return true;
 }
 if(scheme&&host==='external-document'){
   const primary=u.searchParams.get('uri')||'',fallback=u.searchParams.get('fallback-url')||'';
   for(const candidate of [primary,fallback]){if(!candidate)continue;try{await A.openExternal(candidate);return true}catch{}}
   showAppDialog('Unable to open document','Neither the document link nor its fallback could be opened.');return true;
 }
 if(scheme&&host==='lti-assignment'){
   const message=u.searchParams.get('error-message');showAppDialog('Unable to open LTI assignment',message||'Schoology could not open this LTI assignment.');return true;
 }
 // Native destinations for Schoology web URLs (both LAUSD LMS and app.schoology.com).
 const mCourseDestination=path.match(/^\/course(?:s)?\/(\d+)\/(student_grades|updates)\/?$/i);
 if(mCourseDestination){const sid=Number(mCourseDestination[1]),destination=mCourseDestination[2].toLowerCase()==='student_grades'?'grades':'updates';try{const response=await A.api({path:'sections/'+sid,params:{}});const course=response?.section||response||{id:sid};if(!course.id&&!course.section_id)course.id=sid;state.screen='app';state.tab='courses';state.currentGroup=null;state.profileUser=null;state.message=null;state.embeddedTitle=null;state.assignmentView=null;state.selectedCourse=course;render();await showCourse(course,destination);return true}catch(e){showSchoologyRequestError(e);return true}}
 const mProfileDestination=path.match(/^\/(?:user|users|profile|profiles)\/(?:view\/)?(\d+)(?:\/.*)?$/i);
 if(mProfileDestination){openProfileById(Number(mProfileDestination[1]),'Profile');return true}
 if(/^\/people\/?$/i.test(path)){if(!state.peopleEnabled){showAppDialog('People','The Schoology people directory is not available for this account.');return true}state.screen='app';state.tab='people';state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.message=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='People';render();loadTab();return true}
 if(/^\/settings\/account\/?$/i.test(path)){state.screen='app';state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.message=null;state.assignmentView=null;state.embeddedReturn={tab:'settings',title:'Settings'};render();await A.prepareWebSession();showEmbeddedWeb('https://'+webHost+'/settings/account','Account Info',{allowBrowser:false,accountInfo:true});return true}
 if(/^\/messages\/sent\/?$/i.test(path)||/^\/messages\/?$/i.test(path)){state.screen='app';state.tab='messages';state.message=null;state.messageThread=null;state.messageFolder='inbox';state.messageTab=/^\/messages\/sent\/?$/i.test(path)?'sent':'inbox';state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Messages';render();loadTab();return true}
 const mMessageView=path.match(/^\/messages\/view\/(\d+)\/?$/i);
 if(mMessageView){state.screen='app';state.tab='messages';state.message={id:Number(mMessageView[1])};state.messageFolder='view';state.messageThread=null;state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Messages';render();await loadMessageThread(state.message);return true}
 if(/^\/home\/course-dashboard(?:\/.*)?$/i.test(path)){state.screen='app';state.tab='home';state.homeTab='dashboard';state.courseDashboardEnabled=true;state.homeUpcomingReturn=false;state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.message=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Home';render();loadTab();return true}
 if(/^\/home\/recent-activity\/?$/i.test(path)){state.screen='app';state.tab='home';state.homeTab='recent';state.homeUpcomingReturn=false;state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.message=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Home';render();loadTab();return true}
 if(/^\/grades\/grades\/?$/i.test(path)){state.screen='app';state.tab='grades';state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;state.message=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Grades';render();loadTab();return true}
 const mSectionAssignment=path.match(/^\/(?:section|sections)\/(\d+)\/assignments?\/(\d+)(?:\/.*)?$/i);
 if(mSectionAssignment){showAssignment(Number(mSectionAssignment[1]),Number(mSectionAssignment[2]));return true}
 const mSectionAssessment=path.match(/^\/(?:section|sections)\/(\d+)\/assessments?\/(\d+)(?:\/.*)?$/i);
 if(mSectionAssessment){await A.prepareWebSession();showEmbeddedWeb('https://app.schoology.com/assignment/'+Number(mSectionAssessment[2]),'Assessment',{allowBrowser:false,quiz:true,assessment:true});return true}
 const mSectionDiscussion=path.match(/^\/(?:section|sections)\/(\d+)\/discussions?\/(\d+)(?:\/.*)?$/i);
 if(mSectionDiscussion){await showDiscussionNative('sections',Number(mSectionDiscussion[1]),Number(mSectionDiscussion[2]),'Discussion');return true}
 const mGroupDiscussion=path.match(/^\/groups?\/(\d+)\/discussions?\/(\d+)(?:\/.*)?$/i);
 if(mGroupDiscussion){await showDiscussionNative('groups',Number(mGroupDiscussion[1]),Number(mGroupDiscussion[2]),'Discussion');return true}
 const mSectionEvent=path.match(/^\/(?:section|sections)\/(\d+)\/events?\/(\d+)(?:\/.*)?$/i);
 if(mSectionEvent){showEventNative('sections',Number(mSectionEvent[1]),Number(mSectionEvent[2]),'Event');return true}
 const mGroupEvent=path.match(/^\/groups?\/(\d+)\/events?\/(\d+)(?:\/.*)?$/i);
 if(mGroupEvent){showEventNative('groups',Number(mGroupEvent[1]),Number(mGroupEvent[2]),'Event');return true}
 const mSectionPage=path.match(/^\/(?:section|sections)\/(\d+)\/pages?\/(\d+)(?:\/.*)?$/i);
 if(mSectionPage){showPageNative('sections',Number(mSectionPage[1]),Number(mSectionPage[2]),'Page');return true}
 const mCourseApp=path.match(/^\/(?:section|sections)\/(\d+)\/(?:applications|application)\/(\d+)$/i);
 if(mCourseApp){const sectionId=Number(mCourseApp[1]),appId=Number(mCourseApp[2]);try{const result=await A.launchCourseApp({sectionId,appId});const launch=result?.url||result?.launchTokenUrl||result?.launch_token_url||result?.data?.url||result?.data?.launchTokenUrl;if(!launch)throw new Error('Schoology did not return a course-app launch URL.');const error=await A.openExternal(launch);if(error)throw new Error(error)}catch(e){showAppDialog('Unable to open course app',e.message||String(e))}return true}
 const mSpecialTool=path.match(/^\/(?:course|courses|section|sections)\/(\d+)\/(external-tool|lti|scorm)\/(\d+)$/i);
 if(mSpecialTool){const sectionId=Number(mSpecialTool[1]),toolType=mSpecialTool[2].toLowerCase(),toolId=Number(mSpecialTool[3]);await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/section/${sectionId}/${toolType==='external-tool'?'external-tool':toolType}/${toolId}`,toolType==='scorm'?'SCORM':toolType==='lti'?'LTI Assignment':'Course App',{allowBrowser:false,lti:toolType==='lti'||toolType==='external-tool'});return true}
 const mParentAssignment=path.match(/^\/parents?\/\d+\/sections?\/(\d+)\/assignments?\/(\d+)(?:\/.*)?$/i);
 if(mParentAssignment){showAssignment(Number(mParentAssignment[1]),Number(mParentAssignment[2]));return true}
 const mCourseAssessment=path.match(/^\/course(?:s)?\/(\d+)\/assessments?\/(\d+)(?:\/.*)?$/i);
 if(mCourseAssessment){const assessmentId=Number(mCourseAssessment[2]);await A.prepareWebSession();showEmbeddedWeb('https://app.schoology.com/assignment/'+assessmentId,'Assessment',{allowBrowser:false,quiz:true,assessment:true});return true}
 const mSchool=path.match(/^\/schools?\/(\d+)(?:\/.*)?$/i);
 if(mSchool){await openSchoolProfile(Number(mSchool[1]),'School');return true}
 const mCourse=path.match(/^\/course(?:s)?\/(\d+)(?:\/materials(?:\/gp\/(\d+))?)?$/i);
 const mSection=path.match(/^\/section(?:s)?\/(\d+)$/i);
 const mAssignment=path.match(/^\/(?:assignment|assignments)\/(\d+)(?:\/info)?$/i);
 const mCourseAssignment=path.match(/^\/course(?:s)?\/(\d+)\/(?:assignment|assignments)\/(\d+)(?:\/info)?$/i);
 if(/^\/home$/i.test(path)){state.homeUpcomingReturn=false;state.tab='home';state.courseView=null;state.currentGroup=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Home';render();loadTab();return true}
 const mResources=path.match(/^\/resources(?:\/.*)?$/i);if(mResources){state.homeUpcomingReturn=false;state.courseView=null;state.currentGroup=null;state.assignmentView=null;state.embeddedTitle=null;state.tab='resources';state.toolbarTitle='Resources';render();loadTab();return true}
 const mGroup=path.match(/^\/groups?\/(\d+)(?:\/.*)?$/i);if(mGroup){const gid=Number(mGroup[1]);let group={id:gid,name:'Group'};try{const gx=await A.api({path:`groups/${gid}`,params:{}});group=gx?.group||gx||group;}catch{}state.tab='groups';state.currentGroup=group;state.toolbarTitle=group.name||group.title||'Group';render();await showGroup(group,'updates');return true}
 if(mCourse||mSection){const sid=Number((mCourse||mSection)[1]);const gp=(mCourse&&mCourse[2])?Number(mCourse[2]):0;try{const x=await A.api({path:`sections/${sid}`,params:{}});const course=x?.section||x;state.embeddedTitle=null;await showCourse(course,'materials');if(gp){let openedFile=false;try{const dx=await A.api({path:`sections/${sid}/documents/${gp}`,params:{}});const d=dx?.document||dx;const aa=d?.attachments||d?.attachment||{};const files=aa?.files?.file||aa?.files||aa?.file||[];const f=Array.isArray(files)?files[0]:files;const docType=String(d?.document_type||d?.documentType||d?.template_document_type||d?.templateDocumentType||'').toLowerCase();const parentFolder=Number(d?.folder_id??d?.folderId??d?.collection_folder_id??d?.collectionFolderId??d?.parent_folder_id??d?.parentFolderId??0);if(parentFolder)await loadFolder(course,parentFolder,true,'Folder');const fileUrl=f?.resolveDownloadUrl||f?.resolve_download_url||f?.converted_download_path||f?.convertedDownloadPath||f?.download_path||f?.downloadPath||f?.url||'';if(docType==='file'||fileUrl){const url=fileUrl||d?.download_path||d?.downloadPath||d?.url||'';if(url){const r=await downloadMaterialWithProgress({url,filename:f?.filename||f?.fileName||d?.title||'Schoology file',mime:f?.filemime||f?.fileMIME||'application/octet-stream'});const err=await A.openDownloadedFile({path:r.path});if(err)throw new Error(err);openedFile=true;}}}catch(e){console.warn('Unable to resolve deep-linked course material as a document:',e)}if(!openedFile){try{const pending=[0],visited=new Set();let item=null;while(pending.length&&visited.size<100&&!item){const folderId=pending.shift();if(visited.has(String(folderId)))continue;visited.add(String(folderId));const fx=await A.api({path:`courses/${sid}/folder/${folderId}`,params:{}});const items=fx?.['folder-item']||fx?.folder_item||fx?.folderItems||fx?.items||[];item=items.find(v=>String(v.id||v.document_id||v.documentId||'')===String(gp)&&String(v.type||'').toLowerCase()!=='folder')||null;for(const v of items){if(String(v.type||'').toLowerCase()==='folder'&&v.id!=null&&!visited.has(String(v.id)))pending.push(Number(v.id));}}if(item){let detail={};try{const dx=await A.api({path:`sections/${sid}/documents/${gp}`,params:{}});detail=dx?.document||dx||{}}catch{}const merged={...item,...detail};if(!merged.template_type&&!merged.templateType&&!merged.type)merged.type='document';if(!merged.document_type&&!merged.documentType&&!merged.template_document_type&&!merged.templateDocumentType&&(item.type==='file'||item.type==='document'))merged.document_type='file';const attachment=firstAttachment(merged,'files')||{};const materialUrl=attachment.resolveDownloadUrl||attachment.resolve_download_url||attachment.converted_download_path||attachment.convertedDownloadPath||attachment.download_path||attachment.downloadPath||attachment.file_download_url||attachment.fileDownloadURL||merged.resolveDownloadUrl||merged.download_path||merged.downloadPath||merged.converted_download_path||merged.convertedDownloadPath||merged.file_url||merged.fileUrl||merged.url||'';if(resourceDocumentType(merged)==='file'||materialUrl){if(!materialUrl)throw new Error('Schoology did not provide a file URL.');const result=await downloadMaterialWithProgress({url:materialUrl,filename:attachment.filename||attachment.fileName||merged.filename||merged.fileName||merged.title||'Schoology file',mime:attachment.filemime||attachment.fileMIME||merged.filemime||merged.fileMIME||'application/octet-stream'});const error=await A.openDownloadedFile({path:result.path});if(error)throw new Error(error);openedFile=true;}else{await openCollectionResource(merged,null);openedFile=true;}}}catch(e){console.warn('Unable to resolve deep-linked material through the official course folder API:',e)}if(!openedFile)await loadFolder(course,gp,true,'Folder');}}return true}catch(e){showSchoologyRequestError(e);return true}}
 if(mCourseAssignment){const sid=Number(mCourseAssignment[1]),aid=Number(mCourseAssignment[2]);showAssignment(sid,aid);return true}
 if(mAssignment){const aid=Number(mAssignment[1]);const sid=await resolveAssignmentSection(aid);if(sid){showAssignment(sid,aid);return true}await A.prepareWebSession();showEmbeddedWeb(rawUrl,'Assignment');return true}
 const mQuiz=path.match(/^\/(?:quiz|quizzes|assessment|assessments|assessment_v2|managed_assessment)(?:\/view)?\/(\d+)$/i);if(mQuiz){await A.prepareWebSession();showEmbeddedWeb(scheme?`https://app.schoology.com/${path.replace(/^\//,'')}`:rawUrl,'Quiz',{allowBrowser:false});return true}
 const mMaterials=path.match(/^\/(?:course|section)\/(?:s)?(\d+)\/materials(?:\/(?:folder|gp)\/(\d+))?$/i);if(mMaterials){try{const x=await A.api({path:`sections/${Number(mMaterials[1])}`,params:{}});const course=x?.section||x;showCourse(course,'materials');if(mMaterials[2])await loadFolder(course,Number(mMaterials[2]),true,'Folder');return true}catch(e){showSchoologyRequestError(e);return true}}
 const mDocument=path.match(/^\/(?:course|section)\/(?:s)?(\d+)\/documents\/(\d+)$/i);if(mDocument){try{const x=await A.api({path:`sections/${Number(mDocument[1])}/documents/${Number(mDocument[2])}`,params:{}});const d=x?.document||x;const type=String(d?.type||d?.document_type||'').toLowerCase();const url=d?.web_url||d?.webUrl||d?.url||d?.link_url||d?.linkURL;if(url||['link','web_content','external_tool','embed','video'].includes(type)){await A.prepareWebSession();showEmbeddedWeb(url||rawUrl,d?.title||'Resource');return true}showCourse(x?.section||{id:Number(mDocument[1])},'materials');return true}catch(e){showSchoologyRequestError(e);return true}}
 if(scheme){await A.prepareWebSession().catch(()=>{});showEmbeddedWeb(`https://app.schoology.com${path}${u.search}`,'Schoology Link');return true;}
 return false;
}
async function showPageNative(realm,realmId,pageId,title='Page'){
 const c=document.getElementById('content');if(!c)return;state.assignmentView=null;state.embeddedTitle=null;state.embeddedTheme='';state.embeddedCanOpenExternal=false;state.toolbarTitle=title||'Page';syncToolbar();
 c.innerHTML='<section class="pageAndroid"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading page…</span></div></section>';
 try{const x=await A.api({path:`${realm}/${realmId}/pages/${pageId}`,params:{}});const page=x?.page||x;const body=page?.body||page?.description||page?.content||'';const pageTitle=page?.title||title||'Page';c.innerHTML=`<section class="pageAndroid"><div class="pageAndroidHeader"><h1>${esc(pageTitle)}</h1></div><div class="pageAndroidBody">${body||'<span class="muted">No page content.</span>'}</div></section>`;c.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',async ev=>{const href=a.href||a.getAttribute('href')||'';if(/^https?:\/\//i.test(href)){ev.preventDefault();ev.stopPropagation();try{if(await routeSchoologyLink(href))return;const result=await A.openExternal(href);if(typeof result==='string'&&result)showAppDialog('Unable to open link',result)}catch(error){showAppDialog('Unable to open link',error.message||String(error))}}}));}catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`;}
}
async function showEmbeddedWeb(url,title,options={}){
 const c=document.getElementById('content');if(!c)return;
 if(state.canadianInstance)url=String(url||'').replace(/app\.schoology\.com/gi,'app.schoologyca.com').replace(/api\.schoology\.com/gi,'api.schoologyca.com');
 const externalLinks=typeof options.externalLinks==='boolean'?options.externalLinks:!(options.quiz||options.assessment||options.accountInfo);
 // Ordinary external destinations should open in the user's browser, not turn
 // the shared webview into a general-purpose browser. Quiz and Account Info are
 // intentionally the only regular pages that keep their navigation embedded.
 if(!options.quiz&&!options.assessment&&!options.accountInfo&&options.openInitialExternalInBrowser!==false){
   try{const initial=new URL(String(url||''));const h=initial.hostname.toLowerCase();const schoolHost=h==='lms.lausd.net'||h==='schoology.com'||h.endsWith('.schoology.com')||h==='schoologyca.com'||h.endsWith('.schoologyca.com');if(['http:','https:'].includes(initial.protocol)&&!schoolHost){const handled=await routeSchoologyLink(initial.href);if(handled)return;const result=await A.openExternal(initial.href);if(typeof result==='string'&&result)showAppDialog('Unable to open link',result);return;}}catch(error){if(error instanceof TypeError){/* Relative or non-HTTP destinations continue into the webview. */}else{showAppDialog('Unable to open link',error.message||String(error));return;}}
 }
 if(options.routeSchoology!==false){try{const u=new URL(String(url||''));if((u.hostname.toLowerCase()==='lms.lausd.net'||u.hostname.toLowerCase().endsWith('.schoology.com')||u.hostname.toLowerCase()==='schoologyca.com'||u.hostname.toLowerCase().endsWith('.schoologyca.com'))&&/^\/course(?:s)?\/\d+\/materials\/gp\/\d+\/?$/i.test(u.pathname)){if(await routeSchoologyLink(u.href))return;}}catch{}}
 try{await A.prepareWebSession()}catch(e){console.warn('Schoology web session preparation failed:',e)}
 c.classList.remove('webContentHost');c.classList.add('embeddedContentActive');state.toolbarTitle=title||'Schoology';state.embeddedTitle=title||'Schoology';state.embeddedCanOpenExternal=options.allowBrowser!==false;state.embeddedTheme=options.accountInfo?'account':(options.lti?'lti':(options.quiz?'quiz':''));syncToolbar();
 const embeddedTag=window.__TAURI__?'schoology-webview':'webview';c.innerHTML=`<section class="embeddedPage"><div id="embeddedWebviewLoading" class="webviewLoading"><img src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div><${embeddedTag} id="schoologyWebview" src="${esc(String(url||''))}" preload="${esc(String(A.webviewPreloadUrl||''))}" data-lti="${options.lti===true}" allowpopups></${embeddedTag}></section>`;
 const w=document.getElementById('schoologyWebview');if(!w)return;const spinner=document.getElementById('embeddedWebviewLoading');const setLoading=v=>spinner?.classList.toggle('hidden',!v);let mainNavigation=0;let loadingStartedAt=0;let initialPageLoaded=false;setLoading(true);
 w.addEventListener('did-start-navigation',e=>{if(!e.isMainFrame)return;mainNavigation++;loadingStartedAt=Date.now();setLoading(true);});
 w.addEventListener('dom-ready',()=>{if(!window.__TAURI__&&mainNavigation>0)setLoading(false)});
 w.addEventListener('did-finish-load',()=>{if(mainNavigation>0){setLoading(false);initialPageLoaded=true}});

 w.addEventListener('did-navigate',e=>{if(e.isMainFrame){loadingStartedAt=Date.now();setTimeout(()=>{if(spinner&&!spinner.classList.contains('hidden'))setLoading(false)},1200);}});
 w.addEventListener('did-fail-load',e=>{if(e.isMainFrame){setLoading(false);if(e.errorCode&&e.errorCode!==-3)console.warn('Schoology embedded page failed:',e.errorDescription)}});
 setTimeout(()=>{if(spinner&&!spinner.classList.contains('hidden')&&mainNavigation>0)setLoading(false)},8000);
 w.addEventListener('new-window',async e=>{e.preventDefault();if(await routeSchoologyLink(e.url))return;if(externalLinks){try{const result=await A.openExternal(e.url);if(typeof result==='string'&&result)showAppDialog('Unable to open link',result)}catch(err){showAppDialog('Unable to open link',err.message||String(err))}return;}try{w.src=e.url}catch{}});
 w.addEventListener('will-navigate',e=>{const u=String(e.url||'');if(externalLinks&&initialPageLoaded&&!isSchoologyRoutableLink(u)){e.preventDefault();Promise.resolve(A.openExternal(u)).catch(err=>showAppDialog('Unable to open link',err.message||String(err)));return;}if(options.lti&&isSchoologyRoutableLink(u)){e.preventDefault();Promise.resolve(routeSchoologyLink(u)).catch(err=>console.warn('Schoology deep link failed:',err));}});
}
async function loadAttendanceTab(course){
  const el=document.getElementById('sectionProfileContent');if(!el)return;
  const sid=course.id||course.section_id||course.sectionId;
  try{
    const x=await A.api({path:`sections/${sid}/attendance`,params:{start:0,limit:100}});
    const arr=x.attendance||x.records||x.record||[];
    el.innerHTML=arr.length?`<div class="attendanceList">${arr.map(r=>`<div class="attendanceRow"><b>${esc(r.date||r.created||'')}</b><span>${esc(r.status||r.type||r.label||'')}</span></div>`).join('')}</div>`:'<div class="empty"><h2>No attendance records</h2></div>';
  }catch(e){
    el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`;
  }
}

async function loadCourseApps(course,targetEl){
  const el=targetEl||document.getElementById('sectionProfileContent');if(!el)return;
  const sid=course.id||course.section_id||course.sectionId;
  const x=await A.api({path:`v2/sections/${sid}/applications`,params:{}});
  const apps=x?.['@extra']||x.extra||x.data?.['@extra']||x.data?.extra||[];
  el.innerHTML=apps.length?`<div class="courseAppList">${apps.map((a,i)=>{
    const title=a.title||a.name||'Course App', logo=normalizeImageUrl(a.logoUrl||a.logo_url||a.logo||'');
    return `<button class="courseAppRow" data-app-index="${i}">
      <span class="courseAppIcon">${logo?`<img data-course-image-url="${esc(logo)}" alt="" style="display:none">`:''}<span class="courseAppFallback"><img src="../assets/icons/ic_resourceapps.png" alt=""></span></span>
      <span><b>${esc(title)}</b></span><span>›</span>
    </button>`;
  }).join('')}</div>`:'<div class="empty"><h2>No course apps</h2></div>';
  window.__schoologyCourseApps=apps;
  document.querySelectorAll('[data-app-index]').forEach(b=>b.onclick=async()=>{
    const a=window.__schoologyCourseApps[+b.dataset.appIndex];
    const launch=a?.['@links']?.launch||a?.links?.launch||a?.['@links']?.['launch']||a?.links?.['launch'];
    const href=launch?.['@id']||launch?.id||launch?.href||launch?.url;
    const appId=Number(a?.id??a?.application_id??a?.applicationId??a?.resource_app_id??a?.resourceAppId??a?.app_id??a?.appId);
    if(!href&&(!Number.isSafeInteger(appId)||appId<=0)){el.innerHTML='<div class="error apiError">This course app did not provide a launch target.</div>';return}
    try{
      openWithPressTransition(b,()=>{}); await A.prepareWebSession();
      const launchResult=await A.launchCourseApp({launchUrl:href,appId:Number.isSafeInteger(appId)&&appId>0?appId:undefined,sectionId:Number(sid)});
      const url=launchResult?.url||launchResult?.launchTokenUrl||launchResult?.data?.url||launchResult?.data?.launchTokenUrl||launchResult?.launch_url||launchResult?.launchUrl||href;
      if(!url)throw new Error('Schoology did not return a course-app launch URL.');
      openWithPressTransition(b,async()=>{const result=await A.openExternal(url);if(typeof result==='string'&&result)showAppDialog('Unable to open course app',result)});
    }catch(e){el.innerHTML=`<div class="error apiError"><b>Schoology could not launch this course app.</b><br>${esc(e.message)}</div>`}
  });
  await hydrateCourseImages(el);
}
async function loadCourseUpcomingPane(course){
 const el=document.getElementById('courseUpcomingContent');if(!el)return;
 const sid=course.id||course.section_id||course.sectionId;if(!sid)return;
 const x=await A.api({path:`sections/${sid}/events`,params:{start_date:formatApiDate(new Date()),limit:20}});
 let arr=x.event||x.events||[];
 arr=arr.filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool','event'].includes(String(e.type||'')));
 el.innerHTML=renderUpcoming(arr);
 document.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=async()=>{const e=arr.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const type=String(e.type||'').toLowerCase();const aid=e.assignment_id??e.assignmentId??e.assignment?.id;const esid=e.section_id??e.sectionId??sid;if(type==='assignment'&&aid){openWithPressTransition(b,()=>showAssignment(esid,aid));return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id){openWithPressTransition(b,async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})});return}}if(e.web_url||e.webUrl)openWithPressTransition(b,()=>showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming'));else if(type==='discussion'&&e.id)openWithPressTransition(b,()=>showDiscussionNative('sections',esid,e.id,e.title||'Discussion'));});
}
let courseLayoutMediaQuery=null;
let lastWindowLayout='';
let resizeRefreshTimer=null;
let courseRenderToken=0;
function currentWindowLayout(){return window.matchMedia('(min-width: 801px)').matches?'landscape':'portrait'}
function installCourseLayoutWatcher(){
  const mq=window.matchMedia('(min-width: 801px)');
  const handler=()=>{
    const layout=currentWindowLayout()+'-'+(window.innerWidth>=1000?'wide':'narrow');
    if(layout===lastWindowLayout)return;
    lastWindowLayout=layout;
    clearTimeout(resizeRefreshTimer);
    resizeRefreshTimer=setTimeout(()=>{
      if(state.assignmentView||state.embeddedTitle)return;
      if(state.tab==='courses'&&state.screen==='app'&&state.courseView==='course'&&state.selectedCourse&&document.querySelector('.courseLandscapePage')){showCourse(state.selectedCourse,state.courseTab||'materials',true);return;}
      if(state.tab==='profile'&&state.screen==='app'&&state.profileUser){render();loadTab();}
    },60);
  };
  if(courseLayoutMediaQuery===mq)return;
  courseLayoutMediaQuery?.removeEventListener?.('change',window.__schoologyCourseLayoutChange);
  window.__schoologyCourseLayoutChange=handler;
  mq.addEventListener?.('change',handler);
  lastWindowLayout=currentWindowLayout()+'-'+(window.innerWidth>=1000?'wide':'narrow');
  window.removeEventListener('resize',window.__schoologyResizeRefresh);
  window.__schoologyResizeRefresh=()=>handler();
  window.addEventListener('resize',window.__schoologyResizeRefresh,{passive:true});
  courseLayoutMediaQuery=mq;
}

async function loadCourseUpdates(course,el){
 const sid=course.id||course.section_id||course.sectionId;
 const uid=state.auth?.userId||state.auth?.user?.id;
 if(!sid)throw new Error('Course section ID is missing.');
 let start=0,limit=20,all=[];let authorUsers={};
 let next=true,loading=false;
 const render=async()=>{
   const cards=all.map(u=>{
     const id=u.id||u.update_id||u.updateId;
     const au=authorUsers[Number(u.user_id||u.uid||u.author_id||u.authorId)]||{};
     const author=u.display_name||u.author_name||au.name_display||au.display_name||au.name||'Schoology';
     const avatar=normalizeImageUrl(au.picture_url||au.pictureUrl||au.picture||au.photo_url||u.user_photo||u.photo_url||'');
     const body=u.body||u.message||'';
     const comments=Number(u.num_comments??u.comment_count??u.comments_count??0);
     const likes=Number(u.likes??u.like_count??0);
     const liked=!!(u.user_liked??u.liked??u.is_liked);
     const canDelete=uid&&String(u.uid||u.user_id||u.author_id||'')===String(uid);
     return `<article class="androidActivityCard sectionFullUpdate" data-update-card="${esc(id)}">
       <div class="activityHeader">${avatar?`<img class="activityAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="activityAvatar">${esc(String(author).charAt(0))}</span>`}<button class="activityUser activityAuthorLink" data-course-author-id="${esc(au.id||u.user_id||u.uid||u.author_id||u.authorId||'')}">${esc(author)}</button>${canDelete?`<button class="updateDeleteButton" data-update-delete="${esc(id)}" aria-label="Delete update">⋮</button>`:''}</div>
       <div class="activityBody">${body}</div>
       ${renderAttachments(u.attachments||u.attachment||u.files||{})}
       ${u.poll||u.pollUpdateModel?`<div class="updatePoll"><b>Poll</b></div>`:''}
       <div class="activityMeta">${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</div>
       <div class="activityActions"><button data-course-update-comments="${esc(id)}">Comment</button>${comments?`<button data-course-update-comment-count="${esc(id)}" aria-label="${esc(comments)} comments">${esc(comments)}</button>`:'' }<button data-course-update-like="${esc(id)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}</button>${Number(likes||0)>0?`<button data-course-update-like-count="${esc(id)}" aria-label="${esc(likes)} likes">${esc(likes)}</button>`:''}</div>
       <div class="updateCommentsPanel" id="course-update-comments-${esc(id)}" hidden></div>
     </article>`;
   }).join('');
   el.innerHTML=`${cards||'<div class="empty"><h2>No updates</h2><p>There are no updates in this course.</p></div>'}${next?'<button id="courseUpdateMore" class="androidMoreButton">Load more</button>':''}`;
   await hydrateMediaImages(el);
   el.querySelectorAll('[data-course-author-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.courseAuthorId;if(id)openProfileById(id,b.textContent||'Profile')});
   el.querySelector('#courseUpdateRefresh')?.addEventListener('click',()=>{start=0;all=[];next=true;loadPage(true)});
   el.querySelector('#courseUpdateMore')?.addEventListener('click',()=>loadPage(false));
   el.querySelectorAll('[data-course-update-like]').forEach(btn=>btn.onclick=async()=>{
     const id=btn.dataset.courseUpdateLike,liked=btn.dataset.liked==='1'; if(!id)return;
     try{
       await A.api({path:`like/${id}`,method:'POST',params:{like_action:!liked},json:true});
       const u=all.find(x=>String(x.id||x.update_id)===String(id));if(u){u.user_liked=!liked;u.liked=!liked;u.likes=Number(u.likes||0)+(liked?-1:1);}
       await render();
     }catch(e){alert('Unable to update like: '+e.message)}
   });
   el.querySelectorAll('[data-course-update-comments]').forEach(btn=>btn.onclick=()=>loadCourseUpdateComments(sid,btn.dataset.courseUpdateComments,btn.closest('.sectionFullUpdate')?.querySelector('.updateCommentsPanel')));
   el.querySelectorAll('[data-course-update-comment-count]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.courseUpdateCommentCount;if(!id)return;try{const data=await A.api({path:`sections/${sid}/updates/${id}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});const comments=data.comment||data.comments||[];showAppDialog('Comments',comments.map(c=>`${c.display_name||c.user_name||c.name||'User'}: ${c.body||c.comment||''}`).join('\n\n')||'No comments yet.')}catch(e){showAppDialog('Unable to load comments',e?.message||String(e)||'Unknown error')}});
   el.querySelectorAll('[data-course-update-like-count]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.courseUpdateLikeCount;if(!id)return;try{const data=await A.api({path:`like/${id}`,params:{}});const raw=data?.users?.user||data?.users||data?.user||[];const users=(Array.isArray(raw)?raw:[raw]).filter(Boolean);showAppDialog('Liked by',users.map(u=>u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology user').join('\n')||'No likes yet.')}catch(e){showAppDialog('Unable to load likes',e?.message||String(e)||'Unknown error')}});
   el.querySelectorAll('[data-update-delete]').forEach(btn=>btn.onclick=async()=>{
     if(!confirm('Delete this update?'))return;
     try{await A.api({path:`sections/${sid}/updates/${btn.dataset.updateDelete}`,method:'DELETE',params:{}});all=all.filter(x=>String(x.id||x.update_id)!==String(btn.dataset.updateDelete));await render()}catch(e){alert('Unable to delete update: '+e.message)}
   });
 };
 const loadPage=async(reset)=>{
   if(loading)return;loading=true;
   if(reset){start=0;all=[];next=true}
   try{
     const x=await A.api({path:`sections/${sid}/updates`,params:{start,limit,with_attachments:'TRUE',richtext:1}});
     const rows=x.update||x.updates||x.update_list||[];
     const ids=[...new Set(rows.map(u=>u.user_id||u.uid||u.author_id||u.authorId).filter(Boolean).map(Number))];
     await Promise.all(ids.map(async id=>{if(authorUsers[id])return;try{const q=await A.api({path:`users/${id}`,params:{}});authorUsers[id]=q?.user||q}catch{}}));
     all=all.concat(rows);
     next=!!(x.links?.next||x.link?.next||(rows.length>=limit));
     start+=rows.length;
     await render();
   }finally{loading=false}
 };
 const loadInitial=()=>loadPage(true);
 await loadInitial();
}

function dialogPersonId(person){return Number(person?.uid??person?.user_id??person?.userId??person?.id??person?.creater_id??person?.creator_id??person?.author_id??0)}
function dialogPersonName(person,profile={}){return String(person?.name_display||person?.nameDisplay||person?.display_name||person?.displayName||person?.author_name||person?.user_name||person?.name||profile?.name_display||profile?.display_name||profile?.name||'Schoology user')}
function dialogPersonAvatar(person,profile={}){return normalizeImageUrl(person?.picture_url||person?.pictureUrl||person?.picture||person?.avatar_url||person?.avatarUrl||profile?.picture_url||profile?.pictureUrl||profile?.picture||profile?.avatar_url||profile?.avatarUrl||'')}
async function hydrateDialogPeople(records){
 const rows=(Array.isArray(records)?records:[records]).filter(Boolean),profiles={};
 const ids=[...new Set(rows.map(dialogPersonId).filter(id=>id>0))];
 await Promise.all(ids.map(async id=>{
   const row=rows.find(p=>dialogPersonId(p)===id)||{};
   if(dialogPersonName(row,{})!=='Schoology user'&&dialogPersonAvatar(row,{}))return;
   try{const response=await A.api({path:'users/'+id,params:{picture_size:'sm'}});profiles[id]=response?.user||response?.data?.user||response?.data||response||{}}catch{}
 }));
 return rows.map(person=>({person,profile:profiles[dialogPersonId(person)]||{},id:dialogPersonId(person)}));
}
function showPeopleDialog(title,rows,kind='likes'){
 document.getElementById('peopleListDialogOverlay')?.remove();
 const overlay=document.createElement('div');overlay.id='peopleListDialogOverlay';overlay.className='peopleListDialogOverlay';
 const content=rows.length?rows.map(({person,profile,id})=>{
   const name=dialogPersonName(person,profile),avatar=dialogPersonAvatar(person,profile),initials=name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'S';
   const avatarHtml=avatar?'<img src="'+esc(avatar)+'" alt="">':'<span>'+esc(initials)+'</span>';
   const identity=id?'<button class="peopleDialogName" data-people-dialog-user="'+id+'">'+esc(name)+'</button>':'<b class="peopleDialogName">'+esc(name)+'</b>';
   if(kind==='comments'){
     const body=materialDescriptionText(person?.body??person?.comment??person?.message??'');
     const created=formatSchoologyDate(person?.created??person?.timestamp??person?.last_updated??'');
     return '<article class="peopleDialogComment"><div class="peopleDialogAvatar">'+avatarHtml+'</div><div class="peopleDialogPersonBody"><div class="peopleDialogIdentity">'+identity+'</div><div class="peopleDialogCommentBody">'+esc(body).replace(/\n/g,'<br>')+'</div>'+(created?'<small>'+esc(created)+'</small>':'')+'</div></article>';
   }
   return '<div class="peopleDialogPerson"><div class="peopleDialogAvatar">'+avatarHtml+'</div>'+identity+'</div>';
 }).join(''):'<div class="peopleDialogEmpty">'+(kind==='comments'?'No comments yet.':'No likes yet.')+'</div>';
 overlay.innerHTML='<section class="peopleListDialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><header><b>'+esc(title)+'</b><button type="button" data-people-dialog-close aria-label="Close">×</button></header><div class="peopleListDialogBody">'+content+'</div></section>';
 overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-people-dialog-close]'))overlay.remove()});
 document.body.appendChild(overlay);
 overlay.querySelectorAll('[data-people-dialog-user]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.peopleDialogUser,name=button.textContent||'Profile';overlay.remove();if(id)openProfileById(id,name)}));
}
async function showLikeUsers(path){
 try{const data=await A.api({path,params:{}});const raw=data?.users?.user||data?.users||data?.user||[];const users=(Array.isArray(raw)?raw:[raw]).filter(Boolean);showPeopleDialog('Liked by',await hydrateDialogPeople(users),'likes')}
 catch(e){showAppDialog('Unable to load likes',e?.message||String(e)||'Unknown error')}
}
async function showUpdateCommentsDialog(realm,realmId,updateId){
 try{
   const data=await A.api({path:realm+'/'+realmId+'/updates/'+updateId+'/comments',params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});
   const raw=data?.comment||data?.comments||data?.data?.comment||data?.data?.comments||[],comments=(Array.isArray(raw)?raw:[raw]).filter(Boolean);
   const records=comments.map(c=>({...c,uid:c.uid??c.user_id??c.userId??c.creater_id??c.creator_id??c.author_id}));
   showPeopleDialog('Comments',await hydrateDialogPeople(records),'comments');
 }catch(e){showAppDialog('Unable to load comments',e?.message||String(e)||'Unknown error')}
}
async function loadUpdateCommentsPanel(realm,realmId,updateId,panel){
 if(!panel)return;panel.hidden=false;panel.innerHTML='<div class="loading">Loading comments…</div>';
 try{const data=await A.api({path:`${realm}/${realmId}/updates/${updateId}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});const comments=data.comment||data.comments||[];
 panel.innerHTML=`<div class="updateCommentsList">${comments.map(c=>{const cid=c.id||c.comment_id||c.commentId||'',liked=!!(c.user_like_action||c.liked||c.is_liked),likes=Number(c.likes||c.like_count||c.likeCount||0),parent=Number(c.parent_id||c.parentId||0);return `<div class="updateComment" style="padding-left:${parent?18:0}px"><b>${esc(c.display_name||c.user_name||c.name||'Schoology')}</b><div>${c.body||c.comment||''}</div><small>${esc(formatSchoologyDate(c.created||c.timestamp||''))}</small><div class="activityActions"><button type="button" data-update-comment-reply="${esc(cid)}">Reply</button><button type="button" data-update-comment-like="${esc(cid)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}</button>${likes?`<button type="button" data-update-comment-like-count="${esc(cid)}">♥ ${likes}</button>`:''}</div></div>`}).join('')||'<div class="empty">No comments yet.</div>'}</div><div class="updateCommentComposer"><textarea id="update-comment-${esc(updateId)}" placeholder="Write a comment…"></textarea><button type="button" data-post-update-comment="${esc(updateId)}">Post comment</button></div>`;
 panel.querySelectorAll('[data-update-comment-like]').forEach(button=>button.onclick=async()=>{const id=button.dataset.updateCommentLike;if(!id||button.disabled)return;const liked=button.dataset.liked==='1';button.disabled=true;try{await A.api({path:`like/${updateId}/comment/${id}`,method:'POST',params:{like_action:!liked},json:true});button.dataset.liked=liked?'0':'1';button.textContent=liked?'Like':'Unlike'}catch(e){showAppDialog('Unable to update comment like',e?.message||String(e)||'Unknown error')}finally{button.disabled=false}});
 panel.querySelectorAll('[data-update-comment-like-count]').forEach(button=>button.onclick=()=>showLikeUsers(`like/${updateId}/comment/${button.dataset.updateCommentLikeCount}`));
 panel.querySelectorAll('[data-update-comment-reply]').forEach(button=>button.onclick=()=>{const field=panel.querySelector('textarea');if(field){field.dataset.parentId=button.dataset.updateCommentReply||'0';field.placeholder='Write a reply…';field.focus()}});
 panel.querySelector('[data-post-update-comment]')?.addEventListener('click',async()=>{const field=panel.querySelector('textarea');const body=field?.value.trim();if(!body)return;const button=panel.querySelector('[data-post-update-comment]');button.disabled=true;try{await A.api({path:`${realm}/${realmId}/updates/${updateId}/comments`,method:'POST',params:{comment:body,parent_id:Number(field.dataset.parentId||0)},json:true});await loadUpdateCommentsPanel(realm,realmId,updateId,panel)}catch(e){button.disabled=false;showAppDialog('Unable to post comment',e?.message||String(e)||'Unknown error')}});
 }catch(e){panel.innerHTML=`<div class="error apiError">${esc(e?.message||String(e))}</div>`}
}
function openUpdateCommentsModal(realm,realmId,updateId,title='Comments'){
 const existing=document.getElementById('updateCommentsModal');existing?.remove();
 const wrap=document.createElement('div');wrap.id='updateCommentsModal';wrap.className='assignmentCommentDialogOverlay';
 wrap.innerHTML=`<section class="assignmentCommentDialog" role="dialog" aria-modal="true"><div class="androidCommentDialogBar"><button type="button" class="androidDialogIcon" data-update-comments-close aria-label="Close">×</button><strong style="flex:1">${esc(title)}</strong></div><div id="updateCommentsModalPanel" class="updateCommentsPanel"></div></section>`;
 wrap.addEventListener('click',event=>{if(event.target===wrap)wrap.remove()});wrap.querySelector('[data-update-comments-close]')?.addEventListener('click',()=>wrap.remove());document.body.appendChild(wrap);
 loadUpdateCommentsPanel(realm,realmId,updateId,wrap.querySelector('#updateCommentsModalPanel'));
}
async function loadCourseUpdateComments(sectionId,updateId,panel){
 if(!panel)return;
 panel.hidden=false;panel.innerHTML='<div class="loading">Loading comments…</div>';
 try{
   const x=await A.api({path:`sections/${sectionId}/updates/${updateId}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});
   const arr=x.comment||x.comments||[];
   panel.innerHTML=`<div class="updateCommentsList">${arr.map(c=>`<div class="updateComment"><b>${esc(c.display_name||c.user_name||'Schoology')}</b><div>${c.body||c.comment||''}</div><small>${esc(formatSchoologyDate(c.created||c.timestamp||''))}</small></div>`).join('')||'<div class="empty">No comments yet.</div>'}<div class="updateCommentComposer"><textarea placeholder="Write a comment…" id="update-comment-${esc(updateId)}"></textarea><button data-post-update-comment="${esc(updateId)}">Post</button></div></div>`;
   panel.querySelector('[data-post-update-comment]')?.addEventListener('click',async()=>{
     const ta=panel.querySelector('textarea'),body=ta?.value.trim();if(!body)return;
     try{await A.api({path:`sections/${sectionId}/updates/${updateId}/comments`,method:'POST',params:{comment:body,parent_id:0},json:true});await loadCourseUpdateComments(sectionId,updateId,panel)}catch(e){alert('Unable to post comment: '+e.message)}
   });
 }catch(e){panel.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}
}

function openCourseUpdateComposer(course){
 const sid=course.id||course.section_id||course.sectionId;
 const old=document.getElementById('courseUpdateComposer');old?.remove();
 const wrap=document.createElement('div');wrap.id='courseUpdateComposer';wrap.className='courseUpdateComposer';
 wrap.innerHTML='<div class="courseUpdateComposerInner"><h2>Post Update</h2><textarea id="courseUpdateBody" placeholder="Write an update…"></textarea><div><button id="cancelCourseUpdate">Cancel</button><button id="submitCourseUpdate" class="androidPrimary">Post</button></div></div>';
 document.body.appendChild(wrap);
 document.getElementById('cancelCourseUpdate')?.addEventListener('click',()=>wrap.remove());
 document.getElementById('submitCourseUpdate')?.addEventListener('click',async()=>{
   const body=document.getElementById('courseUpdateBody')?.value.trim();if(!body)return;
   try{await A.api({path:`sections/${sid}/updates`,method:'POST',params:{body},signBody:true});wrap.remove();await loadCourseTab(course,'updates')}catch(e){alert('Unable to post update: '+e.message)}
 });
 document.getElementById('courseUpdateBody')?.focus();
}

async function loadCourseTab(course,tab){
 const el=document.getElementById('sectionProfileContent');if(!el)return;
 const sid=course.id||course.section_id||course.sectionId;
 if(!sid)throw new Error('Course section ID is missing.');
 if(tab==='materials'){
   await loadFolder(course,0);
   return;
 }
 if(tab==='updates'){
   await loadCourseUpdates(course,el);
   return;
 }
 if(tab==='upcoming'){
   const x=await A.api({path:`sections/${sid}/events`,params:{start_date:formatApiDate(new Date()),limit:20}});
   let arr=x.event||x.events||[];
   arr=arr.filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool','event'].includes(String(e.type||'')));
   el.innerHTML=renderUpcoming(arr);
   document.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=async()=>{const e=arr.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const type=String(e.type||'').toLowerCase();const aid=e.assignment_id??e.assignmentId??e.assignment?.id;const esid=e.section_id??e.sectionId??sid;if(type==='assignment'&&aid){openWithPressTransition(b,()=>showAssignment(esid,aid));return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id){openWithPressTransition(b,async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})});return}}if(e.web_url||e.webUrl)openWithPressTransition(b,()=>showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming'));else if(type==='discussion'&&e.id)openWithPressTransition(b,()=>showDiscussionNative('sections',esid,e.id,e.title||'Discussion'));});
   return;
 }
 if(tab==='grades'||tab==='gradebook'){
   await loadSectionGrades(course);
   return;
 }
 if(tab==='attendance'){
   await loadAttendanceTab(course);
   return;
 }
 if(tab==='courseapp'){
   await loadCourseApps(course,el);
   return;
 }
}

function animateTab(){ /* Restored to the Android pager's stable tab layout; no custom overlay animation. */ }
function renderUpcoming(events){
 const arr=Array.isArray(events)?events:[];
 if(!arr.length)return '<div class="empty"><h2>No upcoming events</h2></div>';
 const groups=[];const byDate=new Map();
 const sorted=arr.slice().sort((a,b)=>new Date(String(a.start||'').replace(' ','T'))-new Date(String(b.start||'').replace(' ','T')));
 for(const e of sorted){
   const d=new Date(String(e.start||'').replace(' ','T'));
   const key=Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
   if(!byDate.has(key)){const g={key,date:d,items:[]};byDate.set(key,g);groups.push(g);}
   byDate.get(key).items.push(e);
 }
 const html=[];
 for(const g of groups){
   const dateLabel=Number.isNaN(g.date.getTime())?'':g.date.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'});
   html.push(`<div class="upcomingDateHeader"><span>${esc(dateLabel)}</span><span class="upcomingDateRule"></span></div>`);
   for(const e of g.items){
     const type=String(e.type||'').toLowerCase();
     const icon=type==='assignment'?'ic_assignment.png':type==='assessment'?'ic_test_quiz.png':['assessment_v2','managed_assessment','quiz'].includes(type)?'ic_assessment_48dp.png':type==='discussion'?'ic_discussion.png':type==='external_tool'?'ic_external_tool.png':type==='event'?'home_dash_upcoming.png':'ic_date_range_24px.png';
     const allDay=String(e.all_day)==='1'||e.allDay===1;
     const time=!allDay&&e.start?new Date(String(e.start).replace(' ','T')).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
     html.push(`<button class="upcomingAssignment" data-course-upcoming-id="${esc(e.id||'')}" data-upcoming-type="${esc(type)}"><span class="assignmentIcon officialEventIcon">${officialOrAssetIcon(icon,'')}</span><span class="assignmentInfo"><b>${esc(e.title||'Untitled')}</b><small>${esc(time)}</small></span><span class="rowChevron">›</span></button>`);
   }
 }
 return `<div class="upcomingList">${html.join('')}</div>`;
}
function formatSchoologyDate(v){if(v===null||v===undefined||v==='')return '';const n=Number(v);const d=(Number.isFinite(n)&&n>0)?new Date(n*1000):new Date(String(v).replace(' ','T'));if(Number.isNaN(d.getTime()))return String(v);return d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'})+' at '+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}
function formatApiDate(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
async function loadSectionGrades(course){
 const el=document.getElementById('sectionProfileContent')||document.getElementById('gradesContent');if(!el)return;
 const sid=course.id||course.section_id||course.sectionId;
 const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
 const [section,periods,categories,items,userGrades]=await Promise.all([
  A.api({path:`sections/${sid}`,params:{}}),
  A.api({path:`sections/${sid}/grading_periods`,params:{}}),
  A.api({path:`sections/${sid}/grading_categories`,params:{}}),
  A.api({path:`sections/${sid}/grade_items`,params:{limit:2000}}),
  A.api({path:`users/${uid}/grades`,params:{section_id:sid}})
 ]);
 const assignments=items.assignment||items.assignments||[];
 const gs=userGrades.section||userGrades.sections||[];
 const current=gs.find(s=>String(s.section_id||s.id)===String(sid))||gs[0]||{};
 try{await hydrateUserCourseGrades([current]);}catch{}
 current._gradeScaleId=current._gradeScaleId??section?.options?.default_grading_scale_id??section?.section?.options?.default_grading_scale_id;
 const byId={};
 for(const per of (current.period||current.periods||[])){
  for(const ga of (per.assignment||per.assignments||[]))byId[String(ga.assignment_id||ga.id)]={...ga};
 }
 const rows=assignments.map(a=>({...a,gradeData:byId[String(a.id)]||{}}));
 el.innerHTML=`<div class="gradesAndroid">${renderOverallGrade(current)}${renderGradePeriods(rows,periods,categories)}</div>`;
 el.querySelectorAll('[data-grade-assignment]').forEach(b=>b.onclick=async()=>{const type=String(b.dataset.gradeType||'assignment').toLowerCase(),id=Number(b.dataset.gradeAssignment);if(!id)return;if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,b.textContent?.trim()||'Quiz',{allowBrowser:false,quiz:true,assessment:true});}else if(type==='discussion'){await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/section/${sid}/discussion/view/${id}`,b.textContent?.trim()||'Discussion');}else showAssignment(sid,id)});
 el.querySelectorAll('[data-grade-toggle]').forEach(b=>b.onclick=()=>{
   const target=document.getElementById(b.dataset.gradeToggle);if(!target)return;
   const parent=b.closest('.gradePeriod,.gradeCategory');if(!parent)return;
   const collapsed=parent.classList.toggle('collapsed');b.setAttribute('aria-expanded',String(!collapsed));
 });
}
function getFinalGradeDisplay(sec){
 const firstDefined=(...values)=>values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
 const rawFinal=sec?._resolvedFinalGrade??sec?.final_grade??sec?.finalGrade??sec?.final_grades??sec?.finalGrades??[];
 const finals=(Array.isArray(rawFinal)?rawFinal:(rawFinal?[rawFinal]:[])).filter(v=>v&&typeof v==='object');
 const periodList=f=>{const v=f?.period??f?.periods??f?.final_period??f?.finalPeriod??f?.final_grade_period??f?.finalGradePeriod??[];return Array.isArray(v)?v:(v?[v]:[])};
 const entries=finals.flatMap(final=>{const periods=periodList(final);return periods.length?periods.map(period=>({final,period:period||{}})):[{final,period:{}}]});
 // Android FinalGradesApiHelper reads only the final-period record for the overall grade.
 const entry=entries.find(e=>String(e.period?.period_id??e.period?.periodId??'')==='final')||{final:finals[0]||{},period:{}};
 const final=entry.final||{},period=entry.period||{};
 // GradesStringProvider returns the explicit grade override string verbatim before formatting the numeric grade.
 const override=firstDefined(period.override_str,period.overrideStr,period.override_string,period.overrideString,period.grade_override,period.gradeOverride,final.override_str,final.overrideStr,final.override_string,final.overrideString,final.grade_override,final.gradeOverride);
 if(override!==undefined)return {value:String(override).trim(),letter:String(override).trim(),percentage:'',overridden:true,final,period};
 const numericOverride=firstDefined(period.override_numeric,period.overrideNumeric,final.override_numeric,final.overrideNumeric);
 const grade=numericOverride!==undefined?numericOverride:firstDefined(period.grade,final.grade,final.calculated_grade,final.calculatedGrade,sec?.grade);
 if(grade===undefined)return {value:'—',letter:'',percentage:'',overridden:false,final,period};
 const numeric=Number(String(grade).replace(/%$/,''));
 if(Number.isFinite(numeric)){
  const letter=letterGradeForCourse(sec,entry,numeric),scale=gradingScaleForCourse(sec,entry);
  const pct=formatGradeNumber(numeric)+'%';
  const scaleType=Number(scale?.type??scale?.scale_type??scale?.scaleType);
  const hideNumeric=[true,1,'1','true'].includes(scale?.hide_numeric??scale?.hideNumeric);
  if(letter&&scaleType===1)return {value:hideNumeric?letter:`${letter} (${pct})`,letter,percentage:pct,overridden:numericOverride!==undefined,final,period};
  return {value:pct,letter:'',percentage:pct,overridden:numericOverride!==undefined,final,period};
 }
 return {value:String(grade),letter:'',percentage:'',overridden:numericOverride!==undefined,final,period};
}
function formatGradeNumber(value){const n=Number(value);return Number.isFinite(n)?String(Number(n.toFixed(2))):String(value)}
function gradingScaleForCourse(sec,entry){
 const final=entry?.final||{},period=entry?.period||{};
 const scaleId=String(final.scale_id??final.scaleId??period.scale_id??period.scaleId??sec?._gradeScaleId??'');
 const root=sec?._gradingScales||{};
 const raw=root.grading_scale??root.gradingScale??root.scales??root.scale??root.data?.grading_scale??root.data?.scales??[];
 const scales=Array.isArray(raw)?raw:(raw?[raw]:[]);
 let scale=scales.find(s=>String(s.id??s.scale_id??s.scaleId??'')===scaleId);
 if(!scale&&scales.length===1)scale=scales[0];
 return scale||null;
}
function letterGradeForCourse(sec,entry,numeric){
 const scale=gradingScaleForCourse(sec,entry);if(!scale)return '';
 const type=Number(scale.type??scale.scale_type??scale.scaleType);
 if(Number.isFinite(type)&&type!==1)return '';
 const lv=scale.scale?.level??scale.scale?.levels?.level??scale.scale?.levels??scale.levels?.level??scale.levels??scale.level??[];
 const levels=(Array.isArray(lv)?lv:(lv?[lv]:[])).map(l=>({grade:l.grade??l.title??l.name,cutoff:Number(l.cutoff??l.average??l.percent??l.percentage)})).filter(l=>l.grade!=null&&Number.isFinite(l.cutoff)).sort((a,b)=>b.cutoff-a.cutoff);
 const matched=levels.find(l=>numeric>=l.cutoff);return matched?String(matched.grade):'';
}
async function hydrateUserCourseGrades(sections){
 const uid=state.auth?.userId||state.auth?.user?.id;
 await Promise.all((sections||[]).map(async sec=>{
  const sid=sec.section_id??sec.sectionId??sec.id;if(!sid)return;
  try{
   const [grades,scales,enrollments,sectionDetail]=await Promise.all([
    A.api({path:`sections/${sid}/grades`,params:{}}).catch(()=>null),
    A.api({path:`sections/${sid}/grading_scales`,params:{}}).catch(()=>null),
    A.api({path:`sections/${sid}/enrollments`,params:{start:0,limit:200,enrollment_status:1}}).catch(()=>null),
    A.api({path:`sections/${sid}`,params:{}}).catch(()=>null)
   ]);
   const all=grades?.final_grade??grades?.finalGrade??grades?.final_grades??[];const list=Array.isArray(all)?all:(all?[all]:[]);
   const enrollmentList=enrollments?.enrollment??enrollments?.enrollments??[];
   const myEnrollment=enrollmentList.find(en=>String(en.uid??en.user_id??en.userId??'')===String(uid));
   const enrollmentId=String(myEnrollment?.id??sec.enrollment_id??sec.enrollmentId??sec.enrollment?.id??'');
   let matched=list.find(f=>enrollmentId&&String(f.enrollment_id??f.enrollmentId??'')===enrollmentId);
   if(!matched&&list.length===1)matched=list[0];
   // Do not pick an arbitrary student's record if this section has multiple enrollments.
   if(matched)sec._resolvedFinalGrade=[matched];
   sec._gradingScales=scales||{};
   const matchedPeriods=matched?.period??matched?.periods??matched?.final_period??matched?.finalPeriod??[];
   const periodArray=Array.isArray(matchedPeriods)?matchedPeriods:(matchedPeriods?[matchedPeriods]:[]);
   const finalPeriod=periodArray.find(p=>String(p?.period_id??p?.periodId??'')==='final');
   sec._gradeScaleId=finalPeriod?.scale_id??finalPeriod?.scaleId??matched?.scale_id??matched?.scaleId??sec.scale_id??sec.scaleId??sectionDetail?.section?.options?.default_grading_scale_id??sectionDetail?.options?.default_grading_scale_id;
  }catch{}
 }));
}

function renderOverallGrade(sec){
 const display=getFinalGradeDisplay(sec);
 const final=display.final;
 const comment=typeof final.comment==='string'?final.comment:(final.comment?.comment||final.comment?.body||'');
 return `<div class="gradeOverallCard"><div class="label">Overall Grade</div><div class="value">${esc(display.value)}</div>${comment?`<div class="gradeOverallTeacherComment"><b>Teacher Comment</b><div>${comment}</div></div>`:''}</div>`;
}
function renderGradePeriods(rows,periods,categories){
 const ps=periods.grading_period||periods.gradePeriod||periods.period||periods.periods||[];
 const cats=categories.grading_category||categories.category||categories.categories||[];
 const catMap={};cats.forEach(c=>{catMap[String(c.id)]={title:c.title||c.name||'Category',weight:c.weight??c.percent??c.percentage??c.weight_percent??c.weightPercentage};});
 const pmap={};ps.forEach(p=>pmap[String(p.id)]=p.title||p.name||'Grading Period');
 const periodGroups={};
 rows.forEach(a=>{
  const pid=String(a.grading_period_id??a.grading_period??a.period_id??'0');
  const cid=String(a.grading_category_id??a.grading_category??a.category_id??'0');
  (periodGroups[pid]??={}).__title=pmap[pid]||'Grading Period';
  (periodGroups[pid][cid]??=[]).push(a);
 });
 const pids=Object.keys(periodGroups);
 if(!pids.length)return '<div class="empty"><h2>No grades</h2></div>';
 return pids.map((pid,pi)=>{
  const pg=periodGroups[pid], title=pg.__title||'Grading Period';
  const catIds=Object.keys(pg).filter(k=>k!=='__title');
  return `<section class="gradePeriod" id="grade-period-${pi}">
   <button class="gradePeriodHeader" data-grade-toggle="grade-period-body-${pi}" aria-expanded="true"><span>${esc(title.toUpperCase())}</span><span class="gradeChevron">⌃</span></button>
   <div id="grade-period-body-${pi}">
   ${catIds.map((cid,ci)=>{
    const meta=catMap[cid]||{title:cid==='0'?'Ungraded':'Category',weight:null};const list=pg[cid];
    const weight=meta.weight!=null?`<span class="weight">${esc(meta.weight)}%</span>`:'';
    return `<div class="gradeCategory" id="grade-cat-${pi}-${ci}">
      <button class="gradeCategoryHeader" data-grade-toggle="grade-cat-body-${pi}-${ci}" aria-expanded="true"><span>${esc(meta.title)}</span>${weight}<span class="gradeChevron">⌃</span></button>
      <div class="gradeCategoryBody" id="grade-cat-body-${pi}-${ci}">
      ${list.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''))).map(a=>{
       const g=a.gradeData||{};const raw=g.grade??g.calculated_grade??g.score??'—';const max=a.max_points??a.maxPoints??g.max_points??g.maxPoints;
       const value=(raw!=='—'&&max!=null&&String(max)!=='')?`${raw}/${max}`:raw;
       const comment=typeof g.comment==='string'?g.comment:(g.comment?.comment||g.comment?.body||'');
       return `<button class="gradeAssignmentRow" data-grade-assignment="${esc(a.id||'')}" data-grade-type="${esc(a.type||a.template_type||a.type_name||'assignment')}"><span class="gradeAssignmentName"><b>${esc(a.title||a.assignment_title||'Assignment')}</b>${comment?`<small class="gradeTeacherComment">${comment}</small>`:''}</span><span class="gradeValue">${esc(value)}</span></button>`;
      }).join('')||'<div class="empty">No graded items.</div>'}
      </div>
    </div>`;
   }).join('')}
   </div>
  </section>`;
 }).join('');
}
function renderGrades(rows){return renderGradePeriods(rows,{grading_period:[]},{grading_category:[]});}

function openNativeCommentComposer(kind,view,parentId='0'){
 const old=document.getElementById('nativeCommentDialog');old?.remove();const wrap=document.createElement('div');wrap.id='nativeCommentDialog';wrap.className='assignmentCommentDialogOverlay';
 wrap.innerHTML=`<section class="assignmentCommentDialog" role="dialog" aria-modal="true"><div class="androidCommentDialogBar"><button id="nativeCommentCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">Comment</div><button id="nativeCommentSend" class="androidDialogIcon" aria-label="Post">${officialIcon('ic_action_send_icon.png','Post')}</button></div><div class="androidCommentDialogBody"><textarea id="nativeCommentBody" placeholder="Post a comment…" autofocus></textarea><div class="commentAttachmentActions"><button id="nativeAttachFile">${officialOrAssetIcon('ic_action_ic_menu_folder.png','')}File</button><button id="nativeAttachResource">${officialOrAssetIcon('ic_attach_resourcesv3.png','')}Resource</button></div><div id="nativeAttachStatus"></div></div></section>`;
 document.body.appendChild(wrap);const close=()=>{wrap.remove();if(view?.tab==='comments')syncToolbar()};wrap.querySelector('#nativeCommentCancel').onclick=close;wrap.onclick=e=>{if(e.target===wrap)close()};
 wrap.querySelector('#nativeAttachFile').onclick=async()=>{try{const f=await A.pickFile?.();if(f){wrap.dataset.file=f.path||f.filePath||'';wrap.querySelector('#nativeAttachStatus').textContent='File attached: '+(f.name||f.fileName||f.path||'Selected file')}}catch(e){alert('Unable to select file: '+e.message)}};
 wrap.querySelector('#nativeAttachResource').onclick=async()=>{try{await chooseSchoologyResource(r=>{const id=r.template_id??r.templateID??r.resource_id??r.resourceId??r.template?.id??r.id;if(id==null)throw new Error('This resource does not have a usable Schoology resource ID.');wrap.dataset.resource=id;wrap.querySelector('#nativeAttachStatus').textContent='Resource attached: '+resourceTitle(r)},'Attach Resource')}catch(e){alert('Unable to load resources: '+e.message)}};
 wrap.querySelector('#nativeCommentSend').onclick=async()=>{const body=wrap.querySelector('#nativeCommentBody').value.trim();if(!body)return;const btn=wrap.querySelector('#nativeCommentSend');btn.disabled=true;try{const params={comment:body,parent_id:Number(parentId)||0};if(wrap.dataset.file){const id=await A.uploadSchoologyFile({filePath:wrap.dataset.file});params['file-attachment']={id:[Number(id)||id]}}if(wrap.dataset.resource)params.attachments=[{resource:Number(wrap.dataset.resource)||wrap.dataset.resource}];const path=`${view.realm}/${view.realmId}/${kind==='event'?'events':'discussions'}/${kind==='event'?view.eventId:view.discussionId}/comments`;await A.api({path,method:'POST',params,json:true});close();if(kind==='event')showEventNative(view.realm,view.realmId,view.eventId,state.toolbarTitle,'comments');else showDiscussionNative(view.realm,view.realmId,view.discussionId,state.toolbarTitle,'comments')}catch(e){btn.disabled=false;alert('Unable to post comment: '+e.message)}};
 requestAnimationFrame(()=>wrap.querySelector('#nativeCommentBody')?.focus());
}

async function showDiscussionNative(realm,realmId,discussionId,title='Discussion',initialTab='info'){
 const c=document.getElementById('content');if(!c)return;const previousGroup=state.currentGroup,previousTab=state.groupTab;
 state.assignmentView=null;state.embeddedTitle=title;state.embeddedTheme='';state.embeddedReturn={tab:'groups',title:previousGroup?.name||'Groups',group:previousGroup,groupTab:previousTab||'discussions'};state.currentGroup=previousGroup;state.toolbarTitle=title;state.discussionView={realm,realmId,discussionId,tab:initialTab||'info',data:null};syncToolbar();
 c.innerHTML=`<section class="assignmentAndroidPage nativeGradeItemPage"><div class="assignmentTabs discussionTabs" id="discussionTabs"><button class="assignmentTab ${initialTab==='info'?'active':''}" data-discussion-tab="info">Info</button><button class="assignmentTab ${initialTab==='comments'?'active':''}" data-discussion-tab="comments">Comments</button></div><div id="discussionNativeContent" class="assignmentTabContent"></div></section>`;
 const box=()=>document.getElementById('discussionNativeContent');
 const loadInfo=async()=>{const el=box();el.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';try{const x=await A.api({path:`${realm}/${realmId}/discussions/${discussionId}`,params:{with_attachments:'TRUE',richtext:1}});const d=x?.discussion||x?.data?.discussion||x;state.discussionView.data=d;el.innerHTML=`<div class="assignmentInfoHeader"><h1>${esc(d?.title||title)}</h1><div>${esc(d?.due||d?.due_date||d?.dueDate||'')}</div></div><div class="assignmentDescription">${d?.body||d?.description||d?.message||'<span class="muted">No discussion content.</span>'}</div>${renderAttachments(d?.attachments||d?.attachment||{})}`;el.querySelectorAll('a[href]').forEach(a=>a.onclick=async ev=>{const href=a.href||a.getAttribute('href');if(!href)return;ev.preventDefault();if(await routeSchoologyLink(href))return;await A.prepareWebSession();showEmbeddedWeb(href,a.textContent?.trim()||'Link')});await hydrateMediaImages(el)}catch(e){el.innerHTML=`<div class="error apiError"><b>Schoology could not load this discussion.</b><br>${esc(e.message)}</div>`}};
 const loadComments=async()=>{const el=box();el.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading comments…</span></div>';try{const x=await A.api({path:`${realm}/${realmId}/discussions/${discussionId}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});const arr=x?.comments||x?.comment||x?.data?.comments||[];const flat=[];const walk=(n,depth=0)=>{if(!n||typeof n!=='object')return;flat.push({n,depth});const ch=n.children||n.replies||n.comments||n.comment_replies||[];if(Array.isArray(ch))ch.forEach(q=>walk(q,depth+1))};arr.forEach(q=>walk(q));const ids=[...new Set(flat.map(({n})=>Number(n.creater_id??n.creator_id??n.uid??n.user_id??n.author_id??0)).filter(Boolean))];const users={};await Promise.all(ids.map(async id=>{try{const q=await A.api({path:`users/${id}`,params:{picture_size:'sm'}});users[id]=q?.user||q}catch{}}));el.innerHTML=`<div class="commentsPage officialComments"><div class="commentsList">${flat.map(({n,depth})=>{const id=Number(n.creater_id??n.creator_id??n.uid??n.user_id??n.author_id??0),u=users[id]||{},name=u.name_display||u.display_name||u.name||n.display_name||n.user_name||'Schoology',av=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||''),body=n.comment??n.body??n.message??'',created=formatSchoologyDate(n.created??n.timestamp??''),att=renderAttachments(n.attachments||n.attachment||{});return `<article class="androidCommentRow" style="padding-left:${12+Math.min(depth,8)*15}px"><div class="androidCommentAvatar">${av?`<img data-media-image-url="${esc(av)}" alt="" style="display:none">`:`<span class="commentAvatar">${esc(String(name).charAt(0))}</span>`}</div><div class="androidCommentContent"><button class="commentUserName" data-comment-user="${id}">${esc(name)}</button><div class="commentBodyHtml">${body}</div><div class="commentCreated">${esc(created)}</div>${att}<div class="androidCommentActions"><button>Reply</button><button>Like</button></div></div></article>`}).join('')||'<div class="androidEmptyState">No comments yet.</div>'}</div></div>`;await hydrateMediaImages(el)}catch(e){el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}};
 const select=async tab=>{state.discussionView.tab=tab;document.querySelectorAll('#discussionTabs .assignmentTab').forEach(b=>b.classList.toggle('active',b.dataset.discussionTab===tab));syncToolbar();tab==='info'?await loadInfo():await loadComments()};document.querySelectorAll('#discussionTabs [data-discussion-tab]').forEach(b=>b.onclick=()=>select(b.dataset.discussionTab));await loadInfo();
}
async function showGroupAlbumNative(gid,albumId,title='Album'){
  const c=document.getElementById('content');if(!c)return;
  state.embeddedTitle=title||'Album';state.embeddedTheme='album';state.embeddedReturn={tab:'groups',title:state.currentGroup?.name||'Groups',group:state.currentGroup,groupTab:state.groupTab||'albums'};state.albumView={gid,albumId};state.toolbarTitle=title||'Album';syncToolbar();
  c.innerHTML='<section class="albumNativePage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading album…</span></div></section>';
  try{
    const x=await A.api({path:`groups/${gid}/albums/${albumId}`,params:{with_content:'TRUE'}});
    const album=x?.album||x?.data?.album||x;const content=album?.content||album?.contents||album?.media||[];const arr=Array.isArray(content)?content:(content?.content||[]);
    c.innerHTML=`<section class="albumNativePage"><div class="albumNativeTitle">${esc(album?.title||title||'Album')}</div><div class="albumNativeGrid">${arr.map((m,i)=>{const src=normalizeImageUrl(m?.thumbnail_url||m?.thumbnailUrl||m?.photo_url||m?.photoUrl||m?.image_url||m?.imageUrl||m?.url||'');return `<button class="albumNativeItem" data-album-item="${i}">${src?`<img data-media-image-url="${esc(src)}" alt="">`:`<img src="../assets/icons/ic_albums.png" alt="">`}<span>${esc(m?.caption||m?.title||'')}</span></button>`}).join('')||'<div class="empty">No media in this album.</div>'}</div></section>`;
    window.__groupAlbumContent=arr;await hydrateMediaImages(c);
    c.querySelectorAll('[data-album-item]').forEach(b=>b.onclick=()=>{const m=window.__groupAlbumContent[+b.dataset.albumItem];const u=m?.url||m?.photo_url||m?.photoUrl||m?.original_url||m?.originalUrl;if(u)showEmbeddedWeb(u,m?.title||m?.caption||'Album')});
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this album.</b><br>${esc(e.message)}</div>`}
}

async function renderEventComments(el,response,eventId){
 const raw=response?.comments||response?.comment||response?.data?.comments||[];
 const comments=Array.isArray(raw)?raw:(raw?[raw]:[]);
 const flat=[];
 const walk=(node,depth=0)=>{if(!node||typeof node!=='object')return;flat.push({node,depth});const children=node.children||node.replies||node.comments||node.comment_replies||[];if(Array.isArray(children))children.forEach(child=>walk(child,depth+1));};
 comments.forEach(node=>walk(node));
 const userIds=[...new Set(flat.map(({node})=>Number(node.creater_id??node.creator_id??node.uid??node.user_id??node.author_id??0)).filter(Boolean))];
 const users={};
 await Promise.all(userIds.map(async id=>{try{const result=await A.api({path:'users/'+id,params:{picture_size:'sm'}});users[id]=result?.user||result;}catch{}}));
 const cards=flat.map(({node,depth})=>{
  const uid=Number(node.creater_id??node.creator_id??node.uid??node.user_id??node.author_id??0),user=users[uid]||{};
  const name=user.name_display||user.display_name||user.name||node.display_name||node.user_name||node.author_name||node.name||'Schoology';
  const avatar=normalizeImageUrl(user.picture_url||user.pictureUrl||user.picture||node.picture_url||node.pictureUrl||'');
  const body=node.comment??node.body??node.message??'',created=formatSchoologyDate(node.created??node.timestamp??'');
  const likes=Number(node.likes??node.like_count??0),liked=!!(node.userLiked||node.user_liked||node.liked),commentId=node.comment_id??node.id??'';
  const attachments=renderAttachments(node.attachments||node.attachment||{}),deleted=Number(node.status??1)===0;
  const avatarMarkup=avatar?'<img data-media-image-url="'+esc(avatar)+'" alt="" style="display:none">':'<span class="commentAvatar">'+esc(String(name).charAt(0))+'</span>';
  const replyMarkup=!deleted&&depth===0?'<button data-event-comment-reply="'+esc(commentId)+'">Reply</button>':'';
  return '<article class="androidCommentRow" style="padding-left:'+(12+Math.min(depth,8)*15)+'px"><div class="androidCommentAvatar">'+avatarMarkup+'</div><div class="androidCommentContent"><button class="commentUserName" data-comment-user="'+esc(uid)+'">'+esc(name)+'</button><div class="commentBodyHtml '+(deleted?'commentDeleted':'')+'">'+(deleted?'Comment deleted':body)+'</div><div class="commentCreated">'+esc(created)+'</div>'+attachments+'<div class="androidCommentActions">'+replyMarkup+'<button data-event-comment-like="'+esc(commentId)+'" data-liked="'+(liked?'1':'0')+'">'+(liked?'Unlike':'Like')+'</button><button type="button" data-event-comment-like-count="'+esc(commentId)+'" aria-label="'+likes+' likes">♥ '+likes+'</button></div></div></article>';
 }).join('');
 el.innerHTML='<div class="commentsPage officialComments"><div class="commentsList commentsAndroidList">'+(cards||'<div class="androidEmptyState">No comments yet.</div>')+'</div></div>';
 await hydrateMediaImages(el);
 el.querySelectorAll('[data-comment-user]').forEach(button=>button.onclick=()=>{const uid=button.dataset.commentUser;if(uid&&uid!=='0')openProfileById(uid,button.textContent||'Profile')});
 el.querySelectorAll('[data-event-comment-reply]').forEach(button=>button.onclick=()=>openNativeCommentComposer('event',state.eventView,button.dataset.eventCommentReply));
 el.querySelectorAll('[data-event-comment-like-count]').forEach(button=>button.onclick=async()=>{const id=button.dataset.eventCommentLikeCount;if(!id)return;try{const data=await A.api({path:'like/'+eventId+'/comment/'+id,params:{}});const raw=data?.users?.user||data?.users||data?.user||[];const users=(Array.isArray(raw)?raw:[raw]).filter(Boolean);showAppDialog('Liked by',users.map(u=>u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology user').join('\n')||'No likes yet.')}catch(error){showAppDialog('Unable to load likes',error?.message||String(error)||'Unknown error')}});
 el.querySelectorAll('[data-event-comment-like]').forEach(button=>button.onclick=async()=>{const id=button.dataset.eventCommentLike;if(!id)return;const liked=button.dataset.liked==='1';try{await A.api({path:'like/'+eventId+'/comment/'+id,method:'POST',params:{like_action:!liked},json:true});button.dataset.liked=liked?'0':'1';button.textContent=liked?'Like':'Unlike';}catch(error){showAppDialog('Unable to update comment',error.message||String(error));}});
}
async function showEventNative(realm,realmId,eventId,title='Event',initialTab='info'){
 const c=document.getElementById('content');if(!c)return;const previousGroup=state.currentGroup,previousTab=state.groupTab;state.embeddedTitle=title;state.embeddedTheme='';state.embeddedReturn={tab:previousGroup?'groups':'home',title:previousGroup?.name||'Home',group:previousGroup,groupTab:previousTab||'updates'};state.eventView={realm,realmId,eventId,tab:initialTab||'info'};state.toolbarTitle=title;syncToolbar();
 c.innerHTML=`<section class="assignmentAndroidPage nativeGradeItemPage"><div class="assignmentTabs discussionTabs" id="eventTabs"><button class="assignmentTab ${initialTab==='info'?'active':''}" data-event-tab="info">Info</button><button class="assignmentTab ${initialTab==='comments'?'active':''}" data-event-tab="comments">Comments</button></div><div id="eventNativeContent" class="assignmentTabContent"></div></section>`;
 const load=async tab=>{state.eventView.tab=tab;document.querySelectorAll('#eventTabs .assignmentTab').forEach(b=>b.classList.toggle('active',b.dataset.eventTab===tab));syncToolbar();const el=document.getElementById('eventNativeContent');el.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';try{const x=await A.api({path:`${realm}/${realmId}/events/${eventId}`,params:{with_attachments:'TRUE',richtext:1}});const e=x?.event||x?.data?.event||x;if(tab==='comments'){const q=await A.api({path:`${realm}/${realmId}/events/${eventId}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});await renderEventComments(el,q,eventId);return}el.innerHTML=`<div class="assignmentInfoHeader"><h1>${esc(e.title||title)}</h1><div>${esc(e.start||e.start_time||e.date||'')}</div></div><div class="assignmentDescription">${e.description||e.body||'<span class="muted">No event description.</span>'}</div>${renderAttachments(e.attachments||e.attachment||{})}`;el.querySelectorAll('a[href]').forEach(a=>a.onclick=async ev=>{ev.preventDefault();const href=a.href||a.getAttribute('href');if(await routeSchoologyLink(href))return;await A.prepareWebSession();showEmbeddedWeb(href,a.textContent?.trim()||'Link')});await hydrateMediaImages(el)}catch(e){el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}};document.querySelectorAll('#eventTabs [data-event-tab]').forEach(b=>b.onclick=()=>load(b.dataset.eventTab));await load('info');
}
function groupResourceAttachment(item){
  return item?.attachment||item?.attachments||item?.template?.attachment||item?.template?.attachments||item?.template_fields?.attachment||item?.template_fields?.attachments||{};
}
function groupResourceFirst(item,key){
  const a=groupResourceAttachment(item);
  const candidates=[a?.[key]?.[key==='files'?'file':key==='links'?'link':key==='embeds'?'embed':'item'],a?.[key],a?.[key==='files'?'file':key==='links'?'link':key==='embeds'?'embed':'item']];
  for(const v of candidates){if(Array.isArray(v)&&v.length)return v[0];if(v&&typeof v==='object')return v;}
  return null;
}
function groupResourceDestination(item){
  const f=groupResourceFirst(item,'files'), l=groupResourceFirst(item,'links'), e=groupResourceFirst(item,'embeds');
  const converted=String(f?.converted_status||f?.convertedStatus||'').toLowerCase()==='success';
  const fileUrl=converted?(f?.file_converted_download_url||f?.fileConvertedDownloadURL||f?.converted_download_path||f?.convertedDownloadPath):(f?.file_download_url||f?.fileDownloadURL||f?.download_path||f?.downloadPath||f?.url||f?.download_url||f?.downloadUrl);
  const linkUrl=l?.url||l?.link_url||l?.linkURL||l?.linkUrl||l?.href;
  const embedUrl=e?.embed_url||e?.embedURL||e?.url;
  return fileUrl||linkUrl||embedUrl||item?.download_path||item?.downloadPath||item?.converted_download_path||item?.convertedDownloadPath||item?.file_url||item?.fileUrl||item?.download_url||item?.downloadUrl||item?.web_url||item?.webUrl||item?.url||item?.href||item?.location||item?.launch_url||item?.launchUrl||'';
}
async function openGroupResourceItem(d,b,gid){
  const t=String(d.template_type||d.templateType||d.type||'').toLowerCase(), dt=String(d.document_type||d.documentType||d.template?.template_document_type||d.template?.templateDocumentType||d.template_fields?.document_type||d.template_fields?.documentType||'').toLowerCase();
  if(t==='folder'){await showGroupResourceFolder(gid,d.id||d.folder_id||d.folderId,d.title||d.template_title||'Folder',d.collection_id||d.collectionID||d.collectionId);return;}
  if(t==='assignment'){const u=groupResourceDestination(d)||`https://app.schoology.com/assignment/${d.id}`;await A.prepareWebSession();showEmbeddedWeb(u,d.title||d.name||'Assignment');return;}
  if(['link','web_content','external_tool','embed','video'].includes(t)||['link','external_tool','embed','video'].includes(dt)){const u=groupResourceDestination(d);if(u){const result=await A.openExternal(u);if(typeof result==='string'&&result)throw new Error(result);return;}}
  const u=groupResourceDestination(d);if(!u)throw new Error('Schoology did not provide a resource URL.');
  const f=groupResourceFirst(d,'files');const filename=f?.filename||f?.fileName||d.filename||d.fileName||d.title||d.name||'Schoology file';const mime=f?.filemime||f?.fileMIME||f?.converted_filemime||f?.convertedFileMime||d.filemime||d.fileMIME||'application/octet-stream';
  if(dt==='link'||t==='link'){const result=await A.openExternal(u);if(typeof result==='string'&&result)throw new Error(result);return;}
  const r=await downloadWithFeedback(b,{url:u,filename,mime});const err=await A.openDownloadedFile({path:r.path});if(typeof err==='string'&&err)alert(err);
}
async function openSchoolProfile(schoolId,title='School'){
  const c=document.getElementById('content');if(!c)return;
  state.embeddedTitle=title;state.embeddedTheme='school-profile';state.embeddedCanOpenExternal=false;state.embeddedReturn={tab:state.tab,homeTab:state.homeTab,title:state.toolbarTitle,group:state.currentGroup,groupTab:state.groupTab,course:state.selectedCourse,courseTab:state.courseTab};state.toolbarTitle=title;state.schoolProfile={schoolId,tab:'updates'};syncToolbar();
  c.innerHTML=`<section class="schoolProfileNativePage"><div class="schoolProfileLoading"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></section>`;
  try{
    const x=await A.api({path:`schools/${schoolId}`,params:{}});const sch=x?.school||x||{};const schoolTitle=sch?.title||sch?.name||title;state.toolbarTitle=schoolTitle;syncToolbar();
    const image=normalizeImageUrl(sch?.picture_url||sch?.pictureUrl||sch?.picture||sch?.image||'');
    c.innerHTML=`<section class="schoolProfileNativePage"><div class="schoolProfileLandscapeSplit"><section class="schoolProfileMainPane"><div class="schoolProfileTabs">${[['updates','Updates'],['info','Info'],['upcoming','Upcoming'],['resources','Resources'],['discussions','Discussions']].map(([id,label])=>`<button class="schoolProfileTab ${id==='updates'?'active':''}" data-school-profile-tab="${id}" ${id==='upcoming'?'data-school-profile-upcoming-tab="true"':''}>${label}</button>`).join('')}</div><div class="schoolProfileHeader"><div class="schoolProfileHeaderImage">${image?`<img data-media-image-url="${esc(image)}" alt="">`:`<img src="../assets/icons/group_default_website.png" alt="">`}</div><div class="schoolProfileHeaderText"><h1>${esc(schoolTitle)}</h1></div></div><div class="schoolProfileDivider"></div><div id="schoolProfileTabContent" class="schoolProfileTabContent"></div></section><aside id="schoolProfileUpcomingPane" class="schoolProfileUpcomingPane"><div class="homePaneHeader">Upcoming</div><div id="schoolProfileUpcomingContent" class="schoolProfileUpcomingContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></aside></div></section>`;
    await hydrateMediaImages(c);const content=document.getElementById('schoolProfileTabContent');
    const setActive=tab=>document.querySelectorAll('[data-school-profile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.schoolProfileTab===tab));
    const load=async tab=>{state.schoolProfile.tab=tab;setActive(tab);content.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';try{
      if(tab==='info'){const address=[sch.address1,sch.address2,sch.city,sch.state,sch.postal_code,sch.country].filter(v=>v!=null&&String(v).trim()!=='').map(String).join(' ');const rows=[];if(address)rows.push(['Address',address]);if(sch.phone)rows.push(['Phone',String(sch.phone)]);content.innerHTML=rows.length?`<div class="schoolProfileInfoRows">${rows.map(([k,v])=>`<div class="schoolProfileInfoRow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`:'<div class="schoolProfileEmpty">No information available.</div>';return;}
      if(tab==='updates'){const q=await A.api({path:`schools/${schoolId}/updates`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});const arr=q?.update||q?.updates||q?.update_list||[];const ids=[...new Set(arr.map(u=>u.creater_id||u.creator_id||u.created_by||u.user_id||u.uid||u.author_id||u.authorId).filter(Boolean).map(Number))],users={};await Promise.all(ids.map(async id=>{try{const r=await A.api({path:`users/${id}`,params:{}});users[id]=r?.user||r}catch{}}));content.innerHTML=arr.length?`<div class="schoolProfileUpdates">${arr.map(u=>{const id=u.creater_id||u.creator_id||u.created_by||u.user_id||u.uid||u.author_id||u.authorId;const user=users[Number(id)]||{};const name=user.name_display||user.display_name||user.name||u.display_name||u.user_name||u.author_name||'Schoology';const avatar=normalizeImageUrl(user.picture_url||user.pictureUrl||user.picture||user.avatar_url||user.avatarUrl||u.picture_url||u.pictureUrl||'');const initials=String(name).trim().split(/\s+/).slice(0,2).map(v=>v.charAt(0)).join('').toUpperCase()||'S';(()=>{const updateId=u.id||u.update_id||u.updateId||'';const likes=Number(u.likes||u.like_count||u.likeCount||0),comments=Number(u.num_comments||u.comment_count||u.commentCount||u.comments_count||0),liked=!!(u.user_liked||u.liked||u.is_liked);return `<article class="schoolProfileUpdate"><div class="schoolProfileUpdateAuthorRow"><span class="schoolProfileUpdateAvatar">${avatar?`<img data-media-image-url="${esc(avatar)}" alt="">`:`<span>${esc(initials)}</span>`}</span><button type="button" class="schoolProfileUpdateAuthor schoolProfileAuthorLink" data-school-profile-author-id="${esc(id||'')}">${esc(name)}</button></div><div class="schoolProfileUpdateBody">${u.body||u.message||''}</div>${renderAttachments(u.attachments||u.attachment||u.files||{})}<small>${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||''))}</small><div class="activityActions"><button data-school-update-comments="${esc(updateId)}">Comment</button>${comments?`<button data-school-update-comment-count="${esc(updateId)}">${comments}</button>`:''}<button data-school-update-like="${esc(updateId)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}</button>${likes?`<button data-school-update-like-count="${esc(updateId)}">${likes}</button>`:''}</div><div class="updateCommentsPanel" id="school-update-comments-${esc(updateId)}" hidden></div></article>`})()}).join('')}</div>`:'<div class="schoolProfileEmpty">No updates.</div>';await hydrateMediaImages(content);content.querySelectorAll('[data-school-profile-author-id]').forEach(button=>{button.addEventListener('click',()=>{const authorId=button.dataset.schoolProfileAuthorId;if(authorId)openProfileById(authorId,button.textContent||'Profile')})});
      content.querySelectorAll('[data-school-update-like]').forEach(button=>button.onclick=async()=>{const id=button.dataset.schoolUpdateLike;if(!id||button.disabled)return;const liked=button.dataset.liked==='1';button.disabled=true;try{await A.api({path:`like/${id}`,method:'POST',params:{like_action:!liked},json:true});button.dataset.liked=liked?'0':'1';button.textContent=liked?'Like':'Unlike'}catch(e){showAppDialog('Unable to update like',e?.message||String(e)||'Unknown error')}finally{button.disabled=false}});
      content.querySelectorAll('[data-school-update-like-count]').forEach(button=>button.onclick=()=>showLikeUsers(`like/${button.dataset.schoolUpdateLikeCount}`));
      content.querySelectorAll('[data-school-update-comments]').forEach(button=>button.onclick=()=>loadUpdateCommentsPanel('schools',schoolId,button.dataset.schoolUpdateComments,content.querySelector('#school-update-comments-'+CSS.escape(button.dataset.schoolUpdateComments))));
      content.querySelectorAll('[data-school-update-comment-count]').forEach(button=>button.onclick=()=>showUpdateCommentsDialog('schools',schoolId,button.dataset.schoolUpdateCommentCount));return;}
      if(tab==='upcoming'){const q=await A.api({path:`schools/${schoolId}/events`,params:{start:formatApiDate(new Date()),limit:50}});const arr=q?.event||q?.events||[];const address=[sch.address1,sch.address2,sch.city,sch.state,sch.postal_code,sch.country].filter(v=>v!=null&&String(v).trim()!=='').map(String).join(' ');const details=[address,sch.phone].filter(Boolean);content.innerHTML=`<div class="schoolProfileUpcomingSplit"><section class="schoolProfileUpcomingSchool"><h2>${esc(schoolTitle)}</h2><p>Upcoming events at this school</p>${details.map(v=>`<div class="schoolProfileUpcomingDetail">${esc(v)}</div>`).join('')}</section><section class="schoolProfileUpcomingEvents"><div class="schoolProfileUpcomingHeading">Upcoming</div>${arr.length?renderUpcoming(arr):'<div class="schoolProfileEmpty">No upcoming events</div>'}</section></div>`;return;}
      if(tab==='resources'){const q=await A.api({path:`schools/${schoolId}/resources`,params:{start:0,limit:200,with_attachments:'TRUE'}});const arr=q?.resource||q?.resources||q?.resource_list||[];window.__schoolProfileResources=arr;content.innerHTML=arr.length?`<div class="schoolProfileResourceRows">${arr.map((r,i)=>`<button class="schoolProfileResourceRow" data-school-resource-index="${i}"><span>${esc(resourceTitle(r))}</span><span>›</span></button>`).join('')}</div>`:'<div class="schoolProfileEmpty">No resources.</div>';content.querySelectorAll('[data-school-resource-index]').forEach(b=>b.onclick=async()=>{try{await openCollectionResource(window.__schoolProfileResources[+b.dataset.schoolResourceIndex],b)}catch(e){alert('Unable to open resource: '+e.message)}});return;}
      if(tab==='discussions'){let q;try{q=await A.api({path:`schools/${schoolId}/discussions`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}})}catch(e){if(String(e?.message||e).includes('403')){content.innerHTML='<div class="schoolProfileDiscussionFallback"><p>Schoology does not allow this account to list school discussions through the API. Open the official discussions page to view them.</p><button type="button" id="schoolDiscussionsOpen">Open School Discussions</button></div>';document.getElementById('schoolDiscussionsOpen')?.addEventListener('click',async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/school/${schoolId}/discussions`,'Discussions')});return;}throw e;}const arr=q?.discussion||q?.discussions||q?.data?.discussion||[];window.__schoolProfileDiscussions=arr;content.innerHTML=arr.length?`<div class="schoolProfileDiscussionRows">${arr.map((d,i)=>`<button class="schoolProfileDiscussionRow" data-school-discussion-index="${i}"><span><b>${esc(d.title||d.subject||'Discussion')}</b><small>${esc(formatSchoologyDate(d.created||d.timestamp||''))}</small></span><span>›</span></button>`).join('')}</div>`:'<div class="schoolProfileEmpty">No discussions.</div>';content.querySelectorAll('[data-school-discussion-index]').forEach(b=>b.onclick=()=>{const d=window.__schoolProfileDiscussions[+b.dataset.schoolDiscussionIndex];if(d?.id)showDiscussionNative('schools',schoolId,d.id,d.title||d.subject||'Discussion')});return;}
    }catch(e){content.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}};
    const loadSchoolProfileUpcoming=async()=>{const pane=document.getElementById('schoolProfileUpcomingContent');if(!pane)return;try{const q=await A.api({path:`schools/${schoolId}/events`,params:{start:formatApiDate(new Date()),limit:50}});const arr=q?.event||q?.events||[];pane.innerHTML=arr.length?renderUpcoming(arr):`<div class='empty upcomingEmpty'><h2>No upcoming events</h2></div>`;pane.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=()=>{const e=arr.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const type=String(e.type||'').toLowerCase(),aid=e.assignment_id??e.assignmentId??e.assignment?.id,sid=e.section_id??e.sectionId;if(type==='assignment'&&aid&&sid){openWithPressTransition(b,()=>showAssignment(sid,aid));return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id)openWithPressTransition(b,async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})});return}if(type==='event'&&e.id){openWithPressTransition(b,()=>showEventNative('schools',schoolId,e.id,e.title||'Event'));return}if(type==='discussion'&&e.id){openWithPressTransition(b,()=>showDiscussionNative('schools',schoolId,e.id,e.title||'Discussion'));return}if(e.web_url||e.webUrl)openWithPressTransition(b,()=>showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming'))})}catch(e){pane.innerHTML=`<div class='error apiError'>${esc(e.message||String(e))}</div>`}};document.querySelectorAll('[data-school-profile-tab]').forEach(b=>b.onclick=()=>load(b.dataset.schoolProfileTab));await Promise.all([load('updates'),loadSchoolProfileUpcoming()]);
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
}

async function showGroup(group,activeTab='updates'){
  if(!group)return;
  state.currentGroup=group;state.groupTab=activeTab;state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.embeddedTitle=null;state.profileUser=null;state.message=null;state.composeMessage=false;state.toolbarTitle=group.name||group.title||'Group';syncToolbar();
  const c=document.getElementById('content');if(!c)return;
  c.innerHTML='<div class="loading groupTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading group…</span></div>';
  const gid=group.id||group.group_id;
  state.groupCanCreateDiscussion=false;state.groupCanCreateEvent=false;syncToolbar();
  let groupDetail=group;try{const gx=await A.api({path:`groups/${gid}`,params:{}});groupDetail=gx?.group||gx||group}catch{}
  try{
    const permissions=await A.api({path:'multioptions',method:'POST',params:{request:[`/v1/groups/${gid}/discussions`,`/v1/groups/${gid}/events`]}});
    const rows=Array.isArray(permissions?.response)?permissions.response:(Array.isArray(permissions?.responses)?permissions.responses:[]);
    const bodies={};for(const row of rows){if(row?.location){const body=row.body??'';bodies[String(row.location)]=(typeof body==='string'?body:JSON.stringify(body)).toLowerCase()}}
    state.groupCanCreateDiscussion=/\bpost\b/i.test(bodies[`/v1/groups/${gid}/discussions`]||'');
    state.groupCanCreateEvent=/\bpost\b/i.test(bodies[`/v1/groups/${gid}/events`]||'');
  }catch{state.groupCanCreateDiscussion=false;state.groupCanCreateEvent=false;}
  if(state.currentGroup===group)syncToolbar();
  let groupSchoolId=groupDetail?.school_id??groupDetail?.schoolId;
  let groupSchool='';
  if(groupSchoolId){try{const sx=await A.api({path:`schools/${groupSchoolId}`,params:{}});const sch=sx?.school||sx;groupSchool=String(sch?.title||sch?.name||'')}catch{}}
  c.innerHTML=`<section class="groupProfilePage"><div class="groupLandscapeSplit"><section class="groupMainPane"><div class="groupTabs">${['updates','upcoming','discussions','albums','resources'].map((id)=>`<button class="groupTab ${activeTab===id?'active':''} ${id==='upcoming'?'groupUpcomingTab':''}" data-group-tab="${id}">${({updates:'Updates',upcoming:'Upcoming',discussions:'Discussions',albums:'Albums',resources:'Resources'})[id]}</button>`).join('')}</div><div class="groupHeader"><div class="groupHero">${group.picture_url||group.pictureUrl?`<img src="${esc(normalizeImageUrl(group.picture_url||group.pictureUrl))}" alt="">`:`<span>${esc(String(group.name||group.title||'G').charAt(0))}</span>`}</div><div><h1>${esc(group.name||group.title||'Group')}</h1><button class="groupSchoolLink" data-group-school-id="${esc(groupSchoolId||'')}" type="button">${esc(groupSchool)}</button></div></div><div id="groupTabContent"></div></section><aside id="groupUpcomingPane" class="groupUpcomingPane"><div class="homePaneHeader">Upcoming</div><div id="groupUpcomingContent"><div class="loading groupTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></aside></div></section>`;
  const gc=document.getElementById('groupTabContent');
  document.querySelector('[data-group-school-id]')?.addEventListener('click',async e=>{const b=e.currentTarget;const id=Number(b?.dataset?.groupSchoolId);if(id)openSchoolProfile(id,b.textContent||'School')});
  const loadGroupUpcoming=async()=>{const up=document.getElementById('groupUpcomingContent');if(!up)return;try{const x=await A.api({path:`groups/${gid}/events`,params:{start:formatApiDate(new Date()),limit:20}});const a=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool','event'].includes(String(e.type||'')));up.innerHTML=a.length?renderUpcoming(a):'<div class="empty upcomingEmpty"><h2>No upcoming events</h2></div>';up.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=()=>{const e=a.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const aid=e.assignment_id??e.assignmentId??e.assignment?.id;if(String(e.type||'').toLowerCase()==='assignment'&&aid){openWithPressTransition(b,()=>showAssignment(gid,aid));}else if(['assessment','assessment_v2','managed_assessment','quiz'].includes(String(e.type||'').toLowerCase())){const id=aid??e.id;openWithPressTransition(b,async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})})}else if(String(e.type||'').toLowerCase()==='event'&&e.id){openWithPressTransition(b,()=>showEventNative('groups',gid,e.id,e.title||'Event'));}})}catch(e){up.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}};
  const load=async(tab)=>{
    state.groupTab=tab;document.querySelectorAll('[data-group-tab]').forEach(b=>b.classList.toggle('active',b.dataset.groupTab===tab));
    gc.innerHTML='<div class="loading groupTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
    try{
      if(tab==='updates'){
        const x=await A.api({path:`groups/${gid}/updates`,params:{start:0,limit:20,with_attachments:'TRUE',richtext:1}});
        const a=x.update||x.updates||x.update_list||[];
        const ids=[...new Set(a.map(u=>u.user_id||u.uid||u.author_id||u.authorId).filter(Boolean).map(Number))], users={};
        await Promise.all(ids.map(async id=>{try{const q=await A.api({path:`users/${id}`,params:{}});users[id]=q?.user||q}catch{}}));
        gc.innerHTML=a.length?a.map(u=>{
          const au=users[Number(u.user_id||u.uid||u.author_id||u.authorId)]||{};
          const name=u.display_name||u.author_name||au.name_display||au.display_name||au.name||'Schoology';
          const avatar=normalizeImageUrl(au.picture_url||au.pictureUrl||au.picture||au.photo_url||'');
          const updateId=u.id||u.update_id||u.updateId||'';
          const likes=Number(u.likes||u.like_count||u.likeCount||0), comments=Number(u.num_comments||u.comment_count||u.commentCount||u.comments_count||0), liked=!!(u.user_liked||u.liked||u.is_liked);
          return `<article class="androidActivityCard groupFullUpdate"><div class="activityHeader">${avatar?`<img class="activityAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="activityAvatar">${esc(String(name).charAt(0))}</span>`}<button class="activityUser activityAuthorLink" data-author-id="${esc(u.user_id||u.uid||u.author_id||u.authorId||u.creator_id||u.creatorId||'')}">${esc(name)}</button></div><div class="activityBody">${u.body||u.message||''}</div>${renderAttachments(u.attachments||u.attachment||u.files||{})}<div class="activityMeta">${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</div><div class="activityActions"><button data-group-update-comments="${esc(updateId)}">Comment</button>${comments?`<button data-group-update-comment-count="${esc(updateId)}">${comments}</button>`:''}<button data-group-update-like="${esc(updateId)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}</button>${likes?`<button data-group-update-like-count="${esc(updateId)}">${likes}</button>`:''}</div><div class="updateCommentsPanel" id="group-update-comments-${esc(updateId)}" hidden></div></article>`;
        }).join(''):'<div class="empty">No updates.</div>';
        await hydrateMediaImages(gc);
        gc.querySelectorAll('[data-author-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.authorId;if(id)openProfileById(id,b.textContent||'Profile')});
        gc.querySelectorAll('[data-group-update-like]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.groupUpdateLike;if(!id||btn.disabled)return;const liked=btn.dataset.liked==='1';btn.disabled=true;try{await A.api({path:`like/${id}`,method:'POST',params:{like_action:!liked},json:true});btn.dataset.liked=liked?'0':'1';btn.textContent=liked?'Like':'Unlike'}catch(e){showAppDialog('Unable to update like',e?.message||String(e)||'Unknown error')}finally{btn.disabled=false}});
        gc.querySelectorAll('[data-group-update-like-count]').forEach(btn=>btn.onclick=()=>showLikeUsers(`like/${btn.dataset.groupUpdateLikeCount}`));
        gc.querySelectorAll('[data-group-update-comments]').forEach(btn=>btn.onclick=()=>loadUpdateCommentsPanel('groups',gid,btn.dataset.groupUpdateComments,gc.querySelector('#group-update-comments-'+CSS.escape(btn.dataset.groupUpdateComments))));
        gc.querySelectorAll('[data-group-update-comment-count]').forEach(btn=>btn.onclick=()=>showUpdateCommentsDialog('groups',gid,btn.dataset.groupUpdateCommentCount));
      }
      else if(tab==='upcoming'){const x=await A.api({path:`groups/${gid}/events`,params:{start:formatApiDate(new Date()),limit:20}});const a=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool','event'].includes(String(e.type||'')));gc.innerHTML=a.length?renderUpcoming(a):'<div class="empty upcomingEmpty"><h2>No upcoming events</h2></div>';}
      else if(tab==='discussions'){
        const x=await A.api({path:'groups/'+gid+'/discussions',params:{limit:50}});
        const a=x.discussion||x.discussions||[];
        const ids=[...new Set(a.map(d=>Number(d.creater_id??d.creator_id??d.created_by??d.user_id??d.uid??d.author_id??0)).filter(Boolean))],users={};
        await Promise.all(ids.map(async id=>{try{const response=await A.api({path:'users/'+id,params:{picture_size:'sm'}});users[id]=response?.user||response?.data?.user||response?.data||response}catch{}}));
        gc.innerHTML=a.length?a.map(d=>{
          const creator=Number(d.creater_id??d.creator_id??d.created_by??d.user_id??d.uid??d.author_id??0),user=users[creator]||{};
          const author=user.name_display||user.display_name||user.name||d.display_name||d.user_name||d.author_name||(creator?('User '+creator):'Unknown author');
          return '<button class="groupDiscussionRow" data-group-discussion-id="'+esc(d.id||d.discussion_id||'')+'"><img src="../assets/icons/ic_discussion.png" alt=""><span><b>'+esc(d.title||'Discussion')+'</b><small>Created by '+esc(author)+'</small></span></button>';
        }).join(''):'<div class="empty">No discussions.</div>';
        gc.querySelectorAll('[data-group-discussion-id]').forEach(b=>b.onclick=async()=>{const d=a.find(v=>String(v.id||v.discussion_id||'')===String(b.dataset.groupDiscussionId));if(!d)return;try{await showDiscussionNative('groups',gid,d.id||d.discussion_id,d.title||'Discussion')}catch(e){alert('Unable to open discussion: '+e.message)}});
      }else if(tab==='albums'){const x=await A.api({path:`groups/${gid}/albums`,params:{limit:50}});const a=x.album||x.albums||[];gc.innerHTML=a.length?a.map((d,i)=>`<button class="albumListRow" data-group-album-index="${i}"><img src="../assets/icons/ic_albums.png" alt=""><span><b>${esc(d.title||d.name||'Album')}</b><small>${esc([d.photo_count||d.photoCount,d.audio_count||d.audioCount,d.video_count||d.videoCount].filter(Boolean).join(', '))}</small></span><span>›</span></button>`).join(''):'<div class="empty">No albums.</div>';window.__groupAlbums=a;gc.querySelectorAll('[data-group-album-index]').forEach(b=>b.onclick=()=>{const d=window.__groupAlbums[+b.dataset.groupAlbumIndex];showGroupAlbumNative(gid,d.id||d.album_id,d.title||d.name||'Album')});}
      else {const x=await A.api({path:`groups/${gid}/resources`,params:{limit:50,with_attachments:'TRUE'}});const a=x.resource||x.resources||x.collection||x.items||[];gc.innerHTML=a.length?a.map((d,i)=>`<button class="groupRow groupResourceRow" data-group-resource-index="${i}"><span class="officialMaterialIcon"><img src="../assets/icons/${materialIconForType(d)}" alt=""></span><span><b>${esc(d.title||d.template_title||d.name||'Resource')}</b></span><span>›</span></button>`).join(''):'<div class="empty">No resources.</div>';window.__groupResources=a;gc.querySelectorAll('[data-group-resource-index]').forEach(b=>b.onclick=async()=>{const d=window.__groupResources[+b.dataset.groupResourceIndex];try{await openGroupResourceItem(d,b,gid)}catch(e){alert('Unable to open resource: '+e.message)}}); }
    }catch(e){gc.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
  };
  document.querySelectorAll('[data-group-tab]').forEach(b=>b.onclick=()=>load(b.dataset.groupTab));
  loadGroupUpcoming();
  await load(activeTab);
}
async function showGroupResourceFolder(gid,folderId,title,collectionId){
  const gc=document.getElementById('groupTabContent');if(!gc)return;
  gc.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
  try{
    const cid=Number(collectionId||state.resourceCollection?.collection_id||state.resourceCollection?.id||0);const x=cid?await A.api({path:`collections/${cid}/resources`,params:{f:folderId,limit:50,with_attachments:'TRUE'}}):await A.api({path:`groups/${gid}/resources`,params:{f:folderId,limit:50,with_attachments:'TRUE'}});const a=x.resource||x.resources||x.collection||x.items||[];
    gc.innerHTML=`<button class="folderInlineBack" id="groupFolderBack">${officialBackIcon()}&nbsp; ${esc(title||'Back')}</button>`+(a.length?a.map((d,i)=>`<button class="groupRow" data-group-folder-resource="${i}"><span class="officialMaterialIcon"><img src="../assets/icons/${materialIconForType(d)}" alt=""></span><span><b>${esc(d.title||d.template_title||d.name||'Resource')}</b></span><span>›</span></button>`).join(''):'<div class="empty">No resources.</div>');
    document.getElementById('groupFolderBack')?.addEventListener('click',()=>showGroup(state.currentGroup,'resources'));
    window.__groupFolderResources=a;
    gc.querySelectorAll('[data-group-folder-resource]').forEach(b=>b.onclick=async()=>{const d=window.__groupFolderResources[+b.dataset.groupFolderResource];try{await openGroupResourceItem(d,b,gid)}catch(e){alert('Unable to open resource: '+e.message)}});
  }catch(e){gc.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}
}

async function loadMessageThread(m){
  try{
    const id=m?.id||m?.message_id||m?.messageId; if(!id)throw new Error('Message ID is missing.');
    let folder=state.messageFolder||'inbox'; let x; const params={with_attachments:'TRUE'}; if(folder==='view'){try{x=await A.api({path:`messages/inbox/${id}`,params});const result=x?.data||x;const entries=result?.message||result?.messages;if(!entries||(Array.isArray(entries)&&!entries.length))throw new Error('Message was not found in inbox');folder='inbox';}catch{x=await A.api({path:`messages/sent/${id}`,params});folder='sent';}state.messageFolder=folder;state.messageTab=folder;}else{x=await A.api({path:`messages/${folder}/${id}`,params});}
    const payload=x?.data||x; const raw=payload?.message||payload?.messages||[]; const msgs=Array.isArray(raw)?raw:(raw?.message||raw?.messages||[]); const users={};
    const userList=payload?.user||payload?.users||payload?.data?.user||payload?.data?.users||[];
    for(const u of (Array.isArray(userList)?userList:[userList])){const id=Number(u?.id||u?.user_id||u?.uid||0);if(id)users[id]=u?.user||u}
    const ids=[...new Set(msgs.flatMap(v=>[v.author_id,v.authorId,v.author?.id,v.author?.user_id,v.user_id,v.uid,v.sender_id,v.senderId,v.sender?.id,v.sender?.user_id].map(Number).filter(Boolean)))];
    await Promise.all(ids.filter(id=>!users[id]).map(async uid=>{try{const u=await A.api({path:`users/${uid}`,params:{}});users[uid]=u?.user||u}catch{}}));
    state.messageThread={messages:msgs,users}; render(); await hydrateMediaImages(document.querySelector('.messageDetail')); document.getElementById('messageRefresh')?.addEventListener('click',async()=>{const b=document.getElementById('messageRefresh');b?.classList.add('spinning');await loadMessageThread(m);b?.classList.remove('spinning')}); document.getElementById('messageReply')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();showComposeMessage(m,true)});
    if(folder==='inbox')try{await A.api({path:`messages/inbox/${id}`,method:'PUT',params:{message_status:'read'},json:true})}catch{}
  }catch(e){state.messageThread={messages:[],users:{},error:e.message};render();const el=document.querySelector('.messageDetail');if(el)el.innerHTML=`<div class="error apiError">Unable to load this message.<br>${esc(e.message)}</div>`}
}

function showComposeMessage(replyMessage=null,isReply=false){
  state.composeMessage=true;
  document.getElementById('composeMessageDialog')?.remove();
  const wrap=document.createElement('div');wrap.id='composeMessageDialog';wrap.className='assignmentCommentDialogOverlay';wrap.innerHTML=`<section class="composeMessageDialog"><div class="androidCommentDialogBar"><button id="composeMessageCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">${isReply?'Reply':'New Message'}</div><button id="sendMessage" class="androidDialogIcon" aria-label="Send">${officialIcon('ic_action_send_icon.png','Send')}</button></div><div class="composeMessagePage">${isReply?'':`<div class="composeField recipientField"><label>To</label><input id="composeToSearch" autocomplete="off" placeholder="Search for a recipient"><div id="recipientSuggestions" class="recipientSuggestions"></div><div id="recipientChips" class="recipientChips"></div><input id="composeTo" type="hidden"></div><div class="composeField"><label>Subject</label><input id="composeSubject" placeholder="Subject"></div>`}<div class="composeField composeBody"><label>Message</label><textarea id="composeBody" placeholder="Write a message…"></textarea></div><div class="messageAttachmentChoices"><button id="messageAttachFile" type="button">${officialOrAssetIcon('ic_action_ic_menu_folder.png','File')}File</button><button id="messageAttachResource" type="button"><img src="../assets/icons/ic_attach_resourcesv3.png" alt="">Resource</button></div><div id="messageAttachmentList"></div><div id="composeStatus"></div></div></section>`;
  document.body.appendChild(wrap);
  wrap.style.zIndex='2147483647';
  const closeCompose=()=>{state.composeMessage=false;wrap.remove();syncToolbar()};
  wrap.querySelector('#composeMessageCancel')?.addEventListener('click',closeCompose);
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeCompose()});
  const selected=[]; const attachments={files:[],resources:[]}; if(isReply&&replyMessage){const replySource=replyMessage||state.messageThread?.messages?.[state.messageThread.messages.length-1]||{};const authorId=replySource.author_id||replySource.authorId||replySource.author?.id||replySource.author?.user_id||replySource.sender_id||replySource.senderId||replySource.sender?.id||replySource.sender?.user_id||replySource.user_id||replySource.uid; if(authorId)selected.push({id:Number(authorId),name:replySource.author?.name_display||replySource.author?.display_name||replySource.author?.name||replySource.sender?.name_display||replySource.sender?.display_name||replySource.sender?.name||'Reply recipient'});}
  const search=document.getElementById('composeToSearch'), suggestions=document.getElementById('recipientSuggestions'), chips=document.getElementById('recipientChips');
  const renderRecipients=()=>{chips.innerHTML=selected.map((u,i)=>`<span class="recipientChip">${esc(u.name)} <button type="button" data-remove-recipient="${i}">×</button></span>`).join('');document.getElementById('composeTo').value=selected.map(u=>u.id).join(',');chips.querySelectorAll('[data-remove-recipient]').forEach(b=>b.onclick=()=>{selected.splice(+b.dataset.removeRecipient,1);renderRecipients()})};
  if(isReply){document.querySelector('.recipientField')?.remove();document.querySelector('#composeSubject')?.closest('.composeField')?.remove();}
  document.getElementById('messageAttachFile')?.addEventListener('click',async()=>{try{const p=await A.pickFile();if(!p)return;const fp=typeof p==='string'?p:p.path;const fid=await A.uploadSchoologyFile({filePath:fp,mime:typeof p==='object'?p.mime:''});attachments.files.push(String(fid));document.getElementById('messageAttachmentList').innerHTML+=`<div class="messageAttachedItem">${esc(typeof p==='object'&&p.name?p.name:fp.split(/[\\/]/).pop())}</div>`}catch(e){showAppDialog('Unable to attach file',e.message||String(e))}});
  document.getElementById('messageAttachResource')?.addEventListener('click',()=>chooseSchoologyResource(r=>{const id=r.template_id??r.templateID??r.resource_id??r.resourceId??r.template?.id??r.id;if(id!=null){attachments.resources.push(String(id));document.getElementById('messageAttachmentList').innerHTML+=`<div class="messageAttachedItem">${esc(r.template_title||r.title||r.name||'Resource')}</div>`}},'Attach Resource'));
  let searchTimer=null; search?.addEventListener('input',()=>{clearTimeout(searchTimer);const q=search.value.trim();if(q.length<2){suggestions.innerHTML='';return}searchTimer=setTimeout(async()=>{try{const x=await A.api({path:'messages/recipients',params:{name:q,limit:10}});const arr=x.user||x.users||x.recipient||x.recipients||[];suggestions.innerHTML=arr.map(u=>`<button type="button" class="recipientSuggestion" data-recipient-id="${esc(u.id)}" data-recipient-name="${esc(u.name_display||u.nameDisplay||u.display_name||u.name||'User')}">${esc(u.name_display||u.nameDisplay||u.display_name||u.name||'User')}</button>`).join('')||'<div class="recipientNone">No recipients found.</div>';suggestions.querySelectorAll('[data-recipient-id]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.recipientId),name=b.dataset.recipientName;if(id&&!selected.some(u=>u.id===id)){selected.push({id,name});renderRecipients()}search.value='';suggestions.innerHTML=''})}catch(e){suggestions.innerHTML=`<div class="recipientNone">${esc(e.message)}</div>`}},250)});
  document.getElementById('sendMessage')?.addEventListener('click',async()=>{
    const to=document.getElementById('composeTo')?.value.trim(),subject=document.getElementById('composeSubject')?.value.trim(),message=document.getElementById('composeBody')?.value.trim();
    const st=document.getElementById('composeStatus'); if((!isReply&&(!to||!selected.length))||!message){if(st)st.textContent=isReply?'Enter a message.':(!to?'Enter a recipient and message.':'Choose a recipient from the suggestions before sending.');return}
    const ids=selected.map(u=>u.id).join(',');
    try{if(st)st.textContent='Sending…';const params=isReply?{message}:{recipient_ids:selected.map(u=>Number(u.id)).filter(Number.isFinite),subject:subject||'',message};if(attachments.files.length)params['file-attachment']={id:attachments.files};if(attachments.resources.length)params.attachments=attachments.resources.map(resource=>({resource:Number(resource)}));const endpoint=isReply?`messages/${replyMessage?.id||replyMessage?.message_id||replyMessage?.messageId}`:'messages';await A.api({path:endpoint,method:'POST',params,json:true});if(st)st.textContent='Message sent.';setTimeout(()=>{state.composeMessage=false;state.toolbarTitle='Messages';state.messageTab='sent';wrap.remove();render();loadTab()},350)}catch(e){if(st)st.textContent='Unable to send message: '+(e?.message||String(e)||'Unknown error')}
  });
}

function resourceIconMarkup(name,alt=''){return officialOrAssetIcon(String(name||'attachment_document_icon.png'),alt)}
function resourceIconForType(type,title,item={}){
 const t=String(type||'').toLowerCase();
 const dt=String(item.document_type||item.documentType||item.template?.template_document_type||item.template?.templateDocumentType||item.template_fields?.document_type||item.template_fields?.documentType||'').toLowerCase();
 if(t==='assessment')return 'ic_test_quiz.png';
 if(t==='assessment_v2'||t==='managed_assessment'||t==='quiz')return 'ic_assessment_48dp.png';
 if(t==='assignment')return 'ic_assignment.png';
 if(t==='discussion')return 'ic_discussion.png';
 if(t==='page')return 'ic_pages.png';
 if(t==='album')return 'ic_albums.png';
 if(t==='scorm')return 'ic_scorm.png';
 if(t==='web_package'||t==='web_content')return 'ic_web_content.png';
 if(t==='folder'){const color=String(item.color||item.folder_color||item.folderColor||'black').toLowerCase();const allowed=['black','blue','gray','green','orange','pink','purple','red','yellow'];return `ic_folder_${allowed.includes(color)?color:'black'}.png`;}
 if(t==='document'){
   if(dt==='link')return 'ic_files_links.png';
   if(dt==='embed')return 'attachment_link_icon.png';
   if(dt==='external_tool')return 'ic_web_content.png';
   if(dt==='file'){
     const n=String(title||'').replaceAll('#','').toLowerCase();
     const mt=String(item?.filemime||item?.fileMIME||item?.converted_filemime||item?.convertedFileMime||item?.mime||'').toLowerCase().split(';')[0].trim();
     const guess=mt||({pdf:'application/pdf',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',csv:'text/csv',zip:'application/zip',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',mp4:'video/mp4',mov:'video/quicktime',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'}[n.split('.').pop()]||'');
     if(guess.startsWith('video')||guess.startsWith('audio'))return 'ic_attach_audio.png';
     if(guess.startsWith('text'))return 'ic_attach_text.png';
     if(guess.startsWith('image'))return 'ic_attach_image.png';
     if(guess.startsWith('application')){
       if(guess.includes('pdf'))return 'ic_attach_app_pdf.png';
       if(guess.includes('presentation')||guess.includes('powerpoint'))return 'ic_attach_app_ppt.png';
       if(guess.includes('sheet')||guess.includes('excel'))return 'ic_attach_app_excel.png';
       if(guess.includes('document')||guess.includes('text')||guess.includes('msword'))return 'ic_attach_app_word.png';
       if(guess.includes('zip'))return 'ic_attach_app_zip.png';
     }
     return 'attachment_document_icon.png';
   }
 }
 if(t==='link')return 'ic_files_links.png';
 return 'attachment_document_icon.png';
}
function collectionIcon(type){return type==='shared'?'ic_collection.png':type==='groups'?'home_dash_groups.png':type==='apps'?'ic_resourceapps.png':'ic_eportfolio.png'}
function resourceAttachment(item){let a=item?.attachments??item?.attachment??item?.template?.attachments??item?.template?.attachment??item?.template_fields?.attachments??item?.template_fields?.attachment??{};if(Array.isArray(a))a=a[0]||{};if(a?.attachments&&!a.links&&!a.files&&!a.embeds)a=a.attachments;return a||{};}
function firstAttachment(item,key){const a=resourceAttachment(item);const x=a?.[key]?.[key==='files'?'file':key==='links'?'link':key==='embeds'?'embed':'item']||a?.[key]||a?.[key==='files'?'file':key==='links'?'link':key==='embeds'?'embed':'item'];return Array.isArray(x)?x[0]:x;}
function resourceDocumentType(item){return String(item?.document_type||item?.documentType||item?.template?.template_document_type||item?.template?.templateDocumentType||item?.template_fields?.document_type||item?.template_fields?.documentType||'').toLowerCase();}
function resourceTitle(item){return item?.template_title||item?.templateTitle||item?.title||item?.name||item?.filename||'Resource';}
function resourceType(item){return String(item?.template_type||item?.templateType||item?.type||'').toLowerCase();}
async function openCollectionResource(item,button){
 const t=resourceType(item),dt=resourceDocumentType(item),title=resourceTitle(item);
 if(t==='folder'){await openResourceCollection({...item,collection_id:item.collection_id||item.collectionID||state.resourceCollection?.collection_id||state.resourceCollection?.id,folder_id:item.id||item.template_id||item.templateID},button);return}
 if(['assignment','assessment','assessment_v2','managed_assessment','discussion','page','album','scorm','web_package','web_content'].includes(t)){
   const id=item.id||item.template_id||item.templateID||item.collection_id;
   if(id){await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/${t==='assignment'?'assignment':t==='assessment'?'assignment':t}/${id}`,title);return}
 }
 if(t==='document'){
   if(dt==='link'){
     const link=firstAttachment(item,'links');let u=link?.link_url||link?.linkURL||link?.url||link?.href||item.url||item.web_url||item.webUrl;
     if(u){u=normalizeSchoologyWebUrl(u);const result=await A.openExternal(u);if(typeof result==='string'&&result)throw new Error(result);return}
   }
   if(dt==='embed'){
     const embed=firstAttachment(item,'embeds');const code=embed?.embed_code||embed?.embedCode;
     if(code){showEmbeddedWeb('data:text/html;charset=utf-8,'+encodeURIComponent(code),title,{allowBrowser:false});return}
   }
   if(dt==='external_tool'){
     const u=item.launch_url||item.launchUrl||item.web_url||item.webUrl||item.url||item.href;
     if(u){const result=await A.openExternal(u);if(typeof result==='string'&&result)throw new Error(result);return}
   }
   if(dt==='file'){
     const f=firstAttachment(item,'files');const u=f?.resolveDownloadUrl||f?.file_download_url||f?.fileDownloadURL||f?.download_path||f?.downloadPath||f?.converted_download_path||f?.convertedDownloadPath;
     if(u){const filename=f?.filename||f?.fileName||title;const mime=f?.filemime||f?.fileMIME||f?.converted_filemime||f?.convertedFileMime||'application/octet-stream';const r=await downloadWithFeedback(button,{url:u,filename,mime});const err=await A.openDownloadedFile({path:r.path});if(typeof err==='string'&&err)alert(err);return}
   }
 }
 const u=item.web_url||item.webUrl||item.url||item.href||item.location||item.download_path||item.downloadPath||item.file_url||item.fileUrl;
 if(u){const result=await A.openExternal(u);if(typeof result==='string'&&result)throw new Error(result);return}
 throw new Error('Schoology did not provide a destination for this resource.');
}
function setResourceLoading(button,text='Loading…'){
 const c=document.getElementById('content');if(!c)return()=>{};
 const old=c.querySelector('.resourceActionLoading');if(old)old.remove();
 const overlay=document.createElement('div');overlay.className='resourceActionLoading';overlay.innerHTML=`<img src="../assets/android_loading_spinner_72.gif" alt=""><span>${esc(text)}</span>`;c.appendChild(overlay);
 if(button){button.disabled=true;button.classList.add('resourceBusy')}
 return()=>{overlay.remove();if(button){button.disabled=false;button.classList.remove('resourceBusy')}};
}
async function loadResourcesHome(c){
 c.innerHTML='<section class="resourcesAndroidPage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></section>';
 const x=await A.api({path:'collections',params:{limit:200}}); const appsX=await A.api({path:'resource_apps',params:{limit:200}}).catch(()=>({}));
 const all=x.collection||x.collections||x.collection_list||[]; const apps=appsX.resource_apps||appsX.resourceApps||appsX.collection||appsX.collections||[];
 const uid=state.auth?.userId||state.auth?.user?.id; const groups=[],shared=[],mine=[];
 all.forEach(o=>{const owner=Number(o.collection_owner_id??o.collectionOwnerId??o.uid??o.owner_id??0), realmRaw=o.collection_realm??o.collectionRealm??o.realm??null, realm=String(realmRaw??'').toLowerCase(), sharedCount=Number(o.shared_users_count??o.sharedUsersCount??o.shared_users??0);if(realmRaw==null&&owner===Number(uid))mine.push(o);else if(sharedCount>0)shared.push(o);else if(realm==='group')groups.push(o)});
 const categories=[['mine','My Resources',mine],['shared','Shared',shared],['groups','Groups',groups],['apps','Resource Apps',apps]];
 c.innerHTML=`<section class="resourcesAndroidPage"><div class="resourceCategoryList">${categories.map(([key,label,list])=>`<section class="resourceCategory"><button class="resourceCategoryHeader" data-resource-category="${key}"><img src="../assets/icons/${collectionIcon(key)}" alt=""><b>${esc(label)}</b><span class="resourceChevron">›</span></button><div class="resourceCategoryChildren" id="resource-${key}">${list.length?list.map((o,i)=>`<button class="resourceCollectionRow" data-resource-collection="${key}" data-resource-index="${i}">${key==='apps'?(o.app_logo||o.appLogo?`<img class="resourceAppLogo" data-media-image-url="${esc(normalizeImageUrl(o.app_logo||o.appLogo))}" alt="" style="display:none"><img class="resourceAppFallback" src="../assets/icons/ic_menu_post.png" alt="">`:`<img src="../assets/icons/ic_menu_post.png" alt="">`):`<img src="../assets/icons/${o.collection_type_id==3?'ic_eportfolio.png':'ic_collection.png'}" alt="">`}<span><b>${esc(o.collection_title||o.title||o.name||'Resource')}</b></span><span>›</span></button>`).join(''):'<div class="resourceEmpty">No resources</div>'}</div></section>`).join('')}</div></section>`;
 window.__resourceCategories=Object.fromEntries(categories.map(([k,l,a])=>[k,a])); await hydrateMediaImages(c);
 document.querySelectorAll('[data-resource-category]').forEach(b=>b.onclick=()=>b.parentElement.classList.toggle('open'));
 document.querySelectorAll('[data-resource-collection]').forEach(b=>b.onclick=async()=>{const col=window.__resourceCategories[b.dataset.resourceCollection][+b.dataset.resourceIndex];const stop=setResourceLoading(b,'Loading resources…');try{if(b.dataset.resourceCollection==='apps'){const j=await A.launchCourseApp({appId:col.collection_id||col.collectionID||col.id});const url=j?.url||j?.launch_token_url||j?.launchTokenUrl||j?.data?.url||j?.data?.launchTokenUrl;if(!url)throw new Error('Schoology did not return a resource-app launch URL.');await A.openExternal(url).then(result=>{if(typeof result==='string'&&result)showAppDialog('Unable to open resource app',result)})}else await openResourceCollection(col,b)}catch(e){alert('Unable to open resource: '+e.message)}finally{stop()}});
}
async function openResourceCollection(col){
 const c=document.getElementById('content');if(!c)return;state.resourceCollection=col;state.toolbarTitle=col.collection_title||col.title||col.name||'Resources';syncToolbar();
 const id=col.collection_id||col.collectionID||col.id;if(!id)return;
 const folderId=col.folder_id||col.folderId||col.collection_folder_id||col.collectionFolderId||0;
 c.innerHTML='<section class="resourcesAndroidPage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading resources…</span></div></section>';
 try{const x=await A.api({path:`collections/${id}/resources`,params:{start:0,limit:200,with_attachments:'TRUE',...(folderId?{f:folderId}:{})}});const arr=x.resource||x.resources||x.resource_list||[];c.innerHTML=`<section class="resourcesAndroidPage"><div class="resourceRows">${arr.length?arr.map((r,i)=>{const title=resourceTitle(r),type=resourceType(r);return `<button class="resourceFileRow" data-resource-item-index="${i}">${resourceIconMarkup(resourceIconForType(type,title,r))}<span><b>${esc(title)}</b></span><span>›</span></button>`}).join(''):'<div class="resourceEmpty">No resources</div>'}</div></section>`;window.__resourceItems=arr;document.querySelectorAll('[data-resource-item-index]').forEach(b=>b.onclick=async()=>{const stop=setResourceLoading(b,'Loading resource…');try{await openCollectionResource(window.__resourceItems[+b.dataset.resourceItemIndex],b)}catch(e){alert('Unable to open resource: '+e.message)}finally{stop()}})}catch(e){c.innerHTML=`<div class="error apiError">Schoology could not load resources.<br>${esc(e.message)}</div>`}
}
let homeLayoutMediaQuery=null;
function installHomeLayoutWatcher(){const mq=window.matchMedia('(min-width: 801px)');if(homeLayoutMediaQuery===mq)return;window.__schoologyHomeLayoutChange=()=>{const savedHomeTab=state.homeTab,savedCourse=state.selectedCourse,savedCourseView=state.courseView,savedCourseTab=state.courseTab;if(state.courseView==='course'&&savedCourse){clearTimeout(resizeRefreshTimer);resizeRefreshTimer=setTimeout(()=>{if(state.courseView==='course'&&state.selectedCourse===savedCourse){showCourse(savedCourse,savedCourseTab||'materials',true)}},60);return;}if(state.tab==='home'){clearTimeout(resizeRefreshTimer);resizeRefreshTimer=setTimeout(()=>{if(state.tab==='home'&&state.courseView!=='course'){state.homeTab=savedHomeTab;loadTab()}},60)}};homeLayoutMediaQuery?.removeEventListener?.('change',window.__schoologyHomeLayoutChange);mq.addEventListener?.('change',window.__schoologyHomeLayoutChange);homeLayoutMediaQuery=mq}
async function openRequest(r){if(!r)return;try{const type=String(r.requestType||r.type||r.request_type||'').toLowerCase();if(type==='friend'){const id=Number(r.requester_id||r.requesterId||r.user_id||r.uid||0);if(!id)throw new Error('This friend request is missing its user ID.');state.profileUser={id};state.tab='profile';state.toolbarTitle='Profile';render();loadTab();return}if(type==='group'){const gid=Number(r.realm_id||r.realmId||r.group_id||r.groupId||0);if(!gid)throw new Error('This group invitation is missing its group ID.');state.currentGroup={id:gid,name:r.name||r.title||'Group'};state.tab='groups';state.toolbarTitle=state.currentGroup.name;render();showGroup(state.currentGroup);return}if(type==='section'){const sid=Number(r.realm_id||r.realmId||r.section_id||r.sectionId||0);if(!sid)throw new Error('This course invitation is missing its section ID.');const x=await A.api({path:`sections/${sid}`,params:{}});showCourse(x?.section||x);return}throw new Error('Unknown request type.')}catch(e){alert('Unable to open request: '+e.message)}}
async function handleRequestAction(r,accept){if(!r)return;try{const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('Schoology did not return the logged-in user ID.');const id=r.id||r.request_id||r.requestId;if(!id)throw new Error('This request is missing its ID.');if(r.requestType==='friend'){await A.api({path:`users/${uid}/requests/friends/${id}`,method:'PUT',params:{request:{request_action:accept?'accept':'deny'}},json:true});}else{const realm=r.requestType==='group'?'groups':'sections';await A.api({path:`users/${uid}/invites/${realm}/${id}`,method:'PUT',params:{invite:{invite_action:accept?'accept':'deny'}},json:true});}await loadTab()}catch(e){alert(`Unable to ${accept?'accept':'decline'} request: ${e.message}`)}}

async function openNotification(n){
  if(!n)return;
  const findLink=value=>{
    if(!value)return '';
    if(Array.isArray(value)){for(const item of value){const found=findLink(item);if(found)return found}return ''}
    if(typeof value!=='object')return '';
    for(const key of ['url','href','web_url','webUrl','link_url','linkURL','target_url','targetUrl']){
      const v=value[key];if(typeof v==='string'&&/^https?:\/\//i.test(v))return v;
    }
    for(const child of Object.values(value)){if(child&&typeof child==='object'){const found=findLink(child);if(found)return found}}
    return '';
  };
  const notificationUrl=findLink(n)||findLink(n.body_args||n.bodyArgs||n.body_arg||[]);
  if(notificationUrl){
    try{
      const parsed=new URL(notificationUrl),host=parsed.hostname.toLowerCase();
      const internal=host==='lms.lausd.net'||host==='schoology.com'||host.endsWith('.schoology.com');
      if(internal&&await routeSchoologyLink(parsed.href))return;
      if(!internal){const result=await A.openExternal(parsed.href);if(typeof result==='string'&&result)showAppDialog('Unable to open notification',result);return}
    }catch(e){console.warn('Could not resolve notification URL; falling back to notification type:',e.message)}
  }
  const realmRaw=String(n.realm||'user').toLowerCase();
  const realm=realmRaw==='section'?'sections':realmRaw==='group'?'groups':realmRaw==='school'?'schools':realmRaw==='user'?'users':realmRaw;
  const realmId=n.realm_id||n.realmId||n.user_id||n.uid||state.auth?.userId;
  const args=n.body_args||n.bodyArgs||n.body_arg||[];
  const list=Array.isArray(args)?args:(args?.body_arg||args?.args||[]);
  const candidates=[];
  const walk=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v==='object'){if(v.type&&v.id!=null)candidates.push(v);Object.values(v).forEach(x=>{if(x&&typeof x==='object')walk(x)})}}; walk(list);
  const notificationType=String(n.type||'').toLowerCase();
  const lastArg=Array.isArray(list)?list[list.length-1]:null;
  const lastArgType=String(lastArg?.type||lastArg?.template_type||lastArg?.templateType||'').toLowerCase();
  const expectedType = /badge/.test(notificationType)?'section':/discussion/.test(notificationType)?'discussion':/event/.test(notificationType)?'event':/grade_item_submit/.test(notificationType)?(lastArgType||'assignment'):/assessment_v2|managed_assessment/.test(notificationType)?'assessment_v2':/assessment|quiz/.test(notificationType)?'assessment':/assignment/.test(notificationType)?'assignment':/document|resource/.test(notificationType)?'document':/page/.test(notificationType)?'page':/group/.test(notificationType)?'group':/friend|profile|user/.test(notificationType)?'user':'';
  const typeMatches=(candidate,type)=>{const actual=String(candidate?.type||candidate?.template_type||candidate?.templateType||'').toLowerCase();if(actual===type)return true;if(type==='assessment_v2')return ['assessment_v2','managed_assessment','quiz'].includes(actual);if(type==='assessment')return ['assessment','quiz'].includes(actual);return false};
  let a=(expectedType&&[...candidates].reverse().find(candidate=>typeMatches(candidate,expectedType)))
    || [...candidates].reverse().find(candidate=>String(candidate.type||'').toLowerCase()!=='user')
    || candidates[candidates.length-1];
  if(notificationType==='badge_award' && a?.type==='user')a={...a,type:'section'};
  if(!a?.id){const fallbackType=n.object_type||n.objectType||(String(n.type||'').toLowerCase()==='discussion_add'?'discussion':String(n.type||'').toLowerCase()==='grade_item_submit'?'assignment':null);a={type:fallbackType,id:n.object_id||n.objectId||n.assignment_id||n.assignmentId};}
  const type=String(a?.type||'').toLowerCase(), id=a?.id;
  try{
    if(!id)return;
    if(type==='assignment'||type==='assessment'||type==='assessment_v2'||type==='managed_assessment'){if(realm==='sections'&&realmId)showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,n.title||'Assessment',{allowBrowser:false,quiz:true,assessment:true});return}
    if(type==='discussion'){if(realm==='sections'&&realmId){showDiscussionNative('sections',realmId,id,n.title||'Discussion')}else if(realm==='groups'&&realmId){showDiscussionNative('groups',realmId,id,n.title||'Discussion')}else {showEmbeddedWeb(`https://app.schoology.com/discussion/${id}`,n.title||'Discussion',{allowBrowser:false})}return}
    if(type==='event'){if(realm&&realmId){showEventNative(realm,Number(realmId),Number(id),n.title||'Event');return}showEmbeddedWeb(`https://app.schoology.com/event/${id}`,n.title||'Event');return}
    if(type==='document'){if(realm==='sections'&&realmId){const x=await A.api({path:`sections/${realmId}/documents/${id}`,params:{}});await openCollectionResource(x?.document||x,null);return}showEmbeddedWeb(`https://app.schoology.com/${realm}/${realmId||''}/documents/${id}`,n.title||'Document');return}
    if(type==='page'){if(realm&&realmId){showPageNative(realm,Number(realmId),Number(id),n.title||'Page');return}return}
    if(type==='user'){state.profileUser={id:Number(id)};state.tab='profile';state.toolbarTitle='Profile';render();loadTab();return}
    if(type==='group'){state.currentGroup={id:Number(id),name:n.title||'Group'};state.tab='groups';state.toolbarTitle=n.title||'Group';render();showGroup(state.currentGroup);return}
    if(type==='section'){const x=await A.api({path:`sections/${id}`,params:{}});showCourse(x?.section||x);return}
    if(type==='school'){showEmbeddedWeb(`https://app.schoology.com/school/${id}`,n.title||'School');return}
    showEmbeddedWeb(`https://app.schoology.com/${realm}/${id}`,n.title||'Notification');
  }catch(e){alert('Unable to open notification: '+e.message)}
}

async function loadMessagesPage(c, force=false){
 const folder=state.messageTab==='sent'?'sent':'inbox';
 if(!force && state.messageCache?.[folder]){ renderMessageFolderInto(c,folder); return; }
 const endpoint=folder==='sent'?'messages/sent':'messages/inbox';
 const x=await A.api({path:endpoint,params:{limit:50}});const arr=x.message||x.messages||[];
 const ids=[...new Set(arr.map(m=>folder==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId)).map(Number).filter(Boolean))];
 const users={};await Promise.all(ids.map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});users[id]=u?.user||u}catch{}}));
 state.messageCache=state.messageCache||{}; state.messageCache[folder]={arr,users};
 renderMessageFolderInto(c,folder);
}
function renderMessageFolderInto(c,folder){
 const cache=state.messageCache?.[folder]||{arr:[],users:{}};const arr=cache.arr,users=cache.users;window.__schoologyMessages=arr;window.__schoologyMessageUsers=users;
 const listHtml=arr.map((m,i)=>{const uid=Number(folder==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId));const u=users[uid]||{};const me=Number(state.auth?.userId||state.auth?.user?.id||0)===uid;const name=me?'You':(u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology');const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||'');const ts=m.last_updated||m.lastUpdated||m.created||m.timestamp;const date=ts?(typeof ts==='number'||/^\d+$/.test(String(ts))?new Date(Number(ts)*1000).toLocaleString():String(ts)):'';return `<button class="messageListItem ${m.message_status==='unread'?'unread':''}" data-message="${i}"><span class="messageListAvatar">${avatar?`<img data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`${esc(String(name).charAt(0))}`}</span><span class="messageListText"><b>${esc(name)}</b><strong>${esc(m.subject||'Message')}</strong><small>${esc(date)}</small></span>${m.message_status==='unread'?'<span class="messageUnreadDot"></span>':''}</button>`}).join('')||'<div class="empty">No messages.</div>';
 let page=c.querySelector('.messagesAndroidPage');
 if(!page){c.innerHTML=`<section class="messagesAndroidPage"><div class="messageTabs"><button class="messageTab ${folder==='inbox'?'active':''}" data-message-tab="inbox">Inbox</button><button class="messageTab ${folder==='sent'?'active':''}" data-message-tab="sent">Sent</button></div><div class="messageList"></div></section>`;page=c.querySelector('.messagesAndroidPage');}
 const list=page.querySelector('.messageList');if(list)list.innerHTML=listHtml;page.querySelectorAll('[data-message-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.messageTab===folder);b.onclick=async()=>{const next=b.dataset.messageTab;if(state.messageTab===next)return;state.messageTab=next;if(!state.messageCache?.[next]){list.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';const uid=state.auth?.userId||state.auth?.user?.id;const endpoint=next==='sent'?'messages/sent':'messages/inbox';try{const x=await A.api({path:endpoint,params:{limit:50}});const a=x.message||x.messages||[];const ids=[...new Set(a.map(m=>Number(next==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId))).filter(Boolean))];const users2={};await Promise.all(ids.map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});users2[id]=u?.user||u}catch{}}));state.messageCache=state.messageCache||{};state.messageCache[next]={arr:a,users:users2};}catch(e){list.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`;return}}renderMessageFolderInto(c,next);};});
 hydrateMediaImages(page);list?.querySelectorAll('[data-message]').forEach(b=>b.onclick=async()=>{const m=window.__schoologyMessages?.[+b.dataset.message];if(!m)return;state.message=m;state.messageFolder=state.messageTab;state.messageThread=null;render();await loadMessageThread(m);});
}

async function loadTab(){
 const c=document.getElementById('content');if(!c)return;
 const generation=++loadTabGeneration;
 const tabAtStart=state.tab;
 const tabTitles={home:'Home',courses:'Courses',groups:'Groups',resources:'Resources',grades:'Grades',calendar:'Calendar',messages:'Messages',notifications:'Notifications',requests:'Requests',people:'People',settings:'Settings',profile:'Profile'};
 // Set the toolbar title synchronously before any asynchronous API work starts.
 // Older loadTab() calls are invalidated by loadTabGeneration so a slow response
 // from the previous screen can never put its title back into the current toolbar.
 state.toolbarTitle=tabTitles[tabAtStart]||state.toolbarTitle||'Home';
 syncToolbar();
 c.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
 const uid=state.auth?.userId||state.auth?.user?.id;
 try{
  if(state.tab==='home'){
    installHomeLayoutWatcher();
    const landscape=window.matchMedia('(min-width: 801px)').matches;
    if(landscape){
      const tabs=[`<button data-home-tab="recent" class="homeTab ${state.homeTab==='recent'?'active':''}">Recent Activity</button>`,state.courseDashboardEnabled?`<button data-home-tab="dashboard" class="homeTab ${state.homeTab==='dashboard'?'active':''}">Course Dashboard</button>`:''].join('');
      c.innerHTML=`<div class="homeLandscapeSplit"><section class="homeRightPane"><div class="homeTabs">${tabs}</div><section id="homeTabContent" class="activity"></section></section><section id="homeUpcomingPane" class="homeUpcomingPane"></section></div>`;
      document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
      await loadHomeUpcomingPane();
      await loadHomeTab();
    }else{
      const tabs=[`<button data-home-tab="recent" class="homeTab ${state.homeTab==='recent'?'active':''}">Recent Activity</button>`,state.courseDashboardEnabled?`<button data-home-tab="dashboard" class="homeTab ${state.homeTab==='dashboard'?'active':''}">Course Dashboard</button>`:'',`<button data-home-tab="upcoming" class="homeTab ${state.homeTab==='upcoming'?'active':''}">Upcoming</button>`].join('');
      c.innerHTML=`<div class="homeTabViewport"><div class="homeTabs">${tabs}</div><section id="homeTabContent" class="activity"></section></div>`;
      document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{const order=['recent','dashboard','upcoming'];const oldIndex=order.indexOf(state.homeTab),newIndex=order.indexOf(b.dataset.homeTab);state.homeTabDirection=newIndex>=oldIndex?'forward':'back';state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
      await loadHomeTab();
    }
  }else if(state.tab==='courses'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});const arr=x.section||x.sections||[];window.__schoologyCourses=arr;
    c.innerHTML=`<section class="androidSectionList"><div class="sectionListRows">${arr.map((s,i)=>{
      const courseTitle=s.course_title||s.courseTitle||s.title||s.section_title||'Course';
      const sectionTitle=s.section_title||s.sectionTitle||'';
      const image=normalizeImageUrl(s.profile_url||s.profileUrl||s.course_profile_url||s.courseProfileUrl||s.course_theme||s.courseTheme||s.image||s.course_image||'');
      const admin=String(s.admin||'')==='1'||s.admin===true;
      return `<button class="sectionListItem" data-course-page="${i}">
        <span class="sectionImage">${image?`<img data-course-image-url="${esc(image)}" alt="" style="display:none">`:''}<span>${esc(courseTitle.charAt(0))}</span></span>
        <span class="sectionLabels"><b>${esc(courseTitle)}</b><small>${esc(sectionTitle)}</small></span>
        ${admin?'<span class="courseAdmin">★</span>':''}
      </button>`;
    }).join('')||'<div class="empty"><h2>No courses found.</h2></div>'}</div></section>`;
    document.querySelectorAll('[data-course-page]').forEach(b=>b.onclick=()=>showCourse(window.__schoologyCourses[+b.dataset.coursePage])); await hydrateCourseImages(c);
  }else if(state.tab==='profile'){
    const puid=state.profileUser?.id||uid;
    if(!puid)throw new Error('Schoology did not return the profile user ID.');
    let user=state.profileUser?.user||state.profileUser;
    if(!user || Object.keys(user).length<=1){
      const ur=await A.api({path:`users/${puid}`,params:{}});user=ur?.user||ur||{};state.profileUser=user;
    }
    const image=normalizeImageUrl(user.picture_url||user.pictureUrl||user.picture||user.photo_url||'');
    const profileLandscape=window.matchMedia('(min-width: 1000px)').matches;
    c.innerHTML=`<section class="profileAndroidPage ${profileLandscape?'profileLandscapePage':''}">
      <div class="profileHeader"><img data-media-image-url="${esc(image)}" class="profileHeaderImage" style="display:none"><span class="profileHeaderFallback">${esc(String(user.name_display||user.name||'U').charAt(0))}</span><div><h1>${esc(user.name_display||user.name||'Profile')}</h1><p>${esc(user.school_name||user.school?.school_name||'')}</p></div></div>
      ${profileLandscape?`<div class="profileLandscapePanes">
        <section class="profilePane"><h2>Updates</h2><div id="profilePaneUpdates" class="profilePaneContent"></div></section>
        <section class="profilePane"><h2>Info</h2><div id="profilePaneInfo" class="profilePaneContent"></div></section>
        <section class="profilePane"><h2>Badges</h2><div id="profilePaneBadges" class="profilePaneContent"></div></section>
      </div>`:`<><div class="profileTabs">
        <button class="profileTab ${state.profileTab==='updates'?'active':''}" data-profile-tab="updates">Updates</button>
        <button class="profileTab ${state.profileTab==='info'?'active':''}" data-profile-tab="info">Info</button>
        <button class="profileTab ${state.profileTab==='badges'?'active':''}" data-profile-tab="badges">Badges</button>
      </div><div id="profileTabContent"></div></>`}
    </section>`;
    const pc=document.getElementById('profileTabContent');
    const loadProfileTab=async(tab)=>{
      state.profileTab=tab;document.querySelectorAll('[data-profile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.profileTab===tab));
      const target=document.getElementById(profileLandscape?`profilePane${tab.charAt(0).toUpperCase()+tab.slice(1)}`:'profileTabContent'); if(!target)return;
      const pane=target;
      if(tab==='info'){
        const rows=[['Email',user.primary_email||user.primaryEmail||''],['Username',user.username||''],['First Name',user.first_name||user.firstName||''],['Last Name',user.last_name||user.lastName||'']];
        pane.innerHTML=`<div class="profileInfoList">${rows.filter(r=>r[1]).map(r=>`<div class="profileInfoRow"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')||'<div class="empty">No profile information available.</div>'}</div>`;
      }else if(tab==='badges'){
        try{const x=await A.api({path:`users/${puid}/badges`,params:{}});const arr=x.badge||x.badges||x.items||[];pane.innerHTML=arr.length?`<div class="badgeGrid">${arr.map(b=>`<article class="badgeCard"><b>${esc(b.name||b.title||'Badge')}</b><small>${esc(b.description||'')}</small></article>`).join('')}</div>`:'<div class="empty">No badges.</div>'}catch(e){pane.innerHTML='<div class="empty">No badges.</div>'}
      }else{
        try{const x=await A.api({path:`users/${puid}/updates`,params:{start:0,limit:20}});const arr=x.update||x.updates||[];pane.innerHTML=arr.length?arr.map(u=>`<article class="activityCard"><b>${esc(user.name_display||'')}</b><div class="activityBody">${u.body||u.message||''}</div><small>${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</small></article>`).join(''):'<div class="empty">No updates.</div>'}catch(e){pane.innerHTML='<div class="empty">No updates.</div>'}
      }
    };
    document.querySelectorAll('[data-profile-tab]').forEach(b=>b.onclick=()=>loadProfileTab(b.dataset.profileTab));
    if(profileLandscape){await Promise.all(['updates','info','badges'].map(loadProfileTab));}
    else await loadProfileTab(state.profileTab);
    await hydrateMediaImages(c);
  }else if(state.tab==='groups'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/groups`,params:{limit:100}});const arr=x.group||x.groups||[];
    window.__schoologyGroups=arr;
    c.innerHTML=`<section class="groupsAndroidPage"><h1>Groups</h1><div class="groupList">${arr.map((g,i)=>{const gi=normalizeImageUrl(g.picture_url||g.pictureUrl||g.picture||g.image||'');return `<button class="groupListItem" data-group-index="${i}"><span class="groupImage">${gi?`<img data-course-image-url="${esc(gi)}" alt="" style="display:none">`:''}<span class="groupImageFallback" style="display:${gi?'none':'flex'}">${esc(String(g.name||g.title||'G').charAt(0))}</span></span><span><b>${esc(g.name||g.title||'Group')}</b><small>${esc(g.description||g.group_description||'')}</small></span>${g.admin?'<span>★</span>':''}</button>`}).join('')||'<div class="empty">No groups found.</div>'}</div></section>`; await hydrateCourseImages(c);
    document.querySelectorAll('[data-group-index]').forEach(b=>b.onclick=()=>showGroup(window.__schoologyGroups[+b.dataset.groupIndex]));
  }else if(state.tab==='calendar'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    state.calendarTab=state.calendarTab||'calendar';
    const perm=await A.api({path:`users/${uid}/events/permissions`,params:{}}).catch(()=>({}));
    state.calendarCanCreate=!!(perm?.permission?.post??perm?.permissions?.post??perm?.permission_map?.post??perm?.canPOST??perm?.can_post);
    c.innerHTML=`<section class="calendarPagerPage"><div class="calendarPagerTabs"><button class="calendarPagerTab ${state.calendarTab==='calendar'?'active':''}" data-calendar-tab="calendar">Calendar</button><button class="calendarPagerTab ${state.calendarTab==='upcoming'?'active':''}" data-calendar-tab="upcoming">Upcoming</button></div><div id="calendarPagerContent" class="calendarPagerContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></section>`;
    const pager=document.getElementById('calendarPagerContent');
    const renderCalendarRows=events=>events.map(e=>{const type=String(e.type||'').toLowerCase();const icon=type==='assignment'?'ic_assignment.png':type==='assessment'?'ic_test_quiz.png':['assessment_v2','managed_assessment','quiz'].includes(type)?'ic_assessment_48dp.png':type==='discussion'?'ic_discussion.png':type==='external_tool'?'ic_external_tool.png':'home_dash_upcoming.png';const allDay=String(e.all_day??e.allDay??'')==='1'||e.allDay===1;const start=e.start||e.start_date||e.startDate||'';let time='';if(!allDay&&start){const dt=new Date(String(start).replace(' ','T'));if(!Number.isNaN(dt.getTime()))time=dt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}return `<button class="calendarEventRow" data-calendar-event="${esc(e.id||'')}"><span class="calendarEventIcon">${officialOrAssetIcon(icon,'')}</span><span class="calendarEventText"><b>${esc(e.title||'Event')}</b>${time?`<small>${esc(time)}</small>`:''}</span></button>`}).join('');
    const bindEventRows=(events)=>document.querySelectorAll('[data-calendar-event]').forEach(btn=>{if(btn.dataset.boundCalendar)return;btn.dataset.boundCalendar='1';btn.addEventListener('click',()=>{const e=events.find(v=>String(v.id||'')===String(btn.dataset.calendarEvent));if(!e)return;const type=String(e.type||'').toLowerCase();const aid=e.assignment_id??e.assignmentId??e.assignment?.id;const sid=e.section_id??e.sectionId;if(type==='assignment'&&aid){showAssignment(sid,aid);return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id){A.prepareWebSession().then(()=>showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true}));return}}if(type==='discussion'&&e.id){showDiscussionNative(sid?'sections':'users',sid||state.auth?.userId,e.discussion_id??e.id,e.title||'Discussion');return}if(type==='event'&&e.id){showEventNative(sid?'sections':'users',sid||state.auth?.userId,e.id,e.title||'Event');return}if(e.web_url||e.webUrl){showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming');return}})});
    const normalizeCalendarEvents=value=>Array.isArray(value)?value:(value&&typeof value==='object'?[value]:[]);
    const loadCalendarUpcomingData=async()=>{
      if(!Array.isArray(state.calendarUpcomingEvents)){
        const x=await A.api({path:`users/${uid}/events`,params:{start_date:formatApiDate(new Date()),limit:100}});
        state.calendarUpcomingEvents=normalizeCalendarEvents(x?.event??x?.events??x?.data?.event??x?.data?.events??[]);
      }
      return normalizeCalendarEvents(state.calendarUpcomingEvents);
    };
    const calendarEventDate=e=>{
      const raw=String(e?.start||e?.start_date||e?.startDate||e?.date||e?.due_date||e?.dueDate||'').trim();
      if(!raw)return null;
      const day=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)||raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T]/);
      if(day){const d=new Date(Number(day[1]),Number(day[2])-1,Number(day[3]),12,0,0);if(!Number.isNaN(d.getTime()))return d;}
      const parsed=new Date(raw.replace(' ','T'));
      return Number.isNaN(parsed.getTime())?null:parsed;
    };
    const upcomingNow=(forMonth=null)=>{
      const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0);
      const merged=new Map();
      for(const e of [...normalizeCalendarEvents(state.calendarUpcomingEvents),...normalizeCalendarEvents(state.calendarEvents)]){
        const id=String(e?.id??e?.event_id??e?.eventId??'');
        const key=id||[e?.title||e?.name||'',e?.start||e?.start_date||e?.startDate||e?.date||''].join('|');
        if(!merged.has(key))merged.set(key,e);
      }
      return [...merged.values()].filter(e=>{
        const d=calendarEventDate(e);
        if(d){const day=new Date(d.getFullYear(),d.getMonth(),d.getDate());if(day<today)return false;if(forMonth&&(d.getFullYear()!==forMonth.getFullYear()||d.getMonth()!==forMonth.getMonth()))return false;}
        else if(forMonth)return false;
        return true;
      }).sort((a,b)=>{
        const da=calendarEventDate(a),db=calendarEventDate(b);
        if(!da&&!db)return String(a?.title||'').localeCompare(String(b?.title||''));
        if(!da)return 1;if(!db)return -1;return da-db;
      });
    };
    const loadCalendarMonth=async()=>{
      await loadCalendarUpcomingData();
      const month=state.calendarDate?new Date(state.calendarDate):new Date(); state.calendarDate=new Date(month.getFullYear(),month.getMonth(),1);
      const selected=state.calendarSelectedDate?new Date(state.calendarSelectedDate):new Date();
      const monthStart=new Date(month.getFullYear(),month.getMonth(),1),monthEnd=new Date(month.getFullYear(),month.getMonth()+1,0); const monthKey=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
      if(state.calendarEventsMonth!==monthKey){const x=await A.api({path:`users/${uid}/events`,params:{start:`${monthKey}-01`,end:`${monthKey}-${String(monthEnd.getDate()).padStart(2,'0')}`,limit:200}});state.calendarEvents=x.event||x.events||[];state.calendarEventsMonth=monthKey;}
      const arr=Array.isArray(state.calendarEvents)?state.calendarEvents:[];const byDay={};for(const e of arr){const raw=e.start||e.start_date||e.date||e.startDate||'';const key=String(raw).slice(0,10);if(key)(byDay[key]||(byDay[key]=[])).push(e)}
      const selectedKey=formatApiDate(selected),days=monthStart.getDay(),rows=Math.ceil((days+monthEnd.getDate())/7),cells=[];
      for(let i=0;i<rows*7;i++){const n=i-days+1,inMonth=n>=1&&n<=monthEnd.getDate(),d=inMonth?new Date(month.getFullYear(),month.getMonth(),n):null,key=d?formatApiDate(d):'',evs=key?(byDay[key]||[]):[];cells.push(`<button class="calendarDay ${key===selectedKey?'selected':''} ${inMonth?'':'outside'}" data-calendar-day="${key}"><b>${inMonth?n:''}</b>${evs.length?'<i class="calendarEventMarker" aria-hidden="true"></i>':''}</button>`)}
      pager.innerHTML=`<section class="calendarAndroidPage"><div class="calendarLandscapeMonth"><div class="calendarMonthWrap"><header class="calendarMonthHeader"><button id="calendarPrev" aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg></button><b>${esc(month.toLocaleDateString([], {month:'long',year:'numeric'}))}</b><button id="calendarNext" aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></button></header><div class="calendarWeekLabels">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendarGrid">${cells.join('')}</div></div><div class="calendarLandscapeUpcoming"><div class="calendarUpcomingHeader">Upcoming</div><div id="calendarUpcomingAll" class="calendarEventList">${renderCalendarRows(upcomingNow(month))||'<div class="androidEmptyState">No upcoming events</div>'}</div></div></div><div id="calendarEventList" class="calendarEventList calendarSelectedDayList">${renderCalendarRows(byDay[selectedKey]||[])||'<div class="androidEmptyState">No upcoming events</div>'}</div></section>`;
      document.getElementById('calendarPrev')?.addEventListener('click',async()=>{state.calendarDate=new Date(month.getFullYear(),month.getMonth()-1,1);state.calendarEventsMonth='';await loadCalendarMonth()});
      document.getElementById('calendarNext')?.addEventListener('click',async()=>{state.calendarDate=new Date(month.getFullYear(),month.getMonth()+1,1);state.calendarEventsMonth='';await loadCalendarMonth()});
      document.querySelectorAll('[data-calendar-day]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.calendarDay;if(!key)return;state.calendarSelectedDate=new Date(key+'T12:00:00');document.querySelectorAll('[data-calendar-day]').forEach(x=>x.classList.toggle('selected',x===btn));const list=document.getElementById('calendarEventList');if(list)list.innerHTML=renderCalendarRows(byDay[key]||[])||'<div class="androidEmptyState">No upcoming events</div>';bindEventRows(arr)}));
      bindEventRows([...upcomingNow(month),...arr]);
    };
    const loadCalendarUpcoming=async()=>{
      await loadCalendarUpcomingData();
      const arr=upcomingNow();
      if(!arr.length){pager.innerHTML='<section class="calendarStandaloneUpcoming"><div class="calendarUpcomingListEmpty"><h2>No upcoming events</h2></div></section>';return;}
      let lastDay='';let html='';for(const e of arr){const d=new Date(String(e.start||e.start_date||e.startDate||'').replace(' ','T'));const day=Number.isNaN(d.getTime())?'':d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'});if(day&&day!==lastDay){html+=`<div class="calendarUpcomingDate">${esc(day)}</div>`;lastDay=day;}html+=renderCalendarRows([e]);}
      pager.innerHTML=`<section class="calendarStandaloneUpcoming"><div class="calendarUpcomingList">${html}</div></section>`;bindEventRows(arr);
    };
    const selectCalendarTab=async(tab)=>{state.calendarTab=tab;document.querySelectorAll('[data-calendar-tab]').forEach(b=>b.classList.toggle('active',b.dataset.calendarTab===tab));pager.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';try{if(tab==='calendar')await loadCalendarMonth();else await loadCalendarUpcoming()}catch(e){pager.innerHTML=`<div class="error apiError">Unable to load Calendar.<br>${esc(e.message)}</div>`}};
    document.querySelectorAll('[data-calendar-tab]').forEach(b=>b.addEventListener('click',()=>selectCalendarTab(b.dataset.calendarTab)));
    try{if(state.calendarTab==='calendar')await loadCalendarMonth();else await loadCalendarUpcoming()}catch(e){pager.innerHTML=`<div class="error apiError">Unable to load Calendar.<br>${esc(e.message)}</div>`}
  }else if(state.tab==='grades'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/grades`,params:{}});const ss=x.section||x.sections||[];
    const renderGradeRows=()=>{const el=c.querySelector('.sectionListRows');if(!el)return;el.innerHTML=ss.map((s,i)=>{const gd=getFinalGradeDisplay(s);return `<button class="sectionListItem" data-user-grade-section="${i}"><span class="sectionLabels"><b>${esc(s.section_title||s.course_title||'Course')}</b><small>${esc(gd.value)}</small></span><span>›</span></button>`}).join('')||'<div class="empty"><h2>No grades</h2></div>';el.querySelectorAll('[data-user-grade-section]').forEach(b=>b.onclick=()=>{const sec=ss[+b.dataset.userGradeSection];showCourse({id:sec.section_id,section_title:sec.section_title||sec.course_title,course_title:sec.course_title},'grades')})};
    c.innerHTML=`<section class="page"><h1>Grades</h1><div class="sectionListRows"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading grades…</span></div></div></section>`;
    window.__schoologyUserGradeSections=ss;renderGradeRows();await hydrateUserCourseGrades(ss);renderGradeRows();
  }else if(state.tab==='messages'){
    await loadMessagesPage(c);
  }else if(state.tab==='requests'){
    try{
      if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
      const [friends,groups,sections]=await Promise.all([
        A.api({path:`users/${uid}/requests/friends`,params:{start:0,limit:200}}),
        A.api({path:`users/${uid}/invites/groups`,params:{start:0,limit:200}}),
        A.api({path:`users/${uid}/invites/sections`,params:{start:0,limit:200}})
      ]);
      const pick=(x,k)=>{const v=x?.[k];if(v==null)return [];return Array.isArray(v)?v:(v?.[k]&&Array.isArray(v[k])?v[k]:[v])};
      const normalize=(items,type)=>items.map(r=>({...r,requestType:type,id:r.id??r.request_id??r.invite_id,title:type==='friend'?(r.requester_name||r.requesterName||r.name||r.display_name||'Friend request'):(r.name||r.title||r.group_name||r.section_title||'Invitation'),subtitle:r.school_name||r.schoolName||r.description||r.message||'',picture_url:r.picture_url||r.pictureUrl||r.image||'',realm_id:r.realm_id||r.realmId||r.section_id||r.sectionId||r.group_id||r.groupId}));
      const arr=[...normalize(pick(friends,'request'), 'friend'),...normalize(pick(groups,'invite'), 'group'),...normalize(pick(sections,'invite'), 'section')];
      window.__schoologyRequests=arr;
      c.innerHTML=`<section class="requestsAndroidPage"><div class="requestsList">${arr.map((r,i)=>`<article class="requestItem"><img src="${esc(normalizeImageUrl(r.picture_url||''))}" onerror="this.style.display='none'" alt=""><div class="requestMain"><button class="requestTitle" data-request-open="${i}">${esc(r.title)}</button><small>${esc(r.subtitle)}</small><div class="requestActions"><button data-request-accept="${i}">Accept</button><button data-request-decline="${i}">Decline</button></div></div></article>`).join('')||'<div class="empty">You have no requests</div>'}</div></section>`;
      document.querySelectorAll('[data-request-open]').forEach(b=>b.onclick=()=>openRequest(window.__schoologyRequests[+b.dataset.requestOpen]));
      document.querySelectorAll('[data-request-accept]').forEach(b=>b.onclick=()=>handleRequestAction(window.__schoologyRequests[+b.dataset.requestAccept],true));
      document.querySelectorAll('[data-request-decline]').forEach(b=>b.onclick=()=>handleRequestAction(window.__schoologyRequests[+b.dataset.requestDecline],false));
    }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load requests.</b><br>${esc(e.message)}</div>`}
  }else if(state.tab==='notifications'){
    // Match the official Android NotificationApiHelper endpoint and clear the
    // viewed badge only when the user actually opens the notification screen.
    const x=await A.api({path:'notifications'});
    const notificationData=x?.notifications||x?.data?.notifications||x;
    const unviewedCount=Number(notificationData?.unviewed_count??notificationData?.unviewedCount??0);
    if(unviewedCount>0)A.api({path:'notifications/read',method:'POST'}).catch(()=>{});
    const raw=x?.notification??x?.notifications??x?.data?.notification??x?.data?.notifications??[];
    const arr=Array.isArray(raw)?raw:(raw?.notification||raw?.notifications||raw?.items||[]);
    const iconFor=n=>{const t=String(n?.type||'').toLowerCase(), args=n?.body_args||n?.bodyArgs||n?.body_arg||[];const last=Array.isArray(args)?args[args.length-1]:null;if(t==='grade_add')return'ic_notifications_grade_add.png';if(t==='badge_award')return'ic_notifications_unknown.png';if(t==='course_materials_add')return'ic_notifications_course_materials_add.png';if(t==='grade_item_submit'){if(last?.type==='assessment')return'ic_notifications_test_quiz.png';if(['assessment_v2','managed_assessment'].includes(last?.type))return'ic_assessment_16dp.svg';return'ic_notifications_grade_item_submit.png'}if(t==='comment_private_add')return'ic_notifications_comment_private_add.png';if(t==='discussion_add')return n?.realm==='schools'?'ic_notifications_discussion_add_school.png':n?.realm==='groups'?'ic_notifications_course_materials_add_group.png':'ic_notifications_unknown.png';if(t==='comment_add')return'ic_notifications_comment_add.png';return'ic_notifications_unknown.png'};
    const bodyFor=n=>{const body=String(n?.body||n?.message||n?.title||'Notification');const args=n?.body_args||n?.bodyArgs||[];const rendered=Array.isArray(args)?args.reduce((out,a)=>out.replace('%s',String(a?.title||a?.name||'')),body):body;return rendered.replace(/<a\b([^>]*?)href=[\"']([^\"']+)[\"']([^>]*)>(.*?)<\/a>/gi,(_,pre,href,post,label)=>`<a class="notificationBodyLink" data-notification-href="${esc(href)}">${esc(label.replace(/<[^>]+>/g,''))}</a>`)};
    window.__schoologyNotifications=arr;
c.innerHTML=`<section class="notificationsAndroidPage"><div class="notificationList">${arr.map((n,i)=>`<button class="androidNotificationItem notificationClickable" data-notification-index="${i}"><img src="../assets/icons/${iconFor(n)}" alt=""><div class="notificationText"><div class="notificationBodyRich">${bodyFor(n)}</div><small>${esc(formatSchoologyDate(n.created||n.timestamp||''))}</small></div><span class="disclosure">›</span></button>`).join('')||'<div class="empty">You have no notifications</div>'}</div></section>`;
document.querySelectorAll('[data-notification-index]').forEach(b=>b.onclick=()=>openNotification(window.__schoologyNotifications[+b.dataset.notificationIndex]));document.querySelectorAll('[data-notification-href]').forEach(a=>a.onclick=async ev=>{ev.preventDefault();ev.stopPropagation();const href=a.dataset.notificationHref||'';if(!href)return;try{if(await routeSchoologyLink(href))return;const result=await A.openExternal(href);if(result)showAppDialog('Unable to open notification link',result)}catch(e){alert('Unable to open notification link: '+e.message)}});
  }else if(state.tab==='resources'){
    await loadResourcesHome(c);
  }else if(state.tab==='people'){
    let arr=[];
    try{
      const x=await A.api({path:'users',params:{start:0,limit:200}});
      const raw=x?.user??x?.users??x?.data?.user??x?.data?.users??[];
      arr=Array.isArray(raw)?raw:(raw?.user||raw?.users||raw?.items||[]);
    }catch(e){
      if(!/403/.test(String(e?.message||e))) throw e;
      const seen=new Map(); const me=state.auth?.user||{}; const meId=Number(state.auth?.userId||me.id||0);
      if(meId)seen.set(String(meId),me);
      const sx=uid?await A.api({path:`users/${uid}/sections`,params:{limit:100}}):{};
      const sections=sx.section||sx.sections||[];
      for(const sec of sections.slice(0,30)){
        const sid=sec.id||sec.section_id||sec.sectionId;if(!sid)continue;
        try{const ex=await A.api({path:`sections/${sid}/enrollments`,params:{enrollment_status:1,limit:200}});const es=ex.enrollment||ex.enrollments||[];for(const en of es){const id=en.uid||en.user_id||en.userId||en.id;if(id&&!seen.has(String(id)))seen.set(String(id),{id,name_first:en.name_first,name_last:en.name_last,name_display:en.name_display,picture_url:en.picture_url,pictureUrl:en.pictureUrl,name_first_preferred:en.name_first_preferred});}}catch{}
      }
      arr=[...seen.values()];
    }
    arr=arr.slice().sort((a,b)=>String(a.name_last||a.last_name||'').localeCompare(String(b.name_last||b.last_name||''))||String(a.name_first||a.first_name||'').localeCompare(String(b.name_first||b.first_name||'')));
    window.__schoologyPeople=arr;
    let last='';const rows=arr.map((u,i)=>{const lastName=String(u.name_last||u.last_name||'');const firstName=String(u.name_display_start||u.nameDisplayStart||u.name_first||u.first_name||u.name||'');const preferred=String(u.name_first_preferred||u.nameFirstPreferred||'');const letter=(lastName.charAt(0)||'#').toUpperCase();let h='';if(letter!==last){last=letter;h=`<div class="peopleSectionHeader">${esc(letter)}</div>`}const image=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||'');return `${h}<button class="peopleListItem" data-person-index="${i}"><img class="peopleAvatar" src="${image||'../assets/icons/profile_default_website.png'}" alt=""><span><b>${esc(firstName)} ${esc(lastName)}</b>${preferred?`<small>${esc(preferred)}</small>`:''}</span></button>`}).join('');
    c.innerHTML=`<section class="peopleAndroidPage"><div class="peopleDirectoryToolbar"><label class="peopleDirectorySearch"><span aria-hidden="true">⌕</span><input id="peopleDirectorySearchInput" type="search" placeholder="Search school directory" autocomplete="off"></label><button id="peopleDirectoryRefresh" class="peopleDirectoryRefresh" type="button" aria-label="Refresh school directory">↻</button></div><div class="peopleList">${rows||'<div class="empty">No people found.</div>'}</div></section>`;
    const peopleSearch=document.getElementById('peopleDirectorySearchInput');peopleSearch?.addEventListener('input',()=>{const query=peopleSearch.value.trim().toLocaleLowerCase();document.querySelectorAll('[data-person-index]').forEach(row=>{row.hidden=!!query&&!row.textContent.toLocaleLowerCase().includes(query)});document.querySelectorAll('.peopleSectionHeader').forEach(header=>{let node=header.nextElementSibling,visible=false;while(node&&!node.classList.contains('peopleSectionHeader')){if(node.matches?.('[data-person-index]')&&!node.hidden)visible=true;node=node.nextElementSibling}header.hidden=!!query&&!visible});});
    document.getElementById('peopleDirectoryRefresh')?.addEventListener('click',()=>{const button=document.getElementById('peopleDirectoryRefresh');button?.classList.add('spinning');loadTab().finally(()=>document.getElementById('peopleDirectoryRefresh')?.classList.remove('spinning'))});
    document.querySelectorAll('[data-person-index]').forEach(b=>b.onclick=()=>{const u=window.__schoologyPeople[+b.dataset.personIndex];state.profileUser=u;state.tab='profile';state.profileTab='updates';state.toolbarTitle='Profile';render();loadTab()});
  }else if(state.tab==='settings'){
    c.innerHTML=`<section class="settingsPage"><div class="settingsGroup"><h2>Appearance</h2><label class="settingRow"><span><b>Theme</b><small>Choose light, dark, or follow your system appearance</small></span><select id="themeModeSelect" class="settingSelect"><option value="system" ${state.themeMode==='system'?'selected':''}>System default</option><option value="light" ${state.themeMode==='light'?'selected':''}>Light</option><option value="dark" ${state.themeMode==='dark'?'selected':''}>Dark</option></select></label><div class="settingRow settingInfoRow"><span><b>Open Schoology links in this app</b><small>This turns on automatically when you start setup—no extra checkbox is needed. Install the companion extension in Chrome to send supported Schoology links here.</small></span><span class="settingStatusPill">Automatic</span></div><button id="setupChromeLinkHandler" class="settingRow settingButton"><span><b>Set up Chrome link handling</b><small>Open the companion extension folder for Chrome</small></span><span>›</span></button></div><div class="settingsGroup"><h2>Desktop Notifications</h2><label class="settingRow"><span><b>Schoology notifications</b><small>Show a desktop notification when new Schoology activity arrives</small></span><span class="settingSwitch"><input class="settingSwitchInput" type="checkbox" id="desktopNotificationsToggle" ${state.desktopNotifications?'checked':''}><span class="settingSwitchTrack" aria-hidden="true"></span></span></label><label class="settingRow"><span><b>Notification sound</b><small>Play the system notification sound for new activity</small></span><span class="settingSwitch"><input class="settingSwitchInput" type="checkbox" id="notificationSoundToggle" ${state.notificationSound?'checked':''} ${state.desktopNotifications?'':'disabled'}><span class="settingSwitchTrack" aria-hidden="true"></span></span></label>${A.testDesktopNotification?'<button id="testDesktopNotification" class="settingRow settingButton"><span><b>Test desktop notification</b><small>Check whether Windows can display a Schoology notification</small></span><span>›</span></button>':''}</div><div class="settingsGroup"><h2>Accessibility</h2><label class="settingRow"><span><b>Reduced motion</b><small>Reduce interface animations and transitions</small></span><span class="settingSwitch"><input class="settingSwitchInput" type="checkbox" id="reducedMotionToggle" ${state.reducedMotion?'checked':''}><span class="settingSwitchTrack" aria-hidden="true"></span></span></label></div><div class="settingsGroup"><h2>Account Settings</h2><button id="accountInfo" class="settingRow settingButton"><span><b>Account Info</b></span><span>›</span></button></div><div class="settingsGroup"><button id="checkForUpdates" class="settingRow settingButton"><span><b>Check for Updates</b><small>${A.platform==='ios'?'Check for a newer iOS build':'Check for a newer Schoology desktop port'}</small></span><span>›</span></button><button id="tryLiquidGlass" class="settingRow settingButton"><span><b>Try Schoology Liquid Glass</b><small>Download the latest Schoology Liquid Glass release</small></span><span>›</span></button><button id="tryExpressive" class="settingRow settingButton"><span><b>Try Schoology Expressive</b><small>Download the latest Schoology Expressive release</small></span><span>›</span></button><label class="settingRow"><span><b>Window Controls Overlay</b><small>Place native window controls over the Schoology app bar (restart required)</small></span><span class="settingSwitch"><input class="settingSwitchInput" type="checkbox" id="windowChromeOverlayToggle" ${state.windowChromeOverlay?'checked':''}><span class="settingSwitchTrack" aria-hidden="true"></span></span></label></div><div class="settingsVersion">Version: ${esc(state.appVersion||'2026.06.0-port.163')}</div></section>`;
    document.getElementById('themeModeSelect')?.addEventListener('change',async e=>{applyTheme(e.target.value,false);try{await A.setThemeMode?.(e.target.value)}catch{}loadTab()});
    document.getElementById('setupChromeLinkHandler')?.addEventListener('click',async()=>{try{state.openSchoologyLinks=await A.setOpenSchoologyLinks?.(true)!==false;const error=await A.openChromeExtensionFolder?.();if(error)throw new Error(error);showAppDialog('Chrome link handler','In Chrome, open chrome://extensions, enable Developer mode, choose Load unpacked, and select the chrome-link-handler folder that was opened. Supported Schoology link handling is now enabled in this app.')}catch(err){showAppDialog('Unable to open Chrome link handler folder',err.message||String(err))}});
    document.getElementById('desktopNotificationsToggle')?.addEventListener('change',async e=>{const next=!!e.target.checked;try{state.desktopNotifications=await A.setDesktopNotifications?.(next)!==false;const sound=document.getElementById('notificationSoundToggle');if(sound)sound.disabled=!state.desktopNotifications}catch(err){e.target.checked=state.desktopNotifications;showAppDialog('Unable to update notifications',err.message||String(err))}});
    document.getElementById('notificationSoundToggle')?.addEventListener('change',async e=>{const next=!!e.target.checked;try{state.notificationSound=await A.setNotificationSound?.(next)===true}catch(err){e.target.checked=state.notificationSound;showAppDialog('Unable to update notification sound',err.message||String(err))}});
    document.getElementById('testDesktopNotification')?.addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;try{await A.testDesktopNotification();showAppDialog('Test notification sent','If you did not see a Windows notification, check Windows Settings → System → Notifications and make sure Schoology is allowed.');}catch(error){showAppDialog('Unable to show test notification',error?.message||String(error));}finally{button.disabled=false;}});
    document.getElementById('reducedMotionToggle')?.addEventListener('change',async e=>{const next=!!e.target.checked;try{state.reducedMotion=await A.setReducedMotion?.(next)===true;document.documentElement.dataset.reducedMotion=state.reducedMotion?'true':'false'}catch(err){e.target.checked=state.reducedMotion;showAppDialog('Unable to update reduced motion',err?.message||String(err))}});
    document.getElementById('accountInfo')?.addEventListener('click',async()=>{try{await A.prepareWebSession();state.embeddedReturn={tab:'settings',title:'Settings'};showEmbeddedWeb('https://app.schoology.com/settings/account','Account Info',{allowBrowser:false,accountInfo:true})}catch(e){alert(e.message)}});
    document.getElementById('checkForUpdates')?.addEventListener('click',async()=>{const b=document.getElementById('checkForUpdates');if(b){b.disabled=true;b.classList.add('downloadBusy');b.querySelector('.settingProgress')?.remove();b.insertAdjacentHTML('beforeend','<span class="settingProgress"><img src="../assets/android_loading_spinner_72.gif" alt=""></span>');}try{const u=await A.checkForUpdates(true);if(u?.available)showUpdateDialog(u);else showAppDialog('Up to date','You are using the latest available Schoology Desktop Port release.')}catch(e){showAppDialog('Unable to check for updates',e.message||String(e))}finally{if(b){b.disabled=false;b.classList.remove('downloadBusy');b.querySelector('.settingProgress')?.remove()}}});
    document.getElementById('tryLiquidGlass')?.addEventListener('click',async()=>{const b=document.getElementById('tryLiquidGlass');if(b){b.disabled=true;b.classList.add('downloadBusy');b.querySelector('.settingProgress')?.remove();b.insertAdjacentHTML('beforeend','<span class="settingProgress"><img src="../assets/android_loading_spinner_72.gif" alt=""></span>');}try{const u=await A.downloadLiquidGlass();const dlg=showAppDialog('Downloading Schoology Liquid Glass',`Downloading ${u.version?`v${esc(u.version)}`:'the latest release'}…`,[]);const msg=dlg?.querySelector('.appDialogMessage');if(msg)msg.innerHTML='<div class="updateDownloadProgressWrap"><div class="updateDownloadProgressTrack"><div id="liquidGlassDownloadProgressBar" class="updateDownloadProgressBar" style="width:0%"></div></div><div id="liquidGlassDownloadProgressText" class="updateDownloadProgressText">Downloading…</div></div>';const off=A.onUpdateDownloadProgress?.(d=>{const bar=document.getElementById('liquidGlassDownloadProgressBar'),txt=document.getElementById('liquidGlassDownloadProgressText');if(bar&&d?.percent!=null)bar.style.width=d.percent+'%';if(txt)txt.textContent=d?.percent!=null?`Downloading… ${d.percent}%`:'Downloading…';});try{await A.installUpdate(u);off?.()}catch(e){off?.();dlg?.classList.remove('open');showAppDialog('Unable to install Schoology Liquid Glass',e.message||String(e))}}catch(e){showAppDialog('Unable to download Schoology Liquid Glass',e.message||String(e))}finally{if(b){b.disabled=false;b.classList.remove('downloadBusy');b.querySelector('.settingProgress')?.remove()}}});
    document.getElementById('tryExpressive')?.addEventListener('click',async()=>{const b=document.getElementById('tryExpressive');if(b){b.disabled=true;b.classList.add('downloadBusy');b.querySelector('.settingProgress')?.remove();b.insertAdjacentHTML('beforeend','<span class="settingProgress"><img src="../assets/android_loading_spinner_72.gif" alt=""></span>');}try{const u=await A.downloadExpressive();const dlg=showAppDialog('Downloading Schoology Expressive',`Downloading ${u.version?`v${esc(u.version)}`:'the latest release'}…`,[]);const msg=dlg?.querySelector('.appDialogMessage');if(msg)msg.innerHTML='<div class="updateDownloadProgressWrap"><div class="updateDownloadProgressTrack"><div id="expressiveDownloadProgressBar" class="updateDownloadProgressBar" style="width:0%"></div></div><div id="expressiveDownloadProgressText" class="updateDownloadProgressText">Downloading…</div></div>';const off=A.onUpdateDownloadProgress?.(d=>{const bar=document.getElementById('expressiveDownloadProgressBar'),txt=document.getElementById('expressiveDownloadProgressText');if(bar&&d?.percent!=null)bar.style.width=d.percent+'%';if(txt)txt.textContent=d?.percent!=null?`Downloading… ${d.percent}%`:'Downloading…';});try{await A.installUpdate(u);off?.()}catch(e){off?.();dlg?.classList.remove('open');showAppDialog('Unable to install Schoology Expressive',e.message||String(e))}}catch(e){showAppDialog('Unable to download Schoology Expressive',e.message||String(e))}finally{if(b){b.disabled=false;b.classList.remove('downloadBusy');b.querySelector('.settingProgress')?.remove()}}});
    document.getElementById('windowChromeOverlayToggle')?.addEventListener('change',async e=>{const checked=!!e.target.checked;try{await A.setWindowChromeMode(checked)}catch(err){e.target.checked=!checked;showAppDialog('Unable to change window controls',err.message||String(err))}});
  }
 }catch(e){if(generation!==loadTabGeneration||tabAtStart!==state.tab)return;c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
}

async function renderUpcomingInto(c){
 const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
 const x=await A.api({path:`users/${uid}/events`,params:{start_date:formatApiDate(new Date()),start:0,limit:50}});
 const arr=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool','event'].includes(String(e.type||'')));
 const sorted=arr.slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
 const body=c.querySelector('.homeUpcomingList')||c;
 body.innerHTML=renderUpcoming(sorted);
 document.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=async()=>{const e=sorted.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const type=String(e.type||'').toLowerCase();const aid=e.assignment_id??e.assignmentId??e.assignment?.id;const sid=e.section_id??e.sectionId;if(type==='assignment'&&sid&&aid){state.homeUpcomingReturn=true;openWithPressTransition(b,()=>showAssignment(sid,aid));return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id){openWithPressTransition(b,async()=>{state.embeddedReturn={tab:'home',homeTab:state.homeTab,title:'Home'};await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})});return}}if(type==='event'&&e.id){openWithPressTransition(b,()=>showEventNative(e.section_id?'sections':'users',e.section_id||state.auth?.userId,e.id,e.title||'Event'));return}if(e.web_url||e.webUrl)openWithPressTransition(b,()=>showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming'));});
}
async function loadHomeUpcomingPane(){const c=document.getElementById('homeUpcomingPane');if(!c)return;c.innerHTML='<div class="homeUpcomingHeader">Upcoming</div><div class="homeUpcomingScroll"><div class="homeUpcomingList"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></div>';await renderUpcomingInto(c)}
async function loadHomeTab(){
 const c=document.getElementById('homeTabContent');if(!c)return;
 c.classList.remove('dashboardContentActive','embeddedContentActive','recentActivityScroll');
 c.style.position='';c.style.left='';c.style.right='';c.style.top='';c.style.bottom='';c.style.height='';c.style.minHeight='';c.style.maxHeight='';c.style.overflow='';c.style.padding='';c.style.margin='';c.style.flex='';
 animateTab(c,state.homeTabDirection||'forward');
 c.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
 try{
  if(state.homeTab==='recent'){
    const recent=await A.api({path:'recent',params:{start:0,limit:20,with_attachments:'TRUE',richtext:1}});
    const updates=recent?.update||recent?.updates||recent?.update_list||[];
    const userIds=[...new Set(updates.map(x=>x.user_id||x.uid).filter(Boolean).map(Number))];
    const userMap={};
    await Promise.all(userIds.slice(0,20).map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});userMap[id]=u?.user||u}catch{}}));
    const groupIds=[...new Set(updates.filter(item=>['group','groups'].includes(String(item.realm||item.realm_name||item.realmName||'').toLowerCase())).map(item=>Number(item.group_id||item.groupId||item.realm_id||item.realmId)).filter(id=>Number.isSafeInteger(id)&&id>0))];
    const groupMap={};await Promise.all(groupIds.slice(0,10).map(async id=>{try{const result=await A.api({path:`groups/${id}`,params:{}});groupMap[id]=result?.group||result}catch{}}));
    state.activityUsers=userMap;state.__activityById=Object.fromEntries(updates.map(u=>[String(u.id),u]));
    c.classList.add('recentActivityScroll');c.style.overflowY='auto';c.style.height='100%';c.style.minHeight='0';
    c.innerHTML=updates.length?updates.map(x=>{
      const uid=x.user_id||x.uid||x.author_id||x.authorId;
      const u=userMap[uid]||{};
      const name=x.display_name||x.author_name||u.name_display||u.display_name||u.name||x.user_name||x.author_name||'Schoology';
      const body=x.body||x.message||x.description||x.title||'';
      const created=formatSchoologyDate(x.created||x.timestamp||x.created_at||'');
      const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||x.user_photo||x.photo_url||'');
      const media=renderAttachments(x.attachments||x.attachment||x.files||{});
      const comments=Number(x.num_comments||x.comment_count||0);
      const activityRealm=String(x.realm||x.realm_name||x.realmName||'').toLowerCase();
      const activityGroupId=Number(x.group_id||x.groupId||x.realm_id||x.realmId||0);
      const activityGroup=groupMap[activityGroupId]||{};
      const activityGroupName=x.group_name||x.groupName||x.realm_title||x.realmTitle||activityGroup.name||activityGroup.title||'';
      const groupContext=['group','groups'].includes(activityRealm)&&activityGroupId>0&&activityGroupName;
      return `<article class="androidActivityCard">
        <div class="activityHeader">${avatar?`<img class="activityAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="activityAvatar">${esc(String(name).charAt(0))}</span>`}<button class="activityUser activityAuthorLink" data-author-id="${esc(u.user_id||u.uid||u.author_id||u.authorId||u.creator_id||u.creatorId||'')}">${esc(name)}</button>${groupContext?`<span class="activityContextArrow" aria-hidden="true">›</span><button class="activityGroupLink" data-activity-group-id="${activityGroupId}">${esc(activityGroupName)}</button>`:''}</div>
        <div class="activityBody">${body}</div>
        ${media}
        <div class="activityMeta">${esc(created)}</div>
        <div class="activityActions"><button data-activity-comments="${esc(x.id||'')}">Comment</button>${comments?`<button data-activity-comment-count="${esc(x.id||'')}" aria-label="${esc(comments)} comments">${esc(comments)}</button>`:'' }<button data-activity-like="${esc(x.id||'')}" data-liked="${x.liked||x.is_liked?'1':'0'}">${x.liked||x.is_liked?'Unlike':'Like'}</button>${Number(x.likes||0)>0?`<button data-activity-like-count="${esc(x.id||'')}" aria-label="${esc(x.likes)} likes">${esc(x.likes)}</button>`:''}</div>
      </article>`;
    }).join(''):'<div class="empty"><h2>No recent activity</h2><p>Your recent Schoology activity will appear here.</p></div>';
    await hydrateMediaImages(c);
    c.querySelectorAll('.activityBody a[href]').forEach(a=>a.addEventListener('click',async ev=>{
      const href=a.href||a.getAttribute('href')||'';
      if(!href||href==='#')return;
      ev.preventDefault();ev.stopPropagation();
      try{if(await routeSchoologyLink(href))return;await showEmbeddedWeb(href,a.textContent?.trim()||'Link')}
      catch(e){showAppDialog('Unable to open link',e.message||String(e))}
    }));
    document.querySelectorAll('[data-activityAuthorLink],[data-activity-author-id]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.activityAuthorId||btn.dataset.authorId;if(id)openProfileById(id,btn.textContent||'Profile')});
    document.querySelectorAll('.activityAuthorLink[data-author-id]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.authorId;if(id)openProfileById(id,btn.textContent||'Profile')});
    document.querySelectorAll('[data-activity-group-id]').forEach(btn=>btn.onclick=async()=>{const id=Number(btn.dataset.activityGroupId);if(!id)return;const group=groupMap[id]||{id,name:btn.textContent||'Group'};state.tab='groups';state.screen='app';state.currentGroup=group;state.toolbarTitle=group.name||group.title||'Group';render();await showGroup(group,'updates')});
    document.querySelectorAll('[data-activity-like]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.activityLike;if(!id)return;
      const liked=btn.dataset.liked==='1';
      try{await A.api({path:`like/${id}`,method:'POST',params:{like_action:!liked},json:true});btn.dataset.liked=liked?'0':'1';btn.textContent=liked?'Like':'Unlike';}
      catch(e){alert('Unable to update like: '+e.message)}
    });
    document.querySelectorAll('[data-activity-like-count]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.activityLikeCount;if(!id)return;try{const data=await A.api({path:`like/${id}`,params:{}});const raw=data?.users?.user||data?.users||data?.user||[];const users=(Array.isArray(raw)?raw:[raw]).filter(Boolean);showAppDialog('Liked by',users.map(u=>u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology user').join('\n')||'No likes yet.')}catch(e){showAppDialog('Unable to load likes',e?.message||String(e)||'Unknown error')}});
    document.querySelectorAll('[data-activity-comments],[data-activity-comment-count]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.activityComments||btn.dataset.activityCommentCount;if(!id)return;
      try{
        const uid=state.auth?.userId||state.auth?.user?.id;
        const update=state.__activityById?.[String(id)]||{}; const rawRealm=String(update.realm||update.realm_name||update.realmName||'user').toLowerCase(); const realm=rawRealm==='user'?'users':rawRealm==='section'?'sections':rawRealm==='group'?'groups':rawRealm==='school'?'schools':rawRealm; const realmId=rawRealm==='user'?(update.user_id||update.uid||uid):rawRealm==='section'?(update.section_id||update.sectionId||uid):rawRealm==='group'?(update.group_id||update.groupId||uid):rawRealm==='school'?(update.school_id||update.schoolId||uid):(update.realm_id||update.realmId||uid); const x=await A.api({path:`${realm}/${realmId}/updates/${id}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});
        openUpdateCommentsModal(realm,realmId,id,'Comments');
      }catch(e){alert('Unable to load comments: '+e.message)}
    });
  }else if(state.homeTab==='dashboard'){
    // Android 2026.06.0 uses a HybridView for this tab. The desktop port uses a
    // native equivalent so Chromium/WebView sizing cannot leave a blank bottom area.
    const uid=state.auth?.userId||state.auth?.user?.id;
    c.classList.remove('embeddedContentActive');c.classList.add('dashboardContentActive');
    c.innerHTML=`<section class="nativeCourseDashboard"><div class="dashboardOfficialLoading" id="dashboardOfficialLoading"><img src="../assets/sgy_loading.gif" alt=""></div><div id="nativeDashboardCourses" class="nativeDashboardCourses"></div></section>`;
    const loader=document.getElementById('dashboardOfficialLoading'),list=document.getElementById('nativeDashboardCourses');
    try{
      const x=uid?await A.api({path:`users/${uid}/sections`,params:{limit:100}}):{};
      const arr=x.section||x.sections||[];window.__schoologyDashboardCourses=arr;
      if(!arr.length){list.innerHTML='<div class="androidEmptyState">No courses found.</div>'}
      else{
        const schoolNames=await Promise.all(arr.map(resolveCourseSchoolName));
        list.innerHTML=arr.map((course,i)=>{
          const title=courseTitleOf(course),section=sectionTitleOf(course),school=schoolNames[i]||'';
          const image=normalizeImageUrl(course.profile_url||course.profileUrl||course.course_profile_url||course.courseProfileUrl||course.course_theme||course.courseTheme||course.image||course.course_image||'');
          return `<button class="nativeDashboardCourse" data-dashboard-course="${i}"><div class="nativeDashboardCourseImage" style="height:130px;min-height:130px;max-height:130px;">${image?`<img data-course-image-url="${esc(image)}" alt="" style="display:none;width:100%;height:130px;min-height:130px;max-height:130px;object-fit:cover;">`:''}<span class="dashboardCourseFallback" style="display:${image?'none':'flex'}">${esc(title.charAt(0)||'C')}</span></div><div class="nativeDashboardCourseInfo"><b>${esc(title)}</b>${section?`<span class="nativeDashboardCoursePeriod">${esc(section)}</span>`:''}${school?`<small>${esc(school)}</small>`:''}</div></button>`;
        }).join('');
        await hydrateCourseImages(list);
        list.querySelectorAll('[data-dashboard-course]').forEach(b=>b.onclick=()=>showCourse(arr[+b.dataset.dashboardCourse],'materials'));
      }
    }catch(e){list.innerHTML=`<div class="error apiError"><b>Schoology could not load the course dashboard.</b><br>${esc(e.message)}</div>`}
    finally{loader?.classList.add('hidden')}
  }else{
    c.classList.remove('recentActivityScroll');c.classList.add('homePortraitUpcomingScroll');
    c.innerHTML='<div id="homeUpcomingList" class="homeUpcomingPortraitList"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div>';
    await renderUpcomingInto(document.getElementById('homeUpcomingList'));
  }
 }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
}

function stopQR(){if(qrStream){qrStream.getTracks().forEach(t=>t.stop());qrStream=null}qrBusy=false}
let nativeQrDetector=null;
function getNativeQrDetector(){
  if(nativeQrDetector!==null)return nativeQrDetector;
  try{
    nativeQrDetector=(typeof BarcodeDetector!=='undefined' && BarcodeDetector.getSupportedFormats)
      ? new BarcodeDetector({formats:['qr_code']}) : false;
  }catch(e){nativeQrDetector=false}
  return nativeQrDetector;
}
async function decodeFrame(ctx,w,h){
  // Prefer Chromium's native QR/barcode decoder. This avoids depending on the
  // QR camera decoding uses Chromium BarcodeDetector with a bundled jsQR fallback.
  const detector=getNativeQrDetector();
  const side=Math.min(w,h);
  const sx=Math.max(0,Math.floor((w-side)/2)),sy=Math.max(0,Math.floor((h-side)/2));
  const size=Math.min(side,1000);
  const work=document.createElement('canvas');work.width=size;work.height=size;
  const wc=work.getContext('2d',{willReadFrequently:true});
  wc.drawImage(ctx.canvas,sx,sy,side,side,0,0,size,size);
  if(detector){
    try{const found=await detector.detect(work);if(found?.length&&found[0]?.rawValue)return found[0].rawValue}catch(e){}
    try{const found=await detector.detect(ctx.canvas);if(found?.length&&found[0]?.rawValue)return found[0].rawValue}catch(e){}
  }
  // jsQR is bundled as a normal browser script in app.html. Do not call it
  // through the sandboxed preload, which cannot require arbitrary npm modules.
  const decoder=window.jsQR;
  if(typeof decoder==='function'){
    const attempts=[wc.getImageData(0,0,size,size),ctx.getImageData(0,0,w,h)];
    for(const img of attempts){
      try{const code=decoder(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});if(code?.data)return code.data}catch(e){}
    }
  }
  return null;
}
async function startQR(){
  const v=document.getElementById('video'),canvas=document.getElementById('canvas');if(!v||!canvas)return;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera API unavailable');
    qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    v.srcObject=qrStream;await v.play().catch(()=>{});
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const tick=async(now)=>{
      if(state.screen!=='qr'||!qrStream)return;
      if(!qrBusy&&v.readyState>=2&&v.videoWidth&&(!qrLastAttempt||now-qrLastAttempt>120)){
        qrLastAttempt=now;
        canvas.width=v.videoWidth;canvas.height=v.videoHeight;ctx.drawImage(v,0,0,canvas.width,canvas.height);
        const data=await decodeFrame(ctx,canvas.width,canvas.height);
        if(data){
          qrBusy=true;stopQR();state.loading=true;state.error='';render();
          try{state.auth=await A.loginQR(data);await afterLogin()}catch(e){state.loading=false;state.error=e.message||'Sorry, your code isn’t working. Please try again.';state.screen='qr';render();startQR();return}
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }catch(e){stopQR();state.error='Unable to access the camera. Enable camera access for Schoology and try again.';render()}
}

installCourseLayoutWatcher();

// Restore the persisted Android-style OAuth session on application launch.
function showStartupOfflineError(){
  const splash=document.getElementById('startupSplash');
  if(!splash)return;
  splash.innerHTML=`<img class="androidSplashLogo" src="../assets/android_loading_logo.png" alt="Schoology"><div class="startupOfflineError"><b>Unable to connect to Schoology</b><span>Check your internet connection and try again.</span><button id="startupRetry">Retry</button></div>`;
  splash.querySelector('#startupRetry')?.addEventListener('click',()=>startSchoologyStartup(true));
}
async function startSchoologyStartup(retry=false){
  try{
    const online=await A.networkOnline?.();
    if(online===false){showStartupOfflineError();return;}
    const saved=await A.authState();
    if(saved?.oauth_token&&saved?.oauth_token_secret){
      state.auth=saved;
      await afterLogin();
      window.schoologyAppReady?.();
    }else{
      render();
      window.schoologyAppReady?.();
    }
  }catch(e){
    console.warn('Schoology startup failed:',e);
    if(retry||e?.message){showStartupOfflineError();return;}
    render();window.schoologyAppReady?.();
  }finally{
    schoologyStartupComplete=true;
    if(queuedIncomingDeepLink){const url=queuedIncomingDeepLink;queuedIncomingDeepLink=null;handleIncomingSchoologyDeepLink(url)}
  }
}
async function handleIncomingSchoologyDeepLink(url){
  console.info('Received Schoology deep link:',url);
  try{
    if(state.screen!=='app'||!state.auth){pendingDeepLinkAfterLogin=url;return}
    if(await routeSchoologyLink(url))return;
    await showEmbeddedWeb(url,'Schoology Link',{openInitialExternalInBrowser:false});
  }catch(e){showAppDialog('Unable to open Schoology link',e.message||String(e))}
}
startSchoologyStartup();
A.onDeepLink?.(url=>{
  if(!schoologyStartupComplete){queuedIncomingDeepLink=url;return}
  handleIncomingSchoologyDeepLink(url);
});
let notificationDiagnosticShown=false;
const reportNotificationProblem=payload=>{
  const message=String(payload?.message||'Check notification settings and Windows notification permissions.');
  console.error('Schoology desktop notification diagnostic:',message);
  if(notificationDiagnosticShown)return;
  notificationDiagnosticShown=true;
  showAppDialog('Desktop notifications unavailable',message+'\n\nCheck that desktop notifications are enabled in Schoology and allowed for Schoology in Windows Settings.');
};
A.onNotificationError?.(reportNotificationProblem);
A.onNotificationPollError?.(reportNotificationProblem);

A.onUpdateAvailable?.(u=>{if(!u?.url)return;let dlg=showAppDialog('Downloading update','Downloading…',[]);const msg=dlg?.querySelector('.appDialogMessage');if(msg)msg.innerHTML='<div class="updateDownloadProgressWrap"><div class="updateDownloadProgressTrack"><div id="autoUpdateDownloadProgressBar" class="updateDownloadProgressBar" style="width:0%"></div></div><div id="autoUpdateDownloadProgressText" class="updateDownloadProgressText">Downloading…</div></div>';const off=A.onUpdateDownloadProgress?.(d=>{const bar=document.getElementById('autoUpdateDownloadProgressBar'),txt=document.getElementById('autoUpdateDownloadProgressText');if(bar&&d?.percent!=null)bar.style.width=d.percent+'%';if(txt)txt.textContent=d?.percent!=null?`Downloading… ${d.percent}%`:'Downloading…';});A.installUpdate(u).catch(e=>{off?.();dlg?.classList.remove('open');showAppDialog('Unable to install update',e.message||String(e))});});
