# Cross-Tree Read-Only View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a family link actionable — tapping "🔗 مرتبط بعائلة A" opens tree A **read-only**, centered on the linked person, live, with strict state isolation and no cross-tree writes.

**Architecture:** Approval writes a uid-keyed `trees/{t}/viewers/{uid}` grant on each tree (in the existing atomic `writeBatch`). A new `canViewTree(t) = isMember(t) || exists(viewerDoc(t, uid()))` opens tree + photos reads only; every write and the private feed (moments/activity/comments/members) stay `isMember`. The client reads the remote tree once, swaps it into an isolated **linked-view** state (pausing the user's own save/sync), renders read-only, and restores the user's tree on back.

**Tech Stack:** Vanilla JS (classic IIFE engines + app.js; cloud.js ES module), Firebase 10.13.2 (Firestore `writeBatch`/`getDoc`), Firebase emulator for rules, Node `.cjs` for pure logic.

## Global Constraints

- Authority is `trees/{treeId}/members/{uid}` ONLY. A viewer grant is NOT membership and grants READ ONLY — never write, never owner.
- State isolation is sacred: viewing another tree must never write the user's `state`, localStorage, or cloud. (See memory: a prior bug overwrote the owner's real tree.)
- `personId` eternal · tree `delete: if false` · `t()` is the only text output path · no hardcoded user-facing strings.
- Repo PUBLIC, Firebase free Spark — no paid products.
- Security-relevant changes (the new rules) MUST be reviewed by a DIFFERENT agent (`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`); fix ≥85% findings.
- Never verify against a live logged-in cloud session — isolated `_d1.html` harness only.
- Existing rule helpers: `isOwner`, `isMember`, `signedIn`, `uid`, `canEdit`, `linkRequestDoc`. Existing imports in cloud.js already include `writeBatch`, `getDoc`, `deleteDoc`, `serverTimestamp`.

## Data shapes (authoritative)

- `trees/{t}/viewers/{viewerUid}` = `{ grantedBy, viaRequest?, remoteTreeId, at }` — `viaRequest` present only on the cross-tree (request-authorized) grant.

---

### Task 1: Pure helper — build the viewer-grant pair

**Files:** Modify `links.js` (add `buildViewerGrants`); Modify `scripts/links.test.cjs` (add cases).

**Interface (on `window.ftLinks`/`global.ftLinks`):**
- `buildViewerGrants(req, approveTreeId, approverUid) -> { onRequestTree, onApproveTree }` where each side is `{ treeId, uid, data }`. `req = {treeId (A), token, requestedBy (A's uid), ...}`.
  - `onRequestTree`: grant on A for the approver B — `{ treeId: req.treeId, uid: approverUid, data: { grantedBy: approverUid, viaRequest: req.token, remoteTreeId: approveTreeId } }`.
  - `onApproveTree`: grant on B for the requester A — `{ treeId: approveTreeId, uid: req.requestedBy, data: { grantedBy: approverUid, remoteTreeId: req.treeId } }`.

- [ ] **Step 1: Add failing tests** — append to `scripts/links.test.cjs` before the final `console.log`:
```js
// buildViewerGrants
var g = L.buildViewerGrants({ treeId:'A', token:'tk', requestedBy:'uidA' }, 'B', 'uidB');
ok(g.onRequestTree.treeId==='A' && g.onRequestTree.uid==='uidB', 'request-tree grant: on A, for B');
ok(g.onRequestTree.data.viaRequest==='tk' && g.onRequestTree.data.remoteTreeId==='B', 'request-tree grant carries viaRequest + remote=B');
ok(g.onApproveTree.treeId==='B' && g.onApproveTree.uid==='uidA', 'approve-tree grant: on B, for A');
ok(g.onApproveTree.data.viaRequest===undefined && g.onApproveTree.data.remoteTreeId==='A', 'approve-tree grant has no viaRequest, remote=A');
ok(g.onApproveTree.data.grantedBy==='uidB' && g.onRequestTree.data.grantedBy==='uidB', 'both record approver as grantedBy');
```
Update the top count comment is unnecessary (test prints computed totals).

- [ ] **Step 2: Run, expect fail** — `node scripts/links.test.cjs` → fails (`buildViewerGrants` undefined).

- [ ] **Step 3: Implement** — in `links.js`, add inside the IIFE before `var api =`:
```js
  function buildViewerGrants(req, approveTreeId, approverUid){
    return {
      onRequestTree: { treeId: req.treeId, uid: approverUid,
        data: { grantedBy: approverUid, viaRequest: req.token, remoteTreeId: approveTreeId } },
      onApproveTree: { treeId: approveTreeId, uid: req.requestedBy,
        data: { grantedBy: approverUid, remoteTreeId: req.treeId } }
    };
  }
```
and add `buildViewerGrants: buildViewerGrants` to the `api` object.

- [ ] **Step 4: Run, expect pass** — `node scripts/links.test.cjs` → all pass.

- [ ] **Step 5: Commit**
```bash
git add links.js scripts/links.test.cjs
git commit -m "feat(view): pure buildViewerGrants helper for cross-tree read grants"
```

---

### Task 2: Rules — viewers grant + canViewTree + emulator tests (SECURITY)

**Files:** Modify `firestore.rules`; Modify `scripts/verify-rules.mjs`.

- [ ] **Step 1: Add helpers** — in `firestore.rules`, after `linkRequestDoc` (~line 31):
```
    function viewerDoc(treeId, user) {
      return /databases/$(database)/documents/trees/$(treeId)/viewers/$(user);
    }
    function canViewTree(treeId) {
      return isMember(treeId) || (signedIn() && exists(viewerDoc(treeId, uid())));
    }
```

- [ ] **Step 2: Open the two revealed reads** — change ONLY these two `allow read`:
  - `match /trees/{treeId}` top-level: `allow read: if isMember(treeId);` → `allow read: if canViewTree(treeId);`
  - `match /photos/{photoId}`: `allow read:          if isMember(treeId);` → `allow read:          if canViewTree(treeId);`
  Leave members/moments/activity/comments/reactions/links/linkRequests reads as `isMember` (private feed + roster stay hidden).

- [ ] **Step 3: Add the viewers match block** — inside `match /trees/{treeId}`, after the `links` block:
```
      match /viewers/{viewerUid} {
        allow get:    if isMember(treeId) || viewerUid == uid();
        allow list:   if isOwner(treeId);
        allow create: if signedIn() && (
                        isOwner(treeId)
                        || ( viewerUid == uid()
                             && exists(linkRequestDoc(treeId, request.resource.data.viaRequest)) )
                      );
        allow delete: if isOwner(treeId) || viewerUid == uid();
        allow update: if false;
      }
```

- [ ] **Step 4: Seed + emulator checks** — in `scripts/verify-rules.mjs` `seed()`, after the links seed:
```js
  // A viewer grant: OUTSIDER (standing in for another tree's owner B) may read TREE.
  await setDoc(doc(db, 'trees', TREE, 'viewers', OUTSIDER),
    { grantedBy: OUTSIDER, viaRequest: 'req1', remoteTreeId: 'tB' });
```
Add before `await testEnv.cleanup();`:
```js
// ── Cross-tree viewer grant (project 3a) ─────────────────────────────────
await check('a granted viewer can READ the whole tree doc', () =>
  assertSucceeds(getDoc(doc(outsiderDb, 'trees', TREE))));
await check('a granted viewer can READ a photo doc', () =>
  assertSucceeds(getDoc(doc(outsiderDb, 'trees', TREE, 'photos', 'p_x'))));
await check('a non-granted outsider still cannot read the tree', () =>
  assertFails(getDoc(doc(throwawayDb, 'trees', TREE))));
await check('a viewer CANNOT read the private moments feed', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'moments', 'm1'))));
await check('a viewer CANNOT read the member roster', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'members'))));
await check('a viewer CANNOT write the tree', () =>
  assertFails(updateDoc(doc(outsiderDb, 'trees', TREE), { rootId: 'x' })));
await check('a viewer CANNOT write a photo', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'photos', 'p_hack'), { data: 'x' })));
await check('owner can create a viewer grant directly', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'viewers', 'uid-added'), { grantedBy: OWNER, remoteTreeId: 'tB' })));
await check('self-grant via a matching pending request succeeds', () =>
  assertSucceeds(setDoc(doc(outsiderDb, 'trees', TREE, 'viewers', OUTSIDER), { grantedBy: OUTSIDER, viaRequest: 'req1', remoteTreeId: 'tB' })));
await check('self-grant with NO pending request fails', () =>
  assertFails(setDoc(doc(throwawayDb, 'trees', TREE, 'viewers', THROWAWAY), { grantedBy: THROWAWAY, viaRequest: 'nope', remoteTreeId: 'tB' })));
await check('cannot grant a viewer doc under ANOTHER uid via request', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'viewers', THROWAWAY), { grantedBy: OUTSIDER, viaRequest: 'req1', remoteTreeId: 'tB' })));
await check('a viewer grant cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'viewers', OUTSIDER), { remoteTreeId: 'evil' })));
await check('viewer can revoke their OWN grant; owner can revoke any', async () => {
  await assertSucceeds(deleteDoc(doc(outsiderDb, 'trees', TREE, 'viewers', OUTSIDER)));
  await assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'viewers', OUTSIDER)));  // idempotent (already gone)
});
await check('outsider cannot list viewers', () =>
  assertFails(getDocs(collection(throwawayDb, 'trees', TREE, 'viewers'))));
```

- [ ] **Step 5: Run** — `npm run test:rules` → all pass (90 + ~14).

- [ ] **Step 6: Note** — different-agent security review is Task 7; do not skip.

- [ ] **Step 7: Commit**
```bash
git add firestore.rules scripts/verify-rules.mjs
git commit -m "feat(view): viewers grant + canViewTree opens tree/photos reads; emulator tests"
```

---

### Task 3: approveLink writes grants; revokeLink removes them

**Files:** Modify `cloud.js` (`approveLink`, `revokeLink`).

- [ ] **Step 1: approveLink — add two grant writes to the existing batch.** After the two `batch.set(... links ...)` lines and before `await batch.commit();`:
```js
      var grants = window.ftLinks.buildViewerGrants(req, currentTreeId, currentUid);
      batch.set(doc(db, 'trees', grants.onApproveTree.treeId, 'viewers', grants.onApproveTree.uid),
        Object.assign({ at: serverTimestamp() }, grants.onApproveTree.data));
      batch.set(doc(db, 'trees', grants.onRequestTree.treeId, 'viewers', grants.onRequestTree.uid),
        Object.assign({ at: serverTimestamp() }, grants.onRequestTree.data));
```

- [ ] **Step 2: revokeLink — look up the link, delete the two grants best-effort.** Replace the body of `revokeLink`:
```js
  async function revokeLink(linkId){
    var link = currentLinks.filter(function(l){ return l.linkId === linkId; })[0];
    try{
      await deleteDoc(doc(db, 'trees', currentTreeId, 'links', linkId));
      currentLinks = currentLinks.filter(function(l){ return l.linkId !== linkId; });
      if(link){
        var otherUid = (link.requestedBy === currentUid) ? link.approvedBy : link.requestedBy;
        // Revoke the other party's view of MY tree (I own it).
        if(otherUid) deleteDoc(doc(db, 'trees', currentTreeId, 'viewers', otherUid))
          .catch(function(e){ console.error('revoke grant (mine) failed', e && e.code); });
        // Revoke MY view of THEIR tree, but only if no other link to it remains.
        var stillLinked = currentLinks.some(function(l){ return l.remoteTreeId === link.remoteTreeId; });
        if(link.remoteTreeId && !stillLinked) deleteDoc(doc(db, 'trees', link.remoteTreeId, 'viewers', currentUid))
          .catch(function(e){ console.error('revoke grant (theirs) failed', e && e.code); });
      }
      toast(t('linkRevoked'));
    }catch(e){ console.error('revokeLink failed', e && e.code, e); alert(writeErrMsg(e, t('linkRevokeFail'))); }
  }
```

- [ ] **Step 3: Verify** — `node --check cloud.js`.

- [ ] **Step 4: Commit**
```bash
git add cloud.js
git commit -m "feat(view): approveLink grants viewer access; revokeLink revokes both grants"
```

---

### Task 4: cloud.js — viewLinkedTree (read remote tree, hand to the viewer)

**Files:** Modify `cloud.js` (add `viewLinkedTree`; extend `window.__ftCloud`).

- [ ] **Step 1: Add the function** near `revokeLink`:
```js
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
      // permission-denied here = the other side severed the link (grant deleted).
      console.error('viewLinkedTree failed', e && e.code, e);
      alert(t('linkViewGone'));
    }
  }
```

- [ ] **Step 2: Extend `window.__ftCloud`** — add `viewLinkedTree: viewLinkedTree,`.

- [ ] **Step 3: i18n (app.js)** — add with the other link keys:
```js
    linkViewBtn:{ar:'عرض الشجرة', en:'View tree'},
    linkViewGone:{ar:'لم يعد متاحاً — ربما أُلغي الربط من الطرف الآخر', en:'No longer available — the link may have been removed by the other side'},
    linkViewBannerPrefix:{ar:'عرض: عائلة', en:'Viewing: family'},
    linkViewReadonly:{ar:'قراءة فقط', en:'read-only'},
    linkViewBack:{ar:'رجوع لشجرتي', en:'Back to my tree'},
```

- [ ] **Step 4: Verify** — `node --check cloud.js app.js`.

- [ ] **Step 5: Commit**
```bash
git add cloud.js app.js
git commit -m "feat(view): viewLinkedTree reads the remote tree and opens the viewer"
```

---

### Task 5: app.js — read-only linked-view mode with state isolation

**Files:** Modify `app.js` (enter/exit + save guard); Modify `index.html` (banner element + bump styles version); Modify `styles.css` (banner).

**Interface:** `window.__ftEnterLinkedView(viewState, meta)` and `window.__ftExitLinkedView()`.

- [ ] **Step 1: Banner DOM** — in `index.html`, immediately inside `<body>` (before `#authGate`):
```html
  <div id="linkedViewBar" style="display:none;">
    <button type="button" id="linkedViewBack"></button>
    <span id="linkedViewLabel"></span>
  </div>
```

- [ ] **Step 2: Banner CSS** — in `styles.css` (near other fixed bars):
```css
  #linkedViewBar{ position:fixed; inset-inline:0; top:0; z-index:40; display:flex; align-items:center; gap:10px; padding:10px 14px; padding-top:max(10px, env(safe-area-inset-top)); background:var(--plum); color:#F6EFDD; box-shadow:var(--shadow); font-family:var(--f-body); font-size:13.5px; font-weight:700; }
  #linkedViewBack{ background:rgba(255,255,255,.18); color:#F6EFDD; border:none; border-radius:9px; padding:6px 12px; font-size:13px; font-weight:700; font-family:var(--f-body); cursor:pointer; flex-shrink:0; }
  #linkedViewBack:active{ opacity:.8; }
```
Bump `styles.css?v=53` → `?v=54` in `index.html`.

- [ ] **Step 3: State-isolation guard on save** — change `save()` and `scheduleSave()` to no-op while viewing. At the top of `save()` add `if(linkedView) return;` and at the top of `scheduleSave()` add `if(linkedView) return;`. Declare the flag near `var state` (line ~435): `var linkedView = null;`.

- [ ] **Step 4: Stash remote snapshots during view** — in `window.__ftApplyRemote`, guard so an incoming snapshot of the USER's own tree does not clobber the view: at the very top of the function body add:
```js
    if(linkedView){ linkedView.savedState = remoteState; return; }   // defer: restore the latest on exit
```

- [ ] **Step 5: Enter/exit** — add after `window.__ftSetEditable` (~line 527):
```js
  /* Linked-view: render ANOTHER tree read-only without touching this user's state,
     localStorage, or cloud. save()/scheduleSave() are no-ops while active, and an
     incoming own-tree snapshot is stashed (not applied) until exit. */
  window.__ftEnterLinkedView = function(viewState, meta){
    if(linkedView) return;
    linkedView = { savedState: state, savedCanEdit: canEditCloud, meta: meta || {} };
    state = viewState; state.lang = state.lang || 'ar';
    Object.keys(state.people).forEach(function(id){ migratePerson(state.people[id]); });
    migrateNames(state);
    canEditCloud = false;
    var fam = state.familyName;
    var label = (fam && (fam[state.lang] || fam.ar || fam.en)) || t('unnamedFamily');
    document.getElementById('linkedViewLabel').textContent = t('linkViewBannerPrefix') + ' «' + label + '» — ' + t('linkViewReadonly');
    document.getElementById('linkedViewBack').textContent = '‹ ' + t('linkViewBack');
    document.getElementById('linkedViewBar').style.display = 'flex';
    applyLang(); render();
    if(window.__ftShowTab) window.__ftShowTab('tree');
    if(meta && meta.focusPersonId && state.people[meta.focusPersonId]) focusPerson(meta.focusPersonId);
  };
  window.__ftExitLinkedView = function(){
    if(!linkedView) return;
    var saved = linkedView;
    linkedView = null;
    document.getElementById('linkedViewBar').style.display = 'none';
    canEditCloud = saved.savedCanEdit;
    state = saved.savedState;
    applyLang(); render();
  };
```

- [ ] **Step 6: Wire the back button** — near other one-time wiring (e.g. after `window.__ftShowTab = showTab;`):
```js
  document.getElementById('linkedViewBack').onclick = function(){ window.__ftExitLinkedView(); };
```

- [ ] **Step 7: Verify** — `node --check app.js`. Confirm `focusPerson` exists (grep); if the helper is named `centerTreeOn`, use that instead in Step 5.

- [ ] **Step 8: Commit**
```bash
git add app.js index.html styles.css
git commit -m "feat(view): read-only linked-view mode with strict state isolation + banner"
```

---

### Task 6: Make the linked badge open the view

**Files:** Modify `app.js` (`openProfile` badge markup + wiring).

- [ ] **Step 1: Badge markup** — in `openProfile`, change the `linkBadges` builder to carry the target and a view affordance:
```js
    var linkBadges = myLinks.map(function(l){
      return '<div class="prof-link-badge" data-view-tree="'+escapeHtml(l.remoteTreeId)+'" data-view-person="'+escapeHtml(l.remotePersonId)+'">'+
             '🔗 '+t('linkedToFamily')+' «'+escapeHtml(famLabel(l.remoteFamilyName))+'» '+
             '<span class="prof-link-view">'+t('linkViewBtn')+' ›</span>'+
             (isOwnerCloud ? ' <button class="prof-link-revoke" data-link="'+escapeHtml(l.linkId)+'">'+t('linkRevokeBtn')+'</button>' : '')+
             '</div>';
    }).join('');
```

- [ ] **Step 2: Wire** — in `openProfile`, after the `.prof-link-revoke` wiring:
```js
    sheetBody.querySelectorAll('.prof-link-badge[data-view-tree]').forEach(function(badge){
      badge.addEventListener('click', function(e){
        if(e.target.closest('.prof-link-revoke')) return;   // revoke handled separately
        var tid = badge.getAttribute('data-view-tree'), pid = badge.getAttribute('data-view-person');
        closeSheet();
        if(window.__ftCloud && window.__ftCloud.viewLinkedTree) window.__ftCloud.viewLinkedTree(tid, pid);
      });
    });
```

- [ ] **Step 3: CSS** — in `styles.css`, make the view hint look tappable and the badge a row:
```css
  .prof-link-badge{ cursor:pointer; }
  .prof-link-view{ color:var(--teal); font-weight:700; font-size:12.5px; margin-inline-start:4px; }
```
(Bump `styles.css?v=54` → `?v=55` in `index.html`.)

- [ ] **Step 4: Verify** — `node --check app.js`.

- [ ] **Step 5: Commit**
```bash
git add app.js styles.css index.html
git commit -m "feat(view): linked badge opens the read-only remote tree view"
```

---

### Task 7: Isolated verification, security review, deploy

- [ ] **Step 1: Full node suite** — run every `scripts/*.test.cjs` + `npm run test:rules`; all green.

- [ ] **Step 2: Isolated harness** — regenerate `_d1.html` (index.html minus the cloud.js module line), serve, and verify:
  - `ftLinks.buildViewerGrants` returns correct ids/fields.
  - Stub `window.__ftCloud.viewLinkedTree` to call `window.__ftEnterLinkedView(remoteState, {remoteTreeId, focusPersonId})`.
  - **State isolation (critical):** seed the user's own state via `__ftApplyRemote`; record `localStorage` + `__ftGetState()`; enter linked view with a DIFFERENT people map; assert the banner shows, editing is off, and the view renders; fire a `__ftApplyRemote` (simulated own-tree snapshot) while viewing and assert the visible state did NOT change and `localStorage` still holds the user's tree; call `__ftExitLinkedView()` and assert the user's state + localStorage are intact (including the stashed update).
  - Screenshot the read-only view + banner (mobile) for the design proof.

- [ ] **Step 3: Different-agent security review** (org Rule 2): dispatch `pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter` on `git diff main..HEAD`, focused on: the `canViewTree` read widening (does it leak the private feed/roster? can a viewer write anything?), the viewers create/delete rules (self-grant bounds, revoke authority), approveLink atomicity, and client state-isolation (can viewing clobber the user's tree?). Fix ≥85% findings.

- [ ] **Step 4: Deploy (with owner consent)** — `firebase deploy --only firestore:rules --project family-tree-app-d9238` FIRST; then merge `feat/cross-tree-view` → `main`, bump the SW cache (`family-tree-v28` → `v29`), push. Verify the live site serves the new bundle.

- [ ] **Step 5: Finish** — REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** §4 data → Tasks 1,3; §5 flow → Tasks 3,4,5,6; §6 security → Task 2; §7 UI/isolation → Tasks 5,6; §8 revoke → Task 3; §9 testing → Tasks 1,2,7. All covered.

**Placeholder scan:** none — every code step shows the code. Task 5 Step 7 flags the one name to confirm (`focusPerson` vs `centerTreeOn`) with a concrete fallback.

**Type consistency:** `buildViewerGrants(req, approveTreeId, approverUid) -> {onRequestTree,onApproveTree}` with `{treeId,uid,data}` used identically in Task 1 and Task 3. `viewLinkedTree(remoteTreeId, personId)` (Task 4) ↔ badge wiring (Task 6) ↔ `__ftEnterLinkedView(viewState, {remoteTreeId,focusPersonId})` (Task 5). `canViewTree`/`viewerDoc` rule names consistent across Task 2. Viewer-doc fields match the Data shapes block everywhere.
