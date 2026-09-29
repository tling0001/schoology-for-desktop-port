const app=document.getElementById('app');
const A=window.schoology;
if(!A){
  app.innerHTML='<div class="fatal"><h2>Schoology</h2><p>The application interface could not initialize.</p><p>The Electron authentication bridge did not load.</p></div>';
  throw new Error('Schoology preload bridge is unavailable');
}
const C={graphite:'#44505d',dark:'#22303e',blue:'#2e66a3',blueText:'#3183c8',bg:'#e7ebee',light:'#f4f5f5',white:'#fff',muted:'#868e96'};
let state={screen:'login',school:null,schools:[],q:'',loading:false,error:'',auth:null,user:null,tab:'home',homeTab:'recent',searchToken:0,drawerPage:null,message:null,messageTab:'inbox',messageFolder:'inbox',messageThread:null,composeMessage:false,selectedCourse:null,mobileMe:null,courseDashboardEnabled:false,preferredHomepage:'recent',toolbarTitle:'Home',folderId:0,folderStack:[],courseView:null,activityUsers:{},activityComments:null,currentFolderId:0,currentGroup:null,profileUser:null,profileTab:'updates',groupTab:'updates'};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function closeDrawerThen(fn){const drawer=document.getElementById('drawer'),shade=document.getElementById('drawerShade');drawer?.classList.remove('open');shade?.classList.remove('open');setTimeout(()=>{state.drawerPage=null;fn?.()},280)}
function messageDetail(){
 const m=state.message||{}; const thread=state.messageThread;
 const msgs=thread?.messages||[]; const users=thread?.users||{};
 const subject=m.subject||msgs[0]?.subject||'Message';
 const cards=msgs.length?msgs.map(msg=>{
   const uid=Number(msg.author_id||msg.authorId||0); const u=users[uid]||{};
   const me=uid && Number(state.auth?.userId||state.auth?.user?.id||0)===uid;
   const name=me?'You':(u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology');
   const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||'');
   const ts=msg.last_updated||msg.lastUpdated||msg.created||msg.timestamp;
   const date=ts?(typeof ts==='number'||/^\d+$/.test(String(ts))?new Date(Number(ts)*1000).toLocaleString():String(ts)):'';
   const body=msg.message||msg.body||'';
   const attachments=renderMessageAttachments(msg.attachments||msg.attachment||{});
   return `<article class="messageThreadItem"><div class="messageThreadHeader">${avatar?`<img class="messageThreadAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="messageThreadAvatarFallback">${esc(String(name).charAt(0))}</span>`}<div><b>${esc(name)}</b><small>${esc(date)}</small></div></div><div class="messageThreadBody">${esc(body)}</div>${attachments}</article>`;
 }).join(''):`<div class="messageThreadLoading">Loading message…</div>`;
 return `<div class="shell"><header class="toolbar"><button id="messageBack" class="iconButton" aria-label="Back">‹</button><span class="toolbarTitle">${esc(subject)}</span><button id="messageMore" class="iconButton" aria-label="More">⋮</button></header><main class="messageDetail">${thread?cards:'<div class="loading">Loading message…</div>'}</main></div>`;
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
function render(){let h=state.message?messageDetail():state.screen==='login'?login():state.screen==='search'?schoolSearchScreen():state.screen==='credentials'?credentials():state.screen==='externalSelect'?externalSelect():state.screen==='qr'?qr():shell();app.innerHTML=h;bind();return h}
function login(){return `<div class="login"><img class="logo" src="../assets/logo_schoology.png"><div class="loginBody"><button id="schoolLogin" class="primary">Log in through your School</button><button id="continueSchoology" class="secondary">Log in using schoology.com</button><button id="qrLogin" class="qrButton">Sign in with a QR code</button></div><div class="loginBottom">I need help signing in</div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function schoolSearchScreen(){return `<div class="login"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="label">School</div><div class="searchWrap"><input id="schoolSearch" autocomplete="off" autofocus placeholder="Enter your School or domain" value="${esc(state.q)}"><span>⌕</span></div>${state.loading?'<div class="searchStatus">Searching…</div>':''}${state.schools.length?`<div class="suggestions">${state.schools.map((s,i)=>`<button class="suggestion" data-school="${i}"><b>${esc(s.title||'')}</b><small>${esc([s.id,s.domain,s.location].filter(Boolean).join(' • '))}</small></button>`).join('')}</div>`:''}${!state.loading&&state.q&&state.schools.length===0&&!state.error?'<div class="searchStatus">No schools found.</div>':''}</div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function credentials(){return `<div class="login"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody">${state.school?`<div class="selected">${esc(state.school.title||'School')}</div>`:'<div class="accountTitle">Log in using schoology.com</div>'}<div class="label">Username or Email</div><input id="user" class="field" autocomplete="username"><div class="label">Password</div><input id="pass" class="field" type="password" autocomplete="current-password"><button id="signIn" class="primary">Login</button><button id="qrLogin" class="qrButton">Sign in with a QR code</button></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function externalSelect(){
  const name=state.school?.title||'School';
  return `<div class="login"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="selected">${esc(name)}</div><button id="browserLogin" class="primary">Log in through your browser</button><button id="nativeLogin" class="secondary">Log in with a username and password</button></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`
}
function qr(){return `<div class="qr"><button id="back" class="back">‹</button><h1>QR Code Login</h1><p>Scan Your Code</p><video id="video" autoplay playsinline muted></video><canvas id="canvas"></canvas><div class="qrbox"></div><p class="qrhint">Point your camera at the QR code shown in Schoology.</p>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function shell(){
 const drawerItems=[
  ['profile','Profile','◉'],['messages','Messages','✉'],['notifications','Notifications','●'],['requests','Requests','♧'],
  ['home','Home','⌂'],['courses','Courses','▣'],['groups','Groups','♧'],['resources','Resources','▤'],['grades','Grades','✓'],['calendar','Calendar','□'],['people','People','♙'],
  ['settings','Settings','⚙'],['logout','Logout','↪']
 ];
 const drawerPage=state.drawerPage==='courses'||state.drawerPage==='groups'||state.drawerPage==='grades'?`
   <div class="drawerSub">
    <div class="drawerSubHeader"><button id="drawerBack" class="drawerBack">‹</button><span>${state.drawerPage==='grades'?'Grades':state.drawerPage==='groups'?'Groups':'Courses'}</span>${state.drawerPage==='courses'?'<button id="joinCourse" class="drawerHeaderAction">+</button>':'<span class="drawerHeaderSpacer"></span>'}</div>
    <div id="courseSubList" class="courseSubList"><div class="drawerLoading">Loading ${state.drawerPage==='grades'?'grades':state.drawerPage==='groups'?'groups':'courses'}…</div></div>
   </div>`:'';
 return `<div class="shell">
 <header class="toolbar">${state.courseView||state.folderStack.length||state.assignmentView||state.embeddedTitle?`<button id="toolbarBack" class="iconButton" aria-label="Back">‹</button>`:`<button id="menuButton" class="iconButton" aria-label="Navigation menu">☰</button>`}<span class="toolbarTitle">${esc(state.toolbarTitle||'Home')}</span>${state.tab==='messages'&&!state.courseView&&!state.embeddedTitle?`<button id="composeMessage" class="iconButton toolbarPlus" aria-label="Compose message">+</button>`:`<button id="toolbarMore" class="iconButton">⋮</button>`}</header>
 <main id="content"><div class="loading">Loading…</div></main>
 <div id="drawerShade" class="drawerShade"></div><aside id="drawer" class="drawer">
   ${drawerPage||`<button id="profileButton" class="profileRow"><img src="../assets/logo_schoology.png"><span>${esc(state.auth?.user?.name_display||state.auth?.user?.name||'Profile')}</span></button>
   <div class="drawerList">${drawerItems.map(([id,label,icon],i)=>i===4||i===11?`<div class="drawerDivider"></div><button class="drawerItem" data-drawer="${id}"><span class="drawerIcon">${icon}</span><span>${label}${id==='courses'||id==='grades'?'<span class="disclosure">›</span>':''}</span></button>`:`<button class="drawerItem" data-drawer="${id}"><span class="drawerIcon">${icon}</span><span>${label}${id==='courses'||id==='grades'?'<span class="disclosure">›</span>':''}</span></button>`).join('')}</div>`}
 </aside>
 </div>`
}
function bind(){
  document.getElementById('composeMessage')?.addEventListener('click',()=>showComposeMessage());
  document.getElementById('toolbarBack')?.addEventListener('click',()=>navigateBack());
  const schoolBtn=document.getElementById('schoolLogin');if(schoolBtn)schoolBtn.onclick=()=>{state.error='';state.q='';state.schools=[];state.screen='search';render();document.getElementById('schoolSearch')?.focus()};
  const accountBtn=document.getElementById('continueSchoology');if(accountBtn)accountBtn.onclick=()=>{state.error='';state.school=null;state.screen='credentials';render();document.getElementById('user')?.focus()};
  const qrbtn=document.getElementById('qrLogin');if(qrbtn)qrbtn.onclick=()=>{state.error='';state.screen='qr';render();startQR()};
  const back=document.getElementById('back');if(back)back.onclick=()=>{stopQR();state.error='';state.screen=state.school?'search':'login';if(state.screen==='search')state.schools=[];render()};
  const q=document.getElementById('schoolSearch');
  if(q){q.oninput=async()=>{const start=q.selectionStart??q.value.length,end=q.selectionEnd??start;state.q=q.value;const query=q.value.trim();const restore=()=>{const el=document.getElementById('schoolSearch');if(el){el.focus();try{el.setSelectionRange(start,end)}catch{}}};if(query.length<1){state.schools=[];state.loading=false;render();restore();return}const token=++state.searchToken;state.loading=true;state.error='';render();restore();try{const results=await A.schoolSearch(query);if(token!==state.searchToken)return;state.schools=Array.isArray(results)?results:[]}catch(e){if(token===state.searchToken){state.schools=[];state.error=e.message||'Unable to search for schools.'}}finally{if(token===state.searchToken)state.loading=false}if(token===state.searchToken){render();restore()}}}
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
  const setDrawer=(open)=>{drawer?.classList.toggle('open',open);shade?.classList.toggle('open',open);if(!open)state.drawerPage=null};
  document.getElementById('menuButton')?.addEventListener('click',()=>setDrawer(true));
  shade?.addEventListener('click',()=>setDrawer(false));

  document.getElementById('profileButton')?.addEventListener('click',()=>{closeDrawerThen(()=>{state.profileUser=state.auth?.user||null;state.tab='profile';state.toolbarTitle='Profile';render();loadTab()})});
  document.getElementById('drawerBack')?.addEventListener('click',()=>{state.drawerPage=null;render();setTimeout(()=>document.getElementById('drawer')?.classList.add('open'),0)});
  document.getElementById('joinCourse')?.addEventListener('click',()=>{state.drawerPage=null;render();setTimeout(()=>document.getElementById('drawer')?.classList.add('open'),0)});

  document.querySelectorAll('[data-drawer]').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.drawer;
    if(id==='courses'||id==='groups'||id==='grades'){
      state.drawerPage=id;render();document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open');loadCourseSubmenu();return;
    }
    closeDrawerThen(async()=>{
      if(id==='logout'){await A.logout();state.auth=null;state.school=null;state.tab='home';state.screen='login';render();return}
      if(id==='settings'){state.tab='settings';state.toolbarTitle='Settings';state.screen='app';render();loadTab();return}
      if(['home','calendar','grades','messages','notifications','resources','profile','groups','people'].includes(id)){state.tab=id;state.toolbarTitle=id.charAt(0).toUpperCase()+id.slice(1);state.screen='app';render();loadTab()}
    });
  }));

  document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{const order=['recent','dashboard','upcoming'];const oldIndex=order.indexOf(state.homeTab),newIndex=order.indexOf(b.dataset.homeTab);state.homeTabDirection=newIndex>=oldIndex?'forward':'back';state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(m){state.message=m;render();}});
  document.getElementById('messageBack')?.addEventListener('click',()=>{state.message=null;state.messageThread=null;render();loadTab()});
  document.querySelectorAll('[data-message-tab]').forEach(b=>b.onclick=()=>{state.messageTab=b.dataset.messageTab;loadTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(!m)return;state.message=m;state.messageFolder=state.messageTab;state.messageThread=null;render();await loadMessageThread(m)});
  document.querySelectorAll('[data-download-url]').forEach(b=>b.onclick=async()=>{try{const r=await A.downloadFile({url:b.dataset.downloadUrl,filename:b.dataset.downloadName,mime:b.dataset.downloadMime});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)}catch(e){alert('Unable to open file: '+e.message)}});
  document.querySelectorAll('[data-open-url]').forEach(b=>b.onclick=()=>showEmbeddedWeb(b.dataset.openUrl,'Link'));
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
    state.preferredHomepage=settings.default_start_page==='course_dashboard'?'dashboard':'recent';
    if(state.preferredHomepage==='dashboard'&&!state.courseDashboardEnabled)state.preferredHomepage='recent';
    state.homeTab=state.preferredHomepage;
  }catch(_e){
    state.mobileMe={};state.courseDashboardEnabled=false;state.preferredHomepage='recent';state.homeTab='recent';
  }
  state.screen='app';render();await loadTab();
}
async function hydrateCourseImages(root=document){
  const els=root.querySelectorAll?.('[data-course-image-url]')||[];
  await Promise.all([...els].map(async el=>{
    const url=el.getAttribute('data-course-image-url');if(!url)return;
    try{const data=await A.fetchImage(url);if(data){el.src=data;el.style.display='block';el.nextElementSibling?.style.setProperty('display','none')}}catch{}
  }));
}
async function loadCourseSubmenu(){
 const c=document.getElementById('courseSubList');if(!c)return;
 try{
   const page=state.drawerPage;
   const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('No logged-in user ID.');
   if(page==='groups'){
     const x=await A.api({path:`users/${uid}/groups`,params:{limit:100}});const arr=x.group||x.groups||[];window.__schoologyGroups=arr;
     c.innerHTML=arr.length?arr.map((g,i)=>`<button class="courseSubItem" data-group-sub="${i}"><span class="courseImage"><span class="courseImageFallback">${esc(String(g.name||g.title||'G').charAt(0))}</span></span><span class="courseText"><b>${esc(g.name||g.title||'Group')}</b><small>${esc(g.description||g.group_description||'')}</small></span>${g.admin?'<span class="courseAdmin">★</span>':''}</button>`).join(''):'<div class="drawerEmpty">No groups found.</div>';
     document.querySelectorAll('[data-group-sub]').forEach(b=>b.onclick=()=>{const g=window.__schoologyGroups[+b.dataset.groupSub];closeDrawerThen(()=>{state.tab='home';state.currentGroup=null;state.toolbarTitle=g?.name||'Group';render();showGroup(g)});});
     return;
   }
   const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});const arr=x.section||x.sections||[];window.__schoologyCourses=arr;
   c.innerHTML=arr.length?arr.map((s,i)=>{const courseTitle=s.course_title||s.courseTitle||s.title||s.section_title||'Course';const sectionTitle=s.section_title||s.sectionTitle||'';const image=normalizeImageUrl(s.course_theme||s.courseTheme||s.image||s.course_image||'');return `<button class="courseSubItem" data-course-sub="${i}"><span class="courseImage">${image?`<img data-course-image-url="${esc(image)}" alt="" style="display:none">`:''}<span class="courseImageFallback">${esc(courseTitle.charAt(0))}</span></span><span class="courseText"><b>${esc(courseTitle)}</b><small>${esc(sectionTitle)}</small></span></button>`}).join(''):'<div class="drawerEmpty">No courses found.</div>';
   document.querySelectorAll('[data-course-sub]').forEach(b=>b.onclick=()=>{const course=window.__schoologyCourses[+b.dataset.courseSub];closeDrawerThen(()=>{state.drawerPage=null;state.tab=page==='grades'?'grades':'courses';state.courseView='course';state.toolbarTitle=sectionTitleOf(course)||courseTitleOf(course);state.screen='app';render();showCourse(course,page==='grades'?'grades':'materials')});});
   await hydrateCourseImages(c);
 }catch(e){c.innerHTML=`<div class="drawerError">${esc(e.message)}</div>`}
}
function showGradeSection(course){
 state.selectedCourse=course;
 const c=document.getElementById('content');if(!c)return;
 const title=courseTitleOf(course),section=sectionTitleOf(course),sid=course?.id||course?.section_id||course?.sectionId;
 c.innerHTML=`<section class="gradesNativePage"><div class="gradesHeader"><h1>${esc(section||title)}</h1><p>${esc(title)}</p></div><div id="gradesContent" class="gradesContent"><div class="loading">Loading…</div></div></section>`;
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
function courseTitleOf(course){return course?.course_title||course?.courseTitle||course?.title||course?.section_title||'Course'}
function sectionTitleOf(course){return course?.section_title||course?.sectionTitle||''}
function syncToolbar(){
  const header=document.querySelector('.toolbar');if(!header)return;
  const needs=!!(state.courseView||state.folderStack.length||state.assignmentView||state.embeddedTitle||state.currentGroup||state.profileUser||state.composeMessage||state.message);
  const existing=header.querySelector('#toolbarBack');
  const menu=header.querySelector('#menuButton');
  if(needs&&!existing){
    const b=document.createElement('button');b.id='toolbarBack';b.className='iconButton';b.setAttribute('aria-label','Back');b.textContent='‹';
    b.addEventListener('click',navigateBack);header.insertBefore(b,header.firstChild);if(menu)menu.remove();
  }
  if(!needs&&!existing&&menu===null){
    const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.textContent='☰';
    header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open')});
  }
  if(!needs&&existing){
    existing.remove();
    const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.textContent='☰';
    header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open')});
  }
  const title=header.querySelector('.toolbarTitle');if(title)title.textContent=state.toolbarTitle||'Home';
}
function navigateBack(){
  if(state.composeMessage){state.composeMessage=false;state.toolbarTitle='Messages';state.tab='messages';state.message=null;state.messageThread=null;render();loadTab();return}
  if(state.assignmentView){
    state.assignmentView=null;state.embeddedTitle=null;state.profileUser=null;
    syncToolbar();
    if(state.selectedCourse){showCourse(state.selectedCourse,state.courseTab||'materials');}
    else {state.toolbarTitle='Home';state.courseView=null;render();loadTab();}
    return;
  }
  if(state.embeddedTitle){
    state.embeddedTitle=null;
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
function showCourse(course,activeTab='materials'){
 const c=document.getElementById('content');if(!c)return;
 if(!course){loadTab();return}
 state.selectedCourse=course;state.courseView='course';state.courseTab=activeTab;state.folderStack=[];state.currentFolderId=0;state.assignmentView=null;state.embeddedTitle=null;
 state.toolbarTitle=sectionTitleOf(course)||courseTitleOf(course);syncToolbar();
 const sid=course.id||course.section_id||course.sectionId;
 const title=courseTitleOf(course), section=sectionTitleOf(course);
 const image=normalizeImageUrl(course.course_theme||course.courseTheme||course.image||course.course_image||'');
 const tabs=[['materials','Materials'],['updates','Updates'],['upcoming','Upcoming'],['grades','Grades'],['courseapp','Course App']];
 c.innerHTML=`<section class="sectionProfilePage">
   <div class="sectionProfileTabs">${tabs.map(([id,label])=>`<button class="sectionProfileTab ${activeTab===id?'active':''}" data-course-tab="${id}">${label}</button>`).join('')}</div>
   <div class="sectionProfileHeader">
     <img class="sectionProfileImage" data-course-image-url="${esc(image)}" style="display:none" alt="">
     <span class="sectionProfileFallback">${esc(title.charAt(0))}</span>
     <div class="sectionProfileText"><div class="sectionProfileTitle">${esc(section||title)}</div><div class="sectionProfileSubtitle">${esc(title)}</div></div>
   </div>
   <div class="sectionProfileRule"></div>
   <div id="sectionProfileContent" class="sectionProfileContent tabSlidePage"><div class="loading">Loading…</div></div>
 </section>`;
 animateTab(document.getElementById('sectionProfileContent'),state.courseTabDirection||'forward');
 hydrateCourseImages(c);
 document.querySelectorAll('[data-course-tab]').forEach(b=>b.onclick=()=>{
   const order=['materials','updates','upcoming','grades','courseapp']; const oi=order.indexOf(activeTab), ni=order.indexOf(b.dataset.courseTab); state.courseTabDirection=ni>=oi?'forward':'back';
   state.toolbarTitle=b.textContent||'Course';showCourse(course,b.dataset.courseTab);
 });
 loadCourseTab(course,activeTab).catch(e=>{
   const el=document.getElementById('sectionProfileContent');
   if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`;
 });
}
async function showAssignment(sectionId,assignmentId){
  const c=document.getElementById('content'); if(!c)return;
  state.toolbarTitle='Assignment'; state.screen='app'; state.assignmentView={sectionId,assignmentId}; state.courseView='course'; syncToolbar();
  c.innerHTML=`<section class="assignmentPage"><div class="assignmentLoading">Loading assignment…</div></section>`;
  try{
    const a=await A.api({path:`sections/${sectionId}/assignments/${assignmentId}`,params:{richtext:1,with_attachments:'TRUE'}});
    const at=a.assignment||a;
    const html=typeof at.description==='string'?at.description:'';
    const attachments=at.attachments||at.attachment||{};
    const canSubmit=at.allow_dropbox===1||at.allow_dropbox==='1'||at.allowDropbox===true||at.allow_dropbox===true;
    const canDiscuss=at.allow_discussion===1||at.allow_discussion==='1'||at.allowDiscussion===true;
    c.innerHTML=`<section class="assignmentAndroidPage">
      <div class="assignmentTabs">
        <button class="assignmentTab active" data-assignment-tab="description">Description</button>
        ${canDiscuss?'<button class="assignmentTab" data-assignment-tab="comments">Comments</button>':''}
        ${canSubmit?'<button class="assignmentTab" data-assignment-tab="submit">Submit</button>':''}
      </div>
      <div class="assignmentInfoHeader"><h1>${esc(at.title||'Assignment')}</h1><div>${esc(at.due||'')}</div></div>
      <div id="assignmentTabContent" class="assignmentTabContent"></div>
    </section>`;
    const renderDescription=()=>{
      const el=document.getElementById('assignmentTabContent');if(!el)return;
      el.innerHTML=`<div class="assignmentDescription">${html||'<span class="muted">No description.</span>'}</div>${renderAttachments(attachments)}<div class="assignmentMeta">${at.max_points!=null?`<span>${esc(at.max_points)} points</span>`:''}</div>`;
    };
    const select=(id)=>{
      document.querySelectorAll('.assignmentTab').forEach(x=>x.classList.toggle('active',x.dataset.assignmentTab===id));
      if(id==='description')renderDescription();
      else if(id==='comments')openAssignmentComments(sectionId,assignmentId,at);
      else if(id==='submit')openSubmissionComposer(sectionId,assignmentId,at);
    };
    document.querySelectorAll('[data-assignment-tab]').forEach(b=>b.onclick=()=>select(b.dataset.assignmentTab));
    renderDescription();
  }catch(e){
    c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`;
  }
}
function renderAttachments(a){
  if(!a)return '';
  const out=[];
  const add=(url,type,title)=>{
    if(!url)return;
    const u=normalizeImageUrl(url);
    if(type==='image'||/\.(png|jpe?g|gif|webp)(\?|$)/i.test(u)){
      out.push(`<img class="activityMediaImage authenticatedMediaImage" data-media-image-url="${esc(u)}" alt="${esc(title||'')}" loading="lazy" style="display:none">`);
    } else out.push(`<button class="activityAttachment" data-open-url="${esc(u)}">${esc(title||u)}</button>`);
  };
  const walk=(v)=>{
    if(!v)return;
    if(Array.isArray(v)){v.forEach(walk);return}
    if(typeof v!=='object')return;
    const type=String(v.type||v.attachmentType||'').toLowerCase();
    const title=v.title||v.fileTitle||v.fileName||v.linkTitle||v.videoTitle||'Attachment';
    add(v.thumbnail||v.fileThumbnailURL||v.videoThumbnailURL,type==='video'?'image':type,title);
    add(v.url||v.fileDownloadURL||v.fileConvertedDownloadURL||v.linkURL||v.videoURL,type,title);
    for(const k of ['attachment','file','link','video','embed','files','links','videos'])if(v[k])walk(v[k]);
  };
  walk(a);
  return out.length?`<div class="activityMedia">${out.join('')}</div>`:'';
}
async function hydrateMediaImages(root=document){
  const els=root.querySelectorAll?.('[data-media-image-url]')||[];
  await Promise.all([...els].map(async el=>{
    const u=el.getAttribute('data-media-image-url');try{const data=await A.fetchImage(u);if(data){el.src=data;el.style.display='block';if(el.nextElementSibling)el.nextElementSibling.style.display='none'}}catch{}
  }));
  root.querySelectorAll?.('[data-open-url]')?.forEach(b=>b.onclick=()=>showEmbeddedWeb(b.dataset.openUrl,'Attachment'));
}
async function openAssignmentComments(sectionId,assignmentId,assignment){
  const c=document.getElementById('assignmentTabContent')||document.getElementById('content');if(!c)return;
  c.innerHTML='<div class="commentsPage"><div class="loading">Loading comments…</div></div>';
  try{
    const x=await A.api({path:`sections/${sectionId}/assignments/${assignmentId}/comments`,params:{limit:50}});
    const arr=x.comment||x.comments||[];
    c.innerHTML=`<div class="commentsPage"><div class="commentsList">${arr.map(cm=>`<article class="commentRow"><div class="commentAvatar">${esc(String(cm.display_name||cm.user_name||'U').charAt(0))}</div><div><b>${esc(cm.display_name||cm.user_name||'User')}</b><small>${esc(cm.created||cm.timestamp||'')}</small><div>${cm.body||cm.comment||''}</div></div></article>`).join('')||'<div class="empty">No comments.</div>'}</div>${assignment.allow_discussion?'<div class="commentComposer"><textarea id="commentText" placeholder="Write a comment…"></textarea><button id="postComment" class="androidPrimary">Post</button></div>':''}</div>`;
    document.getElementById('postComment')?.addEventListener('click',async()=>{
      const text=document.getElementById('commentText')?.value.trim();if(!text)return;
      try{
        await A.api({path:`sections/${sectionId}/assignments/${assignmentId}/comments`,method:'POST',params:{body:text}});
        await openAssignmentComments(sectionId,assignmentId,assignment);
      }catch(e){alert('Unable to post comment: '+e.message)}
    });
  }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load comments.</b><br>${esc(e.message)}</div>`}
}
async function openSubmissionComposer(sectionId,assignmentId,assignment){
  const c=document.getElementById('assignmentTabContent')||document.getElementById('content');if(!c)return;
  c.innerHTML=`<section class="submissionPage"><h2>Submit Assignment</h2><p>${esc(assignment.title||'Assignment')}</p><div id="submissionFile">No file selected.</div><button id="chooseSubmissionFile" class="androidPrimary">Choose File</button><button id="sendSubmission" class="androidPrimary" disabled>Submit</button><div id="submissionStatus"></div></section>`;
  let filePath=null;
  document.getElementById('chooseSubmissionFile')?.addEventListener('click',async()=>{
    filePath=await A.pickFile();const el=document.getElementById('submissionFile');if(el)el.textContent=filePath?filePath.split(/[\\\\/]/).pop():'No file selected.';document.getElementById('sendSubmission').disabled=!filePath;
  });
  document.getElementById('sendSubmission')?.addEventListener('click',async()=>{
    if(!filePath)return;
    const st=document.getElementById('submissionStatus');if(st)st.textContent='Uploading…';
    try{await A.submitAssignmentFile({sectionId,assignmentId,filePath});if(st)st.textContent='Assignment submitted.';document.getElementById('sendSubmission').disabled=true}
    catch(e){if(st)st.textContent='Submission failed: '+e.message}
  });
}
async function loadFolder(course,folderId,push=true,title='Materials'){
  const el=document.getElementById('sectionProfileContent');if(!el)return;
  const sid=course.id||course.section_id||course.sectionId;
  if(push){
    state.folderStack.push({id:state.currentFolderId||0,title:'Previous folder'});
  }
  state.currentFolderId=folderId||0;
  state.courseTab='materials';
  syncToolbar();
  const x=await A.api({path:`courses/${sid}/folder/${folderId||0}`,params:{}});
  const items=x['folder-item']||x.folder_item||x.folderItems||x.items||[];
  const parent=folderId?'<button class="materialBackRow" id="materialBack"><span class="materialIcon">‹</span><span><b>Back to previous folder</b></span></button>':'';
  const rows=items.map((f,i)=>{
    const type=String(f.type||'');
    const icon=type==='folder'?'📁':type==='assignment'?'📝':type==='discussion'?'💬':type==='assessment'||type==='assessment_v2'||type==='managed_assessment'?'▣':type==='file'?'📄':type==='link'?'🔗':'▤';
    return `<button class="materialRow" data-material-index="${i}"><span class="materialIcon">${icon}</span><span><b>${esc(f.title||'Untitled')}</b><small>${esc(type)}</small></span><span>›</span></button>`;
  }).join('');
  el.innerHTML=parent+(items.length?`<div class="materialList">${rows}</div>`:'<div class="empty"><h2>This folder is empty</h2></div>');
  window.__schoologyFolderItems=items;
  document.getElementById('materialBack')?.addEventListener('click',()=>navigateBack());
  document.querySelectorAll('[data-material-index]').forEach(b=>b.onclick=()=>{
    const f=window.__schoologyFolderItems[+b.dataset.materialIndex];
    if(String(f.type)==='folder'){loadFolder(course,f.id,true,f.title||'Folder');return}
    if(String(f.type)==='assignment'){showAssignment(sid,f.id);return}
    if(['assessment','assessment_v2','managed_assessment','quiz'].includes(String(f.type))){(async()=>{try{await A.prepareWebSession();showEmbeddedWeb(`https://app.schoology.com/assignment/${f.id}`,f.title||'Assessment')}catch(e){alert(e.message)}})();return}
    (async()=>{try{
      let data=f; let fileUrl=f.download_path||f.downloadPath||f.converted_download_path||f.convertedDownloadPath||f.file_url||f.fileUrl||f.download_url||f.downloadUrl||f.location||f.url; if(!fileUrl){const aa=f.attachments||f.attachment||{};const ff=aa.files?.file||aa.files||aa.file||[];const af=Array.isArray(ff)?ff[0]:ff;fileUrl=af?.converted_download_path||af?.convertedDownloadPath||af?.download_path||af?.downloadPath||af?.resolveDownloadUrl||af?.url||'';if(af)data={...f,...af};}
      if(String(f.type)==='document'){
        const d=await A.api({path:`sections/${sid}/documents/${f.id}`,params:{}}); data=d?.document||d; const a=data.attachments||data.attachment||{}; const files=a.files?.file||a.files||a.file||[]; const first=Array.isArray(files)?files[0]:files; fileUrl=first?.converted_download_path||first?.convertedDownloadPath||first?.download_path||first?.downloadPath||first?.url||fileUrl;
      }
      if(!fileUrl){ if(data.web_url||data.webUrl){await A.prepareWebSession();showEmbeddedWeb(data.web_url||data.webUrl,data.title||f.title||'Document');return} throw new Error('Schoology did not provide a downloadable file URL.'); }
      const r=await A.downloadFile({url:fileUrl,filename:data.filename||data.fileName||data.title||f.title||'Schoology file',mime:data.filemime||data.fileMIME||data.converted_filemime||data.convertedFileMime||'application/octet-stream'});const err=await A.openDownloadedFile({path:r.path});if(err)alert(err)
    }catch(e){alert('Unable to open file: '+e.message)}})();return
  });
}
function showEmbeddedWeb(url,title){
  const c=document.getElementById('content');if(!c)return;
  c.classList.remove('webContentHost');
  c.classList.add('embeddedContentActive');
  state.toolbarTitle=title||'Schoology';state.embeddedTitle=title||'Schoology';syncToolbar();
  c.innerHTML=`<section class="embeddedPage"><webview id="schoologyWebview" src="${esc(url)}" allowpopups></webview></section>`;
  const w=document.getElementById('schoologyWebview'); if(!w)return;
  w.addEventListener('new-window',e=>{e.preventDefault();try{w.src=e.url}catch{}});
  w.addEventListener('will-navigate',e=>{const u=String(e.url||'');if(/^schoology:\/\/course(?:s)?\//i.test(u)){e.preventDefault();const m=u.match(/^schoology:\/\/course(?:s)?\/(\d+)/i);if(m){A.api({path:`sections/${m[1]}`,params:{}}).then(x=>{state.embeddedTitle=null;showCourse(x?.section||x)}).catch(()=>{})}}});
  w.addEventListener('did-fail-load',e=>{if(e.errorCode&&e.errorCode!==-3)console.warn('Schoology embedded page failed:',e.errorDescription)});
}
async function loadCourseApps(course){
  const el=document.getElementById('sectionProfileContent');if(!el)return;
  const sid=course.id||course.section_id||course.sectionId;
  const x=await A.api({path:`v2/sections/${sid}/applications`,params:{}});
  const apps=x?.['@extra']||x.extra||x.data?.['@extra']||x.data?.extra||[];
  el.innerHTML=apps.length?`<div class="courseAppList">${apps.map((a,i)=>{
    const title=a.title||a.name||'Course App', logo=normalizeImageUrl(a.logoUrl||a.logo_url||'');
    return `<button class="courseAppRow" data-app-index="${i}">
      <span class="courseAppIcon">${logo?`<img data-course-image-url="${esc(logo)}" alt="" style="display:none">`:''}<span>${esc(title.charAt(0))}</span></span>
      <span><b>${esc(title)}</b></span><span>›</span>
    </button>`;
  }).join('')}</div>`:'<div class="empty"><h2>No course apps</h2></div>';
  window.__schoologyCourseApps=apps;
  document.querySelectorAll('[data-app-index]').forEach(b=>b.onclick=async()=>{
    const a=window.__schoologyCourseApps[+b.dataset.appIndex];
    const launch=a?.['@links']?.launch||a?.links?.launch||a?.['@links']?.['launch']||a?.links?.['launch'];
    const href=launch?.['@id']||launch?.id||launch?.href;
    if(!href){el.innerHTML='<div class="error apiError">This course app did not provide a launch URL.</div>';return}
    try{
      await A.prepareWebSession();
      const launch=await A.launchCourseApp(href);
      const url=launch?.url||launch?.launchTokenUrl||launch?.data?.url||launch?.data?.launchTokenUrl;
      if(!url)throw new Error('Schoology did not return a course-app launch URL.');
      showEmbeddedWeb(url,a.title||'Course App');
    }catch(e){el.innerHTML=`<div class="error apiError"><b>Schoology could not launch this course app.</b><br>${esc(e.message)}</div>`}
  });
  await hydrateCourseImages(el);
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
   const x=await A.api({path:`sections/${sid}/updates`,params:{start:0,limit:20}});
   const arr=x.update||x.updates||[];
   el.innerHTML=arr.length?arr.map(u=>`<article class="sectionUpdate"><b>${esc(u.title||u.body||u.message||'Update')}</b><small>${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</small></article>`).join(''):'<div class="empty"><h2>No updates</h2></div>';
   return;
 }
 if(tab==='upcoming'){
   const x=await A.api({path:`sections/${sid}/events`,params:{start_date:formatApiDate(new Date()),start:0,limit:20}});
   let arr=x.event||x.events||[];
   arr=arr.filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));
   el.innerHTML=renderUpcoming(arr);
   return;
 }
 if(tab==='grades'){
   await loadSectionGrades(course);
   return;
 }
 if(tab==='courseapp'){
   await loadCourseApps(course);
   return;
 }
}

function animateTab(el,direction='forward'){
 if(!el)return;
 el.classList.remove('tabSlidePage','forward','back');
 void el.offsetWidth;
 el.classList.add('tabSlidePage',direction==='back'?'back':'forward');
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
 el.querySelectorAll('[data-grade-assignment]').forEach(b=>b.onclick=()=>showAssignment(sid,b.dataset.gradeAssignment));
 el.querySelectorAll('[data-grade-toggle]').forEach(b=>b.onclick=()=>{
   const target=document.getElementById(b.dataset.gradeToggle);if(!target)return;
   const parent=b.closest('.gradePeriod,.gradeCategory');if(!parent)return;
   const collapsed=parent.classList.toggle('collapsed');b.setAttribute('aria-expanded',String(!collapsed));
 });
}
function renderOverallGrade(sec){
 const final=(sec.final_grade||sec.finalGrade||[])[0]||{};
 const val=final.grade||final.grade_override||final.calculated_grade||'—';
 return `<div class="gradeOverallCard"><div class="label">Overall Grade</div><div class="value">${esc(val)}</div></div>`;
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
       return `<button class="gradeAssignmentRow" data-grade-assignment="${esc(a.id||'')}"><span class="gradeAssignmentName">${esc(a.title||a.assignment_title||'Assignment')}</span><span class="gradeValue">${esc(value)}</span></button>`;
      }).join('')||'<div class="empty">No graded items.</div>'}
      </div>
    </div>`;
   }).join('')}
   </div>
  </section>`;
 }).join('');
}
function renderGrades(rows){return renderGradePeriods(rows,{grading_period:[]},{grading_category:[]});}

async function showGroup(group,activeTab='updates'){
  if(!group)return;
  state.currentGroup=group;state.groupTab=activeTab;state.courseView=null;state.selectedCourse=null;state.toolbarTitle=group.name||group.title||'Group';syncToolbar();
  const c=document.getElementById('content');if(!c)return;
  const gid=group.id||group.group_id;
  c.innerHTML=`<section class="groupProfilePage"><div class="groupTabs">${['updates','upcoming','discussions','albums','resources'].map((id)=>`<button class="groupTab ${activeTab===id?'active':''}" data-group-tab="${id}">${({updates:'Updates',upcoming:'Upcoming',discussions:'Discussions',albums:'Albums',resources:'Resources'})[id]}</button>`).join('')}</div><div class="groupHeader"><div class="groupHero">${esc(String(group.name||group.title||'G').charAt(0))}</div><div><h1>${esc(group.name||group.title||'Group')}</h1><p>${esc(group.school_name||'')}</p></div></div><div id="groupTabContent"></div></section>`;
  const gc=document.getElementById('groupTabContent');
  const load=async(tab)=>{
    state.groupTab=tab;document.querySelectorAll('[data-group-tab]').forEach(b=>b.classList.toggle('active',b.dataset.groupTab===tab));
    try{
      if(tab==='updates'){const x=await A.api({path:`groups/${gid}/updates`,params:{start:0,limit:20}});const a=x.update||x.updates||[];gc.innerHTML=a.length?a.map(u=>`<article class="activityCard"><b>${esc(u.title||u.display_name||'Update')}</b><div class="activityBody">${u.body||u.message||''}</div><small>${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</small></article>`).join(''):'<div class="empty">No updates.</div>';}
      else if(tab==='upcoming'){const x=await A.api({path:`groups/${gid}/events`,params:{start:formatApiDate(new Date()),limit:20}});const a=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));gc.innerHTML=renderUpcoming(a);}
      else if(tab==='discussions'){const x=await A.api({path:`groups/${gid}/discussions`,params:{limit:50}});const a=x.discussion||x.discussions||[];gc.innerHTML=a.length?a.map(d=>`<button class="groupRow"><b>${esc(d.title||'Discussion')}</b><small>${esc(d.created||d.timestamp||'')}</small></button>`).join(''):'<div class="empty">No discussions.</div>';}
      else if(tab==='albums'){const x=await A.api({path:`groups/${gid}/albums`,params:{limit:50}});const a=x.album||x.albums||[];gc.innerHTML=a.length?a.map(d=>`<button class="groupRow"><b>${esc(d.title||d.name||'Album')}</b></button>`).join(''):'<div class="empty">No albums.</div>';}
      else {const x=await A.api({path:`groups/${gid}/resources`,params:{limit:50}});const a=x.resource||x.resources||x.collection||[];gc.innerHTML=a.length?a.map(d=>`<button class="groupRow"><b>${esc(d.title||d.name||'Resource')}</b></button>`).join(''):'<div class="empty">No resources.</div>';}
    }catch(e){gc.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
  };
  document.querySelectorAll('[data-group-tab]').forEach(b=>b.onclick=()=>load(b.dataset.groupTab));
  await load(activeTab);
}
function showOfflineStorage(){
 state.toolbarTitle='Offline Storage Settings';
 const c=document.getElementById('content');if(!c)return;
 c.innerHTML=`<section class="settingsPage offlinePage"><div class="settingsGroup"><h2>Offline Storage</h2><div class="settingRow"><span><b>Downloaded Materials</b><small>Manage Schoology materials saved for offline use.</small></span><span>›</span></div><div class="settingRow"><span><b>Storage Used</b><small>Local offline files are managed by the Schoology app.</small></span></div></div><div class="settingsGroup"><button id="offlineClear" class="settingRow settingButton"><span><b>Clear Offline Storage</b></span><span>›</span></button></div></section>`;
 document.getElementById('offlineClear')?.addEventListener('click',()=>{if(confirm('Clear downloaded Schoology materials?')){alert('Offline storage cleared.');}});
}
async function loadMessageThread(m){
  try{
    const id=m?.id||m?.message_id||m?.messageId; if(!id)throw new Error('Message ID is missing.');
    const folder=state.messageFolder||'inbox'; const x=await A.api({path:`messages/${state.messageFolder||'inbox'}/${id}`,params:{with_attachments:'TRUE',keep_unread:'TRUE'}});
    const raw=x?.message||x?.messages||x?.data?.message||x?.data?.messages||[]; const msgs=Array.isArray(raw)?raw:(raw?.message||raw?.messages||[]); const users={};
    const ids=[...new Set(msgs.map(v=>Number(v.author_id||v.authorId)).filter(Boolean))];
    await Promise.all(ids.map(async uid=>{try{const u=await A.api({path:`users/${uid}`,params:{}});users[uid]=u?.user||u}catch{}}));
    state.messageThread={messages:msgs,users}; render(); await hydrateMediaImages(document.querySelector('.messageDetail'));
    if(folder==='inbox')try{await A.api({path:`messages/inbox/${id}`,method:'PUT',params:{message_status:'read'}})}catch{}
  }catch(e){state.messageThread={messages:[],users:{},error:e.message};render();const el=document.querySelector('.messageDetail');if(el)el.innerHTML=`<div class="error apiError">Unable to load this message.<br>${esc(e.message)}</div>`}
}

function showComposeMessage(){
  state.composeMessage=true;state.message=null;state.messageThread=null;state.toolbarTitle='New Message';syncToolbar();
  const c=document.getElementById('content');if(!c)return;
  c.classList.remove('webContentHost');
  c.innerHTML=`<section class="composeMessagePage"><div class="composeField recipientField"><label>To</label><input id="composeToSearch" autocomplete="off" placeholder="Search for a recipient"><div id="recipientSuggestions" class="recipientSuggestions"></div><div id="recipientChips" class="recipientChips"></div><input id="composeTo" type="hidden"></div><div class="composeField"><label>Subject</label><input id="composeSubject" placeholder="Subject"></div><div class="composeField composeBody"><label>Message</label><textarea id="composeBody" placeholder="Write a message…"></textarea></div><div class="composeActions"><button id="sendMessage" class="androidPrimary">Send</button></div><div id="composeStatus"></div></section>`;
  const selected=[]; const search=document.getElementById('composeToSearch'), suggestions=document.getElementById('recipientSuggestions'), chips=document.getElementById('recipientChips');
  const renderRecipients=()=>{chips.innerHTML=selected.map((u,i)=>`<span class="recipientChip">${esc(u.name)} <button type="button" data-remove-recipient="${i}">×</button></span>`).join('');document.getElementById('composeTo').value=selected.map(u=>u.id).join(',');chips.querySelectorAll('[data-remove-recipient]').forEach(b=>b.onclick=()=>{selected.splice(+b.dataset.removeRecipient,1);renderRecipients()})};
  let searchTimer=null; search?.addEventListener('input',()=>{clearTimeout(searchTimer);const q=search.value.trim();if(q.length<2){suggestions.innerHTML='';return}searchTimer=setTimeout(async()=>{try{const x=await A.api({path:'messages/recipients',params:{name:q,limit:10}});const arr=x.user||x.users||x.recipient||x.recipients||[];suggestions.innerHTML=arr.map(u=>`<button type="button" class="recipientSuggestion" data-recipient-id="${esc(u.id)}" data-recipient-name="${esc(u.name_display||u.nameDisplay||u.display_name||u.name||'User')}">${esc(u.name_display||u.nameDisplay||u.display_name||u.name||'User')}</button>`).join('')||'<div class="recipientNone">No recipients found.</div>';suggestions.querySelectorAll('[data-recipient-id]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.recipientId),name=b.dataset.recipientName;if(id&&!selected.some(u=>u.id===id)){selected.push({id,name});renderRecipients()}search.value='';suggestions.innerHTML=''})}catch(e){suggestions.innerHTML=`<div class="recipientNone">${esc(e.message)}</div>`}},250)});
  document.getElementById('sendMessage')?.addEventListener('click',async()=>{
    const to=document.getElementById('composeTo')?.value.trim(),subject=document.getElementById('composeSubject')?.value.trim(),message=document.getElementById('composeBody')?.value.trim();
    const st=document.getElementById('composeStatus'); if(!to||!message){if(st)st.textContent='Enter a recipient and message.';return}
    const ids=selected.map(u=>u.id).join(',');
    try{if(st)st.textContent='Sending…';await A.api({path:'messages',method:'POST',params:{recipient_ids:ids,subject:subject||'',message},signBody:true});if(st)st.textContent='Message sent.';setTimeout(()=>{state.composeMessage=false;state.toolbarTitle='Messages';state.messageTab='sent';render();loadTab()},350)}catch(e){if(st)st.textContent='Unable to send message: '+e.message}
  });
}
async function loadTab(){
 const c=document.getElementById('content');if(!c)return;
 c.innerHTML='<div class="loading">Loading…</div>';
 const uid=state.auth?.userId||state.auth?.user?.id;
 try{
  if(state.tab==='home'){
    const tabs=[`<button data-home-tab="recent" class="homeTab ${state.homeTab==='recent'?'active':''}">Recent Activity</button>`,state.courseDashboardEnabled?`<button data-home-tab="dashboard" class="homeTab ${state.homeTab==='dashboard'?'active':''}">Course Dashboard</button>`:'',`<button data-home-tab="upcoming" class="homeTab ${state.homeTab==='upcoming'?'active':''}">Upcoming</button>`].join('');
    c.innerHTML=`<div class="homeTabViewport"><div class="homeTabs">${tabs}</div><section id="homeTabContent" class="activity"></section></div>`;
    document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{const order=['recent','dashboard','upcoming'];const oldIndex=order.indexOf(state.homeTab),newIndex=order.indexOf(b.dataset.homeTab);state.homeTabDirection=newIndex>=oldIndex?'forward':'back';state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
    await loadHomeTab();
  }else if(state.tab==='courses'){state.toolbarTitle='Courses';
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});const arr=x.section||x.sections||[];window.__schoologyCourses=arr;
    c.innerHTML=`<section class="androidSectionList"><div class="sectionListRows">${arr.map((s,i)=>{
      const courseTitle=s.course_title||s.courseTitle||s.title||s.section_title||'Course';
      const sectionTitle=s.section_title||s.sectionTitle||'';
      const image=normalizeImageUrl(s.course_theme||s.courseTheme||s.image||s.course_image||'');
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
    const u=state.profileUser?.user||state.profileUser;
    if(!state.profileUser){
      const ur=await A.api({path:`users/${puid}`,params:{}});state.profileUser=ur?.user||ur;
    }
    const user=state.profileUser;
    state.toolbarTitle='Profile';
    const image=normalizeImageUrl(user.picture_url||user.pictureUrl||user.picture||user.photo_url||'');
    c.innerHTML=`<section class="profileAndroidPage">
      <div class="profileTabs">
        <button class="profileTab ${state.profileTab==='updates'?'active':''}" data-profile-tab="updates">Updates</button>
        <button class="profileTab ${state.profileTab==='info'?'active':''}" data-profile-tab="info">Info</button>
        <button class="profileTab ${state.profileTab==='badges'?'active':''}" data-profile-tab="badges">Badges</button>
      </div>
      <div class="profileHeader"><img data-media-image-url="${esc(image)}" class="profileHeaderImage" style="display:none"><span class="profileHeaderFallback">${esc(String(user.name_display||user.name||'U').charAt(0))}</span><div><h1>${esc(user.name_display||user.name||'Profile')}</h1><p>${esc(user.school_name||user.school?.school_name||'')}</p></div></div>
      <div id="profileTabContent"></div>
    </section>`;
    const pc=document.getElementById('profileTabContent');
    const loadProfileTab=async(tab)=>{
      state.profileTab=tab;document.querySelectorAll('[data-profile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.profileTab===tab));
      if(tab==='info'){
        const rows=[['Email',user.primary_email||user.primaryEmail||''],['Username',user.username||''],['First Name',user.first_name||user.firstName||''],['Last Name',user.last_name||user.lastName||'']];
        pc.innerHTML=`<div class="profileInfoList">${rows.filter(r=>r[1]).map(r=>`<div class="profileInfoRow"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')||'<div class="empty">No profile information available.</div>'}</div>`;
      }else if(tab==='badges'){
        try{const x=await A.api({path:`users/${puid}/badges`,params:{}});const arr=x.badge||x.badges||x.items||[];pc.innerHTML=arr.length?`<div class="badgeGrid">${arr.map(b=>`<article class="badgeCard"><b>${esc(b.name||b.title||'Badge')}</b><small>${esc(b.description||'')}</small></article>`).join('')}</div>`:'<div class="empty">No badges.</div>'}catch(e){pc.innerHTML='<div class="empty">No badges.</div>'}
      }else{
        try{const x=await A.api({path:`users/${puid}/updates`,params:{start:0,limit:20}});const arr=x.update||x.updates||[];pc.innerHTML=arr.length?arr.map(u=>`<article class="activityCard"><b>${esc(user.name_display||'')}</b><div class="activityBody">${u.body||u.message||''}</div><small>${esc(formatSchoologyDate(u.created||u.timestamp||u.last_updated||u.lastUpdated||''))}</small></article>`).join(''):'<div class="empty">No updates.</div>'}catch(e){pc.innerHTML='<div class="empty">No updates.</div>'}
      }
    };
    document.querySelectorAll('[data-profile-tab]').forEach(b=>b.onclick=()=>loadProfileTab(b.dataset.profileTab));
    await loadProfileTab(state.profileTab);await hydrateMediaImages(c);
  }else if(state.tab==='groups'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/groups`,params:{limit:100}});const arr=x.group||x.groups||[];
    window.__schoologyGroups=arr;
    c.innerHTML=`<section class="groupsAndroidPage"><h1>Groups</h1><div class="groupList">${arr.map((g,i)=>`<button class="groupListItem" data-group-index="${i}"><span class="groupImage"><span>${esc(String(g.name||g.title||'G').charAt(0))}</span></span><span><b>${esc(g.name||g.title||'Group')}</b><small>${esc(g.description||g.group_description||'')}</small></span>${g.admin?'<span>★</span>':''}</button>`).join('')||'<div class="empty">No groups found.</div>'}</div></section>`;
    document.querySelectorAll('[data-group-index]').forEach(b=>b.onclick=()=>showGroup(window.__schoologyGroups[+b.dataset.groupIndex]));
  }else if(state.tab==='calendar'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/events`,params:{limit:50}});const arr=x.event||x.events||[];
    c.innerHTML=`<section class="page"><h1>Calendar</h1>${arr.length?arr.map(e=>`<article class="eventCard"><b>${esc(e.title||'Event')}</b><small>${esc(e.start||e.start_date||'')}</small></article>`).join(''):'<div class="empty"><h2>No upcoming events</h2></div>'}</section>`;
  }else if(state.tab==='grades'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/grades`,params:{}});const ss=x.section||x.sections||[];
    c.innerHTML=`<section class="page"><h1>Grades</h1><div class="sectionListRows">${ss.map((s,i)=>`<button class="sectionListItem" data-user-grade-section="${i}"><span class="sectionLabels"><b>${esc(s.section_title||s.course_title||'Course')}</b><small>${esc((s.final_grade||[])[0]?.grade||'')}</small></span><span>›</span></button>`).join('')||'<div class="empty"><h2>No grades</h2></div>'}</div></section>`;
    window.__schoologyUserGradeSections=ss;
    document.querySelectorAll('[data-user-grade-section]').forEach(b=>b.onclick=()=>{const ss=window.__schoologyUserGradeSections[+b.dataset.userGradeSection];showCourse({id:ss.section_id,section_title:ss.section_title||ss.course_title,course_title:ss.course_title},'grades')});
  }else if(state.tab==='messages'){
    const endpoint=state.messageTab==='sent'?'messages/sent':'messages/inbox';
    const x=await A.api({path:endpoint,params:{limit:50}});const arr=x.message||x.messages||[];window.__schoologyMessages=arr;
    const ids=[...new Set(arr.map(m=>state.messageTab==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId)).map(Number).filter(Boolean))];
    const users={}; await Promise.all(ids.map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});users[id]=u?.user||u}catch{}})); window.__schoologyMessageUsers=users;
    c.innerHTML=`<section class="messagesAndroidPage"><div class="messageTabs"><button class="messageTab ${state.messageTab==='inbox'?'active':''}" data-message-tab="inbox">Inbox</button><button class="messageTab ${state.messageTab==='sent'?'active':''}" data-message-tab="sent">Sent</button></div><div class="messageList">${arr.map((m,i)=>{const uid=Number(state.messageTab==='sent'?(m.recipient_ids||m.recipientIds||'').split(',')[0]:(m.author_id||m.authorId));const u=users[uid]||{};const me=Number(state.auth?.userId||state.auth?.user?.id||0)===uid;const name=me?'You':(u.name_display||u.nameDisplay||u.display_name||u.name||'Schoology');const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||'');const ts=m.last_updated||m.lastUpdated||m.created||m.timestamp;const date=ts?(typeof ts==='number'||/^\\d+$/.test(String(ts))?new Date(Number(ts)*1000).toLocaleString():String(ts)):'';return `<button class="messageListItem ${m.message_status==='unread'?'unread':''}" data-message="${i}"><span class="messageListAvatar">${avatar?`<img data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`${esc(String(name).charAt(0))}`}</span><span class="messageListText"><b>${esc(name)}</b><strong>${esc(m.subject||'Message')}</strong><small>${esc(date)}</small></span>${m.message_status==='unread'?'<span class="messageUnreadDot"></span>':''}</button>`}).join('')||'<div class="empty">No messages.</div>'}</div></section>`;
    await hydrateMediaImages(c);
    document.querySelectorAll('[data-message-tab]').forEach(b=>b.onclick=()=>{state.messageTab=b.dataset.messageTab;loadTab()});
    document.querySelectorAll('[data-message]').forEach(b=>b.onclick=async()=>{
      const m=window.__schoologyMessages?.[+b.dataset.message];if(!m)return;
      state.message=m;state.messageFolder=state.messageTab;state.messageThread=null;render();await loadMessageThread(m);
    });
  }else if(state.tab==='notifications'){
    const x=await A.api({path:'notifications'});const arr=x.notification||x.notifications||[];c.innerHTML=`<section class="page"><h1>Notifications</h1>${arr.map(n=>`<article class="messageCard">${esc(n.title||n.message||'Notification')}</article>`).join('')||'<div class="empty">No notifications.</div>'}</section>`;
  }else if(state.tab==='resources'){
    c.innerHTML='<section class="page"><h1>Resources</h1><p>Resources</p></section>';
  }else if(state.tab==='people'){
    c.innerHTML='<section class="page"><h1>People</h1><p>People</p></section>';
  }else if(state.tab==='settings'){
    c.innerHTML=`<section class="settingsPage"><div class="settingsGroup"><h2>Notification Settings</h2><label class="settingRow"><span><b>Notifications</b><small id="notifSummary">Enabled</small></span><input type="checkbox" id="notifToggle" checked></label><button class="settingRow settingButton"><span><b>Ringtone</b><small>Set Notification Ringtone</small></span><span>›</span></button><label class="settingRow"><span><b>Vibrate</b><small>Vibrate on incoming notifications</small></span><input type="checkbox" checked></label><label class="settingRow"><span><b>Phone LED</b><small>Flash LED on notifications</small></span><input type="checkbox" checked></label></div><div class="settingsGroup"><h2>Account Settings</h2><button id="accountInfo" class="settingRow settingButton"><span><b>Account Info</b></span><span>›</span></button></div><div class="settingsGroup"><button id="offlineStorage" class="settingRow settingButton"><span><b>Offline Storage Settings</b><small>Manage downloaded course materials</small></span><span>›</span></button></div><div class="settingsVersion">Version: 2026.06.0</div></section>`;
    document.getElementById('notifToggle')?.addEventListener('change',e=>{document.getElementById('notifSummary').textContent=e.target.checked?'Enabled':'Disabled'});
    document.getElementById('accountInfo')?.addEventListener('click',async()=>{try{await A.prepareWebSession();showEmbeddedWeb('https://app.schoology.com/settings/account','Account Info')}catch(e){alert(e.message)}});
    document.getElementById('offlineStorage')?.addEventListener('click',()=>showOfflineStorage());
  }
 }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
}
async function loadHomeTab(){
 const c=document.getElementById('homeTabContent');if(!c)return;
 animateTab(c,state.homeTabDirection||'forward');
 c.innerHTML='<div class="loading">Loading…</div>';
 try{
  if(state.homeTab==='recent'){
    const recent=await A.api({path:'recent',params:{start:0,limit:20,with_attachments:'TRUE',richtext:1}});
    const updates=recent?.update||recent?.updates||recent?.update_list||[];
    const userIds=[...new Set(updates.map(x=>x.user_id||x.uid).filter(Boolean).map(Number))];
    const userMap={};
    await Promise.all(userIds.slice(0,20).map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});userMap[id]=u?.user||u}catch{}}));
    state.activityUsers=userMap;state.__activityById=Object.fromEntries(updates.map(u=>[String(u.id),u]));
    c.innerHTML=updates.length?updates.map(x=>{
      const uid=x.user_id||x.uid||x.author_id||x.authorId;
      const u=userMap[uid]||{};
      const name=x.display_name||x.author_name||u.name_display||u.display_name||u.name||x.user_name||x.author_name||'Schoology';
      const body=x.body||x.message||x.description||x.title||'';
      const created=x.created||x.timestamp||x.created_at||'';
      const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||x.user_photo||x.photo_url||'');
      const media=renderAttachments(x.attachments||x.attachment||x.files||{});
      const comments=Number(x.num_comments||x.comment_count||0);
      return `<article class="androidActivityCard">
        <div class="activityHeader">${avatar?`<img class="activityAvatar" data-media-image-url="${esc(avatar)}" alt="" style="display:none">`:`<span class="activityAvatar">${esc(String(name).charAt(0))}</span>`}<span class="activityUser">${esc(name)}</span></div>
        <div class="activityBody">${body}</div>
        ${media}
        <div class="activityMeta">${esc(created)}</div>
        <div class="activityActions"><button data-activity-comments="${esc(x.id||'')}">Comment${comments?` (${comments})`:''}</button><button data-activity-like="${esc(x.id||'')}" data-liked="${x.liked||x.is_liked?'1':'0'}">${x.liked||x.is_liked?'Unlike':'Like'}${x.likes?` (${esc(x.likes)})`:''}</button></div>
      </article>`;
    }).join(''):'<div class="empty"><h2>No recent activity</h2><p>Your recent Schoology activity will appear here.</p></div>';
    await hydrateMediaImages(c);
    document.querySelectorAll('[data-activity-like]').forEach(btn=>btn.onclick=async()=>{
      const id=btn.dataset.activityLike;if(!id)return;
      const liked=btn.dataset.liked==='1';
      try{await A.api({path:`like/${id}`,method:'POST',params:{like_action:!liked},signBody:true});btn.dataset.liked=liked?'0':'1';btn.textContent=liked?'Like':'Unlike';}
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
    const uid=state.auth?.userId||state.auth?.user?.id;
    await A.prepareWebSession();
    const x=uid?await A.api({path:`users/${uid}/sections`,params:{limit:100}}):{};
    const arr=x.section||x.sections||[];
    window.__schoologyDashboardCourses=arr;
    c.classList.remove('webContentHost');c.classList.add('dashboardContentActive');c.innerHTML=`<section class="dashboardHybrid"><webview id="courseDashboardWebview" src="https://app.schoology.com/mobile/course/dashboard" allowpopups></webview></section>`;
    const dw=document.getElementById('courseDashboardWebview');
    if(dw){
      dw.addEventListener('new-window',e=>{e.preventDefault();try{dw.src=e.url}catch{}});
      dw.addEventListener('will-navigate',e=>{const u=String(e.url||'');if(/^schoology:\/\/course(?:s)?\//i.test(u)){e.preventDefault();const m=u.match(/^schoology:\/\/course(?:s)?\/(\d+)/i);if(m){A.api({path:`sections/${m[1]}`,params:{}}).then(x=>showCourse(x?.section||x)).catch(()=>{})}}});
      dw.addEventListener('did-fail-load',()=>{try{dw.reload()}catch{}});
    }
  }else{
    // Android UpcomingFragment.i5("users", 0L) calls UserCalls.getRecentEvents(),
    // which requests events after today's date with start_date (not `start`).
    const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/events`,params:{start_date:formatApiDate(new Date()),start:0,limit:20}});
    const arr=(x.event||x.events||[]).filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool','event'].includes(String(e.type||'')));
    const sorted=arr.slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
    c.innerHTML=sorted.length?`<div class="upcomingList">${sorted.map(e=>{const type=String(e.type||'');const icon=type==='assignment'?'📝':type==='assessment'?'▣':(type==='assessment_v2'||type==='managed_assessment'?'▣':type==='discussion'?'💬':type==='external_tool'?'▤':'◷');const allDay=String(e.all_day)==='1'||e.allDay===1;const time=!allDay&&e.start?new Date(String(e.start).replace(' ','T')).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';return `<button class="upcomingAssignment" data-upcoming-id="${esc(e.id||'')}" data-upcoming-type="${esc(type)}"><span class="assignmentIcon">${icon}</span><span class="assignmentInfo"><b>${esc(e.title||'Untitled')}</b><small>${esc(time||e.start||'')}</small></span><span class="rowChevron">›</span></button>`}).join('')}</div>`:'<div class="empty"><h2>Nothing upcoming</h2><p>Your upcoming assignments will appear here.</p></div>';
    document.querySelectorAll('[data-upcoming-id]').forEach(b=>b.onclick=()=>{const e=sorted.find(v=>String(v.id||'')===String(b.dataset.upcomingId));if(!e)return;if(e.type==='assignment'&&e.section_id&&e.assignment_id)showAssignment(e.section_id,e.assignment_id);else if(e.web_url)showEmbeddedWeb(e.web_url,e.title||'Upcoming');});
  }
 }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
}
let qrStream=null,qrBusy=false,qrLastAttempt=0;
function stopQR(){if(qrStream){qrStream.getTracks().forEach(t=>t.stop());qrStream=null}qrBusy=false}
function decodeFrame(ctx,w,h){
  const attempts=[];
  // Android uses a square framing area. Try that first at a practical size.
  const side=Math.min(w,h);
  const sx=Math.max(0,Math.floor((w-side)/2)),sy=Math.max(0,Math.floor((h-side)/2));
  const size=Math.min(side,900);
  const work=document.createElement('canvas');work.width=size;work.height=size;
  const wc=work.getContext('2d',{willReadFrequently:true});
  wc.drawImage(ctx.canvas,sx,sy,side,side,0,0,size,size);
  attempts.push(wc.getImageData(0,0,size,size));
  // Also try the full camera frame for QR codes outside the exact center.
  attempts.push(ctx.getImageData(0,0,w,h));
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
        const data=decodeFrame(ctx,canvas.width,canvas.height);
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

// Restore the persisted Android-style OAuth session on application launch.
(async()=>{try{const saved=await A.authState();if(saved?.oauth_token&&saved?.oauth_token_secret){state.auth=saved;await afterLogin();return}}catch(e){console.warn('Saved Schoology session could not be restored:',e)}render()})();
