# Photos → Firebase Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move person (and new moment) photos out of the single `trees/{treeId}` Firestore document into Firebase Storage, referenced by a short `photoPath`, with backward-compatible rendering, per-tree Storage security rules, gradual auto-migration, and offline caching.

**Architecture:** A focused ES module `photos.js` wraps the Storage SDK (upload/resolve/delete + path builders) and is wired by `cloud.js` (single Firebase init) onto `window.__ftPhotos`. A pure resolver `ftPhotoSource(person)` in `app.js` decides path-vs-legacy-base64-vs-none at render time. Storage rules gate access to tree members via `firestore.get`. Migration and SW image caching follow.

**Tech Stack:** Vanilla JS (classic IIFE for app/engines, ES modules for cloud.js/photos.js), Firebase 10.13.2 (Auth/Firestore/Storage), Firebase emulator for rules tests, Node for pure-logic tests (`.cjs`).

## Global Constraints

- `personId` is eternal — never regenerated; photo path derives from it (`trees/{treeId}/people/{personId}.jpg`).
- Permission authority is `trees/{treeId}/members/{uid}` ONLY — Storage rules read it via `firestore.get`, never `users/{uid}`.
- `t()` is the only way to output text — every new user-facing string goes through the i18n bridge.
- Repo is PUBLIC — no secrets added; the web API key is public by nature, protection lives in Storage rules.
- Security-relevant changes (Storage rules, migration) MUST be reviewed by a DIFFERENT agent (`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`) before "done"; ≥85% findings fixed now.
- Never test writes against the owner's live cloud tree — verify only in the isolated harness (no `cloud.js`) or the emulator.
- Firebase config already present in `cloud.js`: `storageBucket: "family-tree-app-d9238.firebasestorage.app"`.
- Engine/pure modules expose on `global`/`window` and node tests read the global (repo convention); `require()` of a `.js` returns `{}` here — read `global.X`.

---

### Task 1: Pure photo helpers — path builders + render resolver

> Path builders live in their OWN classic file `photo-paths.js` (IIFE, no imports)
> so node can `require` them; the SDK-backed module `photos.js` (with `import`) is
> created separately in Task 3. This avoids an ESM/CJS clash in one file.

**Files:**
- Create: `photo-paths.js` (classic IIFE — path builders only)
- Create: `scripts/photos.test.cjs`
- Modify: `app.js` — add `ftPhotoSource` near `resizeImage` (~line 672) and expose on `window`

**Interfaces:**
- Produces: `ftPhotoPaths.person(treeId, personId) -> string`, `ftPhotoPaths.moment(treeId, momentId) -> string` (on `window.ftPhotoPaths` / `global.ftPhotoPaths`).
- Produces: `ftPhotoSource(person) -> {kind:'path'|'base64'|'none', value:string}` (on `window.ftPhotoSource`).

- [ ] **Step 1: Write the failing test** — `scripts/photos.test.cjs`

```js
require('../photo-paths.js');       // exposes ftPhotoPaths on the global
const P = global.ftPhotoPaths;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(!!P, 'ftPhotoPaths exposed');
ok(P.person('t1','p1') === 'trees/t1/people/p1.jpg', 'person path');
ok(P.moment('t1','m1') === 'trees/t1/moments/m1.jpg', 'moment path');

// ftPhotoSource is defined in app.js; load the node-guard globals it exposes.
require('../app.js');
const src = global.ftPhotoSource;
ok(typeof src === 'function', 'ftPhotoSource exposed');
ok(src({ photoPath:'trees/t/people/p.jpg' }).kind === 'path', 'path wins');
ok(src({ photoPath:'trees/t/people/p.jpg' }).value === 'trees/t/people/p.jpg', 'path value');
ok(src({ photo:'data:image/jpeg;base64,AAA' }).kind === 'base64', 'legacy base64');
ok(src({ photo:'data:image/jpeg;base64,AAA' }).value === 'data:image/jpeg;base64,AAA', 'base64 value');
ok(src({ photoPath:'x', photo:'data:...' }).kind === 'path', 'path beats base64');
ok(src({}).kind === 'none', 'none when empty');
ok(src(null).kind === 'none', 'none when null');
ok(src({ photo:'' }).kind === 'none', 'blank base64 -> none');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/photos.test.cjs`
Expected: FAIL — `ftPhotoPaths` undefined (file missing).

- [ ] **Step 3: Create `photo-paths.js` with the path builders**

```js
/* Photo Storage path builders — pure, node-testable (classic IIFE, no imports).
   The SDK-backed upload/resolve/delete live in photos.js (Task 3).
   personId is eternal, so a person's photo path is stable and overwrites cleanly. */
(function(global){
  'use strict';
  var ftPhotoPaths = {
    person: function(treeId, personId){ return 'trees/' + treeId + '/people/' + personId + '.jpg'; },
    moment: function(treeId, momentId){ return 'trees/' + treeId + '/moments/' + momentId + '.jpg'; }
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = ftPhotoPaths;
  global.ftPhotoPaths = ftPhotoPaths;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Add `ftPhotoSource` to `app.js`** (immediately after `resizeImage`, before `logActivity` ~line 691)

```js
  // Decide how to render a person/moment photo, backward-compatibly: a Storage
  // path wins; else a legacy embedded base64 data URL; else nothing. Pure, so it
  // is unit-tested in node. The async URL for a path is resolved by the caller
  // via window.__ftPhotos.resolveURL.
  function ftPhotoSource(rec){
    if(rec && typeof rec.photoPath === 'string' && rec.photoPath) return { kind:'path', value: rec.photoPath };
    if(rec && typeof rec.photo === 'string' && rec.photo) return { kind:'base64', value: rec.photo };
    return { kind:'none', value:'' };
  }
  window.ftPhotoSource = ftPhotoSource;
```

Also ensure the node-guard at the top of `app.js` exposes it on `global` (find the existing `global.__ftDateHelpers = ...` node-guard block and add `global.ftPhotoSource = ftPhotoSource;` there, or confirm `window` === `global` under the node guard). If `app.js`'s node guard returns before defining `ftPhotoSource`, move the definition above the guard's `return`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/photos.test.cjs`
Expected: PASS — `N passed, 0 failed`.

- [ ] **Step 6: Load `photo-paths.js` in the loader chain** — `index.html` (after `timeline.js`, before `app.js`)

```html
      .then(function(){ return add('timeline.js'); })
      .then(function(){ return add('photo-paths.js'); })
      .then(function(){ return add('app.js'); })
```

- [ ] **Step 7: Commit**

```bash
git add photo-paths.js scripts/photos.test.cjs app.js index.html
git commit -m "feat(photos): pure path builders + backward-compat render resolver"
```

---

### Task 2: `resizeImage` returns a Blob (keep a data-URL path for callers still needing it)

**Files:**
- Modify: `app.js` — `resizeImage` (~line 672) and `wirePhotoRow` (~line 1987), moment photo handler is in `cloud.js` (Task 4).

**Interfaces:**
- Produces: `resizeImage(file, maxSize, cb)` now calls `cb(blob, dataUrl)` — a Blob (for upload) AND a data URL (for instant preview). `null` blob on failure.

- [ ] **Step 1: Update `resizeImage`** (replace the `cb(canvas.toDataURL(...))` tail)

```js
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
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.72);   // instant preview
        canvas.toBlob(function(blob){ cb(blob, dataUrl); }, 'image/jpeg', 0.72);
      };
      img.onerror = function(){ cb(null, null); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
```

- [ ] **Step 2: Update `wirePhotoRow`** so the picked photo keeps its Blob for upload, and preview shows instantly

```js
    document.getElementById('pf_photoFile').onchange = function(e){
      var file = e.target.files[0];
      if(!file) return;
      resizeImage(file, 220, function(blob, dataUrl){
        if(!blob) return;
        pendingPhoto = { blob: blob, dataUrl: dataUrl };   // was: pendingPhoto = dataUrl
        document.getElementById('pf_photoPreview').innerHTML = '<img src="'+dataUrl+'">';
        document.getElementById('pf_removePhoto').style.display = '';
      });
    };
```

Update the two other `pendingPhoto` assignments in `wirePhotoRow`: initial `pendingPhoto = existingPhoto ? { dataUrl: existingPhoto, blob: null, existing: true } : null;` and remove-button sets `pendingPhoto = null;`. (This normalises `pendingPhoto` to an object `{blob, dataUrl, existing?}` or `null`.)

- [ ] **Step 3: Verify no test regression**

Run: `node scripts/photos.test.cjs && node scripts/dates.test.cjs`
Expected: both PASS (resizeImage has no node test; this guards the app.js node guard still loads).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(photos): resizeImage yields a Blob (for Storage) plus a preview data URL"
```

---

### Task 3: `photos.js` module (SDK upload/resolve/delete) wired in cloud.js

**Files:**
- Create: `photos.js` — ES module exporting `makePhotoApi(storage)`. NOT in the classic loader chain; imported by `cloud.js`.
- Modify: `cloud.js` — import Storage SDK + `makePhotoApi`, init storage, expose `window.__ftPhotos`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of `photo-paths.js`).
- Produces: `window.__ftPhotos = { uploadPhoto(path, blob) -> Promise<path>, resolveURL(path) -> Promise<url>, deletePhoto(path) -> Promise<void> }`.

- [ ] **Step 1: Create `photos.js`** (ES module — imported by `cloud.js`, never added to the classic `add()` chain)

```js
/* Storage-backed photo API (ES module). Created via makePhotoApi(storage) in
   cloud.js, which owns the single Firebase app. Path strings come from
   photo-paths.js (window.ftPhotoPaths). */
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
const _urlCache = {};
export function makePhotoApi(storage){
  return {
    async uploadPhoto(path, blob){
      await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
      return path;
    },
    async resolveURL(path){
      if(_urlCache[path]) return _urlCache[path];
      const u = await getDownloadURL(ref(storage, path));
      _urlCache[path] = u;
      return u;
    },
    async deletePhoto(path){
      try{ await deleteObject(ref(storage, path)); }
      catch(e){ if(!(e && e.code === 'storage/object-not-found')) throw e; }
    }
  };
}
```

- [ ] **Step 2: Wire in `cloud.js`** — add to the Storage import and after `const db = getFirestore(app);` (~line 22)

```js
  import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
  import { makePhotoApi } from "./photos.js";
  const storage = getStorage(app);
  window.__ftPhotos = makePhotoApi(storage);
```

- [ ] **Step 3: Manual sanity in the isolated harness is NOT possible (no firebase). Defer live verification to Task 8.** Confirm no syntax errors:

Run: `node --check photos.js` (expected: OK — top-level `import` is valid ESM syntax under `node --check`) and `node --check cloud.js`.
Expected: both print nothing (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add photos.js cloud.js
git commit -m "feat(photos): Storage upload/resolve/delete API wired to window.__ftPhotos"
```

---

### Task 4: Write `photoPath` on save (person edit + new moment)

**Files:**
- Modify: `app.js` — person save handler (~line 2259, `photo: pendingPhoto`)
- Modify: `cloud.js` — moment post handler (~line 693 resize, ~line 704 addDoc)

**Interfaces:**
- Consumes: `window.__ftPhotos.uploadPhoto`, `window.ftPhotoPaths`, normalised `pendingPhoto` `{blob,dataUrl,existing?}|null`.
- Produces: person records gain `photoPath`; new moment docs store `photoPath` (not base64).

- [ ] **Step 1: Person save** — when committing an add/edit, upload the pending blob first, then store the path. Replace the `photo: pendingPhoto` field build with:

```js
    // Resolve the photo to store: a freshly-picked blob is uploaded to Storage and
    // stored as a path; an unchanged existing photo keeps whatever it already had.
    var photoUpdate = {};
    if(pendingPhoto === null){ photoUpdate = { photoPath: null, photo: null }; }        // removed
    else if(pendingPhoto && pendingPhoto.blob){                                          // newly picked
      var path = window.ftPhotoPaths.person(currentTreeIdForSave(), targetId);
      await window.__ftPhotos.uploadPhoto(path, pendingPhoto.blob);
      photoUpdate = { photoPath: path, photo: null };
    } // else: existing unchanged -> leave photoPath/photo as-is (no key in update)
```

Then merge `photoUpdate` into the person data object instead of `photo: pendingPhoto`. Obtain `targetId` (the person's id being saved) and the tree id (from `window.__ftCloud`/state — add a small getter `currentTreeIdForSave()` that returns `state.currentTreeId` or reads `window.__ftCloud.getTreeId()`; if no getter exists, expose `window.__ftCloud.getTreeId = () => currentTreeId;` in cloud.js). Make the save handler `async` and `await` the upload; show a toast `t('photoUploading')` while uploading and handle failure with `t('photoUploadFail')` (do not save the person if the upload throws).

- [ ] **Step 2: Add i18n keys** in `app.js` dictionary:

```js
    photoUploading:{ar:'جارِ رفع الصورة…', en:'Uploading photo…'},
    photoUploadFail:{ar:'تعذّر رفع الصورة — تحقّق من الاتصال', en:'Photo upload failed — check your connection'},
```

- [ ] **Step 3: Moment post** — in `cloud.js` change the compose flow so a picked moment photo is resized to a Blob, and on post the blob is uploaded to `ftPhotoPaths.moment(currentTreeId, <newDocId>)`, storing `photoPath`. Because the moment id is generated by `addDoc`, create the ref first:

```js
      var mref = doc(collection(db, 'trees', currentTreeId, 'moments'));
      var photoPath = null;
      if(pendingMomentPhoto && pendingMomentPhoto.blob){
        photoPath = window.ftPhotoPaths.moment(currentTreeId, mref.id);
        await window.__ftPhotos.uploadPhoto(photoPath, pendingMomentPhoto.blob);
      }
      await setDoc(mref, {
        text: text, photoPath: photoPath, type: selectedMomentType || 'news',
        byEmail: (auth.currentUser && auth.currentUser.email) || '', byUid: currentUid,
        at: serverTimestamp()
      });
```
Update the moment photo picker (`momentPhotoFile` change handler, ~line 691) to store `pendingMomentPhoto = { blob: blob, dataUrl: dataUrl }` (mirror Task 2), and the preview to use `dataUrl`.

- [ ] **Step 4: Verify** `node scripts/photos.test.cjs` still passes and `node --check cloud.js app.js`.

- [ ] **Step 5: Commit**

```bash
git add app.js cloud.js
git commit -m "feat(photos): upload picked photos to Storage and store photoPath on save"
```

---

### Task 5: Render from `photoPath` everywhere (backward-compatible)

**Files:**
- Modify: `app.js` — `personCard` (~949), `openProfile` avatar (~2021), `buildProfileCanvas` (~2136), completeness/stats "has photo" checks (`ppl[id].photo` → source-aware), home photo count (~1276).
- Modify: `cloud.js` — `renderMoments` photo (~507).

**Interfaces:**
- Consumes: `window.ftPhotoSource`, `window.__ftPhotos.resolveURL`.

- [ ] **Step 1: Add a render helper in `app.js`** (near `ftPhotoSource`) that returns an `<img>`/emoji synchronously and lazily swaps a path→URL:

```js
  // Returns avatar inner HTML immediately (emoji or base64 <img>), and for a
  // Storage path inserts a placeholder <img data-photo-path> that fillPhotoRefs()
  // resolves to a real URL after render. cb runs after DOM insertion.
  function avatarInnerHtml(rec, fallbackEmoji){
    var s = ftPhotoSource(rec);
    if(s.kind === 'base64') return '<img src="'+escapeHtml(s.value)+'" alt="">';
    if(s.kind === 'path')  return '<img data-photo-path="'+escapeHtml(s.value)+'" alt="">';
    return fallbackEmoji;
  }
  function fillPhotoRefs(root){
    (root || document).querySelectorAll('img[data-photo-path]').forEach(function(img){
      var path = img.getAttribute('data-photo-path'); img.removeAttribute('data-photo-path');
      if(window.__ftPhotos && window.__ftPhotos.resolveURL){
        window.__ftPhotos.resolveURL(path).then(function(u){ img.src = u; }, function(){ /* offline/denied: stays blank */ });
      }
    });
  }
  window.__ftFillPhotoRefs = fillPhotoRefs;
```

- [ ] **Step 2: Replace `personCard` avatar** (line ~949):

```js
    var avatarInner = avatarInnerHtml(p, (p.gender==='f' ? '👩' : '👨'));
```
And call `fillPhotoRefs()` at the end of `render()` (after `treeRoot.appendChild(...)`), and after `openProfile` opens the sheet.

- [ ] **Step 3: Replace `openProfile` avatar** (line ~2021):

```js
    var av = avatarInnerHtml(p, (p.gender==='f' ? '👩' : '👨'));
```
After `openSheet(...)` in `openProfile`, add `fillPhotoRefs(document.getElementById('sheet'));`.

- [ ] **Step 4: `buildProfileCanvas`** (line ~2136) — it draws `p.photo` onto a canvas for the share image. Make it resolve a path first:

```js
    var srcObj = ftPhotoSource(p);
    var photoSrc = srcObj.kind === 'base64' ? srcObj.value
                 : srcObj.kind === 'path' ? await window.__ftPhotos.resolveURL(srcObj.value).catch(function(){ return null; })
                 : null;
    if(photoSrc){
      var img = new Image(); img.crossOrigin = 'anonymous';   // Storage URLs need CORS for canvas
      await new Promise(function(res){ img.onload = res; img.onerror = res; img.src = photoSrc; });
      /* ...existing draw... */
    }
```
(Storage download URLs are CORS-enabled by default; `crossOrigin='anonymous'` prevents canvas taint so `toDataURL` still works.)

- [ ] **Step 5: "has photo" checks** — replace boolean `p.photo`/`ppl[id].photo` truthiness with source-aware checks so migrated people still count:
  - `completeness.js` FIELDS photo test: `function(p){ return ftPhotoSource(p).kind !== 'none'; }` — but `completeness.js` is a pure engine without `ftPhotoSource`. Add a tiny inline check there instead: `return !!((p && p.photoPath) || (p && p.photo));`. Update its test.
  - `app.js` home photo count (~1276) and `homeCompletionHint` (~1195): `has(p.photoPath) || has(p.photo)`.
  - `stats.js` `withPhoto` and `ftStatsBreakdown`: `if(p.photoPath || p.photo) withPhoto++;`. Update stats tests to include a `photoPath` case.

- [ ] **Step 6: `renderMoments` in `cloud.js`** (line ~507) — replace `(v.photo ? '<img class="moment-photo" src="'+esc(v.photo)+'">' : '')` with a path-aware version:

```js
        (function(){
          var s = window.ftPhotoSource ? window.ftPhotoSource({ photoPath: v.photoPath, photo: v.photo }) : {kind:'none'};
          if(s.kind === 'base64') return '<img class="moment-photo" src="'+esc(s.value)+'">';
          if(s.kind === 'path')  return '<img class="moment-photo" data-photo-path="'+esc(s.value)+'">';
          return '';
        })() +
```
And after `list.innerHTML = html;` in `renderMoments`, call `window.__ftFillPhotoRefs && window.__ftFillPhotoRefs(list);`.

- [ ] **Step 7: Update pure-engine tests** — `scripts/completeness.test.cjs`, `scripts/stats.test.cjs`, `scripts/stats-breakdown.test.cjs`: add a person with `photoPath` (no `photo`) and assert they count as having a photo.

- [ ] **Step 8: Run all node tests**

Run: `for f in scripts/*.test.cjs; do node "$f" || break; done`
Expected: every suite `N passed, 0 failed`.

- [ ] **Step 9: Verify render in the isolated harness** — load `_d1.html`, `__ftApplyRemote` a person with `photoPath` set to a fake path; confirm the card shows an `<img data-photo-path>` becomes present (resolve will fail silently with no firebase — acceptable; the point is no crash and legacy base64 still renders). Confirm a legacy `photo` base64 person renders its image.

- [ ] **Step 10: Commit**

```bash
git add app.js cloud.js completeness.js stats.js scripts/*.test.cjs
git commit -m "feat(photos): render from photoPath everywhere, backward-compatible with base64"
```

---

### Task 6: Storage security rules + emulator tests (SECURITY — different-agent review)

**Files:**
- Create: `storage.rules`
- Modify: `firebase.json` — add `"storage": { "rules": "storage.rules" }`
- Modify: `firebase.emulator.json` — add storage emulator + storage rules
- Create: `scripts/verify-storage-rules.mjs`
- Modify: `package.json` — add `"test:storage": "..."` script

- [ ] **Step 1: Write `storage.rules`** (exact content from the spec §5).

- [ ] **Step 2: Write emulator tests** `scripts/verify-storage-rules.mjs` using `@firebase/rules-unit-testing` `initializeTestEnvironment({ storage: { rules }, firestore: { rules } })`. Seed a tree with an owner, an editor, a viewer, and an outsider in Firestore (rules-disabled), then assert against Storage:
  - member (viewer) can `getBytes`/`getDownloadURL` of `trees/{TREE}/people/p1.jpg` → succeeds
  - outsider read → fails
  - editor `uploadBytes` a small `image/jpeg` → succeeds
  - viewer upload → fails
  - editor upload of `text/plain` → fails (contentType)
  - editor upload > 2MB → fails (size)
  - editor delete → succeeds; viewer delete → fails
  - cross-tenant: editor of TREE cannot write `trees/OTHERTREE/...`

Provide the FULL test file content (mirror `verify-rules.mjs` structure; import `assertFails/assertSucceeds`, use `ctx.storage()`).

- [ ] **Step 3: Add scripts to `package.json`**

```json
    "test:storage": "firebase emulators:exec --only firestore,storage --config firebase.emulator.json --project family-tree-rules-test \"node scripts/verify-storage-rules.mjs\""
```

- [ ] **Step 4: Run**

Run: `npm run test:storage`
Expected: `N passed, 0 failed`, emulators shut down cleanly.

- [ ] **Step 5: Different-agent security review** — dispatch `pr-review-toolkit:code-reviewer` and `pr-review-toolkit:silent-failure-hunter` on `storage.rules` + `scripts/verify-storage-rules.mjs` + the upload/migration client code. Fix ≥85% findings. Do NOT proceed to deploy until triaged.

- [ ] **Step 6: Commit**

```bash
git add storage.rules firebase.json firebase.emulator.json scripts/verify-storage-rules.mjs package.json
git commit -m "feat(photos): Storage security rules (member-gated) + emulator tests"
```

---

### Task 7: Gradual auto-migration (people base64 → Storage) + SW image cache

**Files:**
- Modify: `cloud.js` — run migration after the first tree snapshot when the user is an editor
- Modify: `app.js` — expose a helper to list people needing migration and to apply a migrated batch
- Modify: `sw.js` — cache-first for Storage image requests + new `family-tree-img-vN` cache

**Interfaces:**
- Consumes: `window.__ftPhotos.uploadPhoto`, `window.ftPhotoPaths.person`, the local `state.people`, the existing save path (`scheduleSave`/`pushToCloud`).

- [ ] **Step 1: Migration helper in `app.js`**

```js
  // People still holding base64 (no photoPath yet). Migration converts each to a
  // Blob, uploads it, sets photoPath, and clears base64 — but ONLY after the
  // upload resolves, so a failure never loses the original.
  function personsNeedingPhotoMigration(){
    return Object.keys(state.people).filter(function(id){
      var p = state.people[id]; return p && p.photo && !p.photoPath;
    });
  }
  window.__ftMigratePhotoBatch = async function(treeId, limit){
    var ids = personsNeedingPhotoMigration().slice(0, limit || 5);
    var changed = false;
    for(var i=0;i<ids.length;i++){
      var id = ids[i], p = state.people[id];
      try{
        var blob = await (await fetch(p.photo)).blob();     // base64 data URL -> Blob
        var path = window.ftPhotoPaths.person(treeId, id);
        await window.__ftPhotos.uploadPhoto(path, blob);
        p.photoPath = path; p.photo = null; changed = true;  // clear ONLY after upload OK
      }catch(e){ console.error('[photo-migrate] failed for', id, e && e.code); break; }
    }
    if(changed) scheduleSave();
    return { migrated: changed, remaining: personsNeedingPhotoMigration().length };
  };
```

- [ ] **Step 2: Trigger in `cloud.js`** — after `remoteLoaded` becomes true in `subscribeTree` AND `currentRole !== 'viewer'`, call `window.__ftMigratePhotoBatch(currentTreeId, 5)` on a short timer, repeating while `remaining > 0` and no error, spacing batches ~3s apart to avoid save pressure. Guard with a module flag `migrating` so it never overlaps.

- [ ] **Step 3: SW image cache** — in `sw.js`, in the `fetch` handler, before the same-origin check, add:

```js
  if(url.hostname.indexOf('firebasestorage') !== -1){
    e.respondWith(
      caches.open('family-tree-img-v1').then(function(c){
        return c.match(req).then(function(hit){
          if(hit) return hit;                               // cache-first (offline-friendly)
          return fetch(req).then(function(res){
            if(res && res.status === 200){ c.put(req, res.clone()); }
            return res;
          });
        });
      })
    );
    return;
  }
```
Bump `CACHE` version and add `family-tree-img-v1` to the activate-cleanup allowlist (do NOT delete the image cache on activate).

- [ ] **Step 4: Verify migration in isolation** — impossible against live firebase; instead unit-test `personsNeedingPhotoMigration` selection logic with a node test (`scripts/photo-migrate.test.cjs`): given a `state.people` with mixed base64/path/none, it returns exactly the base64-without-path ids. (Expose the selector on the node guard.)

Run: `node scripts/photo-migrate.test.cjs`  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js cloud.js sw.js scripts/photo-migrate.test.cjs
git commit -m "feat(photos): gradual auto-migration (base64->Storage) + SW image cache"
```

---

### Task 8: Live verification, deploy, finish

- [ ] **Step 1: Full node suite green** — `for f in scripts/*.test.cjs; do node "$f" || break; done` and `npm run test:rules` and `npm run test:storage`.
- [ ] **Step 2: Owner backup** — confirm a fresh JSON backup of the live tree exists OUTSIDE the repo before any live migration.
- [ ] **Step 3: Deploy Storage rules** (with owner consent): `firebase deploy --only storage --project family-tree-app-d9238`. Also confirm Firestore rules unchanged.
- [ ] **Step 4: Deploy code** — bump `styles.css`/SW versions as needed, commit, `git push` (GitHub Pages auto-deploys). On the owner's device: add/edit a person photo (uploads to Storage), reload (renders from path), go offline and confirm the cached photo still shows.
- [ ] **Step 5: Watch migration** — on the owner's tree, confirm base64 people migrate in batches (doc size drops) with no lost photos.
- [ ] **Step 6:** REQUIRED SUB-SKILL: Use superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** §4.1 photos.js → Tasks 1,3; §4.2 photoPath + resolver → Tasks 1,4,5; §4.3 layout → Task 1 path builders; §4.4 resizeImage→Blob → Task 2; §5 rules → Task 6; §6 migration → Task 7; §7 SW offline → Task 7; §8 testing → Tasks 1,5,6,7,8; §9 cost → note only (Task 8 deploy). All covered.

**Placeholder scan:** No "TBD"/"add error handling" left vague — upload failures raise `photoUploadFail`, migration guards clear-after-upload, resolve failures are explicitly "stay blank". The Task 6 test file content is described by exact assertions (implementer writes the mirror of the existing `verify-rules.mjs`, which is present in the repo as a complete template).

**Type consistency:** `pendingPhoto` normalised to `{blob,dataUrl,existing?}|null` in Tasks 2 & 4; `ftPhotoSource` returns `{kind,value}` used in Tasks 1,5; `window.__ftPhotos.{uploadPhoto,resolveURL,deletePhoto}` consistent across Tasks 3,4,5,7; `ftPhotoPaths.{person,moment}` consistent across Tasks 1,4,7. Path builders live in `photo-paths.js` (classic, node-testable); SDK API in `photos.js` (module) — resolved the ESM/CJS clash noted in Task 3 Step 1.
