const DEFAULTS={courseMaterials:true,courses:true,courseUpdates:true,courseGrades:true,groups:true,homepage:true,resources:true,peopleDirectory:true,profiles:true,messages:true,accountSettings:true,calendar:true,grades:true,other:true};
const controls=[...document.querySelectorAll('[data-option]')];const status=document.getElementById('status');
function paintStatus(kind,message){status.className=kind||'';status.innerHTML='<span class="status-dot"></span> '+message}
function readValues(){return Object.fromEntries(controls.map(input=>[input.dataset.option,input.checked]))}
function paint(values){controls.forEach(input=>{input.checked=values[input.dataset.option]!==false})}
function save(){paintStatus('saving','Saving preferences…');chrome.storage.sync.set(readValues(),()=>paintStatus(chrome.runtime.lastError?'error':'',chrome.runtime.lastError?'Could not save. Check Chrome sync storage permissions.':'All changes saved'))}
chrome.storage.sync.get(DEFAULTS,values=>{paint({...DEFAULTS,...values});paintStatus('','All changes saved')});
controls.forEach(input=>input.addEventListener('change',save));
document.getElementById('selectAll').addEventListener('click',()=>{controls.forEach(input=>input.checked=true);save()});
document.getElementById('selectNone').addEventListener('click',()=>{controls.forEach(input=>input.checked=false);save()});
document.getElementById('reset').addEventListener('click',()=>{paint(DEFAULTS);chrome.storage.sync.set(DEFAULTS,()=>paintStatus(chrome.runtime.lastError?'error':'',chrome.runtime.lastError?'Could not restore defaults.':'Default settings restored.'))});