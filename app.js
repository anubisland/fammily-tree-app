(function(){
  "use strict";

  // Node test hook: a self-contained pure nasab computer over a people map.
  // Runs before any DOM access so `require('./app.js')` works under node
  // (see scripts/names.test.cjs).
  if(typeof document === 'undefined'){
    var G = (typeof global !== 'undefined' ? global : this);
    G.__ftComputeFullName = function(people, id, lang){
      function own(p){ var n=p&&p.name; if(typeof n==='string') return n; if(!n) return ''; return n[lang]||n[lang==='ar'?'en':'ar']||''; }
      function father(p){ if(!p||!p.parentId) return null; var par=people[p.parentId]; if(!par) return null;
        if(par.gender==='m') return par; var sp=par.spouseIds&&par.spouseIds[0]?people[par.spouseIds[0]]:null; return (sp&&sp.gender==='m')?sp:null; }
      var parts=[], cur=people[id], guard=0; while(cur&&guard++<64){ parts.push(own(cur)); cur=father(cur); } return parts.filter(Boolean).join(' ');
    };
    // Date helpers mirror the runtime ones below (kept in sync); exposed for scripts/dates.test.cjs.
    G.__ftDateHelpers = (function(){
      function parseD(s){ if(!s) return null; var d=new Date(s); return isNaN(d.getTime())?null:d; }
      function greg(s,lang){ var d=parseD(s); if(!d) return ''; try{ return new Intl.DateTimeFormat(lang==='en'?'en-GB':'ar',{day:'numeric',month:'long',year:'numeric'}).format(d);}catch(e){return s;} }
      function hijri(s,lang){ var d=parseD(s); if(!d) return ''; try{ var loc=(lang==='en'?'en-US':'ar-SA')+'-u-ca-islamic-umalqura'; return new Intl.DateTimeFormat(loc,{day:'numeric',month:'long',year:'numeric',era:'short'}).format(d); }catch(e){return '';} }
      function age(b,ref){ var bd=parseD(b); if(!bd) return null; var r=ref?parseD(ref):new Date(); if(!r) return null; var a=r.getFullYear()-bd.getFullYear(); var m=r.getMonth()-bd.getMonth(); if(m<0||(m===0&&r.getDate()<bd.getDate())) a--; return a<0?null:a; }
      return {
        gregText:function(s,l){return greg(s,l||'ar');},
        hijriText:function(s,l){return hijri(s,l||'ar');},
        fmtDate:function(s,l){l=l||'ar'; var g=greg(s,l),h=hijri(s,l); return g?(h?(g+' — '+h):g):'';},
        ageYears:age,
        lifespanText:function(b,d,l){var n=age(b,d); if(n===null||!d) return ''; return (l==='en')?('lived '+n+' years'):('عاش '+n+' سنة');}
      };
    })();
    return;   // don't run the DOM app under node
  }

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
    nameEnLabel:{ar:'الاسم (English) *', en:'Name (English) *'},
    namePh:{ar:'اكتب الاسم هنا', en:'Enter name'},
    genderLabel:{ar:'النوع', en:'Gender'},
    birthLabel:{ar:'تاريخ الميلاد (اختياري)', en:'Date of birth (optional)'},
    deathLabel:{ar:'تاريخ الوفاة (اختياري)', en:'Date of death (optional)'},
    inMemory:{ar:'رحمه الله', en:'In memory'},
    profileBirth:{ar:'الميلاد', en:'Born'},
    profileDeath:{ar:'الوفاة', en:'Died'},
    profileAge:{ar:'العمر', en:'Age'},
    relFather:{ar:'الأب', en:'Father'},
    relMother:{ar:'الأم', en:'Mother'},
    relSpouse:{ar:'الزوج/الزوجة', en:'Spouse'},
    relChildren:{ar:'الأبناء', en:'Children'},
    profileEdit:{ar:'تعديل', en:'Edit'},
    profileAddChild:{ar:'إضافة ابن/ابنة', en:'Add child'},
    profileKinship:{ar:'القرابة', en:'Kinship'},
    residenceLabel:{ar:'مكان الإقامة (اختياري)', en:'Place of residence (optional)'},
    residencePh:{ar:'مثال: القاهرة، مصر', en:'e.g. Cairo, Egypt'},
    bioLabel:{ar:'نبذة (اختياري)', en:'About (optional)'},
    bioPh:{ar:'قصة، مهنة، ذكرى…', en:'A story, profession, memory…'},
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
    childNeedsFather:{ar:'⚠️ أضف الأب (الزوج) أولاً لينسب الأبناء إليه', en:'⚠️ Add the father (husband) first so children are attributed to him'},
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
    menuHidden:{ar:'🧹 مراجعة الأفراد المخفيّين', en:'🧹 Review hidden people'},
    hiddenTitle:{ar:'الأفراد المخفيّون', en:'Hidden people'},
    hiddenDesc:{ar:'سجلات لا تظهر في الشجرة (بقايا استيراد قديم). «إظهار» تُعيدها للشجرة، و«حذف» تزيل المكرّر الفارغ نهائيًّا.', en:'Records not shown in the tree. “Show” restores one to the tree; “Delete” removes an empty duplicate permanently.'},
    hiddenUnder:{ar:'تحت', en:'under'},
    hiddenKids:{ar:'أبناء', en:'children'},
    hiddenShow:{ar:'إظهار', en:'Show'},
    hiddenDelete:{ar:'حذف', en:'Delete'},
    hiddenNone:{ar:'لا يوجد أفراد مخفيّون — كل الأفراد ظاهرون 🎉', en:'No hidden people — everyone is shown 🎉'},
    hiddenDelKids:{ar:'هذا السجل له أبناء سيُحذفون معه. متأكد؟', en:'This record has children who will be deleted too. Sure?'},
    todayTitle:{ar:'🎉 اليوم في العائلة', en:'🎉 Today in the family'},
    todaySectionToday:{ar:'اليوم', en:'Today'},
    todaySectionSoon:{ar:'قريبًا', en:'Coming up'},
    occBirthdayToday:{ar:'عيد ميلاده اليوم', en:'Birthday today'},
    occBirthdayTodayF:{ar:'عيد ميلادها اليوم', en:'Birthday today'},
    occMemorialToday:{ar:'ذكرى وفاته اليوم', en:'Anniversary today'},
    occMemorialTodayF:{ar:'ذكرى وفاتها اليوم', en:'Anniversary today'},
    occInDays:{ar:'بعد {n} يومًا', en:'in {n} days'},
    occTurning:{ar:'يُتمّ {n}', en:'turning {n}'},
    occYearsSince:{ar:'مرّت {n} سنة', en:'{n} years'},
    occMemorialTag:{ar:'رحمه الله', en:'In memory'},
    occGreetBtn:{ar:'🎉 هنّئ', en:'🎉 Greet'},
    occDuaBtn:{ar:'🤲 ادعُ له', en:'🤲 Pray'},
    greetBirthday:{ar:'كل عام و{name} بخير 🎉', en:'Happy birthday, {name} 🎉'},
    greetMemorial:{ar:'اللهم ارحم {name} وأسكنه فسيح جنّاتك 🤲', en:'In loving memory of {name} 🤲'},
    todayEmpty:{ar:'لا مناسبات قريبة — أضف تواريخ الميلاد لتظهر التذكيرات.', en:'No upcoming occasions — add birth dates to see reminders.'},
    todayAddDates:{ar:'➕ أضف تواريخ', en:'➕ Add dates'},
    addDatesTitle:{ar:'➕ إضافة تواريخ الميلاد', en:'➕ Add birth dates'},
    addDatesDesc:{ar:'أفراد بلا تاريخ ميلاد — أدخل التاريخ ليُحفظ فورًا وتظهر تذكيراته.', en:'People with no birth date — set one and it saves instantly.'},
    addDatesNone:{ar:'كل الأفراد لديهم تاريخ ميلاد 🎉', en:'Everyone has a birth date 🎉'},
    cardStats:{ar:'الإحصاءات', en:'Statistics'},
    cardStatsSub:{ar:'أرقام العائلة في لمحة', en:'Your family at a glance'},
    statsTitle:{ar:'📊 إحصاءات العائلة', en:'📊 Family statistics'},
    statsTotal:{ar:'إجمالي الأفراد', en:'Total members'},
    statsMales:{ar:'ذكور', en:'Males'},
    statsFemales:{ar:'إناث', en:'Females'},
    statsLiving:{ar:'أحياء', en:'Living'},
    statsDeceased:{ar:'في ذمة الله', en:'Deceased'},
    statsGenerations:{ar:'الأجيال', en:'Generations'},
    statsMostChildren:{ar:'الأكثر أبناءً', en:'Most children'},
    statsOldest:{ar:'الأكبر سنًّا', en:'Oldest'},
    statsYoungest:{ar:'الأصغر سنًّا', en:'Youngest'},
    statsAvgAge:{ar:'متوسط الأعمار', en:'Average age'},
    statsTopCity:{ar:'المدينة الأكثر', en:'Top city'},
    statsWithBirth:{ar:'لديهم تاريخ ميلاد', en:'Have a birth date'},
    statsWithPhoto:{ar:'لديهم صورة', en:'Have a photo'},
    statsYearsVal:{ar:'{n} سنة', en:'{n} yrs'},
    statsChildrenVal:{ar:'{n} أبناء', en:'{n} children'},
    statsEmpty:{ar:'أضف أفرادًا لعرض الإحصاءات.', en:'Add members to see statistics.'},
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
    navKinship:{ar:'القرابة', en:'Kinship'},
    navActivity:{ar:'السجل', en:'Activity'},
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
    cardActivity:{ar:'السجل', en:'Activity'},
    cardActivitySub:{ar:'نشاط العائلة اليوم', en:"Today's family activity"},
    cardMembers:{ar:'الأعضاء', en:'Members'},
    cardMembersSub:{ar:'إدارة صلاحيات الأفراد', en:'Manage member permissions'},
    searchPlaceholder:{ar:'🔍 ابحث عن فرد بالاسم…', en:'🔍 Search a person by name…'},
    searchNoResults:{ar:'لا توجد نتائج', en:'No matches'},
    personNotShown:{ar:'هذا الشخص غير ظاهر في الشجرة (قد يكون غير مرتبط) — أخبرني لأساعدك', en:'This person is not shown on the tree (may be disconnected)'},
    statPhotos:{ar:'صورة', en:'Photos'},
    completionTitle:{ar:'اكتمال الملفات', en:'Profile completeness'},
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
  // Expose translation to the cloud.js ES module (which can't see this IIFE scope).
  window.__ftT = t; window.__ftTf = tf;
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
      birthDate: null, deathDate: null, residence: '', bio: '', photo: null };
  }

  function migratePerson(p){
    if(p.birthDate === undefined) p.birthDate = null;
    if(p.deathDate === undefined) p.deathDate = null;
    if(p.residence === undefined) p.residence = '';
    if(p.bio === undefined) p.bio = '';
    if(p.photo === undefined) p.photo = null;
    return p;
  }

  /* One-time migration: legacy single-string names -> {ar,en} own-segments.
     Two-pass so a child's stripping of the father's name always uses the
     father's OLD (pre-migration) full name, regardless of processing order.
     Idempotent: any person whose name is already an object is left alone. */
  /* Add an English name alongside the existing Arabic. The stored Arabic name is
     the full nasab as typed and is kept EXACTLY as-is (no stripping) — the English
     is a transliteration suggestion the user can edit. Idempotent (skips objects). */
  function migrateNames(state){
    var ppl = state.people || {};
    Object.keys(ppl).forEach(function(id){
      var p = ppl[id];
      if(typeof p.name === 'string') p.name = { ar: p.name, en: (window.ftTranslit ? window.ftTranslit(p.name) : p.name) };
    });
    if(typeof state.familyName === 'string') state.familyName = { ar: state.familyName, en: (window.ftTranslit ? window.ftTranslit(state.familyName) : state.familyName) };
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
          migrateNames(state);
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
    migrateNames(state);
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
    document.getElementById('nav_kinship').textContent = t('navKinship');
    document.getElementById('nav_activity').textContent = t('navActivity');
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
    b.addEventListener('click', function(){
      // Two nav slots are ACTIONS (open a sheet / start a mode), not view tabs.
      var action = b.getAttribute('data-action');
      if(action === 'kinship'){ startKinship(); return; }
      if(action === 'activity'){ if(window.__ftCloud && window.__ftCloud.showActivityLog) window.__ftCloud.showActivityLog(); else toast(t('comingSoon')); return; }
      showTab(b.getAttribute('data-tab'));
    });
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

  /* ---- Name helpers (bilingual + live nasab) ---- */
  function ownName(p, lang){
    if(!p) return '';
    var n = p.name;
    if(typeof n === 'string') return n;                 // legacy, pre-migration
    if(!n) return '';
    return n[lang] || n[lang === 'ar' ? 'en' : 'ar'] || '';
  }
  function firstNameOf(p){ return ownName(p, state.lang); }
  // A readable string from a raw name value ({ar,en} or legacy string) — for logs.
  function nameStr(nm){ return typeof nm === 'string' ? nm : (nm && (nm[state.lang] || nm.ar || nm.en)) || ''; }
  function fatherOfPerson(p){
    if(!p || !p.parentId) return null;
    var par = getPerson(p.parentId); if(!par) return null;
    if(par.gender === 'm') return par;                  // parent is the father
    var spId = par.spouseIds && par.spouseIds[0];       // parent is mother -> father = her husband
    var sp = spId ? getPerson(spId) : null;
    return (sp && sp.gender === 'm') ? sp : null;
  }
  function motherOfPerson(p){
    if(!p || !p.parentId) return null;
    var par = getPerson(p.parentId); if(!par) return null;
    if(par.gender === 'f') return par;                  // parent is the mother
    var spId = par.spouseIds && par.spouseIds[0];       // parent is father -> mother = his wife
    var sp = spId ? getPerson(spId) : null;
    return (sp && sp.gender === 'f') ? sp : null;
  }
  /* The stored name IS the full nasab (as the user typed it), in the current
     language. We do NOT recompute it by walking the tree — hand-typed Arabic
     nasab doesn't strip/re-append cleanly (mixed alef forms, merged words), and
     doing so duplicated the ancestor chain. Store and show the name as-is. */
  function fullNameOf(p){ return ownName(p, state.lang); }
  function famNameOf(){
    var f = state.familyName;
    if(typeof f === 'string') return f;
    if(!f) return '';
    return f[state.lang] || f[state.lang === 'ar' ? 'en' : 'ar'] || '';
  }

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

  /* Date helpers: show every date in Gregorian AND Hijri (Umm al-Qura) using the
     browser's Intl — no libraries. If a runtime lacks the Islamic calendar,
     hijriText returns '' (try/catch) and only the Gregorian date shows. */
  function parseDate(str){ if(!str) return null; var d = new Date(str); return isNaN(d.getTime()) ? null : d; }
  function gregText(str){
    var d = parseDate(str); if(!d) return '';
    try { return new Intl.DateTimeFormat(state.lang === 'en' ? 'en-GB' : 'ar', { day:'numeric', month:'long', year:'numeric' }).format(d); }
    catch(e){ return str; }
  }
  function hijriText(str){
    var d = parseDate(str); if(!d) return '';
    try {
      var loc = (state.lang === 'en' ? 'en-US' : 'ar-SA') + '-u-ca-islamic-umalqura';
      return new Intl.DateTimeFormat(loc, { day:'numeric', month:'long', year:'numeric', era:'short' }).format(d);
    } catch(e){ return ''; }
  }
  function fmtDate(str){ var g = gregText(str), h = hijriText(str); return g ? (h ? (g + ' — ' + h) : g) : ''; }
  function ageYears(birthStr, refStr){
    var b = parseDate(birthStr); if(!b) return null;
    var ref = refStr ? parseDate(refStr) : new Date(); if(!ref) return null;
    var a = ref.getFullYear() - b.getFullYear();
    var m = ref.getMonth() - b.getMonth();
    if(m < 0 || (m === 0 && ref.getDate() < b.getDate())) a--;
    return a < 0 ? null : a;
  }
  function lifespanText(birthStr, deathStr){
    var n = ageYears(birthStr, deathStr);
    if(n === null || !deathStr) return '';
    return state.lang === 'en' ? ('lived ' + n + ' years') : ('عاش ' + n + ' سنة');
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
    if(!famNameOf() || famNameOf() === t('appName')){
      var first = name.split(' ')[0];
      state.familyName = { ar: t('familyPrefix')+first+t('familySuffix'), en: (window.ftTranslit?window.ftTranslit(first):first)+' Family' };
    }
    scheduleSave(); render();
    logActivity('add', nameStr(name));
  }

  /* A blood-line member is the root or anyone with a parent in the tree; an
     in-law spouse has no parent and isn't the root. */
  function isBloodMember(pid){
    var p = getPerson(pid);
    return !!p && (pid === state.rootId || p.parentId != null);
  }
  /* Given the card the user clicked +child on, resolve where the child must
     actually attach and whose name the nasab uses:
       - anchorId: the couple's blood-line member, so the child RENDERS (renderUnit
         only shows the primary member's childrenIds — a child hung off an in-law
         spouse would be invisible).
       - fatherId: the male of the couple, because a child is nasab'd to the FATHER,
         not to whichever parent's card was tapped. */
  function coupleContext(clickedId){
    var clicked = getPerson(clickedId);
    var spId = (clicked.spouseIds && clicked.spouseIds[0]) || null;
    var sp = spId ? getPerson(spId) : null;
    var anchorId = clickedId;
    if(sp && !isBloodMember(clickedId) && isBloodMember(spId)) anchorId = spId; // tapped the in-law
    var fatherId = clicked.gender === 'm' ? clickedId : (sp && sp.gender === 'm' ? spId : null);
    return { anchorId: anchorId, fatherId: fatherId };
  }

  function addChild(parentId, name, gender){
    var child = newPerson(name, gender, parentId);
    state.people[child.id] = child;
    getPerson(parentId).childrenIds.push(child.id);
    scheduleSave(); render();
    logActivity('add', nameStr(name));
  }

  function addSpouse(personId, name, gender){
    var sp = newPerson(name, gender, null);
    state.people[sp.id] = sp;
    getPerson(personId).spouseIds.push(sp.id);
    sp.spouseIds.push(personId);
    scheduleSave(); render();
    logActivity('add', nameStr(name));
  }

  function updatePerson(id, data){
    var p = getPerson(id);
    var changed = [];
    if(JSON.stringify(p.name) !== JSON.stringify(data.name)) changed.push('الاسم');
    if(p.gender !== data.gender) changed.push('النوع');
    if((p.birthDate || null) !== (data.birthDate || null)) changed.push('تاريخ الميلاد');
    if((p.deathDate || null) !== (data.deathDate || null)) changed.push('تاريخ الوفاة');
    if((p.residence || '') !== (data.residence || '')) changed.push('مكان الإقامة');
    if((p.bio || '') !== (data.bio || '')) changed.push('النبذة');
    if(data.photo !== undefined && p.photo !== data.photo) changed.push('الصورة');

    p.name = data.name; p.gender = data.gender;
    p.birthDate = data.birthDate || null;
    if(data.deathDate !== undefined) p.deathDate = data.deathDate || null;
    p.residence = data.residence || '';
    p.bio = data.bio || '';
    if(data.photo !== undefined) p.photo = data.photo;
    scheduleSave(); render();
    if(changed.length){ logActivity('edit', nameStr(data.name), changed.join('، ')); }
  }

  function countDescendants(id){
    var p = getPerson(id), n = 0;
    (p.childrenIds || []).forEach(function(cid){ n += 1 + countDescendants(cid); });
    return n;
  }

  function deletePerson(id){
    var p = getPerson(id);
    if(!p) return;
    var deletedName = nameStr(p.name);
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

  /* ---- Hidden-records maintenance ----
     The tree renders by walking childrenIds from the root (spouses shown beside
     their partner). Records whose parent link desynced during an old import have
     no card, so they cannot be managed from the tree. This surfaces them in a
     list so the owner can Show (relink) the real ones and Delete the duplicates. */
  function computeVisibleMap(){
    var vis = {};
    function walk(id){
      var p = getPerson(id); if(!p || vis[id]) return;
      vis[id] = true;
      (p.spouseIds || []).forEach(function(s){ if(getPerson(s)) vis[s] = true; });
      (p.childrenIds || []).forEach(walk);
    }
    if(state.rootId) walk(state.rootId);
    return vis;
  }
  function hiddenIds(){
    var vis = computeVisibleMap();
    return Object.keys(state.people).filter(function(id){ return !vis[id]; });
  }
  // Make one hidden record appear in the tree by repairing its link to a VISIBLE
  // ancestor: link to its parent if the parent is visible; if the parent is a
  // hidden in-law, hang it on the parent's visible spouse; else restore the
  // parent first. Falls back to attaching under the root.
  function restorePerson(id, guard){
    var p = getPerson(id); if(!p) return;
    guard = guard || 0; if(guard > 64) return;
    var vis = computeVisibleMap();
    var parent = p.parentId ? getPerson(p.parentId) : null;
    if(parent){
      if(vis[p.parentId]){
        if(parent.childrenIds.indexOf(id) === -1) parent.childrenIds.push(id);
      } else {
        var bloodSpouse = (parent.spouseIds || []).filter(function(s){ return vis[s]; })[0];
        if(bloodSpouse){
          p.parentId = bloodSpouse;
          var bs = getPerson(bloodSpouse);
          if(bs.childrenIds.indexOf(id) === -1) bs.childrenIds.push(id);
        } else {
          restorePerson(p.parentId, guard + 1);
          if(parent.childrenIds.indexOf(id) === -1) parent.childrenIds.push(id);
        }
      }
    } else if(state.rootId && state.rootId !== id){
      p.parentId = state.rootId;
      var root = getPerson(state.rootId);
      if(root.childrenIds.indexOf(id) === -1) root.childrenIds.push(id);
    }
    scheduleSave(); render();
  }
  function directChildCount(id){
    return Object.keys(state.people).filter(function(k){ return state.people[k].parentId === id; }).length;
  }
  function showHiddenReview(){
    var hidden = hiddenIds();
    var body;
    if(!hidden.length){
      body = '<div class="context">' + t('hiddenNone') + '</div>';
    } else {
      body = hidden.map(function(id){
        var p = getPerson(id);
        var parent = p.parentId ? getPerson(p.parentId) : null;
        var kids = directChildCount(id);
        return '<div class="hidden-row">' +
          '<div class="hidden-info"><b>' + escapeHtml(nameStr(p.name)) + '</b>' +
          (parent ? '<span class="hidden-dim"> — ' + t('hiddenUnder') + ' ' + escapeHtml(nameStr(parent.name)) + '</span>' : '') +
          (kids ? '<span class="hidden-dim"> · ' + kids + ' ' + t('hiddenKids') + '</span>' : '') +
          '</div>' +
          '<div class="hidden-btns">' +
            '<button class="hidden-show" data-show="' + id + '">' + t('hiddenShow') + '</button>' +
            '<button class="hidden-del" data-del="' + id + '">' + t('hiddenDelete') + '</button>' +
          '</div></div>';
      }).join('');
    }
    openSheet('<h3>' + t('hiddenTitle') + ' (' + hidden.length + ')</h3>' +
      '<div class="context">' + t('hiddenDesc') + '</div>' +
      '<div class="hidden-list">' + body + '</div>');
    sheetBody.querySelectorAll('[data-show]').forEach(function(b){
      b.onclick = function(){ restorePerson(b.getAttribute('data-show')); showHiddenReview(); };
    });
    sheetBody.querySelectorAll('[data-del]').forEach(function(b){
      b.onclick = function(){
        var id = b.getAttribute('data-del');
        if(directChildCount(id) > 0 && !confirm(t('hiddenDelKids'))) return;
        deletePerson(id); showHiddenReview();
      };
    });
  }
  window.__ftShowHiddenReview = showHiddenReview;

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
    var deceased = !!p.deathDate;
    el.className = 'card ' + (p.gender === 'f' ? 'female' : 'male') + (deceased ? ' deceased' : '');
    el.style.borderTopColor = genColors[depth % genColors.length];
    el.dataset.id = id;
    var childCount = p.childrenIds.length;
    var age = calcAge(p.birthDate);
    var lifespan = deceased ? lifespanText(p.birthDate, p.deathDate) : '';
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
      '<div class="name">'+escapeHtml(fullNameOf(p))+'</div>' +
      (deceased ? '<div class="mem-tag">🕊 '+t('inMemory')+(lifespan ? ' · '+escapeHtml(lifespan) : '')+'</div>' : '') +
      '<div class="gen-badge">'+genLabel(depth)+'</div>' +
      (!deceased && age !== null ? '<div class="meta-line">🎂 '+ageText(age)+'</div>' : '') +
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
      titleEl2.textContent = famNameOf() || t('appName');
      return;
    }
    emptyWrap.style.display = 'none'; canvas.style.display = 'block'; toolbar.style.display = 'flex';

    var treeRoot = document.getElementById('treeRoot');
    treeRoot.innerHTML = '';
    treeRoot.appendChild(renderUnit(state.rootId));
    document.getElementById('familyTitle').textContent = famNameOf() || t('appName');
    /* Title centered above the root couple, inside the canvas — so it scales and
       stays above the grandparents as the tree is zoomed. */
    var treeTitle = document.getElementById('treeTitle');
    if(treeTitle){
      var famName = famNameOf().trim();
      // Always show the word "tree" so the screen reads clearly as a family TREE.
      treeTitle.textContent = famName ? (state.lang === 'en' ? (famName + ' Tree') : ('شجرة ' + famName)) : '';
    }

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
      if(!p.photo) return tf('completionHintMissingPhoto', {name: escapeHtml(fullNameOf(p))});
      if(!p.birthDate) return tf('completionHintMissingBirth', {name: escapeHtml(fullNameOf(p))});
    }
    return t('completionHintDone');
  }

  function occasionRowHtml(o){
    var p = getPerson(o.id); if(!p) return '';
    var female = p.gender === 'f';
    var icon = o.type === 'memorial' ? '🕊' : '🎂';
    var when = o.daysUntil === 0
      ? (o.type === 'memorial' ? t(female ? 'occMemorialTodayF' : 'occMemorialToday')
                               : t(female ? 'occBirthdayTodayF' : 'occBirthdayToday'))
      : tf('occInDays', { n: localeDigits(o.daysUntil) });
    var extra = o.type === 'memorial'
      ? t('occMemorialTag') + ' · ' + tf('occYearsSince', { n: localeDigits(o.years) })
      : tf('occTurning', { n: localeDigits(o.years) });
    var btn = o.type === 'memorial'
      ? '<button class="occ-greet" data-greet="'+escapeHtml(o.id)+'" data-otype="memorial">'+t('occDuaBtn')+'</button>'
      : '<button class="occ-greet" data-greet="'+escapeHtml(o.id)+'" data-otype="birthday">'+t('occGreetBtn')+'</button>';
    return '<div class="occ-row">'+
        '<div class="occ-main" data-profile="'+escapeHtml(o.id)+'">'+
          '<span class="occ-ic">'+icon+'</span>'+
          '<div class="occ-text"><b>'+escapeHtml(fullNameOf(p))+'</b>'+
            '<span class="occ-when">'+when+' · '+escapeHtml(extra)+'</span>'+
            '<span class="occ-date">'+escapeHtml(fmtDate(o.dateStr))+'</span>'+
          '</div>'+
        '</div>'+ btn +
      '</div>';
  }

  function occasionsCardHtml(){
    var occ = (window.ftOccasions ? window.ftOccasions(state.people || {}, new Date(), 30) : []);
    var body;
    if(!occ.length){
      body = '<div class="occ-empty">'+t('todayEmpty')+
             '<button class="occ-adddates" data-go="adddates">'+t('todayAddDates')+'</button></div>';
    } else {
      var todayItems = occ.filter(function(o){ return o.daysUntil === 0; });
      var soonItems  = occ.filter(function(o){ return o.daysUntil > 0; });
      body = '';
      if(todayItems.length) body += '<div class="occ-sub">'+t('todaySectionToday')+'</div>' + todayItems.map(occasionRowHtml).join('');
      if(soonItems.length)  body += '<div class="occ-sub">'+t('todaySectionSoon')+'</div>' + soonItems.map(occasionRowHtml).join('');
    }
    return '<div class="occ-card"><div class="occ-head">'+t('todayTitle')+'</div>'+body+'</div>';
  }

  function wireOccasionsCard(host){
    host.querySelectorAll('.occ-main[data-profile]').forEach(function(el){
      el.onclick = function(){ openProfile(el.getAttribute('data-profile')); };
    });
    host.querySelectorAll('.occ-greet[data-greet]').forEach(function(btn){
      btn.onclick = function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-greet');
        var p = getPerson(id); if(!p) return;
        var key = btn.getAttribute('data-otype') === 'memorial' ? 'greetMemorial' : 'greetBirthday';
        var msg = tf(key, { name: fullNameOf(p) });
        showTab('moments');
        setTimeout(function(){
          var ta = document.getElementById('momentText');
          if(ta){ ta.value = msg; ta.focus(); }
        }, 120);
      };
    });
    var addBtn = host.querySelector('.occ-adddates[data-go="adddates"]');
    if(addBtn) addBtn.onclick = function(){ showAddDates(); };
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
    var fam = famNameOf().trim() ? famNameOf() : t('unnamedFamily');
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
        occasionsCardHtml() +
        '<div class="section-eyebrow"><span class="dia">◆</span><span>'+t('homeSectionsEyebrow')+'</span></div>' +
        '<div class="grid">' +
          '<div class="leaf tree" data-go="tree"><span class="corner">۞</span><div class="ic">🌳</div><h3>'+t('cardTree')+'</h3><p>'+t('cardTreeSub')+'</p></div>' +
          '<div class="leaf feed" data-go="moments"><span class="corner">۞</span><div class="ic">📰</div><h3>'+t('cardFeed')+'</h3><p>'+t('cardFeedSub')+'</p></div>' +
          '<div class="leaf activity" data-go="activity"><span class="corner">۞</span><div class="ic">📋</div><h3>'+t('cardActivity')+'</h3><p>'+t('cardActivitySub')+'</p></div>' +
          '<div class="leaf members" data-go="members"><span class="corner">۞</span><div class="ic">👥</div><h3>'+t('cardMembers')+'</h3><p>'+t('cardMembersSub')+'</p></div>' +
          '<div class="leaf stats" data-go="stats"><span class="corner">۞</span><div class="ic">📊</div><h3>'+t('cardStats')+'</h3><p>'+t('cardStatsSub')+'</p></div>' +
        '</div>' +
        '<div class="home-search"><input type="text" id="homeSearch" placeholder="'+escapeHtml(t('searchPlaceholder'))+'"><div class="home-search-results" id="homeSearchResults"></div></div>' +
        '<div class="meter-card">' +
          '<div class="meter-top"><h3>'+t('completionTitle')+'</h3><b>'+localeDigits(pct)+'%</b></div>' +
          '<div class="bar"><i style="width:'+pct+'%"></i></div>' +
          '<div class="meter-hint"><span class="dot">◆</span><span>'+hint+'</span></div>' +
        '</div>' +
      '</div>';

    host.querySelector('[data-go="tree"]').onclick = function(){ showTab('tree'); };
    host.querySelector('[data-go="moments"]').onclick = function(){ showTab('moments'); };
    host.querySelector('[data-go="activity"]').onclick = function(){
      if(window.__ftCloud && window.__ftCloud.showActivityLog) window.__ftCloud.showActivityLog(); else toast(t('comingSoon'));
    };
    host.querySelector('[data-go="members"]').onclick = function(){
      if(window.__ftCloud && window.__ftCloud.showMembers) window.__ftCloud.showMembers(); else toast(t('comingSoon'));
    };
    host.querySelector('[data-go="stats"]').onclick = function(){ showStats(); };
    wireOccasionsCard(host);

    // Live people search: type a name → matching people → tap to jump to the card.
    var searchInput = document.getElementById('homeSearch');
    var resultsEl = document.getElementById('homeSearchResults');
    searchInput.addEventListener('input', function(){
      var q = this.value.trim().toLowerCase();
      resultsEl.innerHTML = '';
      if(!q) return;
      var matches = ids.filter(function(id){ return fullNameOf(ppl[id]).toLowerCase().indexOf(q) !== -1; });
      // Rank: the earlier the match sits in the name, the higher — so a person
      // whose FIRST name is the query (position 0) beats one who only carries it
      // in the nasab. Ties break alphabetically (Arabic-aware).
      matches.sort(function(a, b){
        var na = fullNameOf(ppl[a]).toLowerCase(), nb = fullNameOf(ppl[b]).toLowerCase();
        var ia = na.indexOf(q), ib = nb.indexOf(q);
        if(ia !== ib) return ia - ib;
        return na.localeCompare(nb, 'ar');
      });
      matches = matches.slice(0, 8);
      if(!matches.length){ resultsEl.innerHTML = '<div class="hs-empty">'+t('searchNoResults')+'</div>'; return; }
      resultsEl.innerHTML = matches.map(function(id){
        return '<div class="hs-result" data-id="'+escapeHtml(id)+'"><span class="hs-av">'+(ppl[id].gender==='f'?'👩':'👨')+'</span>'+escapeHtml(fullNameOf(ppl[id]))+'</div>';
      }).join('');
      resultsEl.querySelectorAll('.hs-result').forEach(function(r){ r.onclick = function(){ focusPerson(r.getAttribute('data-id')); }; });
    });
  }
  /* Jump to a person's card on the tree and flash it. */
  function focusPerson(id){
    var p = getPerson(id);
    if(!p){ toast(t('personNotShown')); return; }
    // Expand any collapsed ancestor so the target actually becomes visible
    // (collapsed branches render hidden, so scrolling to them does nothing).
    var changed = false, cur = getPerson(p.parentId), guard = 0;
    while(cur && guard++ < 128){ if(cur.collapsed){ cur.collapsed = false; changed = true; } cur = getPerson(cur.parentId); }
    if(changed){ scheduleSave(); render(); }
    showTab('tree');
    setTimeout(function(){
      var sel = '.card[data-id="'+(window.CSS && CSS.escape ? CSS.escape(id) : id)+'"]';
      var card = document.querySelector(sel);
      if(!card){ toast(t('personNotShown')); return; }   // disconnected/orphan record
      card.scrollIntoView({ behavior:'smooth', block:'center', inline:'center' });
      card.classList.add('kin-a');
      setTimeout(function(){ card.classList.remove('kin-a'); }, 1800);
    }, 120);
  }
  window.__ftRenderHome = renderHome;

  function showAddDates(){
    var missing = Object.keys(state.people).filter(function(id){ return !state.people[id].birthDate; });
    var rows = missing.map(function(id){
      return '<div class="adddate-row">'+
        '<span class="adddate-name">'+escapeHtml(fullNameOf(getPerson(id)))+'</span>'+
        '<input type="date" class="adddate-input" data-id="'+escapeHtml(id)+'">'+
      '</div>';
    }).join('');
    openSheet('<h3>'+t('addDatesTitle')+'</h3>'+
      '<div class="context">'+t('addDatesDesc')+'</div>'+
      '<div class="adddate-list">'+(missing.length ? rows : '<div class="context">'+t('addDatesNone')+'</div>')+'</div>');
    sheetBody.querySelectorAll('.adddate-input').forEach(function(inp){
      inp.onchange = function(){
        var id = inp.getAttribute('data-id'); var v = inp.value;
        if(!v) return;
        var p = getPerson(id); if(!p) return;
        p.birthDate = v; scheduleSave();
        var row = inp.parentNode; if(row) row.classList.add('saved');
        if(window.__ftRenderHome) renderHome();
      };
    });
  }
  window.__ftShowAddDates = showAddDates;

  function statTile(label, value, sub){
    return '<div class="stat-tile"><div class="stat-val">'+value+'</div>'+
      '<div class="stat-label">'+label+'</div>'+
      (sub ? '<div class="stat-sub">'+sub+'</div>' : '')+'</div>';
  }
  function showStats(){
    if(!window.ftStats){ toast(t('comingSoon')); return; }
    var s = window.ftStats(state.people || {}, new Date());
    var body;
    if(!s.total){
      body = '<div class="context">'+t('statsEmpty')+'</div>';
    } else {
      var nm = function(id){ var p = getPerson(id); return p ? escapeHtml(fullNameOf(p)) : '—'; };
      var d = localeDigits;
      var tiles = [
        statTile(t('statsTotal'), d(s.total)),
        statTile(t('statsGenerations'), d(s.generations)),
        statTile(t('statsMales'), d(s.males)),
        statTile(t('statsFemales'), d(s.females)),
        statTile(t('statsLiving'), d(s.living)),
        statTile(t('statsDeceased'), d(s.deceased))
      ];
      if(s.avgAge != null) tiles.push(statTile(t('statsAvgAge'), tf('statsYearsVal', { n: d(s.avgAge) })));
      if(s.oldest) tiles.push(statTile(t('statsOldest'), tf('statsYearsVal', { n: d(s.oldest.age) }), nm(s.oldest.id)));
      if(s.youngest) tiles.push(statTile(t('statsYoungest'), tf('statsYearsVal', { n: d(s.youngest.age) }), nm(s.youngest.id)));
      if(s.mostChildren) tiles.push(statTile(t('statsMostChildren'), tf('statsChildrenVal', { n: d(s.mostChildren.count) }), nm(s.mostChildren.id)));
      if(s.topCity) tiles.push(statTile(t('statsTopCity'), escapeHtml(s.topCity.city), d(s.topCity.count)));
      tiles.push(statTile(t('statsWithBirth'), d(s.withBirthDate)));
      tiles.push(statTile(t('statsWithPhoto'), d(s.withPhoto)));
      body = '<div class="stats-grid">'+tiles.join('')+'</div>';
    }
    openSheet('<h3>'+t('statsTitle')+'</h3>'+body);
  }
  window.__ftShowStats = showStats;

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
    var fam = famNameOf().trim() ? famNameOf() : t('unnamedFamily');
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


  /* ---- Person profile sheet (tap a card) ---- */
  function relRow(labelKey, people){
    var items = (people || []).filter(Boolean);
    if(!items.length) return '';
    var chips = items.map(function(pp){
      return '<button class="rel-chip" data-profile="'+escapeHtml(pp.id)+'">'+escapeHtml(fullNameOf(pp))+'</button>';
    }).join('');
    return '<div class="prof-rel"><span class="prof-rel-lbl">'+t(labelKey)+'</span><div class="prof-rel-chips">'+chips+'</div></div>';
  }
  function openProfile(id){
    var p = getPerson(id); if(!p) return;
    var other = ownName(p, state.lang === 'ar' ? 'en' : 'ar');
    var deceased = !!p.deathDate;
    var av = p.photo ? '<img src="'+escapeHtml(p.photo)+'" alt="">' : (p.gender==='f' ? '👩' : '👨');
    var lines = '';
    if(p.birthDate) lines += '<div class="prof-line">🎂 <b>'+t('profileBirth')+':</b> '+escapeHtml(fmtDate(p.birthDate))+
      (!deceased && ageYears(p.birthDate)!==null ? ' <span class="prof-dim">('+t('profileAge')+' '+escapeHtml(ageText(ageYears(p.birthDate)))+')</span>' : '')+'</div>';
    if(deceased) lines += '<div class="prof-line">🕊 <b>'+t('profileDeath')+':</b> '+escapeHtml(fmtDate(p.deathDate))+' · '+t('inMemory')+
      (lifespanText(p.birthDate,p.deathDate) ? ' <span class="prof-dim">('+escapeHtml(lifespanText(p.birthDate,p.deathDate))+')</span>' : '')+'</div>';
    if(p.residence) lines += '<div class="prof-line">📍 '+escapeHtml(p.residence)+'</div>';
    if(p.bio) lines += '<div class="prof-bio">'+escapeHtml(p.bio)+'</div>';
    var spouses = (p.spouseIds||[]).map(getPerson);
    var children = (p.childrenIds||[]).map(getPerson);
    var actions = canEditCloud
      ? '<button class="primary-btn" id="prof_edit">✎ '+t('profileEdit')+'</button>'+
        '<button class="primary-btn" id="prof_addchild" style="background:var(--teal);">＋ '+t('profileAddChild')+'</button>'
      : '';
    openSheet(
      '<div class="prof-head"><div class="prof-av">'+av+'</div>'+
        '<div><div class="prof-name">'+escapeHtml(fullNameOf(p))+'</div>'+
        (other ? '<div class="prof-name-alt">'+escapeHtml(other)+'</div>' : '')+
        '<div class="gen-badge">'+genLabel(genOfPerson(id))+'</div></div></div>'+
      '<div class="prof-body">'+ (lines||'') +
        relRow('relFather', [fatherOfPerson(p)]) +
        relRow('relMother', [motherOfPerson(p)]) +
        relRow('relSpouse', spouses) +
        relRow('relChildren', children) +
      '</div>'+
      '<div class="prof-actions">'+actions+
        '<button class="primary-btn" id="prof_kin" style="background:var(--plum);">🔗 '+t('profileKinship')+'</button>'+
      '</div>'
    );
    sheetBody.querySelectorAll('[data-profile]').forEach(function(b){ b.onclick = function(){ openProfile(b.getAttribute('data-profile')); }; });
    var pe = document.getElementById('prof_edit'); if(pe) pe.onclick = function(){ openPersonForm('edit', id); };
    var pa = document.getElementById('prof_addchild'); if(pa) pa.onclick = function(){ openPersonForm('child', id); };
    document.getElementById('prof_kin').onclick = function(){ closeSheet(); startKinship(); };
  }

  function openPersonForm(mode, targetId){
    var isEdit = mode === 'edit';
    var target = getPerson(targetId);
    var titleTxt = mode === 'child' ? t('addChildTitle') : (mode === 'spouse' ? t('addSpouseTitle') : t('editTitle'));
    var contextTxt = mode === 'child' ? tf('contextChild', {name: escapeHtml(fullNameOf(target))})
      : mode === 'spouse' ? tf('contextSpouse', {name: escapeHtml(fullNameOf(target))})
      : tf('contextEdit', {name: escapeHtml(fullNameOf(target))});

    openSheet(
      '<h3>'+titleTxt+'</h3>'+
      '<div class="context">'+contextTxt+'</div>'+
      '<div class="field"><label>'+(mode==='child' ? t('firstNameLabel') : t('nameLabel'))+' (عربي)</label><input type="text" id="pf_name_ar" dir="rtl" placeholder="'+(mode==='child' ? t('firstNamePh') : t('namePh'))+'" value="'+(isEdit ? escapeHtml(ownName(target,'ar')) : '')+'"></div>'+
      '<div class="field"><label>'+t('nameEnLabel')+'</label><input type="text" id="pf_name_en" dir="ltr" placeholder="e.g. Khaled" value="'+(isEdit ? escapeHtml(ownName(target,'en')) : '')+'"></div>'+
      (mode==='child' ? '<div class="name-preview" id="pf_fullPreview"></div>' : '')+
      '<div class="field"><label>'+t('genderLabel')+'</label>'+
        '<div class="gender-toggle">'+
          '<button type="button" id="pf_male" class="'+(!isEdit || target.gender==='m' ? 'active-m':'')+'">'+t('male')+'</button>'+
          '<button type="button" id="pf_female" class="'+(isEdit && target.gender==='f' ? 'active-f':'')+'">'+t('female')+'</button>'+
        '</div>'+
      '</div>'+
      (isEdit ? photoRowHtml(target.photo) : '') +
      (isEdit ? '<div class="field"><label>'+t('birthLabel')+'</label><input type="date" id="pf_birth" value="'+escapeHtml(target.birthDate||'')+'"></div>' : '') +
      (isEdit ? '<div class="field"><label>'+t('deathLabel')+'</label><input type="date" id="pf_death" value="'+escapeHtml(target.deathDate||'')+'"></div>' : '') +
      (isEdit ? '<div class="field"><label>'+t('residenceLabel')+'</label><input type="text" id="pf_residence" placeholder="'+t('residencePh')+'" value="'+escapeHtml(target.residence||'')+'"></div>' : '') +
      (isEdit ? '<div class="field"><label>'+t('bioLabel')+'</label><textarea id="pf_bio" rows="3" placeholder="'+t('bioPh')+'">'+escapeHtml(target.bio||'')+'</textarea></div>' : '') +
      (mode === 'child' ? '<div class="keep-open-row"><input type="checkbox" id="pf_keep" checked><label for="pf_keep">'+t('keepAdding')+'</label></div>' : '') +
      '<button class="primary-btn" id="pf_save">'+t('saveBtn')+'</button>'
    );

    var gender = isEdit ? target.gender : 'm';
    document.getElementById('pf_male').onclick = function(){ gender='m'; this.className='active-m'; document.getElementById('pf_female').className=''; };
    document.getElementById('pf_female').onclick = function(){ gender='f'; this.className='active-f'; document.getElementById('pf_male').className=''; };
    if(isEdit) wirePhotoRow(target.photo);
    /* A child is nasab'd to the FATHER and attached to the couple's blood-line
       member (so it renders) — never to whichever card was tapped. */
    var childCtx = mode === 'child' ? coupleContext(targetId) : null;
    var fatherPerson = (childCtx && childCtx.fatherId) ? getPerson(childCtx.fatherId) : null;
    var arIn = document.getElementById('pf_name_ar');
    var enIn = document.getElementById('pf_name_en');
    // English follows the Arabic transliteration until the user edits it by hand.
    var enTouched = isEdit && !!ownName(target, 'en');
    enIn.addEventListener('input', function(){ enTouched = true; });
    function refreshName(){
      if(!enTouched) enIn.value = window.ftTranslit ? window.ftTranslit(arIn.value) : arIn.value;
      if(mode === 'child'){
        var preview = document.getElementById('pf_fullPreview'); if(!preview) return;
        if(!fatherPerson){ preview.textContent = t('childNeedsFather'); return; }
        var chain = fullNameOf(fatherPerson);            // father's full nasab (current language)
        var full = [arIn.value.trim()].concat(chain ? chain.split(' ') : []).filter(Boolean).join(' ');
        preview.textContent = arIn.value.trim() ? (t('fullNamePreview') + ' ' + full) : '';
      }
    }
    arIn.addEventListener('input', refreshName);
    refreshName();
    arIn.focus();

    document.getElementById('pf_save').onclick = function(){
      var ar = document.getElementById('pf_name_ar').value.trim();
      var en = document.getElementById('pf_name_en').value.trim();
      if(!ar || !en){ toast(t('toastNameRequired')); return; }
      var nm = { ar: ar, en: en };
      if(mode === 'child'){
        // A child's stored name is the full nasab: first name + the father's full name.
        var fAr = fatherPerson ? ownName(fatherPerson, 'ar') : '';
        var fEn = fatherPerson ? ownName(fatherPerson, 'en') : '';
        addChild(childCtx.anchorId, {
          ar: (fAr ? (ar + ' ' + fAr) : ar).trim(),
          en: (fEn ? (en + ' ' + fEn) : en).trim()
        }, gender);
      }
      else if(mode === 'spouse') addSpouse(targetId, nm, gender);
      else {
        updatePerson(targetId, {
          name: nm, gender: gender,
          birthDate: document.getElementById('pf_birth').value || null,
          deathDate: document.getElementById('pf_death').value || null,
          residence: document.getElementById('pf_residence').value.trim(),
          bio: document.getElementById('pf_bio').value.trim(),
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
      '<h3>'+tf('deleteTitle', {name: escapeHtml(fullNameOf(p))})+'</h3>'+
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
        '<div class="kin-name">'+dotB+'<b>'+escapeHtml(fullNameOf(B))+'</b> <span class="kin-verb">'+verb+'</span></div>'+
        '<div class="kin-term">'+escapeHtml(rel)+'</div>'+
        '<div class="kin-name">'+t('kinshipTo')+' '+dotA+'<b>'+escapeHtml(fullNameOf(A))+'</b></div>'+
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
    if(!btn){
      // Tapping the card body (not an action control) opens the person profile.
      var card = e.target.closest('.card');
      if(card && card.dataset.id) openProfile(card.dataset.id);
      return;
    }
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
    if(typeof state.familyName!=='object'||!state.familyName) state.familyName={ar:'',en:''};
    state.familyName[state.lang] = v;
    titleEl.textContent = v; scheduleSave();
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
    a.href = url; a.download = (famNameOf() || t('appName')) + '.json';
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
      '<button class="primary-btn" id="mn_export" style="margin-bottom:10px;">'+t('menuExport')+'</button>'+
      (canEditCloud ? '<button class="primary-btn" id="mn_import" style="margin-bottom:10px; background:var(--teal);">'+t('menuImport')+'</button>' : '') +
      (canEditCloud ? '<button class="primary-btn" id="mn_hidden" style="margin-bottom:10px; background:var(--plum);">'+t('menuHidden')+'</button>' : '') +
      (canEditCloud ? '<button class="primary-btn" id="mn_reset" style="background:var(--danger);">'+t('menuReset')+'</button>' : '') +
      (canEditCloud && window.__ftCloud ? '<button class="primary-btn" id="mn_invite" style="margin-top:10px; background:var(--teal);">'+t('menuInvite')+'</button>' : '')
    );
    document.getElementById('mn_export').onclick = function(){ closeSheet(); document.getElementById('exportBtn').click(); };
    if(canEditCloud){
      document.getElementById('mn_import').onclick = function(){ closeSheet(); document.getElementById('importBtn').click(); };
      document.getElementById('mn_hidden').onclick = function(){ showHiddenReview(); };
      document.getElementById('mn_reset').onclick = function(){ closeSheet(); document.getElementById('resetBtn').click(); };
    }
    if(canEditCloud && window.__ftCloud && window.__ftCloud.createInvite){
      var invBtn = document.getElementById('mn_invite');
      if(invBtn) invBtn.onclick = function(){ closeSheet(); window.__ftCloud.createInvite('editor'); };
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
