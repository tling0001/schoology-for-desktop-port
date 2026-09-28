const app=document.getElementById('app');
const A=window.schoology;
if(!A){
  app.innerHTML='<div class="fatal"><h2>Schoology</h2><p>The application interface could not initialize.</p><p>The Electron authentication bridge did not load.</p></div>';
}
if(!A) throw new Error('Schoology preload bridge is unavailable');
const C={graphite:'#44505d',dark:'#22303e',blue:'#2e66a3',blueText:'#3183c8',bg:'#e7ebee',light:'#f4f5f5',white:'#fff',muted:'#868e96'};
let state={screen:'login',school:null,schools:[],q:'',loading:false,error:'',auth:null,user:null,tab:'home',searchToken:0};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){let h=state.screen==='login'?login():state.screen==='search'?schoolSearchScreen():state.screen==='credentials'?credentials():state.screen==='qr'?qr():shell();app.innerHTML=h;bind();return h}
function login(){return `<div class="login"><img class="logo" src="../assets/logo_schoology.png"><div class="loginBody"><button id="schoolLogin" class="primary">Log in through your School</button><button id="continueSchoology" class="secondary">Log in using schoology.com</button><button id="qrLogin" class="qrButton">Sign in with a QR code</button></div><div class="loginBottom">I need help signing in</div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function schoolSearchScreen(){return `<div class="login"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody"><div class="label">School</div><div class="searchWrap"><input id="schoolSearch" autocomplete="off" autofocus placeholder="Enter your School or domain" value="${esc(state.q)}"><span>⌕</span></div>${state.loading?'<div class="searchStatus">Searching…</div>':''}${state.schools.length?`<div class="suggestions">${state.schools.map((s,i)=>`<button class="suggestion" data-school="${i}"><b>${esc(s.title||'')}</b><small>${esc([s.id,s.domain,s.location].filter(Boolean).join(' • '))}</small></button>`).join('')}</div>`:''}${!state.loading&&state.q&&state.schools.length===0&&!state.error?'<div class="searchStatus">No schools found.</div>':''}</div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function credentials(){return `<div class="login"><button id="back" class="back">‹</button><img class="logo small" src="../assets/logo_schoology.png"><div class="loginBody">${state.school?`<div class="selected">${esc(state.school.title||'School')}</div>`:'<div class="accountTitle">Log in using schoology.com</div>'}<div class="label">Username or Email</div><input id="user" class="field" autocomplete="username"><div class="label">Password</div><input id="pass" class="field" type="password" autocomplete="current-password"><button id="signIn" class="primary">Login</button><button id="qrLogin" class="qrButton">Sign in with a QR code</button></div>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function qr(){return `<div class="qr"><button id="back" class="back">‹</button><h1>QR Code Login</h1><p>Scan Your Code</p><video id="video" autoplay playsinline muted></video><canvas id="canvas"></canvas><div class="qrbox"></div><p class="qrhint">Point your camera at the QR code shown in Schoology.</p>${state.error?`<div class="error">${esc(state.error)}</div>`:''}</div>`}
function shell(){const tabs=[['home','Home'],['courses','Courses'],['calendar','Calendar'],['grades','Grades'],['messages','Messages'],['notifications','Notifications'],['resources','Resources'],['profile','Profile']];return `<div class="shell"><header><img src="../assets/ic_launcher.png"><span>Schoology</span><button id="logout">Sign out</button></header><nav>${tabs.map(t=>`<button class="tab ${state.tab===t[0]?'active':''}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</nav><main id="content"><div class="loading">Loading…</div></main></div>`}
function bind(){
  const schoolBtn=document.getElementById('schoolLogin');if(schoolBtn)schoolBtn.onclick=()=>{state.error='';state.q='';state.schools=[];state.screen='search';render();document.getElementById('schoolSearch')?.focus()};
  const accountBtn=document.getElementById('continueSchoology');if(accountBtn)accountBtn.onclick=()=>{state.error='';state.school=null;state.screen='credentials';render();document.getElementById('user')?.focus()};
  const qrbtn=document.getElementById('qrLogin');if(qrbtn)qrbtn.onclick=()=>{state.error='';state.screen='qr';render();startQR()};
  const back=document.getElementById('back');if(back)back.onclick=()=>{stopQR();state.error='';state.screen=state.school?'search':'login';if(state.screen==='search')state.schools=[];render()};
  const q=document.getElementById('schoolSearch');
  if(q){q.oninput=async()=>{const start=q.selectionStart??q.value.length,end=q.selectionEnd??start;state.q=q.value;const query=q.value.trim();const restore=()=>{const el=document.getElementById('schoolSearch');if(el){el.focus();try{el.setSelectionRange(start,end)}catch{}}};if(query.length<1){state.schools=[];state.loading=false;render();restore();return}const token=++state.searchToken;state.loading=true;state.error='';render();restore();try{const results=await A.schoolSearch(query);if(token!==state.searchToken)return;state.schools=Array.isArray(results)?results:[]}catch(e){if(token===state.searchToken){state.schools=[];state.error=e.message||'Unable to search for schools.'}}finally{if(token===state.searchToken)state.loading=false}if(token===state.searchToken){render();restore()}}}
  document.querySelectorAll('[data-school]').forEach(b=>b.onclick=async()=>{state.school=state.schools[+b.dataset.school];state.schools=[];state.error='';const school=state.school;if(school?.login_type&&school.login_type!=='schoology'){const url=school.login_url||school.login_url_suggest;if(!url){state.error='This school did not provide a login URL.';render();return}state.loading=true;render();try{state.auth=await A.loginSchoolBrowser({loginUrl:url,domain:school.domain||''});await afterLogin()}catch(e){state.error=e.message||'School browser login failed.';state.screen='search';render()}finally{state.loading=false}return}state.screen='credentials';render();document.getElementById('user')?.focus()});
  const si=document.getElementById('signIn');if(si)si.onclick=async()=>{const user=document.getElementById('user')?.value||'',password=document.getElementById('pass')?.value||'';state.error='';if(!user||!password){state.error='Enter your username or email and password.';render();return}si.disabled=true;si.textContent='Logging you in…';try{state.auth=await A.loginCredentials({user,password,schoolId:state.school?.id??null});await afterLogin()}catch(e){state.error=e.message||'Login failed.';render()}};
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();loadTab()});
  const lo=document.getElementById('logout');if(lo)lo.onclick=async()=>{await A.logout();state.auth=null;state.school=null;state.screen='login';state.tab='home';render()}
}
async function afterLogin(){stopQR();state.screen='app';render();await loadTab()}
async function loadTab(){const c=document.getElementById('content');if(!c)return;c.innerHTML='<div class="loading">Loading…</div>';try{if(state.tab==='home'){const u=await A.api({path:'users/me'});c.innerHTML=`<section class="welcome"><h1>Welcome, ${esc(u.name_display||u.name||'')}</h1><p>Schoology</p></section>`}else if(state.tab==='courses'){const x=await A.api({path:'users/me/sections',params:{limit:100}});const arr=x.section||x.sections||[];c.innerHTML=`<h2>Courses</h2><div class="cards">${arr.map(s=>`<button class="card"><b>${esc(s.section_title||s.title||'Course')}</b><small>${esc(s.course_title||'')}</small></button>`).join('')||'<p>No courses found.</p>'}</div>`}else{c.innerHTML=`<h2>${state.tab[0].toUpperCase()+state.tab.slice(1)}</h2><p>This Schoology module is connected to the Android-compatible API layer.</p>`}}catch(e){c.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
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
