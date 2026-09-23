  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut
  } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
    collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, updateDoc
  } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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
  const db = getFirestore(app);

  var currentUid = null;
  var currentTreeId = null;
  var currentRole = null;
  var unsubTree = null;
  var applyingRemote = false;
  var pushTimer = null;
  var MAX_DOC_BYTES = 900000; // safety margin under Firestore's 1MB document limit

  /* Translation bridge to app.js (this module can't see app.js's IIFE scope).
     Falls back to the key so a missing bridge never throws. */
  function t(key){ return (window.__ftT ? window.__ftT(key) : key); }
  function tf(key, vars){ return (window.__ftTf ? window.__ftTf(key, vars) : key); }

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
      'auth/network-request-failed':'تعذّر الاتصال بالإنترنت'
    };
    return map[code] || ('حدث خطأ: ' + code);
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
    try{
      if(mode === 'login'){
        await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged handles the rest for a normal login.
      } else if(signupMode === 'join'){
        // The join link carries "<treeId>.<token>" in #join=; the invite-hash
        // handler below (on load) parses it into this field. No tree read
        // before join -- the invite doc is the only thing read, by token id.
        var joinRaw = document.getElementById('joinCode').value.trim();
        var dot = joinRaw.indexOf('.');
        if(dot < 1){ setLoading(false); showErr(t('errBadInvite')); return; }
        var joinTreeId = joinRaw.slice(0, dot);
        var joinToken  = joinRaw.slice(dot + 1);
        manualAuthFlow = true;
        var cred = await createUserWithEmailAndPassword(auth, email, pass);
        // Read the invite by token (rules: get allowed for any signed-in user).
        var invSnap = await getDoc(doc(db, 'trees', joinTreeId, 'invites', joinToken));
        if(!invSnap.exists()){
          await cred.user.delete().catch(function(){});
          manualAuthFlow = false; setLoading(false); showErr(t('errBadInvite')); return;
        }
        var invRole = invSnap.data().role; // 'editor' | 'viewer'
        // Membership create is authorised by the invite path in the rules.
        await setDoc(doc(db, 'trees', joinTreeId, 'members', cred.user.uid),
          { email: email, role: invRole, viaInvite: joinToken, joinedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', cred.user.uid), { email: email, treeId: joinTreeId });
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
        await setDoc(doc(db, 'users', cred2.user.uid), { email: email, treeId: newCode });
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
      if(!userSnap.exists() || !userSnap.data().treeId){
        setLoading(false);
        showErr('تعذّر العثور على عائلة مرتبطة بحسابك. تواصل مع الدعم.');
        return;
      }
      currentTreeId = userSnap.data().treeId;
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
      subscribeTree(currentTreeId);
      authGate.classList.add('hidden');
      cloudBtn.style.display = 'flex'; cloudBtn.title = (auth.currentUser && auth.currentUser.email) || ''; document.getElementById('momentsOpenBtn').style.display = 'flex';
      showAppShell();
      setLoading(false);
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
      cloudBtn.dataset.status = 'online';
    }, function(){
      cloudBtn.dataset.status = 'offline';
    });
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

  function renderMoments(docs){
    var list = document.getElementById('momentsList');
    if(!docs.length){
      list.innerHTML = '<div class="moments-empty">لا توجد لحظات بعد — كن أول من يشارك خبرًا مع العائلة!</div>';
      return;
    }
    var esc = window.__ftEscapeHtml || function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
    var timeAgoFn = window.__ftTimeAgo || function(){ return ''; };
    var html = '';
    docs.forEach(function(d){
      var v = d.data();
      var when = v.at && v.at.toDate ? timeAgoFn(v.at.toDate()) : 'الآن';
      var canDelete = v.byUid === currentUid || currentRole === 'owner';
      html += '<div class="moment-card">' +
        '<div class="moment-head"><span class="moment-author">' + esc(v.byEmail || '؟') + '</span>' +
        '<span class="moment-time">' + when + '</span></div>' +
        (v.text ? '<div class="moment-text">' + esc(v.text) + '</div>' : '') +
        (v.photo ? '<img class="moment-photo" src="' + esc(v.photo) + '">' : '') +
        (canDelete ? '<button class="moment-del" data-id="' + d.id + '">🗑 حذف</button>' : '') +
      '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.moment-del').forEach(function(btn){
      btn.onclick = async function(){
        if(!confirm('حذف هذه اللحظة؟')) return;
        try{ await deleteDoc(doc(db, 'trees', currentTreeId, 'moments', btn.dataset.id)); }
        catch(e){ alert('تعذّر الحذف.'); }
      };
    });
  }

  function subscribeMoments(){
    if(unsubMoments) unsubMoments();
    var q = query(collection(db, 'trees', currentTreeId, 'moments'), orderBy('at', 'desc'), limit(50));
    unsubMoments = onSnapshot(q, function(snap){
      var docs = [];
      snap.forEach(function(d){ docs.push(d); });
      renderMoments(docs);
    }, function(){
      document.getElementById('momentsList').innerHTML = '<div class="moments-empty">تعذّر تحميل اللحظات.</div>';
    });
  }

  function openMoments(){
    document.getElementById('momentsScreen').classList.add('open');
    document.getElementById('momentsList').innerHTML = '<div class="moments-empty">جارِ التحميل…</div>';
    subscribeMoments();
  }
  function closeMoments(){
    document.getElementById('momentsScreen').classList.remove('open');
    if(unsubMoments){ unsubMoments(); unsubMoments = null; }
  }
  document.getElementById('momentsOpenBtn').addEventListener('click', openMoments);
  document.getElementById('momentsBack').addEventListener('click', closeMoments);
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
    window.__ftResizeImage(file, 640, function(dataUrl){
      if(!dataUrl) return;
      pendingMomentPhoto = dataUrl;
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
      await addDoc(collection(db, 'trees', currentTreeId, 'moments'), {
        text: text, photo: pendingMomentPhoto || null,
        byEmail: (auth.currentUser && auth.currentUser.email) || '', byUid: currentUid,
        at: serverTimestamp()
      });
      textEl.value = '';
      pendingMomentPhoto = null;
      var prev = document.getElementById('momentPhotoPreview');
      prev.style.display = 'none'; prev.innerHTML = '';
    }catch(e){
      alert('تعذّر النشر — تأكد من تحديث قواعد الأمان (Firestore Rules).');
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

  window.__ftCloud = {
    onLocalSave: function(state){
      if(!currentTreeId || applyingRemote) return;
      clearTimeout(pushTimer);
      cloudBtn.dataset.status = 'syncing';
      pushTimer = setTimeout(function(){ pushToCloud(state); }, 500);
    },
    logActivity: logActivity,
    showActivityLog: showActivityLog,
    createInvite: createInvite,
    showMembers: showMembers,
    signOut: function(){ signOut(auth); }
  };

  async function pushToCloud(state){
    if(!currentTreeId || currentRole === 'viewer') return;
    var payload = {
      familyName: state.familyName || '', lang: state.lang || 'ar',
      rootId: state.rootId || null, people: state.people || {},
      updatedAt: serverTimestamp()
    };
    var size = new Blob([JSON.stringify(payload)]).size;
    if(size > MAX_DOC_BYTES){
      cloudBtn.dataset.status = 'offline';
      alert('حجم بيانات الشجرة كبير جدًا للمزامنة السحابية — قد تحتاج لتقليل حجم الصور أو عدد الأفراد. تم الحفظ محليًا فقط.');
      return;
    }
    try{
      await setDoc(doc(db, 'trees', currentTreeId), payload, { merge: true });
      cloudBtn.dataset.status = 'online';
    }catch(err){
      cloudBtn.dataset.status = 'offline';
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
