const app=document.getElementById('app');
const A=window.schoology;
if(!A){
  app.innerHTML='<div class="fatal"><h2>Schoology</h2><p>The application interface could not initialize.</p><p>The Electron authentication bridge did not load.</p></div>';
  throw new Error('Schoology preload bridge is unavailable');
}
const C={graphite:'#44505d',dark:'#22303e',blue:'#2e66a3',blueText:'#3183c8',bg:'#e7ebee',light:'#f4f5f5',white:'#fff',muted:'#868e96'};
let state={screen:'login',school:null,schools:[],q:'',loading:false,error:'',auth:null,user:null,tab:'home',homeTab:'recent',searchToken:0,drawerPage:null,message:null,selectedCourse:null,mobileMe:null,courseDashboardEnabled:false,preferredHomepage:'recent',toolbarTitle:'Home',folderId:0,folderStack:[],courseView:null,activityUsers:{},activityComments:null,currentFolderId:0};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function messageDetail(){const m=state.message||{};return `<div class="shell"><header class="toolbar"><button id="messageBack" class="iconButton">‹</button><span class="toolbarTitle">Messages</span><button class="iconButton">⋮</button></header><main class="messageDetail"><h1>${esc(m.subject||'Message')}</h1><div class="messageSender">${esc(m.sender?.name||m.sender_name||m.from||'Schoology')}</div><div class="messageDate">${esc(m.created||m.timestamp||'')}</div><div class="messageBody">${esc(m.body||m.message||m.content||'')}</div></main></div>`}
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
 const drawerPage=state.drawerPage==='courses'||state.drawerPage==='grades'?`
   <div class="drawerSub">
    <div class="drawerSubHeader"><button id="drawerBack" class="drawerBack">‹</button><span>${state.drawerPage==='grades'?'Grades':'Courses'}</span>${state.drawerPage==='courses'?'<button id="joinCourse" class="drawerHeaderAction">+</button>':'<span class="drawerHeaderSpacer"></span>'}</div>
    <div id="courseSubList" class="courseSubList"><div class="drawerLoading">Loading ${state.drawerPage==='grades'?'grades':'courses'}…</div></div>
   </div>`:'';
 return `<div class="shell">
 <header class="toolbar">${state.courseView||state.folderStack.length||state.assignmentView||state.embeddedTitle?`<button id="toolbarBack" class="iconButton" aria-label="Back">‹</button>`:`<button id="menuButton" class="iconButton" aria-label="Navigation menu">☰</button>`}<span class="toolbarTitle">${esc(state.toolbarTitle||'Home')}</span><button id="toolbarMore" class="iconButton">⋮</button></header>
 <main id="content"><div class="loading">Loading…</div></main>
 <div id="drawerShade" class="drawerShade"></div><aside id="drawer" class="drawer">
   ${drawerPage||`<button id="profileButton" class="profileRow"><img src="../assets/logo_schoology.png"><span>${esc(state.auth?.user?.name_display||state.auth?.user?.name||'Profile')}</span></button>
   <div class="drawerList">${drawerItems.map(([id,label,icon],i)=>i===4||i===11?`<div class="drawerDivider"></div><button class="drawerItem" data-drawer="${id}"><span class="drawerIcon">${icon}</span><span>${label}${id==='courses'||id==='grades'?'<span class="disclosure">›</span>':''}</span></button>`:`<button class="drawerItem" data-drawer="${id}"><span class="drawerIcon">${icon}</span><span>${label}${id==='courses'||id==='grades'?'<span class="disclosure">›</span>':''}</span></button>`).join('')}</div>`}
 </aside>
 </div>`
}
function bind(){
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

  document.getElementById('profileButton')?.addEventListener('click',()=>{setDrawer(false);state.tab='profile';state.toolbarTitle='Profile';render();loadTab()});
  document.getElementById('drawerBack')?.addEventListener('click',()=>{state.drawerPage=null;render();setTimeout(()=>document.getElementById('drawer')?.classList.add('open'),0)});
  document.getElementById('joinCourse')?.addEventListener('click',()=>{state.drawerPage=null;render();setTimeout(()=>document.getElementById('drawer')?.classList.add('open'),0)});

  document.querySelectorAll('[data-drawer]').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.drawer;
    if(id==='courses'||id==='grades'){
      state.drawerPage=id;render();document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open');loadCourseSubmenu();return;
    }
    setDrawer(false);
    if(id==='logout'){await A.logout();state.auth=null;state.school=null;state.tab='home';state.screen='login';render();return}
    if(id==='settings'){state.tab='settings';state.toolbarTitle='Settings';state.screen='app';render();loadTab();return}
    if(['home','calendar','grades','messages','notifications','resources','profile','groups','people'].includes(id)){state.tab=id;state.toolbarTitle=id.charAt(0).toUpperCase()+id.slice(1);state.screen='app';render();loadTab()}
  }));

  document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{const i=+b.dataset.message;const m=window.__schoologyMessages?.[i];if(m){state.message=m;render();}});
  document.querySelectorAll('[data-activity-comments]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.activityComments;if(!id)return;
    try{
      const x=await A.api({path:`recent/0/update/${id}/comments`,params:{limit:50}});
      const arr=x.comment||x.comments||[];
      alert(arr.length?arr.map(c=>`${c.display_name||c.user_name||'User'}: ${c.body||''}`).join('\n\n'):'No comments.');
    }catch(e){alert('Unable to load comments: '+e.message)}
  });
  document.getElementById('messageBack')?.addEventListener('click',()=>{state.message=null;render();loadTab()});
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
   const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('No logged-in user ID.');
   // Android SectionRepository.listAllSections(userId) is the source for both
   // the Courses submenu and the Grades section selector.
   const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});
   const arr=x.section||x.sections||[];window.__schoologyCourses=arr;
   c.innerHTML=arr.length?arr.map((s,i)=>{
     const courseTitle=s.course_title||s.courseTitle||s.title||s.section_title||'Course';
     const sectionTitle=s.section_title||s.sectionTitle||'';
     const image=normalizeImageUrl(s.course_theme||s.courseTheme||s.image||s.course_image||'');
     const admin=String(s.admin||'')==='1'||s.admin===true;
     return `<button class="courseSubItem" data-course-sub="${i}">
       <span class="courseImage">${image?`<img data-course-image-url="${esc(image)}" alt="" style="display:none">`:''}<span class="courseImageFallback">${esc(courseTitle.charAt(0))}</span></span>
       <span class="courseText"><b>${esc(courseTitle)}</b><small>${esc(sectionTitle)}</small></span>
       ${admin?'<span class="courseAdmin" aria-label="Administrator">★</span>':''}
     </button>`;
   }).join(''):'<div class="drawerEmpty">No courses found.</div>';
   document.querySelectorAll('[data-course-sub]').forEach(b=>b.onclick=()=>{
     const course=window.__schoologyCourses[+b.dataset.courseSub];
     if(state.drawerPage==='grades'){
       state.drawerPage=null;state.tab='grades';state.courseView='course';state.toolbarTitle=sectionTitleOf(course)||courseTitleOf(course);state.screen='app';render();showCourse(course,'grades');
     }else{
       state.drawerPage=null;state.tab='courses';state.screen='app';render();showCourse(course);
     }
   });
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
  const needs=!!(state.courseView||state.folderStack.length||state.assignmentView||state.embeddedTitle);
  const existing=header.querySelector('#toolbarBack');
  const menu=header.querySelector('#menuButton');
  if(needs&&!existing){const b=document.createElement('button');b.id='toolbarBack';b.className='iconButton';b.setAttribute('aria-label','Back');b.textContent='‹';b.addEventListener('click',navigateBack);header.insertBefore(b,header.firstChild);if(menu)menu.remove();}
  if(!needs&&existing){existing.remove();const b=document.createElement('button');b.id='menuButton';b.className='iconButton';b.setAttribute('aria-label','Navigation menu');b.textContent='☰';header.insertBefore(b,header.firstChild);b.addEventListener('click',()=>{document.getElementById('drawer')?.classList.add('open');document.getElementById('drawerShade')?.classList.add('open')});}
  const title=header.querySelector('.toolbarTitle');if(title)title.textContent=state.toolbarTitle||'Home';
}
function navigateBack(){
  if(state.assignmentView){
    state.assignmentView=null;
    syncToolbar();
    if(state.selectedCourse){showCourse(state.selectedCourse,state.courseTab||'materials');}
    else {state.toolbarTitle='Home';render();loadTab();}
    return;
  }
  if(state.embeddedTitle){
    state.embeddedTitle=null;
    syncToolbar();
    if(state.selectedCourse){showCourse(state.selectedCourse,state.courseTab||'materials');}
    else {state.toolbarTitle='Home';render();loadTab();}
    return;
  }
  if(state.folderStack.length){
    const prev=state.folderStack.pop();
    state.currentFolderId=prev.id||0;
    syncToolbar();
    if(state.selectedCourse)loadFolder(state.selectedCourse,state.currentFolderId,false,prev.title);
    return;
  }
  if(state.courseView){
    state.courseView=null;state.selectedCourse=null;state.toolbarTitle=state.tab==='home'?'Home':(state.tab.charAt(0).toUpperCase()+state.tab.slice(1));
    render();loadTab();
  }
}
function showCourse(course,activeTab='materials'){
 const c=document.getElementById('content');if(!c)return;
 if(!course){loadTab();return}
 state.selectedCourse=course;state.courseView='course';state.courseTab=activeTab;state.folderStack=[];state.currentFolderId=0;state.assignmentView=null;state.embeddedTitle=null;state.toolbarTitle=sectionTitleOf(course)||courseTitleOf(course);syncToolbar();
 const sid=course.id||course.section_id||course.sectionId;
 const title=courseTitleOf(course), section=sectionTitleOf(course);
 const image=normalizeImageUrl(course.course_theme||course.courseTheme||course.image||course.course_image||'');
 const tabs=[
   ['materials','Materials'],['updates','Updates'],['upcoming','Upcoming'],['grades','Grades'],['courseapp','Course App']
 ];
 c.innerHTML=`<section class="sectionProfilePage">
   <div class="sectionProfileTabs">${tabs.map(([id,label])=>`<button class="sectionProfileTab ${activeTab===id?'active':''}" data-course-tab="${id}">${label}</button>`).join('')}</div>
   <div class="sectionProfileHeader">
     <img class="sectionProfileImage" data-course-image-url="${esc(image)}" style="display:none" alt="">
     <span class="sectionProfileFallback">${esc(title.charAt(0))}</span>
     <div class="sectionProfileText"><div class="sectionProfileTitle">${esc(section||title)}</div><div class="sectionProfileSubtitle">${esc(title)}</div></div>
   </div>
   <div class="sectionProfileRule"></div>
   <div id="sectionProfileContent" class="sectionProfileContent"><div class="loading">Loading…</div></div>
 </section>`;
 hydrateCourseImages(c);
 document.querySelectorAll('[data-course-tab]').forEach(b=>b.onclick=()=>{state.toolbarTitle=(b.dataset.courseTab==='courseapp'?'Course Apps':b.textContent||'Course');showCourse(course,b.dataset.courseTab)});
 loadCourseTab(course,activeTab).catch(e=>{
   const el=document.getElementById('sectionProfileContent');
   if(el)el.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`;
 });
}

async function showAssignment(sectionId,assignmentId){
  const c=document.getElementById('content'); if(!c)return;
  state.toolbarTitle='Assignment'; state.screen='app'; state.assignmentView={sectionId,assignmentId}; state.courseView='course';syncToolbar();
  c.innerHTML=`<section class="assignmentPage"><div class="assignmentLoading">Loading assignment…</div></section>`;
  try{
    const a=await A.api({path:`sections/${sectionId}/assignments/${assignmentId}`,params:{richtext:1,with_attachments:'TRUE'}});
    const at=a.assignment||a;
    const attachments=at.attachments||at.attachment||{};
    const html=typeof at.description==='string'?at.description:'';
    c.innerHTML=`<section class="assignmentPage">
      <div class="assignmentHeader"><h1>${esc(at.title||'Assignment')}</h1><div class="assignmentDue">${esc(at.due||'')}</div></div>
      <div class="assignmentRule"></div>
      <div class="assignmentBody">${html||'<span class="muted">No description.</span>'}</div>
      ${renderAttachments(attachments)}
      <div class="assignmentMeta"><span>${esc(at.max_points||'')} ${at.max_points?'points':''}</span><span>${esc(at.assignment_type||at.type||'Assignment')}</span></div>
      <div class="assignmentActions">
        ${at.allow_dropbox===1||at.allow_dropbox==='1'||at.allowDropbox===true||at.allow_dropbox===true?'<button id="assignmentSubmit" class="androidPrimary">Submit Assignment</button>':''}
        ${at.allow_discussion===1||at.allow_discussion==='1'||at.allowDiscussion===true?'<button id="assignmentComments" class="androidSecondary">Comments</button>':''}
      </div>
    </section>`;
    document.getElementById('assignmentSubmit')?.addEventListener('click',()=>openSubmissionComposer(sectionId,assignmentId,at));
    document.getElementById('assignmentComments')?.addEventListener('click',()=>openAssignmentComments(sectionId,assignmentId,at));
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
    if(type==='image'||/\.(png|jpe?g|gif|webp)(\?|$)/i.test(u))out.push(`<img class="activityMediaImage" src="${esc(u)}" alt="${esc(title||'')}" loading="lazy">`);
    else out.push(`<a class="activityAttachment" href="${esc(u)}" target="_blank" rel="noreferrer">${esc(title||u)}</a>`);
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

async function openAssignmentComments(sectionId,assignmentId,assignment){
  const c=document.getElementById('content');if(!c)return;
  state.assignmentView={sectionId,assignmentId};state.toolbarTitle='Comments';
  c.innerHTML='<section class="commentsPage"><div class="loading">Loading comments…</div></section>';
  try{
    const x=await A.api({path:`sections/${sectionId}/assignments/${assignmentId}/comments`,params:{limit:50}});
    const arr=x.comment||x.comments||[];
    c.innerHTML=`<section class="commentsPage"><div class="commentsList">${arr.map(cm=>`<article class="commentRow"><div class="commentAvatar">${esc(String(cm.display_name||cm.user_name||'U').charAt(0))}</div><div><b>${esc(cm.display_name||cm.user_name||'User')}</b><small>${esc(cm.created||cm.timestamp||'')}</small><div>${cm.body||cm.comment||''}</div></div></article>`).join('')||'<div class="empty">No comments.</div>'}</div>${assignment.allow_discussion?'<div class="commentComposer"><textarea id="commentText" placeholder="Write a comment…"></textarea><button id="postComment" class="androidPrimary">Post</button></div>':''}</section>`;
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
  const c=document.getElementById('content');if(!c)return;
  state.assignmentView={sectionId,assignmentId};state.toolbarTitle='Submit Assignment';
  c.innerHTML=`<section class="submissionPage"><h1>Submit Assignment</h1><p>${esc(assignment.title||'Assignment')}</p><div id="submissionFile">No file selected.</div><button id="chooseSubmissionFile" class="androidPrimary">Choose File</button><button id="sendSubmission" class="androidPrimary" disabled>Submit</button><div id="submissionStatus"></div></section>`;
  let filePath=null;
  document.getElementById('chooseSubmissionFile')?.addEventListener('click',async()=>{
    filePath=await A.pickFile();const el=document.getElementById('submissionFile');if(el)el.textContent=filePath?filePath.split(/[\\\\/]/).pop():'No file selected.';document.getElementById('sendSubmission').disabled=!filePath;
  });
  document.getElementById('sendSubmission')?.addEventListener('click',async()=>{
    if(!filePath)return;
    const st=document.getElementById('submissionStatus');if(st)st.textContent='Uploading…';
    try{
      const result=await A.submitAssignmentFile({sectionId,assignmentId,filePath});
      if(st)st.textContent='Assignment submitted.';
      document.getElementById('sendSubmission').disabled=true;
    }catch(e){if(st)st.textContent='Submission failed: '+e.message}
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
    if(f.web_url){showEmbeddedWeb(f.web_url,f.title||'Schoology');return}
  });
}
function showEmbeddedWeb(url,title){
  const c=document.getElementById('content');if(!c)return;
  state.toolbarTitle=title||'Schoology';state.embeddedTitle=title||'Schoology';syncToolbar();
  c.innerHTML=`<section class="embeddedPage"><webview id="schoologyWebview" src="${esc(url)}" allowpopups></webview></section>`;
}
async function loadCourseApps(course){
  const el=document.getElementById('sectionProfileContent');if(!el)return;
  const sid=course.id||course.section_id||course.sectionId;
  const x=await A.api({path:`v2/sections/${sid}/applications`,params:{}});
  const apps=x.extra||x.data?.extra||[];
  el.innerHTML=apps.length?`<div class="courseAppList">${apps.map((a,i)=>`<button class="courseAppRow" data-app-index="${i}"><span class="courseAppIcon">${esc((a.title||a.name||'A').charAt(0))}</span><span><b>${esc(a.title||a.name||'Course App')}</b><small>${esc(a.description||'')}</small></span><span>›</span></button>`).join('')}</div>`:'<div class="empty"><h2>No course apps</h2></div>';
  window.__schoologyCourseApps=apps;
  document.querySelectorAll('[data-app-index]').forEach(b=>b.onclick=async()=>{
    const a=window.__schoologyCourseApps[+b.dataset.appIndex];
    const launch=a?.links?.launch?.id;
    if(!launch){if(a?.links?.launch?.href)showEmbeddedWeb(a.links.launch.href,a.title);return}
    try{
      const q=await A.api({path:launch,method:'GET',params:{}});
      const url=q?.launch_token_url||q?.launchTokenUrl||q?.url||q?.launch?.url;
      if(url)showEmbeddedWeb(url,a.title||'Course App'); else throw new Error('Course app did not return a launch URL.');
    }catch(e){el.innerHTML=`<div class="error apiError"><b>Schoology could not launch this course app.</b><br>${esc(e.message)}</div>`}
  });
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
   el.innerHTML=arr.length?arr.map(u=>`<article class="sectionUpdate"><b>${esc(u.title||u.body||u.message||'Update')}</b><small>${esc(u.created||u.timestamp||'')}</small></article>`).join(''):'<div class="empty"><h2>No updates</h2></div>';
   return;
 }
 if(tab==='upcoming'){
   const x=await A.api({path:`sections/${sid}/events`,params:{start:formatApiDate(new Date()),limit:20}});
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

function formatApiDate(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
async function loadSectionGrades(course){
 const el=document.getElementById('sectionProfileContent')||document.getElementById('gradesContent');if(!el)return;
 const sid=course.id||course.section_id||course.sectionId;
 const uid=state.auth?.userId||state.auth?.user?.id;
 if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
 const [section,periods,categories,items,userGrades]=await Promise.all([
   A.api({path:`sections/${sid}`,params:{}}),
   A.api({path:`sections/${sid}/grading_periods`,params:{}}),
   A.api({path:`sections/${sid}/grading_categories`,params:{}}),
   A.api({path:`sections/${sid}/grade_items`,params:{limit:2000}}),
   A.api({path:`users/${uid}/grades`,params:{section_id:sid}})
 ]);
 const assignments=items.assignment||items.assignments||[];
 const gradeSections=userGrades.section||userGrades.sections||[];
 const current=gradeSections.find(s=>String(s.section_id||s.id)===String(sid))||gradeSections[0]||{};
 const byId={};
 for(const per of (current.period||current.periods||[])){
   for(const ga of (per.assignment||[]))byId[String(ga.assignment_id)]={...ga};
 }
 const rows=assignments.map(a=>({...a,gradeData:byId[String(a.id)]||{}}));
 el.innerHTML=`<div class="gradesAndroid">
   <div class="gradesOverall">${renderOverallGrade(current)}</div>
   ${renderGradePeriods(rows,periods,categories)}
 </div>`;
 document.querySelectorAll('[data-grade-assignment]').forEach(b=>b.onclick=()=>showAssignment(sid,b.dataset.gradeAssignment));
}
function renderOverallGrade(sec){
 const final=(sec.final_grade||[])[0]||{};
 return `<div class="gradePeriodHeader"><span>OVERALL</span><strong>${esc(final.grade||final.grade_override||'—')}</strong></div>`;
}
function renderGradePeriods(rows,periods,categories){
 const ps=periods.grading_period||periods.gradePeriod||periods.period||[];
 const cats=categories.grading_category||categories.category||[];
 const catMap={};cats.forEach(c=>catMap[String(c.id)]=c.title);
 const groups={};
 rows.forEach(a=>{const pid=String(a.grading_period||'0');const cid=String(a.grading_category||'0');(groups[pid]??=[]).push(a);});
 const pmap={};ps.forEach(p=>pmap[String(p.id)]=p.title);
 const keys=Object.keys(groups);
 if(!keys.length)return '<div class="empty"><h2>No grades</h2></div>';
 return keys.map(pid=>`<section class="gradePeriod"><div class="gradePeriodHeader"><span>${esc((pmap[pid]||'Grading Period').toUpperCase())}</span><span></span></div>${groups[pid].map(a=>{
   const g=a.gradeData||{};const raw=g.grade??g.calculated_grade??g.score??'—';const max=a.max_points??a.maxPoints??g.max_points??g.maxPoints;const value=(raw!=='—'&&max!=null&&String(max)!=='')?`${raw}/${max}`:raw;const cat=catMap[String(a.grading_category)]||'';
   return `<button class="gradeAssignmentRow" data-grade-assignment="${esc(a.id||'')}"><span class="gradeAssignmentName">${esc(a.title||'Assignment')}<small>${esc(cat)}</small></span><span class="gradeValue">${esc(value)}</span></button>`;
 }).join('')}</section>`).join('');
}
function renderUpcoming(arr){
 if(!arr.length)return '<div class="empty"><h2>Nothing upcoming</h2><p>No upcoming assignments.</p></div>';
 return `<div class="upcomingList">${arr.map(e=>{
  const type=String(e.type||'');
  const icon=type==='assignment'?'📝':(type.startsWith('assessment')||type==='managed_assessment'?'▣':(type==='discussion'?'💬':'▤'));
  const when=e.start||e.start_date||e.due||e.due_date||'';
  return `<button class="upcomingAssignment" data-event-id="${esc(e.id||'')}"><span class="assignmentIcon">${icon}</span><span class="assignmentInfo"><b>${esc(e.title||'Assignment')}</b><small>${esc(when)}</small></span><span class="rowChevron">›</span></button>`;
 }).join('')}</div>`;
}
function renderGrades(rows){
 if(!rows.length)return '<div class="empty"><h2>No grades</h2></div>';
 return `<div class="gradesNativeList">${rows.map(g=>{
   const name=g.assignment_title||g.assignment_name||g.title||g.name||'Assignment';
   const value=g.grade||g.score||g.grade_value||g.points||'';
   return `<button class="gradeAssignmentRow"><span>${esc(name)}</span><span>${esc(value)}</span></button>`;
 }).join('')}</div>`;
}

function showOfflineStorage(){
 state.toolbarTitle='Offline Storage Settings';
 const c=document.getElementById('content');if(!c)return;
 c.innerHTML=`<section class="settingsPage offlinePage"><div class="settingsGroup"><h2>Offline Storage</h2><div class="settingRow"><span><b>Downloaded Materials</b><small>Manage Schoology materials saved for offline use.</small></span><span>›</span></div><div class="settingRow"><span><b>Storage Used</b><small>Local offline files are managed by the Schoology app.</small></span></div></div><div class="settingsGroup"><button id="offlineClear" class="settingRow settingButton"><span><b>Clear Offline Storage</b></span><span>›</span></button></div></section>`;
 document.getElementById('offlineClear')?.addEventListener('click',()=>{if(confirm('Clear downloaded Schoology materials?')){alert('Offline storage cleared.');}});
}
async function loadTab(){
 const c=document.getElementById('content');if(!c)return;
 c.innerHTML='<div class="loading">Loading…</div>';
 const uid=state.auth?.userId||state.auth?.user?.id;
 try{
  if(state.tab==='home'){
    const tabs=[`<button data-home-tab="recent" class="homeTab ${state.homeTab==='recent'?'active':''}">Recent Activity</button>`,state.courseDashboardEnabled?`<button data-home-tab="dashboard" class="homeTab ${state.homeTab==='dashboard'?'active':''}">Course Dashboard</button>`:'',`<button data-home-tab="upcoming" class="homeTab ${state.homeTab==='upcoming'?'active':''}">Upcoming</button>`].join('');
    c.innerHTML=`<div class="homeTabs">${tabs}</div><section id="homeTabContent" class="activity"></section>`;
    document.querySelectorAll('[data-home-tab]').forEach(b=>b.onclick=()=>{state.homeTab=b.dataset.homeTab;document.querySelectorAll('[data-home-tab]').forEach(x=>x.classList.toggle('active',x===b));loadHomeTab()});
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
  }else if(state.tab==='groups'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/groups`});const arr=x.group||x.groups||[];c.innerHTML=`<section class="page"><h1>Groups</h1><div class="cards">${arr.map(g=>`<button class="card"><b>${esc(g.name||g.title||'Group')}</b></button>`).join('')||'<p>No groups found.</p>'}</div></section>`;
  }else if(state.tab==='messages'){
    const x=await A.api({path:'messages/inbox',params:{limit:50}});const arr=x.message||x.messages||[];window.__schoologyMessages=arr;
    c.innerHTML=`<section class="page messagePage"><h1>Messages</h1>${arr.map((m,i)=>`<button class="messageCard clickable" data-message="${i}"><b>${esc(m.subject||'Message')}</b><small>${esc(m.created||m.timestamp||'')}</small><span class="messageChevron">›</span></button>`).join('')||'<div class="empty">No messages.</div>'}</section>`;
    document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{const m=window.__schoologyMessages[+b.dataset.message];state.message=m;render()});
  }else if(state.tab==='notifications'){
    const x=await A.api({path:'notifications'});const arr=x.notification||x.notifications||[];c.innerHTML=`<section class="page"><h1>Notifications</h1>${arr.map(n=>`<article class="messageCard">${esc(n.title||n.message||'Notification')}</article>`).join('')||'<div class="empty">No notifications.</div>'}</section>`;
  }else if(state.tab==='resources'){
    c.innerHTML='<section class="page"><h1>Resources</h1><p>Resources</p></section>';
  }else if(state.tab==='people'){
    c.innerHTML='<section class="page"><h1>People</h1><p>People</p></section>';
  }else if(state.tab==='profile'){
    const u=state.auth?.user||{};c.innerHTML=`<section class="page profilePage"><h1>${esc(u.name_display||u.name||'Profile')}</h1><p>${esc(u.username||u.email||'')}</p></section>`;
  }else if(state.tab==='settings'){
    c.innerHTML=`<section class="settingsPage"><div class="settingsGroup"><h2>Notification Settings</h2><label class="settingRow"><span><b>Notifications</b><small id="notifSummary">Enabled</small></span><input type="checkbox" id="notifToggle" checked></label><button class="settingRow settingButton"><span><b>Ringtone</b><small>Set Notification Ringtone</small></span><span>›</span></button><label class="settingRow"><span><b>Vibrate</b><small>Vibrate on incoming notifications</small></span><input type="checkbox" checked></label><label class="settingRow"><span><b>Phone LED</b><small>Flash LED on notifications</small></span><input type="checkbox" checked></label></div><div class="settingsGroup"><h2>Account Settings</h2><button id="accountInfo" class="settingRow settingButton"><span><b>Account Info</b></span><span>›</span></button></div><div class="settingsGroup"><button id="offlineStorage" class="settingRow settingButton"><span><b>Offline Storage Settings</b><small>Manage downloaded course materials</small></span><span>›</span></button></div><div class="settingsVersion">Version: 2026.06.0</div></section>`;
    document.getElementById('notifToggle')?.addEventListener('change',e=>{document.getElementById('notifSummary').textContent=e.target.checked?'Enabled':'Disabled'});
    document.getElementById('accountInfo')?.addEventListener('click',()=>showEmbeddedWeb('https://app.schoology.com/settings/account','Account Info'));
    document.getElementById('offlineStorage')?.addEventListener('click',()=>showOfflineStorage());
  }
 }catch(e){c.innerHTML=`<div class="error apiError"><b>Schoology could not load this page.</b><br>${esc(e.message)}</div>`}
}
async function loadHomeTab(){
 const c=document.getElementById('homeTabContent');if(!c)return;
 c.innerHTML='<div class="loading">Loading…</div>';
 try{
  if(state.homeTab==='recent'){
    const recent=await A.api({path:'recent',params:{start:0,limit:20,with_attachments:'TRUE',richtext:1}});
    const updates=recent?.update||recent?.updates||recent?.update_list||[];
    const userIds=[...new Set(updates.map(x=>x.user_id||x.uid).filter(Boolean).map(Number))];
    const userMap={};
    await Promise.all(userIds.slice(0,20).map(async id=>{try{const u=await A.api({path:`users/${id}`,params:{}});userMap[id]=u?.user||u}catch{}}));
    state.activityUsers=userMap;
    c.innerHTML=updates.length?updates.map(x=>{
      const uid=x.user_id||x.uid;
      const u=userMap[uid]||{};
      const name=x.display_name||u.name_display||u.display_name||u.name||x.user_name||x.author_name||'Schoology';
      const body=x.body||x.message||x.description||x.title||'';
      const created=x.created||x.timestamp||x.created_at||'';
      const avatar=normalizeImageUrl(u.picture_url||u.pictureUrl||u.picture||u.photo_url||x.user_photo||x.photo_url||'');
      const media=renderAttachments(x.attachments||x.attachment||x.files||{});
      const comments=Number(x.num_comments||x.comment_count||0);
      return `<article class="androidActivityCard">
        <div class="activityHeader">${avatar?`<img src="${esc(avatar)}" alt="">`:`<span class="activityAvatar">${esc(String(name).charAt(0))}</span>`}<span class="activityUser">${esc(name)}</span></div>
        <div class="activityBody">${body}</div>
        ${media}
        <div class="activityMeta">${esc(created)}</div>
        <div class="activityActions"><button data-activity-comments="${esc(x.id||'')}">Comment${comments?` (${comments})`:''}</button><button>Like${x.likes?` (${esc(x.likes)})`:''}</button></div>
      </article>`;
    }).join(''):'<div class="empty"><h2>No recent activity</h2><p>Your recent Schoology activity will appear here.</p></div>';
  }else if(state.homeTab==='dashboard'){
    const uid=state.auth?.userId||state.auth?.user?.id;
    await A.prepareWebSession();
    const x=uid?await A.api({path:`users/${uid}/sections`,params:{limit:100}}):{};
    const arr=x.section||x.sections||[];
    window.__schoologyDashboardCourses=arr;
    c.innerHTML=`<section class="dashboardHybrid"><webview id="courseDashboardWebview" src="https://app.schoology.com/mobile/course/dashboard" allowpopups></webview></section>
      <div class="dashboardFallback"><div class="dashboardGrid">${arr.map((s,i)=>{const im=normalizeImageUrl(s.course_theme||s.courseTheme||s.image||'');return `<button class="dashboardCard" data-dashboard-course="${i}"><div class="dashboardThumb">${im?`<img data-course-image-url="${esc(im)}" alt="" style="display:none">`:''}<span class="dashboardThumbFallback" ${im?'style="display:none"':''}>${esc((s.section_title||s.title||'C').charAt(0))}</span></div><div><b>${esc(s.section_title||s.title||'Course')}</b><small>${esc(s.course_title||'')}</small></div></button>`}).join('')||'<div class="empty"><h2>No courses</h2></div>'}</div></div>`;
    document.querySelectorAll('[data-dashboard-course]').forEach(b=>b.onclick=()=>showCourse(window.__schoologyDashboardCourses[+b.dataset.dashboardCourse])); await hydrateCourseImages(c);
  }else{
    // Android HomePagerFragment uses UpcomingFragment.i5("users", 0L).
    // Its UpcomingAdapter renders assignments/assessments/discussions (not a
    // generic events dashboard), with date grouping and an item icon.
    const uid=state.auth?.userId||state.auth?.user?.id;if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/events`,params:{start:formatApiDate(new Date()),limit:20}});
    let arr=x.event||x.events||[];
    arr=arr.filter(e=>['assignment','assessment','assessment_v2','managed_assessment','discussion','external_tool'].includes(String(e.type||'')));
    c.innerHTML=arr.length?`<div class="upcomingList">${arr.map(e=>{
      const type=String(e.type||'');
      const icon=type==='assignment'?'📝':(type.startsWith('assessment')||type==='managed_assessment'?'▣':(type==='discussion'?'💬':'▤'));
      return `<article class="upcomingAssignment"><div class="assignmentIcon">${icon}</div><div class="assignmentInfo"><b>${esc(e.title||'Assignment')}</b><small>${esc(e.start||e.start_date||'')}</small></div></article>`;
    }).join('')}</div>`:'<div class="empty"><h2>Nothing upcoming</h2><p>Your upcoming assignments will appear here.</p></div>';
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

// Mount the initial Android-style login screen after the renderer has initialized.
render();
