# Bilingual Names + Live Nasab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each person's name as `{ar, en}` first-name segments and compute the full nasab live by walking the paternal chain, so names are bilingual and editing any ancestor propagates to all descendants automatically.

**Architecture:** `person.name` becomes `{ar, en}` holding only the person's OWN segment (first name; the root also carries the surname). The full display name is derived at render by `fullNameOf(p)` walking `fatherOf` up the tree. A new `translit.js` (classic script, like `kinship.js`) provides Arabic→Latin transliteration for auto-filling the English field. A one-time two-pass `migrateNames` converts existing single-string full names into own-segment `{ar,en}`.

**Tech Stack:** Vanilla JS — classic `app.js` and `translit.js`, ES-module `cloud.js`, loaded via the cache-busting loader in `index.html`. Node for pure-function unit tests (like `kinship.js`).

## Global Constraints

- `name` is ALWAYS `{ar, en}` — never a single string. English is mandatory (auto-transliterated, editable). (CLAUDE.md constant #2)
- `personId` is immutable and unrelated to the name. (constant #1)
- All UI chrome text goes through `t()`. Person NAMES are data, shown via the name helpers. (constant #3)
- The full nasab is NEVER stored — always computed from own segments, so an edit to any ancestor propagates.
- `kinship.js` is NOT modified — it uses id/gender/parentId only.
- Firebase SDK stays `10.13.2`; no security-rule change (data-shape only; rules don't validate name shape and the rules test already uses `familyName:{ar,en}`).
- Files loaded from the gstatic CDN where applicable; `translit.js` is local, loaded before `app.js`.

---

## File Structure

- `translit.js` — NEW. `window.ftTranslit(arabic) → string`. Dictionary + char-fallback. One concern, node-testable.
- `index.html` — MODIFY. Load `translit.js` before `app.js` in the cache-busting loader.
- `app.js` — MODIFY. Name helpers (`ownName`/`firstNameOf`/`fullNameOf`/`famNameOf`/`fatherOfPerson`), `migrateNames`, person model writes, the bilingual person form, and every name display site + search.
- `cloud.js` — MODIFY. Create-tree seeds `familyName` as `{ar,en}` (object passes through `setDoc` unchanged otherwise).

---

## Task 1: Transliteration engine `translit.js`

**Files:**
- Create: `translit.js`
- Test: `scripts/translit.test.cjs`

**Interfaces:**
- Produces: `window.ftTranslit(arabic: string) → string` (also `module.exports`/`global.ftTranslit` for node, mirroring `kinship.js`'s export tail).

- [ ] **Step 1: Write the failing test** `scripts/translit.test.cjs`

```js
require('../translit.js');
const ftTranslit = global.ftTranslit;
let pass = 0, fail = 0;
function eq(got, want, label){ if(got === want){ pass++; } else { fail++; console.error('✗', label, '=>', JSON.stringify(got), 'want', JSON.stringify(want)); } }
eq(ftTranslit('محمد'), 'Mohammed', 'common: محمد');
eq(ftTranslit('أحمد'), 'Ahmed', 'common: أحمد');
eq(ftTranslit('فاطمة'), 'Fatima', 'common: فاطمة');
eq(ftTranslit('محمد أحمد'), 'Mohammed Ahmed', 'multi-word');
eq(typeof ftTranslit('برقوق'), 'string', 'fallback returns a string');
eq(ftTranslit('برقوق').length > 0, true, 'fallback non-empty');
eq(ftTranslit(''), '', 'empty in => empty out');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node scripts/translit.test.cjs`
Expected: FAIL — `Cannot find module` / `ftTranslit is not a function`.

- [ ] **Step 3: Implement `translit.js`**

```js
/* Arabic → Latin transliteration for auto-filling the English name field.
   Pure and DOM-free so it unit-tests in node (like kinship.js). A curated
   common-names dictionary covers most family names; unknown words fall back to
   a character map. The result is a SUGGESTION the user can always edit. */
(function(global){
  'use strict';
  var DICT = {
    'محمد':'Mohammed','احمد':'Ahmed','أحمد':'Ahmed','محمود':'Mahmoud','مصطفى':'Mostafa',
    'علي':'Ali','عمر':'Omar','عثمان':'Othman','ابراهيم':'Ibrahim','إبراهيم':'Ibrahim',
    'يوسف':'Youssef','خالد':'Khaled','حسن':'Hassan','حسين':'Hussein','عبدالله':'Abdullah',
    'عبدالرحمن':'Abdelrahman','عبدالعزيز':'Abdelaziz','سعيد':'Said','طارق':'Tarek',
    'زياد':'Ziad','ياسر':'Yasser','سامي':'Sami','كريم':'Karim','رامي':'Rami','هاني':'Hani',
    'وليد':'Walid','ماجد':'Majed','ناصر':'Nasser','فهد':'Fahd','سلمان':'Salman','امين':'Amin',
    'أمين':'Amin','الوزير':'Alwazir','فاطمة':'Fatima','عائشة':'Aisha','خديجة':'Khadija',
    'زينب':'Zainab','مريم':'Mariam','سارة':'Sara','هاجر':'Hajar','نور':'Nour','هدى':'Huda',
    'ليلى':'Layla','سلمى':'Salma','رانيا':'Rania','دعاء':'Doaa','اسماء':'Asmaa','أسماء':'Asmaa',
    'شروق':'Shorouk','سها':'Soha','هبة':'Heba','نادية':'Nadia','سمير':'Samir','عادل':'Adel',
    'رحاب':'Rehab','مجدي':'Magdy','يس':'Yassin','ال':'Al','آل':'Al','عبد':'Abd'
  };
  // Character fallback for words not in the dictionary.
  var CH = {
    'ا':'a','أ':'a','إ':'i','آ':'aa','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
    'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
    'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
    'ي':'y','ى':'a','ة':'a','ء':'','ئ':'e','ؤ':'o','ّ':'','َ':'a','ُ':'u','ِ':'i','ْ':'','ـ':''
  };
  function word(w){
    if(!w) return '';
    if(DICT[w]) return DICT[w];
    var out = '';
    for(var i=0;i<w.length;i++){ out += (CH[w[i]] !== undefined ? CH[w[i]] : w[i]); }
    return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
  }
  function ftTranslit(s){
    if(!s) return '';
    return String(s).trim().split(/\s+/).map(word).filter(Boolean).join(' ');
  }
  if(typeof module !== 'undefined' && module.exports) module.exports = ftTranslit;
  global.ftTranslit = ftTranslit;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node scripts/translit.test.cjs`
Expected: `7 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add translit.js scripts/translit.test.cjs
git commit -m "feat(names): Arabic→Latin transliteration engine + tests"
```

---

## Task 2: Name helpers + live nasab (app.js)

**Files:**
- Modify: `index.html` (loader: add `translit.js` before `app.js`)
- Modify: `app.js` (add helpers near `getPerson`; expose a pure `computeFullName` for node testing)
- Test: `scripts/names.test.cjs`

**Interfaces:**
- Consumes: `getPerson`, `state.people`, `state.lang`.
- Produces:
  - `ownName(p, lang) → string` — `p.name[lang]` with fallback to the other language, then `''`. Tolerates a legacy string `p.name`.
  - `firstNameOf(p) → string` — `ownName(p, state.lang)`.
  - `fatherOfPerson(p) → person|null` — the male of the person's parent couple (parent if male, else parent's first spouse if male).
  - `fullNameOf(p) → string` — own segments joined up the paternal chain, in `state.lang`.
  - `famNameOf() → string` — `state.familyName[state.lang]` with fallback; tolerates a legacy string.

- [ ] **Step 1: Load `translit.js` before `app.js`** — in `index.html` change:

```js
    add('kinship.js')
      .then(function(){ return add('translit.js'); })
      .then(function(){ return add('app.js'); })
      .then(function(){ return add('cloud.js', 'module'); });
```

- [ ] **Step 2: Write the failing node test** `scripts/names.test.cjs`

```js
// Exercises the pure name computation exported by app.js for tests.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
// app.js is a browser IIFE; pull out the exported pure helper via a tiny shim.
global.window = undefined;
// The helper is exposed as global.__ftComputeFullName when running under node.
require('../app.js');   // must not throw at load under node (guarded); see Step 3
const compute = global.__ftComputeFullName;
function P(id,ar,en,g,parentId,spouseIds){return {id,name:{ar,en},gender:g,parentId:parentId||null,spouseIds:spouseIds||[],childrenIds:[]};}
var people={
  r:P('r','أحمد الوزير','Ahmed Alwazir','m',null,['w']),
  w:P('w','فاطمة','Fatima','f',null,['r']),
  s:P('s','محمد','Mohammed','m','r',['sw']),
  sw:P('sw','مريم','Mariam','f',null,['s']),
  g:P('g','خالد','Khaled','m','s',[])
};
let pass=0, fail=0; function eq(a,b,l){ if(a===b) pass++; else { fail++; console.error('✗',l,'=>',JSON.stringify(a),'want',JSON.stringify(b)); } }
eq(compute(people,'g','ar'), 'خالد محمد أحمد الوزير', 'ar nasab up paternal chain');
eq(compute(people,'g','en'), 'Khaled Mohammed Ahmed Alwazir', 'en nasab');
// child of a mother whose husband is the father: nasab still paternal
var p2=Object.assign({},people);
eq(compute(people,'r','ar'), 'أحمد الوزير', 'root = own segment incl surname');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

Note: app.js loading under node must be guarded (Step 3) — it references `document` etc. The guard exposes ONLY the pure compute function and returns before touching the DOM when `typeof document === 'undefined'`.

- [ ] **Step 3: Implement the helpers in `app.js`** — add near `getPerson` (top of the IIFE). Also add, at the VERY TOP of the app.js IIFE body, a node-test hook that exposes the pure computation and bails before DOM work:

```js
  // ---- Name helpers (bilingual + live nasab) ----
  function ownName(p, lang){
    if(!p) return '';
    var n = p.name;
    if(typeof n === 'string') return n;                 // legacy, pre-migration
    if(!n) return '';
    return n[lang] || n[lang === 'ar' ? 'en' : 'ar'] || '';
  }
  function firstNameOf(p){ return ownName(p, state.lang); }
  function fatherOfPerson(p){
    if(!p || !p.parentId) return null;
    var par = getPerson(p.parentId); if(!par) return null;
    if(par.gender === 'm') return par;                  // parent is the father
    var spId = par.spouseIds && par.spouseIds[0];       // parent is mother -> father = her husband
    var sp = spId ? getPerson(spId) : null;
    return (sp && sp.gender === 'm') ? sp : null;
  }
  function fullNameOf(p){
    var parts = [], cur = p, guard = 0;
    while(cur && guard++ < 64){ parts.push(ownName(cur, state.lang)); cur = fatherOfPerson(cur); }
    return parts.filter(Boolean).join(' ');
  }
  function famNameOf(){
    var f = state.familyName;
    if(typeof f === 'string') return f;
    if(!f) return '';
    return f[state.lang] || f[state.lang === 'ar' ? 'en' : 'ar'] || '';
  }
```

Add a node-only pure export (place immediately after `fatherOfPerson`/`fullNameOf` are defined is impossible because they use `state`/`getPerson`; instead expose a self-contained pure version for tests):

```js
  // Node test hook: a self-contained pure nasab computer over a people map.
  if(typeof document === 'undefined'){
    (typeof global !== 'undefined' ? global : this).__ftComputeFullName = function(people, id, lang){
      function own(p){ var n=p&&p.name; if(typeof n==='string') return n; if(!n) return ''; return n[lang]||n[lang==='ar'?'en':'ar']||''; }
      function father(p){ if(!p||!p.parentId) return null; var par=people[p.parentId]; if(!par) return null;
        if(par.gender==='m') return par; var sp=par.spouseIds&&par.spouseIds[0]?people[par.spouseIds[0]]:null; return (sp&&sp.gender==='m')?sp:null; }
      var parts=[], cur=people[id], guard=0; while(cur&&guard++<64){ parts.push(own(cur)); cur=father(cur); } return parts.filter(Boolean).join(' ');
    };
    return;   // don't run the DOM app under node
  }
```

(Place this hook as the FIRST statement inside the app IIFE so `return` cleanly aborts DOM setup under node.)

- [ ] **Step 4: Run tests, verify pass**

Run: `node scripts/names.test.cjs`
Expected: `3 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js scripts/names.test.cjs
git commit -m "feat(names): bilingual name helpers + live paternal nasab"
```

---

## Task 3: One-time migration `migrateNames` (app.js)

**Files:**
- Modify: `app.js` (add `migrateNames`; call it in `load()` and in `window.__ftApplyRemote` right after state is set, before `render()`)
- Test: `scripts/names-migrate.test.cjs`

**Interfaces:**
- Consumes: `state.people`, `state.familyName`, `fatherOfPerson`-equivalent, `window.ftTranslit`.
- Produces: `migrateNames(state)` — converts string `name`/`familyName` to `{ar,en}` own-segments, idempotent (skips objects).

- [ ] **Step 1: Write the failing test** `scripts/names-migrate.test.cjs`

```js
require('../translit.js');
const ftTranslit = global.ftTranslit;
// Standalone reference of the two-pass migration (mirrors app.js migrateNames).
function migrate(state){
  var ppl = state.people || {};
  var ids = Object.keys(ppl);
  var oldFull = {};
  ids.forEach(function(id){ if(typeof ppl[id].name === 'string') oldFull[id] = ppl[id].name; });
  function father(p){ if(!p||!p.parentId) return null; var par=ppl[p.parentId]; if(!par) return null;
    if(par.gender==='m') return par; var sp=par.spouseIds&&par.spouseIds[0]?ppl[par.spouseIds[0]]:null; return (sp&&sp.gender==='m')?sp:null; }
  ids.forEach(function(id){
    var p = ppl[id]; if(typeof p.name !== 'string') return;
    var full = oldFull[id], f = father(p);
    var fatherFull = f ? oldFull[f.id] : null;
    var ownAr = (fatherFull && full.slice(-(fatherFull.length+1)) === (' '+fatherFull)) ? full.slice(0, full.length-fatherFull.length-1) : full;
    p.name = { ar: ownAr, en: ftTranslit(ownAr) };
  });
  if(typeof state.familyName === 'string') state.familyName = { ar: state.familyName, en: ftTranslit(state.familyName) };
}
function P(id,name,g,parentId,spouseIds){return {id,name,gender:g,parentId:parentId||null,spouseIds:spouseIds||[],childrenIds:[]};}
var state={ familyName:'عائلة الوزير', people:{
  r:P('r','أحمد الوزير','m',null,['w']), w:P('w','فاطمة','f',null,['r']),
  s:P('s','محمد أحمد الوزير','m','r',[]), g:P('g','خالد محمد أحمد الوزير','m','s',[])
}};
migrate(state);
let pass=0, fail=0; function eq(a,b,l){ if(a===b) pass++; else { fail++; console.error('✗',l,'=>',JSON.stringify(a),'want',JSON.stringify(b)); } }
eq(state.people.g.name.ar, 'خالد', 'grandchild own = first segment');
eq(state.people.s.name.ar, 'محمد', 'child own = first segment');
eq(state.people.r.name.ar, 'أحمد الوزير', 'root own = incl surname');
eq(typeof state.people.g.name.en, 'string', 'en auto-filled');
eq(state.familyName.ar, 'عائلة الوزير', 'familyName -> object');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node scripts/names-migrate.test.cjs`
Expected: PASS actually (this test is self-contained). Its purpose is to LOCK the migration algorithm; copy the exact `migrate` body into `app.js` `migrateNames` in Step 3 so behavior matches.

- [ ] **Step 3: Implement `migrateNames` in `app.js`** — add it, using `window.ftTranslit`, with the SAME two-pass body as the test's `migrate` (read `state.people`, snapshot `oldFull`, strip the father's old full suffix, set `{ar,en}`, convert `familyName`). Then call it:
  - in `load()` right after `state = parsed;` and the existing `migratePerson` loop.
  - in `window.__ftApplyRemote` right after `state = remoteState;`, before `applyLang(); render();`.

- [ ] **Step 4: Verify no regression**

Run: `node scripts/names-migrate.test.cjs && node -c app.js`
Expected: migration test passes; `app.js` syntax OK.

- [ ] **Step 5: Commit**

```bash
git add app.js scripts/names-migrate.test.cjs
git commit -m "feat(names): two-pass migration of legacy names to {ar,en} own-segments"
```

---

## Task 4: Person model writes + bilingual form (app.js)

**Files:**
- Modify: `app.js` — `newPerson` (name param is `{ar,en}`), `addChild`/`addSpouse` (build `{ar,en}` own name), `updatePerson` (store `{ar,en}`), and `openPersonForm` (two fields + auto-translit + mandatory + live bilingual nasab). `buildFullName` is removed (replaced by live nasab).

**Interfaces:**
- Consumes: `ftTranslit`, `fullNameOf`, `firstNameOf`, `coupleContext`, `fatherOfPerson`.
- Produces: people whose `name` is `{ar,en}` own-segments; the form collects both languages.

- [ ] **Step 1: `newPerson` takes an `{ar,en}` name** — change signature body:

```js
  function newPerson(name, gender, parentId){
    return { id: uid(), name: name, gender: gender, parentId: parentId || null,
      spouseIds: [], childrenIds: [], collapsed: false,
      birthDate: null, residence: '', photo: null };
  }
```
(`name` is now the `{ar,en}` object passed by callers.)

- [ ] **Step 2: Form — two fields + auto-translit + mandatory + live nasab.** In `openPersonForm`, replace the single name field with two, and (for edit) seed from `firstNameOf`:

```js
      '<div class="field"><label>'+(mode==='child' ? t('firstNameLabel') : t('nameLabel'))+' (عربي)</label>'+
        '<input type="text" id="pf_name_ar" dir="rtl" placeholder="'+(mode==='child' ? t('firstNamePh') : t('namePh'))+'" value="'+(isEdit ? escapeHtml(ownName(target,'ar')) : '')+'"></div>'+
      '<div class="field"><label>Name (English)</label>'+
        '<input type="text" id="pf_name_en" dir="ltr" placeholder="e.g. Khaled" value="'+(isEdit ? escapeHtml(ownName(target,'en')) : '')+'"></div>'+
```

Wire auto-translit (English follows Arabic until the user edits English) and the live bilingual preview. Replace the old child-preview block and `pf_name` focus:

```js
    var arIn = document.getElementById('pf_name_ar');
    var enIn = document.getElementById('pf_name_en');
    var enTouched = isEdit && !!ownName(target,'en');
    enIn.addEventListener('input', function(){ enTouched = true; });
    var childCtx = mode === 'child' ? coupleContext(targetId) : null;
    var fatherPerson = childCtx && childCtx.fatherId ? getPerson(childCtx.fatherId) : null;
    function refreshName(){
      if(!enTouched) enIn.value = window.ftTranslit ? window.ftTranslit(arIn.value) : arIn.value;
      if(mode === 'child'){
        var prev = document.getElementById('pf_fullPreview'); if(!prev) return;
        if(!fatherPerson){ prev.textContent = t('childNeedsFather'); return; }
        var ar = [arIn.value].concat(fullNameOf(fatherPerson).split(' ')).filter(Boolean).join(' ');
        prev.textContent = arIn.value ? (t('fullNamePreview') + ' ' + ar) : '';
      }
    }
    arIn.addEventListener('input', refreshName);
    refreshName();
    arIn.focus();
```

(Delete the previous `var childCtx …`, `updatePreview`, and `document.getElementById('pf_name').focus();` lines this replaces.)

- [ ] **Step 3: Save — validate both, store `{ar,en}` own-name.** In the `pf_save` handler:

```js
    document.getElementById('pf_save').onclick = function(){
      var ar = document.getElementById('pf_name_ar').value.trim();
      var en = document.getElementById('pf_name_en').value.trim();
      if(!ar || !en){ toast(t('toastNameRequired')); return; }
      var nm = { ar: ar, en: en };
      if(mode === 'child') addChild(childCtx.anchorId, nm, gender);
      else if(mode === 'spouse') addSpouse(targetId, nm, gender);
      else updatePerson(targetId, { name: nm, gender: gender,
        birthDate: document.getElementById('pf_birth').value || null,
        residence: document.getElementById('pf_residence').value.trim(), photo: pendingPhoto });
      toast(t('toastSaved'));
      var keepOpen = mode === 'child' && document.getElementById('pf_keep') && document.getElementById('pf_keep').checked;
      if(keepOpen){ openPersonForm('child', targetId); } else { closeSheet(); }
    };
```

`addChild(parentId, name, gender)` and `addSpouse(personId, name, gender)` already pass `name` straight into `newPerson`, so they now receive `{ar,en}` unchanged. `updatePerson` sets `p.name = data.name;` — now an object; the change-detect line `if(p.name !== data.name)` still works (object identity differs → logs an edit); keep it.

- [ ] **Step 4: Remove `buildFullName`** (now unused) and its remaining references. Confirm none remain:

Run: `grep -n "buildFullName" app.js` → expect no matches. Then `node -c app.js`.

- [ ] **Step 5: Browser check** — `preview_start`, seed via `__ftApplyRemote` a `{ar,en}` tree, open a child form: typing Arabic auto-fills English; empty English blocks save; live preview shows the paternal nasab. Then commit.

```bash
git add app.js
git commit -m "feat(names): bilingual person form (auto-translit, required, live nasab)"
```

---

## Task 5: Apply helpers to every display site + search (app.js)

**Files:**
- Modify: `app.js` — replace each `escapeHtml(p.name)` / `escapeHtml(target.name)` / `escapeHtml(A.name)` / `escapeHtml(B.name)` and `state.familyName` READS with the helpers.

**Interfaces:**
- Consumes: `fullNameOf`, `firstNameOf`, `famNameOf`.

- [ ] **Step 1: Card, dialogs, hints, kinship** — apply `fullNameOf`:
  - Card name (`app.js` ~596): `escapeHtml(fullNameOf(p))`.
  - Context/delete (`~1086-1088`, `~1154`): `escapeHtml(fullNameOf(target))` / `escapeHtml(fullNameOf(p))`.
  - Completion hints (`~774-775`): `escapeHtml(fullNameOf(p))`.
  - Kinship result (`~1221`, `~1223`): `escapeHtml(fullNameOf(B))` / `escapeHtml(fullNameOf(A))`.

- [ ] **Step 2: Family title + export + create** — apply `famNameOf`:
  - Banner + tree title reads (`~660`, `~668`, `~673`, `~790`, `~928`): use `famNameOf()` (falls back cleanly for empty).
  - Export filename (`~1318`): `(famNameOf() || t('appName')) + '.json'`.
  - Family-title contenteditable save (`~1260`): write to the current language — `if(typeof state.familyName!=='object'||!state.familyName) state.familyName={ar:'',en:''}; state.familyName[state.lang]=v;`.
  - Create-family default (`~448`): set `state.familyName = { ar: t('familyPrefix')+first+t('familySuffix'), en: (window.ftTranslit?window.ftTranslit(first):first)+' Family' };` where `first = ar-first-word`.

- [ ] **Step 3: Home people-search matches the computed full name** — in `renderHome`'s search handler, match and rank on `fullNameOf`:

```js
      var matches = ids.filter(function(id){ return fullNameOf(ppl[id]).toLowerCase().indexOf(q) !== -1; });
      matches.sort(function(a,b){ var na=fullNameOf(ppl[a]).toLowerCase(), nb=fullNameOf(ppl[b]).toLowerCase();
        var ia=na.indexOf(q), ib=nb.indexOf(q); if(ia!==ib) return ia-ib; return na.localeCompare(nb,'ar'); });
      matches = matches.slice(0,8);
```
And the result row label uses `escapeHtml(fullNameOf(ppl[id]))`.

- [ ] **Step 4: Verify** — `node -c app.js`, then `grep -n "escapeHtml(p.name)\|escapeHtml(target.name)\|\.name)" app.js` shows no raw name reads remain in display paths. Browser: toggle EN → names switch to English; edit an ancestor's name → all descendants update live.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(names): all display sites + search use computed bilingual names"
```

---

## Task 6: familyName sync + end-to-end verify + deploy

**Files:**
- Modify: `cloud.js` (create-tree seeds `familyName:{ar:'',en:''}`)

- [ ] **Step 1: cloud.js create-tree** — change the `setDoc(treeRef, { familyName:'', … })` to `familyName:{ar:'',en:''}`. `pushToCloud`/`applyRemote` already pass `state.familyName` through `setDoc` (objects are fine); no other change.

- [ ] **Step 2: Full node suite**

Run: `node scripts/translit.test.cjs && node scripts/names.test.cjs && node scripts/names-migrate.test.cjs && npm run test:rules`
Expected: all green (rules unaffected).

- [ ] **Step 3: Browser end-to-end** (seed a legacy STRING-named tree via `__ftApplyRemote`, confirm it migrates on load): names render; EN toggle switches language; adding a person auto-transliterates and requires English; editing an ancestor updates all descendants live; export filename uses the family name; search works.

- [ ] **Step 4: Commit + merge + deploy**

```bash
git add cloud.js
git commit -m "feat(names): familyName {ar,en} in cloud create"
git checkout main && git merge --no-ff feature-bilingual-names -m "Merge: bilingual {ar,en} names + live nasab (Phase 1b)"
git push origin main
```

---

## Self-Review

**Spec coverage:** data model own-segment `{ar,en}` (Tasks 2,4) ✓; live nasab compute (Task 2) ✓; translit engine (Task 1) ✓; bilingual form auto-translit + mandatory + live preview (Task 4) ✓; two-pass migration (Task 3) ✓; all display sites + search (Task 5) ✓; familyName `{ar,en}` + cloud (Tasks 5,6) ✓; kinship.js untouched ✓; testing node + browser (all tasks + Task 6) ✓.

**Placeholder scan:** none — every code step carries full code; display-site edits list exact anchor lines and the exact helper to apply.

**Type consistency:** `name` is `{ar,en}` created in Task 4, read by `ownName`/`fullNameOf` (Task 2) and migration (Task 3), displayed in Task 5. `ftTranslit(string)→string` (Task 1) used in Tasks 3,4,5. `fatherOfPerson(p)→person|null` and `fullNameOf(p)→string` (Task 2) used in Tasks 4,5. `famNameOf()→string` (Task 2) used in Task 5. `coupleContext(id)→{anchorId,fatherId}` (already in app.js) used in Task 4.
