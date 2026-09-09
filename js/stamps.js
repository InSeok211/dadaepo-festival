let REQUIRED_STAMPS=5;
let participantId=urlParticipant||safeStorage.getItem('festival.participantCode')||safeStorage.getItem('dadepo_participant_id')||'발급 중';
let participationMode=safeStorage.getItem('dadepo_participation_mode')||'anonymous';
let authMethod=safeStorage.getItem('dadepo_auth_method')||'';
let currentUserUid=safeStorage.getItem('festival.uid')||safeStorage.getItem('dadepo_auth_uid')||'';
let stampStorageKey=`dadepo_stamp_demo_${participantId}`;
let stampRecords=JSON.parse(safeStorage.getItem(stampStorageKey)||'[]');
function saveStampRecords(){
  safeStorage.setItem(stampStorageKey,JSON.stringify(stampRecords));
  if(participationMode==='account'&&currentUserUid&&!currentUserUid.startsWith('local-')){
    db.collection('festivalParticipants').doc(participantId).set({
      participantId,
      userUid:currentUserUid,
      authMethod,
      records:stampRecords,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true}).catch(err=>console.warn('stamp sync failed',err));
  }
}
function switchParticipant(nextId,mode,auth=''){
  participantId=nextId;
  participationMode=mode;
  authMethod=auth;
  safeStorage.setItem('dadepo_participant_id',participantId);
  safeStorage.setItem('festival.participantCode',participantId);
  safeStorage.setItem('dadepo_participation_mode',participationMode);
  safeStorage.setItem('dadepo_auth_method',authMethod);
  if(mode!=='account'&&mode!=='anonymous'){
    currentUserUid='';
    safeStorage.removeItem('dadepo_auth_uid');
    safeStorage.removeItem('festival.uid');
  }
  stampStorageKey=`dadepo_stamp_demo_${participantId}`;
  stampRecords=JSON.parse(safeStorage.getItem(stampStorageKey)||'[]');
}
function hasStamp(spotId){return stampRecords.some(r=>r.spotId===spotId)}
function stampablePlaces(){return Object.entries(places).filter(([_,p])=>p.stampable).slice(0,REQUIRED_STAMPS)}

let qrStream=null, qrScanTimer=null, qrDetector=null, lastQrValue='';
let qrCanvas=null, qrCanvasCtx=null;

function hasNativeDetector(){return 'BarcodeDetector' in window}

// iOS Safari(및 iOS의 모든 브라우저)는 BarcodeDetector를 지원하지 않으므로
// jsQR(순수 JS 디코더)로 캔버스 프레임을 직접 분석하는 폴백을 사용한다.
async function detectQrFromVideo(video){
  if(hasNativeDetector()){
    qrDetector=qrDetector||new BarcodeDetector({formats:['qr_code']});
    const codes=await qrDetector.detect(video);
    return codes.length?(codes[0].rawValue||''):null;
  }
  if(typeof jsQR==='undefined'||!video.videoWidth||!video.videoHeight)return null;
  if(!qrCanvas){qrCanvas=document.createElement('canvas');qrCanvasCtx=qrCanvas.getContext('2d',{willReadFrequently:true})}
  qrCanvas.width=video.videoWidth;
  qrCanvas.height=video.videoHeight;
  qrCanvasCtx.drawImage(video,0,0,qrCanvas.width,qrCanvas.height);
  const imageData=qrCanvasCtx.getImageData(0,0,qrCanvas.width,qrCanvas.height);
  const result=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'dontInvert'});
  return result?result.data:null;
}

async function startScanner(){
  const status=document.getElementById('scanStatus');
  const video=document.getElementById('qrVideo');
  const placeholder=document.getElementById('scannerPlaceholder');
  const frame=document.getElementById('scanFrame');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    status.textContent='이 브라우저에서는 카메라를 사용할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.';
    return;
  }
  if(!hasNativeDetector()&&typeof jsQR==='undefined'){
    status.textContent='이 브라우저는 QR 자동 인식을 지원하지 않습니다. 다른 브라우저에서 다시 시도해 주세요.';
    return;
  }
  try{
    stopScanner();
    qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:720}},audio:false});
    video.srcObject=qrStream;
    await video.play();
    video.style.display='block';
    placeholder.style.display='none';
    frame.style.display='block';
    status.textContent='점포 QR을 화면 안에 맞추면 자동으로 인식됩니다.';
    const scannerView=document.getElementById('scannerView');
    if(scannerView)scannerView.setAttribute('aria-label','QR 스캔 중');
    scanVideoFrame();
  }catch(err){
    status.textContent='카메라를 사용할 수 없어요. 브라우저 권한을 확인하거나 직원에게 문의해주세요.';
  }
}

function handleScannerSurfaceTap(){
  if(qrStream)return;
  startScanner();
}

function handleScannerSurfaceKey(event){
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    handleScannerSurfaceTap();
  }
}

async function scanVideoFrame(){
  const video=document.getElementById('qrVideo');
  if(!qrStream)return;
  try{
    const value=await detectQrFromVideo(video);
    if(value){
      handleQrResult(value||'QR 코드 확인');
      return;
    }
  }catch(e){}
  qrScanTimer=setTimeout(scanVideoFrame,250);
}

function stopScanner(){
  if(qrScanTimer){clearTimeout(qrScanTimer);qrScanTimer=null}
  if(qrStream){qrStream.getTracks().forEach(t=>t.stop());qrStream=null}
  const video=document.getElementById('qrVideo');
  if(video){video.pause();video.srcObject=null;video.style.display='none'}
  const placeholder=document.getElementById('scannerPlaceholder');
  const frame=document.getElementById('scanFrame');
  if(placeholder)placeholder.style.display='block';
  if(frame)frame.style.display='none';
  const scannerView=document.getElementById('scannerView');
  if(scannerView)scannerView.setAttribute('aria-label','QR 스캔 시작');
  const btn=document.getElementById('startScanBtn');
  if(btn){btn.textContent='카메라 시작';btn.onclick=startScanner}
}

async function scanImageFile(input){
  const file=input.files&&input.files[0];
  const status=document.getElementById('scanStatus');
  if(!file)return;
  if(!hasNativeDetector()&&typeof jsQR==='undefined'){
    status.textContent='현재 브라우저는 이미지 QR 인식을 지원하지 않습니다. 코드를 직접 입력해주세요.';
    input.value='';return;
  }
  try{
    const bitmap=await createImageBitmap(file);
    let value=null;
    if(hasNativeDetector()){
      qrDetector=qrDetector||new BarcodeDetector({formats:['qr_code']});
      const codes=await qrDetector.detect(bitmap);
      value=codes.length?(codes[0].rawValue||''):null;
    }else{
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0);
      const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
      const result=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'dontInvert'});
      value=result?result.data:null;
    }
    bitmap.close();
    if(value)handleQrResult(value);
    else status.textContent='이미지에서 QR 코드를 찾지 못했습니다. QR이 선명한 사진으로 다시 시도해주세요.';
  }catch(err){status.textContent='이미지를 읽지 못했습니다. 다른 사진을 선택해주세요.'}
  input.value='';
}

function toggleScannerPanel(open){
  const panel=document.getElementById('scannerWorkspace');
  panel.classList.toggle('open',!!open);
  if(open)setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),80);else stopScanner();
}

function findSpotByQr(value){
  const raw=String(value||'').trim();
  let code=raw.toUpperCase();
  try{
    if(/^https?:\/\//i.test(raw)){
      const u=new URL(raw);code=(u.searchParams.get('code')||u.searchParams.get('spot')||u.pathname.split('/').filter(Boolean).pop()||'').toUpperCase();
    }
  }catch(e){}
  return Object.entries(places).find(([id,p])=>p.stampable&&(p.code===code||id.toUpperCase()===code));
}

function parseSecureStampQr(value){
  const raw=String(value||'').trim();
  if(!/^https?:\/\//i.test(raw))return null;
  try{
    const url=new URL(raw);
    const pointId=(url.searchParams.get('point')||'').trim().toLowerCase();
    const token=(url.searchParams.get('token')||'').trim();
    if(!pointId||!token)return null;
    return{pointId,token};
  }catch(e){return null}
}

async function addStamp(spotId,qrToken=''){
  const p=places[spotId];
  if(!p||!p.stampable){showToast('도장 받을 장소가 아닙니다.');return}
  if(hasStamp(spotId)){showToast('이미 받은 도장입니다.');renderStampUI();return}
  try{
    if(participationMode==='anonymous'&&currentUserUid&&!currentUserUid.startsWith('local-')){
      document.getElementById('scanStatus').textContent='서버에서 도장을 확인하는 중입니다.';
      const claimed=await claimStampOnServer(spotId,qrToken);
      if(claimed.alreadyClaimed){showToast('이미 받은 도장입니다.');await loadRemoteStampRecords();renderStampUI();return}
    }else if(!allowLocalFallback()){
      showToast('참가권 확인 후 다시 시도해 주세요.');
      return;
    }
    stampRecords.push({spotId,stampedAt:new Date().toISOString()});
    saveStampRecords();
    renderStampUI();renderPlaces(currentFilter);
    showStampSuccess(p);
  }catch(err){
    console.error(err);
    if(allowLocalFallback()){
      stampRecords.push({spotId,stampedAt:new Date().toISOString()});
      saveStampRecords();
      renderStampUI();renderPlaces(currentFilter);
      showStampSuccess(p);
      return;
    }
    const invalidQr=String(err&&err.code||'').includes('invalid-argument');
    document.getElementById('scanStatus').textContent=invalidQr?'만료되었거나 재발급 전의 QR입니다. 부스의 최신 QR을 스캔해주세요.':'도장을 저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';
    showToast(invalidQr?'사용할 수 없는 QR입니다.':'도장을 저장하지 못했습니다.');
  }
}

function showStampSuccess(p){
  document.getElementById('sheetContent').innerHTML=`
    <div class="sheet-hero">${p.emoji}</div><h3>도장이 찍혔어요!</h3>
    <div class="sub">${p.name} 방문 도장을 획득했습니다.</div>
    <div class="info-row"><b>진행률</b><span>${stampRecords.length} / ${REQUIRED_STAMPS}개 완료</span></div>
    <div class="info-row"><b>다음 행동</b><span>${stampRecords.length>=REQUIRED_STAMPS?'운영 안내소에서 개인 QR을 보여주고 경품을 확인하세요.':'지도에서 아직 받지 않은 도장을 확인하세요.'}</span></div>
    <div class="sheet-actions"><button class="btn" onclick="closeSheet()">확인</button><button class="btn primary" onclick="closeSheet();goPage('map');setFilter('미획득')">다음 장소</button></div>`;
  document.getElementById('sheetBackdrop').classList.add('open');document.getElementById('placeSheet').classList.add('open');
}

function handleQrResult(value){
  lastQrValue=String(value||'').trim();
  stopScanner();
  const result=document.getElementById('qrResult');
  const secureQr=parseSecureStampQr(lastQrValue);
  document.getElementById('qrResultText').textContent=secureQr?'보안 QR 확인됨':lastQrValue;
  result.classList.add('show');
  const spot=secureQr
    ?Object.entries(places).find(([id,p])=>id===secureQr.pointId&&p.stampable)
    :findSpotByQr(lastQrValue);
  if(!spot){document.getElementById('scanStatus').textContent='등록되지 않은 점포 QR입니다.';showToast('유효한 점포 QR이 아닙니다.');return}
  document.getElementById('scanStatus').textContent=`${spot[1].name} QR을 확인했습니다.`;
  addStamp(spot[0],secureQr?secureQr.token:'');
}

function submitManualCode(){
  const input=document.getElementById('manualQrCode');
  const value=input.value.trim();
  if(!value){showToast('점포 코드를 입력해주세요.');return}
  handleQrResult(value.toUpperCase());input.value='';
}

function renderStampUI(){
  const spots=stampablePlaces();
  const count=Math.min(stampRecords.length,REQUIRED_STAMPS);
  const board=document.getElementById('stampBoard');
  if(board)board.innerHTML=spots.map(([id,p])=>hasStamp(id)?`<div class="stamp-slot done"><span><b class="stamp-emoji">${p.emoji}</b>${p.name}</span></div>`:`<div class="stamp-slot"><span><b class="stamp-emoji">○</b>${p.name}</span></div>`).join('');
  const bar=document.getElementById('stampProgressBar');if(bar)bar.style.width=`${Math.min(100,count/REQUIRED_STAMPS*100)}%`;
  const txt=document.getElementById('stampProgressText');if(txt)txt.textContent=`${count} / ${REQUIRED_STAMPS}개 완료`;
  const chip=document.getElementById('rewardChip');if(chip)chip.textContent=count>=REQUIRED_STAMPS?'경품 수령 가능':'미션 진행 중';
  const pid=document.getElementById('participantIdText');if(pid)pid.textContent=participantId;
  const methodLabel=participationMode==='anonymous'?'비로그인 QR 참여':participationMode==='qr'?'개인 QR 카드':authMethod==='kakao'?'카카오 로그인':authMethod==='google'?'Google 로그인':'아이디 로그인';
  const homeLabel=document.getElementById('homeParticipantLabel');if(homeLabel)homeLabel.textContent=`${methodLabel} · ${participantId}`;
  const typeText=document.getElementById('participantTypeText');if(typeText)typeText.textContent=methodLabel;
  const desc=document.getElementById('stampPageDescription');if(desc)desc.textContent=participationMode==='qr'?'개인 QR 카드에 점포·부스 방문 도장이 저장됩니다.':'로그인 계정에 점포·부스 방문 도장이 저장됩니다.';
  const identityBtn=document.getElementById('identityInfoButton');if(identityBtn)identityBtn.textContent=participationMode==='qr'?'내 개인 QR 보기':'내 계정 정보 보기';
  const homeCount=document.getElementById('homeStampCount');if(homeCount)homeCount.textContent=`현재 ${count} / ${REQUIRED_STAMPS}개`;
  const homeMsg=document.getElementById('homeStampMessage');if(homeMsg)homeMsg.textContent=count>=REQUIRED_STAMPS?'미션 완료! 운영 안내소에서 경품을 확인하세요.':'참여 점포 QR을 스캔해 도장을 모아보세요.';
  const hist=document.getElementById('stampHistory');
  if(hist){
    const records=[...stampRecords].reverse();
    hist.innerHTML=records.length?records.map(r=>{const p=places[r.spotId];return `<div class="stamp-history-row"><span class="mark">${p.emoji}</span><div><b>${p.name}</b><span>${new Date(r.stampedAt).toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit'})} · 도장 획득</span></div></div>`}).join(''):`<div class="stamp-empty">아직 받은 도장이 없습니다.<br>점포·부스 QR을 스캔하면 기록이 여기에 표시됩니다.</div>`;
  }
}

function showPersonalQr(){
  if(participationMode==='qr'||participationMode==='anonymous'){
    document.getElementById('sheetContent').innerHTML=`
      <div class="personal-qr-visual"><i class="personal-qr-third"></i></div>
      <h3 style="text-align:center">나의 참가 정보</h3><div class="sub" style="text-align:center">참가번호 ${participantId}</div>
      <div class="info-row"><b>참여 방식</b><span>${participationMode==='anonymous'?'비로그인 QR 스탬프':'사전 발급 개인 QR 카드'}</span></div>
      <div class="info-row"><b>역할</b><span>경품 수령 시 참가자를 확인하고 기존 도장판을 찾는 보조 번호입니다.</span></div>
      <div class="info-row"><b>주의</b><span>처음 시작한 브라우저에서 계속 이용해 주세요.</span></div>
      <div class="sheet-actions"><button class="btn" onclick="closeSheet()">닫기</button><button class="btn primary" onclick="showToast('실서비스에서는 개인 QR 이미지를 저장합니다.')">QR 저장</button></div>`;
  }else{
    const loginName=authMethod==='kakao'?'카카오':authMethod==='google'?'Google':'아이디·비밀번호';
    document.getElementById('sheetContent').innerHTML=`
      <div class="sheet-hero">👤</div><h3>나의 계정 참여 정보</h3><div class="sub">운영 참가번호 ${participantId}</div>
      <div class="info-row"><b>로그인 방식</b><span>${loginName}</span></div>
      <div class="info-row"><b>기록 복구</b><span>처음 참여할 때 선택한 ${loginName} 방식으로 다시 로그인하면 기존 기록을 불러옵니다.</span></div>
      <div class="info-row"><b>경품 확인</b><span>운영 안내소에서 참가번호 ${participantId}를 보여주세요.</span></div>
      <div class="sheet-actions"><button class="btn primary" style="grid-column:1/-1" onclick="closeSheet()">확인</button></div>`;
  }
  document.getElementById('sheetBackdrop').classList.add('open');document.getElementById('placeSheet').classList.add('open');
}
function showRecoveryHelp(){
  if(participationMode==='anonymous') showToast('처음 참여한 브라우저에서 다시 접속하면 기존 도장판을 불러옵니다.');
  else if(participationMode==='qr') showToast('개인 QR 카드를 다시 스캔하면 기존 도장판을 불러옵니다.');
  else showToast('처음 선택한 로그인 방식으로 다시 로그인해 주세요.');
}
