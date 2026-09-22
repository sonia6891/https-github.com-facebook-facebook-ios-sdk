// Labour Standards Act art. 38: https://calcr2.mol.gov.tw/RestDays
// Hour conversion for variable working hours: https://www.mol.gov.tw/1607/28690/2282/2284/2292/7215/
function annualDate(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3]);
  return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d:null;
}
function annualAddMonths(date,months){
  const d=new Date(date.getFullYear(),date.getMonth()+months,1);
  d.setDate(Math.min(date.getDate(),daysInMonth(d.getFullYear(),d.getMonth())));
  return d;
}
function annualDayNumber(d){return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000}
function annualDayAfter(d,n=1){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n)}
function tenureInfo(asOf=new Date()){
  const start=annualDate(state.settings.hireDate);
  if(!start)return null;
  const today=new Date(asOf.getFullYear(),asOf.getMonth(),asOf.getDate());
  if(start>today)return{future:true,start};
  let months=(today.getFullYear()-start.getFullYear())*12+today.getMonth()-start.getMonth();
  if(annualAddMonths(start,months)>today)months--;
  return{years:Math.floor(months/12),months:months%12,days:annualDayNumber(today)-annualDayNumber(annualAddMonths(start,months)),start};
}
function statutoryAnnualLeaveDays(asOf=new Date()){
  const ten=tenureInfo(asOf);
  if(!ten||ten.future)return 0;
  if(ten.years===0)return ten.months<6?0:3;
  if(ten.years<2)return 7;
  if(ten.years<3)return 10;
  if(ten.years<5)return 14;
  if(ten.years<10)return 15;
  return Math.min(30,ten.years+6);
}
function annualLeavePeriod(asOf=new Date()){
  const mode=['calendar','custom'].includes(state.settings.annualLeaveCycle)?state.settings.annualLeaveCycle:'anniversary';
  const label=mode==='calendar'?'曆年制':mode==='custom'?'公司自訂':'到職週年制';
  const hire=annualDate(state.settings.hireDate),ten=tenureInfo(asOf);
  const today=new Date(asOf.getFullYear(),asOf.getMonth(),asOf.getDate());
  if(!hire||!ten||ten.future)return{missing:true,mode,label,reason:ten&&ten.future?'尚未到職，尚無法定特休額度':'請先設定有效的公司到職日'};
  let start,end;
  if(mode==='calendar'){
    start=new Date(today.getFullYear(),0,1);end=new Date(today.getFullYear()+1,0,1);
  }else if(mode==='custom'){
    const closing=annualDate(state.settings.annualCustomDate);
    if(!closing)return{missing:true,mode,label,reason:'請先設定公司特休結算日'};
    const dateInYear=y=>new Date(y,closing.getMonth(),Math.min(closing.getDate(),daysInMonth(y,closing.getMonth())));
    let y=today.getFullYear();
    if(dateInYear(y)<today)y++;
    start=annualDayAfter(dateInYear(y-1));end=annualDayAfter(dateInYear(y));
  }else{
    const m=ten.years>=1?ten.years*12:ten.months>=6?6:0;
    start=annualAddMonths(hire,m);end=annualAddMonths(hire,m===0?6:m===6?12:m+12);
  }
  const key=[iso(hire),mode,iso(start),iso(end)].join('|');
  return{missing:false,mode,label,hire,start,end,key,date:annualDayAfter(end,-1),today};
}
function annualPeriodQuota(period,asOf=new Date()){
  const legal=statutoryAnnualLeaveDays(asOf);
  if(period.missing||legal===0)return 0;
  if(period.mode==='anniversary')return legal;
  // Calendar/custom estimates apportion entitlement windows by calendar days.
  // This assumes continuous employment through the period, not employer approval.
  let total=0;
  for(let m=6;m<=(period.end.getFullYear()-period.hire.getFullYear()+1)*12;m=m===6?12:m+12){
    const begin=annualAddMonths(period.hire,m),end=annualAddMonths(period.hire,m===6?12:m+12);
    if(begin>=period.end)break;
    const overlap=Math.max(0,Math.min(annualDayNumber(end),annualDayNumber(period.end))-Math.max(annualDayNumber(begin),annualDayNumber(period.start)));
    if(overlap)total+=statutoryAnnualLeaveDays(begin)*overlap/(annualDayNumber(end)-annualDayNumber(begin));
  }
  return Math.round(total*1000000)/1000000;
}
function annualSupplementHours(period){
  if(period.missing)return 0;
  const values=state.settings.annualUsedHoursByPeriod;
  return values&&typeof values==='object'?Math.max(0,num(values[period.key])):0;
}
function annualLeaveBalanceInfo(asOf=new Date()){
  const period=annualLeavePeriod(asOf),daily=8,totalDays=annualPeriodQuota(period,asOf),totalHours=totalDays*daily;
  let recordedHours=0,plannedHours=0;
  if(!period.missing){
    for(const [date,st] of Object.entries(state.dayStatus||{})){
      if(!st||st.type!=='annual')continue;
      const d=annualDate(date);
      if(!d||d<period.start||d>=period.end||d<period.hire)continue;
      if(d<=period.today)recordedHours+=Math.max(0,num(st.hours));
      else plannedHours+=Math.max(0,num(st.hours));
    }
  }
  const carryHours=annualSupplementHours(period),usedHours=carryHours+recordedHours;
  const remainHours=Math.max(0,totalHours-usedHours-plannedHours),overHours=Math.max(0,usedHours+plannedHours-totalHours);
  return{period,daily,totalDays,totalHours,recordedHours,plannedHours,carryHours,usedHours,remainHours,overHours,usedDays:usedHours/daily,remainDays:remainHours/daily,pct:totalHours>0?Math.min(100,(usedHours+plannedHours)/totalHours*100):0};
}
function annualSettlementInfo(){
  const period=annualLeavePeriod();
  return period.missing?period:Object.assign({},period,{days:annualDayNumber(period.date)-annualDayNumber(period.today)});
}
function annualBalanceText(info){
  const p=info.period;
  if(p.missing)return p.reason;
  return(p.mode==='anniversary'?'本期法定 ':'本期比例試算 ')+fmtHours(info.totalDays)+' 天 / '+fmtHours(info.totalHours)+' 小時・已使用 '+fmtHours(info.usedHours)+' 小時'+(info.plannedHours?'・已排未休 '+fmtHours(info.plannedHours)+' 小時':'')+(info.overHours?'・超出額度 '+fmtHours(info.overHours)+' 小時':'');
}
function renderAnnualLeaveSettings(){
  const info=annualLeaveBalanceInfo(),p=info.period,ten=tenureInfo();
  const quota=$('settingAnnualQuota'),usage=$('settingAnnualUsedHours');
  quota.value=p.missing?'尚未取得額度':fmtHours(info.totalDays)+' 天 / '+fmtHours(info.totalHours)+' 小時';
  $('settingAnnualQuotaHint').textContent=p.missing?p.reason:(ten.years+' 年 '+ten.months+' 個月・'+p.label+'・本期 '+iso(p.start)+'～'+iso(p.date)+'。'+(p.mode==='anniversary'?'依到職年資自動計算，滿半年／週年自動更新。':'按日數比例試算，假設本期持續在職；公司換算及進位方式可能不同。'));
  usage.disabled=p.missing||statutoryAnnualLeaveDays()===0;
  if(document.activeElement!==usage)usage.value=info.carryHours;
  $('annualUsedHoursHint').textContent='只填本期尚未記錄在 App 的已休時數；已在排班表登記的特休會自動加總，請勿重複填入。';
  $('annualSettingsBalance').textContent=annualBalanceText(info)+(p.missing?'':'・剩餘可排 '+fmtHours(info.remainHours)+' 小時');
}
