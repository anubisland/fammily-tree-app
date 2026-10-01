  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut
  } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
  import {
    getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    doc, getDoc, setDoc, onSnapshot, serverTimestamp,
    collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, updateDoc, writeBatch
  } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
  import { makePhotoApi } from "./photos.js";

  const firebaseConfig = {
    apiKey: "AIzaSyCU4IJudvRs8PTElMNtbP8WsKhzly5MnNA",
    authDomain: "family-tree-app-d9238.firebaseapp.com",
    projectId: "family-tree-app-d9238",
    storageBucket: "family-tree-app-d9238.firebasestorage.app",
    messagingSenderId: "706249260228",
    appId: "1:706249260228:web:be1afb1a46170ec3d85d91"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Persistent (IndexedDB) cache so the tree AND its photo docs work offline
  // across reloads. The try/catch guards synchronous init errors; in private mode
  // / unsupported browsers the SDK degrades to an in-memory cache on its own
  // (asynchronously) — acceptable graceful degradation: online works normally,
  // and the local tree still persists via localStorage; only cross-reload OFFLINE
  // photo viewing is lost in that rare case.
  let db;
  try{
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  }catch(e){
    try{ console.warn('Firestore persistence unavailable, using memory cache:', e && e.code); }catch(_){}
    db = getFirestore(app);
  }
  window.__ftPhotos = makePhotoApi(db);

  var currentUid = null;
  var currentTreeId = null;
  var currentRole = null;
  var currentMemberships = [];   // [{treeId, role, familyName}] — the "my families" list
  var unsubTree = null;
  var applyingRemote = false;
  var remoteLoaded = false;   // true once the first cloud snapshot has arrived
  var syncErrorAlerted = false; // latch so a persistent sync error alerts once, not every save
  var pushTimer = null;
  var MAX_DOC_BYTES = 900000; // safety margin under Firestore's 1MB document limit

  /* Translation bridge to app.js (this module can't see app.js's IIFE scope).
     Falls back to the key so a missing bridge never throws. */
  function t(key){ return (window.__ftT ? window.__ftT(key) : key); }
  function tf(key, vars){ return (window.__ftTf ? window.__ftTf(key, vars) : key); }
  // toast lives in app.js's IIFE; bridge it so a bare toast() here never throws
  // (an unhandled ReferenceError after a successful write would read as a failure).
  function toast(msg){ if(window.__ftToast) window.__ftToast(msg); }

  var authGate = document.getElementById('authGate');
  /* The banner cloud/sync button was removed (its account + sync actions live in
     Settings now). Keep a null-safe stand-in so the many cloudBtn.* references
     below don't need touching and never crash if the element is absent. */
  var cloudBtn = document.getElementById('cloudBtn') || { style:{}, dataset:{}, title:'', addEventListener:function(){} };
  var authErr = document.getElementById('authErr');
  var authLoading = document.getElementById('authLoading');
  var authSubmitBtn = document.getElementById('authSubmitBtn');

  function showErr(msg){ authErr.textContent = msg; authErr.classList.add('show'); }
  function clearErr(){ authErr.classList.remove('show'); authErr.textContent=''; }
  function setLoading(on){ authLoading.classList.toggle('show', on); authSubmitBtn.disabled = on; }

  /* Reveal the tab shell once auth succeeds (join flow, create flow, or an
     already-signed-in reload); hide it again when auth is lost. */
  function showAppShell(){
    var nav = document.getElementById('bottomNav');
    if(nav) nav.style.display = 'flex';
    if(window.__ftShowTab) window.__ftShowTab(localStorage.getItem('ft_tab') || 'tree');
  }
  function hideAppShell(){
    var nav = document.getElementById('bottomNav');
    if(nav) nav.style.display = 'none';
  }

  function friendlyAuthError(code){
    var map = {
      'auth/invalid-email':'صيغة البريد الإلكتروني غير صحيحة',
      'auth/user-not-found':'لا يوجد حساب بهذا البريد',
      'auth/wrong-password':'كلمة المرور غير صحيحة',
      'auth/invalid-credential':'البريد أو كلمة المرور غير صحيحة',
      'auth/email-already-in-use':'هذا البريد مستخدم بالفعل — جرّب تسجيل الدخول',
      'auth/weak-password':'كلمة المرور ضعيفة جدًا (6 أحرف على الأقل)',
      'auth/network-request-failed':'تعذّر الاتصال بالإنترنت',
      'auth/too-many-requests':'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة',
      // Firestore codes that can surface during create/join
      'permission-denied':'ليست لديك صلاحية لهذا الإجراء',
      'unavailable':'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة',
      'deadline-exceeded':'انتهت مهلة الاتصال — أعد المحاولة',
      'not-found':'العنصر المطلوب غير موجود'
    };
    // Never surface a raw internal code to the user; fall back to a generic
    // translated message and keep the code in the console for debugging.
    if(!map[code] && code){ try { console.error('[auth] unmapped error code:', code); } catch(e){} }
    return map[code] || 'حدث خطأ غير متوقّع — أعد المحاولة، وإن استمر تواصل مع الدعم';
  }

  var mode = 'login';
  var signupMode = 'create';
  var tabLogin = document.getElementById('tabLogin');
  var tabSignup = document.getElementById('tabSignup');
  var signupModeBox = document.getElementById('signupModeBox');
  var modeCreate = document.getElementById('modeCreate');
  var modeJoin = document.getElementById('modeJoin');
  var joinCodeField = document.getElementById('joinCodeField');

  function refreshAuthUI(){
    tabLogin.classList.toggle('active', mode==='login');
    tabSignup.classList.toggle('active', mode==='signup');
    signupModeBox.style.display = mode==='signup' ? 'block' : 'none';
    joinCodeField.style.display = (mode==='signup' && signupMode==='join') ? 'block' : 'none';
    authSubmitBtn.textContent = mode==='login' ? 'دخول' : (signupMode==='create' ? 'إنشاء الحساب والعائلة' : 'إنشاء الحساب والانضمام');
    clearErr();
  }
  tabLogin.onclick = function(){ mode='login'; refreshAuthUI(); };
  tabSignup.onclick = function(){ mode='signup'; refreshAuthUI(); };
  modeCreate.onclick = function(){ signupMode='create'; modeCreate.classList.add('active'); modeJoin.classList.remove('active'); refreshAuthUI(); };
  modeJoin.onclick = function(){ signupMode='join'; modeJoin.classList.add('active'); modeCreate.classList.remove('active'); refreshAuthUI(); };
  refreshAuthUI();

  (function handleInviteHash(){
    var h = location.hash || '';
    if(h.indexOf('#join=') === 0){
      var payload = decodeURIComponent(h.slice('#join='.length));
      var jc = document.getElementById('joinCode');
      if(jc){ jc.value = payload; }
      mode = 'signup'; signupMode = 'join';
      modeJoin.classList.add('active'); modeCreate.classList.remove('active');
      refreshAuthUI();
    }
  })();

  var manualAuthFlow = false;

  authSubmitBtn.onclick = async function(){
    clearErr();
    var email = document.getElementById('authEmail').value.trim();
    var pass = document.getElementById('authPass').value;
    if(!email || !pass){ showErr('يرجى إدخال البريد وكلمة المرور'); return; }
    setLoading(true);
    // Set true only once membership is fully committed; until then a thrown
    // error must roll back the just-created account so none is left orphaned.
    var joined = false;
    try{
      if(mode === 'login'){
        await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged handles the rest for a normal login.
      } else if(signupMode === 'join'){
        // The join link carries "<treeId>.<token>" in #join=; the invite-hash
        // handler below (on load) parses it into this field. No tree read
        // before join -- the invite doc is the only thing read, by token id.
        var joinRaw = document.getElementById('joinCode').value.trim();
        // Accept either a full invite link (…#join=<treeId>.<token>) or the bare
        // "<treeId>.<token>". Pasting the whole URL is the common case, so strip
        // everything up to and including "#join=" before splitting -- otherwise
        // the first dot lands in the domain (github.io) and the path is invalid.
        var hashIdx = joinRaw.indexOf('#join=');
        if(hashIdx !== -1) joinRaw = joinRaw.slice(hashIdx + '#join='.length);
        try { joinRaw = decodeURIComponent(joinRaw); } catch(e){ /* keep as-is */ }
        joinRaw = joinRaw.trim();
        var dot = joinRaw.indexOf('.');
        if(dot < 1){ manualAuthFlow = false; setLoading(false); showErr(t('errBadInvite')); return; }
        var joinTreeId = joinRaw.slice(0, dot);
        var joinToken  = joinRaw.slice(dot + 1);
        // A well-formed token is a single path segment; reject anything with a
        // slash so a malformed paste fails cleanly instead of as invalid-argument.
        if(!joinTreeId || !joinToken || joinTreeId.indexOf('/') !== -1 || joinToken.indexOf('/') !== -1){
          setLoading(false); showErr(t('errBadInvite')); return;
        }
        manualAuthFlow = true;
        var cred = await createUserWithEmailAndPassword(auth, email, pass);
        // Read the invite by token (rules: get allowed for any signed-in user).
        var invSnap = await getDoc(doc(db, 'trees', joinTreeId, 'invites', joinToken));
        if(!invSnap.exists()){
          await cred.user.delete().catch(function(e){ console.error('[join] cleanup after bad invite failed', e && e.code); });
          manualAuthFlow = false; setLoading(false); showErr(t('errBadInvite')); return;
        }
        var invRole = invSnap.data().role; // 'editor' | 'viewer'
        // Membership create is authorised by the invite path in the rules.
        await setDoc(doc(db, 'trees', joinTreeId, 'members', cred.user.uid),
          { email: email, role: invRole, viaInvite: joinToken, joinedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', cred.user.uid), { email: email, treeId: joinTreeId, activeTreeId: joinTreeId });
        await setDoc(doc(db, 'users', cred.user.uid, 'memberships', joinTreeId),
          { role: invRole, familyName: { ar: '', en: '' }, joinedAt: serverTimestamp() });
        joined = true; // membership committed — the account is now valid, no rollback
        currentUid = cred.user.uid; currentTreeId = joinTreeId;
        currentRole = invRole;
        window.__ftSetEditable(invRole !== 'viewer');
        subscribeTree(currentTreeId);
        authGate.classList.add('hidden');
        cloudBtn.style.display = 'flex'; cloudBtn.title = (auth.currentUser && auth.currentUser.email) || ''; document.getElementById('momentsOpenBtn').style.display = 'flex';
        showAppShell();
        setLoading(false);
        manualAuthFlow = false;
        logActivity('join', '');
      } else {
        manualAuthFlow = true;
        var cred2 = await createUserWithEmailAndPassword(auth, email, pass);
        // Auto-id tree: id is decoupled from any human-shareable secret, so
        // there is no code to collide (removes finding 3.3). createdBy lets
        // the rules authorise the bootstrap owner-membership below.
        var treeRef = doc(collection(db, 'trees'));
        var newCode = treeRef.id;
        // Tree doc FIRST: the members bootstrap rule reads trees/{id}.createdBy.
        await setDoc(treeRef, { familyName:{ar:'',en:''}, lang:'ar', rootId:null, people:{}, createdBy: cred2.user.uid, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'trees', newCode, 'members', cred2.user.uid), { email: email, role: 'owner', joinedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', cred2.user.uid), { email: email, treeId: newCode, activeTreeId: newCode });
        await setDoc(doc(db, 'users', cred2.user.uid, 'memberships', newCode),
          { role: 'owner', familyName: { ar: '', en: '' }, joinedAt: serverTimestamp() });
        joined = true; // owner membership committed — no rollback
        currentUid = cred2.user.uid; currentTreeId = newCode;
        currentRole = 'owner';
        window.__ftSetEditable(true);
        subscribeTree(currentTreeId);
        authGate.classList.add('hidden');
        cloudBtn.style.display = 'flex'; cloudBtn.title = (auth.currentUser && auth.currentUser.email) || ''; document.getElementById('momentsOpenBtn').style.display = 'flex';
        showAppShell();
        setLoading(false);
        manualAuthFlow = false;
        logActivity('create_family', '');
      }
    }catch(err){
      // A failure between account creation and committed membership would leave
      // an orphaned auth account (signed in, no membership) that then dead-ends
      // on "contact support" every reload. Roll it back before surfacing the error.
      if(manualAuthFlow && !joined && auth.currentUser){
        try { await auth.currentUser.delete(); }
        catch(delErr){ console.error('[auth] orphan-account cleanup failed', delErr && delErr.code); }
      }
      manualAuthFlow = false;
      setLoading(false);
      showErr(friendlyAuthError(err.code || err.message));
    }
  };

  onAuthStateChanged(auth, async function(user){
    if(manualAuthFlow) return; // the signup/join flow above is handling this itself
    if(!user){
      currentUid = null; currentTreeId = null; currentRole = null;
      if(unsubTree){ unsubTree(); unsubTree = null; }
      cloudBtn.style.display = 'none';
      document.getElementById('momentsOpenBtn').style.display = 'none';
      document.getElementById('momentsScreen').classList.remove('open');
      if(unsubMoments){ unsubMoments(); unsubMoments = null; }
      authGate.classList.remove('hidden');
      hideAppShell();
      setLoading(false);
      return;
    }
    currentUid = user.uid;
    setLoading(true);
    try{
      var userSnap = await getDoc(doc(db, 'users', user.uid));
      var userData = userSnap.exists() ? userSnap.data() : {};
      // Load the membership index (the user's trees).
      var memSnap = await getDocs(collection(db, 'users', user.uid, 'memberships'));
      currentMemberships = [];
      memSnap.forEach(function(d){ currentMemberships.push(Object.assign({ treeId: d.id }, d.data())); });
      var memIds = currentMemberships.map(function(m){ return m.treeId; });

      // Legacy auto-migration: a pre-multi-family user has users/{uid}.treeId but
      // no memberships. Seed one from their member doc so nothing breaks.
      var seedId = window.ftMembership.needsLegacySeed(userData, memIds);
      if(seedId){
        var legacyMember = await getDoc(doc(db, 'trees', seedId, 'members', user.uid));
        var legacyTree = await getDoc(doc(db, 'trees', seedId));
        var seedRole = legacyMember.exists() ? (legacyMember.data().role || 'viewer') : 'viewer';
        var seedFam = legacyTree.exists() ? (legacyTree.data().familyName || { ar:'', en:'' }) : { ar:'', en:'' };
        await writeMembership(seedId, seedRole, seedFam);
        await setDoc(doc(db, 'users', user.uid), { activeTreeId: seedId }, { merge: true });
        currentMemberships = [{ treeId: seedId, role: seedRole, familyName: seedFam }];
        memIds = [seedId];
        userData.activeTreeId = seedId;
      }

      var activeId = window.ftMembership.resolveActiveTree(userData, memIds);
      if(!activeId){
        setLoading(false);
        showErr('تعذّر العثور على عائلة مرتبطة بحسابك. تواصل مع الدعم.');
        return;
      }
      currentTreeId = activeId;
      var memberSnap = await getDoc(doc(db, 'trees', currentTreeId, 'members', user.uid));
      if(!memberSnap.exists()){
        // No membership => no access. Never fall through to a default role;
        // that was finding 3.1 (an absent member doc granted 'editor').
        setLoading(false);
        showErr(t('errNoMembership'));
        await signOut(auth).catch(function(){});
        return;
      }
      currentRole = memberSnap.data().role || 'viewer'; // missing role => least privilege
      window.__ftSetEditable(currentRole !== 'viewer');
      if(window.__ftSetActiveTree) window.__ftSetActiveTree(currentTreeId);   // per-tree local store (Task 7)
      subscribeTree(currentTreeId);
      authGate.classList.add('hidden');
      cloudBtn.style.display = 'flex'; cloudBtn.title = (auth.currentUser && auth.currentUser.email) || ''; document.getElementById('momentsOpenBtn').style.display = 'flex';
      showAppShell();
      setLoading(false);
      maybeHandleLinkHash();   // a #link= opened while signed out, now that we're in
      /* Log a login at most once per member per day — onAuthStateChanged also
         fires on hourly token refresh, which would otherwise spam the log. */
      (function(){
        var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (local enough for a daily gate)
        var key = 'ft_loginLogged_' + currentTreeId + '_' + currentUid;
        var last = null; try { last = localStorage.getItem(key); } catch(e){}
        if(last !== today){
          try { localStorage.setItem(key, today); } catch(e){}
          logActivity('login', '');
        }
      })();
    }catch(err){
      setLoading(false);
      showErr('تعذّر تحميل بيانات الحساب: ' + (err.message||err.code));
    }
  });

  // Self-written index entry so the "my families" sheet can list this tree.
  async function writeMembership(treeId, role, familyName){
    await setDoc(doc(db, 'users', currentUid, 'memberships', treeId),
      { role: role, familyName: familyName || { ar: '', en: '' }, joinedAt: serverTimestamp() });
  }

  // Create a brand-new family the signed-in user owns (no new auth account). Uses
  // the existing bootstrap-owner rule (trees/{id}.createdBy == uid && !member).
  async function createFamily(nameObj){
    if(!currentUid) return;
    try{
      var treeRef = doc(collection(db, 'trees'));
      var newId = treeRef.id;
      await setDoc(treeRef, { familyName: nameObj || {ar:'',en:''}, lang: 'ar', rootId: null, people: {}, createdBy: currentUid, updatedAt: serverTimestamp() });
      await setDoc(doc(db, 'trees', newId, 'members', currentUid), { email: (auth.currentUser&&auth.currentUser.email)||'', role: 'owner', joinedAt: serverTimestamp() });
      await writeMembership(newId, 'owner', nameObj || {ar:'',en:''});
      currentMemberships.push({ treeId: newId, role: 'owner', familyName: nameObj || {ar:'',en:''} });
      await switchFamily(newId);
    }catch(e){ console.error('createFamily failed', e && e.code, e); alert(writeErrMsg(e, t('errJoinFailed'))); }
  }

  // Join another family from inside the app via an invite link (no new auth
  // account). Reuses the existing invite member-create rule (role != owner).
  async function joinFamily(linkText){
    if(!currentUid) return;
    var raw = String(linkText || '').trim();
    var hashIdx = raw.indexOf('#join='); if(hashIdx !== -1) raw = raw.slice(hashIdx + '#join='.length);
    try{ raw = decodeURIComponent(raw); }catch(e){}
    raw = raw.trim();
    var dot = raw.indexOf('.');
    if(dot < 1){ alert(t('errBadInvite')); return; }
    var jTree = raw.slice(0, dot), jTok = raw.slice(dot + 1);
    if(!jTree || !jTok || jTree.indexOf('/') !== -1 || jTok.indexOf('/') !== -1){ alert(t('errBadInvite')); return; }
    if(currentMemberships.some(function(m){ return m.treeId === jTree; })){ await switchFamily(jTree); return; }
    try{
      var inv = await getDoc(doc(db, 'trees', jTree, 'invites', jTok));
      if(!inv.exists()){ alert(t('errBadInvite')); return; }
      var invRole = inv.data().role;
      await setDoc(doc(db, 'trees', jTree, 'members', currentUid), { email: (auth.currentUser&&auth.currentUser.email)||'', role: invRole, viaInvite: jTok, joinedAt: serverTimestamp() });
      var treeDoc = await getDoc(doc(db, 'trees', jTree));
      var fam = treeDoc.exists() ? (treeDoc.data().familyName || {ar:'',en:''}) : {ar:'',en:''};
      await writeMembership(jTree, invRole, fam);
      currentMemberships.push({ treeId: jTree, role: invRole, familyName: fam });
      await switchFamily(jTree);
    }catch(e){ console.error('joinFamily failed', e && e.code, e); alert(writeErrMsg(e, t('errJoinFailed'))); }
  }

  async function setActiveTree(treeId){
    try{ await setDoc(doc(db, 'users', currentUid), { activeTreeId: treeId }, { merge: true }); }
    catch(e){ try{ console.warn('setActiveTree failed', e && e.code); }catch(_){} }
  }
  // Switch the active family: re-point authority/role from the new tree's member
  // doc, swap the local store, resubscribe, and persist the choice.
  async function switchFamily(treeId){
    if(!treeId || treeId === currentTreeId) return;
    // Read the new tree's member doc for authority. If the user was removed from
    // that tree (stale index entry), the read is denied — surface it instead of a
    // silent unhandled rejection, and stay on the current tree.
    var memberSnap;
    try{ memberSnap = await getDoc(doc(db, 'trees', treeId, 'members', currentUid)); }
    catch(e){ console.error('switchFamily member read failed', e && e.code, e); alert(t('errNoMembership')); return; }
    if(!memberSnap.exists()){ alert(t('errNoMembership')); return; }
    if(unsubTree){ unsubTree(); unsubTree = null; }
    remoteLoaded = false;
    currentLinks = [];   // drop the old tree's links until the new tree's load
    currentTreeId = treeId;
    currentRole = memberSnap.data().role || 'viewer';
    window.__ftSetEditable(currentRole !== 'viewer');
    if(window.__ftSetActiveTree) window.__ftSetActiveTree(treeId);   // swap local store + reload
    subscribeTree(treeId);
    await setActiveTree(treeId);
    if(window.__ftShowTab) window.__ftShowTab('home');
  }

  function subscribeTree(treeId){
    if(unsubTree) unsubTree();
    unsubTree = onSnapshot(doc(db, 'trees', treeId), function(snap){
      if(!snap.exists()) return;
      var data = snap.data();
      applyingRemote = true;
      if(window.__ftApplyRemote) window.__ftApplyRemote({
        familyName: data.familyName || '', lang: data.lang || 'ar',
        rootId: data.rootId || null, people: data.people || {}
      });
      applyingRemote = false;
      remoteLoaded = true;   // safe to push local edits now that we hold the real tree
      cloudBtn.dataset.status = 'online';
      // A snapshot may carry a photo replaced on another device (stable photoPath,
      // so no per-doc signal) — drop the photo cache so it re-reads fresh.
      if(window.__ftPhotos && window.__ftPhotos.invalidateCache) window.__ftPhotos.invalidateCache();
      maybeMigratePhotos();
      loadLinks();
    }, function(){
      cloudBtn.dataset.status = 'offline';
    });
  }

  // Gradual photo migration: an editor uploads any remaining base64 photos to
  // Storage in small paced batches, resuming across snapshots/sessions. A flag
  // prevents overlap; batches are spaced so migration never contends with saves.
  var migrating = false;
  function maybeMigratePhotos(){
    if(migrating || currentRole === 'viewer' || !currentTreeId) return;
    if(window.__ftInLinkedView && window.__ftInLinkedView()) return;   // not while viewing another tree
    if(!window.__ftMigratePhotoBatch) return;
    migrating = true;
    (async function runBatch(){
      try{
        var res = await window.__ftMigratePhotoBatch(currentTreeId, 5);
        if(res && res.migrated && res.remaining > 0){
          setTimeout(runBatch, 3000);   // pace the next batch
          return;
        }
      }catch(e){ try{ console.error('[photo-migrate] batch error', e); }catch(_){}; }
      migrating = false;
    })();
  }

  async function logActivity(action, personName, detail){
    if(!currentTreeId || !currentUid) return;
    var email = (auth.currentUser && auth.currentUser.email) || '';
    try{
      await addDoc(collection(db, 'trees', currentTreeId, 'activity'), {
        action: action, personName: personName || '', detail: detail || '', byEmail: email, byUid: currentUid, at: serverTimestamp()
      });
    }catch(e){ console.warn('logActivity failed (likely security rules not yet published):', e.message); }
  }

  function actionLabel(action){
    if(action === 'add') return 'أضاف';
    if(action === 'edit') return 'عدّل';
    if(action === 'delete') return 'حذف';
    if(action === 'login') return 'سجّل الدخول';
    if(action === 'join') return 'انضم للعائلة';
    if(action === 'create_family') return 'أنشأ العائلة';
    return action;
  }
  function timeAgo(dateObj){
    if(!dateObj) return '';
    var diffSec = Math.round((Date.now() - dateObj.getTime())/1000);
    if(diffSec < 60) return 'الآن';
    var m = Math.round(diffSec/60); if(m < 60) return 'منذ ' + m + ' دقيقة';
    var h = Math.round(m/60); if(h < 24) return 'منذ ' + h + ' ساعة';
    var d = Math.round(h/24); return 'منذ ' + d + ' يوم';
  }

  async function showActivityLog(){
    var overlay = document.getElementById('overlay');
    var sheet = document.getElementById('sheet');
    var body = document.getElementById('sheetBody');
    body.innerHTML = '<h3>📋 سجل النشاط</h3><div class="context">جارِ التحميل…</div>';
    overlay.classList.add('open'); sheet.classList.add('open');
    try{
      var esc = window.__ftEscapeHtml || function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
      // Today only: a session's activity for the day it's opened, dated at the top.
      var lang = (window.__ftGetState && window.__ftGetState() && window.__ftGetState().lang) || 'ar';
      var dateStr = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-EG',
        { weekday:'long', year:'numeric', month:'long', day:'numeric' });
      var header = '<h3>📋 سجل النشاط</h3>' +
        '<div style="text-align:center; font-family:var(--f-head); font-weight:700; color:var(--emerald); font-size:14px; margin:2px 0 12px;">📅 ' + esc(dateStr) + '</div>';
      var todayStart = new Date(); todayStart.setHours(0,0,0,0);
      var q = query(collection(db, 'trees', currentTreeId, 'activity'), orderBy('at', 'desc'), limit(80));
      var snap = await getDocs(q);
      var rows = '';
      var seenLogin = {};   // collapse repeated logins: one per member
      snap.forEach(function(d){
        var v = d.data();
        var at = v.at && v.at.toDate ? v.at.toDate() : null;
        if(!at || at < todayStart) return;             // today's activity only
        if(v.action === 'login'){
          var key = (v.byUid || v.byEmail || '?');
          if(seenLogin[key]) return;                   // one login line per member today
          seenLogin[key] = true;
        }
        var isPersonAction = (v.action === 'add' || v.action === 'edit' || v.action === 'delete');
        rows += '<div style="padding:9px 0; border-bottom:1px solid var(--paper-deep); font-size:13px;">' +
          '<b>' + esc(v.byEmail || '؟') + '</b> ' + esc(actionLabel(v.action)) +
          (isPersonAction ? ' «' + esc(v.personName || '') + '»' : '') +
          (v.detail ? ' <span style="color:var(--ink-soft);">(' + esc(v.detail) + ')</span>' : '') +
          '<div style="color:var(--ink-soft); font-size:11px; margin-top:2px;">' + (at ? timeAgo(at) : '') + '</div>' +
        '</div>';
      });
      body.innerHTML = rows ? (header + rows) : (header + '<div class="context">لا يوجد نشاط اليوم.</div>');
    }catch(e){
      body.innerHTML = '<h3>📋 سجل النشاط</h3><div class="context">تعذّر تحميل السجل.</div>';
    }
  }

  async function showMembers(){
    var overlay = document.getElementById('overlay');
    var sheet = document.getElementById('sheet');
    var body = document.getElementById('sheetBody');
    body.innerHTML = '<h3>👥 أفراد العائلة</h3><div class="context">جارِ التحميل…</div>';
    overlay.classList.add('open'); sheet.classList.add('open');
    try{
      var snap = await getDocs(collection(db, 'trees', currentTreeId, 'members'));
      var rows = '';
      var esc = window.__ftEscapeHtml || function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
      snap.forEach(function(d){
        var v = d.data();
        var uid = d.id;
        var role = v.role || 'editor';
        var roleLabel = role === 'owner' ? 'مالك' : (role === 'viewer' ? 'مشاهدة فقط' : 'محرِّر');
        var isSelf = uid === currentUid;
        rows += '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border-bottom:1px solid var(--paper-deep);">' +
          '<div style="font-size:12.5px;"><b>' + esc(v.email || uid) + '</b>' + (isSelf ? ' (أنت)' : '') +
          '<div style="color:var(--ink-soft); font-size:11px;">' + roleLabel + '</div></div>' +
          (currentRole === 'owner' && !isSelf ? (
            '<div style="display:flex; gap:5px;">' +
              (role !== 'viewer' ? '<button class="mini-btn" data-uid="'+uid+'" data-newrole="viewer" data-mact="role" title="تخفيض لمشاهد">👁</button>' : '') +
              (role !== 'editor' ? '<button class="mini-btn" data-uid="'+uid+'" data-newrole="editor" data-mact="role" title="ترقية لمحرِّر">✎</button>' : '') +
              '<button class="mini-btn danger" data-uid="'+uid+'" data-mact="remove" title="إزالة من العائلة">🗑</button>' +
            '</div>'
          ) : '') +
        '</div>';
      });
      var inviteBtn = (currentRole === 'owner' && createInvite)
        ? '<button class="primary-btn" id="mem_invite" style="margin-top:14px; background:var(--teal);">＋ '+t('menuInvite')+'</button>'
        : '';
      body.innerHTML = '<h3>👥 أفراد العائلة (' + snap.size + ')</h3>' + rows + inviteBtn;
      var mi = document.getElementById('mem_invite');
      if(mi) mi.onclick = function(){ createInvite('editor'); };
      body.querySelectorAll('[data-mact="role"]').forEach(function(btn){
        btn.onclick = async function(){
          var uid = btn.dataset.uid, newRole = btn.dataset.newrole;
          try{
            await updateDoc(doc(db, 'trees', currentTreeId, 'members', uid), { role: newRole });
            showMembers();
          }catch(e){ alert('تعذّر تغيير الصلاحية.'); }
        };
      });
      body.querySelectorAll('[data-mact="remove"]').forEach(function(btn){
        btn.onclick = async function(){
          var uid = btn.dataset.uid;
          if(!confirm('إزالة هذا الفرد من العائلة؟ لن يعود بإمكانه رؤية الشجرة.')) return;
          try{
            await deleteDoc(doc(db, 'trees', currentTreeId, 'members', uid));
            showMembers();
          }catch(e){ alert('تعذّر إزالة العضو.'); }
        };
      });
    }catch(e){
      body.innerHTML = '<h3>👥 أفراد العائلة</h3><div class="context">تعذّر تحميل القائمة.</div>';
    }
  }

  /* ---------- Family moments feed ---------- */
  var unsubMoments = null;
  var pendingMomentPhoto = null;
  // Per-moment live listeners (reactions + comments) and which comment panels
  // the user has opened. Torn down and rebuilt on every feed re-render, and
  // fully released when the feed closes, so listeners never leak.
  var momentSubs = {};
  var openComments = {};

  // Structured moment types: turn a free-text feed into a legible one. Each type
  // has an icon, an Arabic label (this feed is inline-Arabic like the rest of the
  // moments UI), and a CSS accent class. 'news' is the neutral default.
  var MOMENT_TYPES = [
    { id: 'news',        icon: '📰', label: 'خبر' },
    { id: 'birth',       icon: '👶', label: 'مولود' },
    { id: 'marriage',    icon: '💍', label: 'زواج' },
    { id: 'graduation',  icon: '🎓', label: 'تخرّج' },
    { id: 'travel',      icon: '✈️', label: 'سفر' },
    { id: 'achievement', icon: '🏆', label: 'إنجاز' },
    { id: 'memorial',    icon: '🕊', label: 'في ذمة الله' }
  ];
  var MOMENT_TYPE_BY_ID = {};
  MOMENT_TYPES.forEach(function(tp){ MOMENT_TYPE_BY_ID[tp.id] = tp; });
  var selectedMomentType = 'news';

  function renderMomentTypeChips(){
    var host = document.getElementById('momentTypes');
    if(!host) return;
    host.innerHTML = MOMENT_TYPES.map(function(tp){
      return '<button type="button" class="mtype-chip mtype-' + tp.id + (tp.id === selectedMomentType ? ' active' : '') +
             '" data-type="' + tp.id + '">' + tp.icon + ' ' + tp.label + '</button>';
    }).join('');
    host.querySelectorAll('.mtype-chip').forEach(function(chip){
      chip.onclick = function(){
        selectedMomentType = chip.dataset.type;
        host.querySelectorAll('.mtype-chip').forEach(function(c){ c.classList.toggle('active', c === chip); });
      };
    });
  }

  function esc(s){
    return (window.__ftEscapeHtml || function(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); })(s);
  }
  function teardownMomentSubs(){
    Object.keys(momentSubs).forEach(function(mid){
      (momentSubs[mid] || []).forEach(function(u){ try{ u(); }catch(e){} });
    });
    momentSubs = {};
  }
  // A write's failure message must match its cause — blaming the security rules
  // for a dropped connection sends a non-technical family member chasing the
  // wrong fix. permission-denied is the rules case; unavailable is the network.
  function writeErrMsg(e, base){
    if(e && e.code === 'permission-denied') return base + ' — تأكد من تحديث قواعد الأمان (Firestore Rules).';
    if(e && e.code === 'unavailable')       return 'تعذّر الاتصال — تحقّق من الإنترنت وحاول مجدداً.';
    return base + '، حاول مرة أخرى.';
  }

  function renderMoments(docs){
    var list = document.getElementById('momentsList');
    teardownMomentSubs();
    // Drop open-comment flags for moments no longer in the feed, so the map
    // can't grow without bound or re-open a panel on a recycled id.
    var liveIds = {}; docs.forEach(function(d){ liveIds[d.id] = 1; });
    Object.keys(openComments).forEach(function(k){ if(!liveIds[k]) delete openComments[k]; });
    if(!docs.length){
      list.innerHTML = '<div class="moments-empty">لا توجد لحظات بعد — كن أول من يشارك خبرًا مع العائلة!</div>';
      return;
    }
    var timeAgoFn = window.__ftTimeAgo || function(){ return ''; };
    var html = '';
    docs.forEach(function(d){
      var v = d.data();
      var when = v.at && v.at.toDate ? timeAgoFn(v.at.toDate()) : 'الآن';
      var canDelete = v.byUid === currentUid || currentRole === 'owner';
      var open = !!openComments[d.id];
      // A moment without a stored type is a legacy 'news' post — default cleanly.
      var tp = MOMENT_TYPE_BY_ID[v.type] || MOMENT_TYPE_BY_ID.news;
      html += '<div class="moment-card mtype-' + tp.id + '">' +
        '<div class="moment-head">' +
          '<span class="moment-author">' + esc(v.byEmail || '؟') + '</span>' +
          '<span class="moment-type-badge">' + tp.icon + ' ' + tp.label + '</span>' +
          '<span class="moment-time">' + when + '</span></div>' +
        (v.text ? '<div class="moment-text">' + esc(v.text) + '</div>' : '') +
        (function(){
          var s = window.ftPhotoSource ? window.ftPhotoSource({ photoPath: v.photoPath, photo: v.photo }) : { kind:'none' };
          if(s.kind === 'base64') return '<img class="moment-photo" src="' + esc(s.value) + '">';
          if(s.kind === 'path')   return '<img class="moment-photo" data-photo-path="' + esc(s.value) + '">';
          return '';
        })() +
        '<div class="moment-actions">' +
          '<button class="react-btn" data-mid="' + d.id + '">🤍 <span class="react-count">0</span></button>' +
          '<button class="comment-btn" data-mid="' + d.id + '">💬 <span class="comment-count">0</span></button>' +
          (canDelete ? '<button class="moment-del" data-id="' + d.id + '">🗑</button>' : '') +
        '</div>' +
        '<div class="moment-comments" id="comments-' + d.id + '"' + (open ? '' : ' style="display:none;"') + '>' +
          '<div class="comments-list" id="comments-list-' + d.id + '"></div>' +
          '<div class="comment-compose">' +
            '<input class="comment-input" id="comment-input-' + d.id + '" placeholder="أضف تعليقًا…" maxlength="500">' +
            '<button class="comment-send" data-mid="' + d.id + '">إرسال</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    list.innerHTML = html;
    if(window.__ftFillPhotoRefs) window.__ftFillPhotoRefs(list);   // resolve Storage moment photos
    list.querySelectorAll('.moment-del').forEach(function(btn){
      btn.onclick = async function(){
        if(!confirm('حذف هذه اللحظة؟')) return;
        try{
          await deleteDoc(doc(db, 'trees', currentTreeId, 'moments', btn.dataset.id));
          // Best-effort remove the moment's Storage photo too (no-op if none).
          if(window.__ftPhotos && window.ftPhotoPaths) window.__ftPhotos.deletePhoto(window.ftPhotoPaths.moment(currentTreeId, btn.dataset.id)).catch(function(){});
        }
        catch(e){ console.error('moment delete failed', e && e.code, e); alert(writeErrMsg(e, 'تعذّر الحذف')); }
      };
    });
    docs.forEach(function(d){ wireMomentSocial(d.id); });
  }

  // Attach live reaction + comment listeners for one moment card and wire its
  // controls. Writes are gated by the reactions/comments subcollection rules,
  // so a viewer with a stale UI still can't forge anything server-side.
  function wireMomentSocial(mid){
    var reactBtn   = document.querySelector('.react-btn[data-mid="' + mid + '"]');
    var commentBtn = document.querySelector('.comment-btn[data-mid="' + mid + '"]');
    var panel      = document.getElementById('comments-' + mid);
    var input      = document.getElementById('comment-input-' + mid);
    var sendBtn    = panel ? panel.querySelector('.comment-send') : null;

    // Reactions: one doc per member; count them and mark whether I reacted.
    var rUnsub = onSnapshot(collection(db, 'trees', currentTreeId, 'moments', mid, 'reactions'), function(snap){
      var count = 0, mine = false;
      snap.forEach(function(r){ count++; if(r.id === currentUid) mine = true; });
      if(reactBtn){
        reactBtn.classList.toggle('reacted', mine);
        reactBtn.firstChild.textContent = (mine ? '❤️ ' : '🤍 ');
        var rc = reactBtn.querySelector('.react-count'); if(rc) rc.textContent = count;
      }
    }, function(err){
      // Firestore drops a listener after its error callback fires (no retry), so
      // a denied/expired read must NOT masquerade as "0 reactions" — show an
      // unknown marker instead, and log for diagnosis (permission/index/quota).
      console.error('reactions listener failed', mid, err && err.code, err);
      if(reactBtn){
        var rcx = reactBtn.querySelector('.react-count'); if(rcx) rcx.textContent = '—';
        reactBtn.title = 'تعذّر تحميل التفاعلات';
      }
    });

    // Comments: ordered oldest→newest so a thread reads top to bottom.
    var cUnsub = onSnapshot(query(collection(db, 'trees', currentTreeId, 'moments', mid, 'comments'), orderBy('at', 'asc')), function(snap){
      var items = [];
      snap.forEach(function(c){ items.push({ id: c.id, data: c.data() }); });
      if(commentBtn){ var cc = commentBtn.querySelector('.comment-count'); if(cc) cc.textContent = items.length; }
      renderCommentList(mid, items);
    }, function(err){
      // Same reasoning as reactions: a denied read (or a missing index for the
      // orderBy query) surfaces ONLY here — never let it look like "no comments".
      console.error('comments listener failed', mid, err && err.code, err);
      if(commentBtn){ var ccx = commentBtn.querySelector('.comment-count'); if(ccx) ccx.textContent = '—'; }
      var listErr = document.getElementById('comments-list-' + mid);
      if(listErr) listErr.innerHTML = '<div class="comments-empty">تعذّر تحميل التعليقات.</div>';
    });

    momentSubs[mid] = [rUnsub, cUnsub];

    if(reactBtn) reactBtn.onclick = function(){ toggleReaction(mid, reactBtn.classList.contains('reacted')); };
    if(commentBtn) commentBtn.onclick = function(){
      openComments[mid] = !openComments[mid];
      if(panel) panel.style.display = openComments[mid] ? 'block' : 'none';
      if(openComments[mid] && input) input.focus();
    };
    if(sendBtn) sendBtn.onclick = function(){ postComment(mid, input); };
    if(input) input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); postComment(mid, input); } });
  }

  function renderCommentList(mid, items){
    var listEl = document.getElementById('comments-list-' + mid);
    if(!listEl) return;
    var timeAgoFn = window.__ftTimeAgo || function(){ return ''; };
    listEl.innerHTML = items.map(function(it){
      var v = it.data;
      var when = v.at && v.at.toDate ? timeAgoFn(v.at.toDate()) : '';
      var canDel = v.byUid === currentUid || currentRole === 'owner';
      return '<div class="comment-row">' +
        '<div class="comment-meta"><span class="comment-author">' + esc(v.byEmail || '؟') + '</span>' +
        (when ? '<span class="comment-time">' + esc(when) + '</span>' : '') + '</div>' +
        '<div class="comment-text">' + esc(v.text || '') + '</div>' +
        (canDel ? '<button class="comment-del" data-mid="' + mid + '" data-cid="' + it.id + '">حذف</button>' : '') +
      '</div>';
    }).join('');
    listEl.querySelectorAll('.comment-del').forEach(function(btn){
      btn.onclick = async function(){
        try{ await deleteDoc(doc(db, 'trees', currentTreeId, 'moments', btn.dataset.mid, 'comments', btn.dataset.cid)); }
        catch(e){ console.error('comment delete failed', e && e.code, e); alert(writeErrMsg(e, 'تعذّر حذف التعليق')); }
      };
    });
  }

  async function toggleReaction(mid, currentlyReacted){
    if(!currentTreeId || !currentUid){ alert('يجب تسجيل الدخول أولاً'); return; }
    var ref = doc(db, 'trees', currentTreeId, 'moments', mid, 'reactions', currentUid);
    try{
      if(currentlyReacted) await deleteDoc(ref);
      else await setDoc(ref, { byUid: currentUid, emoji: '❤️', at: serverTimestamp() });
    }catch(e){
      console.error('toggleReaction failed', mid, e && e.code, e);
      alert(writeErrMsg(e, 'تعذّر تسجيل التفاعل'));
    }
  }

  async function postComment(mid, input){
    if(!input) return;
    var text = input.value.trim();
    if(!text) return;
    if(!currentTreeId || !currentUid){ alert('يجب تسجيل الدخول أولاً'); return; }
    input.disabled = true;
    try{
      await addDoc(collection(db, 'trees', currentTreeId, 'moments', mid, 'comments'), {
        text: text, byUid: currentUid,
        byEmail: (auth.currentUser && auth.currentUser.email) || '',
        at: serverTimestamp()
      });
      input.value = '';
    }catch(e){
      console.error('postComment failed', mid, e && e.code, e);
      alert(writeErrMsg(e, 'تعذّر إضافة التعليق'));
    }
    input.disabled = false;
    input.focus();
  }

  function subscribeMoments(){
    if(unsubMoments) unsubMoments();
    var q = query(collection(db, 'trees', currentTreeId, 'moments'), orderBy('at', 'desc'), limit(50));
    unsubMoments = onSnapshot(q, function(snap){
      var docs = [];
      snap.forEach(function(d){ docs.push(d); });
      renderMoments(docs);
    }, function(){
      // Feed read failed: release any per-moment listeners from a prior good
      // render so they don't keep running against DOM that's about to vanish.
      teardownMomentSubs();
      document.getElementById('momentsList').innerHTML = '<div class="moments-empty">تعذّر تحميل اللحظات.</div>';
    });
  }

  function openMoments(){
    document.getElementById('momentsScreen').classList.add('open');
    document.getElementById('momentsList').innerHTML = '<div class="moments-empty">جارِ التحميل…</div>';
    renderMomentTypeChips();
    subscribeMoments();
  }
  function closeMoments(){
    document.getElementById('momentsScreen').classList.remove('open');
    if(unsubMoments){ unsubMoments(); unsubMoments = null; }
    teardownMomentSubs();
  }
  document.getElementById('momentsOpenBtn').addEventListener('click', openMoments);
  /* The back arrow must switch tabs, not just hide the inner screen — moments is
     a real tab now, so merely removing `.open` left #tab-moments active and blank.
     Route through the app's tab switcher (which also unsubscribes the feed). */
  document.getElementById('momentsBack').addEventListener('click', function(){
    if(window.__ftShowTab) window.__ftShowTab('home');
    else closeMoments();
  });
  /* Moments is now a regular tab (bottom nav + home card), not just a
     slide-over reached via momentsOpenBtn. app.js's tab router calls these
     on every switch into/out of the moments tab so the live feed subscribes
     and unsubscribes regardless of how the user got there. */
  window.__ftOpenMomentsTab = openMoments;
  window.__ftCloseMomentsTab = closeMoments;

  document.getElementById('momentPhotoBtn').addEventListener('click', function(){
    document.getElementById('momentPhotoFile').click();
  });
  document.getElementById('momentPhotoFile').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file || !window.__ftResizeImage) return;
    window.__ftResizeImage(file, 640, function(blob, dataUrl){
      if(!blob){ alert(t('photoReadFail')); return; }
      pendingMomentPhoto = { blob: blob, dataUrl: dataUrl };
      var prev = document.getElementById('momentPhotoPreview');
      prev.style.display = 'block';
      prev.innerHTML = '<img src="'+dataUrl+'"><button type="button" class="remove-photo-x" id="momentRemovePhoto">✕</button>';
      document.getElementById('momentRemovePhoto').onclick = function(){
        pendingMomentPhoto = null; prev.style.display = 'none'; prev.innerHTML = '';
      };
    });
  });

  document.getElementById('momentPostBtn').addEventListener('click', async function(){
    var textEl = document.getElementById('momentText');
    var text = textEl.value.trim();
    if(!text && !pendingMomentPhoto){ alert('اكتب شيئًا أو أضف صورة أولاً'); return; }
    if(!currentTreeId || !currentUid){ alert('يجب تسجيل الدخول أولاً'); return; }
    var btn = document.getElementById('momentPostBtn');
    btn.disabled = true;
    try{
      // The doc ref is created up front so the moment's Storage path (keyed by
      // its own id) is known before the doc is written.
      var mref = doc(collection(db, 'trees', currentTreeId, 'moments'));
      var photoPath = null;
      if(pendingMomentPhoto && pendingMomentPhoto.blob){
        photoPath = window.ftPhotoPaths.moment(currentTreeId, mref.id);
        try{
          await window.__ftPhotos.uploadPhoto(photoPath, pendingMomentPhoto.dataUrl);
        }catch(upErr){
          console.error('moment photo upload failed', upErr && upErr.code, upErr);
          alert(writeErrMsg(upErr, 'تعذّر رفع صورة اللحظة'));
          btn.disabled = false; return;
        }
      }
      try{
        await setDoc(mref, {
          text: text, photoPath: photoPath,
          type: selectedMomentType || 'news',
          byEmail: (auth.currentUser && auth.currentUser.email) || '', byUid: currentUid,
          at: serverTimestamp()
        });
      }catch(docErr){
        // Photo uploaded but the doc write failed → remove the orphaned file.
        if(photoPath && window.__ftPhotos) window.__ftPhotos.deletePhoto(photoPath).catch(function(){});
        throw docErr;
      }
      textEl.value = '';
      pendingMomentPhoto = null;
      selectedMomentType = 'news';
      renderMomentTypeChips();
      var prev = document.getElementById('momentPhotoPreview');
      prev.style.display = 'none'; prev.innerHTML = '';
    }catch(e){
      console.error('moment post failed', e && e.code, e);
      alert(writeErrMsg(e, 'تعذّر النشر'));
    }
    btn.disabled = false;
  });

  async function createInvite(role){
    if(!currentTreeId || currentRole === 'viewer') return;
    var token = (doc(collection(db, 'trees', currentTreeId, 'invites'))).id;
    await setDoc(doc(db, 'trees', currentTreeId, 'invites', token), {
      role: (role === 'viewer' ? 'viewer' : 'editor'), createdBy: currentUid, createdAt: serverTimestamp()
    });
    var base = location.origin + location.pathname;
    var link = base + '#join=' + currentTreeId + '.' + token;
    try { await navigator.clipboard.writeText(link); toast(t('inviteCopied')); }
    catch(e){ prompt(t('inviteCopied'), link); }
  }

  // Family link protocol (project 2). Owner A mints a pending request carrying
  // person X's id plus denormalized display names (the approver cannot read A's
  // people) and hands out a `#link=` token, same trust model as an invite.
  async function requestLink(personId, personName, familyName){
    if(!currentTreeId || currentRole !== 'owner'){ alert(t('linkOwnerOnly')); return; }
    try{
      var token = (doc(collection(db, 'trees', currentTreeId, 'linkRequests'))).id;
      await setDoc(doc(db, 'trees', currentTreeId, 'linkRequests', token), {
        localPersonId: personId, localPersonName: personName || {ar:'',en:''},
        localFamilyName: familyName || {ar:'',en:''}, requestedBy: currentUid,
        kind: 'same_person', createdAt: serverTimestamp()
      });
      var link = location.origin + location.pathname + '#link=' + currentTreeId + '.' + token;
      try{ await navigator.clipboard.writeText(link); toast(t('linkRequestCopied')); }
      catch(e){ prompt(t('linkRequestCopied'), link); }
    }catch(e){ console.error('requestLink failed', e && e.code, e); alert(writeErrMsg(e, t('linkRequestFail'))); }
  }

  var currentLinks = [];   // [{linkId, ...link}] for the active tree

  async function readLinkRequest(reqTreeId, token){
    var snap = await getDoc(doc(db, 'trees', reqTreeId, 'linkRequests', token));
    if(!snap.exists()) return null;
    return Object.assign({ treeId: reqTreeId, token: token }, snap.data());
  }

  // Owner B approves: one shared linkId, mirrored on both trees. Both copies are
  // written in a single atomic writeBatch — Firestore commits all-or-nothing and
  // evaluates each write against its own rule (B's by ownership, A's by the
  // pending request), so a partial/one-sided link can never persist. Returns a
  // success boolean so the caller only clears the #link= hash on success.
  async function approveLink(req, remotePersonId, remoteFamilyName){
    if(!currentTreeId || currentRole !== 'owner'){ alert(t('linkOwnerOnly')); return false; }
    if(!window.ftLinks){ console.error('approveLink: ftLinks unavailable'); alert(t('linkApproveFail')); return false; }
    try{
      var linkId = (doc(collection(db, 'trees', currentTreeId, 'links'))).id;
      var pair = window.ftLinks.buildLinkPair(req, currentTreeId, remotePersonId, remoteFamilyName, currentUid, linkId);
      var batch = writeBatch(db);
      batch.set(doc(db, 'trees', currentTreeId, 'links', linkId), Object.assign({ createdAt: serverTimestamp() }, pair.bSide));
      batch.set(doc(db, 'trees', req.treeId, 'links', linkId), Object.assign({ createdAt: serverTimestamp() }, pair.aSide));
      // Cross-tree read grants (project 3a) — both viewer docs in the same atomic batch.
      var grants = window.ftLinks.buildViewerGrants(req, currentTreeId, currentUid);
      batch.set(doc(db, 'trees', grants.onApproveTree.treeId, 'viewers', grants.onApproveTree.uid),
        Object.assign({ at: serverTimestamp() }, grants.onApproveTree.data));
      batch.set(doc(db, 'trees', grants.onRequestTree.treeId, 'viewers', grants.onRequestTree.uid),
        Object.assign({ at: serverTimestamp() }, grants.onRequestTree.data));
      await batch.commit();
      loadLinks();
      toast(t('linkApproved'));
      return true;
    }catch(e){ console.error('approveLink failed', e && e.code, e); alert(writeErrMsg(e, t('linkApproveFail'))); return false; }
  }

  function loadLinks(){
    if(!currentTreeId){ currentLinks = []; return; }
    getDocs(collection(db, 'trees', currentTreeId, 'links')).then(function(snap){
      // Dedup by the relationship (same person ↔ same remote person/tree): a
      // re-approved request can mint extra link docs with new ids; show one badge.
      var seen = {}, arr = [];
      snap.forEach(function(d){
        var l = Object.assign({ linkId: d.id }, d.data());
        var k = l.localPersonId + '|' + l.remoteTreeId + '|' + l.remotePersonId;
        if(seen[k]) return; seen[k] = true; arr.push(l);
      });
      currentLinks = arr;
      if(window.__ftRenderHome) window.__ftRenderHome();
      gcLinkRequests();   // owner-only cleanup of consumed requests
    }, function(e){
      // A transient read (offline/permission) must NOT blank existing links —
      // that made badges flicker in and out with no trace. Keep what we have and
      // log; switchFamily already resets currentLinks on a real tree change.
      console.error('loadLinks failed', e && e.code, e);
    });
  }

  async function revokeLink(linkId){
    var link = currentLinks.filter(function(l){ return l.linkId === linkId; })[0];
    try{
      await deleteDoc(doc(db, 'trees', currentTreeId, 'links', linkId));
      currentLinks = currentLinks.filter(function(l){ return l.linkId !== linkId; });
      var grantFailed = false;
      if(link){
        // Sever both read grants and AWAIT them — these are what actually revoke
        // cross-tree access, so a silent failure would leave the other family able
        // to read my tree while I'm told it's revoked. I own my tree (revoke the
        // other party's view of it); viewerUid==uid() lets me drop my own view of
        // theirs (only when no other link to it remains).
        var otherUid = (link.requestedBy === currentUid) ? link.approvedBy : link.requestedBy;
        var jobs = [];
        if(otherUid) jobs.push(deleteDoc(doc(db, 'trees', currentTreeId, 'viewers', otherUid)));
        var stillLinked = currentLinks.some(function(l){ return l.remoteTreeId === link.remoteTreeId; });
        if(link.remoteTreeId && !stillLinked) jobs.push(deleteDoc(doc(db, 'trees', link.remoteTreeId, 'viewers', currentUid)));
        var results = await Promise.allSettled(jobs);
        results.forEach(function(r){ if(r.status === 'rejected'){ grantFailed = true; console.error('revoke grant failed', r.reason && r.reason.code, r.reason); } });
      }
      if(grantFailed) alert(t('linkRevokePartial'));   // don't claim full severance when it half-failed
      else toast(t('linkRevoked'));
    }catch(e){ console.error('revokeLink failed', e && e.code, e); alert(writeErrMsg(e, t('linkRevokeFail'))); }
  }

  // ── Links management (project 3c), owner-only ────────────────────────────
  async function listLinkRequests(){
    if(currentRole !== 'owner' || !currentTreeId) return [];
    var snap = await getDocs(collection(db, 'trees', currentTreeId, 'linkRequests'));
    var arr = []; snap.forEach(function(d){ arr.push(Object.assign({ token: d.id }, d.data())); });
    return arr;
  }
  async function deleteLinkRequest(token){
    if(currentRole !== 'owner' || !currentTreeId) return;   // server enforces isOwner too
    try{ await deleteDoc(doc(db, 'trees', currentTreeId, 'linkRequests', token)); }
    catch(e){ console.error('deleteLinkRequest failed', e && e.code, e); alert(writeErrMsg(e, t('linkReqDeleteFail'))); throw e; }
  }
  async function listTreeViewers(){
    if(currentRole !== 'owner' || !currentTreeId) return [];
    var snap = await getDocs(collection(db, 'trees', currentTreeId, 'viewers'));
    var arr = []; snap.forEach(function(d){ arr.push(Object.assign({ uid: d.id }, d.data())); });
    return arr;
  }
  async function revokeViewer(viewerUid){
    if(currentRole !== 'owner' || !currentTreeId) return;   // server enforces isOwner too
    try{ await deleteDoc(doc(db, 'trees', currentTreeId, 'viewers', viewerUid)); }
    catch(e){ console.error('revokeViewer failed', e && e.code, e); alert(writeErrMsg(e, t('viewerRevokeFail'))); throw e; }
  }
  // Drop pending requests that already produced a link (token did its job) so a
  // re-opened #link= can't keep minting duplicate link docs. Owner-only, best-effort.
  function gcLinkRequests(){
    if(currentRole !== 'owner' || !currentTreeId || !window.ftLinks) return;
    getDocs(collection(db, 'trees', currentTreeId, 'linkRequests')).then(function(snap){
      var reqs = []; snap.forEach(function(d){ reqs.push({ token: d.id }); });
      var tokens = window.ftLinks.requestsToGC(reqs, currentLinks);
      tokens.forEach(function(tok){
        deleteDoc(doc(db, 'trees', currentTreeId, 'linkRequests', tok))
          .catch(function(e){ console.error('gc request failed', e && e.code); });
      });
    }, function(e){ console.error('gc list failed', e && e.code); });
  }

  // Owner-only management sheet (project 3c): pending requests (cancel) + who can
  // view my tree (revoke). All strings via t(); all interpolation escaped.
  async function showLinksManager(){
    if(currentRole !== 'owner'){ toast(t('linkOwnerOnly')); return; }
    var overlay = document.getElementById('overlay');
    var sheet = document.getElementById('sheet');
    var body = document.getElementById('sheetBody');
    var esc = window.__ftEscapeHtml || function(s){ return String(s == null ? '' : s); };
    var fam = window.__ftFamLabel || function(o){ return (o && (o.ar || o.en)) || ''; };
    var ago = window.__ftTimeAgo || function(){ return ''; };
    body.innerHTML = '<h3>🔗 ' + t('linksMgrTitle') + '</h3><div class="context">' + t('linksMgrLoading') + '</div>';
    overlay.classList.add('open'); sheet.classList.add('open');
    try{
      var reqs = await listLinkRequests();
      var viewers = await listTreeViewers();
      var famByTree = {}; currentLinks.forEach(function(l){ if(l.remoteTreeId) famByTree[l.remoteTreeId] = l.remoteFamilyName; });
      var reqRows = reqs.length ? reqs.map(function(r){
        var when = (r.createdAt && r.createdAt.toDate) ? ago(r.createdAt.toDate()) : '';
        return '<div class="lm-row"><div class="lm-main"><b>' + esc(fam(r.localPersonName)) + '</b>' +
          '<div class="lm-sub">' + t('linkedToFamily') + ' «' + esc(fam(r.localFamilyName)) + '»' + (when ? (' · ' + esc(when)) : '') + '</div></div>' +
          '<button class="mini-btn danger" data-lmreq="' + esc(r.token) + '">' + t('linkReqCancel') + '</button></div>';
      }).join('') : '<div class="lm-empty">' + t('linksMgrNoRequests') + '</div>';
      var viewerRows = viewers.length ? viewers.map(function(v){
        var label = famByTree[v.remoteTreeId] ? fam(famByTree[v.remoteTreeId]) : t('linkedFamilyGeneric');
        return '<div class="lm-row"><div class="lm-main"><b>' + esc(label) + '</b></div>' +
          '<button class="mini-btn danger" data-lmviewer="' + esc(v.uid) + '">' + t('viewerRevokeBtn') + '</button></div>';
      }).join('') : '<div class="lm-empty">' + t('linksMgrNoViewers') + '</div>';
      body.innerHTML = '<h3>🔗 ' + t('linksMgrTitle') + '</h3>' +
        '<div class="lm-section-h">' + t('linksMgrRequestsH') + '</div>' + reqRows +
        '<div class="lm-section-h" style="margin-top:16px;">' + t('linksMgrViewersH') + '</div>' + viewerRows;
      body.querySelectorAll('[data-lmreq]').forEach(function(b){
        b.onclick = async function(){ if(!confirm(t('linkReqCancelConfirm'))) return; try{ await deleteLinkRequest(b.getAttribute('data-lmreq')); showLinksManager(); }catch(e){} };
      });
      body.querySelectorAll('[data-lmviewer]').forEach(function(b){
        b.onclick = async function(){ if(!confirm(t('viewerRevokeConfirm'))) return; try{ await revokeViewer(b.getAttribute('data-lmviewer')); showLinksManager(); }catch(e){} };
      });
    }catch(e){
      console.error('showLinksManager failed', e && e.code, e);
      body.innerHTML = '<h3>🔗 ' + t('linksMgrTitle') + '</h3><div class="context">' + t('linksMgrError') + '</div>';
    }
  }

  // Open a linked tree read-only (project 3a): read it once (the viewer grant
  // allows it) and hand it to the app's isolated linked-view. A permission-denied
  // here means the other side severed the link, so surface it gently.
  async function viewLinkedTree(remoteTreeId, personId){
    if(!remoteTreeId){ return; }
    try{
      var snap = await getDoc(doc(db, 'trees', remoteTreeId));
      if(!snap.exists()){ alert(t('linkViewGone')); return; }
      var d = snap.data();
      if(window.__ftEnterLinkedView) window.__ftEnterLinkedView(
        { familyName: d.familyName || '', lang: d.lang || 'ar', rootId: d.rootId || null, people: d.people || {} },
        { remoteTreeId: remoteTreeId, focusPersonId: personId });
    }catch(e){
      // permission-denied = the other side severed the link; anything else
      // (unavailable/offline) is transient — don't mislabel it as removed.
      console.error('viewLinkedTree failed', e && e.code, e);
      alert(e && e.code === 'permission-denied' ? t('linkViewGone') : t('linkViewOffline'));
    }
  }

  // Approver side: a logged-in owner opens a `#link=` → read the pending request
  // by token → hand it to the app's approval sheet. Guarded so the hourly
  // onAuthStateChanged token refresh (which re-runs the success block) can't
  // re-open the sheet for a hash already handled.
  var lastLinkHashHandled = null;
  function maybeHandleLinkHash(){
    if(!currentUid) return;
    var h = location.hash || '';
    var p = window.ftLinks ? window.ftLinks.parseLinkHash(h) : null;
    if(!p || h === lastLinkHashHandled) return;
    readLinkRequest(p.treeId, p.token).then(function(req){
      lastLinkHashHandled = h;   // mark handled only once the read actually resolved
      if(!req){ alert(t('linkReqNotFound')); return; }
      if(req.treeId === currentTreeId){ alert(t('linkSameTree')); return; }
      if(window.__ftOpenLinkApproval) window.__ftOpenLinkApproval(req);
    }, function(e){
      // Transient failure (offline/permission): do NOT set the guard, so a retry
      // (hashchange or the next auth refresh) can re-attempt. "Not found" would be
      // a lie here, so surface the offline/permission message instead.
      console.error('readLinkRequest failed', e && e.code, e);
      alert(writeErrMsg(e, t('linkReqNotFound')));
    });
  }
  window.addEventListener('hashchange', maybeHandleLinkHash);

  window.__ftCloud = {
    onLocalSave: function(state){
      // Never push before the first cloud snapshot: local state is still the empty
      // default then, and updateDoc would overwrite the whole tree with {} (a wipe).
      if(!currentTreeId || applyingRemote || !remoteLoaded) return;
      clearTimeout(pushTimer);
      cloudBtn.dataset.status = 'syncing';
      // Bind the TARGET tree + authority at schedule time. A family switch before
      // this debounce fires must not redirect A's edit onto tree B (cross-tree
      // overwrite) — the push always lands on the tree that was active when edited.
      var pushTree = currentTreeId;
      var pushCanEdit = currentRole !== 'viewer';
      pushTimer = setTimeout(function(){ pushToCloud(pushTree, pushCanEdit, state); }, 500);
    },
    logActivity: logActivity,
    showActivityLog: showActivityLog,
    createInvite: createInvite,
    showMembers: showMembers,
    signOut: function(){ signOut(auth); },
    getTreeId: function(){ return currentTreeId; },
    getActiveTreeId: function(){ return currentTreeId; },
    listMemberships: function(){ return currentMemberships.slice(); },
    createFamily: createFamily,
    joinFamily: joinFamily,
    switchFamily: switchFamily,
    requestLink: requestLink,
    readLinkRequest: readLinkRequest,
    approveLink: approveLink,
    revokeLink: revokeLink,
    viewLinkedTree: viewLinkedTree,
    listLinkRequests: listLinkRequests,
    deleteLinkRequest: deleteLinkRequest,
    listTreeViewers: listTreeViewers,
    revokeViewer: revokeViewer,
    showLinksManager: showLinksManager,
    listLinks: function(){ return currentLinks.slice(); },
    isOwner: function(){ return currentRole === 'owner'; }
  };

  async function pushToCloud(treeId, canPush, state){
    if(!treeId || !canPush) return;
    var payload = {
      familyName: state.familyName || '', lang: state.lang || 'ar',
      rootId: state.rootId || null, people: state.people || {},
      updatedAt: serverTimestamp()
    };
    var size = new Blob([JSON.stringify(payload)]).size;
    if(size > MAX_DOC_BYTES){
      if(treeId === currentTreeId) cloudBtn.dataset.status = 'offline';
      alert('حجم بيانات الشجرة كبير جدًا للمزامنة السحابية — قد تحتاج لتقليل حجم الصور أو عدد الأفراد. تم الحفظ محليًا فقط.');
      return;
    }
    try{
      // updateDoc (NOT setDoc merge): a merge deep-merges the `people` map, so
      // deleted people were kept in the cloud and synced back -- the tree could
      // never shrink. updateDoc replaces the `people`/`rootId`/… fields wholesale
      // (removed IDs are truly deleted) while leaving `createdBy` untouched, which
      // the security rules require to stay unchanged on update. Writes to the BOUND
      // treeId, never the currently-active one (see onLocalSave).
      await updateDoc(doc(db, 'trees', treeId), payload);
      if(treeId === currentTreeId) cloudBtn.dataset.status = 'online';   // only reflect status for the active tree
      syncErrorAlerted = false;   // recovered — allow a future error to alert again
    }catch(err){
      if(treeId === currentTreeId) cloudBtn.dataset.status = 'offline';
      console.error('pushToCloud failed', err && (err.code || err.message), err);
      // A permanent error (permissions / missing doc) will never clear on its own,
      // so tell the user their change is only local rather than leaving them to
      // believe it synced. Alert once per error state (not on every debounced save,
      // which would spam a downgraded editor). Transient/network errors stay a quiet dot.
      if(err && (err.code === 'permission-denied' || err.code === 'not-found') && !syncErrorAlerted){
        syncErrorAlerted = true;
        alert('تعذّرت مزامنة التغيير مع السحابة (صلاحيات أو مستند مفقود) — تم الحفظ محليًا فقط. تواصل مع مالك العائلة.');
      }
    }
  }

  cloudBtn.addEventListener('click', function(){
    var overlay = document.getElementById('overlay');
    var sheet = document.getElementById('sheet');
    var body = document.getElementById('sheetBody');
    var esc = window.__ftEscapeHtml || function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
    var currentEmail = (auth.currentUser && auth.currentUser.email) || '';
    var roleLabel = currentRole === 'owner' ? 'مالك العائلة' : (currentRole === 'viewer' ? 'مشاهدة فقط' : 'محرِّر');
    body.innerHTML =
      '<h3>المزامنة السحابية</h3>' +
      '<div class="context">مسجّل الدخول باسم: <strong>' + esc(currentEmail) + '</strong> (' + roleLabel + ')</div>' +
      (canEditCloud ? (
        '<div class="context">' + t('inviteShareHint') + '</div>' +
        (window.__ftCloud && window.__ftCloud.createInvite ? '<button class="primary-btn" id="cf_invite" style="margin-bottom:10px; background:var(--teal);">'+t('menuInvite')+'</button>' : '')
      ) : '') +
      '<button class="primary-btn" id="cf_members" style="margin-bottom:10px; background:var(--teal);">👥 أفراد العائلة</button>' +
      '<button class="primary-btn" id="cf_signout" style="background:var(--danger);">تسجيل الخروج</button>';
    document.getElementById('cf_members').onclick = function(){ showMembers(); };
    if(canEditCloud && window.__ftCloud && window.__ftCloud.createInvite){
      var invBtn = document.getElementById('cf_invite');
      if(invBtn) invBtn.onclick = function(){ closeSheet(); window.__ftCloud.createInvite('editor'); };
    }
    document.getElementById('cf_signout').onclick = function(){
      signOut(auth);
      overlay.classList.remove('open'); sheet.classList.remove('open');
    };
    overlay.classList.add('open'); sheet.classList.add('open');
  });
