# Family Links Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the tree owner a sheet to see/cancel pending link requests and see/revoke who can view their tree, plus auto-clean requests that already produced a link.

**Architecture:** Pure client — no rules change (owner `list`/`delete` on `linkRequests` and `viewers` already allowed). A pure `requestsToGC` helper drives auto-cleanup; cloud.js adds list/delete/revoke ops + a `showLinksManager` sheet; app.js adds an owner-only menu entry.

**Tech Stack:** Vanilla JS (links.js engine + app.js; cloud.js ES module), Firebase 10.13.2 (getDocs/deleteDoc), Node `.cjs` for pure logic.

## Global Constraints

- Authority is `trees/{treeId}/members/{uid}` ONLY. Owner-only operations gate on `window.__ftCloud.isOwner()` (client) and the existing `isOwner` rules (server).
- NO changes to `firestore.rules` — every op is already permitted.
- `t()` is the only text output path for NEW code (no hardcoded user-facing strings).
- Repo PUBLIC, Firebase free Spark — no paid products.
- Permission-adjacent change → a (lighter) different-agent review before done (org Rule 2).
- Never verify against a live logged-in session — isolated `_d1.html` harness only.
- Existing cloud.js has `getDocs`, `deleteDoc`, `collection`, `doc`, `t`, `toast`, `writeErrMsg`, `currentTreeId`, `currentRole`, `currentUid`, `currentLinks`, `loadLinks`. app.js has `__ftTimeAgo`, `famLabel`, `escapeHtml`, `t`, `tf`, `openSheet`/menu in `menuBtn`.

## Data shapes (existing)

- `trees/{t}/linkRequests/{token}` = `{ localPersonId, localPersonName:{ar,en}, localFamilyName:{ar,en}, requestedBy, kind, createdAt }`
- `trees/{t}/viewers/{uid}` = `{ grantedBy, viaRequest?, remoteTreeId, at }`
- `currentLinks[]` entries carry `{ linkId, localPersonId, remoteTreeId, remotePersonId, remoteFamilyName, viaRequest?, requestedBy, approvedBy }`

---

### Task 1: Pure helper — pick requests to garbage-collect

**Files:** Modify `links.js` (add `requestsToGC`); Modify `scripts/links.test.cjs`.

**Interface (on `window.ftLinks`/`global.ftLinks`):**
- `requestsToGC(requests, links) -> string[]` — returns the tokens of requests that already produced a link. `requests = [{token, ...}]`, `links = [{viaRequest, ...}]`. A request is collectible iff some link has `viaRequest === request.token`.

- [ ] **Step 1: Failing tests** — append to `scripts/links.test.cjs` before the final `console.log`:
```js
// requestsToGC
var reqs = [{token:'t1'},{token:'t2'},{token:'t3'}];
var lks = [{viaRequest:'t1'},{viaRequest:'t3'},{localPersonId:'x'}];
var gc = L.requestsToGC(reqs, lks);
ok(gc.length===2 && gc.indexOf('t1')!==-1 && gc.indexOf('t3')!==-1, 'GC picks tokens with a matching link');
ok(gc.indexOf('t2')===-1, 'GC leaves a request with no link');
ok(JSON.stringify(L.requestsToGC([], lks))==='[]', 'GC empty requests -> []');
ok(JSON.stringify(L.requestsToGC(reqs, []))==='[]', 'GC no links -> []');
ok(JSON.stringify(L.requestsToGC(null, null))==='[]', 'GC null-safe');
```

- [ ] **Step 2: Run, expect fail** — `node scripts/links.test.cjs` → fails.

- [ ] **Step 3: Implement** — in `links.js`, before `var api =`:
```js
  function requestsToGC(requests, links){
    requests = requests || []; links = links || [];
    var used = {};
    links.forEach(function(l){ if(l && l.viaRequest) used[l.viaRequest] = true; });
    return requests.filter(function(r){ return r && used[r.token]; }).map(function(r){ return r.token; });
  }
```
Add `requestsToGC: requestsToGC` to `api`.

- [ ] **Step 4: Run, expect pass** — `node scripts/links.test.cjs`.

- [ ] **Step 5: Commit**
```bash
git add links.js scripts/links.test.cjs
git commit -m "feat(links-mgmt): pure requestsToGC helper"
```

---

### Task 2: cloud.js — list/delete/revoke ops + auto-GC

**Files:** Modify `cloud.js`.

**Interfaces (added to `window.__ftCloud`):** `listLinkRequests()`, `deleteLinkRequest(token)`, `listTreeViewers()`, `revokeViewer(uid)` — all resolve arrays/void; all owner-only.

- [ ] **Step 1: Add the ops** near `revokeLink`:
```js
  async function listLinkRequests(){
    if(currentRole !== 'owner' || !currentTreeId) return [];
    var snap = await getDocs(collection(db, 'trees', currentTreeId, 'linkRequests'));
    var arr = []; snap.forEach(function(d){ arr.push(Object.assign({ token: d.id }, d.data())); });
    return arr;
  }
  async function deleteLinkRequest(token){
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
    try{ await deleteDoc(doc(db, 'trees', currentTreeId, 'viewers', viewerUid)); }
    catch(e){ console.error('revokeViewer failed', e && e.code, e); alert(writeErrMsg(e, t('viewerRevokeFail'))); throw e; }
  }
  // Owner-only: drop pending requests that already produced a link (token did its
  // job) so a re-opened #link= can't keep minting duplicate link docs.
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
```

- [ ] **Step 2: Call auto-GC after links load** — at the end of `loadLinks`'s success handler (after `currentLinks = arr;` / the `__ftRenderHome` call), add `gcLinkRequests();`.

- [ ] **Step 3: Register in `__ftCloud`** — add `listLinkRequests, deleteLinkRequest, listTreeViewers, revokeViewer`.

- [ ] **Step 4: i18n (app.js)** — with the other link keys:
```js
    linkReqDeleteFail:{ar:'تعذّر حذف الطلب', en:'Could not delete the request'},
    viewerRevokeFail:{ar:'تعذّر إلغاء الوصول', en:'Could not revoke access'},
```

- [ ] **Step 5: Verify** — `node --check cloud.js app.js`.

- [ ] **Step 6: Commit**
```bash
git add cloud.js app.js
git commit -m "feat(links-mgmt): list/delete requests + list/revoke viewers + auto-GC"
```

---

### Task 3: cloud.js — the management sheet

**Files:** Modify `cloud.js` (add `showLinksManager` + register); Modify `app.js` (i18n).

- [ ] **Step 1: Add `showLinksManager`** near `showMembers` (mirrors its sheet mechanics but uses `t()`):
```js
  async function showLinksManager(){
    if(currentRole !== 'owner'){ toast(t('linkOwnerOnly')); return; }
    var overlay = document.getElementById('overlay');
    var sheet = document.getElementById('sheet');
    var body = document.getElementById('sheetBody');
    var esc = window.__ftEscapeHtml || function(s){ return String(s==null?'':s); };
    var fam = window.__ftFamLabel || function(o){ return (o && (o.ar||o.en)) || ''; };
    var ago = window.__ftTimeAgo || function(){ return ''; };
    body.innerHTML = '<h3>🔗 '+t('linksMgrTitle')+'</h3><div class="context">'+t('linksMgrLoading')+'</div>';
    overlay.classList.add('open'); sheet.classList.add('open');
    try{
      var reqs = await listLinkRequests();
      var viewers = await listTreeViewers();
      // map remoteTreeId -> family label via currentLinks
      var famByTree = {}; currentLinks.forEach(function(l){ if(l.remoteTreeId) famByTree[l.remoteTreeId] = l.remoteFamilyName; });
      var reqRows = reqs.length ? reqs.map(function(r){
        var when = r.createdAt && r.createdAt.toDate ? ago(r.createdAt.toDate()) : '';
        return '<div class="lm-row"><div class="lm-main"><b>'+esc(fam(r.localPersonName))+'</b>'+
          '<div class="lm-sub">'+t('linkedToFamily')+' «'+esc(fam(r.localFamilyName))+'»'+(when?(' · '+esc(when)):'')+'</div></div>'+
          '<button class="mini-btn danger" data-lmreq="'+esc(r.token)+'">'+t('linkReqCancel')+'</button></div>';
      }).join('') : '<div class="lm-empty">'+t('linksMgrNoRequests')+'</div>';
      var viewerRows = viewers.length ? viewers.map(function(v){
        var label = famByTree[v.remoteTreeId] ? fam(famByTree[v.remoteTreeId]) : t('linkedFamilyGeneric');
        return '<div class="lm-row"><div class="lm-main"><b>'+esc(label)+'</b></div>'+
          '<button class="mini-btn danger" data-lmviewer="'+esc(v.uid)+'">'+t('viewerRevokeBtn')+'</button></div>';
      }).join('') : '<div class="lm-empty">'+t('linksMgrNoViewers')+'</div>';
      body.innerHTML = '<h3>🔗 '+t('linksMgrTitle')+'</h3>'+
        '<div class="lm-section-h">'+t('linksMgrРrequestsH').replace('Р','')+'</div>'+reqRows+
        '<div class="lm-section-h" style="margin-top:16px;">'+t('linksMgrViewersH')+'</div>'+viewerRows;
      body.querySelectorAll('[data-lmreq]').forEach(function(b){
        b.onclick = async function(){ if(!confirm(t('linkReqCancelConfirm'))) return; try{ await deleteLinkRequest(b.getAttribute('data-lmreq')); showLinksManager(); }catch(e){} };
      });
      body.querySelectorAll('[data-lmviewer]').forEach(function(b){
        b.onclick = async function(){ if(!confirm(t('viewerRevokeConfirm'))) return; try{ await revokeViewer(b.getAttribute('data-lmviewer')); showLinksManager(); }catch(e){} };
      });
    }catch(e){ console.error('showLinksManager failed', e && e.code, e); body.innerHTML = '<h3>🔗 '+t('linksMgrTitle')+'</h3><div class="context">'+t('linksMgrError')+'</div>'; }
  }
```
(Replace the stray `linksMgrРrequestsH` with a clean key `linksMgrRequestsH` — written here to avoid a copy error; use `t('linksMgrRequestsH')`.)

- [ ] **Step 2: Expose `famLabel`/escape for cloud.js** — in app.js, near `window.__ftEscapeHtml`, add `window.__ftFamLabel = famLabel;` (so the sheet can label families). Confirm `window.__ftEscapeHtml` and `window.__ftTimeAgo` already exist (they do).

- [ ] **Step 3: Register** — add `showLinksManager: showLinksManager` to `window.__ftCloud`.

- [ ] **Step 4: i18n (app.js)**:
```js
    linksMgrTitle:{ar:'إدارة روابط العائلة', en:'Family links'},
    linksMgrLoading:{ar:'جارِ التحميل…', en:'Loading…'},
    linksMgrError:{ar:'تعذّر التحميل', en:'Could not load'},
    linksMgrRequestsH:{ar:'طلبات ربط معلّقة', en:'Pending link requests'},
    linksMgrViewersH:{ar:'من يمكنه رؤية شجرتك', en:'Who can view your tree'},
    linksMgrNoRequests:{ar:'لا طلبات معلّقة', en:'No pending requests'},
    linksMgrNoViewers:{ar:'لا أحد يرى شجرتك', en:'No one can view your tree'},
    linkReqCancel:{ar:'إلغاء الطلب', en:'Cancel'},
    linkReqCancelConfirm:{ar:'إلغاء هذا الطلب المعلّق؟', en:'Cancel this pending request?'},
    linkedFamilyGeneric:{ar:'عائلة مرتبطة', en:'A linked family'},
    viewerRevokeBtn:{ar:'إلغاء الوصول', en:'Revoke'},
    viewerRevokeConfirm:{ar:'إلغاء وصول هذه العائلة لرؤية شجرتك؟', en:'Revoke this family\'s access to view your tree?'},
```

- [ ] **Step 5: CSS (styles.css)** — reuse `.mini-btn`/`.mini-btn.danger` (exist from showMembers); add layout:
```css
  .lm-row{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border-bottom:1px solid var(--paper-deep); }
  .lm-main{ font-size:13px; } .lm-sub{ color:var(--ink-soft); font-size:11px; margin-top:2px; }
  .lm-section-h{ font-size:12px; font-weight:700; color:var(--emerald); margin-bottom:4px; }
  .lm-empty{ color:var(--ink-soft); font-size:12.5px; padding:6px 0; }
```
Bump `styles.css?v=56` → `?v=57` in index.html.

- [ ] **Step 6: Verify** — `node --check cloud.js`.

- [ ] **Step 7: Commit**
```bash
git add cloud.js app.js styles.css index.html
git commit -m "feat(links-mgmt): showLinksManager sheet (requests + viewers)"
```

---

### Task 4: app.js — owner-only menu entry

**Files:** Modify `app.js` (`menuBtn` handler).

- [ ] **Step 1: Add the button** — in the `menuBtn` openSheet string, after the `mn_invite` line:
```js
      (window.__ftCloud && window.__ftCloud.isOwner && window.__ftCloud.isOwner() ? '<button class="primary-btn" id="mn_links" style="margin-top:10px; background:var(--plum);">🔗 '+t('linksMgrTitle')+'</button>' : '')
```

- [ ] **Step 2: Wire** — after the `mn_invite` wiring block:
```js
    var lmBtn = document.getElementById('mn_links');
    if(lmBtn) lmBtn.onclick = function(){ if(window.__ftCloud && window.__ftCloud.showLinksManager) window.__ftCloud.showLinksManager(); };
```

- [ ] **Step 3: Verify** — `node --check app.js`.

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "feat(links-mgmt): owner-only menu entry for the links manager"
```

---

### Task 5: Isolated verification, review, deploy

- [ ] **Step 1: Full node suite** — all `scripts/*.test.cjs` green (rules unchanged, but run `npm run test:rules` once to confirm still 109).

- [ ] **Step 2: Isolated harness** — regenerate `_d1.html`, serve, verify:
  - `ftLinks.requestsToGC` behaves.
  - Stub `__ftCloud` with `isOwner()=>true`, `listLinkRequests`/`listTreeViewers` returning sample arrays, `deleteLinkRequest`/`revokeViewer` recording calls, `showLinksManager` (call the real one is cloud-only; instead unit-test the menu wiring: owner sees `mn_links`, click calls `showLinksManager`).
  - Screenshot the manager sheet (mobile) for design proof — build the sheet DOM via a stub that renders rows, or drive the real `showLinksManager` by stubbing the cloud list fns on `window.__ftCloud` and calling it. (If `showLinksManager` lives in cloud.js and cloud is absent in `_d1.html`, verify the app-side menu gating + i18n instead, and screenshot a hand-built sheet sample.)

- [ ] **Step 3: Different-agent review** (org Rule 2, lighter — no rules change): dispatch `pr-review-toolkit:code-reviewer` on `git diff main..HEAD`, focused on: owner-gating of the new ops (client + server already), auto-GC correctness (only deletes requests with a matching link — can it ever delete a needed request?), t() discipline, XSS in the sheet (escape all interpolated names/tokens), silent failures. Fix ≥85%.

- [ ] **Step 4: Deploy (with owner consent)** — NO rules deploy (unchanged). Merge `feat/links-management` → `main`, bump SW cache (`v29` → `v30`), push. Verify live.

- [ ] **Step 5: Finish** — REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** §5 data → Tasks 1–3; §6 logic → Tasks 1,2; §7 UI → Tasks 3,4; §9 testing → Tasks 1,5. All covered.

**Placeholder scan:** none — code shown for every step. Task 3 Step 1 flags one copy-safety note (`linksMgrRequestsH` key, no stray char).

**Type consistency:** `requestsToGC(requests, links) -> string[]` (Task 1) ↔ used in `gcLinkRequests` (Task 2). `listLinkRequests`/`listTreeViewers` return arrays consumed by `showLinksManager` (Task 3). `isOwner()`/`showLinksManager` on `__ftCloud` ↔ menu wiring (Task 4). i18n keys referenced match those defined. No rules change, consistent with the spec.
