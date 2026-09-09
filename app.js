function goPage(id,navEl){
  if(id!=='scan') stopScanner();
  document.body.classList.toggle('map-mode',id==='map');
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));
  if(id!=='map') toggleMapList(false);
  window.scrollTo({top:0,behavior:id==='map'?'auto':'smooth'});
  if(id==='map') renderPlaces(currentFilter);
  if(id==='scan') renderStampUI();
  if(id==='schedule'&&!document.querySelector('#scheduleList').children.length) renderSchedule(currentScheduleMode);
}

function closeSheet(){
  document.getElementById('sheetBackdrop').classList.remove('open');
  document.getElementById('placeSheet').classList.remove('open');
  document.querySelectorAll('.pin').forEach(x=>x.classList.remove('active'));
}
function focusPin(id){setTimeout(()=>selectMapPlace(id,document.querySelector(`#festivalMap .pin[data-id=\"${id}\"]`)),180)}

// ===== 부트스트랩: 다른 모듈이 모두 로드된 뒤 앱을 시작한다 =====
initializeEntryFlow();

renderMapPins();renderPlaces();renderSchedule('next');renderStampUI();setupMapGestures();
subscribePlaces();
auth.onAuthStateChanged(user=>{
  if(user&&(participationMode==='account'||participationMode==='anonymous')){
    currentUserUid=user.uid;
    safeStorage.setItem('dadepo_auth_uid',currentUserUid);
    safeStorage.setItem('festival.uid',currentUserUid);
    loadRemoteStampRecords();
  }
});
