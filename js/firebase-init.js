// Firebase (구글 실제 OAuth 로그인용)
const firebaseConfig={
  apiKey:"AIzaSyDR9WBSaE7GHtaSPiH1sCLjtfJ85tzVtjM",
  authDomain:"saegim-garden.firebaseapp.com",
  projectId:"saegim-garden",
  storageBucket:"saegim-garden.firebasestorage.app",
  messagingSenderId:"846018467538",
  appId:"1:846018467538:web:fb5fa0e5c9f9056e427f0b"
};
try{firebase.initializeApp(firebaseConfig)}catch(e){}
const googleProvider=new firebase.auth.GoogleAuthProvider();
const auth=firebase.auth();
const db=firebase.firestore();
const cloudFunctions=firebase.app().functions('asia-northeast3');
const EVENT_ID='dadaepo-beer-2026';
const participantPersistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});

const safeStorage=(()=>{
  try{const k='__dadepo_test__';localStorage.setItem(k,'1');localStorage.removeItem(k);return localStorage}
  catch(e){const mem={};return{getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},clear:()=>Object.keys(mem).forEach(k=>delete mem[k])}}
})();
const queryParams=new URLSearchParams(location.search);
// QR 자동 로그인 식별자: ?participant= / ?id= / ?login= 지원
const urlParticipant=(queryParams.get('participant')||queryParams.get('id')||queryParams.get('login')||'').trim()||null;
