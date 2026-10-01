# Multi-Family Per User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user belong to multiple family trees, switch between them, and create or join a family from inside the app — the foundation for family federation.

**Architecture:** A self-written index `users/{uid}/memberships/{treeId}` lists the user's trees; `users/{uid}.activeTreeId` records the current one; the per-tree `trees/{treeId}/members/{uid}` doc stays the sole authority. Pure resolver/migration helpers (node-tested) decide active tree and legacy-seed. The Home family-name opens a "my families" sheet (list/switch/create/join); local state is cached per tree in localStorage.

**Tech Stack:** Vanilla JS (classic IIFE engines + app.js; cloud.js/photos.js ES modules), Firebase 10.13.2 (Auth/Firestore), Firebase emulator for rules tests, Node `.cjs` for pure-logic tests.

## Global Constraints

- Authority is `trees/{treeId}/members/{uid}` ONLY — the `memberships` index is self-written and grants NO access (constant #4). Never read `users/{uid}` for permission.
- Never grant `owner` via invite — in-app join uses the existing invite rule (role ≠ owner).
- `t()` is the only way to output user-facing text.
- Repo is PUBLIC; Firebase is on the free **Spark** plan — no paid products.
- Security-relevant changes (the new memberships rule) MUST be reviewed by a DIFFERENT agent (`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`); fix ≥85% findings before done.
- Never test against the owner's live cloud tree — verify only in the isolated harness (no cloud.js) or the emulator.
- Pure engine files expose on `global`/`window`; node tests read `global.X` (require returns `{}` here).
- Firestore doc for a user already self-writable: `match /users/{userId} { allow read, write: if signedIn() && uid()==userId }` (firestore.rules).

---

### Task 1: Pure membership helpers (active-tree resolution + legacy seed)

**Files:**
- Create: `membership.js` (classic IIFE, node-testable)
- Create: `scripts/membership.test.cjs`
- Modify: `index.html` (loader chain: add before `app.js`)

**Interfaces:**
- Produces (on `window.ftMembership` / `global.ftMembership`):
  - `resolveActiveTree(userData, membershipIds) -> string|null` — `userData.activeTreeId` if it is in `membershipIds`; else `userData.treeId` (legacy) if present; else `membershipIds[0]`; else null.
  - `needsLegacySeed(userData, membershipIds) -> string|null` — returns `userData.treeId` when `membershipIds` is empty AND `userData.treeId` is truthy; else null.

- [ ] **Step 1: Write the failing test** — `scripts/membership.test.cjs`

```js
require('../membership.js');
const M = global.ftMembership;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(!!M, 'ftMembership exposed');
// resolveActiveTree
ok(M.resolveActiveTree({ activeTreeId:'t2' }, ['t1','t2']) === 't2', 'active wins when a member');
ok(M.resolveActiveTree({ activeTreeId:'gone' }, ['t1','t2']) === 't1', 'stale active -> first membership');
ok(M.resolveActiveTree({ treeId:'t9' }, []) === 't9', 'legacy treeId when no memberships');
ok(M.resolveActiveTree({ activeTreeId:'t3', treeId:'t9' }, ['t1','t3']) === 't3', 'active preferred over legacy');
ok(M.resolveActiveTree({}, ['t1']) === 't1', 'first membership fallback');
ok(M.resolveActiveTree({}, []) === null, 'nothing -> null');
ok(M.resolveActiveTree(null, null) === null, 'null-safe');
// needsLegacySeed
ok(M.needsLegacySeed({ treeId:'t9' }, []) === 't9', 'seed when empty + legacy');
ok(M.needsLegacySeed({ treeId:'t9' }, ['t1']) === null, 'no seed when memberships exist');
ok(M.needsLegacySeed({}, []) === null, 'no seed when no legacy');
ok(M.needsLegacySeed(null, []) === null, 'null-safe seed');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

- [ ] **Step 2: Run to verify it fails** — `node scripts/membership.test.cjs` → FAIL (ftMembership undefined).

- [ ] **Step 3: Create `membership.js`**

```js
/* Multi-family membership helpers — pure, node-testable (classic IIFE, no imports).
   The memberships index lists a user's trees; the per-tree members doc is the
   authority (these helpers never decide permission). */
(function(global){
  'use strict';
  function resolveActiveTree(userData, membershipIds){
    userData = userData || {}; membershipIds = membershipIds || [];
    if(userData.activeTreeId && membershipIds.indexOf(userData.activeTreeId) !== -1) return userData.activeTreeId;
    if(userData.treeId) return userData.treeId;                 // legacy single-tree users
    return membershipIds.length ? membershipIds[0] : null;
  }
  function needsLegacySeed(userData, membershipIds){
    userData = userData || {}; membershipIds = membershipIds || [];
    if(!membershipIds.length && userData.treeId) return userData.treeId;
    return null;
  }
  var api = { resolveActiveTree: resolveActiveTree, needsLegacySeed: needsLegacySeed };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ftMembership = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes** — `node scripts/membership.test.cjs` → `11 passed, 0 failed`.

- [ ] **Step 5: Loader chain** — `index.html`, after `photo-paths.js`, before `app.js`:
```html
      .then(function(){ return add('photo-paths.js'); })
      .then(function(){ return add('membership.js'); })
      .then(function(){ return add('app.js'); })
```

- [ ] **Step 6: Commit**
```bash
git add membership.js scripts/membership.test.cjs index.html
git commit -m "feat(multi-family): pure active-tree resolver + legacy-seed helpers"
```

---

### Task 2: `memberships` security rule + emulator tests (SECURITY — different-agent review)

**Files:**
- Modify: `firestore.rules` (add nested match under `/users/{userId}`)
- Modify: `scripts/verify-rules.mjs` (seed + checks)

**Interfaces:**
- Produces: a rule allowing a user to read/write ONLY their own `users/{uid}/memberships/{treeId}` docs.

- [ ] **Step 1: Add the rule** — in `firestore.rules`, replace the users block:
```
    // users/{uid}: self only. Never a source of permission.
    match /users/{userId} {
      allow read, write: if signedIn() && uid() == userId;
      // Self-written index of the trees this user belongs to (role + cached
      // familyName for display). NOT authority — the trees/{t}/members/{uid}
      // doc is. A user can only ever touch their OWN memberships.
      match /memberships/{treeId} {
        allow read, write: if signedIn() && uid() == userId;
      }
    }
```
(The existing `match /users/{userId}` block already has the `allow read, write` line; add the nested `memberships` match inside it. If the current block is a one-liner `{ allow read, write: ... }`, expand it to include the nested match.)

- [ ] **Step 2: Add emulator checks** — in `scripts/verify-rules.mjs`, before `await testEnv.cleanup();`:
```js
// ── Memberships index (self-written; not authority) ──────────────────────
await check('user can write their own membership index', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'users', OWNER, 'memberships', TREE),
    { role: 'owner', familyName: { ar: 'الوزير', en: 'W' } })));

await check('user can read their own membership index', () =>
  assertSucceeds(getDoc(doc(ownerDb, 'users', OWNER, 'memberships', TREE))));

await check('user cannot write ANOTHER user\'s membership index', () =>
  assertFails(setDoc(doc(outsiderDb, 'users', OWNER, 'memberships', TREE), { role: 'owner' })));

await check('user cannot read ANOTHER user\'s membership index', () =>
  assertFails(getDoc(doc(outsiderDb, 'users', OWNER, 'memberships', TREE))));

await check('signed-out cannot write a membership index', () =>
  assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'users', OWNER, 'memberships', TREE), { role: 'owner' })));
```

- [ ] **Step 3: Run** — `npm run test:rules` → all pass (previous 69 + these 5 = 74).

- [ ] **Step 4: Different-agent security review** — dispatch `pr-review-toolkit:code-reviewer` and `pr-review-toolkit:silent-failure-hunter` on the `firestore.rules` memberships change + the Task 5/6 client write paths (once those exist, or re-review at the end). Fix ≥85% findings.

- [ ] **Step 5: Commit**
```bash
git add firestore.rules scripts/verify-rules.mjs
git commit -m "feat(multi-family): self-written memberships index rule + emulator tests"
```

---

### Task 3: Write the membership index on existing signup create/join + a shared helper

**Files:**
- Modify: `cloud.js` — add `writeMembership(...)`; call it in the signup create path (~line 192) and join path (~line 170).

**Interfaces:**
- Produces: `writeMembership(treeId, role, familyName)` → `setDoc(doc(db,'users',currentUid,'memberships',treeId), { role, familyName: familyName||{ar:'',en:''}, joinedAt: serverTimestamp() })`. Also sets `users/{uid}.activeTreeId = treeId` (via `setDoc(..., {merge:true})` on the user doc) at create/join time.

- [ ] **Step 1: Add the helper** in `cloud.js` (near `subscribeTree`):
```js
  async function writeMembership(treeId, role, familyName){
    await setDoc(doc(db, 'users', currentUid, 'memberships', treeId),
      { role: role, familyName: familyName || { ar: '', en: '' }, joinedAt: serverTimestamp() });
  }
```
(`setActiveTree` is defined later in Task 7; this task only needs `writeMembership`.)

- [ ] **Step 2: Signup create path** — after `await setDoc(doc(db, 'users', cred2.user.uid, {...}))` sets the user doc with `treeId` (~line 193), also set `activeTreeId` and write the membership. Change the user-doc write to include `activeTreeId: newCode`, and after it add:
```js
        await setDoc(doc(db, 'users', cred2.user.uid), { email: email, treeId: newCode, activeTreeId: newCode });
        await setDoc(doc(db, 'users', cred2.user.uid, 'memberships', newCode),
          { role: 'owner', familyName: { ar: '', en: '' }, joinedAt: serverTimestamp() });
```
(`currentUid` isn't set yet in this path; use `cred2.user.uid` directly here.)

- [ ] **Step 3: Signup join path** — mirror it (~line 170): include `activeTreeId: joinTreeId` on the user doc and write the membership with `invRole`:
```js
        await setDoc(doc(db, 'users', cred.user.uid), { email: email, treeId: joinTreeId, activeTreeId: joinTreeId });
        await setDoc(doc(db, 'users', cred.user.uid, 'memberships', joinTreeId),
          { role: invRole, familyName: { ar: '', en: '' }, joinedAt: serverTimestamp() });
```

- [ ] **Step 4: Verify** — `node --check cloud.js`. (No node test — covered by harness/manual later.)

- [ ] **Step 5: Commit**
```bash
git add cloud.js
git commit -m "feat(multi-family): seed memberships index + activeTreeId on signup create/join"
```

---

### Task 4: Auth-load uses activeTreeId, lists memberships, auto-migrates legacy

**Files:**
- Modify: `cloud.js` — `onAuthStateChanged` (~lines 252-270).

**Interfaces:**
- Consumes: `window.ftMembership.resolveActiveTree`, `window.ftMembership.needsLegacySeed`, `writeMembership` (Task 3).
- Produces: module var `currentMemberships` (array of `{treeId, role, familyName}`), kept current for the "my families" sheet.

- [ ] **Step 1: Replace the user-load block** (~252-270) with:
```js
      var userSnap = await getDoc(doc(db, 'users', user.uid));
      var userData = userSnap.exists() ? userSnap.data() : {};
      // Load the membership index.
      var memSnap = await getDocs(collection(db, 'users', user.uid, 'memberships'));
      currentMemberships = [];
      memSnap.forEach(function(d){ currentMemberships.push(Object.assign({ treeId: d.id }, d.data())); });
      var memIds = currentMemberships.map(function(m){ return m.treeId; });

      // Legacy auto-migration: a pre-multi-family user has users/{uid}.treeId but no
      // memberships. Seed one from their member doc so nothing breaks.
      var seedId = window.ftMembership.needsLegacySeed(userData, memIds);
      if(seedId){
        var legacyMember = await getDoc(doc(db, 'trees', seedId, 'members', user.uid));
        var legacyTree = await getDoc(doc(db, 'trees', seedId));
        var role = legacyMember.exists() ? (legacyMember.data().role || 'viewer') : 'viewer';
        var fam = legacyTree.exists() ? (legacyTree.data().familyName || { ar:'', en:'' }) : { ar:'', en:'' };
        currentUid = user.uid;   // writeMembership needs currentUid
        await writeMembership(seedId, role, fam);
        await setDoc(doc(db, 'users', user.uid), { activeTreeId: seedId }, { merge: true });
        currentMemberships = [{ treeId: seedId, role: role, familyName: fam }];
        memIds = [seedId];
        userData.activeTreeId = seedId;
      }

      var activeId = window.ftMembership.resolveActiveTree(userData, memIds);
      if(!activeId){
        setLoading(false);
        showErr('تعذّر العثور على عائلة مرتبطة بحسابك. تواصل مع الدعم.');
        return;
      }
      currentUid = user.uid;
      currentTreeId = activeId;
      var memberSnap = await getDoc(doc(db, 'trees', currentTreeId, 'members', user.uid));
      if(!memberSnap.exists()){
        setLoading(false);
        showErr(t('errNoMembership'));
        await signOut(auth).catch(function(){});
        return;
      }
      currentRole = memberSnap.data().role || 'viewer';
      window.__ftSetEditable(currentRole !== 'viewer');
      if(window.__ftSetActiveTree) window.__ftSetActiveTree(currentTreeId);   // per-tree local store (Task 7)
      subscribeTree(currentTreeId);
      authGate.classList.add('hidden');
      cloudBtn.style.display = 'flex'; cloudBtn.title = (auth.currentUser && auth.currentUser.email) || ''; document.getElementById('momentsOpenBtn').style.display = 'flex';
      showAppShell();
      setLoading(false);
```
Add `var currentMemberships = [];` near the other module vars (~line 30). Ensure `getDocs` and `collection` are already imported in cloud.js (they are).

- [ ] **Step 2: Verify** — `node --check cloud.js`.

- [ ] **Step 3: Commit**
```bash
git add cloud.js
git commit -m "feat(multi-family): auth-load resolves activeTreeId, lists memberships, migrates legacy"
```

---

### Task 5: In-app create family + join family (cloud API)

**Files:**
- Modify: `cloud.js` — add `createFamily(name)`, `joinFamily(linkText)`, extend `window.__ftCloud`.

**Interfaces:**
- Consumes: `writeMembership`, `switchFamily` (Task 7).
- Produces on `window.__ftCloud`: `createFamily(nameObj) -> Promise`, `joinFamily(linkText) -> Promise`, `listMemberships() -> array`, `getActiveTreeId() -> string`.

- [ ] **Step 1: Add `createFamily`** (reuses the bootstrap-owner rule; no new auth account):
```js
  async function createFamily(nameObj){
    if(!currentUid) return;
    var treeRef = doc(collection(db, 'trees'));
    var newId = treeRef.id;
    await setDoc(treeRef, { familyName: nameObj || {ar:'',en:''}, lang: 'ar', rootId: null, people: {}, createdBy: currentUid, updatedAt: serverTimestamp() });
    await setDoc(doc(db, 'trees', newId, 'members', currentUid), { email: (auth.currentUser&&auth.currentUser.email)||'', role: 'owner', joinedAt: serverTimestamp() });
    await writeMembership(newId, 'owner', nameObj || {ar:'',en:''});
    currentMemberships.push({ treeId: newId, role: 'owner', familyName: nameObj || {ar:'',en:''} });
    await switchFamily(newId);
  }
```

- [ ] **Step 2: Add `joinFamily`** (reuses the invite rule + the existing link parser):
```js
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
    }catch(e){ console.error('joinFamily failed', e && e.code, e); alert(writeErrMsg ? writeErrMsg(e, t('errJoinFailed')) : t('errJoinFailed')); }
  }
```

- [ ] **Step 3: Extend `window.__ftCloud`** (add to the object literal ~line 827):
```js
    getTreeId: function(){ return currentTreeId; },
    getActiveTreeId: function(){ return currentTreeId; },
    listMemberships: function(){ return currentMemberships.slice(); },
    createFamily: createFamily,
    joinFamily: joinFamily,
    switchFamily: switchFamily
```

- [ ] **Step 4: Add i18n keys** (app.js dict): `errJoinFailed:{ar:'تعذّر الانضمام — تحقّق من الرابط والاتصال',en:'Join failed — check the link and your connection'}`.

- [ ] **Step 5: Verify** — `node --check cloud.js`.

- [ ] **Step 6: Commit**
```bash
git add cloud.js app.js
git commit -m "feat(multi-family): in-app createFamily + joinFamily cloud API"
```

---

### Task 6: "My families" sheet from the Home family name

**Files:**
- Modify: `app.js` — `renderHome` masthead (~line 1381) + a new `showMyFamilies()` + wiring.
- Modify: `styles.css` — sheet styles.

**Interfaces:**
- Consumes: `window.__ftCloud.listMemberships/getActiveTreeId/switchFamily/createFamily/joinFamily`.

- [ ] **Step 1: Make the family name tappable** — change the masthead `fam-row` (~1381) to a button-like element with a ⌄ hint and `id="familySwitcher"`:
```js
        '<div class="fam-row" id="familySwitcher" role="button" tabindex="0"><span class="crest">🌳</span><span class="family-name">'+escapeHtml(fam)+'</span>'+ (window.__ftCloud ? '<span class="fam-caret">⌄</span>' : '') +'</div>' +
```

- [ ] **Step 2: Wire + implement `showMyFamilies`** — in `renderHome` wiring add:
```js
    var fsw = document.getElementById('familySwitcher');
    if(fsw && window.__ftCloud && window.__ftCloud.listMemberships){
      fsw.onclick = showMyFamilies;
      fsw.onkeydown = function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); showMyFamilies(); } };
    }
```
And define:
```js
  function famLabel(fam){ var n = fam && (fam[state.lang] || fam.ar || fam.en); return (n && n.trim()) ? n : t('unnamedFamily'); }
  function showMyFamilies(){
    if(!(window.__ftCloud && window.__ftCloud.listMemberships)) return;
    var mems = window.__ftCloud.listMemberships();
    var active = window.__ftCloud.getActiveTreeId();
    var rows = mems.map(function(m){
      var isActive = m.treeId === active;
      return '<button class="fam-item'+(isActive?' active':'')+'" data-tree="'+escapeHtml(m.treeId)+'">'+
               '<span class="fam-item-name">'+escapeHtml(famLabel(m.familyName))+'</span>'+
               '<span class="fam-item-role">'+t('role_'+m.role)+'</span>'+
               (isActive?'<span class="fam-item-active">●</span>':'')+
             '</button>';
    }).join('');
    openSheet('<h3>'+t('myFamiliesTitle')+'</h3>'+
      '<div class="fam-list">'+rows+'</div>'+
      '<button class="primary-btn" id="fam_create" style="margin-top:12px;">＋ '+t('createFamilyBtn')+'</button>'+
      '<button class="primary-btn" id="fam_join" style="margin-top:10px; background:var(--teal);">🔗 '+t('joinFamilyBtn')+'</button>');
    var sheet = document.getElementById('sheet');
    sheet.querySelectorAll('.fam-item').forEach(function(b){
      b.onclick = function(){ var tid = b.getAttribute('data-tree'); if(tid !== active){ closeSheet(); window.__ftCloud.switchFamily(tid); } };
    });
    document.getElementById('fam_create').onclick = showCreateFamily;
    document.getElementById('fam_join').onclick = showJoinFamily;
  }
```

- [ ] **Step 3: Create/Join mini-forms** (`showCreateFamily`, `showJoinFamily`):
```js
  function showCreateFamily(){
    openSheet('<h3>'+t('createFamilyBtn')+'</h3>'+
      '<div class="field"><label>'+t('familyNameArLabel')+'</label><input type="text" id="cf_ar"></div>'+
      '<div class="field"><label>'+t('familyNameEnLabel')+'</label><input type="text" id="cf_en"></div>'+
      '<button class="primary-btn" id="cf_go">'+t('createFamilyBtn')+'</button>');
    document.getElementById('cf_go').onclick = function(){
      var ar = document.getElementById('cf_ar').value.trim(), en = document.getElementById('cf_en').value.trim();
      if(!ar){ toast(t('toastNameRequired')); return; }
      closeSheet(); toast(t('creatingFamily'));
      window.__ftCloud.createFamily({ ar: ar, en: en || ar });
    };
  }
  function showJoinFamily(){
    openSheet('<h3>'+t('joinFamilyBtn')+'</h3>'+
      '<div class="field"><label>'+t('inviteLinkLabel')+'</label><input type="text" id="jf_link" placeholder="'+escapeHtml(t('inviteLinkPlaceholder'))+'"></div>'+
      '<button class="primary-btn" id="jf_go">'+t('joinFamilyBtn')+'</button>');
    document.getElementById('jf_go').onclick = function(){
      var link = document.getElementById('jf_link').value.trim();
      if(!link){ toast(t('errBadInvite')); return; }
      closeSheet(); toast(t('joiningFamily'));
      window.__ftCloud.joinFamily(link);
    };
  }
```

- [ ] **Step 4: i18n keys** (app.js dict): `myFamiliesTitle`, `createFamilyBtn`, `joinFamilyBtn`, `role_owner`/`role_editor`/`role_viewer`, `familyNameArLabel`, `familyNameEnLabel`, `inviteLinkLabel`, `inviteLinkPlaceholder`, `creatingFamily`, `joiningFamily` — ar+en each. Example:
```js
    myFamiliesTitle:{ar:'عائلاتي', en:'My families'},
    createFamilyBtn:{ar:'إنشاء عائلة جديدة', en:'Create a new family'},
    joinFamilyBtn:{ar:'الانضمام برابط دعوة', en:'Join via invite link'},
    role_owner:{ar:'مالك', en:'Owner'}, role_editor:{ar:'محرِّر', en:'Editor'}, role_viewer:{ar:'مشاهد', en:'Viewer'},
    familyNameArLabel:{ar:'اسم العائلة (عربي)', en:'Family name (Arabic)'},
    familyNameEnLabel:{ar:'اسم العائلة (إنجليزي)', en:'Family name (English)'},
    inviteLinkLabel:{ar:'رابط الدعوة', en:'Invite link'},
    inviteLinkPlaceholder:{ar:'الصق رابط الدعوة هنا', en:'Paste the invite link here'},
    creatingFamily:{ar:'جارِ إنشاء العائلة…', en:'Creating family…'},
    joiningFamily:{ar:'جارِ الانضمام…', en:'Joining…'},
```

- [ ] **Step 5: CSS** (`styles.css`): calm earthy list styles:
```css
.fam-row{ cursor:pointer; }
.fam-caret{ margin-inline-start:6px; font-size:13px; opacity:.8; }
.fam-list{ display:flex; flex-direction:column; gap:8px; margin-top:10px; }
.fam-item{ display:flex; align-items:center; gap:10px; width:100%; text-align:start; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:11px 13px; cursor:pointer; font-family:var(--f-body); }
.fam-item.active{ border-color:var(--emerald); background:var(--paper); }
.fam-item-name{ flex:1; font-size:14px; font-weight:600; color:var(--ink); }
.fam-item-role{ font-size:11.5px; color:var(--ink-soft); background:var(--paper-deep); border-radius:20px; padding:2px 9px; }
.fam-item-active{ color:var(--emerald); }
```

- [ ] **Step 6: Verify** — `node --check app.js`; bump `styles.css?v=` in index.html (next number).

- [ ] **Step 7: Commit**
```bash
git add app.js styles.css index.html
git commit -m "feat(multi-family): 'my families' sheet (list/switch/create/join) from Home"
```

---

### Task 7: `switchFamily` + per-tree local store

**Files:**
- Modify: `cloud.js` — `switchFamily(treeId)` + `setActiveTree`.
- Modify: `app.js` — per-tree `STORAGE_KEY`, `window.__ftSetActiveTree`.

**Interfaces:**
- Produces: `switchFamily(treeId)` (cloud) and `window.__ftSetActiveTree(treeId)` (app) that re-points the local store and reloads.

- [ ] **Step 1: Per-tree store in app.js** — replace `var STORAGE_KEY = "family-tree:data";` (~386) with:
```js
  var STORAGE_BASE = "family-tree:data";
  var STORAGE_KEY = STORAGE_BASE;   // becomes per-tree once the active tree is known
  // One-time migration of the old shared key happens in __ftSetActiveTree.
  window.__ftSetActiveTree = function(treeId){
    if(!treeId) return;
    var newKey = STORAGE_BASE + ':' + treeId;
    try{
      // Migrate the legacy shared slot into this tree's slot once.
      if(!localStorage.getItem(newKey) && localStorage.getItem(STORAGE_BASE)){
        localStorage.setItem(newKey, localStorage.getItem(STORAGE_BASE));
        localStorage.removeItem(STORAGE_BASE);
      }
    }catch(e){}
    STORAGE_KEY = newKey;
    load();      // reload state from this tree's local slot (cloud snapshot will refine)
    render();
    if(window.__ftRenderHome) window.__ftRenderHome();
  };
```
`save()`/`load()` already use `STORAGE_KEY`, so they follow automatically.

- [ ] **Step 2: `setActiveTree` + `switchFamily` in cloud.js**:
```js
  async function setActiveTree(treeId){
    try{ await setDoc(doc(db, 'users', currentUid), { activeTreeId: treeId }, { merge: true }); }
    catch(e){ console.warn('setActiveTree failed', e && e.code); }
  }
  async function switchFamily(treeId){
    if(!treeId) return;
    var memberSnap = await getDoc(doc(db, 'trees', treeId, 'members', currentUid));
    if(!memberSnap.exists()){ alert(t('errNoMembership')); return; }
    if(unsubTree){ unsubTree(); unsubTree = null; }
    remoteLoaded = false;
    currentTreeId = treeId;
    currentRole = memberSnap.data().role || 'viewer';
    window.__ftSetEditable(currentRole !== 'viewer');
    if(window.__ftSetActiveTree) window.__ftSetActiveTree(treeId);   // swap local store + reload
    subscribeTree(treeId);
    await setActiveTree(treeId);
    if(window.__ftShowTab) window.__ftShowTab('home');
  }
```

- [ ] **Step 3: Verify** — `node --check cloud.js app.js`.

- [ ] **Step 4: Commit**
```bash
git add cloud.js app.js
git commit -m "feat(multi-family): switchFamily + per-tree localStorage with legacy key migration"
```

---

### Task 8: Isolated-harness verification of the UI + resolver

**Files:** none (verification only).

- [ ] **Step 1:** Regenerate the harness (`_d1.html` = index.html minus the `cloud.js` module line) and load it on the local server.
- [ ] **Step 2:** Confirm `ftMembership` is present and `resolveActiveTree`/`needsLegacySeed` behave (quick `javascript_tool` calls). Confirm `cloud`/`firebase` are `undefined` (isolation).
- [ ] **Step 3:** Inject a fake `window.__ftCloud` with `listMemberships` returning 2 families + `getActiveTreeId`, apply a tree, open Home, click `#familySwitcher`, and confirm the "my families" sheet lists both with the active marked, and the create/join mini-forms open. (No real switch — stub the methods and assert they're called.)
- [ ] **Step 4:** Screenshot the sheet (mobile viewport) to confirm the calm design.

(No commit — verification task.)

---

### Task 9: Live verification, deploy, finish

- [ ] **Step 1:** Full node suite green (`for f in scripts/*.test.cjs; do node "$f"; done`) + `npm run test:rules` (74).
- [ ] **Step 2:** Final different-agent review (`pr-review-toolkit:code-reviewer` on the whole branch) if not already clean; fix ≥85%.
- [ ] **Step 3:** Owner takes a fresh JSON backup (outside repo).
- [ ] **Step 4:** With owner consent: `firebase deploy --only firestore:rules --project family-tree-app-d9238`, then merge `feat/multi-family` → `main` and push. Bump SW cache.
- [ ] **Step 5:** On the owner's device: confirm legacy auto-migration (one membership appears, app still loads the existing tree), create a 2nd family, switch between them, join via an invite link, reload and confirm the active family persists.
- [ ] **Step 6:** REQUIRED SUB-SKILL: Use superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** §4 data model → Tasks 3,4,7; §5 UI → Task 6; §6 create/join → Tasks 3,5,6; §7 switch → Task 7; §8 migration → Tasks 4,7; §9 security → Task 2 (+review); §10 testing → Tasks 1,2,8,9. All covered.

**Placeholder scan:** The two intentional "discard the stub" notes in Tasks 3 & 7 are followed immediately by the correct code — the implementer writes only the corrected block. No TBD/vague-handling left.

**Type consistency:** `writeMembership(treeId, role, familyName)`, `switchFamily(treeId)`, `window.__ftSetActiveTree(treeId)`, `currentMemberships` entries `{treeId, role, familyName}`, and `window.__ftCloud.{listMemberships,getActiveTreeId,switchFamily,createFamily,joinFamily}` are consistent across Tasks 3–7. `ftMembership.{resolveActiveTree,needsLegacySeed}` consistent across Tasks 1,4.
