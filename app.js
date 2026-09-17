(function(){
  "use strict";

  /* Set html.dark before first paint (per persisted choice or OS setting) to avoid a flash. */
  try { document.documentElement.classList.toggle('dark',
    (function(m){ return m === 'dark' || (m === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); })(localStorage.getItem('ft_theme') || 'auto')); } catch(e){}
  /* Same for the font-size preference, so it doesn't visibly jump after load. */
  try {
    var __fs = localStorage.getItem('ft_fontscale');
    if(__fs === 'sm' || __fs === 'lg') document.documentElement.classList.add('fontscale-' + __fs);
  } catch(e){}

  /* ============== i18n ============== */
  var I18N = {
    appName:{ar:'شجرة العائلة', en:'Family Tree'},
    editHint:{ar:'اضغط على الاسم لتعديله', en:'Tap the name to edit it'},
    statMembers:{ar:'فرد', en:'Members'},
    statGenerations:{ar:'جيل', en:'Generations'},
    statRoot:{ar:'الجذر', en:'Root unit'},
    storageWarn:{ar:'⚠️ التخزين الدائم غير متاح الآن — التعديلات لن تُحفظ بعد إغلاق الصفحة. يمكنك تصدير نسخة احتياطية يدويًا.', en:'⚠️ Permanent storage is unavailable right now — changes won\'t be saved after closing this page. You can export a backup manually.'},
    tbBackup:{ar:'⬇ نسخة احتياطية', en:'⬇ Backup'},
    tbImport:{ar:'⬆ استيراد', en:'⬆ Import'},
    tbReset:{ar:'↺ شجرة جديدة', en:'↺ New tree'},
    emptyTitle:{ar:'ابدأ بشجرة عائلتك', en:'Start your family tree'},
    emptyDesc:{ar:'أدخل اسم الجد الأعلى — وزوجته إن أردت — لتبدأ في بناء الشجرة، ثم أضف الأبناء والأحفاد خطوة بخطوة.', en:'Enter the eldest ancestor\'s name — and their spouse if you like — to begin. Then add children and grandchildren step by step.'},
    rootNameLabel:{ar:'اسم الجد الأعلى *', en:'Eldest ancestor\'s name *'},
    rootNamePh:{ar:'مثال: عبد الله بن محمد', en:'e.g. John Smith'},
    rootSpouseLabel:{ar:'اسم الجدة (اختياري)', en:'Spouse\'s name (optional)'},
    rootSpousePh:{ar:'مثال: فاطمة', en:'e.g. Mary'},
    createBtn:{ar:'إنشاء الشجرة', en:'Create tree'},
    restoreBackup:{ar:'⬆ أو استعادة نسخة احتياطية', en:'⬆ Or restore a backup'},
    male:{ar:'ذكر', en:'Male'},
    female:{ar:'أنثى', en:'Female'},
    nameLabel:{ar:'الاسم *', en:'Name *'},
    namePh:{ar:'اكتب الاسم هنا', en:'Enter name'},
    genderLabel:{ar:'النوع', en:'Gender'},
    birthLabel:{ar:'تاريخ الميلاد (اختياري)', en:'Date of birth (optional)'},
    residenceLabel:{ar:'مكان الإقامة (اختياري)', en:'Place of residence (optional)'},
    residencePh:{ar:'مثال: القاهرة، مصر', en:'e.g. Cairo, Egypt'},
    photoLabel:{ar:'الصورة الشخصية (اختياري)', en:'Photo (optional)'},
    photoChoose:{ar:'اختيار صورة', en:'Choose photo'},
    photoRemove:{ar:'إزالة الصورة', en:'Remove photo'},
    keepAdding:{ar:'إضافة المزيد من الأبناء بعد الحفظ', en:'Keep adding more children after saving'},
    saveBtn:{ar:'حفظ', en:'Save'},
    addChildTitle:{ar:'إضافة ابن / ابنة', en:'Add child'},
    addSpouseTitle:{ar:'إضافة زوج / زوجة', en:'Add spouse'},
    editTitle:{ar:'تعديل البيانات', en:'Edit details'},
    moveLeftTitle:{ar:'نقل لليسار', en:'Move left'},
    moveRightTitle:{ar:'نقل لليمين', en:'Move right'},
    contextChild:{ar:'سيُضاف كابن/ابنة لـ «{name}»', en:'Will be added as a child of "{name}"'},
    contextSpouse:{ar:'سيُضاف كزوج/زوجة لـ «{name}»', en:'Will be added as a spouse of "{name}"'},
    contextEdit:{ar:'تعديل بيانات «{name}»', en:'Editing "{name}"'},
    deleteTitle:{ar:'حذف «{name}»؟', en:'Delete "{name}"?'},
    deleteWarnN:{ar:'سيتم أيضًا حذف {n} فرد من ذريته.', en:'This will also delete {n} of their descendants.'},
    deleteWarnNone:{ar:'لا توجد ذرية مرتبطة بهذا الفرد.', en:'No descendants are linked to this person.'},
    deleteCancel:{ar:'إلغاء', en:'Cancel'},
    deleteConfirm:{ar:'حذف نهائيًا', en:'Delete permanently'},
    resetTitle:{ar:'بدء شجرة جديدة؟', en:'Start a new tree?'},
    resetDesc:{ar:'سيتم حذف جميع بيانات الشجرة الحالية نهائيًا. يُنصح بتنزيل نسخة احتياطية أولاً.', en:'All current tree data will be permanently deleted. Downloading a backup first is recommended.'},
    resetConfirm:{ar:'حذف والبدء من جديد', en:'Delete and start over'},
    menuTitle:{ar:'خيارات', en:'Options'},
    menuDesc:{ar:'إدارة بيانات الشجرة', en:'Manage tree data'},
    menuExport:{ar:'⬇ تنزيل نسخة احتياطية', en:'⬇ Download backup'},
    menuImport:{ar:'⬆ استيراد نسخة', en:'⬆ Import a backup'},
    menuReset:{ar:'↺ بدء شجرة جديدة', en:'↺ Start a new tree'},
    toastNameRequired:{ar:'يرجى إدخال الاسم', en:'Please enter a name'},
    toastSaved:{ar:'تم الحفظ بنجاح', en:'Saved successfully'},
    toastDeleted:{ar:'تم الحذف', en:'Deleted'},
    toastRootCreated:{ar:'تم إنشاء شجرة العائلة', en:'Family tree created'},
    toastBackup:{ar:'تم تنزيل النسخة الاحتياطية', en:'Backup downloaded'},
    toastImported:{ar:'تم استيراد البيانات بنجاح', en:'Data imported successfully'},
    toastImportError:{ar:'تعذر قراءة الملف — تأكد أنه نسخة احتياطية صحيحة', en:'Could not read the file — make sure it\'s a valid backup'},
    rootBadge:{ar:'الجذر', en:'Root'},
    familyPrefix:{ar:'عائلة ', en:''},
    familySuffix:{ar:'', en:' Family'},
    errBadInvite:{ar:'رابط الدعوة غير صحيح أو انتهت صلاحيته', en:'The invite link is invalid or has expired'},
    menuInvite:{ar:'➕ دعوة فرد للعائلة', en:'➕ Invite a family member'},
    inviteCopied:{ar:'تم نسخ رابط الدعوة', en:'Invite link copied'},
    joinCodePh:{ar:'الصق رابط الدعوة هنا', en:'Paste the invite link here'},
    inviteShareHint:{ar:'لدعوة أحد أفراد العائلة، أنشئ رابط دعوة وأرسله له', en:'To add a family member, generate an invite link and send it to them'},
    errNoMembership:{ar:'حسابك ليس عضوًا في هذه العائلة. اطلب رابط دعوة من مالك الشجرة.', en:'Your account is not a member of this family. Ask the tree owner for an invite link.'},
    themeDark:{ar:'الوضع الداكن', en:'Dark mode'},
    themeLight:{ar:'الوضع الفاتح', en:'Light mode'},
    navHome:{ar:'الرئيسية', en:'Home'},
    navTree:{ar:'الشجرة', en:'Tree'},
    navMoments:{ar:'اللحظات', en:'Moments'},
    navSettings:{ar:'إعدادات', en:'Settings'},
    immersiveOn:{ar:'ملء الشاشة', en:'Full screen'},
    immersiveOff:{ar:'إنهاء ملء الشاشة', en:'Exit full screen'},
    firstNameLabel:{ar:'الاسم الأول *', en:'First name *'},
    firstNamePh:{ar:'مثال: خالد', en:'e.g. Khaled'},
    fullNamePreview:{ar:'الاسم الكامل:', en:'Full name:'},
    kinshipMenu:{ar:'🔗 حاسبة القرابة', en:'🔗 Relationship finder'},
    kinshipPick1:{ar:'اختر الشخص الأول من الشجرة', en:'Tap the first person on the tree'},
    kinshipPick2:{ar:'اختر الشخص الثاني', en:'Tap the second person'},
    kinshipCancel:{ar:'إلغاء', en:'Cancel'},
    kinshipTitle:{ar:'القرابة', en:'Relationship'},
    kinshipConnector:{ar:'قرابة', en:'relationship'},
    kinshipTo:{ar:'لـ', en:'to'},
    kinshipClose:{ar:'إغلاق', en:'Close'},
    unnamedFamily:{ar:'عائلتي', en:'My family'},
    homeSectionsEyebrow:{ar:'أقسام العائلة', en:'Sections'},
    cardTree:{ar:'الشجرة', en:'Tree'},
    cardTreeSub:{ar:'استعرض النسب كاملاً', en:'Browse the full lineage'},
    cardFeed:{ar:'اللحظات', en:'Moments'},
    cardFeedSub:{ar:'أخبار العائلة وأحداثها', en:'Family news and events'},
    cardSearch:{ar:'البحث', en:'Search'},
    cardSearchSub:{ar:'ابحث بالاسم عربي/EN', en:'Search by name, AR/EN'},
    cardMembers:{ar:'الأعضاء', en:'Members'},
    cardMembersSub:{ar:'إدارة صلاحيات الأفراد', en:'Manage member permissions'},
    statPhotos:{ar:'صورة', en:'Photos'},
    completionTitle:{ar:'اكتمال الشجرة', en:'Tree completeness'},
    completionHintMissingPhoto:{ar:'«{name}» بلا صورة', en:'"{name}" has no photo'},
    completionHintMissingBirth:{ar:'«{name}» بلا تاريخ ميلاد', en:'"{name}" has no birth date'},
    completionHintDone:{ar:'أحسنت! جميع البيانات مكتملة', en:'Great! All info is complete'},
    completionHintEmpty:{ar:'أضف أول فرد لتبدأ رحلة اكتمال الشجرة', en:'Add your first person to start tracking completeness'},
    comingSoon:{ar:'قريباً', en:'Coming soon'},
    settingsTitle:{ar:'الإعدادات', en:'Settings'},
    setAppearance:{ar:'المظهر واللغة', en:'Appearance & language'},
    setFamily:{ar:'العائلة', en:'Family'},
    setLang:{ar:'اللغة', en:'Language'},
    setDark:{ar:'الوضع الداكن', en:'Dark mode'},
    setLight:{ar:'فاتح', en:'Light'},
    setDarkOpt:{ar:'داكن', en:'Dark'},
    setAuto:{ar:'تلقائي', en:'Auto'},
    setFont:{ar:'حجم الخط', en:'Font size'},
    fontSm:{ar:'صغير', en:'Small'},
    fontMd:{ar:'متوسط', en:'Medium'},
    fontLg:{ar:'كبير', en:'Large'},
    setFamilyName:{ar:'اسم العائلة', en:'Family name'},
    setInvite:{ar:'دعوة فرد للعائلة', en:'Invite a family member'},
    setMembers:{ar:'أفراد العائلة', en:'Family members'},
    setInstall:{ar:'تثبيت التطبيق', en:'Install app'},
    setApp:{ar:'التطبيق', en:'App'},
    installReady:{ar:'ثبّت على جهازك', en:'Add to your device'},
    installIosTitle:{ar:'التثبيت على iPhone/iPad', en:'Install on iPhone/iPad'},
    installIosSteps:{ar:'من متصفح Safari: اضغط زر المشاركة ⬆︎ ثم اختر «إضافة إلى الشاشة الرئيسية».', en:'In Safari: tap the Share button ⬆︎, then choose “Add to Home Screen”.'},
    installMenuTitle:{ar:'تثبيت التطبيق', en:'Install the app'},
    installMenuSteps:{ar:'من قائمة المتصفح (⋮) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', en:'From your browser menu (⋮), choose “Install app” or “Add to Home Screen”.'},
    installDone:{ar:'التطبيق مُثبَّت على جهازك ✓', en:'App installed on your device ✓'},
    setSignout:{ar:'تسجيل الخروج', en:'Sign out'}
  };
  var genLabelsMap = {
    ar:["الجيل الأول","الجيل الثاني","الجيل الثالث","الجيل الرابع","الجيل الخامس","الجيل السادس","الجيل السابع","الجيل الثامن"],
    en:["Generation 1","Generation 2","Generation 3","Generation 4","Generation 5","Generation 6","Generation 7","Generation 8"]
  };

  function t(key){
    var entry = I18N[key];
    if(!entry) return key;
    var v = entry[state.lang];
    return v !== undefined ? v : key;
  }
  function tf(key, vars){
    var s = t(key);
    Object.keys(vars||{}).forEach(function(k){ s = s.replace('{'+k+'}', vars[k]); });
    return s;
  }
  function genLabel(depth){
    var arr = genLabelsMap[state.lang];
    return arr[depth] || (t('statGenerations') + ' ' + (depth+1));
  }
  function ageText(n){
    if(state.lang === 'ar'){
      if(n < 1) return 'أقل من سنة';
      if(n === 1) return 'سنة واحدة';
      if(n === 2) return 'سنتان';
      if(n >= 3 && n <= 10) return n + ' سنوات';
      return n + ' سنة';
    }
    return n + (n === 1 ? ' year' : ' years');
  }

  /* ============== Theme ============== */
  function ftReadTheme(){ try { return localStorage.getItem('ft_theme') || 'auto'; } catch(e){ return 'auto'; } }
  function ftPrefersDark(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function ftResolveDark(mode){ return mode === 'dark' || (mode === 'auto' && ftPrefersDark()); }
  function applyTheme(mode){
    var m = (mode === 'light' || mode === 'dark') ? mode : 'auto';
    document.documentElement.classList.toggle('dark', ftResolveDark(m));
    try { localStorage.setItem('ft_theme', m); } catch(e){}
    var btn = document.getElementById('themeBtn');
    if(btn){ btn.textContent = ftResolveDark(m) ? '☀' : '☾'; btn.title = t(ftResolveDark(m) ? 'themeLight' : 'themeDark'); }
  }
  window.__ftApplyTheme = applyTheme;
  // Re-resolve on OS change while in 'auto'
  if(window.matchMedia){
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
      if(ftReadTheme() === 'auto') applyTheme('auto');
    });
  }

  /* ============== State ============== */
  var STORAGE_KEY = "family-tree:data";
  var state = { rootId: null, familyName: "", people: {}, lang: 'ar' };
  var zoom = 1;
  var saveTimer = null;
  var pendingPhoto = null;

  function uid(){ return 'p_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

  function newPerson(name, gender, parentId){
    return { id: uid(), name: name, gender: gender, parentId: parentId || null,
      spouseIds: [], childrenIds: [], collapsed: false,
      birthDate: null, residence: '', photo: null };
  }

  function migratePerson(p){
    if(p.birthDate === undefined) p.birthDate = null;
    if(p.residence === undefined) p.residence = '';
    if(p.photo === undefined) p.photo = null;
    return p;
  }

  /* ============== Persistence ============== */
  function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 350); }

  function save(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      hideStorageWarn();
    }catch(e){ showStorageWarn(); }
    if(window.__ftCloud && window.__ftCloud.onLocalSave) window.__ftCloud.onLocalSave(state);
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        var parsed = JSON.parse(raw);
        if(parsed && parsed.people){
          state = parsed;
          state.lang = state.lang || 'ar';
          Object.keys(state.people).forEach(function(id){ migratePerson(state.people[id]); });
        }
      }
    }catch(e){ showStorageWarn(); }
    afterLoad();
  }

  /* Bridge for the Firebase cloud-sync module (loaded separately). It calls this
     when a remote update arrives; we don't re-push it back up (avoids echo loops). */
  window.__ftApplyRemote = function(remoteState){
    if(!remoteState || !remoteState.people) return;
    state = remoteState;
    state.lang = state.lang || 'ar';
    Object.keys(state.people).forEach(function(id){ migratePerson(state.people[id]); });
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
    applyLang(); render();
  };
  window.__ftGetState = function(){ return state; };
  window.__ftResizeImage = resizeImage;
  window.__ftEscapeHtml = escapeHtml;
  window.__ftTimeAgo = function(dateObj){
    if(!dateObj) return '';
    var diffSec = Math.round((Date.now() - dateObj.getTime())/1000);
    if(diffSec < 60) return 'الآن';
    var m = Math.round(diffSec/60); if(m < 60) return 'منذ ' + m + ' دقيقة';
    var h = Math.round(m/60); if(h < 24) return 'منذ ' + h + ' ساعة';
    var d = Math.round(h/24); return 'منذ ' + d + ' يوم';
  };

  /* Edit permission (true = local-only or owner/editor; false = viewer / read-only).
     Set by the cloud module after it resolves the signed-in user's role. */
  var canEditCloud = true;
  window.__ftSetEditable = function(val){ canEditCloud = !!val; render(); };

  function showStorageWarn(){ var w = document.getElementById('storageWarn'); w.textContent = t('storageWarn'); w.style.display = 'block'; }
  function hideStorageWarn(){ document.getElementById('storageWarn').style.display = 'none'; }

  function afterLoad(){
    applyLang(); render();
    applyTheme(ftReadTheme());
    applyFontScale(ftReadFontScale());
  }

  /* ============== Language ============== */
  function applyLang(){
    var html = document.getElementById('htmlRoot');
    html.setAttribute('lang', state.lang);
    html.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
    var wasDark = html.classList.contains('dark');
    html.className = state.lang === 'en' ? 'lang-en' : '';
    if(wasDark) html.classList.add('dark');
    document.getElementById('langBtn').textContent = state.lang === 'ar' ? 'EN' : 'AR';
    document.getElementById('editHint').textContent = t('editHint');
    document.getElementById('exportBtn').textContent = t('tbBackup');
    document.getElementById('importBtn').textContent = t('tbImport');
    document.getElementById('resetBtn').textContent = t('tbReset');
    document.getElementById('emptyTitle').textContent = t('emptyTitle');
    document.getElementById('emptyDesc').textContent = t('emptyDesc');
    document.getElementById('rootNameLabel').textContent = t('rootNameLabel');
    document.getElementById('rootName').placeholder = t('rootNamePh');
    document.getElementById('rootSpouseLabel').textContent = t('rootSpouseLabel');
    document.getElementById('rootSpouseName').placeholder = t('rootSpousePh');
    document.getElementById('createRootBtn').textContent = t('createBtn');
    document.getElementById('restoreBtnEmpty').textContent = t('restoreBackup');
    document.getElementById('joinCode').placeholder = t('joinCodePh');
    document.getElementById('nav_home').textContent = t('navHome');
    document.getElementById('nav_tree').textContent = t('navTree');
    document.getElementById('nav_moments').textContent = t('navMoments');
    document.getElementById('nav_settings').textContent = t('navSettings');
  }

  /* ============== Tab router ============== */
  /* Immersive tree: a deliberate full-screen TOGGLE (works identically with a
     mouse or touch — no flicker, no timers). The button enters full screen
     (banner + bottom nav slide away); a floating exit button brings them back. */
  function setTreeImmersive(on){
    document.body.classList.toggle('tree-immersive', !!on);
    var b = document.getElementById('immersiveBtn');
    if(b){ b.textContent = on ? '⤡' : '⤢'; b.title = t(on ? 'immersiveOff' : 'immersiveOn'); }
    requestAnimationFrame(drawLinks); // re-fit the connector lines to the new height
  }
  function initImmersiveTree(){
    var b = document.getElementById('immersiveBtn');
    if(!b || b._immInit) return; b._immInit = true;
    b.onclick = function(){ setTreeImmersive(!document.body.classList.contains('tree-immersive')); };
  }

  var currentTabName = null;
  function showTab(name){
    var tabs = ['home', 'tree', 'moments', 'settings'];
    if(tabs.indexOf(name) < 0) name = 'tree';
    setTreeImmersive(false); // always restore chrome when switching tabs
    tabs.forEach(function(t){
      var p = document.getElementById('tab-' + t);
      if(p) p.classList.toggle('active', t === name);
    });
    document.querySelectorAll('.bottom-nav .nav-item').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    try{ localStorage.setItem('ft_tab', name); }catch(e){}
    if(name === 'home' && window.__ftRenderHome) window.__ftRenderHome();
    if(name === 'settings' && window.__ftRenderSettings) window.__ftRenderSettings();
    /* Moments used to be a slide-over only reachable via the CTA button, which
       is what subscribed to the live feed. Now it's also a regular tab (bottom
       nav + the home card), so the subscription has to follow the tab switch
       itself, not just that one button — otherwise the feed silently never
       loads when reached those other ways. Unsubscribe on the way out so a
       background listener doesn't linger. */
    if(name === 'moments' && window.__ftOpenMomentsTab) window.__ftOpenMomentsTab();
    if(currentTabName === 'moments' && name !== 'moments' && window.__ftCloseMomentsTab) window.__ftCloseMomentsTab();
    currentTabName = name;
    /* The tree's connector lines are positioned from getBoundingClientRect,
       which returns all-zero rects while #tab-tree is display:none. If the
       tree was (re)rendered while another tab was showing — e.g. cloud data
       arrives while the user is on Home — the lines never got real
       coordinates. Redraw them now that the tab is actually visible. */
    if(name === 'tree' && typeof drawLinks === 'function') requestAnimationFrame(function(){ drawLinks(); centerStage(); });
  }
  window.__ftShowTab = showTab;
  document.querySelectorAll('.bottom-nav .nav-item').forEach(function(b){
    b.addEventListener('click', function(){ showTab(b.getAttribute('data-tab')); });
  });
  initImmersiveTree();

  function switchLang(newLang){
    if(newLang !== 'ar' && newLang !== 'en') return;
    if(state.lang === newLang) return;
    state.lang = newLang;
    scheduleSave();
    applyLang();
    closeSheet();
    render();
  }
  document.getElementById('langBtn').addEventListener('click', function(){
    switchLang(state.lang === 'ar' ? 'en' : 'ar');
  });

  /* ============== Helpers ============== */
  function getPerson(id){ return state.people[id]; }
  function genOfPerson(id){ var p = getPerson(id), depth = 0; while(p && p.parentId){ depth++; p = getPerson(p.parentId); } return depth; }
  var genColors = ["var(--emerald)","var(--teal)","var(--gold)","var(--plum)"];

  function calcAge(birthDateStr){
    if(!birthDateStr) return null;
    var b = new Date(birthDateStr);
    if(isNaN(b.getTime())) return null;
    var today = new Date();
    var age = today.getFullYear() - b.getFullYear();
    var m = today.getMonth() - b.getMonth();
    if(m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
    return age >= 0 ? age : null;
  }

  function toast(msg){
    var el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function(){ el.classList.remove('show'); }, 2200);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }

  /* ============== Photo handling ============== */
  function resizeImage(file, maxSize, cb){
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxSize / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        cb(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function(){ cb(null); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* Notifies the cloud module (if active) so it can record who did what. */
  function logActivity(action, personName, detail){
    if(window.__ftCloud && window.__ftCloud.logActivity) window.__ftCloud.logActivity(action, personName, detail);
  }

  /* ============== Mutations ============== */
  function createRoot(name, spouseName){
    var root = newPerson(name, 'm', null);
    state.people[root.id] = root;
    state.rootId = root.id;
    if(spouseName && spouseName.trim()){
      var sp = newPerson(spouseName.trim(), 'f', null);
      state.people[sp.id] = sp;
      root.spouseIds.push(sp.id);
      sp.spouseIds.push(root.id);
    }
    if(!state.familyName || state.familyName === t('appName')){ state.familyName = t('familyPrefix') + name.split(' ')[0] + t('familySuffix'); }
    scheduleSave(); render();
    logActivity('add', name);
  }

  function addChild(parentId, name, gender){
    var child = newPerson(name, gender, parentId);
    state.people[child.id] = child;
    getPerson(parentId).childrenIds.push(child.id);
    scheduleSave(); render();
    logActivity('add', name);
  }

  function addSpouse(personId, name, gender){
    var sp = newPerson(name, gender, null);
    state.people[sp.id] = sp;
    getPerson(personId).spouseIds.push(sp.id);
    sp.spouseIds.push(personId);
    scheduleSave(); render();
    logActivity('add', name);
  }

  function updatePerson(id, data){
    var p = getPerson(id);
    var changed = [];
    if(p.name !== data.name) changed.push('الاسم');
    if(p.gender !== data.gender) changed.push('النوع');
    if((p.birthDate || null) !== (data.birthDate || null)) changed.push('تاريخ الميلاد');
    if((p.residence || '') !== (data.residence || '')) changed.push('مكان الإقامة');
    if(data.photo !== undefined && p.photo !== data.photo) changed.push('الصورة');

    p.name = data.name; p.gender = data.gender;
    p.birthDate = data.birthDate || null;
    p.residence = data.residence || '';
    if(data.photo !== undefined) p.photo = data.photo;
    scheduleSave(); render();
    if(changed.length){ logActivity('edit', data.name, changed.join('، ')); }
  }

  function countDescendants(id){
    var p = getPerson(id), n = 0;
    (p.childrenIds || []).forEach(function(cid){ n += 1 + countDescendants(cid); });
    return n;
  }

  function deletePerson(id){
    var p = getPerson(id);
    if(!p) return;
    var deletedName = p.name;
    (p.childrenIds || []).slice().forEach(deletePerson);
    (p.spouseIds || []).forEach(function(sid){
      var sp = getPerson(sid);
      if(sp) sp.spouseIds = sp.spouseIds.filter(function(x){ return x !== id; });
    });
    if(p.parentId){
      var parent = getPerson(p.parentId);
      if(parent) parent.childrenIds = parent.childrenIds.filter(function(x){ return x !== id; });
    }
    delete state.people[id];
    if(state.rootId === id){ state.rootId = null; state.familyName = ""; }
    scheduleSave(); render();
    logActivity('delete', deletedName);
  }

  function toggleCollapse(id){
    getPerson(id).collapsed = !getPerson(id).collapsed;
    if(canEditCloud) scheduleSave(); // viewers can still collapse/expand locally for browsing; it just won't sync
    render();
  }

  function moveSibling(id, delta){
    var p = getPerson(id);
    if(!p || !p.parentId) return;
    var parent = getPerson(p.parentId);
    if(!parent) return;
    var idx = parent.childrenIds.indexOf(id);
    var newIdx = idx + delta;
    if(idx === -1 || newIdx < 0 || newIdx >= parent.childrenIds.length) return;
    var tmp = parent.childrenIds[idx];
    parent.childrenIds[idx] = parent.childrenIds[newIdx];
    parent.childrenIds[newIdx] = tmp;
    scheduleSave(); render();
  }

  /* ============== Rendering ============== */
  function totalMembers(){ return Object.keys(state.people).length; }
  function maxGeneration(){
    var max = 0;
    Object.keys(state.people).forEach(function(id){ max = Math.max(max, genOfPerson(id)); });
    return max + 1;
  }

  function renderStats(){
    var row = document.getElementById('statRow');
    if(!state.rootId){ row.innerHTML = ''; return; }
    var total = totalMembers(), gens = maxGeneration();
    var rootUnit = getPerson(state.rootId) ? 1 + getPerson(state.rootId).spouseIds.length : 0;
    row.innerHTML =
      '<div class="stat-pill"><b>'+total+'</b><span>'+t('statMembers')+'</span></div>'+
      '<div class="stat-pill"><b>'+gens+'</b><span>'+t('statGenerations')+'</span></div>'+
      '<div class="stat-pill"><b>'+rootUnit+'</b><span>'+t('statRoot')+'</span></div>';
  }

  function personCard(id){
    var p = getPerson(id);
    var depth = genOfPerson(id);
    var isRoot = id === state.rootId;
    var el = document.createElement('div');
    el.className = 'card ' + (p.gender === 'f' ? 'female' : 'male');
    el.style.borderTopColor = genColors[depth % genColors.length];
    el.dataset.id = id;
    var childCount = p.childrenIds.length;
    var age = calcAge(p.birthDate);
    var avatarInner = p.photo ? '<img src="'+escapeHtml(p.photo)+'" alt="">' : (p.gender==='f' ? '👩' : '👨');
    var siblingInfo = null;
    if(p.parentId){
      var parentP = getPerson(p.parentId);
      if(parentP){
        var sIdx = parentP.childrenIds.indexOf(id);
        siblingInfo = { idx: sIdx, count: parentP.childrenIds.length };
      }
    }
    el.innerHTML =
      (isRoot ? '<div class="root-badge">'+t('rootBadge')+'</div>' : '') +
      '<div class="avatar">'+avatarInner+'</div>' +
      '<div class="name">'+escapeHtml(p.name)+'</div>' +
      '<div class="gen-badge">'+genLabel(depth)+'</div>' +
      (age !== null ? '<div class="meta-line">🎂 '+ageText(age)+'</div>' : '') +
      (p.residence ? '<div class="meta-line">📍 '+escapeHtml(p.residence)+'</div>' : '') +
      (canEditCloud ? (
      '<div class="card-actions">' +
        '<button class="mini-btn" data-act="child" data-id="'+escapeHtml(id)+'" title="'+t('addChildTitle')+'">＋👶</button>' +
        (p.spouseIds.length < 4 ? '<button class="mini-btn" data-act="spouse" data-id="'+escapeHtml(id)+'" title="'+t('addSpouseTitle')+'">＋💍</button>' : '') +
        '<button class="mini-btn" data-act="edit" data-id="'+escapeHtml(id)+'" title="'+t('editTitle')+'">✎</button>' +
        (siblingInfo && siblingInfo.idx > 0 ? '<button class="mini-btn" data-act="moveleft" data-id="'+escapeHtml(id)+'" title="'+t('moveRightTitle')+'">▶</button>' : '') +
        (siblingInfo && siblingInfo.idx < siblingInfo.count - 1 ? '<button class="mini-btn" data-act="moveright" data-id="'+escapeHtml(id)+'" title="'+t('moveLeftTitle')+'">◀</button>' : '') +
        '<button class="mini-btn danger" data-act="delete" data-id="'+escapeHtml(id)+'" title="delete">🗑</button>' +
      '</div>') : '') +
      '';
    if(childCount > 0){
      var tog = document.createElement('div');
      tog.className = 'toggle-branch';
      tog.dataset.act = 'toggle'; tog.dataset.id = id;
      tog.textContent = p.collapsed ? '+' : '−';
      el.appendChild(tog);
    }
    return el;
  }

  function renderUnit(id){
    var p = getPerson(id);
    var unit = document.createElement('div');
    unit.className = 'unit';
    var couple = document.createElement('div');
    couple.className = 'couple';
    couple.dataset.coupleFor = id;
    couple.appendChild(personCard(id));
    p.spouseIds.forEach(function(sid){ if(getPerson(sid)) couple.appendChild(personCard(sid)); });
    unit.appendChild(couple);
    if(p.childrenIds.length > 0){
      var row = document.createElement('div');
      row.className = 'children-row' + (p.collapsed ? ' collapsed' : '');
      row.dataset.parentUnit = id;
      p.childrenIds.forEach(function(cid){ if(getPerson(cid)) row.appendChild(renderUnit(cid)); });
      unit.appendChild(row);
    }
    return unit;
  }

  function render(){
    renderStats();
    var emptyWrap = document.getElementById('emptyWrap');
    var canvas = document.getElementById('canvas');
    var toolbar = document.getElementById('toolbar');
    var titleEl2 = document.getElementById('familyTitle');
    titleEl2.setAttribute('contenteditable', canEditCloud ? 'true' : 'false');
    document.getElementById('createRootBtn').style.display = canEditCloud ? '' : 'none';
    document.getElementById('restoreBtnEmpty').style.display = canEditCloud ? '' : 'none';
    document.getElementById('importBtn').style.display = canEditCloud ? '' : 'none';
    document.getElementById('resetBtn').style.display = canEditCloud ? '' : 'none';

    if(!state.rootId || !getPerson(state.rootId)){
      emptyWrap.style.display = 'flex'; canvas.style.display = 'none'; toolbar.style.display = 'none';
      var svgEmpty = document.getElementById('linksSvg');
      svgEmpty.innerHTML = '';
      svgEmpty.style.width = '0px'; svgEmpty.style.height = '0px';
      /* Otherwise the banner keeps showing whatever family name was there before
         the tree was cleared (e.g. after "start a new tree") — a brand-new,
         empty tree should read as empty, not as a leftover of the old one. */
      titleEl2.textContent = state.familyName || t('appName');
      return;
    }
    emptyWrap.style.display = 'none'; canvas.style.display = 'block'; toolbar.style.display = 'flex';

    var treeRoot = document.getElementById('treeRoot');
    treeRoot.innerHTML = '';
    treeRoot.appendChild(renderUnit(state.rootId));
    document.getElementById('familyTitle').textContent = state.familyName || t('appName');
    /* Title centered above the root couple, inside the canvas — so it scales and
       stays above the grandparents as the tree is zoomed. */
    var treeTitle = document.getElementById('treeTitle');
    if(treeTitle) treeTitle.textContent = (state.familyName && state.familyName.trim()) ? state.familyName.trim() : '';

    requestAnimationFrame(drawLinks);
  }

  /* Offset of `el` relative to the canvas content origin, accumulated up the
     offsetParent chain. offsetLeft/offsetTop are LAYOUT metrics — unaffected by
     the canvas's transform:scale (interactive zoom) or its print-time zoom — so
     the coordinates we compute are in the canvas's own untransformed space. The
     svg lives inside the canvas, so it is scaled by exactly the same factor as
     the cards, and the lines stay glued to them at any zoom and when printing. */
  function offsetInCanvas(el, canvas){
    var x = 0, y = 0;
    while(el && el !== canvas){ x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    return { x: x, y: y };
  }
  function drawLinks(){
    var svg = document.getElementById('linksSvg');
    var canvas = document.getElementById('canvas');
    svg.innerHTML = '';
    // Cover the canvas content box in its own (untransformed) layout pixels.
    svg.style.width = canvas.scrollWidth + 'px';
    svg.style.height = canvas.scrollHeight + 'px';

    document.querySelectorAll('.children-row').forEach(function(row){
      if(row.classList.contains('collapsed')) return;
      var parentId = row.dataset.parentUnit;
      var coupleEl = document.querySelector('.couple[data-couple-for="'+(window.CSS && CSS.escape ? CSS.escape(parentId) : parentId)+'"]');
      if(!coupleEl) return;
      var cp = offsetInCanvas(coupleEl, canvas);
      var startX = cp.x + coupleEl.offsetWidth/2;
      var startY = cp.y + coupleEl.offsetHeight;
      var childUnits = row.children;
      for(var i=0;i<childUnits.length;i++){
        var childCouple = childUnits[i].querySelector('.couple');
        if(!childCouple) continue;
        var ch = offsetInCanvas(childCouple, canvas);
        var endX = ch.x + childCouple.offsetWidth/2;
        var endY = ch.y;
        var midY = startY + (endY - startY) * 0.55;
        var path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d', 'M '+startX+' '+startY+' C '+startX+' '+midY+', '+endX+' '+midY+', '+endX+' '+endY);
        svg.appendChild(path);
      }
    });
  }
  window.addEventListener('resize', function(){ requestAnimationFrame(drawLinks); });

  /* Glue the connector lines to the cards. The lines are positioned from
     getBoundingClientRect, so any change to card geometry moves the cards out
     from under the curves — most visibly when the font-size setting resizes
     every card, but also when the Arabic web fonts (Amiri/Cairo) finish loading
     a frame late, or when the tree tab goes from hidden (0px) to visible. A
     ResizeObserver fires exactly when the layout has actually settled at its new
     size, so we redraw then instead of guessing with a single rAF. Debounced via
     rAF so a burst of callbacks collapses into one redraw. */
  (function observeTreeGeometry(){
    if(typeof ResizeObserver === 'undefined') return; // graceful: other redraw paths still run
    var treeRoot = document.getElementById('treeRoot');
    if(!treeRoot) return;
    var scheduled = false;
    var ro = new ResizeObserver(function(){
      if(scheduled) return;
      scheduled = true;
      requestAnimationFrame(function(){ scheduled = false; drawLinks(); });
    });
    ro.observe(treeRoot);
  })();

  /* When the tree is wider than the stage (any real family, on any viewport),
     the stage opens scrolled to its start edge — the visitor lands on a stray
     spouse card or blank canvas instead of the root couple. Center the stage's
     scroll on the canvas so the root is what you see first. Uses rendered
     rects (not scrollWidth math) so it's correct under RTL's scroll-direction
     quirks without needing a direction check. */
  function centerStage(){
    var stage = document.getElementById('stage');
    var canvas = document.getElementById('canvas');
    if(!stage || !canvas) return;
    var stageRect = stage.getBoundingClientRect();
    var canvasRect = canvas.getBoundingClientRect();
    if(!canvasRect.width || !stageRect.width) return;
    var delta = (canvasRect.left + canvasRect.right)/2 - (stageRect.left + stageRect.right)/2;
    stage.scrollLeft += delta;
  }

  /* ============== Home tab ============== */
  var arDigits = {'0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩'};
  function localeDigits(n){
    var s = String(n);
    if(state.lang !== 'ar') return s;
    return s.replace(/[0-9]/g, function(d){ return arDigits[d]; });
  }

  function homeCompletionHint(ppl, ids){
    if(!ids.length) return t('completionHintEmpty');
    for(var i=0;i<ids.length;i++){
      var p = ppl[ids[i]];
      if(!p.photo) return tf('completionHintMissingPhoto', {name: escapeHtml(p.name)});
      if(!p.birthDate) return tf('completionHintMissingBirth', {name: escapeHtml(p.name)});
    }
    return t('completionHintDone');
  }

  function renderHome(){
    var host = document.getElementById('tab-home');
    if(!host) return;
    var ppl = state.people || {};
    var ids = Object.keys(ppl);
    var count = ids.length;
    var gens = count ? maxGeneration() : 0;
    var photos = ids.filter(function(id){ return ppl[id].photo; }).length;
    var complete = ids.filter(function(id){ return ppl[id].photo && ppl[id].birthDate; }).length;
    var pct = count ? Math.round((complete / count) * 100) : 0;
    var fam = (state.familyName && state.familyName.trim()) ? state.familyName : t('unnamedFamily');
    var hint = homeCompletionHint(ppl, ids);

    host.innerHTML =
      '<div class="masthead">' +
        '<div class="brand-row">' +
          '<div class="crest">🌳</div>' +
          '<div><div class="app-name">'+t('appName')+'</div><div class="family-name">'+escapeHtml(fam)+'</div></div>' +
        '</div>' +
        '<div class="tadhib"><span class="dia">◆</span><span class="rule"></span><span class="dia">◆</span></div>' +
        '<div class="home-stat-row">' +
          '<div class="home-stat"><b>'+localeDigits(count)+'</b><span>'+t('statMembers')+'</span></div>' +
          '<div class="home-stat"><b>'+localeDigits(gens)+'</b><span>'+t('statGenerations')+'</span></div>' +
          '<div class="home-stat"><b>'+localeDigits(photos)+'</b><span>'+t('statPhotos')+'</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="home-body">' +
        '<div class="section-eyebrow"><span class="dia">◆</span><span>'+t('homeSectionsEyebrow')+'</span></div>' +
        '<div class="grid">' +
          '<div class="leaf tree" data-go="tree"><span class="corner">۞</span><div class="ic">🌳</div><h3>'+t('cardTree')+'</h3><p>'+t('cardTreeSub')+'</p></div>' +
          '<div class="leaf feed" data-go="moments"><span class="corner">۞</span><div class="ic">📰</div><h3>'+t('cardFeed')+'</h3><p>'+t('cardFeedSub')+'</p></div>' +
          '<div class="leaf search" data-go="search"><span class="corner">۞</span><div class="ic">🔍</div><h3>'+t('cardSearch')+'</h3><p>'+t('cardSearchSub')+'</p></div>' +
          '<div class="leaf members" data-go="members"><span class="corner">۞</span><div class="ic">👥</div><h3>'+t('cardMembers')+'</h3><p>'+t('cardMembersSub')+'</p></div>' +
        '</div>' +
        '<div class="meter-card">' +
          '<div class="meter-top"><h3>'+t('completionTitle')+'</h3><b>'+localeDigits(pct)+'%</b></div>' +
          '<div class="bar"><i style="width:'+pct+'%"></i></div>' +
          '<div class="meter-hint"><span class="dot">◆</span><span>'+hint+'</span></div>' +
        '</div>' +
      '</div>';

    host.querySelector('[data-go="tree"]').onclick = function(){ showTab('tree'); };
    host.querySelector('[data-go="moments"]').onclick = function(){ showTab('moments'); };
    host.querySelector('[data-go="search"]').onclick = function(){ toast(t('comingSoon')); };
    host.querySelector('[data-go="members"]').onclick = function(){ toast(t('comingSoon')); };
  }
  window.__ftRenderHome = renderHome;

  /* ============== Settings tab ============== */
  function ftReadFontScale(){ try { return localStorage.getItem('ft_fontscale') || 'md'; } catch(e){ return 'md'; } }
  function ftSetFontScale(v){ try { localStorage.setItem('ft_fontscale', v); } catch(e){} applyFontScale(v); }
  function applyFontScale(mode){
    var m = (mode === 'sm' || mode === 'lg') ? mode : 'md';
    var html = document.getElementById('htmlRoot');
    html.classList.remove('fontscale-sm', 'fontscale-lg');
    if(m !== 'md') html.classList.add('fontscale-' + m);
  }
  window.__ftApplyFontScale = applyFontScale;

  function segHtml(id, options, active){
    return '<span class="set-seg" id="'+id+'">' + options.map(function(o){
      return '<button type="button" data-val="'+o.val+'" class="'+(o.val===active?'active':'')+'">'+o.label+'</button>';
    }).join('') + '</span>';
  }

  // ---- PWA install helpers ----
  function ftIsStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }
  function ftIsIos(){
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  }
  // Build the "App" settings section. Three states: already installed, a live
  // install prompt available, or (iOS/unsupported) manual instructions.
  function installSectionHtml(){
    var installed = ftIsStandalone();
    var rowInner = installed
      ? '<span>📱 '+t('setInstall')+'</span><span class="set-val">'+t('installDone')+'</span>'
      : '<span>📱 '+t('setInstall')+'</span><span class="set-val set-val-accent">'+t('installReady')+' ›</span>';
    return '<div class="section-eyebrow" style="margin-top:18px;"><span class="dia">◆</span><span>'+t('setApp')+'</span></div>' +
      '<div class="set-group">' +
        '<div class="set-row'+(installed ? '' : ' set-row-click')+'" id="setInstallRow">'+rowInner+'</div>' +
      '</div>';
  }
  function ftTriggerInstall(){
    var dp = window.__ftDeferredInstall;
    if(dp && dp.prompt){
      dp.prompt();
      dp.userChoice && dp.userChoice.then(function(){ window.__ftDeferredInstall = null; renderSettings(); });
      return;
    }
    // No native prompt (iOS Safari, or the prompt was already dismissed): show
    // instructions in a sheet so they stay on screen. Branch on platform so a
    // non-Safari user is never handed iOS-only "Share button" steps.
    var title = ftIsIos() ? t('installIosTitle') : t('installMenuTitle');
    var steps = ftIsIos() ? t('installIosSteps') : t('installMenuSteps');
    openSheet(
      '<h3>'+title+'</h3>' +
      '<p style="line-height:1.9; font-size:15px; color:var(--ink-soft);">'+steps+'</p>'
    );
  }

  function renderSettings(){
    var host = document.getElementById('tab-settings');
    if(!host) return;
    var fam = (state.familyName && state.familyName.trim()) ? state.familyName : t('unnamedFamily');
    var curTheme = ftReadTheme();
    var curFont = ftReadFontScale();
    var hasCloud = !!window.__ftCloud;

    host.innerHTML =
      '<div class="masthead">' +
        '<div class="brand-row">' +
          '<div class="crest">⚙︎</div>' +
          '<div><div class="app-name">'+t('appName')+'</div><div class="family-name">'+t('settingsTitle')+'</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="home-body">' +
        '<div class="section-eyebrow"><span class="dia">◆</span><span>'+t('setAppearance')+'</span></div>' +
        '<div class="set-group">' +
          '<div class="set-row">' +
            '<span>'+t('setLang')+'</span>' +
            segHtml('setLangSeg', [{val:'ar', label:'عربي'}, {val:'en', label:'EN'}], state.lang) +
          '</div>' +
          '<div class="set-row">' +
            '<span>'+t('setDark')+'</span>' +
            segHtml('setThemeSeg', [
              {val:'light', label:t('setLight')},
              {val:'dark', label:t('setDarkOpt')},
              {val:'auto', label:t('setAuto')}
            ], curTheme) +
          '</div>' +
          '<div class="set-row">' +
            '<span>'+t('setFont')+'</span>' +
            segHtml('setFontSeg', [
              {val:'sm', label:t('fontSm')},
              {val:'md', label:t('fontMd')},
              {val:'lg', label:t('fontLg')}
            ], curFont) +
          '</div>' +
        '</div>' +
        installSectionHtml() +
        '<div class="section-eyebrow" style="margin-top:18px;"><span class="dia">◆</span><span>'+t('setFamily')+'</span></div>' +
        '<div class="set-group">' +
          '<div class="set-row'+(canEditCloud ? ' set-row-click' : '')+'" id="setFamilyNameRow">' +
            '<span>🏷️ '+t('setFamilyName')+'</span>' +
            '<span class="set-val">'+escapeHtml(fam)+(canEditCloud ? ' ›' : '')+'</span>' +
          '</div>' +
          (canEditCloud && hasCloud ? (
          '<div class="set-row set-row-click" id="setInviteRow">' +
            '<span>✉️ '+t('setInvite')+'</span>' +
            '<span class="set-val set-val-accent">›</span>' +
          '</div>') : '') +
          (hasCloud ? (
          '<div class="set-row set-row-click" id="setMembersRow">' +
            '<span>👥 '+t('setMembers')+'</span>' +
            '<span class="set-val">›</span>' +
          '</div>') : '') +
          (hasCloud ? (
          '<div class="set-row set-row-click set-row-danger" id="setSignoutRow">' +
            '<span>⏻ '+t('setSignout')+'</span>' +
          '</div>') : '') +
        '</div>' +
      '</div>';

    host.querySelectorAll('#setLangSeg button').forEach(function(btn){
      btn.onclick = function(){ switchLang(btn.dataset.val); renderSettings(); };
    });
    host.querySelectorAll('#setThemeSeg button').forEach(function(btn){
      btn.onclick = function(){ applyTheme(btn.dataset.val); renderSettings(); };
    });
    host.querySelectorAll('#setFontSeg button').forEach(function(btn){
      btn.onclick = function(){ ftSetFontScale(btn.dataset.val); renderSettings(); };
    });
    var installRow = document.getElementById('setInstallRow');
    if(installRow && !ftIsStandalone()) installRow.onclick = ftTriggerInstall;
    if(canEditCloud){
      document.getElementById('setFamilyNameRow').onclick = function(){
        showTab('tree');
        setTimeout(function(){
          var el = document.getElementById('familyTitle');
          if(el){ el.focus(); document.execCommand && document.execCommand('selectAll', false, null); }
        }, 0);
      };
    }
    if(canEditCloud && hasCloud){
      var invRow = document.getElementById('setInviteRow');
      if(invRow) invRow.onclick = function(){ window.__ftCloud.createInvite('editor'); };
    }
    if(hasCloud){
      var memRow = document.getElementById('setMembersRow');
      if(memRow) memRow.onclick = function(){
        if(window.__ftCloud.showMembers) window.__ftCloud.showMembers();
      };
    }
    if(hasCloud){
      var soRow = document.getElementById('setSignoutRow');
      if(soRow) soRow.onclick = function(){
        if(window.__ftCloud.signOut) window.__ftCloud.signOut();
      };
    }
  }
  window.__ftRenderSettings = renderSettings;

  /* ============== Sheets ============== */
  var overlay = document.getElementById('overlay');
  var sheet = document.getElementById('sheet');
  var sheetBody = document.getElementById('sheetBody');

  function openSheet(html){ sheetBody.innerHTML = html; overlay.classList.add('open'); sheet.classList.add('open'); }
  function closeSheet(){ overlay.classList.remove('open'); sheet.classList.remove('open'); pendingPhoto = undefined; if(typeof clearKinHighlights==='function') clearKinHighlights(); }
  overlay.addEventListener('click', closeSheet);

  function photoRowHtml(existingPhoto){
    return '<div class="field"><label>'+t('photoLabel')+'</label>'+
      '<div class="photo-row">'+
        '<div class="photo-preview" id="pf_photoPreview">'+(existingPhoto ? '<img src="'+escapeHtml(existingPhoto)+'">' : '👤')+'</div>'+
        '<div class="photo-btns">'+
          '<button type="button" id="pf_choosePhoto">'+t('photoChoose')+'</button>'+
          '<button type="button" id="pf_removePhoto" style="'+(existingPhoto?'':'display:none;')+'">'+t('photoRemove')+'</button>'+
        '</div>'+
        '<input type="file" id="pf_photoFile" accept="image/*" style="display:none;">'+
      '</div></div>';
  }

  function wirePhotoRow(existingPhoto){
    pendingPhoto = existingPhoto || null;
    document.getElementById('pf_choosePhoto').onclick = function(){ document.getElementById('pf_photoFile').click(); };
    document.getElementById('pf_photoFile').onchange = function(e){
      var file = e.target.files[0];
      if(!file) return;
      resizeImage(file, 220, function(dataUrl){
        if(!dataUrl) return;
        pendingPhoto = dataUrl;
        document.getElementById('pf_photoPreview').innerHTML = '<img src="'+dataUrl+'">';
        document.getElementById('pf_removePhoto').style.display = '';
      });
    };
    document.getElementById('pf_removePhoto').onclick = function(){
      pendingPhoto = null;
      document.getElementById('pf_photoPreview').innerHTML = '👤';
      document.getElementById('pf_removePhoto').style.display = 'none';
    };
  }

  /* Nasab auto-fill: a child's full name is the entered first name followed by
     the father's full name (which already carries the chain to the surname),
     e.g. parent "محمد الوزير" + "خالد" -> "خالد محمد الوزير". If the user typed
     the full chain already, don't duplicate it. */
  function buildFullName(first, parentName){
    first = (first || '').trim().replace(/\s+/g, ' ');
    parentName = (parentName || '').trim();
    if(!first) return '';
    if(!parentName) return first;
    if(first === parentName) return first;
    if(first.length >= parentName.length && first.slice(-parentName.length) === parentName) return first;
    return first + ' ' + parentName;
  }

  function openPersonForm(mode, targetId){
    var isEdit = mode === 'edit';
    var target = getPerson(targetId);
    var titleTxt = mode === 'child' ? t('addChildTitle') : (mode === 'spouse' ? t('addSpouseTitle') : t('editTitle'));
    var contextTxt = mode === 'child' ? tf('contextChild', {name: escapeHtml(target.name)})
      : mode === 'spouse' ? tf('contextSpouse', {name: escapeHtml(target.name)})
      : tf('contextEdit', {name: escapeHtml(target.name)});

    openSheet(
      '<h3>'+titleTxt+'</h3>'+
      '<div class="context">'+contextTxt+'</div>'+
      '<div class="field"><label>'+(mode==='child' ? t('firstNameLabel') : t('nameLabel'))+'</label><input type="text" id="pf_name" placeholder="'+(mode==='child' ? t('firstNamePh') : t('namePh'))+'" value="'+(isEdit ? escapeHtml(target.name) : '')+'"></div>'+
      (mode==='child' ? '<div class="name-preview" id="pf_fullPreview"></div>' : '')+
      '<div class="field"><label>'+t('genderLabel')+'</label>'+
        '<div class="gender-toggle">'+
          '<button type="button" id="pf_male" class="'+(!isEdit || target.gender==='m' ? 'active-m':'')+'">'+t('male')+'</button>'+
          '<button type="button" id="pf_female" class="'+(isEdit && target.gender==='f' ? 'active-f':'')+'">'+t('female')+'</button>'+
        '</div>'+
      '</div>'+
      (isEdit ? photoRowHtml(target.photo) : '') +
      (isEdit ? '<div class="field"><label>'+t('birthLabel')+'</label><input type="date" id="pf_birth" value="'+escapeHtml(target.birthDate||'')+'"></div>' : '') +
      (isEdit ? '<div class="field"><label>'+t('residenceLabel')+'</label><input type="text" id="pf_residence" placeholder="'+t('residencePh')+'" value="'+escapeHtml(target.residence||'')+'"></div>' : '') +
      (mode === 'child' ? '<div class="keep-open-row"><input type="checkbox" id="pf_keep" checked><label for="pf_keep">'+t('keepAdding')+'</label></div>' : '') +
      '<button class="primary-btn" id="pf_save">'+t('saveBtn')+'</button>'
    );

    var gender = isEdit ? target.gender : 'm';
    document.getElementById('pf_male').onclick = function(){ gender='m'; this.className='active-m'; document.getElementById('pf_female').className=''; };
    document.getElementById('pf_female').onclick = function(){ gender='f'; this.className='active-f'; document.getElementById('pf_male').className=''; };
    if(isEdit) wirePhotoRow(target.photo);
    // Live full-name preview for a new child.
    if(mode === 'child'){
      var nameInput = document.getElementById('pf_name');
      var preview = document.getElementById('pf_fullPreview');
      var updatePreview = function(){
        var full = buildFullName(nameInput.value, target.name);
        preview.textContent = full ? (t('fullNamePreview') + ' ' + full) : '';
      };
      nameInput.addEventListener('input', updatePreview);
      updatePreview();
    }
    document.getElementById('pf_name').focus();

    document.getElementById('pf_save').onclick = function(){
      var name = document.getElementById('pf_name').value.trim();
      if(!name){ toast(t('toastNameRequired')); return; }
      if(mode === 'child') addChild(targetId, buildFullName(name, target.name), gender);
      else if(mode === 'spouse') addSpouse(targetId, name, gender);
      else {
        updatePerson(targetId, {
          name: name, gender: gender,
          birthDate: document.getElementById('pf_birth').value || null,
          residence: document.getElementById('pf_residence').value.trim(),
          photo: pendingPhoto
        });
      }
      toast(t('toastSaved'));
      var keepOpen = mode === 'child' && document.getElementById('pf_keep') && document.getElementById('pf_keep').checked;
      if(keepOpen){ openPersonForm('child', targetId); } else { closeSheet(); }
    };
  }

  function openDeleteConfirm(id){
    var p = getPerson(id);
    var n = countDescendants(id);
    var warn = n > 0 ? tf('deleteWarnN', {n: n}) : t('deleteWarnNone');
    openSheet(
      '<h3>'+tf('deleteTitle', {name: escapeHtml(p.name)})+'</h3>'+
      '<div class="confirm-box"><p>'+warn+'</p>'+
        '<div class="confirm-actions">'+
          '<button class="btn-cancel" id="cf_cancel">'+t('deleteCancel')+'</button>'+
          '<button class="btn-danger" id="cf_ok">'+t('deleteConfirm')+'</button>'+
        '</div></div>'
    );
    document.getElementById('cf_cancel').onclick = closeSheet;
    document.getElementById('cf_ok').onclick = function(){ deletePerson(id); closeSheet(); toast(t('toastDeleted')); };
  }

  /* ============== Kinship finder ============== */
  var kinshipMode = false;   // false | 'pick1' | 'pick2'
  var kinshipA = null;

  function startKinship(){
    if(!state.rootId){ toast(t('emptyTitle')); return; }
    kinshipMode = 'pick1'; kinshipA = null;
    document.body.classList.add('kinship-mode');
    showTab('tree');
    updateKinshipBanner();
  }
  function clearKinHighlights(){
    document.querySelectorAll('.card.kin-a, .card.kin-b').forEach(function(c){ c.classList.remove('kin-a', 'kin-b'); });
  }
  function endKinship(keepHighlights){
    kinshipMode = false; kinshipA = null;
    document.body.classList.remove('kinship-mode');
    var el = document.getElementById('kinshipBanner'); if(el) el.remove();
    if(keepHighlights !== true) clearKinHighlights();
  }
  function kinCard(id){ return document.querySelector('.card[data-id="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); }
  function updateKinshipBanner(){
    var el = document.getElementById('kinshipBanner');
    if(!el){
      el = document.createElement('div'); el.id = 'kinshipBanner'; el.className = 'kinship-banner';
      document.body.appendChild(el);
    }
    var msg = kinshipMode === 'pick1' ? t('kinshipPick1') : t('kinshipPick2');
    el.innerHTML = '<span>'+escapeHtml(msg)+'</span><button type="button" id="kinCancel">'+t('kinshipCancel')+'</button>';
    document.getElementById('kinCancel').onclick = endKinship;
  }
  function pickKinship(id){
    if(!getPerson(id)) return;
    if(kinshipMode === 'pick1'){
      kinshipA = id; kinshipMode = 'pick2';
      var card = kinCard(id); if(card) card.classList.add('kin-a');
      updateKinshipBanner();
    } else if(kinshipMode === 'pick2'){
      if(id === kinshipA){ return; }
      var card2 = kinCard(id); if(card2) card2.classList.add('kin-b');
      var aId = kinshipA;
      endKinship(true);            // keep both highlights while the result shows
      showKinshipResult(aId, id);
    }
  }
  function showKinshipResult(aId, bId){
    var A = getPerson(aId), B = getPerson(bId);
    var rel = (window.ftKinship ? window.ftKinship(state.people, aId, bId) : '');
    // Use the pronoun matching B's gender only (هو for male, هي for female):
    //   «B»  هو/هي  ——  [term]  ——  لـ «A»
    var verb = (state.lang === 'en') ? 'is' : (B.gender === 'f' ? 'هي' : 'هو');
    var dotA = '<span class="kin-dot kin-dot-a"></span>';
    var dotB = '<span class="kin-dot kin-dot-b"></span>';
    openSheet(
      '<h3>🔗 '+t('kinshipTitle')+'</h3>'+
      '<div class="kin-result">'+
        '<div class="kin-name">'+dotB+'<b>'+escapeHtml(B.name)+'</b> <span class="kin-verb">'+verb+'</span></div>'+
        '<div class="kin-term">'+escapeHtml(rel)+'</div>'+
        '<div class="kin-name">'+t('kinshipTo')+' '+dotA+'<b>'+escapeHtml(A.name)+'</b></div>'+
      '</div>'+
      '<button class="primary-btn" id="kin_close">'+t('kinshipClose')+'</button>'
    );
    document.getElementById('kin_close').onclick = closeSheet;
  }
  window.__ftStartKinship = startKinship;

  document.getElementById('treeRoot').addEventListener('click', function(e){
    if(kinshipMode){
      var picked = e.target.closest('.card');
      if(picked && picked.dataset.id){ e.stopPropagation(); pickKinship(picked.dataset.id); }
      return;
    }
    var btn = e.target.closest('[data-act]');
    if(!btn) return;
    var act = btn.dataset.act, id = btn.dataset.id;
    if(act === 'child') openPersonForm('child', id);
    else if(act === 'spouse') openPersonForm('spouse', id);
    else if(act === 'edit') openPersonForm('edit', id);
    else if(act === 'delete') openDeleteConfirm(id);
    else if(act === 'toggle') toggleCollapse(id);
    else if(act === 'moveleft') moveSibling(id, -1);
    else if(act === 'moveright') moveSibling(id, 1);
  });

  document.getElementById('createRootBtn').addEventListener('click', function(){
    var name = document.getElementById('rootName').value.trim();
    var spouse = document.getElementById('rootSpouseName').value.trim();
    if(!name){ toast(t('toastNameRequired')); return; }
    createRoot(name, spouse);
    toast(t('toastRootCreated'));
  });

  var titleEl = document.getElementById('familyTitle');
  titleEl.addEventListener('blur', function(){
    var v = titleEl.textContent.trim() || t('appName');
    state.familyName = v; titleEl.textContent = v; scheduleSave();
  });
  titleEl.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); titleEl.blur(); } });

  document.getElementById('printBtn').addEventListener('click', function(){ showTab('tree'); window.print(); });
  /* Print: reset zoom to 1 and redraw the connector lines against the print
     layout (chrome hidden, stage expanded) so lines and cards line up on paper.
     The lines are absolutely-positioned from getBoundingClientRect, so they must
     be recomputed for the exact printed layout, not the on-screen zoomed one. */
  /* Smart print: measure the whole tree, pick the orientation that suits its
     shape, and scale it down (CSS zoom, which shrinks the layout box too so it
     paginates correctly) until the ENTIRE tree fits one page — never printing
     just a slice. Lines are redrawn against the scaled layout so they align. */
  function ftInjectPrintPage(sizeDims, marginMm){
    var st = document.getElementById('ftPrintPage');
    if(!st){ st = document.createElement('style'); st.id = 'ftPrintPage'; document.head.appendChild(st); }
    st.textContent = '@page{ size: ' + sizeDims + '; margin: ' + marginMm + 'mm; }';
  }
  function ftPreparePrint(){
    window.__ftPrevZoom = zoom;
    window.__ftWasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark'); // print on the light manuscript palette
    document.body.classList.remove('tree-immersive');
    document.body.classList.add('printing');
    zoom = 1; applyZoom();
    var canvas = document.getElementById('canvas');
    canvas.style.zoom = '';                       // measure natural size (title is inside, so it's included)
    var natW = canvas.scrollWidth  || canvas.getBoundingClientRect().width;
    var natH = canvas.scrollHeight || canvas.getBoundingClientRect().height;
    if(!natW || !natH) return;
    /* Fit the whole tree onto one A4 page, measured in real mm (not guessed px),
       with a generous margin so nothing clips, and centered on the page. */
    var landscape = natW >= natH;                 // wide tree -> landscape, tall -> portrait
    var PXMM = 96 / 25.4;                          // ~3.7795 px per mm @96dpi
    var marginMm = 10;
    var pageWmm = (landscape ? 297 : 210) - marginMm * 2;
    var pageHmm = (landscape ? 210 : 297) - marginMm * 2;
    var pageW = pageWmm * PXMM, pageH = pageHmm * PXMM;
    var scale = Math.min(pageW / natW, pageH / natH, 1) * 0.92; // 0.92 safety so edges never clip
    ftInjectPrintPage(landscape ? '297mm 210mm' : '210mm 297mm', marginMm);
    canvas.style.zoom = scale;                     // scales visual AND layout box
    canvas.style.margin = '0 auto';                // center the tree horizontally on the page
    drawLinks();                                   // realign lines at the scaled layout
  }
  function ftRestoreAfterPrint(){
    document.body.classList.remove('printing');
    if(window.__ftWasDark) document.documentElement.classList.add('dark');
    var c = document.getElementById('canvas'); c.style.zoom = ''; c.style.margin = '';
    zoom = window.__ftPrevZoom || 1; applyZoom();
    requestAnimationFrame(drawLinks);
  }
  window.addEventListener('beforeprint', ftPreparePrint);
  window.addEventListener('afterprint', ftRestoreAfterPrint);

  document.getElementById('exportBtn').addEventListener('click', function(){
    var blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (state.familyName || t('appName')) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(t('toastBackup'));
  });

  document.getElementById('importBtn').addEventListener('click', function(){ document.getElementById('importFile').click(); });
  document.getElementById('restoreBtnEmpty').addEventListener('click', function(){ document.getElementById('importFile').click(); });
  document.getElementById('importFile').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      try{
        var parsed = JSON.parse(ev.target.result);
        if(!parsed || typeof parsed.people !== 'object') throw new Error('bad file');
        parsed.lang = (parsed.lang === 'en' || parsed.lang === 'ar') ? parsed.lang : state.lang;
        Object.keys(parsed.people).forEach(function(id){ migratePerson(parsed.people[id]); });
        state = parsed;
        scheduleSave(); applyLang(); render();
        toast(t('toastImported'));
      }catch(err){ toast(t('toastImportError')); }
    };
    reader.onerror = function(){ toast(t('toastImportError')); };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', function(){
    openSheet(
      '<h3>'+t('resetTitle')+'</h3>'+
      '<div class="confirm-box"><p>'+t('resetDesc')+'</p>'+
        '<div class="confirm-actions">'+
          '<button class="btn-cancel" id="rs_cancel">'+t('deleteCancel')+'</button>'+
          '<button class="btn-danger" id="rs_ok">'+t('resetConfirm')+'</button>'+
        '</div></div>'
    );
    document.getElementById('rs_cancel').onclick = closeSheet;
    document.getElementById('rs_ok').onclick = function(){
      state = { rootId: null, familyName: '', people: {}, lang: state.lang };
      scheduleSave(); render(); closeSheet();
    };
  });

  document.getElementById('menuBtn').addEventListener('click', function(){
    openSheet(
      '<h3>'+t('menuTitle')+'</h3>'+
      '<div class="context">'+t('menuDesc')+'</div>'+
      '<button class="primary-btn" id="mn_kinship" style="margin-bottom:10px; background:var(--plum);">'+t('kinshipMenu')+'</button>'+
      '<button class="primary-btn" id="mn_export" style="margin-bottom:10px;">'+t('menuExport')+'</button>'+
      (canEditCloud ? '<button class="primary-btn" id="mn_import" style="margin-bottom:10px; background:var(--teal);">'+t('menuImport')+'</button>' : '') +
      (canEditCloud ? '<button class="primary-btn" id="mn_reset" style="background:var(--danger);">'+t('menuReset')+'</button>' : '') +
      (canEditCloud && window.__ftCloud ? '<button class="primary-btn" id="mn_invite" style="margin-top:10px; background:var(--teal);">'+t('menuInvite')+'</button>' : '') +
      (window.__ftCloud ? '<button class="primary-btn" id="mn_activity" style="margin-top:10px; background:var(--plum);">📋 سجل النشاط</button>' : '')
    );
    document.getElementById('mn_kinship').onclick = function(){ closeSheet(); startKinship(); };
    document.getElementById('mn_export').onclick = function(){ closeSheet(); document.getElementById('exportBtn').click(); };
    if(canEditCloud){
      document.getElementById('mn_import').onclick = function(){ closeSheet(); document.getElementById('importBtn').click(); };
      document.getElementById('mn_reset').onclick = function(){ closeSheet(); document.getElementById('resetBtn').click(); };
    }
    if(canEditCloud && window.__ftCloud && window.__ftCloud.createInvite){
      var invBtn = document.getElementById('mn_invite');
      if(invBtn) invBtn.onclick = function(){ closeSheet(); window.__ftCloud.createInvite('editor'); };
    }
    if(window.__ftCloud){
      document.getElementById('mn_activity').onclick = function(){ closeSheet(); window.__ftCloud.showActivityLog(); };
    }
  });

  function applyZoom(){
    document.getElementById('canvas').style.transform = 'scale('+zoom+')';
    document.getElementById('zoomLabel').textContent = Math.round(zoom*100)+'%';
  }
  document.getElementById('zoomIn').addEventListener('click', function(){ zoom = Math.min(1.6, zoom + 0.1); applyZoom(); requestAnimationFrame(drawLinks); });
  document.getElementById('zoomOut').addEventListener('click', function(){ zoom = Math.max(0.4, zoom - 0.1); applyZoom(); requestAnimationFrame(drawLinks); });

  /* ---- Pinch-to-zoom (two-finger touch gesture) ---- */
  (function(){
    var stageEl = document.getElementById('stage');
    var pinch = null;

    function touchDist(t1, t2){
      var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx*dx + dy*dy);
    }

    stageEl.addEventListener('touchstart', function(e){
      if(e.touches.length === 2){
        pinch = { startDist: touchDist(e.touches[0], e.touches[1]), startZoom: zoom };
      }
    }, { passive: true });

    stageEl.addEventListener('touchmove', function(e){
      if(e.touches.length === 2 && pinch){
        e.preventDefault();
        var dist = touchDist(e.touches[0], e.touches[1]);
        var ratio = dist / pinch.startDist;
        zoom = Math.min(1.6, Math.max(0.4, pinch.startZoom * ratio));
        applyZoom();
        requestAnimationFrame(drawLinks);
      }
    }, { passive: false });

    stageEl.addEventListener('touchend', function(e){
      if(e.touches.length < 2) pinch = null;
    }, { passive: true });
    stageEl.addEventListener('touchcancel', function(){ pinch = null; }, { passive: true });
  })();

  load();
})();
