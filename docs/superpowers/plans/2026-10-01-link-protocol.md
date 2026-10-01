# Family Link Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two tree owners mutually consent to link a shared person across their trees via a token request (like invites), producing mirrored `same_person` link docs that grant `view_tree`.

**Architecture:** Owner A creates `trees/A/linkRequests/{token}` carrying person X's id + denormalized display names, shared as `#link=A.token`. Owner B opens it, picks the matching person Y, and `approveLink` writes mirrored `links/{linkId}` docs on both trees (B's side by ownership, A's side authorized by the matching pending request). Pure helpers (parse/build) are node-tested; new Firestore rules gate it; navigation is deferred to project 3.

**Tech Stack:** Vanilla JS (classic IIFE engines + app.js; cloud.js ES module), Firebase 10.13.2 (Firestore), Firebase emulator for rules tests, Node `.cjs` for pure-logic tests.

## Global Constraints

- Authority is `trees/{treeId}/members/{uid}` ONLY — a link grants `view_tree`, never write, never owner.
- `personId` is eternal — links reference ids; denormalized names are display-only copies.
- No global person registry — each tree keeps its own record; a link is a reference, not a merge.
- Repo is PUBLIC; Firebase on free Spark — no paid products. The link token is a secret shared out-of-band (same trust model as invite tokens).
- Security-relevant changes (the new rules) MUST be reviewed by a DIFFERENT agent (`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`); fix ≥85% findings.
- Never test against the live cloud tree — verify only in the isolated harness (no cloud.js) or the emulator.
- Pure engine files expose on `global`/`window`; node tests read `global.X`.
- Existing helpers in firestore.rules: `isOwner(treeId)`, `isMember(treeId)`, `signedIn()`, `inviteDoc(treeId, token)` — mirror these.

## Data shapes (authoritative for every task)

- `trees/{A}/linkRequests/{token}` = `{ localPersonId, localPersonName:{ar,en}, localFamilyName:{ar,en}, requestedBy, kind:'same_person', createdAt }`
- `trees/{T}/links/{linkId}` = `{ localPersonId, remoteTreeId, remotePersonId, remoteFamilyName:{ar,en}, kind:'same_person', status:'accepted', requestedBy, approvedBy, grantedScope:'view_tree', viaRequest?:token, createdAt }`
  (`viaRequest` present only on the remote-authorized side = tree A's copy.)

---

### Task 1: Pure link helpers (parse hash + build mirrored pair)

**Files:**
- Create: `links.js` (classic IIFE)
- Create: `scripts/links.test.cjs`
- Modify: `index.html` (loader: add before `app.js`)

**Interfaces (on `window.ftLinks` / `global.ftLinks`):**
- `parseLinkHash(text) -> {treeId, token}|null` — accepts a full `…#link=<treeId>.<token>` or bare `<treeId>.<token>`; strips to after `#link=`, decodes, splits on the FIRST dot, rejects empty parts or any `/`.
- `buildLinkPair(req, approveTreeId, remotePersonId, remoteFamilyName, approvedBy, linkId) -> {aSide, bSide}` where `req = {treeId, token, localPersonId, localPersonName, localFamilyName, requestedBy}` is the request's tree A context, `approveTreeId` = B. Returns the two link field objects (A's copy carries `viaRequest: req.token`).

- [ ] **Step 1: Write the failing test** — `scripts/links.test.cjs`

```js
require('../links.js');
const L = global.ftLinks;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }
ok(!!L, 'ftLinks exposed');
// parseLinkHash
ok(JSON.stringify(L.parseLinkHash('x#link=A.tok123')) === JSON.stringify({treeId:'A',token:'tok123'}), 'full link');
ok(JSON.stringify(L.parseLinkHash('A.tok')) === JSON.stringify({treeId:'A',token:'tok'}), 'bare');
ok(L.parseLinkHash('nodot') === null, 'no dot -> null');
ok(L.parseLinkHash('#link=.tok') === null, 'empty tree -> null');
ok(L.parseLinkHash('#link=A.') === null, 'empty token -> null');
ok(L.parseLinkHash('#link=a/b.tok') === null, 'slash in tree -> null');
ok(L.parseLinkHash('') === null, 'empty -> null');
// buildLinkPair
const req = { treeId:'A', token:'tk', localPersonId:'x', localPersonName:{ar:'فاطمة',en:'F'}, localFamilyName:{ar:'الوزير',en:'W'}, requestedBy:'uidA' };
const p = L.buildLinkPair(req, 'B', 'y', {ar:'إبراهيم',en:'Ibrahim'}, 'uidB', 'L1');
ok(p.aSide.localPersonId==='x' && p.aSide.remoteTreeId==='B' && p.aSide.remotePersonId==='y', 'A side points to B/y');
ok(p.aSide.viaRequest==='tk', 'A side carries viaRequest');
ok(p.aSide.remoteFamilyName.ar==='إبراهيم', 'A side shows B family name');
ok(p.bSide.localPersonId==='y' && p.bSide.remoteTreeId==='A' && p.bSide.remotePersonId==='x', 'B side points to A/x');
ok(p.bSide.viaRequest===undefined, 'B side has no viaRequest');
ok(p.bSide.remoteFamilyName.ar==='الوزير', 'B side shows A family name');
ok(p.aSide.kind==='same_person' && p.aSide.status==='accepted' && p.aSide.grantedScope==='view_tree', 'A side constants');
ok(p.bSide.approvedBy==='uidB' && p.bSide.requestedBy==='uidA', 'both record approver+requester');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

- [ ] **Step 2: Run to verify it fails** — `node scripts/links.test.cjs` → FAIL.

- [ ] **Step 3: Create `links.js`**

```js
/* Family-link pure helpers — parse a link request hash and build the mirrored
   link-doc pair. No imports; node-testable. The per-tree members doc stays the
   authority — a link only grants view (consumed in project 3). */
(function(global){
  'use strict';
  function parseLinkHash(text){
    var raw = String(text == null ? '' : text).trim();
    var i = raw.indexOf('#link='); if(i !== -1) raw = raw.slice(i + '#link='.length);
    try{ raw = decodeURIComponent(raw); }catch(e){}
    raw = raw.trim();
    var dot = raw.indexOf('.');
    if(dot < 1) return null;
    var treeId = raw.slice(0, dot), token = raw.slice(dot + 1);
    if(!treeId || !token || treeId.indexOf('/') !== -1 || token.indexOf('/') !== -1) return null;
    return { treeId: treeId, token: token };
  }
  function buildLinkPair(req, approveTreeId, remotePersonId, remoteFamilyName, approvedBy, linkId){
    var common = { kind: 'same_person', status: 'accepted', grantedScope: 'view_tree',
                   requestedBy: req.requestedBy, approvedBy: approvedBy };
    var aSide = Object.assign({}, common, {
      localPersonId: req.localPersonId, remoteTreeId: approveTreeId, remotePersonId: remotePersonId,
      remoteFamilyName: remoteFamilyName || {ar:'',en:''}, viaRequest: req.token
    });
    var bSide = Object.assign({}, common, {
      localPersonId: remotePersonId, remoteTreeId: req.treeId, remotePersonId: req.localPersonId,
      remoteFamilyName: req.localFamilyName || {ar:'',en:''}
    });
    return { aSide: aSide, bSide: bSide, linkId: linkId };
  }
  var api = { parseLinkHash: parseLinkHash, buildLinkPair: buildLinkPair };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ftLinks = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes** — `node scripts/links.test.cjs` → all pass.

- [ ] **Step 5: Loader** — `index.html`, after `membership.js`, before `app.js`:
```html
      .then(function(){ return add('membership.js'); })
      .then(function(){ return add('links.js'); })
      .then(function(){ return add('app.js'); })
```

- [ ] **Step 6: Commit**
```bash
git add links.js scripts/links.test.cjs index.html
git commit -m "feat(links): pure link-hash parser + mirrored link-pair builder"
```

---

### Task 2: linkRequests + links security rules + emulator tests (SECURITY — different-agent review)

**Files:**
- Modify: `firestore.rules` (helper + two matches under `/trees/{treeId}`)
- Modify: `scripts/verify-rules.mjs` (seed + checks)

- [ ] **Step 1: Add helper + rules** — in `firestore.rules`, add `linkRequestDoc` next to `inviteDoc` (~line 28):
```
    function linkRequestDoc(treeId, token) {
      return /databases/$(database)/documents/trees/$(treeId)/linkRequests/$(token);
    }
```
Then inside `match /trees/{treeId} { … }`, after the `photos` block, add:
```
      match /linkRequests/{token} {
        allow get:    if signedIn();
        allow list:   if isOwner(treeId);
        allow create: if isOwner(treeId) && request.resource.data.kind == 'same_person';
        allow delete: if isOwner(treeId);
        allow update: if false;
      }

      match /links/{linkId} {
        allow read:   if isMember(treeId);
        allow create: if signedIn()
                      && request.resource.data.kind == 'same_person'
                      && request.resource.data.status == 'accepted'
                      && request.resource.data.grantedScope == 'view_tree'
                      && (
                        isOwner(treeId)
                        ||
                        ( exists(linkRequestDoc(treeId, request.resource.data.viaRequest))
                          && get(linkRequestDoc(treeId, request.resource.data.viaRequest)).data.localPersonId
                               == request.resource.data.localPersonId )
                      );
        allow delete: if isOwner(treeId);
        allow update: if false;
      }
```

- [ ] **Step 2: Add emulator checks** — in `scripts/verify-rules.mjs`, seed a pending request (in the rules-disabled `seed()` function, after the photos seed):
```js
  await setDoc(doc(db, 'trees', TREE, 'linkRequests', 'req1'),
    { localPersonId: 'pX', localPersonName:{ar:'ف',en:'F'}, localFamilyName:{ar:'الوزير',en:'W'}, requestedBy: OWNER, kind:'same_person' });
```
Then before `await testEnv.cleanup();` add (OWNER owns TREE; EDITOR is editor; OUTSIDER is a non-member standing in for "another tree's owner"):
```js
// ── linkRequests ─────────────────────────────────────────────────────────
await check('owner can create a link request', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req2'), { kind:'same_person', localPersonId:'pA', requestedBy: OWNER })));
await check('editor cannot create a link request (owner only)', () =>
  assertFails(setDoc(doc(editorDb, 'trees', TREE, 'linkRequests', 'req3'), { kind:'same_person', localPersonId:'pA', requestedBy: EDITOR })));
await check('any signed-in user can read a link request by token', () =>
  assertSucceeds(getDoc(doc(outsiderDb, 'trees', TREE, 'linkRequests', 'req1'))));
await check('a request cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req1'), { localPersonId:'z' })));
await check('owner can delete their link request', () =>
  assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req2'))));
// ── links ────────────────────────────────────────────────────────────────
const LINK = { kind:'same_person', status:'accepted', grantedScope:'view_tree', requestedBy:OWNER, approvedBy:OWNER, remoteTreeId:'tB', remotePersonId:'pY', remoteFamilyName:{ar:'',en:''} };
await check('owner can create their own link copy', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'links', 'L_own'), Object.assign({ localPersonId:'pX' }, LINK))));
await check('remote approver can create A-side link via a matching pending request', () =>
  assertSucceeds(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_via'), Object.assign({ localPersonId:'pX', viaRequest:'req1' }, LINK))));
await check('link create FAILS with a non-existent request', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_bad'), Object.assign({ localPersonId:'pX', viaRequest:'nope' }, LINK))));
await check('link create FAILS when localPersonId does not match the request', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_mismatch'), Object.assign({ localPersonId:'WRONG', viaRequest:'req1' }, LINK))));
await check('link create FAILS with a forged grantedScope', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_scope'), Object.assign({ localPersonId:'pX', viaRequest:'req1', grantedScope:'edit' }, { kind:'same_person', status:'accepted', requestedBy:OWNER, approvedBy:OWNER, remoteTreeId:'tB', remotePersonId:'pY' }))));
await check('member can read links', () =>
  assertSucceeds(getDoc(doc(viewerDb, 'trees', TREE, 'links', 'L_own'))));
await check('outsider cannot read links', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_own'))));
await check('a link cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'links', 'L_own'), { remoteTreeId:'evil' })));
await check('owner can revoke (delete) a link; editor cannot', async () => {
  await assertFails(deleteDoc(doc(editorDb, 'trees', TREE, 'links', 'L_own')));
  await assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'links', 'L_own')));
});
```

- [ ] **Step 3: Run** — `npm run test:rules` → all pass (74 + ~14).

- [ ] **Step 4: Different-agent security review** (deferred to the end-of-branch review covering rules + client paths). Note it here; do not skip at Task 8.

- [ ] **Step 5: Commit**
```bash
git add firestore.rules scripts/verify-rules.mjs
git commit -m "feat(links): linkRequests + links rules (owner-or-pending-request) + emulator tests"
```

---

### Task 3: `requestLink` (owner A generates the request + #link)

**Files:** Modify: `cloud.js` — add `requestLink(personId)`; extend `window.__ftCloud`.

**Interfaces:** Produces `window.__ftCloud.requestLink(personId, personName, familyName) -> Promise` that writes `trees/{currentTreeId}/linkRequests/{token}` and copies `…#link=<treeId>.<token>` to the clipboard.

- [ ] **Step 1: Add `requestLink`** (near `createInvite`):
```js
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
```

- [ ] **Step 2: Extend `window.__ftCloud`** — add `requestLink: requestLink` to the object literal.

- [ ] **Step 3: i18n keys** (app.js): `linkOwnerOnly:{ar:'الربط بعائلة أخرى متاح لمالك الشجرة فقط',en:'Only the tree owner can link to another family'}`, `linkRequestCopied:{ar:'نُسخ رابط طلب الربط — أرسله لمالك العائلة الأخرى',en:'Link request copied — send it to the other family\'s owner'}`, `linkRequestFail:{ar:'تعذّر إنشاء طلب الربط',en:'Could not create the link request'}`.

- [ ] **Step 4: Verify** — `node --check cloud.js`.

- [ ] **Step 5: Commit**
```bash
git add cloud.js app.js
git commit -m "feat(links): requestLink — owner generates a #link= request"
```

---

### Task 4: `approveLink` + `loadLinks` (owner B approves; both sides written)

**Files:** Modify: `cloud.js` — add `approveLink`, `loadLinks`, `revokeLink`, module var `currentLinks`; extend `window.__ftCloud`; call `loadLinks` after each tree snapshot.

**Interfaces:** Produces `window.__ftCloud.{ readLinkRequest(reqTreeId, token), approveLink(req, remotePersonId, remoteFamilyName), listLinks(), revokeLink(linkId) }`.

- [ ] **Step 1: Add the functions** (near `requestLink`), using `window.ftLinks.buildLinkPair`:
```js
  var currentLinks = [];   // [{linkId, ...link}] for the active tree
  async function readLinkRequest(reqTreeId, token){
    var snap = await getDoc(doc(db, 'trees', reqTreeId, 'linkRequests', token));
    if(!snap.exists()) return null;
    return Object.assign({ treeId: reqTreeId, token: token }, snap.data());
  }
  async function approveLink(req, remotePersonId, remoteFamilyName){
    if(!currentTreeId || currentRole !== 'owner'){ alert(t('linkOwnerOnly')); return; }
    try{
      var linkId = (doc(collection(db, 'trees', currentTreeId, 'links'))).id;
      var pair = window.ftLinks.buildLinkPair(req, currentTreeId, remotePersonId, remoteFamilyName, currentUid, linkId);
      // B's own copy first (by ownership); then A's copy (authorized by the pending request).
      await setDoc(doc(db, 'trees', currentTreeId, 'links', linkId), Object.assign({ createdAt: serverTimestamp() }, pair.bSide));
      await setDoc(doc(db, 'trees', req.treeId, 'links', linkId), Object.assign({ createdAt: serverTimestamp() }, pair.aSide));
      toast(t('linkApproved'));
    }catch(e){ console.error('approveLink failed', e && e.code, e); alert(writeErrMsg(e, t('linkApproveFail'))); }
  }
  function loadLinks(){
    if(!currentTreeId){ currentLinks = []; return; }
    getDocs(collection(db, 'trees', currentTreeId, 'links')).then(function(snap){
      currentLinks = []; snap.forEach(function(d){ currentLinks.push(Object.assign({ linkId: d.id }, d.data())); });
      if(window.__ftRenderHome) window.__ftRenderHome();
    }, function(){ currentLinks = []; });
  }
  async function revokeLink(linkId){
    try{ await deleteDoc(doc(db, 'trees', currentTreeId, 'links', linkId)); currentLinks = currentLinks.filter(function(l){ return l.linkId !== linkId; }); toast(t('linkRevoked')); }
    catch(e){ console.error('revokeLink failed', e && e.code, e); alert(writeErrMsg(e, t('linkRevokeFail'))); }
  }
```

- [ ] **Step 2: Load links after each snapshot** — in `subscribeTree`'s onSnapshot success (after `invalidateCache()`/`maybeMigratePhotos()`), add `loadLinks();`. Also reset `currentLinks = []` at the start of `switchFamily`.

- [ ] **Step 3: Extend `window.__ftCloud`** — add `readLinkRequest, approveLink, listLinks: function(){ return currentLinks.slice(); }, revokeLink`.

- [ ] **Step 4: i18n keys** (app.js): `linkApproved:{ar:'تمّ الربط ✓',en:'Linked ✓'}`, `linkApproveFail:{ar:'تعذّرت الموافقة على الربط',en:'Could not approve the link'}`, `linkRevoked:{ar:'أُلغي الربط',en:'Link removed'}`, `linkRevokeFail:{ar:'تعذّر إلغاء الربط',en:'Could not remove the link'}`.

- [ ] **Step 5: Verify** — `node --check cloud.js`.

- [ ] **Step 6: Commit**
```bash
git add cloud.js app.js
git commit -m "feat(links): approveLink writes mirrored link docs + loadLinks/revokeLink"
```

---

### Task 5: Profile UI — "link to another family" button + linked badge + revoke

**Files:** Modify: `app.js` — `openProfile` (actions ~2231 + wiring ~2241).

- [ ] **Step 1: Add the button + badge** — in `openProfile`, after the `prof_kin` button (owner only), add a link button; and compute this person's existing links from `window.__ftCloud.listLinks()`:
```js
    var myLinks = (window.__ftCloud && window.__ftCloud.listLinks) ? window.__ftCloud.listLinks().filter(function(l){ return l.localPersonId === id; }) : [];
    var isOwner = window.__ftCloud && window.__ftCloud.getActiveTreeId && currentRole_isOwner();
```
Add a helper `currentRole_isOwner()` that reads a flag the cloud exposes — simplest: expose `window.__ftCloud.isOwner = function(){ return currentRole==='owner'; }` in cloud.js (Task 4 Step 3). Then:
```js
    var linkBtn = (window.__ftCloud && window.__ftCloud.isOwner && window.__ftCloud.isOwner())
      ? '<button class="primary-btn" id="prof_link" style="background:var(--teal);">🔗 '+t('linkToFamilyBtn')+'</button>' : '';
    var linkBadges = myLinks.map(function(l){
      return '<div class="prof-link-badge">🔗 '+t('linkedToFamily')+' «'+escapeHtml(famLabel(l.remoteFamilyName))+'»'+
             (window.__ftCloud.isOwner && window.__ftCloud.isOwner() ? ' <button class="prof-link-revoke" data-link="'+escapeHtml(l.linkId)+'">'+t('linkRevokeBtn')+'</button>' : '')+'</div>';
    }).join('');
```
Insert `linkBadges` into the profile body (e.g. after the nasab box) and `linkBtn` into the actions row.

- [ ] **Step 2: Wire** — after `openSheet(...)` wiring in `openProfile`:
```js
    var plink = document.getElementById('prof_link');
    if(plink) plink.onclick = function(){ window.__ftCloud.requestLink(id, p.name, state.familyName); };
    (document.getElementById('sheet')||document).querySelectorAll('.prof-link-revoke').forEach(function(b){
      b.onclick = function(){ if(confirm(t('linkRevokeConfirm'))) window.__ftCloud.revokeLink(b.getAttribute('data-link')); };
    });
```

- [ ] **Step 3: i18n keys**: `linkToFamilyBtn:{ar:'ربط بعائلة أخرى',en:'Link to another family'}`, `linkedToFamily:{ar:'مرتبط بعائلة',en:'Linked to family'}`, `linkRevokeBtn:{ar:'إلغاء',en:'Unlink'}`, `linkRevokeConfirm:{ar:'إلغاء هذا الربط؟',en:'Remove this link?'}`.

- [ ] **Step 4: CSS** (`styles.css`): `.prof-link-badge{ background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:8px 11px; margin-bottom:8px; font-size:13px; color:var(--ink); } .prof-link-revoke{ background:none; border:none; color:var(--danger); font-size:12px; cursor:pointer; margin-inline-start:6px; }` — bump `styles.css?v=`.

- [ ] **Step 5: Verify** — `node --check app.js`.

- [ ] **Step 6: Commit**
```bash
git add app.js styles.css index.html
git commit -m "feat(links): profile link button + linked badge + revoke"
```

---

### Task 6: Approver flow — open #link=, pick person Y, approve

**Files:** Modify: `cloud.js` (hash handler for `#link=` when logged in) + `app.js` (approver sheet with person search).

- [ ] **Step 1: Detect `#link=` on load/hashchange** — in `cloud.js`, after auth is established (the app shell is shown), check `location.hash` for `#link=`; if present and logged in, call `window.__ftOpenLinkApproval(parsed)`. Add a small handler that runs on auth-ready and on `window.addEventListener('hashchange', …)`:
```js
  function maybeHandleLinkHash(){
    if(!currentUid) return;
    var p = window.ftLinks ? window.ftLinks.parseLinkHash(location.hash) : null;
    if(!p) return;
    readLinkRequest(p.treeId, p.token).then(function(req){
      if(!req){ alert(t('linkReqNotFound')); return; }
      if(req.treeId === currentTreeId){ alert(t('linkSameTree')); return; }
      if(window.__ftOpenLinkApproval) window.__ftOpenLinkApproval(req);
    }, function(){ alert(t('linkReqNotFound')); });
  }
```
Call `maybeHandleLinkHash()` at the end of the successful auth-load block, and `window.addEventListener('hashchange', maybeHandleLinkHash)`.

- [ ] **Step 2: Approver sheet in app.js** — `window.__ftOpenLinkApproval(req)` shows req's person/family name and a search box over the CURRENT tree's people:
```js
  window.__ftOpenLinkApproval = function(req){
    if(!(window.__ftCloud && window.__ftCloud.isOwner && window.__ftCloud.isOwner())){ toast(t('linkOwnerOnly')); return; }
    openSheet('<h3>'+t('linkApproveTitle')+'</h3>'+
      '<div class="context">'+tf('linkApproveIntro', { name: escapeHtml(famLabel(req.localPersonName)), family: escapeHtml(famLabel(req.localFamilyName)) })+'</div>'+
      '<div class="field"><input type="text" id="lk_search" placeholder="'+escapeHtml(t('linkPickPerson'))+'"></div>'+
      '<div class="lk-results" id="lk_results"></div>');
    var input = document.getElementById('lk_search'), results = document.getElementById('lk_results');
    input.addEventListener('input', function(){
      var q = this.value.trim().toLowerCase(); results.innerHTML = '';
      if(!q) return;
      var ids = Object.keys(state.people).filter(function(id){ return fullNameOf(state.people[id]).toLowerCase().indexOf(q) !== -1; }).slice(0,8);
      results.innerHTML = ids.map(function(id){ return '<button class="lk-result" data-id="'+escapeHtml(id)+'">'+escapeHtml(fullNameOf(state.people[id]))+'</button>'; }).join('');
      results.querySelectorAll('.lk-result').forEach(function(b){
        b.onclick = function(){
          var yid = b.getAttribute('data-id');
          if(!confirm(tf('linkConfirm', { y: fullNameOf(state.people[yid]), x: famLabel(req.localPersonName) }))) return;
          closeSheet();
          window.__ftCloud.approveLink(req, yid, state.familyName);
          try{ history.replaceState(null, '', location.pathname); }catch(e){}   // clear #link=
        };
      });
    });
    input.focus();
  };
```

- [ ] **Step 3: i18n keys**: `linkReqNotFound`, `linkSameTree`, `linkApproveTitle`, `linkApproveIntro` (uses `{name}`,`{family}`), `linkPickPerson`, `linkConfirm` (uses `{y}`,`{x}`) — ar+en each. Example:
```js
    linkReqNotFound:{ar:'طلب الربط غير موجود أو انتهى',en:'Link request not found or expired'},
    linkSameTree:{ar:'هذا الطلب من شجرتك نفسها',en:'This request is from your own tree'},
    linkApproveTitle:{ar:'طلب ربط عائلة',en:'Family link request'},
    linkApproveIntro:{ar:'عائلة «{family}» تطلب ربط «{name}» بشخص في شجرتك. اختر الشخص المقابل:',en:'Family "{family}" asks to link "{name}" to someone in your tree. Pick the matching person:'},
    linkPickPerson:{ar:'ابحث عن الشخص المقابل…',en:'Search for the matching person…'},
    linkConfirm:{ar:'ربط «{y}» في شجرتك بـ«{x}» في العائلة الأخرى؟',en:'Link "{y}" in your tree to "{x}" in the other family?'},
```

- [ ] **Step 4: CSS** (`styles.css`): `.lk-results{ display:flex; flex-direction:column; gap:6px; } .lk-result{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:9px 11px; text-align:start; cursor:pointer; font-family:var(--f-body); font-size:14px; }`

- [ ] **Step 5: Verify** — `node --check cloud.js app.js`.

- [ ] **Step 6: Commit**
```bash
git add cloud.js app.js styles.css
git commit -m "feat(links): approver flow — open #link=, search and pick Y, approve"
```

---

### Task 7: Isolated-harness verification

- [ ] **Step 1:** Regenerate `_d1.html`; confirm `ftLinks` present, `parseLinkHash`/`buildLinkPair` behave, `cloud` undefined (isolation).
- [ ] **Step 2:** Stub `window.__ftCloud` with `isOwner()==true`, `requestLink` (record call), `listLinks` returning one link for a person, and `approveLink` (record args). Open a person profile: confirm the "🔗 ربط بعائلة أخرى" button appears and calls `requestLink(id, name, family)`; confirm the linked badge renders for a person with a link and revoke calls `revokeLink`.
- [ ] **Step 3:** Call `window.__ftOpenLinkApproval({treeId:'A',token:'t',localPersonId:'x',localPersonName:{ar:'فاطمة'},localFamilyName:{ar:'الوزير'},requestedBy:'u'})`; type a query, pick a person, confirm `approveLink` is called with the picked id + the current family name.
- [ ] **Step 4:** Screenshot the approver sheet (mobile) for the calm design.

(No commit.)

---

### Task 8: Live verification, deploy, finish

- [ ] **Step 1:** Full node suite green + `npm run test:rules`.
- [ ] **Step 2:** Different-agent whole-branch review (`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`) on rules + client link paths; fix ≥85%.
- [ ] **Step 3:** With owner consent: `firebase deploy --only firestore:rules`; merge `feat/link-protocol` → `main`; push; bump SW cache.
- [ ] **Step 4:** On two accounts/trees owned by the owner: generate a #link on person X in tree A, open it while active on tree B, pick Y, approve; confirm both `links` docs exist and the badge shows on both sides; revoke from one side and confirm its copy is gone.
- [ ] **Step 5:** REQUIRED SUB-SKILL: Use superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** §4 data → Tasks 1,3,4; §5 flow → Tasks 3,4,6; §6 security → Task 2; §7 UI → Tasks 5,6; §8 revoke → Tasks 4,5; §9 testing → Tasks 1,2,7,8. All covered. (Refinement vs spec: requests/links carry denormalized `localPersonName`/`localFamilyName`/`remoteFamilyName` so the approver — who cannot read tree A's people — sees who they're linking; noted in Data shapes.)

**Placeholder scan:** No vague steps; every code step shows the code. `currentRole_isOwner()` in Task 5 is resolved to `window.__ftCloud.isOwner()` (exposed in Task 4 Step 3).

**Type consistency:** `parseLinkHash -> {treeId,token}`, `buildLinkPair(req, approveTreeId, remotePersonId, remoteFamilyName, approvedBy, linkId) -> {aSide,bSide,linkId}`, `requestLink(personId, personName, familyName)`, `approveLink(req, remotePersonId, remoteFamilyName)`, `readLinkRequest(reqTreeId, token)`, `listLinks()`, `revokeLink(linkId)`, `isOwner()` — consistent across Tasks 1,3,4,5,6. Link doc fields match the Data shapes block everywhere.
