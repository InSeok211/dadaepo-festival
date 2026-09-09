// ===== 운영본부 실시간 공지 방송 수신 (여러 건) =====
const NOTICE_TYPE={urgent:{label:'긴급 공지',emoji:'📢'},info:{label:'안내',emoji:'ℹ️'},safety:{label:'안전 안내',emoji:'🦺'}};
let liveNotices=[]; // 활성 공지만, 최신순
function seenNoticeIds(){try{return new Set(JSON.parse(safeStorage.getItem('festival.seenNoticeIds')||'[]'))}catch(e){return new Set()}}
function unseenNotices(){const seen=seenNoticeIds();return liveNotices.filter(n=>!seen.has(n.id))}
function markNoticeSeen(){
  const seen=seenNoticeIds();
  liveNotices.forEach(n=>seen.add(n.id));
  safeStorage.setItem('festival.seenNoticeIds',JSON.stringify([...seen].slice(-100)));
  updateNoticeDot();
}
function updateNoticeDot(){
  const dot=document.querySelector('.notice-dot');
  if(dot)dot.style.display=unseenNotices().length?'block':'none';
}
function applyLiveNotices(){
  const strong=document.querySelector('.home-alert strong');
  const badge=document.querySelector('.home-alert .alert-badge');
  if(liveNotices.length){
    const latest=liveNotices[0];
    const t=NOTICE_TYPE[latest.type]||NOTICE_TYPE.urgent;
    if(strong)strong.textContent=latest.title||t.label;
    if(badge)badge.textContent=liveNotices.length>1?`공지 ${liveNotices.length}건`:t.label;
  }else{
    if(strong)strong.textContent='현장 상황에 따라 공연 시간이 변경될 수 있습니다.';
    if(badge)badge.textContent='긴급 공지';
  }
  updateNoticeDot();
}
applyLiveNotices(); // Firestore 수신 전에도 기본 상태(공지 없음)로 정규화

function noticeCardHtml(n){
  const t=NOTICE_TYPE[n.type]||NOTICE_TYPE.urgent;
  const when=(n.updatedAt&&n.updatedAt.toDate)?n.updatedAt.toDate().toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'';
  const body=escapeHtml(n.body||'').replace(/\n/g,'<br>');
  return `<article class="notice-feed-item"><div class="notice-feed-head"><span class="notice-feed-badge${n.type&&n.type!=='urgent'?' '+n.type:''}">${t.emoji} ${t.label}</span>${when?`<span class="notice-feed-time">${when}</span>`:''}</div><strong>${escapeHtml(n.title||t.label)}</strong>${body?`<p>${body}</p>`:''}</article>`;
}
function openNotice(){
  const c=document.getElementById('sheetContent');
  if(liveNotices.length){
    c.innerHTML=`
      <div class="sheet-hero">📢</div>
      <h3>축제 공지</h3><div class="sub">현재 활성 공지 ${liveNotices.length}건</div>
      <div class="notice-feed">${liveNotices.map(noticeCardHtml).join('')}</div>
      <div class="sheet-actions"><button class="btn primary" style="grid-column:1/-1" onclick="closeSheet()">확인</button></div>`;
  }else{
    c.innerHTML=`
      <div class="sheet-hero">📢</div>
      <h3>축제 공지</h3><div class="sub">축제 당일 변경 사항과 주요 안내</div>
      <div class="info-row"><b>긴급</b><span>현장 상황에 따라 공연 시간이 변경될 수 있습니다. 변경 시 이 화면에서 즉시 안내합니다.</span></div>
      <div class="info-row"><b>주차</b><span>행사장 주변이 혼잡할 수 있으니 대중교통 이용을 권장합니다.</span></div>
      <div class="info-row"><b>안전</b><span>응급 상황은 112 또는 현장 운영 안내소로 연락하세요.</span></div>
      <div class="sheet-actions"><button class="btn primary" style="grid-column:1/-1" onclick="closeSheet()">확인</button></div>`;
  }
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('placeSheet').classList.add('open');
  markNoticeSeen();
}

try{
  db.collection('events').doc(EVENT_ID).collection('broadcast').orderBy('createdAt','desc').onSnapshot(snap=>{
    liveNotices=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(n=>n.active);
    applyLiveNotices();
    // 앱을 켜 둔 참가자에게 아직 못 본 공지를 즉시 팝업으로 노출
    const appVisible=!document.getElementById('mainApp').hidden;
    const unseen=unseenNotices();
    if(appVisible&&unseen.length){
      if(unseen.length===1){
        const t=NOTICE_TYPE[unseen[0].type]||NOTICE_TYPE.urgent;
        showToast(`${t.emoji} 새 공지: ${unseen[0].title||t.label}`);
      }else{
        showToast(`📢 새 공지 ${unseen.length}건 도착`);
      }
      openNotice();
    }
  },err=>console.warn('notice listen failed',err));
}catch(e){console.warn('notice subscribe failed',e)}
