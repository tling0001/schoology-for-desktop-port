const app=document.getElementById('app');
const A=window.schoology;
if(!A){
  app.innerHTML='<div class="fatal"><h2>Schoology</h2><p>The application interface could not initialize.</p><p>The Electron authentication bridge did not load.</p></div>';
  throw new Error('Schoology preload bridge is unavailable');
}
const C={graphite:'#44505d',dark:'#22303e',blue:'#2e66a3',blueText:'#3183c8',bg:'#e7ebee',light:'#f4f5f5',white:'#fff',muted:'#868e96'};
let state={screen:'login',school:null,schools:[],q:'',loading:false,error:'',auth:null,user:null,tab:'home',searchToken:0};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){let h=state.screen==='login'?login():state.screen==='search'?schoolSearchScreen():state.screen==='credentials'?credentials():state.screen==='externalSelect'?externalSelect():state.screen==='qr'?qr():shell();app.innerHTML=h;bind();return h}
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
 return `<div class="shell">
 <header class="toolbar"><button id="menuButton" class="iconButton" aria-label="Navigation menu">☰</button><span class="toolbarTitle">${state.tab==='home'?'Home':state.tab[0].toUpperCase()+state.tab.slice(1)}</span><button id="toolbarMore" class="iconButton">⋮</button></header>
 <main id="content"><div class="loading">Loading…</div></main>
 <div id="drawerShade" class="drawerShade"></div><aside id="drawer" class="drawer">
   <button id="profileButton" class="profileRow"><img src="../assets/logo_schoology.png"><span>${esc(state.auth?.user?.name_display||state.auth?.user?.name||'Profile')}</span></button>
   <div class="drawerList">${drawerItems.map(([id,label,icon],i)=>i===4||i===11?`<div class="drawerDivider"></div><button class="drawerItem" data-drawer="${id}"><span class="drawerIcon">${icon}</span><span>${label}</span></button>`:`<button class="drawerItem" data-drawer="${id}"><span class="drawerIcon">${icon}</span><span>${label}</span></button>`).join('')}</div>
 </aside>
 </div>`
}
function bind(){
  const schoolBtn=document.getElementById('schoolLogin');if(schoolBtn)schoolBtn.onclick=()=>{state.error='';state.q='';state.schools=[];state.screen='search';render();document.getElementById('schoolSearch')?.focus()};
  const accountBtn=document.getElementById('continueSchoology');if(accountBtn)accountBtn.onclick=()=>{state.error='';state.school=null;state.screen='credentials';render();document.getElementById('user')?.focus()};
  const qrbtn=document.getElementById('qrLogin');if(qrbtn)qrbtn.onclick=()=>{state.error='';state.screen='qr';render();startQR()};
  const back=document.getElementById('back');if(back)back.onclick=()=>{stopQR();state.error='';state.screen=state.school?'search':'login';if(state.screen==='search')state.schools=[];render()};
  const q=document.getElementById('schoolSearch');
  if(q){q.oninput=async()=>{const start=q.selectionStart??q.value.length,end=q.selectionEnd??start;state.q=q.value;const query=q.value.trim();const restore=()=>{const el=document.getElementById('schoolSearch');if(el){el.focus();try{el.setSelectionRange(start,end)}catch{}}};if(query.length<1){state.schools=[];state.loading=false;render();restore();return}const token=++state.searchToken;state.loading=true;state.error='';render();restore();try{const results=await A.schoolSearch(query);if(token!==state.searchToken)return;state.schools=Array.isArray(results)?results:[]}catch(e){if(token===state.searchToken){state.schools=[];state.error=e.message||'Unable to search for schools.'}}finally{if(token===state.searchToken)state.loading=false}if(token===state.searchToken){render();restore()}}}
  document.querySelectorAll('[data-school]').forEach(b=>b.onclick=async()=>{
    state.school=state.schools[+b.dataset.school];
    state.schools=[];state.error='';
    const school=state.school;
    const external=!!school&&school.login_type&&school.login_type!=='schoology';
    // Android: schoology login_type always opens LoginNativeActivity.
    // External login types branch on use_browser_login_flow: when true,
    // ExternalLoginSelectionActivity is shown; otherwise LoginExternalActivity
    // immediately opens the school's login page in a SchoologyWebView.
    const browserFlow=!!school&&(school.use_browser_login_flow??school.useBrowserLoginFlow??true);
    if(!external){
      state.screen='credentials';render();document.getElementById('user')?.focus();return;
    }
    if(browserFlow){state.screen='externalSelect';render();return}
    state.loading=true;render();
    try{state.auth=await A.loginExternalSchool({url:school.login_url||school.loginUrl||'',domain:school.domain||''});await afterLogin()}
    catch(e){state.error=e.message||'School sign-in failed.';state.screen='search';render()}
    finally{state.loading=false}
  });
  const browserLogin=document.getElementById('browserLogin');
  if(browserLogin)browserLogin.onclick=async()=>{
    state.loading=true;state.error='';render();
    try{state.auth=await A.loginSchoolBrowser({domain:state.school?.domain||''});await afterLogin()}
    catch(e){state.loading=false;state.error=e.message||'Browser sign-in failed.';render()}
  };
  const nativeLogin=document.getElementById('nativeLogin');
  if(nativeLogin)nativeLogin.onclick=()=>{state.error='';state.screen='credentials';render();document.getElementById('user')?.focus()};
  const si=document.getElementById('signIn');if(si)si.onclick=async()=>{const user=document.getElementById('user')?.value||'',password=document.getElementById('pass')?.value||'';state.error='';if(!user||!password){state.error='Enter your username or email and password.';render();return}si.disabled=true;si.textContent='Logging you in…';try{state.auth=await A.loginCredentials({user,password,schoolId:state.school?.id??null});await afterLogin()}catch(e){state.error=e.message||'Login failed.';render()}};
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();loadTab()});
  const lo=document.getElementById('logout');if(lo)lo.onclick=async()=>{await A.logout();state.auth=null;state.school=null;state.screen='login';state.tab='home';render()}
  const drawer=document.getElementById('drawer'),shade=document.getElementById('drawerShade');
  const setDrawer=(open)=>{drawer?.classList.toggle('open',open);shade?.classList.toggle('open',open)};
  document.getElementById('menuButton')?.addEventListener('click',()=>setDrawer(true));
  shade?.addEventListener('click',()=>setDrawer(false));
  document.getElementById('profileButton')?.addEventListener('click',()=>{setDrawer(false);state.tab='profile';render();loadTab()});
  document.querySelectorAll('[data-drawer]').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.drawer;setDrawer(false);
    if(id==='logout'){await A.logout();state.auth=null;state.school=null;state.screen='login';state.tab='home';render();return}
    if(['home','courses','calendar','grades','messages','notifications','resources','profile','groups','people'].includes(id)){state.tab=id;render();loadTab()}
  }));
}
async function afterLogin(){stopQR();state.screen='app';render();await loadTab()}
async function loadTab(){
 const c=document.getElementById('content');if(!c)return;
 c.innerHTML='<div class="loading">Loading…</div>';
 const uid=state.auth?.userId||state.auth?.user?.id;
 try{
  if(state.tab==='home'){
    // Android HomePagerFragment -> UpdatesFragment(recent) and CourseDashboard.
    const recent=await A.api({path:'recent',params:{start:0,limit:20}});
    const updates=recent?.update||recent?.updates||recent?.update_list||[];
    c.innerHTML=`<div class="homeTabs"><button class="homeTab active">Recent Activity</button><button class="homeTab">${state.auth?.courseDashboardEnabled?'Course Dashboard':'Upcoming'}</button><button class="homeTab">Upcoming</button></div><section class="activity">${updates.length?updates.map(x=>`<article class="activityCard"><div class="activityTitle">${esc(x.title||x.body||x.message||'Schoology update')}</div><div class="activityMeta">${esc(x.created||x.timestamp||'')}</div></article>`).join(''):'<div class="empty"><h2>No recent activity</h2><p>Your recent Schoology activity will appear here.</p></div>'}</section>`;
  }else if(state.tab==='courses'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/sections`,params:{limit:100}});const arr=x.section||x.sections||[];
    c.innerHTML=`<section class="page"><h1>Courses</h1><div class="cards">${arr.map(s=>`<button class="card"><b>${esc(s.section_title||s.title||'Course')}</b><small>${esc(s.course_title||'')}</small></button>`).join('')||'<p>No courses found.</p>'}</div></section>`;
  }else if(state.tab==='calendar'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/events`,params:{limit:50}});const arr=x.event||x.events||[];
    c.innerHTML=`<section class="page"><h1>Calendar</h1>${arr.length?arr.map(e=>`<article class="eventCard"><b>${esc(e.title||'Event')}</b><small>${esc(e.start||e.start_date||'')}</small></article>`).join(''):'<div class="empty"><h2>No upcoming events</h2></div>'}</section>`;
  }else if(state.tab==='grades'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/grades`});c.innerHTML=`<section class="page"><h1>Grades</h1><pre class="jsonView">${esc(JSON.stringify(x,null,2))}</pre></section>`;
  }else if(state.tab==='groups'){
    if(!uid)throw new Error('Schoology did not return the logged-in user ID.');
    const x=await A.api({path:`users/${uid}/groups`});const arr=x.group||x.groups||[];c.innerHTML=`<section class="page"><h1>Groups</h1><div class="cards">${arr.map(g=>`<button class="card"><b>${esc(g.name||g.title||'Group')}</b></button>`).join('')||'<p>No groups found.</p>'}</div></section>`;
  }else if(state.tab==='messages'){
    const x=await A.api({path:'messages/inbox',params:{limit:50}});const arr=x.message||x.messages||[];c.innerHTML=`<section class="page"><h1>Messages</h1>${arr.map(m=>`<article class="messageCard"><b>${esc(m.subject||'Message')}</b><small>${esc(m.created||'')}</small></article>`).join('')||'<div class="empty">No messages.</div>'}</section>`;
  }else if(state.tab==='notifications'){
    const x=await A.api({path:'notifications'});const arr=x.notification||x.notifications||[];c.innerHTML=`<section class="page"><h1>Notifications</h1>${arr.map(n=>`<article class="messageCard">${esc(n.title||n.message||'Notification')}</article>`).join('')||'<div class="empty">No notifications.</div>'}</section>`;
  }else if(state.tab==='resources'){
    c.innerHTML='<section class="page"><h1>Resources</h1><p>Resources</p></section>';
  }else if(state.tab==='people'){
    c.innerHTML='<section class="page"><h1>People</h1><p>People</p></section>';
  }else if(state.tab==='profile'){
    const u=state.auth?.user||{};c.innerHTML=`<section class="page profilePage"><h1>${esc(u.name_display||u.name||'Profile')}</h1><p>${esc(u.username||u.email||'')}</p></section>`;
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
