// Personal four-team/three-shift rotation. Existing on/off schedules remain unchanged.
const THREE_SHIFT_META={early:{label:'早班',short:'早',cls:'st-r-early'},middle:{label:'中班',short:'中',cls:'st-r-middle'},night:{label:'夜班',short:'夜',cls:'st-r-night'},off:{label:'休假',short:'休',cls:'st-r-off'}};
const THREE_SHIFT_EXAMPLE=['early','early','middle','middle','night','night','off','off'];
function threeShiftPlan(schedule=state.schedule){
  const r=schedule&&schedule.rotation;
  if(!r||!Array.isArray(r.sequence)||r.sequence.length<4||r.sequence.length>96||!dateParts(r.startDate))return null;
  if(r.sequence.some(k=>!Object.prototype.hasOwnProperty.call(THREE_SHIFT_META,k))||Object.keys(THREE_SHIFT_META).some(k=>!r.sequence.includes(k)))return null;
  return r;
}
function threeShiftForDate(dt,schedule=state.schedule){
  if(schedule.preset!=='four-three')return null;
  const r=threeShiftPlan(schedule);if(!r)return null;
  const p=dateParts(r.startDate),start=new Date(0);start.setUTCFullYear(p.y,p.m-1,p.d);start.setUTCHours(0,0,0,0);
  const date=new Date(0);date.setUTCFullYear(dt.getFullYear(),dt.getMonth(),dt.getDate());date.setUTCHours(0,0,0,0);
  if(!Number.isFinite(date.getTime()))return null;
  const diff=Math.round((date-start)/DAY),length=r.sequence.length,index=((diff%length)+length)%length,key=r.sequence[index];
  return{...THREE_SHIFT_META[key],key,index,work:key!=='off'};
}
function rotationCompactLabel(sequence){
  const groups=[];sequence.forEach(k=>{const last=groups[groups.length-1];if(last&&last.key===k)last.count++;else groups.push({key:k,count:1})});
  return groups.map(g=>THREE_SHIFT_META[g.key].label+g.count+'天').join(' → ');
}
function threeShiftPill(dt){const r=threeShiftForDate(dt);return r?'<div class="status-pill '+r.cls+'">'+r.label+'</div>':''}
function updateRotationSummary(){
  const active=state.schedule.preset==='four-three',r=threeShiftPlan();
  $('rotationActiveInfo').classList.toggle('hidden',!active);
  $('legacyShiftField').classList.toggle('hidden',active);
  $('legacyStartField').classList.toggle('hidden',active);
  $('scheduleRuleHint').textContent=active?'顯示你自己的早／中／夜班與休假；假別和加班仍可逐日記錄。':'另一班會自動推算；假別或加班會在月曆上覆蓋原班別。';
  if(!active)return;
  if(!r){$('scheduleSummary').textContent='四班三輪｜請重新設定循環';$('settingsScheduleSummary').textContent='四班三輪・尚未設定有效循環';$('rotationPatternText').textContent='循環資料不完整，請重新設定後再使用。';return}
  $('scheduleSummary').textContent='四班三輪｜'+r.sequence.length+' 天一循環｜第1天 '+r.startDate;
  $('settingsScheduleSummary').textContent='四班三輪・'+r.sequence.length+' 天循環・'+r.startDate;
  $('rotationPatternText').textContent=rotationCompactLabel(r.sequence);
  const legend=$('calendarLegend');
  // Replace only the two legacy A/B labels; all leave/overtime/holiday legends stay intact.
  const items=Array.from(legend.children);if(items[0])items[0].remove();if(items[1])items[1].remove();
  ['early','middle','night'].reverse().forEach(k=>{const span=document.createElement('span');span.className='legend-item';span.innerHTML='<span class="dot '+THREE_SHIFT_META[k].cls+'"></span>'+THREE_SHIFT_META[k].label;legend.prepend(span)});
}
function parseRotationSequence(raw){
  const aliases={早:'early',早班:'early',中:'middle',中班:'middle',夜:'night',夜班:'night',晚:'night',晚班:'night',休:'off',休假:'off',休息:'off'};
  const text=String(raw||'').trim();if(!text)return null;
  const words=text.split(/[\s,，、;；→>\/|]+/).filter(Boolean);
  if(words.length<4||words.length>96||words.some(s=>!Object.prototype.hasOwnProperty.call(aliases,s)))return null;
  const sequence=words.map(s=>aliases[s]);return Object.keys(THREE_SHIFT_META).every(k=>sequence.includes(k))?sequence:null;
}
function rotationDraftPreview(){
  const sequence=parseRotationSequence($('rotationSequence').value),box=$('rotationPreview');
  box.replaceChildren();$('rotationError').textContent='';
  if(!sequence){box.textContent='一天填一個「早、中、夜、休」，並用空格分開；完整循環須包含三種班次及休假。';return}
  sequence.forEach((k,i)=>{const chip=document.createElement('span');chip.className='rotation-chip '+THREE_SHIFT_META[k].cls;chip.textContent=(i+1)+' '+THREE_SHIFT_META[k].short;box.appendChild(chip)});
  const summary=document.createElement('span');summary.className='rotation-count';summary.textContent='共 '+sequence.length+' 天，結束後從第1天重複。';box.appendChild(summary);
}
function openRotationSetup(){
  const r=threeShiftPlan(),dialog=$('rotationDialog');if(dialog.open)return;
  $('rotationSequence').value=(r?r.sequence:THREE_SHIFT_EXAMPLE).map(k=>THREE_SHIFT_META[k].short).join(' ');
  $('rotationStart').value=r?r.startDate:(state.schedule.startDate||iso(new Date()));
  $('rotationExampleHint').textContent=r?'依照你已儲存的輪轉順序編輯；修改後按「套用班制」。':'目前填入的是 2早 → 2中 → 2夜 → 2休的範例，請核對或修改成公司的實際循環再套用。';
  rotationDraftPreview();dialog.returnValue='';dialog.showModal();$('rotationTitle').focus({preventScroll:true});
}
function applyRotationSetup(){
  const sequence=parseRotationSequence($('rotationSequence').value),startDate=$('rotationStart').value;
  if(!sequence){$('rotationError').textContent='請填寫4～96天的完整循環，包含早、中、夜、休，一天一個並以空格分開。';return}
  if(!dateParts(startDate)){$('rotationError').textContent='請選擇循環第1天的完整日期。';return}
  state.schedule.rotation={sequence,startDate};state.schedule.preset='four-three';
  $('rotationDialog').close();saveSchedulePrefs();render();
}
function changeSchedulePreset(value){
  if(value==='four-three'){
    // Choosing an unfamiliar rotation never silently applies an assumed company roster.
    if(state.schedule.preset!=='four-three'||!threeShiftPlan())openRotationSetup();
    return;
  }
  state.schedule.preset=value;
  if(value==='2-2'){state.schedule.workDays=2;state.schedule.offDays=2}
  else if(value==='4-3'){state.schedule.workDays=4;state.schedule.offDays=3}
  saveSchedulePrefs();render();
}
