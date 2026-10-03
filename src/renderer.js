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
let state={screen:'login',school:null,schools:[],q:'',loading:false,error:'',auth:null,user:null,tab:'home',homeTab:'recent',searchToken:0,drawerPage:null,message:null,messageTab:'inbox',messageFolder:'inbox',messageThread:null,composeMessage:false,selectedCourse:null,mobileMe:null,courseDashboardEnabled:false,preferredHomepage:'recent',toolbarTitle:'Home',embeddedReturn:null,embeddedCanOpenExternal:false,homeUpcomingReturn:false,assignmentTab:'info',assignmentCanSubmit:false,assignmentIsTeacher:false,assignmentSubpage:null,submissionMenu:false,assignmentAllowComments:false,assignmentLandscape:false,folderId:0,folderStack:[],courseView:null,activityUsers:{},activityComments:null,currentFolderId:0,currentGroup:null,profileUser:null,profileTab:'updates',groupTab:'updates',resourceCollection:null,windowChromeOverlay:false,homeCreateMenu:false,calendarDate:null,calendarSelectedDate:null,calendarCanCreate:false,calendarEvents:[],calendarEventsMonth:'',groupJoinOpen:false,embeddedTheme:''};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function alert(message){showAppDialog('Schoology',String(message));}
function showAppDialog(title,message,actions=[{label:'OK',action:null}]){let el=document.getElementById('appDialog');if(!el){el=document.createElement('div');el.id='appDialog';el.className='appDialogOverlay';document.body.appendChild(el)}el.innerHTML=`<div class="appDialog" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="appDialogMessage">${esc(message)}</div><div class="appDialogActions">${actions.map((a,i)=>`<button data-dialog-action="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;el.classList.add('open');el.querySelectorAll('[data-dialog-action]').forEach((b,i)=>b.onclick=async()=>{el.classList.remove('open');const fn=actions[i]?.action;if(fn)await fn()});return el}
function showUpdateDialog(u){
  showAppDialog('Update available',`Schoology Desktop Port v${u.version} is available. The update will download only after you choose Install update.`,[{label:'Later',action:null},{label:'Install update',action:async()=>{
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
   return `<article class="messageThreadItem"><div class="messageThreadHeader">${avatar?`<img class="messageThreadAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="messageThreadAvatarFallback">${esc(String(name).charAt(0))}</span>`}<div><b>${esc(name)}</b><small>${esc(date)}</small></div></div><div class="messageThreadBody">${esc(body)}</div>${attachments}</article>`;
 }).join(''):`<div class="messageThreadLoading">Loading message…</div>`;
 return `<div class="shell"><header class="toolbar"><button id="messageBack" class="iconButton" aria-label="Back">‹</button><span class="toolbarTitle">${esc(subject)}</span><button id="messageReply" class="iconButton messageReplyButton" aria-label="Reply">${officialIcon('ic_action_reply.png','Reply')||'↩'}</button></header><main class="messageDetail">${thread?cards:'<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading message…</span></div>'}</main></div>`;
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
const menuImg="<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'><path fill='white' d='M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z'/></svg>";
const officialIconData={"ic_test_quiz.png":"data:image/png;base64,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","ic_action_new.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAj0lEQVRo3u3YsQ2AIBRF0YdYuJMjuJEDsJEjuBMN0UJjISaCFGi8t7HxkxNoUImI/p4pGV4GWUnBTLUAszpJ3vTP12hqHwEAAAAAAAAAAACA6gBzcdMdk6e7/emTJ9z5Bt1Gr9hjWWVD7rOvO4J4B0LGhuYfQeDDBAAAAAAAAAAAAMAHbsU5ue13vYiICloBd7gS8a1wnOgAAAAASUVORK5CYII=","ic_notifications_comment_add.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACH0lEQVQ4y32TXUiTURjHf+/r3pWNYWrma/iFc7E0civMIggGdRd1VTQJAy8q61aIAinookLvwpKCBD+o6EL6IJCgiyiCFjLXCqcblpp7d2FFsZWbvaeLfbC5jwMPB57zP//n+f+fcySA3wOnqgPGrxpFVnOsQTX3joXX56Wf1zur502LWkt7N8ZWK+jxbISsEPs0x2f3fZoitWrZpQdZJIZ506LWeuAsyvYG+DUN8T8ZxwJKSjDa2tgpuvB9GNEAKYsfQLHWQTSYyCilYKoC8xZQNoG8AaIzGFoseaUZEoV0WIvAxhooEYR/KLgmG3PRxkGcQwiARoQ6fK4tbEh1CsDfEOF/VlyTKt32WvbZytHFOkskmA5+Z9D9TTt9e0qVASJeP5h2AOB6odLTXk+HrZxVHWLrYlWHXZYKevZsY0E2aPKd0ZBjzjNOdOYLlNoAcFjKiOkgRK4KIRJEDmtloqO77oDv6eOVw7Pvh9MgXeS/nEmSkiYDa0ePV760d13DM3Y1rVOSChNIUgKTHiOAZ6SP5+NL/QDv/GGMcn4SSQKjDO7ZxMNNQZqT+1L9wZPNls7LH8/vrcLepOadgnt2mXtTK4Qe3dhtSOYDKcDC64cz5s1bB/w1Z3qPOVRuPvHxSss1ZGH0Skfw7YQvr8ZDfRNvQnEh+p/5xP6eWxeSHWZGHaAUNMk55BXOIa+wn7h4BKgo9ksLeZ3yZBmIFiP4D7sOv7gcN2P7AAAAAElFTkSuQmCC","ic_action_download.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD8AAAA/CAQAAAD9VthUAAABnklEQVRYw+2YP2vCQBiHEwtCQFwEXXR1Egr2C4hdHP0IdivS0UU/gNDNjq5209HF2c1FP4CLDkJBkFrIkmqfDtWYU5OWaJKK95sO3j/P3fG+d8cpipSUlJTUJYgQj7zyxE0w+Gd+9BIM/m2Dfw8G/8lWrrc/FGz9nIJXg8Ur/wXPVa9elp4sPVl6V7f5qiw9Wfly8yVe4n3D4xGeKHlSJ8wrRZ6o2+Asc8CgZmPf6svGXsMA5mTd4XsmoEX4wKo64QnTMu09d/ghO/WJ/R1PjL4ldugOX8WqMWkb/HovLs1YiKy6/b1oCmkW5H7Hk2MhRDVx311UWFtSGTw44ylhWPzXVE5t6iK6sJo66nE8KnXBU6d4jlPljpmQtoOmKIREPBodwWvmsuGOTCDJSEg9ICHiSTAQPEYkz/mPE6ErpJ9ya45XZJgK1i6Rc38khWgIiI9d31vGAA28ucgos8JZK8oeXpAUWDrAlxQ8vqHJMLGBT8j48EQ4qHKzG3x6o6DR3oO30Xx8JO2dcJuT0FdRQgd0SgE9FIlzT1yRukx9Ax0Ep3nLYXR9AAAAAElFTkSuQmCC","ic_assignment.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABGCAMAAABG8BK2AAAB8lBMVEVfTDF+bFwAAABsVToAAABWXlMAAABBmNIAAAAAAABmPxEAAABBmNIAAAAAAAAAAABQUFeYbjL/4qX+ulzEoGzOzs6urq6SXijtu2t1styUYCr/u17KdR6ysbDt1bfDrpT///7//vivr6/MeyazsbD39fb/zGz///uRXifCbRr//fmRXib08/OSXif8+vrFcR7/+/b/9/Hy8PD/vGH/23mAc1z/+fT/9O/v7u7DbhqzsrHCbRn/9vH1596bXyDGcx/67+rUf7zDbxu0srH/vWF1dnHPfijcg7f38Ov17ObYo9n/vF//yWrQaZp0gHrUf7mkq7awsLCan6FueYb17unh29iBiobAwsOzsrBBmNL89O/w5+HJy8zKcJ/bodv59/iQmZf/yWv+xXT46N7v6OSUYCi0s7Ls5N9lo8z////h2NT88uzDxcb/vGD37ef6+vrPe6vr49/Nycnf1tJqqNDYptprqdHjruS1tLPHxcVycHDy6eSYnKLq49/k4N7q5eHIa5j68e3yvGnb09DYk0HUz83g3NqTnquUYSppp9Hr5N92s9y1s7KZ1PfWzsqTXSVtqtL/vWLy5t7+/P3s493/zHzrvWf/y2zYz8ppYEnj2tbz6+fSzMr26N7m4NzEw8TQm9Td29rXn9jt5N7JcBalZCQE59oaAAAAEHRSTlOP6wL6CLMR8wcGkwC0FwEFaEHXZgAAAr1JREFUWMPt2GdTGkEAgGFEBM4gWGNBLFiwiw3F3hs2VNSzayyA5RRUsBfEEg161ojY9X/GzQ1znkKCzm1mksn7gQ/M3DPs3S7swvhES4z/zN/E8Pk8HvqBeDw+n35GIEBRzQdCUYGAfobLBYxOZ7NZLN9dyGKx2XQ6wHC59DMsFmDMZrXa1ZurVpvNgGGxYDEmE4p+czEUNZngMnr9exi9Hi6j1b6H0WrhMlbrexirFS6jUs3MuDr9dndVKrjM1tbJSUHBl59dXR0dPTxMT3912PLyysrdXWNjVRU85vp6bo782IeHq6vz80bjvoOMxpubkhKDYXZ2agpB4DCjoy8fOIoODe3vY05qbu7v7+2trTUYenrgMF1dVOby0hmztNTd3d7e1nZ/f3u7tgaHWVykMq2tIyPgIuVzL18fH5uaxsfbn2toqK9/88BpYmpqqEx1NcFQq6ysq8Px7W3AVFQ4mH40MZOTVGZ9vazMPij7gEpLBwZwvLwcx1taFhYcLk2amOJiKtPZSTBkRUXn5/hzCgWOFxY6+aKgiRkbozL5+bm55KCUSrmcQAAzPJyTA5fJzqYyMhnBEMnlmZmAyMhQKHZ2lMr0dLhMWhqVkUo7OuyDSk0lB5ScDN5LSoLLyGRUJiGBYDAsPp5E4uIIOiYGLiOVUhmJJDoaXBIVBRYAaGIiMREsCwwTi/v64DKRkVQmIkIkwrC8PBIBN5dILE5JgctIJFRGoxGJQkNjYwEhFOJ4SAg5GcXi42O4jEYTHEz++O7taTTh4UFBYDBgCQQGfn5RQABx9IDJvM7fH8cHB/38hMKDA8cHoT/HhIWdnfn6np5ubj49OTuWwWE4nLfbxIuLrKyNDR8f5xtJDgcGgyBstterPDy8vd3dPT29fhGbTWzZ6GWYTARhvcrNjcFg/SYEYTLpZ/61P15+ANmGakjyc+W3AAAAAElFTkSuQmCC","ic_notifications_test_quiz.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAYAAADUryzEAAACSklEQVQ4y42SS0hUcRTGf/fOvQ6TLzKYcfI5DoYpZIs0K81BBFu0aOFegtkYBLUzalu0iFbhLBqiq0ibgghahFIOJtMDeiySHlxnFHWcIR/cUcaZuTO3xTwsnSHP6s/5znf+3znfESgQzXcZ7bU7hwF8IdXza4QrFAlTMbKr00pjTSlo5o5o14ZtfYqXhRqIexM5smb2o5n9uDqt5NQcSEG0a8OGZu5oO2bBIpXzeiaBL6R6iikQ3IrTKAT098cAmJqy7MO8Q6qQe0sAF8+dZCu58k/RetwPgKvzTD4ni6VMvguwdHvSMIw0dbcGBAkgZcRJGTvo6R0SKY2UkYS4FYBN1N15BZn6hcsI7c1saXHUm08NEeB7YJ2ZjxqrK4c5JFdjEuR9smOmCIvPhjnvGuDRzycAJH+HMy4EQmG8Q2pjIBRmaclMialiX4Oexw3c6Z3nzewnek534/06yr2z9xGAhmzNAtDgVpzBno4KoonlPLl9rILuwVqINfFts54H01H0U8/xhVSP5Facwdxm3Yoz6LDbkEWR8pIa9PQOrUqKrsE6iGX+eftiHL1v90IlAIfdhlvBcNhttDZZmZuPEAhpXJ0zOHHBBRlHGR3387kPvENqY1ZxxsYWRxW1tTFkUcySwzystMK1SzD3AwDP2CyVI1XwIZIbd/eUY/oa0cQyyfR2fqETX6p5Nb0NthbGJnykr28UPGUJoEw+CoBFOoLDbsGtEJz36yyuvKdtFcpuHMekr2XrIgc75exSi2L5Bn/ZuDcW/oMB8AdPJOq18j24LwAAAABJRU5ErkJggg=="};
const officialIconExtraData={"ic_attach_resourcesv3.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAAAbUlEQVRYw+3UTQ5AMBCG4W/EHiduXBg3GAsrkVElIniny0n6NJ0fc90blQAAAACeB+r9dC/ltqGlK8ByhbogM2b5Q4A0hDRdBCCZxxNQEOlEmzaaSh76ghrY6rRs0204kwzwv23KFwEAAHwJmAF0XwtqZQqlrAAAAABJRU5ErkJggg==","ic_action_ic_menu_folder.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAABFElEQVRYw+2Wuw4BQRSGZ9a6FIJEIVFqFK6h0GhEIfEwSg+hVnoCvccQ624l2JCIhkRhY7MmR6VZwZlhK/OVZzfny5yc+XcJkUgkkj+AOgvZkrfiKN2ObeMqKlCfjGFIOGvRqtETFSiot2r5iKsCCHjqPxvRC8rF0OuHjGkdAl8JQCWFN2OwuU9AD9cW1ySAUwBL4vM38P0fx4PuYIYb0TyQgzj3pWLUQG0RZZclyQiszKpv4tZ0q1qQ5O8PE+Q9gIWaIl7+/paGFeiKyID20wNKQJm5o2kBwQgZFeAJNolA9thDdBZBTCD3T+ONeJriNghcFSjaN9+Dz1iguyvQ+7arAqqh0xTOdM0vYBP5/ySRSP6aO8hVS+x558quAAAAAElFTkSuQmCC","ic_action_discard_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAYAAABU1PscAAABD0lEQVRYw+2X0Q2CMBCGP40DMAFhBJ95ATZwBEZwg4YJHEHcQDfgiWfcgDgBI/hyJo3hQckhrfRPGpLjaO8v91+vEBCwbmy0J6zaxwk4jrzqgcKkca+53lY5+MQKvgMaGQAJUGpv2E55vlyejUnjwiJWAmcgcy6FZNcPQCQB5pIudqpEwF5sF7FdTRp3LvyBEjBvtkQGI/aXbwYUTmlgCWgQ6EWwc3/zmzJq6cJOoUEj32cjULWPXMTbfOCeAJg0rl0qo7mI03zo3wC1KxrgrWR6J+IpBAYnW4kvcPedgPcp5BaBCS2y9xroggZmIND5TmBYjQY0G7uggaU1oHmpr4Cbdf8dO+z6JQ+9gIB/xBON3T2KYvt1bAAAAABJRU5ErkJggg==","ic_action_send_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAYAAABU1PscAAABEUlEQVRYw+3XwW2DMBiG4RfEAEyAGIEzp2wQNoANMgLyCJ0gzQZskJvP3aCVF2g2aA91pAjRJMV/Yrvyd0Igo+8BDBhSUlL+FKXNu9JmCKVPtgLwZTc/ADW21WusAEKASAC8QiQBXiD5ijGnG8drYP+syZ6tGaS06YAtcE/Bh96RzGWw0qYEzpjOBySTOtEFZgc0z4K43oEBOI1tNc321xbTX8GIQFwBR2BjJ/YEvIxt9baAGSymloZIAeaFJuCwgGkspFvArILkRJ5C6Dy3HqHdL1fd+RFyBRxs6Tgn8X94jcb5IbO/Ev0dpcP7lVDafAKl7+Iuk7gMobj0a9TbgqaItbgEIIhFfRFr8ZSUlJ98Awi3lNmk+OSWAAAAAElFTkSuQmCC","ic_action_new.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAj0lEQVRo3u3YsQ2AIBRF0YdYuJMjuJEDsJEjuBMN0UJjISaCFGi8t7HxkxNoUImI/p4pGV4GWUnBTLUAszpJ3vTP12hqHwEAAAAAAAAAAACA6gBzcdMdk6e7/emTJ9z5Bt1Gr9hjWWVD7rOvO4J4B0LGhuYfQeDDBAAAAAAAAAAAAMAHbsU5ue13vYiICloBd7gS8a1wnOgAAAAASUVORK5CYII=","ic_notifications_test_quiz.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAYAAADUryzEAAACSklEQVQ4y42SS0hUcRTGf/fOvQ6TLzKYcfI5DoYpZIs0K81BBFu0aOFegtkYBLUzalu0iFbhLBqiq0ibgghahFIOJtMDeiySHlxnFHWcIR/cUcaZuTO3xTwsnSHP6s/5znf+3znfESgQzXcZ7bU7hwF8IdXza4QrFAlTMbKr00pjTSlo5o5o14ZtfYqXhRqIexM5smb2o5n9uDqt5NQcSEG0a8OGZu5oO2bBIpXzeiaBL6R6iikQ3IrTKAT098cAmJqy7MO8Q6qQe0sAF8+dZCu58k/RetwPgKvzTD4ni6VMvguwdHvSMIw0dbcGBAkgZcRJGTvo6R0SKY2UkYS4FYBN1N15BZn6hcsI7c1saXHUm08NEeB7YJ2ZjxqrK4c5JFdjEuR9smOmCIvPhjnvGuDRzycAJH+HMy4EQmG8Q2pjIBRmaclMialiX4Oexw3c6Z3nzewnek534/06yr2z9xGAhmzNAtDgVpzBno4KoonlPLl9rILuwVqINfFts54H01H0U8/xhVSP5Facwdxm3Yoz6LDbkEWR8pIa9PQOrUqKrsE6iGX+eftiHL1v90IlAIfdhlvBcNhttDZZmZuPEAhpXJ0zOHHBBRlHGR3387kPvENqY1ZxxsYWRxW1tTFkUcySwzystMK1SzD3AwDP2CyVI1XwIZIbd/eUY/oa0cQyyfR2fqETX6p5Nb0NthbGJnykr28UPGUJoEw+CoBFOoLDbsGtEJz36yyuvKdtFcpuHMekr2XrIgc75exSi2L5Bn/ZuDcW/oMB8AdPJOq18j24LwAAAABJRU5ErkJggg=="};
function officialIcon(name,alt=''){const src=officialIconData[name]||officialIconExtraData[name]||'';return src?`<img class="officialEmbeddedIcon" src="${src}" alt="${esc(alt)}">`:''}
function officialOrAssetIcon(name,alt=''){const embedded=officialIcon(name,alt);if(embedded)return embedded;const src=String(name||'').endsWith('.svg')||String(name||'').endsWith('.png')?name:`${name}.png`;return `<img class="officialEmbeddedIcon" src="../assets/icons/${src}" alt="${esc(alt)}">`}

function render(){let h=state.message?messageDetail():state.screen==='login'?login():state.screen==='search'?schoolSearchScreen():state.screen==='credentials'?credentials():state.screen==='externalSelect'?externalSelect():state.screen==='qr'?qr():shell();app.innerHTML=h;bind();syncWindowChrome();return h}
function syncWindowChrome(){if(A.platform!=='win32'&&A.platform!=='linux')return;let color='#002137';if(state.screen!=='app'){color=(state.screen==='login'||state.screen==='search'||state.screen==='credentials'||state.screen==='externalSelect'||state.screen==='qr')?'#44505d':'#22303e'}else if(document.getElementById('drawer')?.classList.contains('open'))color='#001827';A.setWindowChrome?.({color,symbolColor:'#ffffff',height:56}).catch?.(()=>{})}
function login(){return `<div class="login loginAnimated"><img class="logo" src="../assets/logo_schoology.png"><div class="loginBody"><button id="schoolLogin" class="primary loginIconButton"><img src="../assets/icons/ic_school.svg" alt=""><span>Log in through your School</span></button><button id="continueSchoology" class="secondary loginIconButton"><img src="../assets/logo_schoology.png" alt=""><span>Log in using schoology.com</span></button><button id="qrLogin" class="qrButton loginIconButton"><img src="../assets/icons/ic_qr_code.svg" alt=""><span>Sign in with a QR code</span></button></div><div class="loginBottom">I need help signing in</div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function schoolSearchScreen(){return `<div class="login loginAnimated"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="label">School</div><div class="searchWrap"><input id="schoolSearch" autocomplete="off" autofocus placeholder="Enter your School or domain" value="${esc(state.q)}"><span>⌕</span></div><div id="schoolSearchStatus"></div><div id="schoolSuggestions"></div></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function credentials(){return `<div class="login loginAnimated"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody">${state.school?`<div class="selected">${esc(state.school.title||'School')}</div>`:'<div class="accountTitle">Log in using schoology.com</div>'}<div class="label">Username or Email</div><input id="user" class="field" autocomplete="username"><div class="label">Password</div><input id="pass" class="field" type="password" autocomplete="current-password"><button id="signIn" class="primary">Login</button><button id="qrLogin" class="qrButton">Sign in with a QR code</button></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function externalSelect(){
  const name=state.school?.title||'School';
  return `<div class="login loginAnimated"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="selected">${esc(name)}</div><button id="browserLogin" class="primary">Log in through your browser</button><button id="nativeLogin" class="secondary">Log in with a username and password</button></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`
}
function qr(){return `<div class="qr loginAnimated"><button id="back" class="back">‹</button><h1>QR Code Login</h1><p>Scan Your Code</p><video id="video" autoplay playsinline muted></video><canvas id="canvas"></canvas><div class="qrbox"></div><p class="qrhint">Point your camera at the QR code shown in Schoology.</p>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function drawerItemMarkup(id,label,icon){
 return `<button class="drawerItem" data-drawer="${id}"><span class="drawerIcon"><img src="../assets/icons/${icon}.svg" alt=""></span><span class="drawerLabel">${label}</span>${['messages','notifications','requests'].includes(id)?'<span class="drawerBadge"></span>':''}${id==='courses'||id==='groups'||id==='grades'?'<span class="disclosure">›</span>':''}</button>`;
}
function shell(){
 const drawerItems=[
  ['messages','Messages','ic_menu_messages'],['notifications','Notifications','ic_menu_notifications'],['requests','Requests','ic_menu_requests'],
  ['home','Home','ic_menu_home'],['courses','Courses','ic_menu_courses'],['groups','Groups','ic_menu_groups'],['resources','Resources','ic_menu_resources'],['grades','Grades','ic_menu_grades'],['calendar','Calendar','ic_menu_calender'],
  ['settings','Settings','ic_menu_account_settings'],['logout','Logout','ic_menu_logout']
 ];
 const drawerPage=state.drawerPage==='courses'||state.drawerPage==='groups'||state.drawerPage==='grades'?`
   <div class="drawerSub">
    <div class="drawerSubHeader"><button id="drawerBack" class="drawerBack">‹</button><span>${state.drawerPage==='grades'?'Grades':state.drawerPage==='groups'?'Groups':'Courses'}</span>${state.drawerPage==='courses'?'<button id="joinCourse" class="drawerHeaderAction" style="display:none">+</button>':state.drawerPage==='groups'?'<button id="joinGroup" class="drawerHeaderAction" style="display:none">+</button>':'<span class="drawerHeaderSpacer"></span>'}</div>
    <div id="courseSubList" class="courseSubList"><div class="drawerLoading">Loading ${state.drawerPage==='grades'?'grades':state.drawerPage==='groups'?'groups':'courses'}…</div></div>
   </div>`:'';
 const drawerList=drawerItems.map(([id,label,icon],i)=>`${i===3?'<div class="drawerDivider"></div>':''}${i===9?'<div class="drawerDivider"></div>':''}${drawerItemMarkup(id,label,icon)}`).join('');
 return `<div class="shell">
 <header class="toolbar">${state.assignmentView||state.embeddedTitle?`<button id="toolbarBack" class="iconButton" aria-label="Back">‹</button>`:`<button id="menuButton" class="iconButton" aria-label="Navigation menu">${menuImg}</button>`}<span class="toolbarTitle">${esc(state.toolbarTitle||'Home')}</span><span id="toolbarActionSlot" class="toolbarActionSlot"></span></header>
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
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const dateValue=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const timeValue=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const postTo=(realm==='users'?'My Account':`${realm.charAt(0).toUpperCase()+realm.slice(1)} ${realmId||''}`).trim();
  wrap.innerHTML=`<section class="androidCreatePostDialog" role="dialog" aria-modal="true">
    <header class="androidCommentDialogBar"><button id="createPostCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">${title}</div><button id="createPostSend" class="androidDialogIcon" aria-label="Post">${officialIcon('ic_action_send_icon.png','Post')}</button></header>
    <div class="androidCreatePostBody">
      <label class="androidFieldLabel">Post To</label><div class="androidPostToField">${esc(postTo)}</div>
      <input id="createPostTitle" placeholder="Title" autocomplete="off">
      <textarea id="createPostBody" placeholder="${isEvent?'Description':'Description'}"></textarea>
      ${isEvent?`<div class="androidSwitchRow"><label><input id="createEventAllDay" type="checkbox" checked> All Day</label></div>
      <div class="androidDateRow"><span>When</span><input id="createEventStartDate" type="date" value="${dateValue}"><input id="createEventStartTime" type="time" value="${timeValue}"></div>
      <label class="androidCheckRow"><input id="createEventAddEnd" type="checkbox"> End Date</label>
      <div id="createEventEndWrap" class="androidDateRow" style="display:none"><input id="createEventEndDate" type="date" value="${dateValue}"><input id="createEventEndTime" type="time" value="${timeValue}"><button id="createEventEndCancel" type="button">×</button></div>
      <label class="androidFieldLabel">RSVP</label><select id="createEventRsvp"><option value="0">No RSVP</option><option value="1">Yes</option><option value="2">Maybe</option></select>
      <label class="androidCheckRow"><input id="createEventComments" type="checkbox" checked> Enable comments</label>`:
      `<label class="androidCheckRow"><input id="createDiscussionDue" type="checkbox"> Due Date</label>
      <div id="createDiscussionDueWrap" class="androidDateRow" style="display:none"><input id="createDiscussionDueDate" type="date" value="${dateValue}"><input id="createDiscussionDueTime" type="time" value="${timeValue}"></div>
      <label class="androidCheckRow"><input id="createDiscussionGrading" type="checkbox"> Enable Grading</label>
      <div id="createDiscussionGradingWrap" class="androidGradingBox" style="display:none"><label>Max Points <input id="createDiscussionMaxPoints" type="number" min="0" step="0.01"></label><label>Factor <input id="createDiscussionFactor" type="number" min="0" step="0.01" value="1.0"></label></div>
      <label class="androidCheckRow"><input id="createDiscussionPublished" type="checkbox" checked> Published</label>`}
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
  wrap.querySelector('#createPostCancel')?.addEventListener('click',close);
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  if(isEvent){
    const all=wrap.querySelector('#createEventAllDay'),end=wrap.querySelector('#createEventAddEnd'),endWrap=wrap.querySelector('#createEventEndWrap');
    const sync=()=>{wrap.querySelector('#createEventStartTime').disabled=all.checked;wrap.querySelector('#createEventEndWrap').style.display=end.checked?'flex':'none';};
    all?.addEventListener('change',sync);end?.addEventListener('change',sync);wrap.querySelector('#createEventEndCancel')?.addEventListener('click',()=>{end.checked=false;sync()});sync();
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
        await A.api({path:`${selectedRealm}/${selectedId}/events`,method:'POST',params,json:true});
      }else{
        const params={title:titleText,body,published:wrap.querySelector('#createDiscussionPublished')?.checked?1:0};
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
  for(const [id,path] of checks){try{const x=await A.api({path,params:{limit:1}});const n=Number(x?.total||x?.unread||x?.count||0);document.querySelector(`[data-drawer="${id}"] .drawerBadge`)?.classList.toggle('visible',n>0)}catch{}}
}

function bind(){
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
      list?.querySelectorAll('[data-school]').forEach(b=>b.onclick=async()=>{const school=state.schools[+b.dataset.school];state.school=school;state.schools=[];state.error='';const external=!!school&&school.login_type&&school.login_type!=='schoology';const browserFlow=!!school&&(school.use_browser_login_flow??school.useBrowserLoginFlow??true);if(!external){state.screen='credentials';render();document.getElementById('user')?.focus();return}if(browserFlow){state.screen='externalSelect';render();return}state.loading=true;updateSearchUi();try{state.auth=await A.loginExternalSchool({url:school.login_url||school.loginUrl||'',domain:school.domain||''});await afterLogin()}catch(e){state.error=e.message||'School sign-in failed.';state.screen='search';render()}finally{state.loading=false}});
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

  document.querySelectorAll('[data-school]').forEach(b=>b.onclick=async()=>{
    state.school=state.schools[+b.dataset.school];state.schools=[];state.error='';
    const school=state.school,external=!!school&&school.login_type&&school.login_type!=='schoology';
    const browserFlow=!!school&&(school.use_browser_login_flow??school.useBrowserLoginFlow??true);
    if(!external){state.screen='credentials';render();document.getElementById('user')?.focus();return}
    if(browserFlow){state.screen='externalSelect';render();return}
    state.loading=true;render();
    try{state.auth=await A.loginExternalSchool({url:school.login_url||school.loginUrl||'',domain:school.domain||''});await afterLogin()}
    catch(e){state.error=e.message||'School sign-in failed.';state.screen='search';render()}finally{state.loading=false}
  });
  const browserLogin=document.getElementById('browserLogin');
  if(browserLogin)browserLogin.onclick=async()=>{state.loading=true;state.error='';render();try{state.auth=await A.loginSchoolBrowser({domain:state.school?.domain||''});await afterLogin()}catch(e){state.loading=false;state.error=e.message||'Browser sign-in failed.';render()}};
  const nativeLogin=document.getElementById('nativeLogin');if(nativeLogin)nativeLogin.onclick=()=>{state.error='';state.screen='credentials';render();document.getElementById('user')?.focus()};
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
      state.drawerPage=id;const drawer=document.getElementById('drawer');if(drawer){drawer.innerHTML=`<div class="drawerSub"><div class="drawerSubHeader"><button id="drawerBack" class="drawerBack">‹</button><span>${id==='grades'?'Grades':id==='groups'?'Groups':'Courses'}</span>${id==='courses'?'<button id="joinCourse" class="drawerHeaderAction" style="display:none">+</button>':id==='groups'?'<button id="joinGroup" class="drawerHeaderAction" style="display:none">+</button>':'<span class="drawerHeaderSpacer"></span>'}</div><div id="courseSubList" class="courseSubList"><div class="drawerLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading ${id==='grades'?'grades':id==='groups'?'groups':'courses'}…</span></div></div></div>`;drawer.classList.add('open');document.getElementById('drawerShade')?.classList.add('open')}bind();loadCourseSubmenu();return;
    }
    closeDrawerThen(async()=>{
      if(id==='logout'){await A.logout();state.auth=null;state.school=null;state.tab='home';state.screen='login';render();return}
      if(id==='settings'){state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.currentGroup=null;state.profileUser=null;state.embeddedTitle=null;state.tab='settings';state.toolbarTitle='Settings';state.screen='app';render();loadTab();return}
      if(['home','calendar','grades','messages','notifications','requests','resources','profile','groups'].includes(id)){state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.currentGroup=null;state.profileUser=null;state.embeddedTitle=null;state.tab=id;state.toolbarTitle=id.charAt(0).toUpperCase()+id.slice(1);state.screen='app';render();loadTab()}
    });
  }));

  document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{const order=['recent','dashboard','upcoming'];const oldIndex=order.indexOf(state.homeTab),newIndex=order.indexOf(b.dataset.homeTab);state.homeTabDirection=newIndex>=oldIndex?'forward':'back';state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(m){state.message=m;render();}});
  document.getElementById('messageBack')?.addEventListener('click',()=>{state.message=null;state.messageThread=null;render();loadTab()});
  document.querySelectorAll('[data-message-tab]').forEach(b=>b.onclick=()=>{state.messageTab=b.dataset.messageTab;loadTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(!m)return;state.message=m;state.messageFolder=state.messageTab;state.messageThread=null;render();await loadMessageThread(m)});
  document.querySelectorAll('[data-download-url]').forEach(b=>b.onclick=async()=>{try{const r=await downloadWithFeedback(b,{url:b.dataset.downloadUrl,filename:b.dataset.downloadName,mime:b.dataset.downloadMime});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)}catch(e){alert('Unable to open file: '+e.message)}});
  document.querySelectorAll('[data-open-url]').forEach(b=>b.onclick=()=>openWithPressTransition(b,()=>showEmbeddedWeb(b.dataset.openUrl,'Link')));
  document.querySelectorAll('[data-embed-html]').forEach(b=>b.onclick=()=>showEmbeddedWeb('data:text/html;charset=utf-8,'+encodeURIComponent(b.dataset.embedHtml),'Embedded content'));
  document.querySelectorAll('[data-course-sub]').forEach(b=>b.onclick=()=>{const i=+b.dataset.courseSub;const c=window.__schoologyCourses?.[i];state.drawerPage=null;state.tab='courses';state.courseView='course';state.toolbarTitle=sectionTitleOf(c)||courseTitleOf(c);state.screen='app';render();showCourse(c)});
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
    throw e;
  }
  state.screen='app';render();await loadTab();
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
    return responses.some(r=>Number(r?.response_code||r?.responseCode)===200 && !!(r?.permission_map?.post??r?.permissionMap?.post));
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
   document.querySelectorAll('[data-course-sub]').forEach(b=>b.onclick=()=>{const course=window.__schoologyCourses[+b.dataset.courseSub];closeDrawerThen(()=>{state.drawerPage=null;state.tab=page==='grades'?'grades':'courses';state.courseView='course';state.toolbarTitle=sectionTitleOf(course)||courseTitleOf(course);state.screen='app';render();showCourse(course,page==='grades'?'grades':'materials')});});
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
async function resolveCourseSchoolName(course){
  const schoolId=course?.school_id??course?.schoolId??course?.school?.id;
  if(!schoolId)return String(course?.school?.title||course?.school?.name||'');
  try{const x=await A.api({path:`schools/${schoolId}`,params:{}});const school=x?.school||x;return String(school?.title||school?.name||'')}catch{return ''}
}
function courseTitleOf(course){return course?.course_title||course?.courseTitle||course?.title||course?.section_title||'Course'}
function sectionTitleOf(course){return course?.section_title||course?.sectionTitle||''}
function openProfileById(id,name='Profile'){
  const uid=Number(id); if(!uid)return;
  state.profileUser={id:uid}; state.profileTab='updates'; state.tab='profile'; state.toolbarTitle='Profile';
  state.assignmentView=null; state.embeddedTitle=null; state.embeddedTheme=''; state.currentGroup=null; state.courseView=null; state.selectedCourse=null;
  render(); loadTab();
}
function syncToolbar(){
  const header=document.querySelector('.toolbar');if(!header)return;
  const needs=!!(state.assignmentView||state.embeddedTitle||state.composeMessage||state.message||state.resourceCollection) && !(state.courseView && !state.assignmentView && !state.embeddedTitle);
  const existing=header.querySelector('#toolbarBack');
  const menu=header.querySelector('#menuButton');
  if(needs&&!existing){const b=document.createElement('button');b.id='toolbarBack';b.className='iconButton';b.setAttribute('aria-label','Back');b.textContent='‹';b.addEventListener('click',navigateBack);header.insertBefore(b,header.firstChild);if(menu)menu.remove();}
  if(!needs&&!existing&&menu===null){const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.innerHTML=`${menuImg}`;header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open');syncWindowChrome()});}
  if(!needs&&existing){existing.remove();const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.innerHTML=`${menuImg}`;header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open');syncWindowChrome()});}
  const title=header.querySelector('.toolbarTitle');if(title)title.textContent=state.toolbarTitle||'Home';header.classList.toggle('toolbarAccountInfo',state.embeddedTheme==='account');header.classList.toggle('toolbarLti',state.embeddedTheme==='lti');
  const slot=header.querySelector('#toolbarActionSlot');if(!slot)return;
  slot.innerHTML='';
  if(state.tab==='home'&&!state.courseView&&!state.assignmentView&&!state.embeddedTitle){slot.innerHTML=`<button id="homeCreatePlus" class="iconButton toolbarImageButton" aria-label="Create">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('homeCreatePlus')?.addEventListener('click',showHomeCreateMenu);return;}
  if(state.tab==='calendar'&&!state.courseView&&!state.embeddedTitle){if(state.calendarCanCreate){slot.innerHTML=`<button id="calendarCreatePlus" class="iconButton toolbarImageButton" aria-label="Create event">${officialIcon('ic_action_new.png','')}</button>`;document.getElementById('calendarCreatePlus')?.addEventListener('click',()=>showCreatePostDialog('event','',null));}return;}
  if(state.embeddedTitle && state.embeddedTheme!=='quiz'){
    slot.innerHTML=`<button id="embeddedReload" class="iconButton toolbarImageButton" aria-label="Reload"><img src="../assets/icons/ic_action_refresh.png" alt=""></button>${state.embeddedCanOpenExternal?'<button id="embeddedOpenBrowser" class="iconButton toolbarImageButton" aria-label="Open in browser" title="Open in browser">↗</button>':''}`;
    document.getElementById('embeddedReload')?.addEventListener('click',()=>{const w=document.getElementById('schoologyWebview');try{w?.reload()}catch{}});
    document.getElementById('embeddedOpenBrowser')?.addEventListener('click',()=>{const w=document.getElementById('schoologyWebview');const u=w?.getURL?.()||'';if(u)A.openExternal(u).catch(e=>alert('Unable to open browser: '+e.message))});return;
  }
  if(state.embeddedTitle && state.embeddedCanOpenExternal){slot.innerHTML='<button id="embeddedOpenBrowser" class="iconButton toolbarImageButton" aria-label="Open in browser" title="Open in browser">↗</button>';document.getElementById('embeddedOpenBrowser')?.addEventListener('click',()=>{const w=document.getElementById('schoologyWebview');const u=w?.getURL?.()||'';if(u)A.openExternal(u).catch(e=>alert('Unable to open browser: '+e.message))});return;}
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
    slot.innerHTML='<button id="courseUpdatePlus" class="iconButton toolbarImageButton" aria-label="Post update"><img src="../assets/icons/ic_action_new.png" alt=""></button>';
    document.getElementById('courseUpdatePlus')?.addEventListener('click',()=>state.selectedCourse&&openCourseUpdateComposer(state.selectedCourse));
  }else if(state.courseView&&!state.assignmentView&&!state.embeddedTitle&&!state.currentGroup&&!state.profileUser&&state.courseTab==='materials'){
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
  if(state.resourceCollection){
    state.resourceCollection=null;state.toolbarTitle='Resources';state.tab='resources';
    render();loadResourcesHome(document.getElementById('content'));return;
  }
  if(state.embeddedTitle){
    const ret=state.embeddedReturn;
    state.embeddedTitle=null; state.embeddedTheme=''; state.embeddedReturn=null;
    if(ret){state.tab=ret.tab;state.homeTab=ret.homeTab||state.homeTab;state.toolbarTitle=ret.title||'Settings';state.courseView=null;state.selectedCourse=null;state.currentGroup=null;state.profileUser=null;render();loadTab();return;}
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
 const request=[`/v1/sections/${sectionId}/grades`,`/v1/users/${userId}/grades`,`/v1/sections/${sectionId}/attendance`];
 const x=await A.api({path:'multioptions',method:'POST',params:{request}});
 const list=Array.isArray(x?.response)?x.response:(Array.isArray(x?.responses)?x.responses:[]);
 const by={};
 for(const r of list){if(r?.location)by[String(r.location)]=String(r.body||'').toLowerCase()}
 const sectionGradeBody=by[`/v1/sections/${sectionId}/grades`]||'';
 const userGradeBody=by[`/v1/users/${userId}/grades`]||'';
 const attendanceBody=by[`/v1/sections/${sectionId}/attendance`]||'';
 return {sectionGradesPut:sectionGradeBody.includes('put'),userGradesGet:userGradeBody.includes('get'),attendanceGet:attendanceBody.includes('get')};
}

async function showCourse(course,activeTab='materials',forceRebuild=false){
 const c=document.getElementById('content');if(!c)return;
 const renderToken=++courseRenderToken;
 if(!course){loadTab();return}
 const sid=course.id||course.section_id||course.sectionId;
 const sameCourse=!forceRebuild&&state.courseView==='course'&&state.selectedCourse&&String(state.selectedCourse.id||state.selectedCourse.section_id||state.selectedCourse.sectionId)===String(sid)&&!!c.querySelector('.courseLandscapePage');
 // Android keeps the SectionProfilePagerFragment alive while switching tabs. Only
 // replace the tab content; the apps/upcoming split and course header remain mounted.
 if(sameCourse){
   const tab=activeTab;
   const buttons=[...c.querySelectorAll('[data-course-tab]')];
   const target=buttons.find(b=>b.dataset.courseTab===tab);
   if(target){buttons.forEach(b=>b.classList.toggle('active',b===target));}
   state.courseTab=tab;state.toolbarTitle=target?.textContent||state.toolbarTitle;state.folderStack=[];state.currentFolderId=0;state.assignmentView=null;state.embeddedTitle=null;syncToolbar();
   const tabContent=document.getElementById('sectionProfileContent');
   if(tabContent)tabContent.innerHTML='<div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
   await loadCourseTab(course,tab).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});
   return;
 }
 state.selectedCourse=course;state.courseView='course';state.courseTab=activeTab;state.folderStack=[];state.currentFolderId=0;state.assignmentView=null;state.embeddedTitle=null;
 state.toolbarTitle=sectionTitleOf(course)||courseTitleOf(course);syncToolbar();
 const title=courseTitleOf(course), section=sectionTitleOf(course);
 const [sectionDetail,schoolFromList]=await Promise.all([
   A.api({path:`sections/${sid}`,params:{}}).catch(()=>course),
   resolveCourseSchoolName(course)
 ]);
 const school=await resolveCourseSchoolName(sectionDetail||course)||schoolFromList;
 const image=normalizeImageUrl(course.profile_url||course.profileUrl||course.course_profile_url||course.courseProfileUrl||course.course_theme||course.courseTheme||course.image||course.course_image||'');
 const navPerms=await getCourseNavigationPermissions(sid,state.auth?.userId||state.auth?.user?.id).catch(()=>null);
 if(renderToken!==courseRenderToken||state.screen!=='app'||state.courseView!=='course'||state.selectedCourse!==course)return;
 const canGradebook=!!navPerms?.sectionGradesPut, canGrades=!!navPerms?.userGradesGet, attendanceEnabled=!!navPerms?.attendanceGet;
 const landscape=window.matchMedia('(min-aspect-ratio: 4/3)').matches;
 const tabs=[['materials','Materials'],['updates','Updates'],...(landscape?[]:[['upcoming','Upcoming']]),...(canGradebook?[['gradebook','Gradebook']]:canGrades?[['grades','Grades']]:[]),...(attendanceEnabled?[['attendance','Attendance']]:[]),...(landscape?[]:[['courseapp','Course App']])];
 let effectiveTab=activeTab;
 if(effectiveTab==='grades'&&canGradebook)effectiveTab='gradebook';
 if(effectiveTab==='gradebook'&&!canGradebook)effectiveTab='grades';
 if(effectiveTab==='attendance'&&!attendanceEnabled)effectiveTab='materials';
 if(landscape&&effectiveTab==='upcoming')effectiveTab='materials';
 if(landscape&&effectiveTab==='courseapp')effectiveTab='materials';
 state.courseTab=effectiveTab;
 c.innerHTML=`<section class="sectionProfilePage courseLandscapePage">
   <aside class="courseAppsSidePane"><div class="homePaneHeader">Course Apps</div><div id="courseAppsSideContent" class="courseAppsSideContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></aside>
   <section class="courseMainPane">
    <div class="sectionProfileTabs">${tabs.map(([id,label])=>`<button class="sectionProfileTab ${effectiveTab===id?'active':''}" data-course-tab="${id}">${label}</button>`).join('')}</div>
    <div class="sectionProfileHeader courseIdentityCard"><div class="courseIdentityImageWrap"><img class="sectionProfileImage" data-course-image-url="${esc(image)}" style="display:none" alt=""><span class="sectionProfileFallback" style="display:${image?'none':'flex'}">${esc(title.charAt(0)||'C')}</span></div><div class="courseIdentityInfoBar"><div class="sectionProfileTitle">${esc(title)}</div><div class="sectionProfileSubtitle">${esc(section||'')}</div>${school?`<div class="courseIdentitySchool">${esc(school)}</div>`:''}</div></div>
    <div class="sectionProfileRule"></div>
    <div id="sectionProfileContent" class="sectionProfileContent tabSlidePage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div>
   </section>
   <aside id="courseUpcomingPane" class="courseUpcomingPane"><div class="homePaneHeader">Upcoming</div><div id="courseUpcomingContent" class="courseUpcomingContent"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div></div></aside>
 </section>`;
 hydrateCourseImages(c);
 document.querySelectorAll('[data-course-tab]').forEach(b=>b.onclick=()=>{
   const id=b.dataset.courseTab;state.courseTab=id;state.toolbarTitle=b.textContent||'Course';
   document.querySelectorAll('[data-course-tab]').forEach(x=>x.classList.toggle('active',x===b));
   state.folderStack=[];state.currentFolderId=0;syncToolbar();
   const tabContent=document.getElementById('sectionProfileContent');
   if(tabContent)tabContent.innerHTML='<div class="loading courseTabLoading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
   loadCourseTab(course,id).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});
 });
 loadCourseTab(course,effectiveTab).catch(e=>{const el=document.getElementById('sectionProfileContent');if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`});
 loadCourseUpcomingPane(course).catch(e=>{const el=document.getElementById('courseUpcomingContent');if(el)el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`});
 loadCourseApps(course,document.getElementById('courseAppsSideContent')).catch(e=>{const el=document.getElementById('courseAppsSideContent');if(el)el.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`});
 installCourseLayoutWatcher();
}
function collectAssignmentAttachments(a){
  const out=[],seen=new Set();
  const add=(kind,v)=>{if(!v||typeof v!=='object')return;const id=String(v.id||v.file_id||v.fileId||v.link_id||v.linkId||v.url||v.href||v.title||'');const key=kind+':'+id;if(seen.has(key))return;seen.add(key);out.push({kind,...v});};
  const walk=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v!=='object')return;
    const files=v.files?.file||v.files?.list||v.files||v.file; if(files){for(const f of (Array.isArray(files)?files:(files.file||files.list||[files])))add('file',f)}
    const links=v.links?.link||v.links||v.link; if(links){for(const l of (Array.isArray(links)?links:(links.link||links.list||[links])))add('link',l)}
    const videos=v.videos?.video||v.videos||v.video; if(videos){for(const x of (Array.isArray(videos)?videos:(videos.video||videos.list||[videos])))add('video',x)}
    const embeds=v.embeds?.embed||v.embeds||v.embed; if(embeds){for(const x of (Array.isArray(embeds)?embeds:(embeds.embed||embeds.list||[embeds])))add('embed',x)}
    const t=String(v.type||v.attachmentType||'').toLowerCase();if(t==='file'||v.download_path||v.downloadPath||v.resolveDownloadUrl)add('file',v);if(t==='link'||v.linkURL||v.linkUrl)add('link',v);
    for(const k of ['attachment','attachments','files','links','videos','embeds','file','link','video','embed'])if(v[k]&&v[k]!==a)walk(v[k]);
  };walk(a);return out;
}
async function showAssignmentAttachmentDialog(attachments){
  const items=collectAssignmentAttachments(attachments);if(!items.length)return;
  const actions=items.slice(0,50).map(item=>({label:String(item.title||item.fileTitle||item.filename||item.fileName||item.linkTitle||item.videoTitle||'Attachment'),action:async()=>{
    try{
      if(item.kind==='file'){
        const url=item.resolveDownloadUrl||item.resolve_download_url||item.converted_download_path||item.convertedDownloadPath||item.download_path||item.downloadPath||item.url;if(!url)throw new Error('Schoology did not provide a file URL.');
        const r=await A.downloadFile({url,filename:item.filename||item.fileName||item.title||'Schoology file',mime:item.filemime||item.fileMIME||'application/octet-stream'});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err);
      }else if(item.kind==='link'||item.kind==='video'){const u=item.url||item.linkURL||item.linkUrl||item.href||item.videoURL||item.videoUrl;if(!u)throw new Error('Schoology did not provide a link URL.');await A.prepareWebSession();showEmbeddedWeb(u,item.linkTitle||item.title||item.videoTitle||'Link');}
      else if(item.kind==='embed'){const code=item.embed_code||item.embedCode||'';if(code)showEmbeddedWeb('data:text/html;charset=utf-8,'+encodeURIComponent(code),item.title||'Embedded content',{allowBrowser:false});}
    }catch(e){alert('Unable to open attachment: '+e.message)}
  }}));
  actions.push({label:'Cancel',action:null});showAppDialog('Attachments',`${items.length} attachment${items.length===1?'':'s'}`,actions);
}
async function showAssignment(sectionId,assignmentId){
  const c=document.getElementById('content'); if(!c)return;
  state.toolbarTitle='Assignment'; state.screen='app'; state.assignmentView={sectionId,assignmentId}; state.courseView='course'; state.assignmentTab='info'; state.assignmentCanSubmit=false; state.assignmentIsTeacher=false; state.assignmentSubpage=null; state.submissionMenu=false; state.assignmentAllowComments=false; state.assignmentLandscape=window.matchMedia('(min-aspect-ratio: 4/3)').matches; syncToolbar();
  c.innerHTML=`<section class="assignmentPage"><div class="assignmentLoading loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading assignment…</span></div></section>`;
  try{
    const uid=state.auth?.userId||state.auth?.user?.id;
    const [aResp,sectionResp,enrollResp]=await Promise.all([
      A.api({path:`sections/${sectionId}/assignments/${assignmentId}`,params:{richtext:1,with_attachments:'TRUE'}}),
      A.api({path:`sections/${sectionId}`,params:{}}).catch(()=>({})),
      uid?A.api({path:`sections/${sectionId}/enrollments`,params:{uid,enrollment_status:1}}).catch(()=>({})):Promise.resolve({})
    ]);
    const at=aResp.assignment||aResp;
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
      const attachmentCount=collectAssignmentAttachments(attachments).length;
      el.innerHTML=`<div class="assignmentInfoHeader"><h1>${esc(at.title||'Assignment')}</h1><div>${esc(at.due||'')}</div></div>${attachmentCount?`<button id="viewAssignmentAttachments" class="assignmentAttachmentsButton">View Attachments (${attachmentCount})</button>`:''}<div class="assignmentDescription">${html||'<span class="muted">No description.</span>'}</div>${teacherComment?`<section class="assignmentTeacherComment"><b>Teacher Comment</b><div>${teacherComment}</div></section>`:''}<div class="assignmentMeta">${at.max_points!=null?`<span>${esc(at.max_points)} points</span>`:''}</div>`;
      state.assignmentTab='info';state.assignmentSubpage=null;state.submissionMenu=false;syncToolbar();
      document.getElementById('viewAssignmentAttachments')?.addEventListener('click',()=>showAssignmentAttachmentDialog(attachments));
      hydrateMediaImages(el);
      el.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',async ev=>{const href=a.href||a.getAttribute('href')||'';if(!href||href==='#')return;ev.preventDefault();ev.stopPropagation();try{if(await routeSchoologyLink(href))return;await A.prepareWebSession();showEmbeddedWeb(href,a.textContent?.trim()||'Link')}catch(e){alert('Unable to open assignment link: '+e.message)}}));
    };
    const select=async(id)=>{
      state.assignmentTab=id; state.submissionMenu=false;
      document.querySelectorAll('.assignmentTab').forEach(x=>x.classList.toggle('active',x.dataset.assignmentTab===id));
      if(id==='info')renderInfo();
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
      return `<article class="androidCommentRow" style="padding-left:${12+Math.min(depth,8)*15}px"><div class="androidCommentAvatar">${avatar?`<img data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:'<span class="commentAvatar">'+esc(String(name).charAt(0))+'</span>'}</div><div class="androidCommentContent"><button class="commentUserName" data-comment-user="${esc(uid)}">${esc(name)}</button><div class="commentBodyHtml ${deleted?'commentDeleted':''}">${deleted?'Comment deleted':body}</div><div class="commentCreated">${esc(created)}</div>${att}<div class="androidCommentActions">${!deleted&&depth===0?`<button data-comment-reply="${esc(cid)}">Reply</button>`:''}<button data-comment-like="${esc(cid)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}</button><button disabled>♥ ${likes}</button></div></div></article>`;
    }).join('');
    c.innerHTML=`<div class="commentsAndroidList">${cards||'<div class="androidEmptyState">No comments yet.</div>'}</div>`;
    await hydrateMediaImages(c);
    document.querySelectorAll('[data-comment-like]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.commentLike;if(!id)return;const liked=btn.dataset.liked==='1';try{await A.api({path:`like/${assignmentId}/comment/${id}`,method:'POST',params:{like_action:!liked},json:true});btn.dataset.liked=liked?'0':'1';btn.textContent=liked?'Like':'Unlike'}catch(e){alert('Unable to update like: '+e.message)}});
    document.querySelectorAll('[data-comment-user]').forEach(btn=>btn.onclick=()=>{const uid=btn.dataset.commentUser;if(uid){state.profileUser={id:uid};state.toolbarTitle=btn.textContent||'Profile';openProfileById(uid,btn.textContent||'Profile')}});
    document.querySelectorAll('[data-comment-reply]').forEach(btn=>btn.onclick=()=>openAssignmentCommentComposer(sectionId,assignmentId,btn.dataset.commentReply));
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load comments.</b><br>${esc(e.message)}</div>`}
}

async function chooseSchoologyResource(onSelect,title='Attach Resource'){
  const chooseItems=async(items,prompt)=>{
    const actions=items.slice(0,50).map((r,i)=>({label:String(r.title||r.name||r.collection_title||`Resource ${i+1}`),action:()=>onSelect(r)}));
    actions.push({label:'Cancel',action:null});
    showAppDialog(title,prompt,actions);
  };
  const x=await A.api({path:'collections',params:{start:0,limit:200}});
  const collections=x?.collection||x?.collections||x?.collection_list||[];
  if(!Array.isArray(collections)||!collections.length)throw new Error('No resource collections are available.');
  const actions=collections.slice(0,50).map((col,i)=>({label:String(col.title||col.name||col.collection_title||`Collection ${i+1}`),action:async()=>{
    try{
      const cid=col.id??col.collection_id??col.collectionID;
      if(cid==null)throw new Error('This collection does not have a usable ID.');
      const rx=await A.api({path:`collections/${cid}/resources`,params:{start:0,limit:200,with_attachments:'TRUE'}});
      const resources=rx?.resource||rx?.resources||rx?.resource_list||[];
      if(!Array.isArray(resources)||!resources.length){showAppDialog(title,'This collection has no resources.',[{label:'OK'}]);return;}
      const resourceActions=resources.slice(0,100).map((r,j)=>({label:String(resourceTitle(r)||`Resource ${j+1}`),action:()=>onSelect(r)}));
      resourceActions.push({label:'Cancel',action:null});
      showAppDialog(title,'Select a resource:',resourceActions);
    }catch(e){showAppDialog('Unable to load resources',e.message||String(e));}
  }}));
  actions.push({label:'Cancel',action:null});
  showAppDialog(title,'Select a collection:',actions);
}

function openAssignmentCommentComposer(sectionId,assignmentId,parentId='0'){
  state.assignmentSubpage='commentComposer';
  const old=document.getElementById('assignmentCommentDialog');old?.remove();
  const wrap=document.createElement('div');wrap.id='assignmentCommentDialog';wrap.className='assignmentCommentDialogOverlay';
  wrap.innerHTML=`<section class="assignmentCommentDialog" role="dialog" aria-modal="true"><div class="androidCommentDialogBar"><button id="assignmentCommentCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">Comment</div><button id="assignmentCommentSend" class="androidDialogIcon" aria-label="Submit">${officialIcon('ic_action_send_icon.png','Submit')}</button></div><div class="androidCommentDialogBody"><textarea id="assignmentCommentBody" placeholder="Post a comment…" autofocus></textarea><div class="commentAttachmentActions"><button id="commentAttachFile">${officialOrAssetIcon('ic_action_ic_menu_folder.png','')}File</button><button id="commentAttachResource">${officialOrAssetIcon('ic_attach_resourcesv3.png','')}Resource</button></div><div id="commentAttachmentStatus"></div></div></section>`;
  document.body.appendChild(wrap);
  const close=()=>{state.assignmentSubpage=null;wrap.remove();syncToolbar()};
  wrap.querySelector('#assignmentCommentCancel')?.addEventListener('click',close);wrap.querySelector('#commentAttachFile')?.addEventListener('click',async()=>{try{const f=await A.pickFile?.();if(f){wrap.dataset.attachment=f.path||f.filePath||'';wrap.querySelector('#commentAttachmentStatus').textContent='File attached: '+(f.name||f.fileName||f.path||'Selected file')}}catch(e){alert('Unable to select file: '+e.message)}});wrap.querySelector('#commentAttachResource')?.addEventListener('click',async()=>{try{await chooseSchoologyResource(r=>{const id=r.template_id??r.templateID??r.resource_id??r.resourceId??r.id;if(id==null)throw new Error('This resource does not have a usable Schoology resource ID.');wrap.dataset.resourceId=id;wrap.querySelector('#commentAttachmentStatus').textContent='Resource attached: '+resourceTitle(r)},'Attach Resource')}catch(e){alert('Unable to load resources: '+e.message)}});
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
  const canComment=!!state.assignmentAllowComments,canSubmit=!!state.assignmentCanSubmit;
  menu.innerHTML=`${canComment?`<button id="assignmentNewComment"><span>New comment</span></button>`:''}${canSubmit?`<button id="assignmentNewSubmission"><span>New submission</span></button>`:''}`;
  document.body.appendChild(menu);menu.style.top=(r.bottom+6)+'px';menu.style.right=(window.innerWidth-r.right)+'px';
  document.getElementById('assignmentNewComment')?.addEventListener('click',()=>{menu.remove();openAssignmentCommentComposer(state.assignmentView.sectionId,state.assignmentView.assignmentId,'0')});
  document.getElementById('assignmentNewSubmission')?.addEventListener('click',()=>{menu.remove();showSubmissionMenu()});
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
      const revisionHtml=revs.length?revs.map(r=>{const rid=r.revision_id??r.revisionId??r.id??'';return `<article class="submissionRevisionAndroid"><div><b>Revision ${esc(rid)}</b><small>${esc(formatSchoologyDate(r.created||''))}</small></div><span class="revisionStatus ${String(r.late)==='1'?'late':''}">${String(r.draft)==='1'?'Draft':String(r.late)==='1'?'Late':'On time'}</span>${renderAttachments(r.attachments||{}, {sectionId,gradeItemId,userId:uid,revisionId:rid,submissionId:r.submission_id||r.submissionId||r.sub_id||''})}</article>`}).join(''):'<div class="androidEmptyState">You haven’t made any submissions.</div>';
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
  const dlg=showAppDialog('New submission','Choose an attachment type.',[
    {label:'File',action:()=>chooseAndSubmitAssignmentFile()},
    {label:'Resource',action:()=>chooseAndSubmitAssignmentResource()},
    {label:'Cancel',action:null}
  ]);return dlg;
}
async function chooseAndSubmitAssignmentResource(){
  const v=state.assignmentView;if(!v||!state.assignmentCanSubmit)return;
  try{
    await chooseSchoologyResource(async r=>{
      const resourceId=r.template_id??r.templateID??r.resource_id??r.resourceId??r.id;
      if(resourceId==null)throw new Error('This resource does not have a usable Schoology resource ID.');
      const dlg=showAppDialog('Submitting resource','Submitting…',[]);
      try{await A.submitAssignmentResource({sectionId:v.sectionId,assignmentId:v.assignmentId,resourceId});dlg?.classList.remove('open');await openAssignmentSubmissions(v.sectionId,v.assignmentId,state.assignmentData||{},false)}catch(e){dlg?.classList.remove('open');showAppDialog('Unable to submit resource',e.message||String(e))}
    },'Attach Resource');
  }catch(e){showAppDialog('Unable to load resources',e.message||String(e))}
}

async function chooseAndSubmitAssignmentFile(){
 const v=state.assignmentView;if(!v||!state.assignmentCanSubmit)return;
 try{
   const picked=await A.pickFile();
   if(!picked)return;
   const filePath=typeof picked==='string'?picked:picked.path;
   if(!filePath)throw new Error('The selected file could not be accessed.');
   const filename=typeof picked==='object'&&picked.name?picked.name:filePath.split(/[\\/]/).pop();
   const mime=typeof picked==='object'?picked.mime:'';
   const dlg=showAppDialog('Uploading submission','Uploading…',[ ]);
   const msg=dlg?.querySelector('.appDialogMessage');
   if(msg)msg.innerHTML='<div class="fileUploadProgressWrap"><div class="fileUploadProgressTrack"><div id="fileUploadProgressBar" class="fileUploadProgressBar" style="width:0%"></div></div><div id="fileUploadProgressText" class="fileUploadProgressText">Uploading… 0%</div></div>';
   const off=A.onFileUploadProgress?.(d=>{const bar=document.getElementById('fileUploadProgressBar'),txt=document.getElementById('fileUploadProgressText');if(bar&&d?.percent!=null)bar.style.width=Math.max(0,Math.min(100,d.percent))+'%';if(txt)txt.textContent=d?.phase?`${d.phase}${d.percent!=null?` ${d.percent}%`:''}`:`Uploading… ${d?.percent??0}%`;});
   try{await A.submitAssignmentFile({sectionId:v.sectionId,assignmentId:v.assignmentId,filePath,filename,mime});off?.();if(dlg)dlg.classList.remove('open');await openAssignmentSubmissions(v.sectionId,v.assignmentId,state.assignmentData||{},false)}catch(e){off?.();if(dlg)dlg.classList.remove('open');alert('Unable to submit file: '+e.message)}
 }catch(e){alert('Unable to prepare file submission: '+e.message)}
}
function openTextSubmissionComposer(){
 const v=state.assignmentView;if(!v)return;
 const old=document.getElementById('textSubmissionComposer');old?.remove();
 const wrap=document.createElement('div');wrap.id='textSubmissionComposer';wrap.className='submissionComposerOverlay';
 wrap.innerHTML=`<section class="submissionComposer"><header><b>Create Text Submission</b><button id="cancelTextSubmission">Cancel</button></header><textarea id="submissionText" placeholder="Enter your submission…"></textarea><label><input id="submissionDraft" type="checkbox"> Save as draft</label><button id="postTextSubmission" class="androidPrimary">Submit</button></section>`;
 document.body.appendChild(wrap);
 document.getElementById('cancelTextSubmission')?.addEventListener('click',()=>wrap.remove());
 document.getElementById('postTextSubmission')?.addEventListener('click',async()=>{const text=document.getElementById('submissionText')?.value||'';if(!text.trim()){alert('Enter a submission before posting.');return}try{const a=state.assignmentData||{};const gradeItemId=a.grade_item_id||a.gradeItemId||a.gradeitem_id||v.assignmentId;await A.submitAssignmentText({sectionId:v.sectionId,gradeItemId,text,draft:document.getElementById('submissionDraft')?.checked});wrap.remove();await openAssignmentSubmissions(v.sectionId,v.assignmentId,a,false)}catch(e){alert('Unable to submit text: '+e.message)}});
 document.getElementById('submissionText')?.focus();
}
const LOCAL_ATTACHMENT_ICONS={"attachment_document_icon.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABGCAMAAABG8BK2AAAA4VBMVEUAAAAAAACusLAAAAClqKgAAACtr6+kp6cAAAAAAAAAAAClp6cAAACnqamqrKwAAAAAAAD4+Pr39/j39/n29vbx8fLv8PHu7+7t7u7+/v7s7O39/f3r6+z8/Pzq6uv5+/vn6er5+vrn6Ong4eLz8vTKy8vl5+bn6Oju7++rra2jpaXm5+fk5uX7+/vp6uvk5eb19fbj5OXm5ubt7u/09fXi4+Ty8vOkp6fz9PTh4uP4+PmipaXf4OGtr6/e3+Do6eqrrq7p6emrrq3s7u3////n5+esrq78/Pvl5ualp6etsLBAJgwaAAAAEXRSTlMCBvcRwQHHwQQIBcEHxcMXAEuwd0QAAAGLSURBVFjD7djbTsJAEIDhFihQTopVUWlBy0ELiBUsteK2C51y6Ps/kDRcqIGNQ8JujPF/gO9ikklmVzo9StKfZhQlm43jxYIyms8pJaRSKRREMIUCIfBjs1mxmM/zZ0qlxQLA998Z+T5ArwcQRbncLnRsRlUpBWi1PM/Zk+e1WgCuOx4DjEa7EB/G854ZeR7Aem3bw+E+iA/jOE+MHCdhlsvJJIGiKJP5CvFhVqs+o8EgGTHAcmnbyaBns3JZUfgxlgXQ798z6nYBOh3XXW9y3ekUgJDPNeXDmGbAyDTb7e9rSmmpxJcJgiGzILjdtCVNE8CyVJUv02joiBqbRDC6foNK10UwYXiFKgxFMLXaA6paTQRziU4Ec4FOBDNBJ4L5nw2beUUngnlBJ4I5RyeC0bQzVJomgqlW31BVqyKYZvMOVbMpgjGMR1SGIYKp1w1U9TpvJjmvAa5RbU9Inkwcw0HFMU8mlSKEUgtV8rRPpfgxspxOnxxUOi3LvBhJkmX1oGRZkngxv+I36QMtlmnPFJsUygAAAABJRU5ErkJggg==","ic_attach_app_excel.png":"data:image/png;base64,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","ic_attach_app_pdf.png":"data:image/png;base64,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","ic_attach_app_ppt.png":"data:image/png;base64,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","ic_attach_app_word.png":"data:image/png;base64,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","ic_attach_app_zip.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAALO0lEQVR42u2b71Nc1RnHP+ece++yCwuBAAsJQSAFsRPyQ6cTk4khrb6rY+276tixOlPbsVHf9j/Q+LpOa99VnVp91/GNzjROUqfRmEgwCQkJSYDFEBN+s7Cwd+89py9298JqbGDXsGDzMHeGhXvvOffZ7/P9Ps9zzoV7ds/u2T0rnYmVnvj2O+9cAarX0+SNMdi27e/YseOVrh073r0bY1irOLceiPq+jzGm5M6RUiKlxHVdzp8//9aJEyf8/fv3v18yBxlj0kop9j38MOFwuOQOunz5MsPxOFJKFhYWrCtXr749MDCwqb29/a+lQhBCCLZu3UpZWVnJHXTjxg1c16W9vR3P8xgaGnJOnT79Zjwer2lubn6tJA4C8Dwv+F1rXfDAnucxOTUNxgRMaLQhHA5TWRm9Y3hprdHGUF5ezp7duznq+4yMjPDvTz559eq1a2Z7W9uRkjgoCDlgYnISz/MQQqyaP2ZmZjnx6Um01sH16bTPffc1sWd3F76vv+NaQX1dffDZ9zwsy+Knhw5x/PhxhuNxTnz66WsX+/vNA52drxfNdcWqiNa64MMYk3cASCEQSMSynxxaM8ftBcJxHA4dOkRrSwuLCwucPn36SO+XX/6xZAgSmG89xIqvNQLHttm6pRFtsvcR4LpptDaMjY2jjQ6galmKysrK7LjfPZZt23R3dyOl5NrgIOfOnXv15MmTZu/evUfW3EHFmDaacDjMrp1deWE3n0xy7lwf/ZcGkHIJOeXl5XTt+PHKHsiyOHjwIFJKrly9yuWBgdeOHv3YPProz15f0xAzRiBEcUculwkOITG5n+WhZ0zedXcypRQHDhygo72dVCrFyFcjRy5cuPBnY4xYWwQJQIjMscp0wU2luDU2lmF7AUJIFhcXUUpRW7uZXC5qjKYsFFoaY4Vj5ZwkpaT/0iU+P3Xq98aYEPD82jhIFKEMUpJcWKT37HlMFh0Y8H2PttYWOjs68Hz/W2Kw6ikKwf79+5FScuHiRT4/deq53i+/NK0tLb+tqqrSd5mkyZKrWLXMZ64Bk1WyHCq01iAEQgqEFnljmew53xzrTmMLIdi3bx+WbdPX10dvb+/zrut6wO/WLUkbYwiFQmxva81FGAiBm3JJuS6Dg8PobIwZY3Ach1h93W0fPuW6zMzM3NFJ93d0MDU1xejoKP39/c+sjYNEYQjSOqtiu7py+EBKxdzcHF/09HL12iBCyOy5PtFolFisPqC8nOMspRiOxxkZGVlxaFuWBbC4rmU+p2BLRLZEwBnlAiFMHuKEyec9pRS2bWMpteLuQiFdiJI4SCnFzZu3iI+MoKQKfJRKuZSXlxOL1aOzJJ0LsSyPB17aubOLzs7OlalaNl1IJpMc/fjjvHryrjpIFBhiUkoSiQTXBoewraUppNNpdu/eRVtrC+l0Ou+b930/E4wG5pNJpJQoawXTN5nk0bJUFrVriKBCHRQkid+4VgiZdYLJD4dcKpC1+eRCDk4rAI8mHC6jMhotKFUoSYj5vk9jYwPdBx8JHlxKwXwyyY3Rrzn9xRlyHtDaEImU0b79RwiZ4SgpxIrzMGPkqr/AdSHzkUiEaLQiyJillMzNJRgcijM3P4/IhoP2NZWVFdlsGwrp9haR0xYbYgVVGgE5LId8puQyiKyzgm9dikDyV1FplKbl+n1xkGVZxOMjXLo8gFJqWX3mEmuI0dbakqc0Ssmgui8oXDZaiAkhSCYXuHHjayzLDhDleR5bm7ZQU1P9LRUrpr274RAkhEAqiWXZ2LaVRxYySBbNqmquO423oRDkeR7bmrZSu3lzMHkhBcn5JIODQ3x28vNlZYmhvDxCZ2dHpl+0xmtyxSEoYOrVq1hZWRmRSCSQcykltmWTXFhkNjEXOE5rHfCREAKDKWyepUKQEGL1ExC3+yDyuFR8o0GWG0UgNg6CKKhlD8pSxOMjXLx4CWUtqdhiKkWsro7tbW14vheUCspSQVOtMAeVkIMKGVoKyfz8PF9dv45t28Hf3XSa5qYmGmP1pG5Ti21YFStoYMsiHC5bJvOZKt8YQ8p1cZc5aKk98n+iYr7vc19zMw2xWNB0s5RFYn6Oc+f6OPbJfzKxZcA3msqKKHt270TKjaZiRSDIcRxCoRBCCLTWJJNJtO8zPz+H7+tc5w9Pa1S29Ch0rGLKk5IgiGUtDaUUx/99nEuX+nEcJyPraY/yigoaGpvwfZ9QKFSqaZYOQUH95brE48P4vk9ZWQRLWUxOjZP2XPb+5CHKwmEwJuCgwsYrfI6SEpplWdwau0XaTVO9qRrHCWE7DpXRSvy0z/j4OOWRSJ7SrbXJ4hBU3CGl4KuvRnAch7q6WLbfY6ipqSUcjnB99Ho20zZFj7UhEeT7PpMTk4RCZUilstm0QCpFOBxmanKSdDpdVBiXGEGFb1xQKrMONjY+RihUhm3bGKPxvDSWZROOlDM+Mc709DRKqaI3SmxIFYtEIsRiMdKuj2XZbN5ci9GZVVfXdamvqyNaYLN9ndRixWWpjuNQVVnF1PQMxoDjhIJ7KiWRIhRIf+E5kCitg4qxXIJo2w6p1AKTE+MA2I5DVVU142OTzM7OUlVVtXFrsWJzoGQySSgUYWJqjN27dxGLxThz5gxTUxMYAzMzM1RXVxcVZsXMs2QqJmWmok+lUiwsLrBtWxO7du2ivr6eAwcOIGRGn+fn54sqVEvLQcV8M0qRSCQwCCzLCjZMCSnxfB+jNbZlMzM7m+khFsMlG1HFcg0ygGi0ktHr1/nss89oaGzkTE8PUtlYlsX01FRJ3w0pGQdpramrrcX30szOzlBZVU3fhX7One8jHA5TEa1i7OYNdu7amb+QuKaVWAk5yPd9auvq6O7uxmiPucQMIccmXBbCGE1iZpLOzvvp6uoqmYKVFEE5J7Vt307Ttm2kUqml+xmDVIpIJILv+0XlQRuKgyzLuu2DhhwHy7KQQiIEaGPQvs407JUKlqdz4aKNWdUmqNIhaIXRLaQglUrx1t/eYjYxG8j28hrrqV89Rd+FPk6cOMHjP3+czvs7efudt5nKkrTWGikV9fV1PPboY9TV1a3YSYJ1jiBBZskmMZdgZmYm2Ew5PT3N7OwstmVhjOHmzZucPXuWRw5k9g0NDAxw69YtmpubcRyHRCJBX995hoaGeOnwYSKR8rtepxW9/WVlhakmFHL4w4sv5t4zZWJigj+98QbT09Mc7O5m8+aaTLiFQkglERJsyyIcDvP8c8/R2NiI53n85c036enpYeDKFR7cswdj9N2koLVVMaUUoVAI3/f5+7vvMjIywp49e/jlk08G5PxdRW2OwyoqKjDG5O3++MGoWO78995/n97eXjo6Ovj1M88stVSDZealXpPWmg8//JCKigpmEwl6enqora2ltaVl6TWG9dzuWI1zpJR89NFHHDt2jIZYjN88+yzRaBTf9/OUanlsGGP4oqcnuEdDQwO/eOIJ6uvr1yQ/WrN+kJSSU6dO8c8PPmBTdTUvvPACjY2NQejlZbzZexqtUUrx0uHDxGKxYIe+UmpVudG67yhKKRkeHuYf770HxrCtqYnR0VGG43EwBl9rHnrwwczS822uj0Qi2a0yS2XKDy6THhoaYnJykkgkQn9/P2fPng3+l0ql2LplC0JKUqkUJuuAtOfhum7gkFzRWij3rWsHdXV18crLL2dXL75duDY1NbFp0yaamppoa20F4OmnnybtulRXV38vpc26Jumamhpqamr+5zkVFRU0NDQEnx/o7KTUJgvhk41qa/KuxuLi4speIlmHtri4ePccJISwfd/nX0ePIjYogky2xSKEsO8Ggm4B6UK+hXUYZlPcs3t2z9aD/Rc0C+984vgO4gAAAABJRU5ErkJggg==","ic_attach_audio.png":"data:image/png;base64,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","ic_attach_image.png":"data:image/png;base64,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","ic_attach_text.png":"data:image/png;base64,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","ic_action_download.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD8AAAA/CAQAAAD9VthUAAABnklEQVRYw+2YP2vCQBiHEwtCQFwEXXR1Egr2C4hdHP0IdivS0UU/gNDNjq5209HF2c1FP4CLDkJBkFrIkmqfDtWYU5OWaJKK95sO3j/P3fG+d8cpipSUlJTUJYgQj7zyxE0w+Gd+9BIM/m2Dfw8G/8lWrrc/FGz9nIJXg8Ur/wXPVa9elp4sPVl6V7f5qiw9Wfly8yVe4n3D4xGeKHlSJ8wrRZ6o2+Asc8CgZmPf6svGXsMA5mTd4XsmoEX4wKo64QnTMu09d/ghO/WJ/R1PjL4ldugOX8WqMWkb/HovLs1YiKy6/b1oCmkW5H7Hk2MhRDVx311UWFtSGTw44ylhWPzXVE5t6iK6sJo66nE8KnXBU6d4jlPljpmQtoOmKIREPBodwWvmsuGOTCDJSEg9ICHiSTAQPEYkz/mPE6ErpJ9ya45XZJgK1i6Rc38khWgIiI9d31vGAA28ucgos8JZK8oeXpAUWDrAlxQ8vqHJMLGBT8j48EQ4qHKzG3x6o6DR3oO30Xx8JO2dcJuT0FdRQgd0SgE9FIlzT1yRukx9Ax0Ep3nLYXR9AAAAAElFTkSuQmCC"};
function localAttachmentIcon(name){return LOCAL_ATTACHMENT_ICONS[name]||''}
function renderAttachments(a,submissionContext=null){
  if(!a)return '';
  const out=[];
  const addFile=(f)=>{
    const url=f?.resolveDownloadUrl||f?.resolve_download_url||f?.converted_download_path||f?.convertedDownloadPath||f?.download_path||f?.downloadPath||f?.fileDownloadURL||f?.download_url||f?.downloadUrl||f?.url;
    if(!url)return;
    const title=(f.title||f.fileTitle||f.filename||f.fileName||'File').trim();
    const mime=f.filemime||f.fileMIME||f.converted_filemime||f.convertedFileMime||'application/octet-stream';
    const ctx=submissionContext&&f?.id?` data-submission-file-id="${esc(f.id)}" data-submission-revision-id="${esc(submissionContext.revisionId||'')}" data-submission-submission-id="${esc(submissionContext.submissionId||'')}" data-submission-section-id="${esc(submissionContext.sectionId||'')}" data-submission-grade-item-id="${esc(submissionContext.gradeItemId||'')}" data-submission-user-id="${esc(submissionContext.userId||'')}"`:'';
    out.push(`<button class="activityAttachment fileAttachment" data-download-url="${esc(url)}" data-download-name="${esc(title)}" data-download-mime="${esc(mime)}"${ctx}><span class="attachmentFileIcon"><img src="${localAttachmentIcon(mimeIconForFilename(title,mime))}" alt=""></span><span class="attachmentFileText"><b>${esc(title)}</b><small>${esc((mime||'File').split('/').pop().toUpperCase())}</small></span><span class="attachmentDownloadIcon"><img src="${localAttachmentIcon('ic_action_download.png')}" alt=""></span></button>`);
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
  root.querySelectorAll?.('[data-open-url]')?.forEach(b=>{if(b.dataset.boundOpen)return;b.dataset.boundOpen='1';b.onclick=()=>openWithPressTransition(b,()=>showEmbeddedWeb(b.dataset.openUrl,'Attachment'))});
  root.querySelectorAll?.('[data-download-url]')?.forEach(b=>{if(b.dataset.boundDownload)return;b.dataset.boundDownload='1';b.onclick=async()=>{try{let info={url:b.dataset.downloadUrl,filename:b.dataset.downloadName,mime:b.dataset.downloadMime};if(b.dataset.submissionFileId&&b.dataset.submissionRevisionId&&b.dataset.submissionSectionId&&b.dataset.submissionGradeItemId&&b.dataset.submissionUserId){const rr=await A.api({path:`sections/${b.dataset.submissionSectionId}/submissions/${b.dataset.submissionSubmissionId||b.dataset.submissionGradeItemId}/${b.dataset.submissionUserId}/revision/${b.dataset.submissionRevisionId}`,params:{with_annotations:'TRUE',with_attachments:'TRUE'}});const revisions=rr?.revision||rr?.revisions||rr?.data?.revision||rr?.data?.revisions||[];const list=Array.isArray(revisions)?revisions:[revisions];let exact=null;for(const rv of list){const files=rv?.attachments?.files?.file||rv?.attachments?.files||rv?.attachments?.file||[];const fs=Array.isArray(files)?files:(files?[files]:[]);const hit=fs.find(f=>String(f?.id??f?.fid??'')===String(b.dataset.submissionFileId));if(hit){exact=hit;break;}}if(exact){const convertedOk=['success','converted','1'].includes(String(exact.converted_status??exact.convertedStatus??'').toLowerCase());const rawUrl=exact.download_path||exact.downloadPath||'';const convertedUrl=exact.converted_download_path||exact.convertedDownloadPath||'';info.url=convertedOk&&convertedUrl?convertedUrl:(rawUrl||convertedUrl);info.filename=(convertedOk&&exact.convertedFilename)||exact.filename||exact.title||info.filename;info.mime=(convertedOk&&exact.convertedFileMime)||exact.filemime||info.mime;}}const r=await downloadWithFeedback(b,info);const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)}catch(e){alert('Unable to open file: '+e.message)}}});
}
function materialIconForType(item){
 const type=String(item?.type||item?.template_type||'').toLowerCase();
 const docType=String(item?.document_type||item?.documentType||item?.template_document_type||item?.templateDocumentType||'').toLowerCase();
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
  if(push && Number(folderId||0)!==0){
    state.folderStack.push({id:state.currentFolderId||0,title:'Previous folder'});
  }
  state.currentFolderId=folderId||0;
  state.courseTab='materials';
  syncToolbar();
  const previousTitle=title||'Materials';
  el.innerHTML=`${folderId?'<button class="materialBackRow" id="materialBack"><span class="materialIcon">‹</span><span><b>Back to previous folder</b></span></button>':''}<div class="folderLoadingState"><img src="../assets/android_loading_spinner_72.gif" alt=""><b>Loading ${esc(previousTitle)}…</b><small>Schoology is loading this folder.</small></div>`;
  el.querySelector('#materialBack')?.addEventListener('click',()=>navigateBack());
  try{ const x=await A.api({path:`courses/${sid}/folder/${folderId||0}`,params:{}});
  const items=x['folder-item']||x.folder_item||x.folderItems||x.items||[];
  const parent=folderId?'<button class="materialBackRow" id="materialBack"><span class="materialIcon">‹</span><span><b>Back to previous folder</b></span></button>':'';
  const rows=items.map((f,i)=>{
    const type=String(f.type||'');
    const icon=materialIconForType(f);
    return `<button class="materialRow" data-material-index="${i}"><span class="materialIcon officialMaterialIcon"><img src="../assets/icons/${icon}" alt=""></span><span><b>${esc(f.title||'Untitled')}</b></span><span>›</span></button>`;
  }).join('');
  el.innerHTML=parent+(items.length?`<div class="materialList">${rows}</div>`:'<div class="empty"><h2>This folder is empty</h2></div>');
  window.__schoologyFolderItems=items;
  document.getElementById('materialBack')?.addEventListener('click',()=>navigateBack());
  document.querySelectorAll('[data-material-index]').forEach(b=>b.onclick=async()=>{
    const f=window.__schoologyFolderItems[+b.dataset.materialIndex];
    if(String(f.type)==='folder'){loadFolder(course,f.id,true,f.title||'Folder').catch(e=>showSchoologyRequestError(e,()=>loadFolder(course,f.id,false,f.title||'Folder')));return}
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
      const rawName=data.filename||data.fileName||data.title||f.title||'Schoology file'; const mime=data.filemime||data.fileMIME||data.converted_filemime||data.convertedFileMime||f.filemime||f.fileMIME||'application/octet-stream'; const ext=data.file_extension||data.fileExtension||data.extension||data.converted_extension||data.convertedExtension||f.file_extension||f.fileExtension||f.extension||f.converted_extension||f.convertedExtension||extensionFromUrl(fileUrl)||extensionFromMime(mime); const filename=/\.[A-Za-z0-9]{1,8}$/.test(rawName)?rawName:(ext?rawName+'.'+String(ext).replace(/^\./,''):rawName); const r=await downloadWithFeedback(b,{url:fileUrl,filename,mime});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)
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
 try{const u=new URL(rawUrl);const host=u.hostname.toLowerCase();return u.protocol.toLowerCase()==='schoology:'||host==='lms.lausd.net'||host.endsWith('.schoology.com')}catch{return false}
}
async function routeSchoologyLink(rawUrl){
 let u;try{u=new URL(rawUrl)}catch{return false}
 const scheme=u.protocol.toLowerCase()==='schoology:';
 let host=u.hostname.toLowerCase(), path=u.pathname.replace(/\/+$/,'');
 // URL parses schoology://course/123 as hostname=course, pathname=/123.
 if(scheme)path=`/${host}${path}`;
 const webHost=u.hostname.toLowerCase();
 const isSchoolHost=webHost==='lms.lausd.net'||webHost.endsWith('.schoology.com');
 if(!scheme&&!isSchoolHost)return false;
 const mCourse=path.match(/^\/course(?:s)?\/(\d+)(?:\/materials(?:\/gp\/(\d+))?)?$/i);
 const mSection=path.match(/^\/section(?:s)?\/(\d+)$/i);
 const mAssignment=path.match(/^\/(?:assignment|assignments)\/(\d+)(?:\/info)?$/i);
 const mCourseAssignment=path.match(/^\/course(?:s)?\/(\d+)\/(?:assignment|assignments)\/(\d+)(?:\/info)?$/i);
 if(/^\/home$/i.test(path)){state.homeUpcomingReturn=false;state.tab='home';state.courseView=null;state.currentGroup=null;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle='Home';render();loadTab();return true}
 const mResources=path.match(/^\/resources(?:\/.*)?$/i);if(mResources){state.homeUpcomingReturn=false;state.courseView=null;state.currentGroup=null;state.assignmentView=null;state.embeddedTitle=null;state.tab='resources';state.toolbarTitle='Resources';render();loadTab();return true}
 const mGroup=path.match(/^\/groups?\/(\d+)(?:\/.*)?$/i);if(mGroup){const gid=Number(mGroup[1]);let group={id:gid,name:'Group'};try{const gx=await A.api({path:`groups/${gid}`,params:{}});group=gx?.group||gx||group;}catch{}state.tab='groups';state.currentGroup=group;state.toolbarTitle=group.name||group.title||'Group';render();await showGroup(group,'updates');return true}
 if(mCourse||mSection){const sid=Number((mCourse||mSection)[1]);const gp=(mCourse&&mCourse[2])?Number(mCourse[2]):0;try{const x=await A.api({path:`sections/${sid}`,params:{}});const course=x?.section||x;state.embeddedTitle=null;await showCourse(course,'materials');if(gp)await loadFolder(course,gp,true,'Folder');return true}catch(e){showSchoologyRequestError(e);return true}}
 if(mCourseAssignment){const sid=Number(mCourseAssignment[1]),aid=Number(mCourseAssignment[2]);showAssignment(sid,aid);return true}
 if(mAssignment){const aid=Number(mAssignment[1]);const sid=await resolveAssignmentSection(aid);if(sid){showAssignment(sid,aid);return true}await A.prepareWebSession();showEmbeddedWeb(rawUrl,'Assignment');return true}
 const mQuiz=path.match(/^\/(?:quiz|quizzes|assessment|assessments|assessment_v2|managed_assessment)(?:\/view)?\/(\d+)$/i);if(mQuiz){await A.prepareWebSession();showEmbeddedWeb(scheme?`https://app.schoology.com/${path.replace(/^\//,'')}`:rawUrl,'Quiz',{allowBrowser:false});return true}
 const mMaterials=path.match(/^\/(?:course|section)\/(?:s)?(\d+)\/materials(?:\/(?:folder|gp)\/(\d+))?$/i);if(mMaterials){try{const x=await A.api({path:`sections/${Number(mMaterials[1])}`,params:{}});const course=x?.section||x;showCourse(course,'materials');if(mMaterials[2])await loadFolder(course,Number(mMaterials[2]),true,'Folder');return true}catch(e){showSchoologyRequestError(e);return true}}
 const mDocument=path.match(/^\/(?:course|section)\/(?:s)?(\d+)\/documents\/(\d+)$/i);if(mDocument){try{const x=await A.api({path:`sections/${Number(mDocument[1])}/documents/${Number(mDocument[2])}`,params:{}});const d=x?.document||x;const type=String(d?.type||d?.document_type||'').toLowerCase();const url=d?.web_url||d?.webUrl||d?.url||d?.link_url||d?.linkURL;if(url||['link','web_content','external_tool','embed','video'].includes(type)){await A.prepareWebSession();showEmbeddedWeb(url||rawUrl,d?.title||'Resource');return true}showCourse(x?.section||{id:Number(mDocument[1])},'materials');return true}catch(e){showSchoologyRequestError(e);return true}}
 return false;
}
async function showPageNative(realm,realmId,pageId,title='Page'){
 const c=document.getElementById('content');if(!c)return;state.assignmentView=null;state.embeddedTitle=null;state.embeddedTheme='';state.embeddedCanOpenExternal=false;state.toolbarTitle=title||'Page';syncToolbar();
 c.innerHTML='<section class="pageAndroid"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading page…</span></div></section>';
 try{const x=await A.api({path:`${realm}/${realmId}/pages/${pageId}`,params:{}});const page=x?.page||x;const body=page?.body||page?.description||page?.content||'';const pageTitle=page?.title||title||'Page';c.innerHTML=`<section class="pageAndroid"><div class="pageAndroidHeader"><h1>${esc(pageTitle)}</h1></div><div class="pageAndroidBody">${body||'<span class="muted">No page content.</span>'}</div></section>`;c.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',async ev=>{const href=a.href||a.getAttribute('href')||'';if(/^https?:\/\//i.test(href)){ev.preventDefault();await showEmbeddedWeb(href,a.textContent?.trim()||'Link')}}));}catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`;}
}
async function showEmbeddedWeb(url,title,options={}){
 const c=document.getElementById('content');if(!c)return;try{await A.prepareWebSession()}catch(e){console.warn('Schoology web session preparation failed:',e)}
 c.classList.remove('webContentHost');c.classList.add('embeddedContentActive');state.toolbarTitle=title||'Schoology';state.embeddedTitle=title||'Schoology';state.embeddedCanOpenExternal=options.allowBrowser!==false;state.embeddedTheme=options.accountInfo?'account':(options.lti?'lti':(options.quiz?'quiz':''));syncToolbar();
 c.innerHTML=`<section class="embeddedPage"><div id="embeddedWebviewLoading" class="webviewLoading"><img src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div><webview id="schoologyWebview" src="${esc(String(url||''))}" allowpopups></webview></section>`;
 const w=document.getElementById('schoologyWebview');if(!w)return;const spinner=document.getElementById('embeddedWebviewLoading');const setLoading=v=>spinner?.classList.toggle('hidden',!v);let mainNavigation=0;let loadingStartedAt=0;setLoading(true);
 w.addEventListener('did-start-navigation',e=>{if(!e.isMainFrame)return;mainNavigation++;loadingStartedAt=Date.now();setLoading(true);});
 w.addEventListener('dom-ready',()=>{if(mainNavigation>0)setLoading(false)});
 w.addEventListener('did-finish-load',()=>{if(mainNavigation>0)setLoading(false)});
 w.addEventListener('did-navigate',e=>{if(e.isMainFrame){loadingStartedAt=Date.now();setTimeout(()=>{if(spinner&&!spinner.classList.contains('hidden'))setLoading(false)},1200);}});
 w.addEventListener('did-fail-load',e=>{if(e.isMainFrame){setLoading(false);if(e.errorCode&&e.errorCode!==-3)console.warn('Schoology embedded page failed:',e.errorDescription)}});
 setTimeout(()=>{if(spinner&&!spinner.classList.contains('hidden')&&mainNavigation>0)setLoading(false)},8000);
 w.addEventListener('new-window',async e=>{e.preventDefault();if(await routeSchoologyLink(e.url))return;try{w.src=e.url}catch{}});
 w.addEventListener('will-navigate',e=>{const u=String(e.url||'');if(isSchoologyRoutableLink(u)){e.preventDefault();Promise.resolve(routeSchoologyLink(u)).catch(err=>console.warn('Schoology deep link failed:',err));}});
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
    if(!href&&!Number.isFinite(appId)){el.innerHTML='<div class="error apiError">This course app did not provide a launch target.</div>';return}
    try{
      openWithPressTransition(b,()=>{}); await A.prepareWebSession();
      const launchResult=Number.isFinite(appId)?await A.launchCourseApp({appId}):await A.launchCourseApp({launchUrl:href});
      const url=launchResult?.url||launchResult?.launchTokenUrl||launchResult?.data?.url||launchResult?.data?.launchTokenUrl||launchResult?.launch_url||launchResult?.launchUrl||href;
      if(!url)throw new Error('Schoology did not return a course-app launch URL.');
      openWithPressTransition(b,()=>showEmbeddedWeb(url,a.title||'Course App'));
    }catch(e){el.innerHTML=`<div class="error apiError"><b>Schoology could not launch this course app.</b><br>${esc(e.message)}</div>`}
  });
  await hydrateCourseImages(el);
}
async function loadCourseUpcomingPane(course){
 const el=document.getElementById('courseUpcomingContent');if(!el)return;
 const sid=course.id||course.section_id||course.sectionId;if(!sid)return;
 const x=await A.api({path:`sections/${sid}/events`,params:{start_date:formatApiDate(new Date()),limit:20}});
 let arr=x.event||x.events||[];
 arr=arr.filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));
 el.innerHTML=renderUpcoming(arr);
 document.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=async()=>{const e=arr.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const type=String(e.type||'').toLowerCase();const aid=e.assignment_id??e.assignmentId??e.assignment?.id;const esid=e.section_id??e.sectionId??sid;if(type==='assignment'&&aid){openWithPressTransition(b,()=>showAssignment(esid,aid));return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id){openWithPressTransition(b,async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})});return}}if(e.web_url||e.webUrl)openWithPressTransition(b,()=>showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming'));else if(type==='discussion'&&e.id)openWithPressTransition(b,()=>showDiscussionNative('sections',esid,e.id,e.title||'Discussion'));});
}
let courseLayoutMediaQuery=null;
let lastWindowLayout='';
let resizeRefreshTimer=null;
let courseRenderToken=0;
function currentWindowLayout(){return window.matchMedia('(min-aspect-ratio: 4/3)').matches?'landscape':'portrait'}
function installCourseLayoutWatcher(){
  const mq=window.matchMedia('(min-aspect-ratio: 4/3)');
  const handler=()=>{
    const layout=currentWindowLayout();
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
  lastWindowLayout=currentWindowLayout();
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
       <div class="activityActions"><button data-course-update-comments="${esc(id)}">Comment${comments?` (${comments})`:''}</button><button data-course-update-like="${esc(id)}" data-liked="${liked?'1':'0'}">${liked?'Unlike':'Like'}${likes?` (${likes})`:''}</button></div>
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
   arr=arr.filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));
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
 if(!arr.length)return '<div class="empty"><h2>Nothing upcoming</h2><p>Your upcoming assignments will appear here.</p></div>';
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
     const icon=type==='assignment'?'ic_assignment.png':type==='assessment'?'ic_test_quiz.png':['assessment_v2','managed_assessment','quiz'].includes(type)?'ic_assessment_48dp.png':type==='discussion'?'ic_discussion.png':type==='external_tool'?'ic_external_tool.png':'ic_date_range_24px.png';
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
function renderOverallGrade(sec){
 const final=(sec.final_grade||sec.finalGrade||[])[0]||{};
 const val=final.grade||final.grade_override||final.calculated_grade||'—';
 const comment=typeof final.comment==='string'?final.comment:(final.comment?.comment||final.comment?.body||'');
 return `<div class="gradeOverallCard"><div class="label">Overall Grade</div><div class="value">${esc(val)}</div>${comment?`<div class="gradeOverallTeacherComment"><b>Teacher Comment</b><div>${comment}</div></div>`:''}</div>`;
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

async function showDiscussionNative(realm,realmId,discussionId,title='Discussion'){
  const c=document.getElementById('content');if(!c)return;
  state.assignmentView=null;state.embeddedTitle=null;state.embeddedTheme='';state.embeddedCanOpenExternal=false;state.toolbarTitle=title||'Discussion';syncToolbar();
  c.innerHTML='<section class="discussionNativePage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading discussion…</span></div></section>';
  try{
    const x=await A.api({path:`${realm}/${realmId}/discussions/${discussionId}`,params:{with_attachments:'TRUE',richtext:1}});
    const d=x?.discussion||x?.data?.discussion||x;
    const body=d?.body||d?.description||d?.message||'';
    const due=d?.due||d?.due_date||d?.dueDate||'';
    const attachments=renderAttachments(d?.attachments||d?.attachment||{});
    c.innerHTML=`<section class="discussionNativePage"><div class="discussionNativeTitle">${esc(d?.title||title||'Discussion')}</div>${due?`<div class="discussionNativeDue">${esc(due)}</div>`:''}<div class="discussionNativeRule"></div><div class="discussionNativeBody">${body||'<span class="muted">No discussion content.</span>'}</div>${attachments}</section>`;
    c.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',async ev=>{const href=a.href||a.getAttribute('href')||'';if(!href||href==='#')return;ev.preventDefault();if(await routeSchoologyLink(href))return;await A.prepareWebSession();showEmbeddedWeb(href,a.textContent?.trim()||'Link')}));
    await hydrateMediaImages(c);
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this discussion.</b><br>${esc(e.message)}</div>`}
}

async function showGroupAlbumNative(gid,albumId,title='Album'){
  const c=document.getElementById('content');if(!c)return;
  state.embeddedTitle=null;state.embeddedTheme='';state.toolbarTitle=title||'Album';syncToolbar();
  c.innerHTML='<section class="albumNativePage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading album…</span></div></section>';
  try{
    const x=await A.api({path:`groups/${gid}/albums/${albumId}`,params:{with_content:'TRUE'}});
    const album=x?.album||x?.data?.album||x;const content=album?.content||album?.contents||album?.media||[];const arr=Array.isArray(content)?content:(content?.content||[]);
    c.innerHTML=`<section class="albumNativePage"><div class="albumNativeTitle">${esc(album?.title||title||'Album')}</div><div class="albumNativeGrid">${arr.map((m,i)=>{const src=normalizeImageUrl(m?.thumbnail_url||m?.thumbnailUrl||m?.photo_url||m?.photoUrl||m?.image_url||m?.imageUrl||m?.url||'');return `<button class="albumNativeItem" data-album-item="${i}">${src?`<img data-media-image-url="${esc(src)}" alt="">`:`<img src="../assets/icons/ic_albums.png" alt="">`}<span>${esc(m?.caption||m?.title||'')}</span></button>`}).join('')||'<div class="empty">No media in this album.</div>'}</div></section>`;
    window.__groupAlbumContent=arr;await hydrateMediaImages(c);
    c.querySelectorAll('[data-album-item]').forEach(b=>b.onclick=()=>{const m=window.__groupAlbumContent[+b.dataset.albumItem];const u=m?.url||m?.photo_url||m?.photoUrl||m?.original_url||m?.originalUrl;if(u)showEmbeddedWeb(u,m?.title||m?.caption||'Album')});
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this album.</b><br>${esc(e.message)}</div>`}
}

async function showGroup(group,activeTab='updates'){
  if(!group)return;
  state.currentGroup=group;state.groupTab=activeTab;state.courseView=null;state.selectedCourse=null;state.assignmentView=null;state.embeddedTitle=null;state.profileUser=null;state.message=null;state.composeMessage=false;state.toolbarTitle=group.name||group.title||'Group';syncToolbar();
  const c=document.getElementById('content');if(!c)return;
  const gid=group.id||group.group_id;
  c.innerHTML=`<section class="groupProfilePage"><div class="groupLandscapeSplit"><section class="groupMainPane"><div class="groupTabs">${['updates','upcoming','discussions','albums','resources'].map((id)=>`<button class="groupTab ${activeTab===id?'active':''} ${id==='upcoming'?'groupUpcomingTab':''}" data-group-tab="${id}">${({updates:'Updates',upcoming:'Upcoming',discussions:'Discussions',albums:'Albums',resources:'Resources'})[id]}</button>`).join('')}</div><div class="groupHeader"><div class="groupHero">${group.picture_url||group.pictureUrl?`<img src="${esc(normalizeImageUrl(group.picture_url||group.pictureUrl))}" alt="">`:`<span>${esc(String(group.name||group.title||'G').charAt(0))}</span>`}</div><div><h1>${esc(group.name||group.title||'Group')}</h1><p>${esc(group.school_name||'')}</p></div></div><div id="groupTabContent"></div></section><aside id="groupUpcomingPane" class="groupUpcomingPane"><div class="homePaneHeader">Upcoming</div><div id="groupUpcomingContent"></div></aside></div></section>`;
  const gc=document.getElementById('groupTabContent');
  const loadGroupUpcoming=async()=>{const up=document.getElementById('groupUpcomingContent');if(!up)return;try{const x=await A.api({path:`groups/${gid}/events`,params:{start:formatApiDate(new Date()),limit:20}});const a=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));up.innerHTML=renderUpcoming(a);up.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=()=>{const e=a.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const aid=e.assignment_id??e.assignmentId??e.assignment?.id;if(String(e.type||'').toLowerCase()==='assignment'&&aid){openWithPressTransition(b,()=>showAssignment(gid,aid));}else if(['assessment','assessment_v2','managed_assessment','quiz'].includes(String(e.type||'').toLowerCase())){const id=aid??e.id;openWithPressTransition(b,async()=>{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})})}})}catch(e){up.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}};
  const load=async(tab)=>{
    state.groupTab=tab;document.querySelectorAll('[data-group-tab]').forEach(b=>b.classList.toggle('active',b.dataset.groupTab===tab));
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
          return `<article class="androidActivityCard groupFullUpdate"><div class="activityHeader">${avatar?`<img class="activityAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="activityAvatar">${esc(String(name).charAt(0))}</span>`}<button class="activityUser activityAuthorLink" data-author-id="${esc(u.id||x.user_id||x.uid||x.author_id||x.authorId||'')}">${esc(name)}</button></div><div class="activityBody">${u.body||u.message||''}</div>${renderAttachments(u.attachments||u.attachment||u.files||{})}<div class="activityMeta">${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</div><div class="activityActions"><button>Comment${u.num_comments?` (${esc(u.num_comments)})`:''}</button><button>${u.liked?'Unlike':'Like'}${u.likes?` (${esc(u.likes)})`:''}</button></div></article>`;
        }).join(''):'<div class="empty">No updates.</div>';
        await hydrateMediaImages(gc);document.querySelectorAll('[data-author-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.authorId;if(id)openProfileById(id,b.textContent||'Profile')});
      }
      else if(tab==='upcoming'){const x=await A.api({path:`groups/${gid}/events`,params:{start:formatApiDate(new Date()),limit:20}});const a=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));gc.innerHTML=renderUpcoming(a);}
      else if(tab==='discussions'){const x=await A.api({path:`groups/${gid}/discussions`,params:{limit:50}});const a=x.discussion||x.discussions||[];gc.innerHTML=a.length?a.map(d=>{const creator=d.creater_id??d.creator_id??d.created_by??d.user_id??d.uid??d.author_id??'';return `<button class="groupDiscussionRow" data-group-discussion-id="${esc(d.id||d.discussion_id||'')}"><img src="../assets/icons/ic_discussion.png" alt=""><span><b>${esc(d.title||'Discussion')}</b><small>Created by ${esc(creator)}</small></span></button>`}).join(''):'<div class="empty">No discussions.</div>';gc.querySelectorAll('[data-group-discussion-id]').forEach(b=>b.onclick=async()=>{const d=a.find(v=>String(v.id||v.discussion_id||'')===String(b.dataset.groupDiscussionId));if(!d)return;try{await showDiscussionNative('groups',gid,d.id||d.discussion_id,d.title||'Discussion')}catch(e){alert('Unable to open discussion: '+e.message)}});}
      else if(tab==='albums'){const x=await A.api({path:`groups/${gid}/albums`,params:{limit:50}});const a=x.album||x.albums||[];gc.innerHTML=a.length?a.map((d,i)=>`<button class="albumListRow" data-group-album-index="${i}"><img src="../assets/icons/ic_albums.png" alt=""><span><b>${esc(d.title||d.name||'Album')}</b><small>${esc([d.photo_count||d.photoCount,d.audio_count||d.audioCount,d.video_count||d.videoCount].filter(Boolean).join(', '))}</small></span><span>›</span></button>`).join(''):'<div class="empty">No albums.</div>';window.__groupAlbums=a;gc.querySelectorAll('[data-group-album-index]').forEach(b=>b.onclick=()=>{const d=window.__groupAlbums[+b.dataset.groupAlbumIndex];showGroupAlbumNative(gid,d.id||d.album_id,d.title||d.name||'Album')});}
      else {const x=await A.api({path:`groups/${gid}/resources`,params:{limit:50}});const a=x.resource||x.resources||x.collection||x.items||[];gc.innerHTML=a.length?a.map((d,i)=>`<button class="groupRow groupResourceRow" data-group-resource-index="${i}"><span class="officialMaterialIcon"><img src="../assets/icons/${materialIconForType(d)}" alt=""></span><span><b>${esc(d.title||d.name||'Resource')}</b></span><span>›</span></button>`).join(''):'<div class="empty">No resources.</div>';window.__groupResources=a;gc.querySelectorAll('[data-group-resource-index]').forEach(b=>b.onclick=async()=>{const d=window.__groupResources[+b.dataset.groupResourceIndex];try{const t=String(d.type||'').toLowerCase(),dt=String(d.document_type||d.documentType||'').toLowerCase();if(t==='folder'){await showGroupResourceFolder(gid,d.id,d.title||'Folder');return}if(t==='assignment'){const u=d.web_url||d.webUrl||d.url||d.href||`https://app.schoology.com/assignment/${d.id}`;await A.prepareWebSession();showEmbeddedWeb(u,d.title||d.name||'Assignment');return}if(['link','web_content','external_tool','embed','video'].includes(t)||['link','external_tool','embed','video'].includes(dt)){const u=d.web_url||d.webUrl||d.url||d.href||d.launch_url||d.launchUrl||d.location;if(u){await A.prepareWebSession();showEmbeddedWeb(u,d.title||d.name||'Link');return}}let u=d.download_path||d.downloadPath||d.converted_download_path||d.convertedDownloadPath||d.file_url||d.fileUrl||d.download_url||d.downloadUrl||d.location||d.url;if(!u){const aa=d.attachments||d.attachment||{};const ff=aa.files?.file||aa.files||aa.file||[];const f=Array.isArray(ff)?ff[0]:ff;u=f?.converted_download_path||f?.convertedDownloadPath||f?.download_path||f?.downloadPath||f?.url||''}if(!u){const rid=d.resource_id||d.resourceId||d.template_id||d.templateID||d.id;const cu=d.collection_id||d.collectionId||d.collectionID;if(cu&&rid){const rx=await A.api({path:`collections/${cu}/resources/${rid}`,params:{}}).catch(()=>null);u=rx?.resource?.url||rx?.resource?.web_url||rx?.resource?.download_path||rx?.url||rx?.web_url||rx?.download_path||''}}if(!u){const rid=d.resource_id||d.resourceId||d.template_id||d.templateID||d.id;const cu=d.collection_id||d.collectionId||d.collectionID;if(cu){const rx=await A.api({path:`collections/${cu}/resources`,params:{start:0,limit:200,with_attachments:'TRUE'}}).catch(()=>null);const rs=rx?.resource||rx?.resources||[];const hit=rs.find(q=>String(q?.id||q?.resource_id||q?.template_id||'')===String(rid));if(hit){u=hit?.download_path||hit?.downloadPath||hit?.converted_download_path||hit?.convertedDownloadPath||hit?.url||hit?.web_url||hit?.webUrl||'';Object.assign(d,hit)}}}if(!u)throw new Error('Schoology did not provide a resource URL.');const r=await downloadWithFeedback(b,{url:u,filename:d.filename||d.fileName||d.title||d.name||'Schoology file',mime:d.filemime||d.fileMIME||'application/octet-stream'});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)}catch(e){alert('Unable to open resource: '+e.message)}}); }
    }catch(e){gc.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
  };
  document.querySelectorAll('[data-group-tab]').forEach(b=>b.onclick=()=>load(b.dataset.groupTab));
  await load(activeTab);
}
async function showGroupResourceFolder(gid,folderId,title){
  const gc=document.getElementById('groupTabContent');if(!gc)return;
  gc.innerHTML='<div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading…</span></div>';
  try{const x=await A.api({path:`groups/${gid}/resources/folder/${folderId}`,params:{limit:50}});const a=x.resource||x.resources||x.collection||x.items||[];gc.innerHTML=(a.length?a.map((d,i)=>`<button class="groupRow" data-group-folder-resource="${i}"><span class="officialMaterialIcon"><img src="../assets/icons/${materialIconForType(d)}" alt=""></span><span><b>${esc(d.title||d.name||'Resource')}</b></span><span>›</span></button>`).join(''):'<div class="empty">No resources.</div>');window.__groupFolderResources=a;gc.querySelectorAll('[data-group-folder-resource]').forEach(b=>b.onclick=async()=>{const d=window.__groupFolderResources[+b.dataset.groupFolderResource];try{const t=String(d.type||'').toLowerCase(),dt=String(d.document_type||d.documentType||'').toLowerCase();if(t==='folder'){await showGroupResourceFolder(gid,d.id,d.title||'Folder');return}if(t==='assignment'){const u=d.web_url||d.webUrl||d.url||d.href||`https://app.schoology.com/assignment/${d.id}`;await A.prepareWebSession();showEmbeddedWeb(u,d.title||d.name||'Assignment');return}if(['link','web_content','external_tool','embed','video'].includes(t)||['link','external_tool','embed','video'].includes(dt)){const u=d.web_url||d.webUrl||d.url||d.href||d.launch_url||d.launchUrl||d.location;if(u){await A.prepareWebSession();showEmbeddedWeb(u,d.title||d.name||'Link');return}}let u=d.download_path||d.downloadPath||d.converted_download_path||d.convertedDownloadPath||d.file_url||d.fileUrl||d.download_url||d.downloadUrl||d.location||d.url;if(!u){const aa=d.attachments||d.attachment||{};const ff=aa.files?.file||aa.files||aa.file||[];const f=Array.isArray(ff)?ff[0]:ff;u=f?.converted_download_path||f?.convertedDownloadPath||f?.download_path||f?.downloadPath||f?.url||''}if(!u){const rid=d.resource_id||d.resourceId||d.template_id||d.templateID||d.id;const cu=d.collection_id||d.collectionId||d.collectionID;if(cu&&rid){const rx=await A.api({path:`collections/${cu}/resources/${rid}`,params:{}}).catch(()=>null);u=rx?.resource?.url||rx?.resource?.web_url||rx?.resource?.download_path||rx?.url||rx?.web_url||rx?.download_path||''}}if(!u){const rid=d.resource_id||d.resourceId||d.template_id||d.templateID||d.id;const cu=d.collection_id||d.collectionId||d.collectionID;if(cu){const rx=await A.api({path:`collections/${cu}/resources`,params:{start:0,limit:200,with_attachments:'TRUE'}}).catch(()=>null);const rs=rx?.resource||rx?.resources||[];const hit=rs.find(q=>String(q?.id||q?.resource_id||q?.template_id||'')===String(rid));if(hit){u=hit?.download_path||hit?.downloadPath||hit?.converted_download_path||hit?.convertedDownloadPath||hit?.url||hit?.web_url||hit?.webUrl||'';Object.assign(d,hit)}}}if(!u)throw new Error('Schoology did not provide a resource URL.');const r=await downloadWithFeedback(b,{url:u,filename:d.filename||d.fileName||d.title||d.name||'Schoology file',mime:d.filemime||d.fileMIME||'application/octet-stream'});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)}catch(e){alert('Unable to open resource: '+e.message)}});}catch(e){gc.innerHTML=`<div class="error apiError">${esc(e.message)}</div>`}
}
async function loadMessageThread(m){
  try{
    const id=m?.id||m?.message_id||m?.messageId; if(!id)throw new Error('Message ID is missing.');
    const folder=state.messageFolder||'inbox'; const x=await A.api({path:`messages/${state.messageFolder||'inbox'}/${id}`,params:{with_attachments:'TRUE',keep_unread:'TRUE'}});
    const payload=x?.data||x; const raw=payload?.message||payload?.messages||[]; const msgs=Array.isArray(raw)?raw:(raw?.message||raw?.messages||[]); const users={};
    const userList=payload?.user||payload?.users||payload?.data?.user||payload?.data?.users||[];
    for(const u of (Array.isArray(userList)?userList:[userList])){const id=Number(u?.id||u?.user_id||u?.uid||0);if(id)users[id]=u?.user||u}
    const ids=[...new Set(msgs.flatMap(v=>[v.author_id,v.authorId,v.author?.id,v.author?.user_id,v.user_id,v.uid,v.sender_id,v.senderId,v.sender?.id,v.sender?.user_id].map(Number).filter(Boolean)))];
    await Promise.all(ids.filter(id=>!users[id]).map(async uid=>{try{const u=await A.api({path:`users/${uid}`,params:{}});users[uid]=u?.user||u}catch{}}));
    state.messageThread={messages:msgs,users}; render(); await hydrateMediaImages(document.querySelector('.messageDetail')); document.getElementById('messageReply')?.addEventListener('click',()=>showComposeMessage(m,true));
    if(folder==='inbox')try{await A.api({path:`messages/inbox/${id}`,method:'PUT',params:{message_status:'read'}})}catch{}
  }catch(e){state.messageThread={messages:[],users:{},error:e.message};render();const el=document.querySelector('.messageDetail');if(el)el.innerHTML=`<div class="error apiError">Unable to load this message.<br>${esc(e.message)}</div>`}
}

function showComposeMessage(replyMessage=null,isReply=false){
  state.composeMessage=true;state.message=null;state.messageThread=null;state.toolbarTitle=isReply?'Reply':'New Message';syncToolbar();
  const c=document.getElementById('content');if(!c)return;
  c.classList.remove('webContentHost');
  const wrap=document.createElement('div');wrap.id='composeMessageDialog';wrap.className='assignmentCommentDialogOverlay';wrap.innerHTML=`<section class="composeMessageDialog"><div class="androidCommentDialogBar"><button id="composeMessageCancel" class="androidDialogIcon" aria-label="Cancel">${officialIcon('ic_action_discard_icon.png','Cancel')}</button><div class="androidDialogTitle">New Message</div><button id="sendMessage" class="androidDialogIcon" aria-label="Send">${officialIcon('ic_action_send_icon.png','Send')}</button></div><div class="composeMessagePage">${isReply?'':`<div class="composeField recipientField"><label>To</label><input id="composeToSearch" autocomplete="off" placeholder="Search for a recipient"><div id="recipientSuggestions" class="recipientSuggestions"></div><div id="recipientChips" class="recipientChips"></div><input id="composeTo" type="hidden"></div><div class="composeField"><label>Subject</label><input id="composeSubject" placeholder="Subject"></div>`}<div class="composeField composeBody"><label>Message</label><textarea id="composeBody" placeholder="Write a message…"></textarea></div><div class="messageAttachmentChoices"><button id="messageAttachPhoto" type="button">Photo</button><button id="messageAttachVideo" type="button">Video</button><button id="messageAttachFile" type="button">File</button><button id="messageAttachResource" type="button">Resource</button></div><div id="messageAttachmentList"></div><div id="composeStatus"></div></div></section>`;
  document.body.appendChild(wrap);
  const closeCompose=()=>{state.composeMessage=false;state.toolbarTitle='Messages';wrap.remove();syncToolbar()};
  wrap.querySelector('#composeMessageCancel')?.addEventListener('click',closeCompose);
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeCompose()});
  const selected=[]; const attachments={files:[],resources:[]}; if(isReply&&replyMessage){const authorId=replyMessage.author_id||replyMessage.authorId; if(authorId)selected.push({id:Number(authorId),name:'Reply recipient'});}
  const search=document.getElementById('composeToSearch'), suggestions=document.getElementById('recipientSuggestions'), chips=document.getElementById('recipientChips');
  const renderRecipients=()=>{chips.innerHTML=selected.map((u,i)=>`<span class="recipientChip">${esc(u.name)} <button type="button" data-remove-recipient="${i}">×</button></span>`).join('');document.getElementById('composeTo').value=selected.map(u=>u.id).join(',');chips.querySelectorAll('[data-remove-recipient]').forEach(b=>b.onclick=()=>{selected.splice(+b.dataset.removeRecipient,1);renderRecipients()})};
  if(isReply){document.querySelector('.recipientField')?.remove();document.querySelector('#composeSubject')?.closest('.composeField')?.remove();}
  document.getElementById('messageAttachFile')?.addEventListener('click',async()=>{try{const p=await A.pickFile();if(!p)return;const fp=typeof p==='string'?p:p.path;const fid=await A.uploadSchoologyFile({filePath:fp,mime:typeof p==='object'?p.mime:''});attachments.files.push(String(fid));document.getElementById('messageAttachmentList').innerHTML+=`<div class="messageAttachedItem">${esc(typeof p==='object'&&p.name?p.name:fp.split(/[\\/]/).pop())}</div>`}catch(e){showAppDialog('Unable to attach file',e.message||String(e))}});
  document.getElementById('messageAttachResource')?.addEventListener('click',()=>chooseSchoologyResource(r=>{const id=r.template_id??r.templateID??r.resource_id??r.resourceId??r.id;if(id!=null){attachments.resources.push(String(id));document.getElementById('messageAttachmentList').innerHTML+=`<div class="messageAttachedItem">${esc(r.template_title||r.title||r.name||'Resource')}</div>`}},'Attach Resource'));
  document.getElementById('messageAttachPhoto')?.addEventListener('click',()=>showAppDialog('Photo','Photo attachments are not enabled in the desktop port yet.'));
  document.getElementById('messageAttachVideo')?.addEventListener('click',()=>showAppDialog('Video','Video attachments are not enabled in the desktop port yet.'));
  let searchTimer=null; search?.addEventListener('input',()=>{clearTimeout(searchTimer);const q=search.value.trim();if(q.length<2){suggestions.innerHTML='';return}searchTimer=setTimeout(async()=>{try{const x=await A.api({path:'messages/recipients',params:{name:q,limit:10}});const arr=x.user||x.users||x.recipient||x.recipients||[];suggestions.innerHTML=arr.map(u=>`<button type="button" class="recipientSuggestion" data-recipient-id="${esc(u.id)}" data-recipient-name="${esc(u.name_display||u.nameDisplay||u.display_name||u.name||'User')}">${esc(u.name_display||u.nameDisplay||u.display_name||u.name||'User')}</button>`).join('')||'<div class="recipientNone">No recipients found.</div>';suggestions.querySelectorAll('[data-recipient-id]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.recipientId),name=b.dataset.recipientName;if(id&&!selected.some(u=>u.id===id)){selected.push({id,name});renderRecipients()}search.value='';suggestions.innerHTML=''})}catch(e){suggestions.innerHTML=`<div class="recipientNone">${esc(e.message)}</div>`}},250)});
  document.getElementById('sendMessage')?.addEventListener('click',async()=>{
    const to=document.getElementById('composeTo')?.value.trim(),subject=document.getElementById('composeSubject')?.value.trim(),message=document.getElementById('composeBody')?.value.trim();
    const st=document.getElementById('composeStatus'); if((!isReply&&!to)||!message){if(st)st.textContent=isReply?'Enter a message.':'Enter a recipient and message.';return}
    const ids=selected.map(u=>u.id).join(',');
    try{if(st)st.textContent='Sending…';const params=isReply?{message}:{recipient_ids:ids,subject:subject||'',message};if(attachments.files.length)params['file-attachment']={id:attachments.files};if(attachments.resources.length)params.attachments=attachments.resources.map(resource=>({resource:Number(resource)}));const endpoint=isReply?`messages/${replyMessage?.id||replyMessage?.message_id||replyMessage?.messageId}`:'messages';await A.api({path:endpoint,method:'POST',params,signBody:true});if(st)st.textContent='Message sent.';setTimeout(()=>{state.composeMessage=false;state.toolbarTitle='Messages';state.messageTab='sent';wrap.remove();render();loadTab()},350)}catch(e){if(st)st.textContent='Unable to send message: '+e.message}
  });
}

function resourceIconForType(type,title,item={}){
 const t=String(type||'').toLowerCase();
 const dt=String(item.document_type||item.documentType||item.template?.template_document_type||item.template?.templateDocumentType||'').toLowerCase();
 if(t==='assessment')return 'ic_test_quiz.png';
 if(t==='assessment_v2'||t==='managed_assessment'||t==='quiz')return 'ic_assessment_48dp.png';
 if(t==='assignment')return 'ic_assignment.png';
 if(t==='discussion')return 'ic_discussion.png';
 if(t==='page')return 'ic_pages.png';
 if(t==='album')return 'ic_albums.png';
 if(t==='scorm')return 'ic_scorm.png';
 if(t==='web_package'||t==='web_content')return 'ic_web_content.png';
 if(t==='folder')return item.color&&String(item.color).toLowerCase()!=='black'?`ic_folder_${String(item.color).toLowerCase()}.png`:'ic_folder_black.png';
 if(t==='document'){
   if(dt==='link')return 'ic_files_links.png';
   if(dt==='embed')return 'attachment_link_icon.png';
   if(dt==='external_tool')return 'ic_web_content.png';
   if(dt==='file'){
     const n=String(title||'').toLowerCase();
     const mt=String(item?.filemime||item?.fileMIME||item?.mime||'').toLowerCase().split(';')[0].trim();
     if(/\.pdf$/.test(n)||mt==='application/pdf')return 'ic_attach_app_pdf.png';
     if(/\.(ppt|pptx)$/.test(n))return 'ic_attach_app_ppt.png';
     if(/\.zip$/.test(n))return 'ic_attach_app_zip.png';
     if(/\.(png|jpe?g|gif|webp|bmp)$/.test(n))return 'ic_attach_image.png';
     if(/\.(mp3|wav|m4a|aac|ogg)$/.test(n))return 'ic_attach_audio.png';
     return 'attachment_document_icon.png';
   }
 }
 if(t==='link')return 'ic_files_links.png';
 return 'attachment_document_icon.png';
}
function collectionIcon(type){return type==='shared'?'ic_collection.png':type==='groups'?'home_dash_groups.png':type==='apps'?'ic_resourceapps.png':'ic_eportfolio.png'}
function resourceAttachment(item){return item?.attachments||item?.attachment||item?.template?.attachments||item?.template?.attachment||{};}
function firstAttachment(item,key){const a=resourceAttachment(item);const x=a?.[key]?.[key==='files'?'file':key==='links'?'link':key==='embeds'?'embed':'item']||a?.[key]||a?.[key==='files'?'file':key==='links'?'link':key==='embeds'?'embed':'item'];return Array.isArray(x)?x[0]:x;}
function resourceDocumentType(item){return String(item?.document_type||item?.documentType||item?.template?.template_document_type||item?.template?.templateDocumentType||'').toLowerCase();}
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
     const link=firstAttachment(item,'links');const u=link?.link_url||link?.linkURL||link?.url||link?.href||item.url||item.web_url||item.webUrl;
     if(u){await A.prepareWebSession();showEmbeddedWeb(u,title);return}
   }
   if(dt==='embed'){
     const embed=firstAttachment(item,'embeds');const code=embed?.embed_code||embed?.embedCode;
     if(code){showEmbeddedWeb('data:text/html;charset=utf-8,'+encodeURIComponent(code),title,{allowBrowser:false});return}
   }
   if(dt==='external_tool'){
     const u=item.launch_url||item.launchUrl||item.web_url||item.webUrl||item.url||item.href;
     if(u){await A.prepareWebSession();showEmbeddedWeb(u,title);return}
   }
   if(dt==='file'){
     const f=firstAttachment(item,'files');const u=f?.resolveDownloadUrl||f?.download_path||f?.downloadPath||f?.converted_download_path||f?.convertedDownloadPath;
     if(u){const filename=f?.filename||f?.fileName||title;const mime=f?.filemime||f?.fileMIME||f?.converted_filemime||f?.convertedFileMime||'application/octet-stream';const r=await downloadWithFeedback(button,{url:u,filename,mime});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err);return}
   }
 }
 const u=item.web_url||item.webUrl||item.url||item.href||item.location||item.download_path||item.downloadPath||item.file_url||item.fileUrl;
 if(u){await A.prepareWebSession();showEmbeddedWeb(u,title);return}
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
 all.forEach(o=>{const owner=Number(o.collection_owner_id||o.collectionOwnerId||o.owner_id||0), realm=String(o.collection_realm||o.collectionRealm||'').toLowerCase(), sharedCount=Number(o.shared_users_count||o.sharedUsersCount||0);if(realm==='group')groups.push(o);else if(sharedCount>0)shared.push(o);else if(!realm&&(!owner||owner===Number(uid)))mine.push(o)});
 const categories=[['mine','My Resources',mine],['shared','Shared',shared],['groups','Groups',groups],['apps','Resource Apps',apps]];
 c.innerHTML=`<section class="resourcesAndroidPage"><div class="resourceCategoryList">${categories.map(([key,label,list])=>`<section class="resourceCategory"><button class="resourceCategoryHeader" data-resource-category="${key}"><img src="../assets/icons/${collectionIcon(key)}" alt=""><b>${esc(label)}</b><span class="resourceChevron">›</span></button><div class="resourceCategoryChildren" id="resource-${key}">${list.length?list.map((o,i)=>`<button class="resourceCollectionRow" data-resource-collection="${key}" data-resource-index="${i}"><img src="../assets/icons/${key==='apps'?'ic_resourceapps.png':o.collection_type_id==3?'ic_eportfolio.png':'ic_collection.png'}" alt=""><span><b>${esc(o.collection_title||o.title||o.name||'Resource')}</b></span><span>›</span></button>`).join(''):'<div class="resourceEmpty">No resources</div>'}</div></section>`).join('')}</div></section>`;
 window.__resourceCategories=Object.fromEntries(categories.map(([k,l,a])=>[k,a]));
 document.querySelectorAll('[data-resource-category]').forEach(b=>b.onclick=()=>b.parentElement.classList.toggle('open'));
 document.querySelectorAll('[data-resource-collection]').forEach(b=>b.onclick=async()=>{const col=window.__resourceCategories[b.dataset.resourceCollection][+b.dataset.resourceIndex];const stop=setResourceLoading(b,'Loading resources…');try{if(b.dataset.resourceCollection==='apps'){const j=await A.launchCourseApp({appId:col.collection_id||col.collectionID||col.id});const url=j?.url||j?.launch_token_url||j?.launchTokenUrl||j?.data?.url||j?.data?.launchTokenUrl;if(!url)throw new Error('Schoology did not return a resource-app launch URL.');showEmbeddedWeb(url,col.collection_title||col.title||'Resource App')}else await openResourceCollection(col,b)}catch(e){alert('Unable to open resource: '+e.message)}finally{stop()}});
}
async function openResourceCollection(col){
 const c=document.getElementById('content');if(!c)return;state.resourceCollection=col;state.toolbarTitle=col.collection_title||col.title||col.name||'Resources';syncToolbar();
 const id=col.collection_id||col.collectionID||col.id;if(!id)return;
 const folderId=col.folder_id||col.folderId||col.collection_folder_id||col.collectionFolderId||0;
 c.innerHTML='<section class="resourcesAndroidPage"><div class="loading"><img class="androidInlineSpinner" src="../assets/android_loading_spinner_72.gif" alt=""><span>Loading resources…</span></div></section>';
 try{const x=await A.api({path:`collections/${id}/resources`,params:{start:0,limit:200,with_attachments:'TRUE',...(folderId?{f:folderId}:{})}});const arr=x.resource||x.resources||x.resource_list||[];c.innerHTML=`<section class="resourcesAndroidPage"><div class="resourceRows">${arr.length?arr.map((r,i)=>{const title=resourceTitle(r),type=resourceType(r);return `<button class="resourceFileRow" data-resource-item-index="${i}"><img src="../assets/icons/${resourceIconForType(type,title,r)}" alt=""><span><b>${esc(title)}</b></span><span>›</span></button>`}).join(''):'<div class="resourceEmpty">No resources</div>'}</div></section>`;window.__resourceItems=arr;document.querySelectorAll('[data-resource-item-index]').forEach(b=>b.onclick=async()=>{const stop=setResourceLoading(b,'Loading resource…');try{await openCollectionResource(window.__resourceItems[+b.dataset.resourceItemIndex],b)}catch(e){alert('Unable to open resource: '+e.message)}finally{stop()}})}catch(e){c.innerHTML=`<div class="error apiError">Schoology could not load resources.<br>${esc(e.message)}</div>`}
}
let homeLayoutMediaQuery=null;
function installHomeLayoutWatcher(){const mq=window.matchMedia('(min-aspect-ratio: 4/3)');if(homeLayoutMediaQuery===mq)return;window.__schoologyHomeLayoutChange=()=>{const savedHomeTab=state.homeTab,savedCourse=state.selectedCourse,savedCourseView=state.courseView,savedCourseTab=state.courseTab;if(state.courseView==='course'&&savedCourse){clearTimeout(resizeRefreshTimer);resizeRefreshTimer=setTimeout(()=>{if(state.courseView==='course'&&state.selectedCourse===savedCourse){showCourse(savedCourse,savedCourseTab||'materials',true)}},60);return;}if(state.tab==='home'){clearTimeout(resizeRefreshTimer);resizeRefreshTimer=setTimeout(()=>{if(state.tab==='home'&&state.courseView!=='course'){state.homeTab=savedHomeTab;loadTab()}},60)}};homeLayoutMediaQuery?.removeEventListener?.('change',window.__schoologyHomeLayoutChange);mq.addEventListener?.('change',window.__schoologyHomeLayoutChange);homeLayoutMediaQuery=mq}
async function openRequest(r){if(!r)return;try{const type=String(r.requestType||r.type||r.request_type||'').toLowerCase();if(type==='friend'){const id=Number(r.requester_id||r.requesterId||r.user_id||r.uid||0);if(!id)throw new Error('This friend request is missing its user ID.');state.profileUser={id};state.tab='profile';state.toolbarTitle='Profile';render();loadTab();return}if(type==='group'){const gid=Number(r.realm_id||r.realmId||r.group_id||r.groupId||0);if(!gid)throw new Error('This group invitation is missing its group ID.');state.currentGroup={id:gid,name:r.name||r.title||'Group'};state.tab='groups';state.toolbarTitle=state.currentGroup.name;render();showGroup(state.currentGroup);return}if(type==='section'){const sid=Number(r.realm_id||r.realmId||r.section_id||r.sectionId||0);if(!sid)throw new Error('This course invitation is missing its section ID.');const x=await A.api({path:`sections/${sid}`,params:{}});showCourse(x?.section||x);return}throw new Error('Unknown request type.')}catch(e){alert('Unable to open request: '+e.message)}}
async function handleRequestAction(r,accept){if(!r)return;try{const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('Schoology did not return the logged-in user ID.');const id=r.id||r.request_id||r.requestId;if(!id)throw new Error('This request is missing its ID.');if(r.requestType==='friend'){await A.api({path:`users/${uid}/requests/friends/${id}`,method:'PUT',params:{request:{request_action:accept?'accept':'deny'}},json:true});}else{const realm=r.requestType==='group'?'groups':'sections';await A.api({path:`users/${uid}/invites/${realm}/${id}`,method:'PUT',params:{invite:{invite_action:accept?'accept':'deny'}},json:true});}await loadTab()}catch(e){alert(`Unable to ${accept?'accept':'decline'} request: ${e.message}`)}}

async function openNotification(n){
  if(!n)return;
  const realmRaw=String(n.realm||'user').toLowerCase();
  const realm=realmRaw==='section'?'sections':realmRaw==='group'?'groups':realmRaw==='school'?'schools':realmRaw==='user'?'users':realmRaw;
  const realmId=n.realm_id||n.realmId||n.user_id||n.uid||state.auth?.userId;
  const args=n.body_args||n.bodyArgs||n.body_arg||[];
  const list=Array.isArray(args)?args:(args?.body_arg||args?.args||[]);
  const candidates=[];
  const walk=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(walk);return}if(typeof v==='object'){if(v.type&&v.id!=null)candidates.push(v);Object.values(v).forEach(x=>{if(x&&typeof x==='object')walk(x)})}}; walk(list);
  let a=candidates[candidates.length-1];
  if(String(n.type||'').toLowerCase()==='badge_award' && a?.type==='user')a={...a,type:'section'};
  if(!a?.id){a={type:n.object_type||n.objectType||n.type==='discussion_add'?'discussion':n.type==='grade_item_submit'?'assignment':null,id:n.object_id||n.objectId||n.assignment_id||n.assignmentId};}
  const type=String(a?.type||'').toLowerCase(), id=a?.id;
  try{
    if(!id)return;
    if(type==='assignment'||type==='assessment'||type==='assessment_v2'||type==='managed_assessment'){if(realm==='sections'&&realmId)showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,n.title||'Assessment',{allowBrowser:false,quiz:true,assessment:true});return}
    if(type==='discussion'){if(realm==='sections'&&realmId){showDiscussionNative('sections',realmId,id,n.title||'Discussion')}else if(realm==='groups'&&realmId){showDiscussionNative('groups',realmId,id,n.title||'Discussion')}else {showEmbeddedWeb(`https://app.schoology.com/discussion/${id}`,n.title||'Discussion',{allowBrowser:false})}return}
    if(type==='page'){if(realm&&realmId){showPageNative(realm,Number(realmId),Number(id),n.title||'Page');return}return}
    if(type==='user'){state.profileUser={id:Number(id)};state.tab='profile';state.toolbarTitle='Profile';render();loadTab();return}
    if(type==='group'){state.currentGroup={id:Number(id),name:n.title||'Group'};state.tab='groups';state.toolbarTitle=n.title||'Group';render();showGroup(state.currentGroup);return}
    if(type==='section'){const x=await A.api({path:`sections/${id}`,params:{}});showCourse(x?.section||x);return}
    if(type==='school'){showEmbeddedWeb(`https://app.schoology.com/school/${id}`,n.title||'School');return}
    showEmbeddedWeb(`https://app.schoology.com/${realm}/${id}`,n.title||'Notification');
  }catch(e){alert('Unable to open notification: '+e.message)}
}

async function loadMessagesPage(c){
 const endpoint=state.messageTab==='sent'?'messages/sent':'messages/inbox';
 const x=await A.api({path:endpoint,params:{limit:50}});const arr=x.message||x.messages||[];window.__schoologyMessages=arr;
 const ids=[...new Set(arr.map(m=>state.messageTab==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId)).map(Number).filter(Boolean))];
 const users={};await Promise.all(ids.map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});users[id]=u?.user||u}catch{}}));window.__schoologyMessageUsers=users;
 c.innerHTML=`<section class="messagesAndroidPage"><div class="messageTabs"><button class="messageTab ${state.messageTab==='inbox'?'active':''}" data-message-tab="inbox">Inbox</button><button class="messageTab ${state.messageTab==='sent'?'active':''}" data-message-tab="sent">Sent</button></div><div class="messageList">${arr.map((m,i)=>{const uid=Number(state.messageTab==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId));const u=users[uid]||{};const me=Number(state.auth?.userId||state.auth?.user?.id||0)===uid;const name=me?'You':(u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology');const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||'');const ts=m.last_updated||m.lastUpdated||m.created||m.timestamp;const date=ts?(typeof ts==='number'||/^\\d+$/.test(String(ts))?new Date(Number(ts)*1000).toLocaleString():String(ts)):'';return `<button class="messageListItem ${m.message_status==='unread'?'unread':''}" data-message="${i}"><span class="messageListAvatar">${avatar?`<img data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`${esc(String(name).charAt(0))}`}</span><span class="messageListText"><b>${esc(name)}</b><strong>${esc(m.subject||'Message')}</strong><small>${esc(date)}</small></span>${m.message_status==='unread'?'<span class="messageUnreadDot"></span>':''}</button>`}).join('')||'<div class="empty">No messages.</div>'}</div></section>`;
 await hydrateMediaImages(c);
 document.querySelectorAll('[data-message-tab]').forEach(b=>b.onclick=async()=>{if(state.messageTab===b.dataset.messageTab)return;state.messageTab=b.dataset.messageTab;await loadMessagesPage(c)});
 document.querySelectorAll('[data-message]').forEach(b=>b.onclick=async()=>{const m=window.__schoologyMessages?.[+b.dataset.message];if(!m)return;state.message=m;state.messageFolder=state.messageTab;state.messageThread=null;render();await loadMessageThread(m);});
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
    const landscape=window.matchMedia('(min-aspect-ratio: 4/3)').matches;
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
    const profileLandscape=currentWindowLayout()==='landscape';
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
    const month=state.calendarDate?new Date(state.calendarDate):new Date();
    const selected=state.calendarSelectedDate?new Date(state.calendarSelectedDate):new Date();
    const monthStart=new Date(month.getFullYear(),month.getMonth(),1),monthEnd=new Date(month.getFullYear(),month.getMonth()+1,0);
    const ym=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const monthKey=ym(month);
    const start=`${monthKey}-01`,end=`${monthKey}-${String(monthEnd.getDate()).padStart(2,'0')}`;
    const [perm]=await Promise.all([A.api({path:`users/${uid}/events/permissions`,params:{}}).catch(()=>({}))]);
    state.calendarCanCreate=!!(perm?.permission?.post??perm?.permissions?.post??perm?.permission_map?.post??perm?.canPOST??perm?.can_post);
    if(state.calendarEventsMonth!==monthKey){
      const x=await A.api({path:`users/${uid}/events`,params:{start,end,limit:200}});
      state.calendarEvents=x.event||x.events||[];state.calendarEventsMonth=monthKey;
    }
    const arr=Array.isArray(state.calendarEvents)?state.calendarEvents:[];const byDay={};for(const e of arr){const raw=e.start||e.start_date||e.date||e.startDate||'';const key=String(raw).slice(0,10);if(key)(byDay[key]||(byDay[key]=[])).push(e)}
    const selectedKey=formatApiDate(selected),days=monthStart.getDay(),rows=Math.ceil((days+monthEnd.getDate())/7),cells=[];
    for(let i=0;i<rows*7;i++){const n=i-days+1,inMonth=n>=1&&n<=monthEnd.getDate(),d=inMonth?new Date(month.getFullYear(),month.getMonth(),n):null,key=d?formatApiDate(d):'',evs=key?(byDay[key]||[]):[];cells.push(`<button class="calendarDay ${key===selectedKey?'selected':''} ${inMonth?'':'outside'}" data-calendar-day="${key}"><b>${inMonth?n:''}</b>${evs.length?'<i class="calendarEventMarker" aria-hidden="true"></i>':''}</button>`)}
    const eventRowsFor=events=>events.map(e=>{const type=String(e.type||'').toLowerCase();const icon=type==='assignment'?'ic_assignment.png':type==='assessment'?'ic_test_quiz.png':['assessment_v2','managed_assessment','quiz'].includes(type)?'ic_assessment_48dp.png':type==='discussion'?'ic_discussion.png':type==='external_tool'?'ic_external_tool.png':'ic_date_range_24px.svg';const allDay=String(e.all_day??e.allDay??'')==='1'||e.allDay===1;const start=e.start||e.start_date||e.startDate||'';let time='';if(!allDay&&start){const dt=new Date(String(start).replace(' ','T'));if(!Number.isNaN(dt.getTime()))time=dt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}return `<button class="calendarEventRow" data-calendar-event="${esc(e.id||'')}"><span class="calendarEventIcon">${officialOrAssetIcon(icon,'')}</span><span class="calendarEventText"><b>${esc(e.title||'Event')}</b>${time?`<small>${esc(time)}</small>`:''}</span></button>`}).join('');
    const bindCalendar=()=>{document.getElementById('calendarPrev')?.addEventListener('click',()=>{state.calendarDate=new Date(month.getFullYear(),month.getMonth()-1,1);state.calendarEventsMonth='';loadTab()});document.getElementById('calendarNext')?.addEventListener('click',()=>{state.calendarDate=new Date(month.getFullYear(),month.getMonth()+1,1);state.calendarEventsMonth='';loadTab()});document.querySelectorAll('[data-calendar-day]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.calendarDay;if(!k)return;state.calendarSelectedDate=new Date(k+'T12:00:00');document.querySelectorAll('[data-calendar-day]').forEach(x=>x.classList.toggle('selected',x===b));const list=document.getElementById('calendarEventList');if(list)list.innerHTML=eventRowsFor(byDay[k]||[])||'<div class="androidEmptyState">No upcoming events</div>';bindEventRows()}));};
    const bindEventRows=()=>document.querySelectorAll('[data-calendar-event]').forEach(b=>{if(b.dataset.boundCalendar)return;b.dataset.boundCalendar='1';b.addEventListener('click',()=>{const e=arr.find(v=>String(v.id||'')===String(b.dataset.calendarEvent));if(e)showAppDialog(e.title||'Event',e.description||e.body||'')})});
    c.innerHTML=`<section class="calendarAndroidPage"><div class="calendarMonthWrap"><header class="calendarMonthHeader"><button id="calendarPrev" aria-label="Previous month">‹</button><b>${esc(month.toLocaleDateString([], {month:'long',year:'numeric'}))}</b><button id="calendarNext" aria-label="Next month">›</button></header><div class="calendarWeekLabels">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendarGrid">${cells.join('')}</div></div><div id="calendarEventList" class="calendarEventList">${eventRowsFor(byDay[selectedKey]||[])||'<div class="androidEmptyState">No upcoming events</div>'}</div></section>`;
    bindCalendar();bindEventRows();
  }else if(state.tab==='grades'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/grades`,params:{}});const ss=x.section||x.sections||[];
    c.innerHTML=`<section class="page"><h1>Grades</h1><div class="sectionListRows">${ss.map((s,i)=>`<button class="sectionListItem" data-user-grade-section="${i}"><span class="sectionLabels"><b>${esc(s.section_title||s.course_title||'Course')}</b><small>${esc((s.final_grade||[])[0]?.grade||'')}</small></span><span>›</span></button>`).join('')||'<div class="empty"><h2>No grades</h2></div>'}</div></section>`;
    window.__schoologyUserGradeSections=ss;
    document.querySelectorAll('[data-user-grade-section]').forEach(b=>b.onclick=()=>{const ss=window.__schoologyUserGradeSections[+b.dataset.userGradeSection];showCourse({id:ss.section_id,section_title:ss.section_title||ss.course_title,course_title:ss.course_title},'grades')});
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
    const x=await A.api({path:'notifications'});
    const raw=x?.notification??x?.notifications??x?.data?.notification??x?.data?.notifications??[];
    const arr=Array.isArray(raw)?raw:(raw?.notification||raw?.notifications||raw?.items||[]);
    const iconFor=n=>{const t=String(n?.type||'').toLowerCase(), args=n?.body_args||n?.bodyArgs||n?.body_arg||[];const last=Array.isArray(args)?args[args.length-1]:null;if(t==='grade_add')return'ic_notifications_grade_add.png';if(t==='badge_award')return'ic_starbadge.png';if(t==='course_materials_add')return'ic_notifications_course_materials_add.png';if(t==='grade_item_submit'){if(last?.type==='assessment')return'ic_notifications_test_quiz.png';if(['assessment_v2','managed_assessment'].includes(last?.type))return'ic_assessment_16dp.svg';return'ic_notifications_grade_item_submit.png'}if(t==='comment_private_add')return'ic_notifications_comment_private_add.png';if(t==='discussion_add')return n?.realm==='schools'?'ic_notifications_discussion_add_school.png':n?.realm==='groups'?'ic_notifications_course_materials_add_group.png':'ic_notifications_unknown.png';if(t==='comment_add')return'ic_notifications_comment_add.png';return'ic_notifications_unknown.png'};
    const bodyFor=n=>{const body=String(n?.body||n?.message||n?.title||'Notification');const args=n?.body_args||n?.bodyArgs||[];const rendered=Array.isArray(args)?args.reduce((out,a)=>out.replace('%s',String(a?.title||a?.name||'')),body):body;return rendered.replace(/<a\b([^>]*?)href=[\"']([^\"']+)[\"']([^>]*)>(.*?)<\/a>/gi,(_,pre,href,post,label)=>`<a class="notificationBodyLink" data-notification-href="${esc(href)}">${esc(label.replace(/<[^>]+>/g,''))}</a>`)};
    window.__schoologyNotifications=arr;
c.innerHTML=`<section class="notificationsAndroidPage"><div class="notificationList">${arr.map((n,i)=>`<button class="androidNotificationItem notificationClickable" data-notification-index="${i}"><img src="../assets/icons/${iconFor(n)}" alt=""><div class="notificationText"><div class="notificationBodyRich">${bodyFor(n)}</div><small>${esc(formatSchoologyDate(n.created||n.timestamp||''))}</small></div><span class="disclosure">›</span></button>`).join('')||'<div class="empty">You have no notifications</div>'}</div></section>`;
document.querySelectorAll('[data-notification-index]').forEach(b=>b.onclick=()=>openNotification(window.__schoologyNotifications[+b.dataset.notificationIndex]));document.querySelectorAll('[data-notification-href]').forEach(a=>a.onclick=async ev=>{ev.preventDefault();ev.stopPropagation();const href=a.dataset.notificationHref||'';if(!href)return;try{if(await routeSchoologyLink(href))return;await showEmbeddedWeb(href,a.textContent?.trim()||'Link')}catch(e){alert('Unable to open notification link: '+e.message)}});
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
    let last='';const rows=arr.map((u,i)=>{const lastName=String(u.name_last||u.last_name||'');const firstName=String(u.name_first||u.first_name||u.name_display_start||u.name||'');const preferred=String(u.name_first_preferred||u.nameFirstPreferred||'');const letter=(lastName.charAt(0)||'#').toUpperCase();let h='';if(letter!==last){last=letter;h=`<div class="peopleSectionHeader">${esc(letter)}</div>`}const image=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||'');return `${h}<button class="peopleListItem" data-person-index="${i}"><img class="peopleAvatar" src="${image||'../assets/icons/profile_default_website.png'}" alt=""><span><b>${esc(firstName)} ${esc(lastName)}</b>${preferred?`<small>${esc(preferred)}</small>`:''}</span></button>`}).join('');
    c.innerHTML=`<section class="peopleAndroidPage"><div class="peopleList">${rows||'<div class="empty">No people found.</div>'}</div></section>`;
    document.querySelectorAll('[data-person-index]').forEach(b=>b.onclick=()=>{const u=window.__schoologyPeople[+b.dataset.personIndex];state.profileUser=u;state.tab='profile';state.profileTab='updates';state.toolbarTitle='Profile';render();loadTab()});
  }else if(state.tab==='settings'){
    c.innerHTML=`<section class="settingsPage"><div class="settingsGroup"><h2>Notification Settings</h2><label class="settingRow"><span><b>Notifications</b><small id="notifSummary">Enabled</small></span><input type="checkbox" id="notifToggle" checked></label><button class="settingRow settingButton"><span><b>Ringtone</b><small>Set Notification Ringtone</small></span><span>›</span></button><label class="settingRow"><span><b>Vibrate</b><small>Vibrate on incoming notifications</small></span><input type="checkbox" checked></label><label class="settingRow"><span><b>Phone LED</b><small>Flash LED on notifications</small></span><input type="checkbox" checked></label></div><div class="settingsGroup"><h2>Account Settings</h2><button id="accountInfo" class="settingRow settingButton"><span><b>Account Info</b></span><span>›</span></button></div><div class="settingsGroup"><button id="checkForUpdates" class="settingRow settingButton"><span><b>Check for Updates</b><small>Check for a newer Schoology desktop port</small></span><span>›</span></button><label class="settingRow"><span><b>Window Controls Overlay</b><small>Place native window controls over the Schoology app bar (restart required)</small></span><input type="checkbox" id="windowChromeOverlayToggle" ${state.windowChromeOverlay?'checked':''}></label></div><div class="settingsVersion">Version: 2026.06.0-port.91</div></section>`;
    document.getElementById('notifToggle')?.addEventListener('change',e=>{document.getElementById('notifSummary').textContent=e.target.checked?'Enabled':'Disabled'});
    document.getElementById('accountInfo')?.addEventListener('click',async()=>{try{await A.prepareWebSession();state.embeddedReturn={tab:'settings',title:'Settings'};showEmbeddedWeb('https://app.schoology.com/settings/account','Account Info',{allowBrowser:false,accountInfo:true})}catch(e){alert(e.message)}});
    document.getElementById('checkForUpdates')?.addEventListener('click',async()=>{const b=document.getElementById('checkForUpdates');if(b){b.disabled=true;b.classList.add('downloadBusy');b.querySelector('.settingProgress')?.remove();b.insertAdjacentHTML('beforeend','<span class="settingProgress"><img src="../assets/android_loading_spinner_72.gif" alt=""></span>');}try{const u=await A.checkForUpdates(true);if(u?.available)showUpdateDialog(u);else showAppDialog('Up to date','You are using the latest available Schoology Desktop Port release.')}catch(e){showAppDialog('Unable to check for updates',e.message||String(e))}finally{if(b){b.disabled=false;b.classList.remove('downloadBusy');b.querySelector('.settingProgress')?.remove()}}});
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
 document.querySelectorAll('[data-course-upcoming-id]').forEach(b=>b.onclick=async()=>{const e=sorted.find(v=>String(v.id||'')===String(b.dataset.courseUpcomingId));if(!e)return;const type=String(e.type||'').toLowerCase();const aid=e.assignment_id??e.assignmentId??e.assignment?.id;const sid=e.section_id??e.sectionId;if(type==='assignment'&&sid&&aid){state.homeUpcomingReturn=true;openWithPressTransition(b,()=>showAssignment(sid,aid));return}if(['assessment','assessment_v2','managed_assessment','quiz'].includes(type)){const id=aid??e.id;if(id){openWithPressTransition(b,async()=>{state.embeddedReturn={tab:'home',homeTab:state.homeTab,title:'Home'};await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${id}`,e.title||'Quiz',{allowBrowser:false,quiz:true,assessment:true})});return}}if(e.web_url||e.webUrl)openWithPressTransition(b,()=>showEmbeddedWeb(e.web_url||e.webUrl,e.title||'Upcoming'));});
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
      return `<article class="androidActivityCard">
        <div class="activityHeader">${avatar?`<img class="activityAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="activityAvatar">${esc(String(name).charAt(0))}</span>`}<button class="activityUser activityAuthorLink" data-author-id="${esc(u.id||x.user_id||x.uid||x.author_id||x.authorId||'')}">${esc(name)}</button></div>
        <div class="activityBody">${body}</div>
        ${media}
        <div class="activityMeta">${esc(created)}</div>
        <div class="activityActions"><button data-activity-comments="${esc(x.id||'')}">Comment${comments?` (${comments})`:''}</button><button data-activity-like="${esc(x.id||'')}" data-liked="${x.liked||x.is_liked?'1':'0'}">${x.liked||x.is_liked?'Unlike':'Like'}${x.likes?` (${esc(x.likes)})`:''}</button></div>
      </article>`;
    }).join(''):'<div class="empty"><h2>No recent activity</h2><p>Your recent Schoology activity will appear here.</p></div>';
    await hydrateMediaImages(c);
    document.querySelectorAll('[data-activityAuthorLink],[data-activity-author-id]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.activityAuthorId||btn.dataset.authorId;if(id)openProfileById(id,btn.textContent||'Profile')});
    document.querySelectorAll('.activityAuthorLink[data-author-id]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.authorId;if(id)openProfileById(id,btn.textContent||'Profile')});
    document.querySelectorAll('[data-activity-like]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.activityLike;if(!id)return;
      const liked=btn.dataset.liked==='1';
      try{await A.api({path:`like/${id}`,method:'POST',params:{like_action:!liked},json:true});btn.dataset.liked=liked?'0':'1';btn.textContent=liked?'Like':'Unlike';}
      catch(e){alert('Unable to update like: '+e.message)}
    });
    document.querySelectorAll('[data-activity-comments]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.activityComments;if(!id)return;
      try{
        const uid=state.auth?.userId||state.auth?.user?.id;
        const update=state.__activityById?.[String(id)]||{}; const rawRealm=String(update.realm||update.realm_name||update.realmName||'user').toLowerCase(); const realm=rawRealm==='user'?'users':rawRealm==='section'?'sections':rawRealm==='group'?'groups':rawRealm==='school'?'schools':rawRealm; const realmId=rawRealm==='user'?(update.user_id||update.uid||uid):rawRealm==='section'?(update.section_id||update.sectionId||uid):rawRealm==='group'?(update.group_id||update.groupId||uid):rawRealm==='school'?(update.school_id||update.schoolId||uid):(update.realm_id||update.realmId||uid); const x=await A.api({path:`${realm}/${realmId}/updates/${id}/comments`,params:{start:0,limit:50,with_attachments:'TRUE',richtext:1}});
        const arr=x.comment||x.comments||[];
        alert(arr.length?arr.map(c=>`${c.display_name||c.user_name||'User'}: ${c.body||c.comment||''}`).join('\n\n'):'No comments.');
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
    c.innerHTML='<div id="homeUpcomingList" class="homeUpcomingPortraitList"></div>';
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
  // optional jsQR native-module bridge for the normal camera-login path.
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
  // Compatibility fallback for Electron builds without BarcodeDetector.
  const attempts=[wc.getImageData(0,0,size,size),ctx.getImageData(0,0,w,h)];
  for(const img of attempts){
    try{const code=A.decodeQR(img.data,img.width,img.height);if(code?.data)return code.data}catch(e){}
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
          qrBusy=true;stopQR();
          try{state.auth=await A.loginQR(data);await afterLogin()}catch(e){state.error=e.message||'Sorry, your code isn’t working. Please try again.';state.screen='qr';render();startQR();return}
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
      return;
    }
    render();
    window.schoologyAppReady?.();
  }catch(e){
    console.warn('Schoology startup failed:',e);
    if(retry||e?.message){showStartupOfflineError();return;}
    render();window.schoologyAppReady?.();
  }
}
startSchoologyStartup();

A.onUpdateAvailable?.(u=>{if(!u?.url)return;let dlg=showAppDialog('Downloading update','Downloading…',[]);const msg=dlg?.querySelector('.appDialogMessage');if(msg)msg.innerHTML='<div class="updateDownloadProgressWrap"><div class="updateDownloadProgressTrack"><div id="autoUpdateDownloadProgressBar" class="updateDownloadProgressBar" style="width:0%"></div></div><div id="autoUpdateDownloadProgressText" class="updateDownloadProgressText">Downloading…</div></div>';const off=A.onUpdateDownloadProgress?.(d=>{const bar=document.getElementById('autoUpdateDownloadProgressBar'),txt=document.getElementById('autoUpdateDownloadProgressText');if(bar&&d?.percent!=null)bar.style.width=d.percent+'%';if(txt)txt.textContent=d?.percent!=null?`Downloading… ${d.percent}%`:'Downloading…';});A.installUpdate(u).catch(e=>{off?.();dlg?.classList.remove('open');showAppDialog('Unable to install update',e.message||String(e))});});
