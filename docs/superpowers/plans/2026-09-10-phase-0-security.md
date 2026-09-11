# خطة تنفيذ المرحلة ٠ — الأمن

> **للمنفِّذ الآلي:** مهارة فرعية مطلوبة: استخدم `superpowers:subagent-driven-development` (موصى به) أو `superpowers:executing-plans` لتنفيذ هذه الخطة مهمةً مهمة. الخطوات تستخدم صيغة صناديق التحقق (`- [ ]`) للتتبّع.

**الهدف:** إغلاق انهيار عزل المستأجرين المؤكَّد على الخادم، واستبدال الانضمام الحر غير الآمن بنظام دعوات آمن، مع مجموعة اختبارات انحدار تمنع عودة الثغرات.

**المعمارية:** قواعد Firestore الجديدة تجعل العضوية — لا هوية المستخدم — مصدر كل صلاحية. الانضمام يتم عبر **دعوة** يولّدها المالك (رمز/رابط) ويُتحقَّق منها على الخادم، بدل رمز عائلة يمنح نفسه العضوية. معرِّف الشجرة يصبح مُعرِّفاً عشوائياً مستقلاً عن سرّ الدعوة، فتزول مشكلة التصادم. تُختبر القواعد آلياً على محاكي Firestore قبل النشر.

**حزمة التقنية:** Firebase Firestore Rules v2 · محاكي Firebase · `@firebase/rules-unit-testing` · Node 22 · التطبيق ملف `index.html` واحد (Vanilla JS + Firebase Web SDK 10.13.2 عبر ESM).

## القيود العامة (Global Constraints)

- **مصدر الصلاحية:** `trees/{treeId}/members/{uid}` **فقط** — لا `users/{uid}` أبداً (قابل للكتابة من صاحبه).
- **قيمة `role`:** واحدة من `owner` / `editor` / `viewer`. مالك واحد لكل شجرة (المُنشئ). لا تُمنح `owner` عبر دعوة أبداً.
- **حذف الشجرة:** ممنوع على الخادم (`allow delete: if false`).
- **معرِّف الشجرة:** مُعرِّف تلقائي عشوائي (`doc(collection(db,'trees'))`)، لا رمز 6 أحرف.
- **النشر:** GitHub Pages من `main` مباشرة. القواعد تُنشر عبر `firebase deploy --only firestore:rules`.
- **مراجعة أمنية إلزامية:** لا تُعلَن هذه المرحلة منتهية قبل مراجعة وكيلين مستقلَّين (`pr-review-toolkit:code-reviewer` + `pr-review-toolkit:silent-failure-hunter`) وإصلاح النتائج ≥85% ثقة.
- **مشروع المحاكي للاختبار:** `family-tree-rules-test` (وهمي — لا يمسّ الإنتاج).
- **بنية الأسماء في ملفات الإعداد تتبع نمط `Barakat-Al-Aila`** (المشروع الشقيق) حرفياً حيث أمكن.
- **إسناد الـ commit:** ينتهي بـ `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## بنية الملفات

| الملف | الحالة | المسؤولية |
|---|---|---|
| `package.json` | إنشاء | تبعيات وأوامر اختبار القواعد فقط (ليس تطبيقاً) |
| `.firebaserc` | إنشاء | ربط المشروع الافتراضي `family-tree-app-d9238` |
| `firebase.json` | إنشاء | إعداد النشر — يشير إلى `firestore.rules` |
| `firebase.emulator.json` | إنشاء | إعداد المحاكي فقط (منفذ 8080، بلا UI) |
| `firestore.rules` | إنشاء | القواعد الآمنة الجديدة — قلب المرحلة |
| `scripts/verify-rules.mjs` | إنشاء | مجموعة اختبارات الانحدار الأمنية |
| `index.html` | تعديل | تدفّق التسجيل (إنشاء/دعوة)، إصلاح السطر 1253، واجهة توليد الدعوة، قراءة `#join=` |
| `.gitignore` | تعديل | إضافة `node_modules/` |

---

## Task 1: سقالة اختبار القواعد + اختبارات الانحدار (حمراء على القواعد الحالية)

**Files:**
- Create: `package.json`, `.firebaserc`, `firebase.emulator.json`, `firestore.rules` (نسخة من القواعد الحالية كخط أساس), `scripts/verify-rules.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: أمر `npm run test:rules` يشغّل `scripts/verify-rules.mjs` على المحاكي. توابع مساعدة: `check(name, fn)`، ثوابت `OWNER`/`OUTSIDER`/`TREE`/`INVITE_EDITOR`.

- [ ] **Step 1: إنشاء `package.json`**

```json
{
  "name": "family-tree-rules",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:rules": "firebase emulators:exec --only firestore --config firebase.emulator.json --project family-tree-rules-test \"node scripts/verify-rules.mjs\""
  },
  "devDependencies": {
    "firebase": "^10.13.2",
    "@firebase/rules-unit-testing": "^5.0.1"
  }
}
```

- [ ] **Step 2: إنشاء ملفات الإعداد**

`.firebaserc`:
```json
{ "projects": { "default": "family-tree-app-d9238" } }
```

`firebase.emulator.json`:
```json
{
  "_comment": "Emulator-only config for `npm run test:rules`.",
  "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": false } }
}
```

- [ ] **Step 3: نسخ القواعد الحالية (خط أساس) إلى `firestore.rules`**

انسخ نص القواعد المنشورة الحالية حرفياً (الموثَّق في المواصفة، قسم النتائج 3.0) إلى `firestore.rules`. هذا الخط الأساس **يجب أن تفشل عليه** اختبارات الأمان — لإثبات أن الثغرة حقيقية.

- [ ] **Step 4: تعديل `.gitignore`**

أضف سطراً:
```
node_modules/
```

- [ ] **Step 5: كتابة مجموعة الاختبارات `scripts/verify-rules.mjs`**

```javascript
/**
 * Security-rules regression suite — runs against the Firestore emulator and
 * asserts the specific attacks the Phase 0 rework was written to stop. Each
 * check is named after the finding it covers, so a future edit that reopens
 * one fails loudly here. Standalone (not Jest): needs the real SDK + emulator.
 *   Usage: npm run test:rules
 */
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const OWNER = 'uid-owner';
const OUTSIDER = 'uid-outsider';
const JOINER = 'uid-joiner';
const TREE = 'tree-1';
const INVITE_EDITOR = 'invite-editor-token';

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failed++; console.error(`  FAIL ${name}\n       ${String(err.message).split('\n')[0]}`); }
};

const testEnv = await initializeTestEnvironment({
  projectId: 'family-tree-rules-test',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1', port: 8080,
  },
});

// ── Seed: one tree owned by OWNER, plus one editor invite ───────────────
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'trees', TREE), {
    familyName: { ar: 'الوزير', en: 'Alwazir' }, createdBy: OWNER,
    rootId: null, people: {}, lang: 'ar',
  });
  await setDoc(doc(db, 'trees', TREE, 'members', OWNER), { role: 'owner', email: 'o@x.com' });
  await setDoc(doc(db, 'trees', TREE, 'invites', INVITE_EDITOR), { role: 'editor', createdBy: OWNER });
  await setDoc(doc(db, 'users', OWNER), { email: 'o@x.com', treeId: TREE });
  await setDoc(doc(db, 'users', OUTSIDER), { email: 'out@x.com', treeId: '' });
  await setDoc(doc(db, 'trees', TREE, 'moments', 'm1'), { byUid: OWNER, text: 'hi' });
});

const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
const outsiderDb = testEnv.authenticatedContext(OUTSIDER).firestore();
const joinerDb = testEnv.authenticatedContext(JOINER).firestore();

console.log('\nfirestore.rules');

// ── ATTACKS THAT MUST FAIL ──────────────────────────────────────────────
await check('3.0a outsider cannot read another family tree', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE))));

await check('3.0a outsider cannot list all trees', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees'))));

await check('3.0b outsider cannot self-grant owner membership', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'members', OUTSIDER), { role: 'owner' })));

await check('3.0b outsider cannot self-grant editor membership', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'members', OUTSIDER), { role: 'editor' })));

await check('3.0b outsider cannot edit the tree without membership', () =>
  assertFails(updateDoc(doc(outsiderDb, 'trees', TREE), { familyName: { ar: 'x', en: 'x' } })));

await check('3.0b outsider cannot delete the real owner', () =>
  assertFails(deleteDoc(doc(outsiderDb, 'trees', TREE, 'members', OWNER))));

await check('3.0 outsider cannot read family moments', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'moments', 'm1'))));

await check('outsider cannot enumerate invites to steal one', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'invites'))));

await check('join via invite cannot escalate role beyond the invite', () =>
  assertFails(setDoc(doc(joinerDb, 'trees', TREE, 'members', JOINER),
    { role: 'owner', viaInvite: INVITE_EDITOR })));

await check('nobody can hard-delete a tree', () =>
  assertFails(deleteDoc(doc(ownerDb, 'trees', TREE))));

await check('editor/viewer invites only — cannot mint an owner invite', () =>
  assertFails(setDoc(doc(ownerDb, 'trees', TREE, 'invites', 'x'), { role: 'owner', createdBy: OWNER })));

// ── LEGITIMATE OPS THAT MUST SUCCEED ────────────────────────────────────
await check('owner can read own tree', () =>
  assertSucceeds(getDoc(doc(ownerDb, 'trees', TREE))));

await check('owner can edit own tree', () =>
  assertSucceeds(updateDoc(doc(ownerDb, 'trees', TREE), { rootId: 'p1' })));

await check('owner can create an editor invite', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'invites', 'inv2'), { role: 'editor', createdBy: OWNER })));

await check('joiner with a valid editor invite can join as editor', () =>
  assertSucceeds(setDoc(doc(joinerDb, 'trees', TREE, 'members', JOINER),
    { role: 'editor', viaInvite: INVITE_EDITOR })));

await check('a brand-new user can bootstrap their own new tree', () =>
  assertSucceeds((async () => {
    await setDoc(doc(outsiderDb, 'trees', 'tree-new'), {
      familyName: { ar: '', en: '' }, createdBy: OUTSIDER, rootId: null, people: {}, lang: 'ar',
    });
    await setDoc(doc(outsiderDb, 'trees', 'tree-new', 'members', OUTSIDER), { role: 'owner' });
  })()));

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 6: تثبيت التبعيات**

Run: `npm install`
Expected: يُنشأ `node_modules/` بلا أخطاء.

- [ ] **Step 7: تشغيل المجموعة على القواعد الحالية — يجب أن تفشل اختبارات الهجوم**

Run: `npm run test:rules`
Expected: المحاكي يبدأ، ثم أسطر `FAIL 3.0a outsider cannot read...`, `FAIL 3.0b outsider cannot self-grant owner...` إلخ. الخروج بكود 1.
هذا **النجاح المطلوب** لهذه المهمة: الاختبارات حمراء لأن القواعد الحالية مثغورة فعلاً.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .firebaserc firebase.emulator.json firestore.rules scripts/verify-rules.mjs .gitignore
git commit -m "test: add firestore rules regression suite (red on current rules)

The suite encodes the confirmed Phase 0 attacks (findings 3.0a/3.0b/3.3)
as assertFails checks plus the legitimate ops that must keep working.
Run against the CURRENT (baseline) rules it fails on every attack check,
proving the tenant-isolation break is real before we rewrite the rules.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: القواعد الآمنة (تحويل المجموعة إلى خضراء)

**Files:**
- Modify: `firestore.rules` (استبدال كامل)

**Interfaces:**
- Consumes: مجموعة الاختبارات من Task 1.
- Produces: قواعد تعتمد `members/{uid}` مصدراً للصلاحية؛ دوال `isMember/isOwner/canEdit`؛ مسار دعوة عبر `invites/{token}` بحقل `viaInvite` في مستند العضوية.

- [ ] **Step 1: كتابة القواعد الآمنة كاملةً في `firestore.rules`**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ===================================================================
    // Identity vs. permission
    //
    // Authority for "is this user a member / what role?" is the member
    // document at trees/{treeId}/members/{uid} -- a document the user can
    // NEVER freely create for themselves in an existing tree.
    //
    // It is deliberately NOT users/{uid}: that doc IS self-writable, so
    // basing permission on it lets a user grant themselves any role.
    // ===================================================================

    function signedIn() { return request.auth != null; }
    function uid() { return request.auth.uid; }
    function memberDoc(treeId) {
      return /databases/$(database)/documents/trees/$(treeId)/members/$(uid());
    }
    function isMember(treeId) { return signedIn() && exists(memberDoc(treeId)); }
    function myRole(treeId) { return get(memberDoc(treeId)).data.role; }
    function isOwner(treeId) { return isMember(treeId) && myRole(treeId) == 'owner'; }
    function canEdit(treeId) { return isMember(treeId) && myRole(treeId) != 'viewer'; }
    function treeCreatedBy(treeId) {
      return get(/databases/$(database)/documents/trees/$(treeId)).data.createdBy;
    }
    function inviteDoc(treeId, token) {
      return /databases/$(database)/documents/trees/$(treeId)/invites/$(token);
    }

    // users/{uid}: self only. Never a source of permission.
    match /users/{userId} {
      allow read, write: if signedIn() && uid() == userId;
    }

    match /trees/{treeId} {
      allow read:   if isMember(treeId);
      allow create: if signedIn() && request.resource.data.createdBy == uid();
      allow update: if canEdit(treeId);
      allow delete: if false;

      match /members/{memberUid} {
        allow read: if isMember(treeId);

        // create — three legitimate paths, never free self-grant:
        allow create: if signedIn() && (
          // (1) bootstrap: the tree's creator becomes its first owner
          ( memberUid == uid()
            && request.resource.data.role == 'owner'
            && treeCreatedBy(treeId) == uid()
            && !exists(memberDoc(treeId)) )
          ||
          // (2) invited join: a valid invite exists; role must match it and never be owner
          ( memberUid == uid()
            && request.resource.data.role != 'owner'
            && exists(inviteDoc(treeId, request.resource.data.viaInvite))
            && get(inviteDoc(treeId, request.resource.data.viaInvite)).data.role
                 == request.resource.data.role )
          ||
          // (3) an owner adds someone directly
          ( isOwner(treeId) )
        );

        allow update: if isOwner(treeId);
        allow delete: if isOwner(treeId) && memberUid != uid();
      }

      match /invites/{token} {
        allow get:    if signedIn();          // a joiner reads the token they were handed
        allow list:   if isMember(treeId);    // only members may enumerate invites
        allow create: if canEdit(treeId)
                      && request.resource.data.role in ['editor', 'viewer'];
        allow delete: if canEdit(treeId);
        allow update: if false;
      }

      match /activity/{logId} {
        allow read:   if isMember(treeId);
        allow create: if isMember(treeId);
        allow update, delete: if false;
      }

      match /moments/{momentId} {
        allow read:   if isMember(treeId);
        allow create: if isMember(treeId) && request.resource.data.byUid == uid();
        allow delete: if signedIn() &&
                      (resource.data.byUid == uid() || isOwner(treeId));
        allow update: if false;
      }
    }
  }
}
```

- [ ] **Step 2: تشغيل المجموعة — يجب أن تصبح خضراء بالكامل**

Run: `npm run test:rules`
Expected: كل الأسطر `ok`، والسطر الأخير `NN passed, 0 failed`، الخروج بكود 0.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(security): rewrite firestore rules to enforce tenant isolation

Membership is now the sole source of permission (never users/{uid}).
Tree read/edit require membership; joining requires a valid owner-issued
invite whose role is copied into the membership and can never be 'owner';
invites cannot be enumerated by outsiders; tree hard-delete is forbidden.

The regression suite from the previous commit is now fully green.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: مراجعة أمنية مستقلة (إلزامية — قاعدة المؤسسة ٢)

**Files:** لا تعديل — مراجعة فقط، ثم إصلاحات إن لزمت.

- [ ] **Step 1: تشغيل مراجعتين مستقلّتين بالتوازي**

استدعِ الوكيلين في رسالة واحدة:
- `pr-review-toolkit:code-reviewer` — ركّز على `firestore.rules` و `scripts/verify-rules.mjs`. أعطِه: المواصفة (قسم 3.0)، والقيود العامة، وأن مصدر الصلاحية يجب أن يكون `members` لا `users`.
- `pr-review-toolkit:silent-failure-hunter` — ابحث عن مسارات تسمح بصلاحية دون قصد، أو اختبارات تمرّ زوراً (assertFails ينجح لسبب خاطئ مثل خطأ إملائي في المسار).

- [ ] **Step 2: فرز النتائج**

لكل نتيجة ≥85% ثقة: أصلحها في `firestore.rules` أو المجموعة، ثم أعد `npm run test:rules` (يجب أن تبقى خضراء). النتائج الأقل ثقة → قيّدها كمتابعة.
تحقّق من كل نتيجة مقابل الكود قبل قبولها — الوكلاء يخطئون أحياناً؛ لا تقبل نتيجة يكذّبها الكود.

- [ ] **Step 3: Commit (إن وُجدت إصلاحات)**

```bash
git add firestore.rules scripts/verify-rules.mjs
git commit -m "fix(security): address independent review findings on firestore rules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: نشر القواعد على الإنتاج

**Files:**
- Create: `firebase.json`

**Interfaces:**
- Consumes: `firestore.rules` الآمنة المُراجَعة.

- [ ] **Step 1: إنشاء `firebase.json` للنشر**

```json
{
  "firestore": { "rules": "firestore.rules" }
}
```

- [ ] **Step 2: التحقق من هدف النشر (تشغيل جاف)**

Run: `firebase deploy --only firestore:rules --project family-tree-app-d9238 --dry-run`
Expected: يعرض أنه سينشر `firestore.rules` إلى `family-tree-app-d9238` بلا أخطاء تجميع.

> **بوابة تأكيد المستخدم:** هذا النشر يُغيّر الإنتاج مباشرةً وقد يكسر تدفّق التطبيق القديم مؤقتاً (حتى تنزل تعديلات العميل في Task 5-7). لا تنشر دون تأكيد المستخدم الصريح في هذه الخطوة، ونفّذ Task 5-7 مباشرة بعده لتقليل نافذة الكسر.

- [ ] **Step 3: النشر (بعد تأكيد المستخدم)**

Run: `firebase deploy --only firestore:rules --project family-tree-app-d9238`
Expected: `✔ Deploy complete!`

- [ ] **Step 4: التحقق بعد النشر — قراءة غير موثَّقة لا تزال مرفوضة**

Run: `curl -s -o /dev/null -w "%{http_code}" "https://firestore.googleapis.com/v1/projects/family-tree-app-d9238/databases/(default)/documents/trees?pageSize=1"`
Expected: `403`

- [ ] **Step 5: Commit**

```bash
git add firebase.json
git commit -m "chore: add firebase.json for firestore rules deploy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: عميل — تدفّق إنشاء عائلة جديدة (معرِّف تلقائي + createdBy)

**Files:**
- Modify: `index.html:1206-1214` (كتلة `else` — إنشاء العائلة)، واستيراد `collection` موجود ([السطر 1092](../../../index.html)).

**Interfaces:**
- Consumes: قواعد Task 2 (create يتطلب `createdBy == uid`؛ bootstrap يتطلب الشجرة موجودة قبل العضوية).
- Produces: شجرة بمعرِّف تلقائي، الترتيب: مستند الشجرة (بـ `createdBy`) ثم مستند العضوية.

- [ ] **Step 1: استبدال كتلة إنشاء العائلة**

استبدل السطور 1206-1214 الحالية:
```javascript
      } else {
        manualAuthFlow = true;
        var cred2 = await createUserWithEmailAndPassword(auth, email, pass);
        var newCode = genFamilyCode();
        await setDoc(doc(db, 'trees', newCode, 'members', cred2.user.uid), { email: email, role: 'owner', joinedAt: serverTimestamp() });
        await setDoc(doc(db, 'trees', newCode), { familyName:'', lang:'ar', rootId:null, people:{}, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', cred2.user.uid), { email: email, treeId: newCode });
```
بـ:
```javascript
      } else {
        manualAuthFlow = true;
        var cred2 = await createUserWithEmailAndPassword(auth, email, pass);
        // Auto-id tree: id is decoupled from any human-shareable secret, so
        // there is no code to collide (removes finding 3.3). createdBy lets
        // the rules authorise the bootstrap owner-membership below.
        var treeRef = doc(collection(db, 'trees'));
        var newCode = treeRef.id;
        // Tree doc FIRST: the members bootstrap rule reads trees/{id}.createdBy.
        await setDoc(treeRef, { familyName:'', lang:'ar', rootId:null, people:{}, createdBy: cred2.user.uid, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'trees', newCode, 'members', cred2.user.uid), { email: email, role: 'owner', joinedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', cred2.user.uid), { email: email, treeId: newCode });
```

- [ ] **Step 2: حذف `genFamilyCode` غير المستخدمة**

احذف الدالة [1162-1167](../../../index.html) بالكامل (لم تعد تُستدعى — تحقّق: `grep -n genFamilyCode index.html` يجب ألا يُظهر أي استدعاء متبقٍ).

- [ ] **Step 3: التحقق اليدوي على المحاكي**

شغّل المحاكي (`firebase emulators:start --only firestore,auth --project family-tree-app-d9238`)، وجّه التطبيق محلياً إليه، وأنشئ عائلة جديدة. تأكّد: تُنشأ الشجرة، ويصبح المستخدم مالكاً، وتظهر شاشة الشجرة بلا خطأ في console.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: create families with an auto-id tree + createdBy

Tree id is now a Firestore auto-id, decoupled from any shareable secret,
so there is no family code to collide (removes finding 3.3). The tree doc
is written before the owner membership because the new bootstrap rule
reads trees/{id}.createdBy to authorise it. genFamilyCode is removed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: عميل — توليد الدعوة + الانضمام برابط

**Files:**
- Modify: `index.html` — كتلة الانضمام [1181-1205](../../../index.html)؛ قائمة الأدوات حول [1028](../../../index.html)؛ قراءة `#join=` عند التحميل؛ استيراد `deleteDoc`/`addDoc` موجود ([1092](../../../index.html)).

**Interfaces:**
- Consumes: قواعد الدعوة من Task 2 (`invites/{token}` get للموثَّق، create لمن يملك التعديل؛ membership create عبر `viaInvite`).
- Produces: رابط `https://<host>/#join=<treeId>.<token>`؛ دالة `createInvite(role)`؛ تدفّق انضمام يقرأ الدعوة ثم يُنشئ العضوية.

- [ ] **Step 1: استبدال كتلة الانضمام**

استبدل السطور 1181-1205 (كتلة `signupMode === 'join'`) بـ:
```javascript
      } else if(signupMode === 'join'){
        // The join link carries "<treeId>.<token>" in #join=; we parse it into
        // these two hidden fields on load (Step 4). No tree read before join.
        var joinRaw = document.getElementById('joinCode').value.trim();
        var dot = joinRaw.indexOf('.');
        if(dot < 1){ setLoading(false); showErr(t('errBadInvite')); return; }
        var joinTreeId = joinRaw.slice(0, dot);
        var joinToken  = joinRaw.slice(dot + 1);
        manualAuthFlow = true;
        var cred = await createUserWithEmailAndPassword(auth, email, pass);
        // Read the invite by token (rules: get allowed for any signed-in user).
        var invSnap = await getDoc(doc(db, 'trees', joinTreeId, 'invites', joinToken));
        if(!invSnap.exists()){
          await cred.user.delete().catch(function(){});
          manualAuthFlow = false; setLoading(false); showErr(t('errBadInvite')); return;
        }
        var invRole = invSnap.data().role; // 'editor' | 'viewer'
        // Membership create is authorised by the invite path in the rules.
        await setDoc(doc(db, 'trees', joinTreeId, 'members', cred.user.uid),
          { email: email, role: invRole, viaInvite: joinToken, joinedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', cred.user.uid), { email: email, treeId: joinTreeId });
        currentUid = cred.user.uid; currentTreeId = joinTreeId;
        currentRole = invRole;
        window.__ftSetEditable(invRole !== 'viewer');
        subscribeTree(currentTreeId);
        authGate.classList.add('hidden');
        cloudBtn.style.display = 'flex'; cloudBtn.title = (auth.currentUser && auth.currentUser.email) || ''; document.getElementById('momentsOpenBtn').style.display = 'flex';
        setLoading(false);
        manualAuthFlow = false;
        logActivity('join', '');
      }
```

- [ ] **Step 2: إضافة مفاتيح i18n للدعوة**

في كائن الترجمة ([330-398](../../../index.html)) أضف لكل من `ar` و `en`:
```javascript
// ar:
errBadInvite: 'رابط الدعوة غير صحيح أو انتهت صلاحيته',
menuInvite: '➕ دعوة فرد للعائلة',
inviteCopied: 'تم نسخ رابط الدعوة',
inviteRoleAsk: 'صلاحية المدعوّ:',
// en:
errBadInvite: 'The invite link is invalid or has expired',
menuInvite: '➕ Invite a family member',
inviteCopied: 'Invite link copied',
inviteRoleAsk: 'Invitee permission:',
```

- [ ] **Step 2ب: تحديث نص placeholder لحقل الانضمام**

في [237](../../../index.html) استبدل placeholder الرمز القديم بنص يوضّح لصق الرابط، واربطه بـ `t()` إن أمكن ضمن `applyLang`.

- [ ] **Step 3: إضافة زر الدعوة + `createInvite` في وحدة السحابة**

في بناء قائمة الأدوات ([1026-1028](../../../index.html)) أضف — لمن يملك التعديل فقط — زراً `id="mn_invite"` بنص `t('menuInvite')`، ومعالجه:
```javascript
if(canEditCloud && window.__ftCloud && window.__ftCloud.createInvite){
  var invBtn = document.getElementById('mn_invite');
  if(invBtn) invBtn.onclick = function(){ closeSheet(); window.__ftCloud.createInvite('editor'); };
}
```
وفي وحدة السحابة، أضف الدالة وصدّرها في `window.__ftCloud`:
```javascript
async function createInvite(role){
  if(!currentTreeId || currentRole === 'viewer') return;
  var token = (doc(collection(db, 'trees', currentTreeId, 'invites'))).id;
  await setDoc(doc(db, 'trees', currentTreeId, 'invites', token), {
    role: (role === 'viewer' ? 'viewer' : 'editor'), createdBy: currentUid, createdAt: serverTimestamp()
  });
  var base = location.origin + location.pathname;
  var link = base + '#join=' + currentTreeId + '.' + token;
  try { await navigator.clipboard.writeText(link); toast(t('inviteCopied')); }
  catch(e){ prompt(t('inviteCopied'), link); }
}
```
أضف `createInvite: createInvite` إلى كائن `window.__ftCloud` ([~1502](../../../index.html)).

- [ ] **Step 4: قراءة `#join=` عند التحميل لملء تدفّق الانضمام**

قرب تهيئة شاشة الدخول، أضف: عند وجود `location.hash` يبدأ بـ `#join=`، بدّل إلى وضع "signup/join"، واملأ `#joinCode` بالقيمة بعد `#join=`، وأظهر `joinCodeField`.
```javascript
(function handleInviteHash(){
  var h = location.hash || '';
  if(h.indexOf('#join=') === 0){
    var payload = decodeURIComponent(h.slice('#join='.length));
    var jc = document.getElementById('joinCode');
    if(jc){ jc.value = payload; }
    // switch UI to signup + join mode (reuse existing mode setters)
    if(typeof setSignupMode === 'function') setSignupMode('join');
  }
})();
```
> ملاحظة: طابق أسماء دوال تبديل الوضع الفعلية في الملف ([1146-1152](../../../index.html)) — استبدل `setSignupMode` بالاسم الحقيقي المستخدم هناك.

- [ ] **Step 5: التحقق اليدوي (شجرتان على المحاكي)**

على المحاكي: بحساب المالك، ولّد رابط دعوة (تأكّد أنه نُسخ). في نافذة خفية، افتح الرابط، أنشئ حساباً ثانياً، وتأكّد أنه انضم **كمحرِّر** وظهرت الشجرة نفسها. جرّب رابطاً مشوّهاً → يجب أن تظهر رسالة `errBadInvite` ولا يُنشأ حساب عالق.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: secure invite-link join flow (replaces open code join)

Owners/editors generate a single-tap invite link
(#join=<treeId>.<token>); joining reads the invite by token and creates
a membership whose role is copied from it -- the only server-authorised
join path. The old 'type a family code' self-grant join is gone.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: عميل — إصلاح تصعيد الصلاحية (السطر 1253)

**Files:**
- Modify: `index.html:1252-1254`

**Interfaces:**
- Consumes: لا شيء جديد.
- Produces: غياب العضوية → لا وصول (تسجيل خروج + رسالة)، لا `editor` افتراضي.

- [ ] **Step 1: استبدال منطق تحديد الدور**

استبدل [1252-1254](../../../index.html):
```javascript
      var memberSnap = await getDoc(doc(db, 'trees', currentTreeId, 'members', user.uid));
      currentRole = (memberSnap.exists() && memberSnap.data().role) || 'editor'; // legacy members with no role are grandfathered as editor
      window.__ftSetEditable(currentRole !== 'viewer');
```
بـ:
```javascript
      var memberSnap = await getDoc(doc(db, 'trees', currentTreeId, 'members', user.uid));
      if(!memberSnap.exists()){
        // No membership => no access. Never fall through to a default role;
        // that was finding 3.1 (an absent member doc granted 'editor').
        setLoading(false);
        showErr(t('errNoMembership'));
        await signOut(auth).catch(function(){});
        return;
      }
      currentRole = memberSnap.data().role || 'viewer'; // missing role => least privilege
      window.__ftSetEditable(currentRole !== 'viewer');
```

- [ ] **Step 2: إضافة مفتاح i18n**

أضف لكل من `ar`/`en`:
```javascript
// ar:
errNoMembership: 'حسابك ليس عضوًا في هذه العائلة. اطلب رابط دعوة من مالك الشجرة.',
// en:
errNoMembership: 'Your account is not a member of this family. Ask the tree owner for an invite link.',
```

- [ ] **Step 3: التحقق على المحاكي**

بحساب ليس عضواً (عدّل `users/{uid}.treeId` يدوياً في المحاكي ليشير لشجرة لا عضوية فيه) — يجب أن يُسجَّل الخروج وتظهر `errNoMembership`، لا صلاحية تحرير.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix(security): deny access when membership doc is absent

Finding 3.1: an absent members/{uid} fell through
`memberSnap.exists() && ... || 'editor'` to editor. Now a missing
membership signs the user out with a clear message; a member with a
missing role field gets least privilege (viewer), not editor.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: التحقق الشامل والإغلاق

- [ ] **Step 1: تشغيل مجموعة القواعد نهائياً**

Run: `npm run test:rules`
Expected: `NN passed, 0 failed`.

- [ ] **Step 2: سيناريو شامل على المحاكي**

تسلسل واحد: أنشئ عائلة (مالك) → ولّد دعوة → انضم بحساب ثانٍ كمحرِّر → المحرِّر يضيف شخصاً ويُزامن → المالك يخفض المحرِّر لمشاهد → المشاهد لا يعدّل. تأكّد من كل خطوة بلا أخطاء console.

- [ ] **Step 3: تأكيد الحالة على الإنتاج (بعد النشر)**

Run: `curl -s -o /dev/null -w "%{http_code}" "https://firestore.googleapis.com/v1/projects/family-tree-app-d9238/databases/(default)/documents/trees?pageSize=1"`
Expected: `403`.

- [ ] **Step 4: دفع الفرع وفتح PR**

```bash
git push -u origin phase-0-security
gh pr create --repo anubisland/fammily-tree-app --base main --title "Phase 0: close tenant-isolation break + secure invite join" --body "ينفّذ خطة docs/superpowers/plans/2026-09-10-phase-0-security.md. يغلق النتائج 3.0/3.1/3.3، ويضيف مجموعة اختبارات انحدار للقواعد، ويستبدل الانضمام الحر بدعوات آمنة."
```

- [ ] **Step 5: إعلان الانتهاء**

بعد اجتماع: مجموعة القواعد خضراء، المراجعة المستقلة مُفرزة ومصلَحة، النشر مؤكَّد، والتحقق من الإنتاج 403 — أعلن المرحلة ٠ منتهية.

---

## المراجعة الذاتية للخطة

**تغطية المواصفة:** النتيجة 3.0 → Task 2 + مجموعة Task 1. النتيجة 3.1 → Task 7. النتيجة 3.3 → Task 5 (معرِّف تلقائي). `firestore.rules` في المستودع (3.2) → Task 1/4. الدعوة برابط (قرار المستخدم) → Task 6. المراجعة المستقلة (قاعدة ٢) → Task 3. ✅ لا فجوات ضمن نطاق المرحلة ٠.

**فحص العناصر النائبة:** لا `TODO`/`TBD`؛ كل خطوة كود تعرض الكود الفعلي. الاستثناء المقصود: Task 6/Step 4 يطلب مطابقة اسم دالة تبديل الوضع الحقيقي — لأن الاسم يُقرأ من الملف وقت التنفيذ، وهو موثَّق صراحةً بمرجع السطر.

**اتساق الأنواع:** `viaInvite` (حقل نص = التوكن) يُكتب في Task 6 ويُقرأ في قاعدة Task 2 بنفس الاسم. `createdBy` يُكتب في Task 5 ويُقرأ في `treeCreatedBy` بـ Task 2. `role` ∈ {owner,editor,viewer} متسق عبر القواعد والعميل. ✅
