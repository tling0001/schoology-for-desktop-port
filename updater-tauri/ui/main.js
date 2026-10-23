(function(){
  'use strict';
  const invoke=window.__TAURI__?.core?.invoke;
  const listen=window.__TAURI__?.event?.listen;
  const status=document.getElementById('status');
  const foot=document.getElementById('foot');
  const cancel=document.getElementById('cancel');
  let finished=false;
  function setStep(data){
    if(data.status)status.textContent=data.status;
    const row=document.getElementById('activeStep'),titles={sevenDownload:'Download 7-Zip',sevenInstall:'Prepare 7-Zip',schoologyDownload:'Download Schoology',install:'Install Schoology'};
    if(row){row.hidden=false;row.classList.toggle('done',data.state==='done');row.classList.toggle('indeterminate',data.state==='indeterminate');row.classList.toggle('error',data.state==='error');
      const title=document.getElementById('stageTitle'),label=document.getElementById('stageState'),bar=document.getElementById('stageBar');
      if(title)title.textContent=titles[data.id]||'Update';if(label)label.textContent=data.text||'';
      if(bar){bar.style.width=data.percent==null?'0%':Math.max(0,Math.min(100,data.percent))+'%';bar.parentElement.classList.toggle('indeterminate',data.state==='indeterminate');}
    }
    if(data.state==='error'){
      finished=true;
      foot.className='error';
      foot.textContent=data.error||data.text||'The update failed.';
      cancel.textContent='Close';
      cancel.disabled=false;
    }
    if(data.state==='done'&&data.id==='install'){
      finished=true;
      foot.textContent='Update complete. Restarting Schoology…';
      cancel.disabled=true;
    }
  }
  async function start(){
    if(!invoke){status.textContent='The updater interface could not initialize.';return}
    try{
      const payload=await invoke('get_update_payload');
      const product=String(payload.productName||'Schoology');
      document.getElementById('title').textContent=(product==='Schoology'?'Updating ':'Switching to ')+product;
      const dark=payload.darkTheme===true||payload.themeMode==='dark'||(payload.themeMode!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme=dark?'dark':'light';
      if(listen)await listen('updater-progress',event=>setStep(event.payload||{}));
      cancel.addEventListener('click',async()=>{
        if(finished){await invoke('close_updater').catch(()=>{});return}
        cancel.disabled=true;cancel.textContent='Cancelling…';
        await invoke('cancel_update').catch(()=>{});
      });
      await invoke('start_update');
    }catch(error){
      finished=true;
      status.textContent='Update failed.';
      foot.className='error';
      foot.textContent=String(error?.message||error||'Unknown error');
      cancel.textContent='Close';
      cancel.disabled=false;
      cancel.onclick=()=>invoke('close_updater').catch(()=>{});
    }
  }
  document.addEventListener('DOMContentLoaded',start,{once:true});
})(); 
