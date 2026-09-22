// Display-only hierarchy. Keep existing saved preset keys and date calculations intact.
let pendingTwoShiftBase=null;
function chineseScheduleCount(value){
  const n=Math.max(0,Math.trunc(Number(value)||0)),digits='零一二三四五六七八九';
  if(!n)return '零';
  if(n>9999)return String(n).split('').map(c=>digits[Number(c)]||c).join('');
  let rest=n,result='';
  for(const [unit,mark] of [[1000,'千'],[100,'百'],[10,'十'],[1,'']]){
    const count=Math.floor(rest/unit);rest%=unit;
    if(count)result+=(unit===10&&count===1&&!result?'':digits[count])+mark;
    else if(result&&rest&&!result.endsWith('零'))result+='零';
  }
  return result;
}
function scheduleFamily(schedule=state.schedule){
  return schedule.preset==='four-three'?'four-three':(schedule.preset==='2-2'||schedule.preset==='4-3')?'four-two':'custom';
}
function workRestLabel(schedule=state.schedule){return '做'+chineseScheduleCount(schedule.workDays)+'休'+chineseScheduleCount(schedule.offDays)}
function scheduleName(schedule=state.schedule){
  return scheduleFamily(schedule)==='four-two'?'四班二輪':scheduleFamily(schedule)==='four-three'?'四班三輪':'自訂排班';
}
function syncScheduleChoices(){
  // A remote import or another saved edit cancels the uncommitted family selection.
  if(pendingTwoShiftBase!==null&&pendingTwoShiftBase!==JSON.stringify(state.schedule))pendingTwoShiftBase=null;
  const pending=pendingTwoShiftBase!==null,family=pending?'four-two':scheduleFamily();
  $('patternPreset').value=family;
  $('twoShiftCycleRow').classList.toggle('hidden',family!=='four-two');
  $('twoShiftPendingHint').classList.toggle('hidden',!pending);
  $('twoShiftCycle').value=!pending&&scheduleFamily()==='four-two'?state.schedule.preset:'';
}
function changeScheduleFamily(value){
  if(value==='four-two'){
    pendingTwoShiftBase=scheduleFamily()==='four-two'?null:JSON.stringify(state.schedule);
    syncScheduleChoices();
    return;
  }
  pendingTwoShiftBase=null;
  if(value==='four-three'||value==='custom'){
    changeSchedulePreset(value);
    if(!$('rotationDialog').open)syncScheduleChoices();
  }
}
function changeTwoShiftCycle(value){
  if(value!=='2-2'&&value!=='4-3')return;
  pendingTwoShiftBase=null;
  if(state.schedule.preset===value){syncScheduleChoices();return}
  changeSchedulePreset(value);
}
