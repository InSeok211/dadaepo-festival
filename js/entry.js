let entryStartedAt=Number(safeStorage.getItem('dadepo_entry_started_at')||Date.now());
safeStorage.setItem('dadepo_entry_started_at',String(entryStartedAt));
let entryHistory=['entry-method'];
function logExperimentEvent(type,data={}){
  const key='dadepo_experiment_events';
  const events=JSON.parse(safeStorage.getItem(key)||'[]');
  events.push({type,at:new Date().toISOString(),...data});
  safeStorage.setItem(key,JSON.stringify(events.slice(-300)));
}
function setEntryStatus(message){
  const status=document.getElementById('entryStartStatus');
  if(status)status.textContent=message;
}
function getPersistentRequestId(){
  const key='festival.pendingRequestId';
  let requestId=safeStorage.getItem(key);
  if(!requestId){
    requestId=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():`req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeStorage.setItem(key,requestId);
  }
  return requestId;
}
function participantCodeFromUid(uid){
  return `A${parseInt(hashText(uid).slice(0,6),36).toString().padStart(5,'0').slice(0,5)}`;
}
function allowLocalFallback(){
  return ['localhost','127.0.0.1'].includes(location.hostname)||queryParams.get('devFallback')==='1';
}
async function ensureAnonymousUser(){
  await participantPersistenceReady;
  const existing=auth.currentUser;
  if(existing&&existing.isAnonymous)return {uid:existing.uid,localOnly:false};
  try{
    const result=await auth.signInAnonymously();
    return {uid:result.user.uid,localOnly:false};
  }catch(err){
    console.warn('anonymous auth failed',err);
    if(!allowLocalFallback()){
      setEntryStatus('요청이 많아 잠시 후 다시 시도해 주세요. 같은 휴대폰에서 반복 테스트 중이면 몇 분 뒤 다시 눌러주세요.');
      throw err;
    }
    const key='festival.localAnonymousUid';
    let uid=safeStorage.getItem(key);
    if(!uid){
      uid=`local-${hashText(`${Date.now()}-${Math.random()}`)}`;
      safeStorage.setItem(key,uid);
    }
    setEntryStatus('Firebase 익명 로그인이 아직 꺼져 있어 로컬 개발용 참가권으로 시작합니다.');
    return {uid,localOnly:true,error:err};
  }
}
async function registerAnonymousParticipant(uid,requestId,localOnly=false){
  const cached=safeStorage.getItem('festival.participantCode');
  if(cached&&cached!=='발급 중')return cached;
  if(localOnly){
    const participantCode=participantCodeFromUid(uid);
    safeStorage.setItem('festival.participantCode',participantCode);
    safeStorage.setItem('festival.eventId',EVENT_ID);
    safeStorage.removeItem('festival.pendingRequestId');
    return participantCode;
  }

  let participantCode='';
  try{
    const registerParticipant=cloudFunctions.httpsCallable('registerParticipant');
    const result=await registerParticipant({eventId:EVENT_ID,requestId});
    participantCode=result&&result.data&&result.data.participantCode;
  }catch(err){
    console.warn('registerParticipant function failed',err);
    if(!allowLocalFallback())throw err;
    participantCode=participantCodeFromUid(uid);
  }
  if(!participantCode)throw new Error('registerParticipant returned no participantCode');
  safeStorage.setItem('festival.participantCode',participantCode);
  safeStorage.setItem('festival.eventId',EVENT_ID);
  safeStorage.removeItem('festival.pendingRequestId');
  return participantCode;
}
function getStampRequestId(spotId){
  const key=`festival.stampRequest.${spotId}`;
  let requestId=safeStorage.getItem(key);
  if(!requestId){
    requestId=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():`stamp-${spotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeStorage.setItem(key,requestId);
  }
  return requestId;
}
async function claimStampOnServer(spotId,qrToken=''){
  const p=places[spotId];
  const requestId=getStampRequestId(spotId);
  const claimStamp=cloudFunctions.httpsCallable('claimStamp');
  const result=await claimStamp({eventId:EVENT_ID,pointId:spotId,code:p.code,qrToken,requestId});
  safeStorage.removeItem(`festival.stampRequest.${spotId}`);
  return result&&result.data?result.data:{};
}
async function startAnonymousEntry(){
  const button=document.getElementById('startStampTourBtn');
  if(button)button.disabled=true;
  setEntryStatus('익명 참가권을 확인하는 중입니다.');
  try{
    const requestId=getPersistentRequestId();
    const user=await ensureAnonymousUser();
    currentUserUid=user.uid;
    safeStorage.setItem('festival.uid',currentUserUid);
    safeStorage.setItem('dadepo_auth_uid',currentUserUid);
    setEntryStatus('참가번호를 준비하는 중입니다. 스탬프판은 바로 열립니다.');
    const code=await registerAnonymousParticipant(user.uid,requestId,user.localOnly);
    const preview=document.getElementById('entryPreviewCode');
    if(preview)preview.textContent=`참가번호 ${code}`;
    logExperimentEvent('anonymous_entry_started',{eventId:EVENT_ID,participant_id:code,local_only:Boolean(user.localOnly)});
    finishEntry(code,'anonymous','anonymous');
  }catch(err){
    console.error(err);
    setEntryStatus('시작하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.');
    if(button)button.disabled=false;
  }
}
function idToEmail(id){return `${id}@dadaepo-festival.local`}
function hashText(text){
  let hash=2166136261;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36).toUpperCase().padStart(6,'0').slice(0,6);
}
function participantFromUid(uid,auth){
  const prefix=auth==='google'?'M-G':auth==='id'?'M-I':'M-A';
  return `${prefix}-${hashText(uid)}`;
}
function mergeStampRecords(remoteRecords=[]){
  const merged=new Map();
  [...stampRecords,...remoteRecords].forEach(record=>{
    if(!record||!record.spotId)return;
    const current=merged.get(record.spotId);
    if(!current||String(record.stampedAt||'')<String(current.stampedAt||''))merged.set(record.spotId,record);
  });
  stampRecords=[...merged.values()].sort((a,b)=>String(a.stampedAt||'').localeCompare(String(b.stampedAt||'')));
  safeStorage.setItem(stampStorageKey,JSON.stringify(stampRecords));
}
async function ensureFirebaseParticipant(user,method,loginId=''){
  const profileRef=db.collection('festivalUsers').doc(user.uid);
  const profile=await profileRef.get();
  let participant=profile.exists&&profile.data().participantId;
  if(!participant)participant=participantFromUid(user.uid,method);
  const profileData={
    uid:user.uid,
    participantId:participant,
    authMethod:method,
    loginId:loginId||null,
    updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
  };
  if(!profile.exists)profileData.createdAt=firebase.firestore.FieldValue.serverTimestamp();
  await profileRef.set(profileData,{merge:true});
  currentUserUid=user.uid;
  safeStorage.setItem('dadepo_auth_uid',currentUserUid);
  return participant;
}
async function loadRemoteStampRecords(){
  if((participationMode!=='account'&&participationMode!=='anonymous')||!currentUserUid||currentUserUid.startsWith('local-'))return;
  try{
    if(participationMode==='anonymous'){
      const snap=await db.collection('events').doc(EVENT_ID).collection('participants').doc(currentUserUid).collection('stamps').get();
      if(!snap.empty){
        mergeStampRecords(snap.docs.map(doc=>({spotId:doc.id,stampedAt:doc.data().claimedAt||new Date().toISOString()})));
        renderStampUI();
        renderPlaces(currentFilter);
      }
      return;
    }
    const snap=await db.collection('festivalParticipants').doc(participantId).get();
    if(snap.exists&&Array.isArray(snap.data().records)){
      mergeStampRecords(snap.data().records);
      renderStampUI();
      renderPlaces(currentFilter);
    }
  }catch(err){
    console.warn('stamp load failed',err);
    showToast('온라인 기록을 불러오지 못해 이 기기 기록으로 시작합니다.');
  }
}
function setEntryStep(id,push=true){
  document.querySelectorAll('.entry-step').forEach(s=>s.classList.toggle('active',s.id===id));
  if(push&&entryHistory[entryHistory.length-1]!==id)entryHistory.push(id);
  const back=document.getElementById('entryBack');
  if(back)back.hidden=id==='entry-method';
  window.scrollTo({top:0,behavior:'smooth'});
}
function entryBack(){
  if(entryHistory.length<=1){setEntryStep('entry-method',false);return}
  entryHistory.pop();
  setEntryStep(entryHistory[entryHistory.length-1],false);
}
function selectEntryMethod(method){
  logExperimentEvent('participation_method_selected',{method,selection_ms:Date.now()-entryStartedAt});
  if(method==='qr')setEntryStep('entry-qr'); else setEntryStep('entry-login-method');
}
function connectDemoQr(){document.getElementById('personalQrInput').value='P-001';connectPersonalQr()}
function connectPersonalQr(){
  const input=document.getElementById('personalQrInput');
  let code=String(input.value||'').trim().toUpperCase();
  if(!/^P-\d{3}$/.test(code)){alert('참가번호를 P-001 형식으로 입력해 주세요.');input.focus();return}
  logExperimentEvent('personal_qr_connected',{participant_id:code});
  finishEntry(code,'qr','');
}
function openIdAuth(mode){setEntryStep('entry-id-auth');switchAuthTab(mode)}
function switchAuthTab(mode){
  if(!document.getElementById('signupTab'))return;
  document.getElementById('signupTab').classList.toggle('active',mode==='signup');
  document.getElementById('loginTab').classList.toggle('active',mode==='login');
  document.getElementById('signupPanel').classList.toggle('active',mode==='signup');
  document.getElementById('loginPanel').classList.toggle('active',mode==='login');
  const title=document.querySelector('#entry-id-auth .entry-title');
  const desc=document.querySelector('#entry-id-auth .entry-desc');
  if(mode==='signup'){title.innerHTML='간단한 계정을<br>만들어 주세요';desc.textContent='이름·전화번호·이메일 없이 아이디와 비밀번호만 사용합니다.'}
  else{title.innerHTML='기존 계정으로<br>다시 참여하세요';desc.textContent='가입할 때 만든 아이디와 비밀번호를 입력하면 기존 기록을 불러옵니다.'}
}
function togglePassword(id,button){const input=document.getElementById(id);const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'숨김':'보기'}
function nextMemberId(prefix='M-I'){
  const key='dadepo_member_sequence';
  const n=Number(safeStorage.getItem(key)||0)+1;
  safeStorage.setItem(key,String(n));
  return `${prefix}${String(n).padStart(3,'0')}`;
}
function completeSocialLogin(provider){
  logExperimentEvent('login_method_selected',{provider});
  if(provider==='google'){googleLogin();return;}
  // 카카오는 Firebase Auth 제공자 설정을 추가한 뒤 실제 로그인으로 연결합니다.
  const key=`dadepo_${provider}_participant`;
  const existing=safeStorage.getItem(key);
  const pid=existing||nextMemberId('M-K');
  safeStorage.setItem(key,pid);
  logExperimentEvent('social_login_completed',{provider,participant_id:pid});
  finishEntry(pid,'account',provider);
}
// 구글 실제 OAuth (Firebase Auth 팝업)
async function googleLogin(){
  try{
    const res=await auth.signInWithPopup(googleProvider);
    const pid=await ensureFirebaseParticipant(res.user,'google');
    logExperimentEvent('social_login_completed',{provider:'google',participant_id:pid});
    finishEntry(pid,'account','google');
  }catch(err){
    const code=err&&err.code;
    if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request')return;
    console.error(err);
    alert('구글 로그인에 실패했습니다. 다시 시도해 주세요.');
  }
}
async function signupWithId(){
  const id=document.getElementById('signupId').value.trim().toLowerCase();
  const pw=document.getElementById('signupPw').value;
  const confirmPw=document.getElementById('signupPwConfirm').value;
  const consent=document.getElementById('signupConsent').checked;
  const error=document.getElementById('signupError');error.textContent='';
  if(!/^[a-z0-9]{4,16}$/.test(id)){error.textContent='아이디는 영문 소문자와 숫자 4~16자로 입력해 주세요.';return}
  if(pw.length<8){error.textContent='비밀번호는 8자 이상 입력해 주세요.';return}
  if(pw!==confirmPw){error.textContent='비밀번호 확인이 일치하지 않습니다.';logExperimentEvent('password_mismatch');return}
  if(!consent){error.textContent='필수 이용 안내에 동의해 주세요.';return}
  error.textContent='계정을 만드는 중입니다.';
  try{
    const res=await auth.createUserWithEmailAndPassword(idToEmail(id),pw);
    const pid=await ensureFirebaseParticipant(res.user,'id',id);
    logExperimentEvent('id_signup_completed',{participant_id:pid});
    finishEntry(pid,'account','id');
  }catch(err){
    console.error(err);
    if(err&&err.code==='auth/email-already-in-use'){error.textContent='이미 사용 중인 아이디입니다.';logExperimentEvent('username_duplicate');return}
    if(err&&err.code==='auth/operation-not-allowed'){error.textContent='Firebase 콘솔에서 이메일/비밀번호 로그인을 먼저 켜야 합니다.';return}
    error.textContent='회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
async function loginWithId(){
  const id=document.getElementById('loginId').value.trim().toLowerCase();
  const pw=document.getElementById('loginPw').value;
  const error=document.getElementById('loginError');error.textContent='';
  if(!/^[a-z0-9]{4,16}$/.test(id)){error.textContent='아이디를 확인해 주세요.';return}
  if(!pw){error.textContent='비밀번호를 입력해 주세요.';return}
  error.textContent='로그인 확인 중입니다.';
  try{
    const res=await auth.signInWithEmailAndPassword(idToEmail(id),pw);
    const pid=await ensureFirebaseParticipant(res.user,'id',id);
    logExperimentEvent('id_login_completed',{participant_id:pid});
    finishEntry(pid,'account','id');
  }catch(err){
    console.error(err);
    error.textContent='아이디 또는 비밀번호를 확인해 주세요.';
    logExperimentEvent('id_login_failed');
  }
}
function finishEntry(pid,mode,auth){
  switchParticipant(pid,mode,auth);
  safeStorage.setItem('dadepo_entry_complete','1');
  safeStorage.setItem('dadepo_entry_completed_at',new Date().toISOString());
  document.getElementById('entryShell').hidden=true;
  document.getElementById('mainApp').hidden=false;
  renderPlaces();renderSchedule(currentScheduleMode);renderStampUI();
  loadRemoteStampRecords();
  goPage('home');
  logExperimentEvent('festival_home_entered',{participant_id:pid,mode,auth_method:auth||null});
}

function initializeEntryFlow(){
  if(queryParams.get('reset')==='1'){
    ['dadepo_entry_complete','dadepo_participant_id','dadepo_participation_mode','dadepo_auth_method','festival.participantCode','festival.uid','festival.pendingRequestId'].forEach(k=>safeStorage.removeItem(k));
  }
  // 1) QR 전용 URL(?participant=…)로 접속 → 즉시 자동 로그인
  if(urlParticipant){
    switchParticipant(urlParticipant,'qr','');
    safeStorage.setItem('dadepo_entry_complete','1');
    safeStorage.setItem('dadepo_entry_completed_at',new Date().toISOString());
    // 주소창에서 쿼리 파라미터 제거 (?participant=… → 깔끔한 주소)
    history.replaceState(null,'',location.pathname);
    document.getElementById('entryShell').hidden=true;
    document.getElementById('mainApp').hidden=false;
    logExperimentEvent('qr_url_login',{participant_id:urlParticipant});
    return;
  }
  // 2) 파라미터가 없어도 기존 로그인 기록이 있으면 자동 로그인
  const completed=safeStorage.getItem('dadepo_entry_complete')==='1';
  if(completed){
    document.getElementById('entryShell').hidden=true;
    document.getElementById('mainApp').hidden=false;
  }else{
    // 3) 아무 기록도 없으면 참여 방식 선택 화면
    document.getElementById('entryShell').hidden=false;
    document.getElementById('mainApp').hidden=true;
    logExperimentEvent('participation_entry_viewed');
  }
}
