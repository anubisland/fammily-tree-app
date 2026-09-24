# "Today in the Family" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home-screen card that shows upcoming family birthdays (living) and death anniversaries (deceased) within 30 days, with a quick date-entry list to fill missing dates.

**Architecture:** A pure, DOM-free engine `occasions.js` (like `kinship.js`) computes the occasion list from `people` + today. `app.js` renders a card in `renderHome`, wires tap→profile and a greeting button that opens the Moments composer prefilled, and adds a "quick add dates" sheet. No schema or security-rules change — reuses `birthDate`/`deathDate`.

**Tech Stack:** Vanilla JS (classic script IIFE with `module.exports` + `window` global), Node for unit tests (`node scripts/*.test.cjs`), existing `t()`/`tf()` i18n and date helpers (`fmtDate`).

## Global Constraints

- All user-facing text via `t()`/`tf()` only — bilingual `{ar,en}` keys (project constant #3).
- `personId` is immutable; never regenerated (constant #1).
- No new person fields; no `firestore.rules` change (spec: not a security change).
- Load order in `index.html`: `occasions.js` must load **before** `app.js` (same `?t=Date.now()` chain as `kinship.js`).
- Match anniversaries by **Gregorian** month/day; **display** Hijri too (via existing `fmtDate`).
- Window = today + next **30** days.
- Deceased (has `deathDate`) → memorial only (no birthday); living with `birthDate` → birthday.

---

### Task 1: Pure occasions engine + unit test

**Files:**
- Create: `occasions.js`
- Test: `scripts/occasions.test.cjs`

**Interfaces:**
- Produces: `ftOccasions(people, today, windowDays) -> Array<{id, type:'birthday'|'memorial', dateStr, daysUntil, years}>`, sorted by `daysUntil` ascending. `years` = age being turned (birthday) or years since death (memorial). Also `module.exports = ftOccasions` and `global.ftOccasions`.

- [ ] **Step 1: Write the failing test**

Create `scripts/occasions.test.cjs`:

```js
const ftOccasions = require('../occasions.js');
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

const today = new Date(2026, 4, 1); // 2026-05-01 (May), non-leap-agnostic fixed date
const people = {
  a: { name:{ar:'أ',en:'A'}, birthDate:'1990-05-01' },              // birthday today, turns 36
  b: { name:{ar:'ب',en:'B'}, birthDate:'2000-05-10' },              // in 9 days
  c: { name:{ar:'ج',en:'C'}, birthDate:'1980-08-01' },              // ~92 days -> excluded
  d: { name:{ar:'د',en:'D'}, birthDate:'1950-05-05', deathDate:'2010-05-05' }, // memorial in 4 days, 16y
  e: { name:{ar:'هـ',en:'E'}, birthDate:'' },                        // no date -> ignored
  f: { name:{ar:'و',en:'F'}, birthDate:'not-a-date' },              // invalid -> ignored
  g: { name:{ar:'ز',en:'G'}, birthDate:'1988-02-29' },              // Feb 29 -> handled, excluded here
};
const occ = ftOccasions(people, today, 30);
const byId = {}; occ.forEach(function(o){ byId[o.id]=o; });

ok(occ.length === 3, 'three occasions in window (a,b,d), got '+occ.length);
ok(byId.a && byId.a.daysUntil === 0 && byId.a.type==='birthday', 'a birthday today');
ok(byId.a && byId.a.years === 36, 'a turns 36, got '+(byId.a&&byId.a.years));
ok(byId.b && byId.b.daysUntil === 9, 'b in 9 days, got '+(byId.b&&byId.b.daysUntil));
ok(!byId.c, 'c excluded (outside 30d)');
ok(byId.d && byId.d.type==='memorial' && byId.d.daysUntil===4, 'd memorial in 4 days');
ok(byId.d && byId.d.years === 16, 'd 16 years since death, got '+(byId.d&&byId.d.years));
ok(!byId.e && !byId.f, 'empty/invalid dates ignored');
ok(occ[0].daysUntil <= occ[occ.length-1].daysUntil, 'sorted ascending by daysUntil');

// Feb 29 matches Feb 28 in a non-leap year window
const feb = ftOccasions({ g:{ name:{ar:'ز',en:'G'}, birthDate:'1988-02-29' } }, new Date(2026,1,27), 5);
ok(feb.length === 1 && feb[0].daysUntil === 1, 'Feb 29 -> Feb 28 (1 day away in 2026), got '+JSON.stringify(feb));

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/occasions.test.cjs`
Expected: FAIL — `Cannot find module '../occasions.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `occasions.js`:

```js
/* Occasions engine — pure, no DOM/Firebase, unit-testable in node.
   Given the people map and today's Date, returns birthdays (living) and death
   anniversaries (deceased) whose next Gregorian occurrence falls within
   windowDays. Sorted by daysUntil ascending. */
(function(global){
  'use strict';

  function parse(str){
    if(!str || typeof str !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    if(!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var dt = new Date(y, mo, d);
    if(dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function isLeap(y){ return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  // Next occurrence of (month, day) on/after `todayMid` (a midnight Date).
  // Feb 29 falls back to Feb 28 in a non-leap occurrence year.
  function nextOccurrence(mo, d, todayMid){
    function make(year){
      var day = (mo === 1 && d === 29 && !isLeap(year)) ? 28 : d;
      return new Date(year, mo, day);
    }
    var occ = make(todayMid.getFullYear());
    if(occ < todayMid) occ = make(todayMid.getFullYear() + 1);
    return occ;
  }
  function daysBetween(a, b){ return Math.round((b - a) / 86400000); }

  function ftOccasions(people, today, windowDays){
    today = today || new Date();
    windowDays = (windowDays == null) ? 30 : windowDays;
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var out = [];
    Object.keys(people || {}).forEach(function(id){
      var p = people[id]; if(!p) return;
      var deceased = !!p.deathDate;
      var srcStr = deceased ? p.deathDate : p.birthDate;
      var src = parse(srcStr); if(!src) return;
      var occ = nextOccurrence(src.m, src.d, todayMid);
      var du = daysBetween(todayMid, occ);
      if(du < 0 || du > windowDays) return;
      out.push({
        id: id,
        type: deceased ? 'memorial' : 'birthday',
        dateStr: srcStr,
        daysUntil: du,
        years: occ.getFullYear() - src.y
      });
    });
    out.sort(function(a, b){ return a.daysUntil - b.daysUntil; });
    return out;
  }

  if(typeof module !== 'undefined' && module.exports) module.exports = ftOccasions;
  global.ftOccasions = ftOccasions;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/occasions.test.cjs`
Expected: `9 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add occasions.js scripts/occasions.test.cjs
git commit -m "feat(occasions): pure engine for upcoming birthdays/memorials + tests"
```

---

### Task 2: Load the engine + i18n keys + home card

**Files:**
- Modify: `index.html` (loader chain ~line 181)
- Modify: `app.js` (i18n block ~line 107; `renderHome` ~line 1021-1061 and its wiring ~1063-1070)

**Interfaces:**
- Consumes: `window.ftOccasions` (Task 1); existing `fmtDate`, `fullNameOf`, `getPerson`, `openProfile`, `escapeHtml`, `t`, `tf`, `showTab`, `renderHome`.
- Produces: an occasions card in the home DOM; helper `occasionsCardHtml()` and `wireOccasionsCard()` in app.js.

- [ ] **Step 1: Load occasions.js before app.js**

In `index.html`, change the loader chain (line ~181) from:

```js
    add('kinship.js')
      .then(function(){ return add('translit.js'); })
      .then(function(){ return add('app.js'); })
      .then(function(){ return add('cloud.js', 'module'); });
```

to:

```js
    add('kinship.js')
      .then(function(){ return add('translit.js'); })
      .then(function(){ return add('occasions.js'); })
      .then(function(){ return add('app.js'); })
      .then(function(){ return add('cloud.js', 'module'); });
```

- [ ] **Step 2: Add i18n keys**

In `app.js`, after the `menuReset` line (~107), add inside the i18n object:

```js
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
```

- [ ] **Step 3: Add card builder + wiring helpers**

In `app.js`, immediately before `function renderHome(){` (~line 1021), add:

```js
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
```

- [ ] **Step 4: Insert the card into renderHome and wire it**

In `app.js` `renderHome`, insert the card at the top of `.home-body`. Change (line ~1047):

```js
      '<div class="home-body">' +
        '<div class="section-eyebrow"><span class="dia">◆</span><span>'+t('homeSectionsEyebrow')+'</span></div>' +
```

to:

```js
      '<div class="home-body">' +
        occasionsCardHtml() +
        '<div class="section-eyebrow"><span class="dia">◆</span><span>'+t('homeSectionsEyebrow')+'</span></div>' +
```

Then, after the existing `host.querySelector('[data-go="members"]').onclick = ...` block (~line 1070), add:

```js
    wireOccasionsCard(host);
```

- [ ] **Step 5: Syntax check**

Run: `node --check app.js`
Expected: (no output — success).

- [ ] **Step 6: Verify in the browser**

Start preview and feed data with a birthday today. In the preview console (via the browser tools):

```js
const today = new Date().toISOString().slice(0,10);
const data = { rootId:'r', familyName:{ar:'ت',en:'T'}, lang:'ar', people:{
  r:{ name:{ar:'الجد',en:'Root'}, gender:'m', spouseIds:[], childrenIds:['x'], parentId:null, birthDate: today },
  x:{ name:{ar:'ابن',en:'Son'}, gender:'m', spouseIds:[], childrenIds:[], parentId:'r', deathDate: today }
}};
window.__ftSetEditable(true); window.__ftApplyRemote(data);
window.__ftShowTab('home'); window.__ftRenderHome();
document.querySelectorAll('.occ-row').length; // expect 2
```

Expected: `2`. Visually the card shows one 🎂 birthday-today and one 🕊 memorial-today. Tapping a row opens the profile; the greet button opens Moments with prefilled text.

- [ ] **Step 7: Commit**

```bash
git add index.html app.js
git commit -m "feat(home): 'Today in the family' occasions card (birthdays + memorials)"
```

---

### Task 3: Quick add-dates sheet

**Files:**
- Modify: `app.js` (i18n block ~line 107; add `showAddDates` near `renderHome`)

**Interfaces:**
- Consumes: `openSheet`, `sheetBody`, `getPerson`, `fullNameOf`, `escapeHtml`, `scheduleSave`, `renderHome`, `t`, `state`.
- Produces: `showAddDates()` (called by the card's add-dates button from Task 2).

- [ ] **Step 1: Add i18n keys**

In `app.js` i18n object (after the keys from Task 2), add:

```js
    addDatesTitle:{ar:'➕ إضافة تواريخ الميلاد', en:'➕ Add birth dates'},
    addDatesDesc:{ar:'أفراد بلا تاريخ ميلاد — أدخل التاريخ ليُحفظ فورًا وتظهر تذكيراته.', en:'People with no birth date — set one and it saves instantly.'},
    addDatesNone:{ar:'كل الأفراد لديهم تاريخ ميلاد 🎉', en:'Everyone has a birth date 🎉'},
```

- [ ] **Step 2: Add showAddDates**

In `app.js`, immediately after `window.__ftRenderHome = renderHome;` (~line 1116), add:

```js
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
```

- [ ] **Step 3: Syntax check**

Run: `node --check app.js`
Expected: (no output).

- [ ] **Step 4: Verify in the browser**

With the preview loaded and data applied (people missing birthDate), run in console:

```js
window.__ftShowAddDates();
document.querySelectorAll('.adddate-input').length > 0; // expect true
```

Then set one input's value and dispatch change; confirm `window.__ftGetState().people[<id>].birthDate` is set and the row gains the `saved` class.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(home): quick add-dates sheet for members missing birth dates"
```

---

### Task 4: Styles + CSS version bump

**Files:**
- Modify: `styles.css` (append occasion + add-date styles)
- Modify: `index.html` (`styles.css?v=15` → `?v=16`)

**Interfaces:**
- Consumes: existing CSS tokens (`--paper`, `--emerald`, `--gold`, `--card`, `--line`, `--ink`, `--ink-soft`, `--danger`, `--shadow`).

- [ ] **Step 1: Append styles**

Append to `styles.css`:

```css

/* Today-in-the-family occasions card */
.occ-card{ background:var(--card); border-radius:16px; box-shadow:var(--shadow); border:1px solid var(--line); padding:14px 14px 8px; margin:0 0 16px; }
.occ-head{ font-family:var(--f-head); font-size:16px; font-weight:700; color:var(--emerald); margin-bottom:8px; }
.occ-sub{ font-size:11.5px; color:var(--ink-soft); font-weight:700; margin:8px 0 4px; }
.occ-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 4px; border-bottom:1px solid var(--line); }
.occ-row:last-child{ border-bottom:none; }
.occ-main{ display:flex; align-items:center; gap:10px; min-width:0; cursor:pointer; flex:1; }
.occ-ic{ font-size:20px; flex-shrink:0; }
.occ-text{ display:flex; flex-direction:column; min-width:0; }
.occ-text b{ font-size:14px; color:var(--ink); }
.occ-when{ font-size:12px; color:var(--emerald); }
.occ-date{ font-size:11px; color:var(--ink-soft); }
.occ-greet{ flex-shrink:0; border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--gold); font-family:var(--f-body); font-size:12px; padding:6px 12px; cursor:pointer; }
.occ-greet:active{ background:var(--gold-soft); }
.occ-empty{ font-size:13px; color:var(--ink-soft); text-align:center; padding:10px 4px; }
.occ-adddates{ display:block; margin:10px auto 4px; border:1px solid var(--line); border-radius:10px; background:var(--emerald); color:#F6EFDD; font-family:var(--f-body); font-size:13px; padding:8px 16px; cursor:pointer; }

/* Quick add-dates sheet */
.adddate-list{ max-height:52vh; overflow-y:auto; margin-top:8px; }
.adddate-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 4px; border-bottom:1px solid var(--line); }
.adddate-name{ font-size:13.5px; color:var(--ink); min-width:0; }
.adddate-input{ flex-shrink:0; border:1.5px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); padding:5px 8px; font-size:13px; }
.adddate-row.saved{ opacity:0.55; }
.adddate-row.saved .adddate-name::after{ content:' ✓'; color:var(--emerald); }
```

- [ ] **Step 2: Bump the CSS cache version**

In `index.html` (~line 17): change `styles.css?v=15` to `styles.css?v=16`.

Run: `grep -n "styles.css?v=" index.html`
Expected: shows `styles.css?v=16`.

- [ ] **Step 3: Verify visually**

Reload the preview with data that has a birthday today; screenshot the home tab and confirm the card renders with the earthy palette, rows aligned, and the greet button styled. Check mobile width (resize to 375px) — no horizontal overflow, button stays on the row.

- [ ] **Step 4: Commit**

```bash
git add styles.css index.html
git commit -m "style(home): occasions card + add-dates sheet styling; css v16"
```

---

## Self-Review

**Spec coverage:**
- Card on home, today + soon (30d) — Task 2 (`occasionsCardHtml` split into today/soon). ✓
- Birthdays (living) + memorials (deceased) — Task 1 engine + Task 2 rows. ✓
- Gregorian match + Hijri display — Task 1 matches Gregorian; Task 2 shows `fmtDate` (greg — hijri). ✓
- Tap → profile; greet/dua → Moments prefilled (no auto-post) — Task 2 `wireOccasionsCard`. ✓
- Empty/sparse state + quick add-dates list saving instantly — Task 2 empty state + Task 3 `showAddDates`. ✓
- No new fields / no rules change — engine reads existing fields; add-dates writes `birthDate` via existing `scheduleSave`. ✓
- Load order occasions.js before app.js — Task 2 Step 1. ✓
- Feb 29, invalid/empty dates — Task 1 engine + tests. ✓
- All text via `t()`/`tf()` — Tasks 2 & 3 keys. ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `ftOccasions` return shape `{id,type,dateStr,daysUntil,years}` used consistently in `occasionRowHtml`. `showAddDates` defined in Task 3 and referenced by `wireOccasionsCard` in Task 2 (forward reference within the same IIFE — both hoisted function declarations, safe). `fmtDate`, `fullNameOf`, `openProfile`, `showTab`, `localeDigits`, `tf` all pre-existing in app.js.

**Note on review:** This is display + a birthDate write through the existing save path — not auth/rules/permissions — so org rule #2 (different-agent security review) does not apply. A normal quality pass is enough.
