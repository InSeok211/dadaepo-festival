let schedules=[]; // 운영본부 모니터에서 실시간으로 채워짐

function formatScheduleDate(dateStr){
  if(!dateStr)return'';
  const d=new Date(`${dateStr}T00:00:00`);
  if(Number.isNaN(d.getTime()))return'';
  const week=['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getMonth()+1}.${d.getDate()}(${week})`;
}
function computeScheduleStatus(dateStr,timeStr,endStr){
  const start=new Date(`${dateStr}T${timeStr}:00`);
  const end=new Date(`${dateStr}T${endStr}:00`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return'next';
  if(end<=start)end.setDate(end.getDate()+1); // 자정을 넘기는 일정 보정
  const now=new Date();
  if(now<start)return'next';
  if(now>end)return'done';
  return'now';
}
let activeScheduleDay=1;
let currentScheduleMode='next';
function renderSchedule(mode=currentScheduleMode,el){
  currentScheduleMode=['next','now','done'].includes(mode)?mode:'next';
  if(el){document.querySelectorAll('.schedule-tab').forEach(b=>b.classList.remove('active'));el.classList.add('active')}
  const rows=schedules
    .filter(s=>s.published!==false&&Number(s.day||1)===activeScheduleDay)
    .map(s=>({...s,_status:computeScheduleStatus(s.date,s.time,s.end)}))
    .filter(s=>s._status===currentScheduleMode);
  document.getElementById('scheduleList').innerHTML=rows.length?rows.map(s=>`<article class="schedule-card ${s._status==='now'?'now':''}"><div class="time-box">${s.date?`<small class="schedule-date">${escapeHtml(formatScheduleDate(s.date))}</small>`:''}<strong>${escapeHtml(s.time)}</strong><span>~ ${escapeHtml(s.end)}</span></div><div><h4>${escapeHtml(s.title)}</h4><p>${escapeHtml(s.desc||'')}</p><div class="schedule-meta"><button class="location" onclick="goPage('map');focusPin('stage')">📍 ${escapeHtml(s.place||'')}</button><span class="status-badge">${s._status==='now'?'진행 중':s._status==='next'?'예정':'완료'}</span></div></div></article>`).join(''):`<div class="stamp-empty">현재 배포된 ${activeScheduleDay}일차의 ${currentScheduleMode==='now'?'진행 중':currentScheduleMode==='next'?'예정':'완료'} 일정이 없습니다.</div>`;
}

// ===== 운영본부 실시간 일정 관리 수신 =====
try{
  db.collection('events').doc(EVENT_ID).collection('schedule').onSnapshot(snap=>{
    schedules=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>item.published!==false);
    schedules.sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`));
    renderSchedule(currentScheduleMode);
  },err=>console.warn('schedule listen failed',err));
}catch(e){console.warn('schedule subscribe failed',e)}
try{
  db.collection('events').doc(EVENT_ID).collection('settings').doc('schedule').onSnapshot(doc=>{
    activeScheduleDay=Math.max(1,Math.min(3,Number(doc.exists?doc.data().activeDay:1)||1));
    renderSchedule(currentScheduleMode);
  },err=>console.warn('schedule setting listen failed',err));
}catch(e){console.warn('schedule setting subscribe failed',e)}
setInterval(()=>{if(!document.getElementById('mainApp').hidden)renderSchedule(currentScheduleMode)},30000); // 시간 경과에 따라 상태 자동 갱신
