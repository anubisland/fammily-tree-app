# Dates + Person Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional death date, show every date in both Gregorian and Hijri with age/lifespan and a tasteful "deceased" mark, and add a rich person-profile sheet (opened by tapping a card) with relatives you can navigate between.

**Architecture:** Purely additive to `app.js` + a little `styles.css`. One new nullable field `deathDate`; pure date helpers built on the browser's `Intl` Islamic calendar (no libraries, safe fallback); a `openProfile(id)` bottom sheet reusing the existing sheet system; card-body tap opens the profile while action buttons keep working.

**Tech Stack:** Vanilla JS (`app.js` classic script), `Intl.DateTimeFormat` with `islamic-umalqura`, existing `openSheet`/`t()`/`escapeHtml` infrastructure. Node for pure-function tests.

## Global Constraints

- Additive only — no data migration, no touching `name`. `personId` immutable (#1), `name={ar,en}` untouched (#2).
- All UI text through `t()`; all user values through `escapeHtml`. (#3)
- No security-relevant change (no rules/auth), so no different-agent security review required.
- Hijri via `Intl` only (no dependency); if the runtime lacks the Islamic calendar, Hijri text is empty (try/catch) — never throw, Gregorian still shows.
- Backup-first: a fresh export is archived before deploy (owner already has automated backups).

---

## File Structure

- `app.js` — date helpers, `motherOfPerson`, `deathDate` in model/form/update, card deceased mark, `openProfile`, card-tap wiring, new i18n keys.
- `styles.css` — `.deceased` card styling + profile-sheet layout (reuse existing sheet styles).
- `scripts/dates.test.cjs` — node tests for the pure date helpers.

---

## Task 1: Death-date field + pure date helpers

**Files:**
- Modify: `app.js` — `newPerson`, `migratePerson`, and add the date helpers near `calcAge`.
- Test: `scripts/dates.test.cjs`

**Interfaces:**
- Produces:
  - `person.deathDate` (string `YYYY-MM-DD` | `null`).
  - `fmtDate(str) → string` — "«14 مارس 1980 — 26 ربيع الآخر 1400هـ»" style (per `state.lang`); `''` for empty/invalid.
  - `gregText(str) → string`, `hijriText(str) → string` (each `''` on empty/invalid/unsupported).
  - `ageYears(birthStr, refStr?) → number|null`, `lifespanText(birthStr, deathStr) → string`.
  - Node hook: `global.__ftDateHelpers = { fmtDate, gregText, hijriText, ageYears, lifespanText }` exposed under the existing `typeof document === 'undefined'` guard so tests can import them.

- [ ] **Step 1: Write the failing test** `scripts/dates.test.cjs`

```js
require('../app.js');   // node-guard exposes helpers, then returns before DOM
const H = global.__ftDateHelpers;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }
// state.lang defaults to 'ar' in the guard shim (see Step 3).
ok(H.gregText('1980-03-14').length > 0, 'greg formats');
ok(H.hijriText('1980-03-14').indexOf('هـ') !== -1 || H.hijriText('1980-03-14') === '', 'hijri has هـ or empty (unsupported)');
ok(H.fmtDate('') === '', 'empty date -> empty');
ok(H.fmtDate('not-a-date') === '', 'invalid date -> empty');
ok(H.ageYears('2000-01-01','2020-01-01') === 20, 'age 20');
ok(H.ageYears('2000-06-01','2020-01-01') === 19, 'age not-yet-birthday = 19');
ok(H.ageYears('') === null, 'no birth -> null age');
ok(H.lifespanText('1900-01-01','1980-01-01').indexOf('80') !== -1, 'lifespan 80');
ok(H.lifespanText('1900-01-01','') === '', 'no death -> empty lifespan');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

- [ ] **Step 2: Run it — expect FAIL** (`global.__ftDateHelpers` undefined).

Run: `node scripts/dates.test.cjs`

- [ ] **Step 3: Implement.** Add `deathDate: null` to the object returned by `newPerson`. In `migratePerson` add `if(p.deathDate === undefined) p.deathDate = null;`. Add the helpers immediately after `calcAge`/`ageText`:

```js
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
      var s = new Intl.DateTimeFormat(loc, { day:'numeric', month:'long', year:'numeric' }).format(d);
      return s + (state.lang === 'en' ? ' AH' : 'هـ');
    } catch(e){ return ''; }   // runtime without the Islamic calendar: show Gregorian only
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
    return (n === null || !deathStr) ? '' : tf('lifespanYears', { n: localeDigits(n) });
  }
```

Add the node hook inside the existing node-guard block (where `__ftComputeFullName` is set), plus a minimal `state` shim so helpers relying on `state.lang`/`tf`/`localeDigits` work under node:

```js
  if(typeof document === 'undefined'){
    var G = (typeof global !== 'undefined' ? global : this);
    if(typeof state === 'undefined') state = { lang:'ar' };
    // ... existing __ftComputeFullName ...
    G.__ftDateHelpers = { fmtDate:fmtDate, gregText:gregText, hijriText:hijriText, ageYears:ageYears, lifespanText:lifespanText };
    return;
  }
```

Note: the guard runs at the TOP of the IIFE (before helpers are defined), so instead expose the hook by defining these helpers ABOVE the guard, OR (simpler) move the `G.__ftDateHelpers = …` assignment to run after definitions via a second tiny guarded block at the END of the helper section:

```js
  if(typeof document === 'undefined' && typeof global !== 'undefined'){
    global.__ftDateHelpers = { fmtDate:fmtDate, gregText:gregText, hijriText:hijriText, ageYears:ageYears, lifespanText:lifespanText };
  }
```
Keep the early top-of-IIFE guard's `return` — but move it to AFTER these helper definitions so both `__ftComputeFullName` and `__ftDateHelpers` are defined before `return`. (Place the single node-guard block right after `lifespanText`.) Add i18n key used above: `lifespanYears:{ar:'عاش {n} سنة', en:'lived {n} years'}`.

- [ ] **Step 4: Run tests — expect PASS.**

Run: `node scripts/dates.test.cjs` → `9 passed, 0 failed`. Also `node -c app.js`.

- [ ] **Step 5: Commit**

```bash
git add app.js scripts/dates.test.cjs
git commit -m "feat(dates): deathDate field + Gregorian/Hijri date helpers + tests"
```

---

## Task 2: Death input in the form, update logic, and the card deceased mark

**Files:**
- Modify: `app.js` — `openPersonForm` (add death input, edit mode only), `pf_save` (store `deathDate`), `updatePerson` (persist + change-log), `personCard` (deceased mark). i18n `deathLabel`, `inMemory`.
- Modify: `styles.css` — `.card.deceased` styling + a `.mem-tag`.

**Interfaces:**
- Consumes: `deathDate` (Task 1), `fmtDate`/`ageYears`/`lifespanText`, `calcAge`/`ageText`.
- Produces: cards visibly mark deceased people; edit form reads/writes `deathDate`.

- [ ] **Step 1: i18n.** Add near `birthLabel`:

```js
    deathLabel:{ar:'تاريخ الوفاة (اختياري)', en:'Date of death (optional)'},
    inMemory:{ar:'رحمه الله', en:'In memory'},
```

- [ ] **Step 2: Form death input.** In `openPersonForm`, right after the birth-date field line (edit-only), add a death-date field (edit-only):

```js
      (isEdit ? '<div class="field"><label>'+t('deathLabel')+'</label><input type="date" id="pf_death" value="'+escapeHtml(target.deathDate||'')+'"></div>' : '') +
```

- [ ] **Step 3: Save it.** In the `pf_save` edit branch, add `deathDate` to the `updatePerson` payload:

```js
          deathDate: document.getElementById('pf_death').value || null,
```

- [ ] **Step 4: Persist + change-log in `updatePerson`.** After the birthDate change-detect line add:

```js
    if((p.deathDate || null) !== (data.deathDate || null)) changed.push('تاريخ الوفاة');
```
and after `p.birthDate = data.birthDate || null;` add `if(data.deathDate !== undefined) p.deathDate = data.deathDate || null;`

- [ ] **Step 5: Card deceased mark.** In `personCard`, set the class and add a mark. Change the card class line to include `deceased` when applicable, and add a memory tag under the name. Replace the age meta line block with:

```js
    var deceased = !!p.deathDate;
    var lifespan = deceased ? lifespanText(p.birthDate, p.deathDate) : '';
    // el.className already set; append deceased:
    if(deceased) el.classList.add('deceased');
```
Insert the tag right after the name div, and keep the age line only for the living:

```js
      '<div class="name">'+escapeHtml(fullNameOf(p))+'</div>' +
      (deceased ? '<div class="mem-tag">🕊 '+t('inMemory')+(lifespan ? ' · '+escapeHtml(lifespan) : '')+'</div>' : '') +
      '<div class="gen-badge">'+genLabel(depth)+'</div>' +
      (!deceased && age !== null ? '<div class="meta-line">🎂 '+ageText(age)+'</div>' : '') +
```
(Keep the residence meta line as-is. `el.classList.add('deceased')` must run after `el.className = …` and before `el.innerHTML = …`.)

- [ ] **Step 6: CSS.** In `styles.css` near the card rules add:

```css
  .card.deceased{ opacity:.94; }
  .card.deceased .avatar{ filter:grayscale(.35); }
  .card .mem-tag{ font-size:10.5px; color:var(--ink-soft); margin:2px 0 4px; font-family:var(--f-body); }
```
Bump the stylesheet version in `index.html` (`styles.css?v=…` → next number).

- [ ] **Step 7: Verify + commit.** `node -c app.js`. Browser: edit a person, set a death date → save → card shows 🕊 رحمه الله + lifespan and greyed avatar; a living person is unchanged.

```bash
git add app.js styles.css index.html
git commit -m "feat(dates): death date in form + deceased card mark (رحمه الله + lifespan)"
```

---

## Task 3: Person profile sheet + relatives navigation

**Files:**
- Modify: `app.js` — add `motherOfPerson`, `openProfile(id)`, card-tap wiring in the `#treeRoot` click handler, i18n keys.
- Modify: `styles.css` — profile layout classes.

**Interfaces:**
- Consumes: `fullNameOf`, `ownName`, `fatherOfPerson`, `fmtDate`, `ageYears`, `ageText`, `lifespanText`, `openSheet`, `openPersonForm`, `startKinship`, `canEditCloud`, `genLabel`, `genOfPerson`.
- Produces: `openProfile(id)`; tapping a card body opens it.

- [ ] **Step 1: i18n.** Add:

```js
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
```

- [ ] **Step 2: `motherOfPerson`.** Add next to `fatherOfPerson`:

```js
  function motherOfPerson(p){
    if(!p || !p.parentId) return null;
    var par = getPerson(p.parentId); if(!par) return null;
    if(par.gender === 'f') return par;
    var spId = par.spouseIds && par.spouseIds[0];
    var sp = spId ? getPerson(spId) : null;
    return (sp && sp.gender === 'f') ? sp : null;
  }
```

- [ ] **Step 3: `openProfile(id)`.** Add near `openPersonForm`:

```js
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
      (!deceased && ageYears(p.birthDate)!==null ? ' <span class="prof-dim">('+t('profileAge')+' '+ageText(ageYears(p.birthDate))+')</span>' : '')+'</div>';
    if(deceased) lines += '<div class="prof-line">🕊 <b>'+t('profileDeath')+':</b> '+escapeHtml(fmtDate(p.deathDate))+' · '+t('inMemory')+
      (lifespanText(p.birthDate,p.deathDate) ? ' <span class="prof-dim">('+escapeHtml(lifespanText(p.birthDate,p.deathDate))+')</span>' : '')+'</div>';
    if(p.residence) lines += '<div class="prof-line">📍 '+escapeHtml(p.residence)+'</div>';
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
```
(`sheetBody` is the module-level `#sheetBody` reference already used by `openSheet`.)

- [ ] **Step 4: Card-tap opens the profile.** In the `#treeRoot` click handler, BEFORE `var btn = e.target.closest('[data-act]');`, add: if not kinship mode and the tap is on a card but not an action control, open the profile:

```js
    var actBtn = e.target.closest('[data-act]');
    if(!actBtn){
      var card = e.target.closest('.card');
      if(card && card.dataset.id){ openProfile(card.dataset.id); return; }
    }
```
(Leave the existing `var btn = e.target.closest('[data-act]')` logic below unchanged for the action buttons.)

- [ ] **Step 5: CSS.** Add profile styles in `styles.css`:

```css
  .prof-head{ display:flex; align-items:center; gap:12px; margin-bottom:12px; }
  .prof-av{ width:56px; height:56px; border-radius:50%; overflow:hidden; background:var(--ic-chip); border:2px solid var(--gold); display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0; }
  .prof-av img{ width:100%; height:100%; object-fit:cover; }
  .prof-name{ font-family:var(--f-head); font-size:19px; font-weight:700; color:var(--ink); }
  .prof-name-alt{ font-size:13px; color:var(--ink-soft); }
  .prof-body{ display:flex; flex-direction:column; gap:7px; margin-bottom:14px; }
  .prof-line{ font-size:13.5px; color:var(--ink); }
  .prof-dim{ color:var(--ink-soft); font-size:12px; }
  .prof-rel{ display:flex; gap:8px; align-items:flex-start; padding-top:6px; border-top:1px solid var(--line); }
  .prof-rel-lbl{ font-size:12.5px; color:var(--ink-soft); min-width:64px; padding-top:6px; }
  .prof-rel-chips{ display:flex; flex-wrap:wrap; gap:6px; flex:1; }
  .rel-chip{ background:var(--card); border:1px solid var(--line); border-radius:999px; padding:6px 12px; font-size:12.5px; color:var(--emerald); font-family:var(--f-body); cursor:pointer; }
  .prof-actions{ display:flex; flex-wrap:wrap; gap:8px; }
  .prof-actions .primary-btn{ flex:1; min-width:120px; }
```
Bump `styles.css?v=…` in `index.html`.

- [ ] **Step 6: Verify + commit.** `node -c app.js`. Browser: tap a card body → profile opens with dates (both calendars), relatives as chips; tap a relative → their profile; Edit/Add/Kinship work; tapping an action button on the card does NOT open the profile.

```bash
git add app.js styles.css index.html
git commit -m "feat(profile): tap-a-card person profile with dates + relatives navigation"
```

---

## Task 4: End-to-end verification + deploy

- [ ] **Step 1: Full checks.** `node scripts/dates.test.cjs` and every other `scripts/*.test.cjs` green; `node -c app.js`.
- [ ] **Step 2: Browser E2E** (seed a small `{ar,en}` tree incl. one person with birth+death): profile opens on tap; Gregorian+Hijri both show; living shows 🎂 age, deceased shows 🕊 رحمه الله + lifespan + greyed avatar; relative chips navigate; edit adds/saves a death date; EN toggle localizes dates and labels.
- [ ] **Step 3: Backup reminder.** Confirm the owner has a fresh export archived (Phase-2 changes are additive, but keep the habit).
- [ ] **Step 4: Merge + deploy.**

```bash
git checkout main && git merge --no-ff feature-dates-profile -m "Merge: dates (greg+hijri) + person profile (Phase 2)"
git push origin main
```

---

## Self-Review

**Spec coverage:** deathDate field (T1) ✓; Hijri+Gregorian helpers with safe fallback (T1) ✓; age/lifespan (T1) ✓; death input in form + persist (T2) ✓; deceased card mark «رحمه الله» + lifespan (T2) ✓; rich profile sheet with dates, both-language name, relatives navigation, edit/add/kinship actions (T3) ✓; card-tap open without breaking action buttons (T3) ✓; motherOfPerson (T3) ✓; i18n keys (T2,T3) ✓; node + browser tests (all tasks, T4) ✓; additive/no-security-review (Global) ✓.

**Placeholder scan:** none — full code in every step; the one nuance (node-guard placement so both hooks are defined before `return`) is called out explicitly in T1 Step 3.

**Type consistency:** `deathDate` string|null across T1/T2/T3. `fmtDate/gregText/hijriText/ageYears/lifespanText` defined T1, used T2/T3 with identical signatures. `motherOfPerson(p)→person|null` mirrors existing `fatherOfPerson`. `openProfile(id)` defined T3, wired in T3 Step 4. `relRow(labelKey, people[])` internal to T3. i18n keys referenced match those added (`lifespanYears`, `deathLabel`, `inMemory`, `profileBirth/Death/Age`, `relFather/Mother/Spouse/Children`, `profileEdit/AddChild/Kinship`).
```
