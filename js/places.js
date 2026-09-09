let places={};

const MAP_MARKERS={
  food:{icon:'truck',label:'푸드트럭'},beer:{icon:'beer',label:'맥주'},stage:{icon:'mic-2',label:'무대'},info:{icon:'info',label:'안내소'},
  toilet:{icon:'toilet',label:'화장실'},medical:{icon:'cross',label:'의료·안전'},entrance:{icon:'log-in',label:'출입구'},
  seating:{icon:'armchair',label:'테이블·관람석'},default:{icon:'map-pin',label:'장소'}
};
function markerTypeFor(id,place={}){
  if(MAP_MARKERS[place.markerType])return place.markerType;
  const text=`${id} ${place.name||''} ${place.category||''}`.toLowerCase();
  if(/맥주|beer/.test(text))return'beer';
  if(/화장실|toilet/.test(text))return'toilet';
  if(/의료|응급|안전|medical/.test(text))return'medical';
  if(/입구|출구|출입|entrance|gate/.test(text))return'entrance';
  if(/테이블|관람|스탠드|좌석|seating/.test(text))return'seating';
  if(/무대|공연|stage/.test(text))return'stage';
  if(/안내|운영본부|info/.test(text))return'info';
  if(place.category==='먹거리'||/푸드|트럭|food/.test(text))return'food';
  return'default';
}
function markerIconMarkup(id,place){
  const type=markerTypeFor(id,place);const marker=MAP_MARKERS[type]||MAP_MARKERS.default;
  return `<span class="marker-symbol"><i data-lucide="${marker.icon}"></i></span>${place.stampable?'<span class="marker-qr-badge">QR</span>':''}`;
}
function refreshMarkerIcons(){if(window.lucide)window.lucide.createIcons({attrs:{'aria-hidden':'true'}})}

let currentFilter='전체';
let mapSearchQuery='';
let selectedMapPlaceId=null;
function getFilteredPlaces(){
  const q=mapSearchQuery.trim().toLowerCase();
  return Object.entries(places).filter(([id,p])=>{
    const categoryMatch=currentFilter==='전체'||(currentFilter==='미획득'?p.stampable&&!hasStamp(id):p.category===currentFilter);
    const searchMatch=!q||`${p.name} ${p.category} ${p.summary} ${p.info||''}`.toLowerCase().includes(q);
    return categoryMatch&&searchMatch;
  });
}
function renderPlaces(filter=currentFilter){
  currentFilter=filter;
  const list=document.getElementById('placeList');
  if(!list)return;
  const rows=getFilteredPlaces();
  list.innerHTML=rows.length?rows.map(([id,p])=>{
    const state=p.stampable?(hasStamp(id)?'<i class="stamp-state done">도장 완료</i>':'<i class="stamp-state todo">미획득</i>'):'';
    return `<button class="place-card" onclick="selectMapPlace('${id}');toggleMapList(false)"><span class="place-thumb">${escapeHtml(p.emoji||'📍')}</span><span><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.summary||'')}</p><i class="place-tag">${escapeHtml(p.category||'기타')}</i>${state}</span><span class="chev">›</span></button>`;
  }).join(''):'<div class="map-list-empty">조건에 맞는 점포나 시설이 없습니다.</div>';
  const count=document.getElementById('mapResultCount');if(count)count.textContent=rows.length;
  const subtitle=document.getElementById('mapListSubtitle');if(subtitle)subtitle.textContent=`${currentFilter}${mapSearchQuery?' 검색':''} · ${rows.length}곳`;
  const status=document.getElementById('mapStatusText');if(status)status.textContent=mapSearchQuery?`“${mapSearchQuery}” 검색 결과 ${rows.length}곳`:`${currentFilter} ${rows.length}곳 보기`;
  updateMapPins(rows.map(r=>r[0]));
}
function renderMapPins(){
  // 배경 지도 이미지 자체에 위치 라벨이 그려져 있어 별도 마커 핀은 표시하지 않는다.
  const container=document.getElementById('mapPins');if(!container)return;
  container.innerHTML='';
}
function subscribePlaces(){
  try{
    db.collection('events').doc(EVENT_ID).collection('places').onSnapshot(snap=>{
      places=Object.fromEntries(snap.docs
        .map(doc=>[doc.id,{...doc.data()}])
        .filter(([,place])=>place.active!==false));
      if(selectedMapPlaceId&&!places[selectedMapPlaceId])clearMapSelection();
      renderMapPins();
      renderPlaces(currentFilter);
      renderStampUI();
    },err=>console.warn('place listen failed',err));
  }catch(e){console.warn('place subscribe failed',e)}
}
function setFilter(filter,el){
  currentFilter=filter;
  document.querySelectorAll('#filters .filter').forEach(b=>b.classList.toggle('active',b.textContent.trim()===filter));
  renderPlaces(filter);
}
function searchMapPlaces(value){
  mapSearchQuery=String(value||'');
  document.getElementById('mapSearchClear')?.classList.toggle('show',!!mapSearchQuery);
  renderPlaces(currentFilter);
}
function clearMapSearch(){
  mapSearchQuery='';
  const input=document.getElementById('mapSearchInput');if(input){input.value='';input.focus()}
  document.getElementById('mapSearchClear')?.classList.remove('show');
  renderPlaces(currentFilter);
}
function updateMapPins(visibleIds){
  const allowed=new Set(visibleIds);
  document.querySelectorAll('#festivalMap .pin').forEach(pin=>pin.classList.toggle('is-muted',!allowed.has(pin.dataset.id)));
  if(selectedMapPlaceId&&!allowed.has(selectedMapPlaceId))clearMapSelection();
}
let mapListMotionToken=0;
let mapListHideTimer=0;
function toggleMapList(open){
  const panel=document.getElementById('mapListPanel');
  const backdrop=document.getElementById('mapListBackdrop');
  const trigger=document.getElementById('mapListTrigger');
  if(!panel||!backdrop)return;
  const token=++mapListMotionToken;
  window.clearTimeout(mapListHideTimer);

  if(open){
    renderPlaces(currentFilter);
    panel.hidden=false;
    panel.classList.remove('open','closing');
    panel.classList.add('opening');
    panel.setAttribute('aria-hidden','false');
    trigger?.setAttribute('aria-expanded','true');
    backdrop.classList.add('open');

    // 숨김을 먼저 해제한 뒤 두 프레임을 기다려 아래에서 올라오는 모션을 만듭니다.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(token!==mapListMotionToken)return;
      panel.classList.add('open');
      panel.classList.remove('opening');
      panel.querySelector('.map-list-close')?.focus({preventScroll:true});
    }));
  }else{
    trigger?.setAttribute('aria-expanded','false');
    backdrop.classList.remove('open');
    panel.setAttribute('aria-hidden','true');

    if(panel.hidden){
      panel.classList.remove('open','opening','closing');
      return;
    }

    panel.classList.remove('open','opening');
    panel.classList.add('closing');

    // 내려가는 모션이 끝난 다음 display:none과 같은 hidden 상태로 전환합니다.
    mapListHideTimer=window.setTimeout(()=>{
      if(token!==mapListMotionToken||panel.classList.contains('open'))return;
      panel.hidden=true;
      panel.classList.remove('closing');
    },380);
  }
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.getElementById('mapListPanel')?.classList.contains('open')){
    toggleMapList(false);
    document.getElementById('mapListTrigger')?.focus({preventScroll:true});
  }
});
function selectMapPlace(id,pinEl){
  const p=places[id];if(!p)return;
  selectedMapPlaceId=id;
  document.querySelectorAll('#festivalMap .pin').forEach(x=>x.classList.toggle('active',x.dataset.id===id));
  const pin=pinEl||document.querySelector(`#festivalMap .pin[data-id="${id}"]`);if(pin)pin.classList.add('active');
  const state=p.stampable?(hasStamp(id)?'도장 완료':'도장 미획득'):'편의시설';
  const actionIcon=p.stampable&&!hasStamp(id)?'<svg viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M5 19 19 5M8 5h11v11"/></svg>';
  const action=p.stampable&&!hasStamp(id)?`goPage('scan');toggleScannerPanel(true)`:`showToast('길찾기는 실제 지도 연결 단계에서 적용됩니다.')`;
  const preview=document.getElementById('mapPlacePreview');
  preview.innerHTML=`<span class="map-preview-icon">${p.emoji}</span><span class="map-preview-copy"><strong>${p.name}</strong><span>${p.category} · ${p.hours}</span><span class="map-preview-state">${state}</span></span><span class="map-preview-actions"><button onclick="showSelectedPlaceDetails()" aria-label="상세 정보"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></svg></button><button class="primary" onclick="${action}" aria-label="${p.stampable&&!hasStamp(id)?'QR 스캔':'길찾기'}">${actionIcon}</button></span>`;
  preview.hidden=false;
  const status=document.getElementById('mapStatusText');if(status)status.textContent=`${p.name} 선택됨`;
}
function showSelectedPlaceDetails(){if(selectedMapPlaceId)openPlace(selectedMapPlaceId)}
function clearMapSelection(){
  selectedMapPlaceId=null;
  document.querySelectorAll('#festivalMap .pin').forEach(x=>x.classList.remove('active'));
  const preview=document.getElementById('mapPlacePreview');if(preview)preview.hidden=true;
}
function openPlace(id,pinEl){
  const p=places[id]; if(!p)return;
  document.querySelectorAll('.pin').forEach(x=>x.classList.remove('active'));
  const pin=pinEl||document.querySelector(`.pin[data-id="${id}"]`); if(pin)pin.classList.add('active');
  const stampInfo=p.stampable
    ?(hasStamp(id)?'✓ 도장 획득 완료':p.qrRequired?'아직 받지 않은 도장 · 부스의 보안 QR을 스캔해주세요':`아직 받지 않은 도장 · 코드 ${p.code||id.toUpperCase()}`)
    :'도장 미운영 시설';
  const scanButton=p.stampable&&!hasStamp(id)?`<button class="btn primary" onclick="closeSheet();goPage('scan');toggleScannerPanel(true)">QR 스캔</button>`:`<button class="btn primary" onclick="showToast('외부 지도 길찾기 연결 예정입니다.')">길찾기</button>`;
  document.getElementById('sheetContent').innerHTML=`
    <div class="sheet-hero">${p.emoji}</div>
    <h3>${p.name}</h3><div class="sub">${p.category} · ${p.summary}</div>
    <div class="info-row"><b>도장 상태</b><span>${stampInfo}</span></div>
    <div class="info-row"><b>운영시간</b><span>${p.hours}</span></div>
    <div class="info-row"><b>주요 정보</b><span>${p.info}</span></div>
    <div class="info-row"><b>문의</b><span>${p.contact}</span></div>
    <div class="sheet-actions"><button class="btn" onclick="closeSheet()">닫기</button>${scanButton}</div>`;
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('placeSheet').classList.add('open');
}
