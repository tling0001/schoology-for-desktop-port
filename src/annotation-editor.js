(function () {
  const api = () => window.schoology;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actionUrl = (actions, type) => (Array.isArray(actions) ? actions : []).find(a => (Array.isArray(a?.['@type']) ? a['@type'] : [a?.['@type']]).includes(type))?.['@href'] || '';
  const responseText = value => typeof value === 'string' ? value : String(value?.text ?? '');
  const signedActionUrl = links => links?.annotationAssignmentActions?.['@id'] || links?.annotationAssignmentActions?.id || '';
  const makeId = () => 'schoology-ink-' + Math.random().toString(36).slice(2, 11);
  const cloneStrokes = strokes => strokes.map(s => ({...s, points:s.points.map(p=>[p[0],p[1]])}));

  async function open(options) {
    const A = api();
    if (!A?.annotationRequest) throw new Error('The native annotation service is unavailable.');
    if (!options?.sectionId || !options?.assignmentId || !options?.fileId || !options?.pdfUrl) throw new Error('This PDF submission is missing the information needed to annotate it.');
    document.getElementById('schoologyAnnotationEditor')?.remove();
    const root = document.createElement('div');
    root.id = 'schoologyAnnotationEditor';
    root.className = 'annotationEditorOverlay';
    root.innerHTML = `<section class="annotationEditor" role="dialog" aria-modal="true" aria-label="Annotate PDF">
      <header class="annotationEditorAppBar">
        <button type="button" data-tool="close" class="annotationBackButton" aria-label="Back" title="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>
        <div class="annotationDocumentTitle"><b>${esc(options.filename || 'Annotate submission')}</b><span id="annotationEditorStatus">Opening PDF…</span></div>
        <button type="button" data-tool="save" class="annotationAppBarAction" title="Save draft">Save</button>
        <button type="button" data-tool="submit" class="annotationEditorSubmit" title="Submit annotated PDF">Submit</button>
      </header>
      <nav class="annotationEditorToolRow" aria-label="Annotation tools">
        <button type="button" data-tool="undo" disabled title="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 0 0-6.32 4H2l4 4 4-4H7.9A5 5 0 1 1 7 14H5a7 7 0 1 0 7-9z"/></svg><span>Undo</span></button>
        <button type="button" data-tool="redo" disabled title="Redo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 0 1 6.32 4H22l-4 4-4-4h2.1A5 5 0 1 0 17 14h2a7 7 0 1 1-7-9z"/></svg><span>Redo</span></button>
        <span class="annotationToolDivider"></span>
        <button type="button" data-tool="pen" class="selected" title="Pen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17.25 11.06-11.06 3.75 3.75L6.75 21H3v-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg><span>Pen</span></button>
        <button type="button" data-tool="highlighter" title="Highlight"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17.25 11.06-11.06 3.75 3.75L6.75 21H3v-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75zM2 22h20v-2H2z"/></svg><span>Highlight</span></button>
        <button type="button" data-tool="eraser" title="Erase"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16.24 3.56 4.2 4.2a2 2 0 0 1 0 2.83l-8.49 8.49a2 2 0 0 1-2.82 0l-5.66-5.66a2 2 0 0 1 0-2.83l7.07-7.07a4 4 0 0 1 5.7.04zM7.7 10.93l5.66 5.66 5.66-5.66-5.66-5.66zM2 21h20v-2H2z"/></svg><span>Erase</span></button>
      </nav>
      <div class="annotationEditorPages" id="annotationEditorPages"><div class="annotationEditorLoading">Loading PDF and saved annotations…</div></div>
    </section>`;
    document.body.appendChild(root);
    const pagesEl = root.querySelector('#annotationEditorPages');
    const statusEl = root.querySelector('#annotationEditorStatus');
    const toolButtons = [...root.querySelectorAll('[data-tool]')];
    let closed = false, busy = false, dirty = false, dirtyVersion = 0, saveTimer = 0, savingPromise = null, tool = 'pen', pdfjs, pdf, putUrl = '', finishUrl = '';
    let strokes = [], undoStack = [], redoStack = [], unknownXfdfNodes = [], pageCanvases = [];
    const status = value => { if (statusEl) statusEl.textContent = value; };
    const close = () => { closed = true; if (saveTimer) clearTimeout(saveTimer); root.remove(); };
    const setBusy = value => { busy = value; toolButtons.forEach(b => { if (b.dataset.tool !== 'close') b.disabled = value || ((b.dataset.tool === 'undo') ? !undoStack.length : (b.dataset.tool === 'redo') ? !redoStack.length : false); }); };
    root.querySelector('[data-tool="close"]').onclick = async () => {
      if (dirty && !busy && !confirm('There are unsaved annotation changes. Close anyway?')) return;
      close();
    };
    root.addEventListener('click', e => { if (e.target === root && !busy) { if (!dirty || confirm('There are unsaved annotation changes. Close anyway?')) close(); } });
    toolButtons.forEach(button => button.addEventListener('click', async () => {
      const next = button.dataset.tool;
      if (next === 'close') return;
      if (next === 'undo') { if (undoStack.length) { redoStack.push(cloneStrokes(strokes)); strokes = undoStack.pop(); renderAll(); markDirty(); } }
      else if (next === 'redo') { if (redoStack.length) { undoStack.push(cloneStrokes(strokes)); strokes = redoStack.pop(); renderAll(); markDirty(); } }
      else if (next === 'pen' || next === 'highlighter' || next === 'eraser') { tool = next; toolButtons.forEach(b => b.classList.toggle('selected', b.dataset.tool === tool)); }
      else if (next === 'save') { try { await save(); } catch (e) { status('Save failed'); alert('Unable to save annotation draft: ' + (e?.message || e)); } }
      else if (next === 'submit') {
        if (!confirm('Submit this annotated PDF to Schoology? You may not be able to edit it after submitting.')) return;
        try {
          setBusy(true); status('Saving before submit…'); await save(true);
          if (!finishUrl) throw new Error('Schoology did not provide a submit action for this assignment.');
          status('Submitting…');
          await A.annotationRequest({url:finishUrl,method:'POST',contentType:'application/json',body:JSON.stringify({fileId:String(options.fileId),fileType:String(options.fileType || 'application/pdf')})});
          dirty = false; status('Submitted'); close();
          if (typeof options.onSubmitted === 'function') await options.onSubmitted();
        } catch (e) { status('Submit failed'); alert('Unable to submit annotated PDF: ' + (e?.message || e)); }
        finally { if (!closed) setBusy(false); }
      }
    }));

    const call = async (url, method='GET', body, contentType='') => {
      const result = await A.annotationRequest({url,method,body,contentType});
      if (result?.status >= 400) throw new Error('HTTP ' + result.status);
      return result;
    };
    const xmlDocument = value => new DOMParser().parseFromString(value, 'application/xml');
    const parseXfdf = text => {
      if (!text || !text.trim()) return;
      const doc = xmlDocument(text);
      if (doc.querySelector('parsererror')) return;
      const rootNode = doc.querySelector('xfdf');
      const annots = rootNode?.querySelector('annots');
      if (!annots) return;
      for (const node of [...annots.children]) {
        if (node.localName !== 'ink') { unknownXfdfNodes.push(new XMLSerializer().serializeToString(node)); continue; }
        const page = Math.max(0, Number(node.getAttribute('page') || 0));
        const gesture = node.querySelector('gesture')?.textContent?.trim() || '';
        const values = gesture.split(/[\s,]+/).map(Number).filter(Number.isFinite);
        const points = [];
        for (let i=0;i+1<values.length;i+=2) points.push([values[i],values[i+1]]);
        if (points.length) strokes.push({page,points,color:node.getAttribute('color')||'#1565c0',width:Number(node.getAttribute('width')||2),opacity:Number(node.getAttribute('opacity')||1),name:node.getAttribute('name')||makeId()});
      }
    };
    const serializeXfdf = () => {
      const ink = strokes.map(s => {
        const xs=s.points.map(p=>p[0]), ys=s.points.map(p=>p[1]);
        const rect=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(n=>Number(n.toFixed(3))).join(',');
        const gesture=s.points.map(p=>p.map(n=>Number(n.toFixed(3))).join(',')).join(' ');
        return '<ink page="'+s.page+'" rect="'+rect+'" color="'+esc(s.color)+'" width="'+s.width+'" opacity="'+s.opacity+'" flags="print" name="'+esc(s.name||makeId())+'" subject="Ink"><inklist><gesture>'+gesture+'</gesture></inklist></ink>';
      }).join('');
      return '<?xml version="1.0" encoding="UTF-8"?><xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve"><annots>'+unknownXfdfNodes.join('')+ink+'</annots></xfdf>';
    };
    const pointToScreen = (page, point) => page.viewport.convertToViewportPoint(point[0], point[1]);
    function renderPageStrokes(page) {
      const ctx=page.overlay.getContext('2d');
      ctx.clearRect(0,0,page.overlay.width,page.overlay.height);
      ctx.save(); ctx.scale(page.dpr,page.dpr); ctx.lineCap='round'; ctx.lineJoin='round';
      for (const s of strokes) {
        if (s.page !== page.number || !s.points.length) continue;
        ctx.globalAlpha=s.opacity ?? 1; ctx.strokeStyle=s.color; ctx.lineWidth=s.width||2; ctx.beginPath();
        const first=pointToScreen(page,s.points[0]); ctx.moveTo(first[0],first[1]);
        for (const p of s.points.slice(1)) { const pt=pointToScreen(page,p); ctx.lineTo(pt[0],pt[1]); }
        if(s.points.length===1){ctx.lineTo(first[0]+.1,first[1]+.1)}
        ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha=1;
    }
    function renderAll(){ pageCanvases.forEach(renderPageStrokes); root.querySelector('[data-tool="undo"]').disabled=!undoStack.length||busy;root.querySelector('[data-tool="redo"]').disabled=!redoStack.length||busy; }
    function markDirty(){dirty=true;dirtyVersion++;status('Unsaved changes');if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>status('Autosave failed: '+(e?.message||'error'))),1500);}
    async function save(force=false) {
      if (!putUrl) throw new Error('Schoology did not provide a draft-save URL.');
      if (saveTimer) { clearTimeout(saveTimer); saveTimer=0; }
      if (savingPromise) await savingPromise;
      if (!dirty && !force) { status('All changes saved'); return; }
      const savedVersion=dirtyVersion, payload=serializeXfdf();
      status('Saving draft…');
      savingPromise=call(putUrl,'PUT',payload,'application/xml');
      try { await savingPromise; }
      finally { savingPromise=null; }
      if (dirtyVersion===savedVersion) { dirty=false; status('Draft saved'); }
      else { dirty=true; status('Changes made during save — saving again…'); if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>status('Autosave failed: '+(e?.message||'error'))),500); }
    }
    const pushUndo = () => { undoStack.push(cloneStrokes(strokes)); if(undoStack.length>80)undoStack.shift();redoStack=[]; };
    const distanceToStroke = (page, stroke, x, y) => {
      if(stroke.page!==page.number)return Infinity;
      let best=Infinity;for(const p of stroke.points){const q=pointToScreen(page,p);best=Math.min(best,Math.hypot(q[0]-x,q[1]-y));}return best;
    };
    function bindOverlay(page) {
      const canvas=page.overlay;let active=null;
      canvas.addEventListener('pointerdown',e=>{
        if(busy||closed)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
        if(tool==='eraser'){let index=-1,best=24;strokes.forEach((s,i)=>{const d=distanceToStroke(page,s,x,y);if(d<best){best=d;index=i}});if(index>=0){pushUndo();strokes.splice(index,1);renderAll();markDirty()}return}
        pushUndo();const pdfPoint=page.viewport.convertToPdfPoint(x,y);
        active={page:page.number,points:[[pdfPoint[0],pdfPoint[1]]],color:tool==='highlighter'?'#f5c542':'#1565c0',width:tool==='highlighter'?12:2.2,opacity:tool==='highlighter'?.32:1,name:makeId()};
        strokes.push(active);canvas.setPointerCapture(e.pointerId);renderAll();
      });
      canvas.addEventListener('pointermove',e=>{if(!active)return;const rect=canvas.getBoundingClientRect(),pt=page.viewport.convertToPdfPoint(e.clientX-rect.left,e.clientY-rect.top);active.points.push([pt[0],pt[1]]);renderAll()});
      const finish=()=>{if(!active)return;active=null;markDirty();renderAll()};
      canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
    }
    try {
      const initial = await call('https://'+(await A.getServerInstance?.().catch(()=>false) ? 'api.schoologyca.com':'api.schoology.com')+'/v2/sections/'+encodeURIComponent(options.sectionId)+'/assignments/'+encodeURIComponent(options.assignmentId));
      const initialActions=initial?.['@actions']||initial?.actions||[];
      const revisions=initial?.submissions?.revisions||[];
      const hasDraft=Array.isArray(revisions)&&revisions.some(r=>r?.isDraft===true);
      const initialLinks=initial?.links||{};
      const restoreUrl=actionUrl(initialActions,'assignment:restoreAssignment');
      const startUrl=actionUrl(initialActions,'assignment:startAssignment');
      let session=initial, actionLink=signedActionUrl(initialLinks);
      if(hasDraft && restoreUrl){status('Restoring saved draft…');await call(restoreUrl,'POST','{}','application/json');}
      else {
        if(!startUrl)throw new Error('Schoology did not provide a start-annotation action for this assignment.');
        status('Starting annotation…');session=await call(startUrl,'POST','{}','application/json');actionLink=signedActionUrl(session?.links)||actionLink;
      }
      finishUrl=actionUrl(session?.['@actions']||session?.actions,'assignment:finishAssignment')||actionUrl(initialActions,'assignment:finishAssignment');
      if(!actionLink)throw new Error('Schoology did not provide an annotation-action link.');
      status('Preparing secure annotation storage…');
      const signed=await call(actionLink);
      const signedActions=signed?.['@actions']||signed?.actions||[];
      const getUrl=(Array.isArray(signedActions)?signedActions:[]).find(a=>String(a?.['@method']||a?.method).toUpperCase()==='GET')?.['@href']||signed?.getAnnotationsUrl||'';
      putUrl=(Array.isArray(signedActions)?signedActions:[]).find(a=>String(a?.['@method']||a?.method).toUpperCase()==='PUT')?.['@href']||signed?.putAnnotationsUrl||'';
      if(!getUrl||!putUrl)throw new Error('Schoology did not return both annotation read and save URLs.');
      let xfdf;
      try { xfdf=await call(getUrl); }
      catch (e) { if (/HTTP (?:403|404)\\b/.test(String(e?.message||e))) xfdf={text:''}; else throw e; }
      parseXfdf(responseText(xfdf));
      const file=A.annotationRequest({url:options.pdfUrl,binary:true});
      let pdfjsAssetRoot='./pdfjs/';
      try { pdfjs=await import('./pdfjs/pdf.mjs'); }
      catch (_) { pdfjsAssetRoot='../node_modules/pdfjs-dist/'; pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.mjs'); pdfjsAssetRoot='../node_modules/pdfjs-dist/'; }
      const buildRoot=pdfjsAssetRoot==='./pdfjs/'?'./pdfjs/':'../node_modules/pdfjs-dist/build/';
      pdfjs.GlobalWorkerOptions.workerSrc=new URL(buildRoot+'pdf.worker.mjs',document.baseURI).toString();
      const downloaded=await file;
      if(!downloaded?.base64)throw new Error('Schoology did not return the PDF file data.');
      const raw=atob(downloaded.base64), bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const assetRoot=pdfjsAssetRoot==='./pdfjs/'?'./pdfjs/':'../node_modules/pdfjs-dist/';
      pdf=await pdfjs.getDocument({data:bytes,cMapUrl:new URL(assetRoot+'cmaps/',document.baseURI).toString(),cMapPacked:true,standardFontDataUrl:new URL(assetRoot+'standard_fonts/',document.baseURI).toString(),wasmUrl:new URL(assetRoot+'wasm/',document.baseURI).toString()}).promise;
      pagesEl.innerHTML=''; pageCanvases=[];
      for(let number=1;number<=pdf.numPages;number++){
        const page=await pdf.getPage(number);
        const container=document.createElement('section');container.className='annotationPdfPage';
        const base=document.createElement('canvas');base.className='annotationPdfCanvas';
        const overlay=document.createElement('canvas');overlay.className='annotationInkCanvas';
        container.append(base,overlay);pagesEl.appendChild(container);
        const natural=page.getViewport({scale:1}), maxWidth=Math.max(320,Math.min(1050,pagesEl.clientWidth-36));
        const scale=Math.min(1.5,maxWidth/natural.width), viewport=page.getViewport({scale});
        const dpr=Math.min(2,window.devicePixelRatio||1);
        for(const canvas of [base,overlay]){canvas.width=Math.floor(viewport.width*dpr);canvas.height=Math.floor(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px'}
        const pageCtx=base.getContext('2d');await page.render({canvasContext:pageCtx,viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise;
        const data={number:number-1,viewport,overlay,dpr};pageCanvases.push(data);bindOverlay(data);
      }
      renderAll();status('Ready — drafts autosave');
      setBusy(false);
      root.querySelector('[data-tool="undo"]').disabled=true;root.querySelector('[data-tool="redo"]').disabled=true;
    } catch (error) {
      if (!closed) { status('Could not open annotation editor'); pagesEl.innerHTML='<div class="annotationEditorError"><b>Unable to open this PDF for annotation.</b><p>'+esc(error?.message||error)+'</p><button type="button" id="annotationEditorRetryClose">Close</button></div>';pagesEl.querySelector('#annotationEditorRetryClose')?.addEventListener('click',close);setBusy(false); }
    }
  }
  window.schoologyAnnotationEditor = { open };
})();