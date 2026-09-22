// Date edits are drafts. Only an explicit mobile confirmation commits them.
const workDateMedia=window.matchMedia('(max-width:760px)');
const workDateBindings=new Map();
let workDateSession=null;
function dateParts(value){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
  if(!match)return null;
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
  if(y<1||m<1||m>12||d<1||d>dateMonthLength(y,m))return null;
  return{y,m,d};
}
function dateMonthLength(y,m){
  return m===2?((y%4===0&&y%100!==0)||y%400===0?29:28):([4,6,9,11].includes(m)?30:31);
}
function setDateControlValue(id,value){
  const field=$(id),binding=workDateBindings.get(id);
  if(!field||binding?.nativeEditing||(workDateSession&&workDateSession.binding===binding))return;
  const next=String(value||'');
  if(field.value!==next)field.value=next;
}
function workDateOptions(select,placeholder,values,suffix){
  select.replaceChildren(new Option(placeholder,''),...values.map(n=>new Option(n+suffix,String(n))));
}
function workDateValue(){
  const y=$('workDateYear').value,m=$('workDateMonth').value,d=$('workDateDay').value;
  if(!y||!m||!d)return '';
  const value=y.padStart(4,'0')+'-'+pad(m)+'-'+pad(d);
  return dateParts(value)?value:'';
}
function updateWorkDateDays(preferred){
  const y=Number($('workDateYear').value),m=Number($('workDateMonth').value),day=$('workDateDay');
  const old=preferred===undefined?day.value:String(preferred||'');
  const count=y&&m?dateMonthLength(y,m):0;
  workDateOptions(day,'選日期',Array.from({length:count},(_,i)=>i+1),' 日');
  day.disabled=!count;
  // Never silently turn February 29 or the 31st into another date.
  day.value=Number(old)>0&&Number(old)<=count?old:'';
  updateWorkDatePreview();
}
function updateWorkDatePreview(){
  const value=workDateValue(),parts=dateParts(value);
  $('workDateConfirm').disabled=!parts;
  $('workDateSelection').textContent=parts?parts.y+' 年 '+parts.m+' 月 '+parts.d+' 日':'尚未選完日期，不會儲存。';
}
function openWorkDate(binding){
  const dialog=$('workDateDialog');
  if(!workDateMedia.matches||dialog.open)return;
  const existing=dateParts(binding.read());
  workDateSession={binding};
  const currentYear=new Date().getFullYear(),low=Math.min(1900,existing?.y||1900),high=Math.max(currentYear+20,existing?.y||currentYear);
  workDateOptions($('workDateYear'),'選年份',Array.from({length:high-low+1},(_,i)=>high-i),' 年');
  workDateOptions($('workDateMonth'),'選月份',Array.from({length:12},(_,i)=>i+1),' 月');
  $('workDateYear').value=existing?String(existing.y):'';
  $('workDateMonth').value=existing?String(existing.m):'';
  updateWorkDateDays(existing?.d||'');
  $('workDateTitle').textContent=binding.label;
  $('workDateClear').hidden=binding.required;
  dialog.returnValue='';
  dialog.showModal();
  $('workDateTitle').focus({preventScroll:true});
}
function closeWorkDate(){
  const session=workDateSession;
  workDateSession=null;
  $('workDateDialog').close();
  if(session){
    setDateControlValue(session.binding.id,session.binding.read());
    session.binding.field.focus({preventScroll:true});
  }
}
function commitWorkDate(value){
  const session=workDateSession;
  if(!session||(!value&&session.binding.required)||(value&&!dateParts(value)))return;
  const binding=session.binding;
  closeWorkDate();
  if(String(binding.read()||'')===value)return;
  binding.write(value);
  setDateControlValue(binding.id,value);
  // Persist and refresh only once, after the date editor has closed.
  binding.save();
  render();
}
function bindWorkDate(id,label,key,isSchedule=false,required=false){
  const field=$(id);
  const binding={id,field,label,required,nativeEditing:false,nativeDirty:false,
    read:()=>isSchedule?state.schedule[key]:state.settings[key],
    write:value=>{if(isSchedule)state.schedule[key]=value;else state.settings[key]=value},
    save:()=>isSchedule?saveSchedulePrefs():changedAndSync()};
  workDateBindings.set(id,binding);
  const labelNode=field.closest('.field')?.querySelector('label');
  if(labelNode)labelNode.htmlFor=id;
  function mode(){
    field.readOnly=workDateMedia.matches;
    if(workDateMedia.matches){field.setAttribute('aria-haspopup','dialog');field.setAttribute('aria-controls','workDateDialog')}
    else{field.removeAttribute('aria-haspopup');field.removeAttribute('aria-controls')}
  }
  mode();workDateMedia.addEventListener('change',mode);
  field.addEventListener('pointerdown',event=>{
    if(workDateMedia.matches&&event.button===0){event.preventDefault();openWorkDate(binding)}
  });
  field.addEventListener('click',event=>{
    if(workDateMedia.matches){event.preventDefault();openWorkDate(binding)}
  });
  field.addEventListener('keydown',event=>{
    if(workDateMedia.matches&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openWorkDate(binding)}
  });
  field.addEventListener('focus',()=>{if(!workDateMedia.matches)binding.nativeEditing=true});
  function finishNative(){
    binding.nativeEditing=false;
    if(!binding.nativeDirty)return;
    binding.nativeDirty=false;
    const value=field.value;
    if((value&&!dateParts(value))||(!value&&(required||field.validity.badInput))){setDateControlValue(id,binding.read());return}
    if(value===String(binding.read()||''))return;
    binding.write(value);binding.save();render();
  }
  // Desktop keeps its native date field, but no full render while navigating it.
  field.oninput=()=>{if(!workDateMedia.matches)binding.nativeDirty=true};
  field.onchange=()=>{
    if(workDateMedia.matches)return;
    binding.nativeDirty=true;
    if(document.activeElement!==field)finishNative();
  };
  field.addEventListener('blur',()=>{if(!workDateMedia.matches)finishNative()});
}
$('workDateYear').onchange=()=>updateWorkDateDays();
$('workDateMonth').onchange=()=>updateWorkDateDays();
$('workDateDay').onchange=updateWorkDatePreview;
$('workDateConfirm').onclick=()=>commitWorkDate(workDateValue());
$('workDateCancel').onclick=closeWorkDate;
$('workDateClear').onclick=()=>commitWorkDate('');
$('workDateDialog').addEventListener('cancel',event=>{event.preventDefault();closeWorkDate()});
bindWorkDate('settingHireDate','公司到職日','hireDate');
bindWorkDate('settingAnnualCustomDate','公司特休結算日','annualCustomDate');
bindWorkDate('scheduleStart','第一個上班日','startDate',true,true);
