/**
 * Security-rules regression suite — runs against the Firestore emulator and
 * asserts the specific attacks the Phase 0 rework was written to stop. Each
 * check is named after the finding it covers, so a future edit that reopens
 * one fails loudly here. Standalone (not Jest): needs the real SDK + emulator.
 *   Usage: npm run test:rules
 *
 * Each check runs against a freshly-reseeded emulator (see `check()` below)
 * so no check can leave state behind that changes the outcome of a later
 * one — e.g. a self-grant check must not leave the outsider as a member for
 * a later check to (incorrectly) benefit from.
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
const EDITOR = 'uid-editor';
const VIEWER = 'uid-viewer';
const THROWAWAY = 'uid-throwaway';
const LINKED = 'uid-linked';            // a cross-tree viewer (granted read of TREE, not a member)
const TREE = 'tree-1';
const TREE_LEGACY = 'tree-legacy';
const INVITE_EDITOR = 'invite-editor-token';
const INVITE_VIEWER = 'invite-viewer-token';

let passed = 0, failed = 0;

// ── Seed: one tree owned by OWNER, plus one editor invite ───────────────
// Reusable so every check can start from the same known-good baseline
// instead of inheriting whatever a previous check mutated.
async function seed(ctx) {
  const db = ctx.firestore();
  await setDoc(doc(db, 'trees', TREE), {
    familyName: { ar: 'الوزير', en: 'Alwazir' }, createdBy: OWNER,
    rootId: null, people: {}, lang: 'ar',
  });
  await setDoc(doc(db, 'trees', TREE, 'members', OWNER), { role: 'owner', email: 'o@x.com' });
  // An editor and a viewer member, so role-specific clauses (canEdit != 'viewer',
  // members update: isOwner, createdBy immutability) can be exercised directly.
  await setDoc(doc(db, 'trees', TREE, 'members', EDITOR), { role: 'editor', email: 'e@x.com' });
  await setDoc(doc(db, 'trees', TREE, 'members', VIEWER), { role: 'viewer', email: 'v@x.com' });
  await setDoc(doc(db, 'trees', TREE, 'invites', INVITE_EDITOR), { role: 'editor', createdBy: OWNER });
  await setDoc(doc(db, 'trees', TREE, 'invites', INVITE_VIEWER), { role: 'viewer', createdBy: OWNER });
  await setDoc(doc(db, 'users', OWNER), { email: 'o@x.com', treeId: TREE });
  await setDoc(doc(db, 'users', OUTSIDER), { email: 'out@x.com', treeId: '' });
  await setDoc(doc(db, 'trees', TREE, 'moments', 'm1'), { byUid: OWNER, text: 'hi' });
  // A reaction + a comment on m1 by OWNER, so delete/ownership clauses can be
  // exercised directly against pre-existing docs.
  await setDoc(doc(db, 'trees', TREE, 'moments', 'm1', 'reactions', OWNER), { byUid: OWNER, emoji: '❤️' });
  await setDoc(doc(db, 'trees', TREE, 'moments', 'm1', 'comments', 'c1'), { byUid: OWNER, byEmail: 'o@x.com', text: 'nice' });
  await setDoc(doc(db, 'trees', TREE, 'activity', 'a1'), { byUid: OWNER, kind: 'created' });
  // A photo doc (base64 in `data`) for the photos-subcollection checks.
  await setDoc(doc(db, 'trees', TREE, 'photos', 'p_x'), { data: 'data:image/jpeg;base64,AAA' });
  // A pending link request (minted by the owner) for the link-protocol checks.
  await setDoc(doc(db, 'trees', TREE, 'linkRequests', 'req1'),
    { localPersonId: 'pX', localPersonName: { ar: 'ف', en: 'F' }, localFamilyName: { ar: 'الوزير', en: 'W' },
      requestedBy: OWNER, kind: 'same_person' });
  // A pre-existing accepted link so read/update/delete checks hit a real doc.
  await setDoc(doc(db, 'trees', TREE, 'links', 'L_own'),
    { localPersonId: 'pX', remoteTreeId: 'tB', remotePersonId: 'pY', kind: 'same_person',
      status: 'accepted', grantedScope: 'view_tree', requestedBy: OWNER, approvedBy: OWNER,
      remoteFamilyName: { ar: '', en: '' } });
  // A cross-tree viewer grant for LINKED (a non-member of TREE who owns another tree).
  // Deliberately NOT OUTSIDER, so the existing "outsider cannot read" checks stay valid.
  await setDoc(doc(db, 'trees', TREE, 'viewers', LINKED),
    { grantedBy: LINKED, viaRequest: 'req1', remoteTreeId: 'tB' });

  // A legacy tree from the pre-createdBy era: no `createdBy` field at all.
  // Reuses OWNER/EDITOR as its members so the existing authenticated
  // contexts can exercise it directly (see C-legacy checks below).
  await setDoc(doc(db, 'trees', TREE_LEGACY), {
    familyName: { ar: 'قديمة', en: 'Legacy' }, rootId: null, people: {}, lang: 'ar',
  });
  await setDoc(doc(db, 'trees', TREE_LEGACY, 'members', OWNER), { role: 'owner', email: 'o@x.com' });
  await setDoc(doc(db, 'trees', TREE_LEGACY, 'members', EDITOR), { role: 'editor', email: 'e@x.com' });
}

const testEnv = await initializeTestEnvironment({
  projectId: 'family-tree-rules-test',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1', port: 8080,
  },
});

// Auth contexts are independent of Firestore data, so they stay valid across
// the per-check clearFirestore() below — no need to recreate them.
const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
const outsiderDb = testEnv.authenticatedContext(OUTSIDER).firestore();
const joinerDb = testEnv.authenticatedContext(JOINER).firestore();
const editorDb = testEnv.authenticatedContext(EDITOR).firestore();
const viewerDb = testEnv.authenticatedContext(VIEWER).firestore();
const throwawayDb = testEnv.authenticatedContext(THROWAWAY).firestore();
const linkedDb = testEnv.authenticatedContext(LINKED).firestore();

// Reset to the known-good baseline before every single check, so one
// check's side effects (e.g. a successful self-grant) can never leak into
// and skew the result of another.
const check = async (name, fn) => {
  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(seed);
  } catch (err) {
    // A reset/reseed failure is a harness problem, not a security regression.
    // Fail loudly and distinctly instead of letting it masquerade as (and
    // bury the real cause among) ordinary check failures below.
    console.error(`\nFATAL: could not reset/seed emulator before "${name}"\n  ${err}`);
    process.exit(2);
  }
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failed++; console.error(`  FAIL ${name}\n       ${String(err.message).split('\n')[0]}`); }
};

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
  assertFails(updateDoc(doc(outsiderDb, 'trees', TREE), { rootId: 'x' })));

await check('3.0b outsider cannot delete the real owner', () =>
  assertFails(deleteDoc(doc(outsiderDb, 'trees', TREE, 'members', OWNER))));

// Multi-step takeover chains: the true exploit path is self-grant-then-act.
// `assertFails` resolves on the FIRST permission-denied rejection of the
// promise it's given, so wrapping both steps in one assertFails(...) is an
// OR, not an AND — it would go (and stay) green the moment step 1 alone is
// blocked, without ever exercising step 2. Assert each step independently
// instead, awaiting both, so `check()` only reports "ok" when BOTH the
// self-grant AND the follow-on mutation are rejected.
await check('outsider cannot take over then edit the tree', async () => {
  await assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'members', OUTSIDER), { role: 'owner' }));
  await assertFails(updateDoc(doc(outsiderDb, 'trees', TREE), { rootId: 'x' }));
});

await check('outsider cannot take over then delete the real owner', async () => {
  await assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'members', OUTSIDER), { role: 'owner' }));
  await assertFails(deleteDoc(doc(outsiderDb, 'trees', TREE, 'members', OWNER)));
});

await check('3.0 outsider cannot read family moments', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'moments', 'm1'))));

await check('outsider cannot enumerate invites to steal one', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'invites'))));

// This tests ONLY the invite path's `role != 'owner'` clause: an editor invite
// cannot be used to self-grant owner. Role-vs-invite binding and invite-existence
// are covered by the dedicated invite role-binding checks below (finding 1).
await check('join via invite cannot claim owner role (role != owner clause)', () =>
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

// NOTE: baseline firestore.rules has no rules block for /trees/{t}/invites at
// all, so "owner can create an editor invite" (next check) is expected to be
// RED until the secure-rules task adds invite handling — that is correct,
// not a bug in the suite. "joiner ... can join as editor" (after it) is
// unaffected and stays GREEN on baseline: it writes to
// /trees/{treeId}/members/{JOINER}, which the existing member `create` rule
// already allows for any self-write regardless of invite validity.
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

// ── C1 regression: createdBy is immutable (tree update guard) ────────────
// An editor rewriting trees/{tree}.createdBy is the root of the editor→owner
// takeover. Guards: allow update ... && request.resource.data.createdBy ==
// resource.data.createdBy.
await check('C1: editor cannot rewrite tree.createdBy', () =>
  assertFails(updateDoc(doc(editorDb, 'trees', TREE), { createdBy: EDITOR })));

// Full chain: the createdBy rewrite is denied, so createdBy stays OWNER and a
// throwaway account still cannot satisfy the bootstrap owner path.
await check('C1 chain: denied createdBy rewrite blocks throwaway owner bootstrap', async () => {
  await assertFails(updateDoc(doc(editorDb, 'trees', TREE), { createdBy: THROWAWAY }));
  await assertFails(setDoc(doc(throwawayDb, 'trees', TREE, 'members', THROWAWAY),
    { role: 'owner', createdBy: THROWAWAY }));
});

// ── Legacy tree (no createdBy field): absence-safe guard ─────────────────
// The production tree created by the old flow has no `createdBy` at all.
// request.resource.data.get('createdBy', '') / resource.data.get('createdBy', '')
// must treat both sides as '' rather than erroring the whole condition to deny.
await check('legacy tree (no createdBy): owner can still edit', () =>
  assertSucceeds(updateDoc(doc(ownerDb, 'trees', TREE_LEGACY), { rootId: 'x' })));

await check('legacy tree: editor cannot add createdBy (C1 stays closed)', () =>
  assertFails(updateDoc(doc(editorDb, 'trees', TREE_LEGACY), { createdBy: EDITOR })));

// ── Invite role-binding (finding 1) ─────────────────────────────────────
// (a) presenting a viewer invite but claiming editor: guards the invite path's
//     `invite.role == request.resource.data.role` clause.
await check('invite role-binding: viewer invite cannot be claimed as editor', () =>
  assertFails(setDoc(doc(joinerDb, 'trees', TREE, 'members', JOINER),
    { role: 'editor', viaInvite: INVITE_VIEWER })));

// (b) claiming editor with a token that does not exist: guards the invite path's
//     `exists(inviteDoc(...))` clause.
await check('invite role-binding: non-existent invite token is rejected', () =>
  assertFails(setDoc(doc(joinerDb, 'trees', TREE, 'members', JOINER),
    { role: 'editor', viaInvite: 'bogus' })));

// ── Owner-adds-member directly (members create path 3) ──────────────────
// Guards the `isOwner(treeId) && request.resource.data.role in ['editor',
// 'viewer']` clause: the owner's direct-add path must accept editor/viewer
// and must still reject a second owner (one-owner-per-tree invariant).
const ADDED = 'uid-added';
const ADDED2 = 'uid-added-2';

await check('owner can directly add an editor member (path 3)', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'members', ADDED),
    { role: 'editor', email: 'added@x.com' })));

await check('owner cannot add a second owner (path 3 role constraint)', () =>
  assertFails(setDoc(doc(ownerDb, 'trees', TREE, 'members', ADDED2),
    { role: 'owner', email: 'boss2@x.com' })));

// ── Viewer role (finding 2): guards canEdit's `!= 'viewer'` ──────────────
await check('viewer can read the tree', () =>
  assertSucceeds(getDoc(doc(viewerDb, 'trees', TREE))));

await check('viewer can read moments', () =>
  assertSucceeds(getDoc(doc(viewerDb, 'trees', TREE, 'moments', 'm1'))));

await check('viewer cannot edit the tree', () =>
  assertFails(updateDoc(doc(viewerDb, 'trees', TREE), { rootId: 'v' })));

await check('viewer cannot create an invite', () =>
  assertFails(setDoc(doc(viewerDb, 'trees', TREE, 'invites', 'vinv'), { role: 'viewer', createdBy: VIEWER })));

// NOTE: the finding-2 brief also listed "viewer cannot create a moment", but the
// approved spec gates moments `create` on isMember (a shared family feed any
// member contributes to), NOT canEdit — identical to `activity`. A viewer CAN
// post a moment by design, so no assertFails is placed here; that clause is not
// part of canEdit's `!= 'viewer'` guard. canEdit's viewer-exclusion is covered
// by the "viewer cannot edit the tree" and "viewer cannot create an invite"
// checks above (both go through canEdit). Reported to the controller.

// ── Member self-escalation via update (finding 3): guards members update: isOwner
await check('editor member cannot self-escalate role to owner via update', () =>
  assertFails(updateDoc(doc(editorDb, 'trees', TREE, 'members', EDITOR), { role: 'owner' })));

// ── Activity subcollection (finding 4) ──────────────────────────────────
await check('outsider cannot read activity', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'activity', 'a1'))));

await check('outsider cannot create activity', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'activity', 'a2'), { byUid: OUTSIDER, kind: 'x' })));

await check('member can read activity', () =>
  assertSucceeds(getDoc(doc(editorDb, 'trees', TREE, 'activity', 'a1'))));

await check('member can create activity', () =>
  assertSucceeds(setDoc(doc(editorDb, 'trees', TREE, 'activity', 'a3'), { byUid: EDITOR, kind: 'edit' })));

await check('activity log cannot be updated', () =>
  assertFails(updateDoc(doc(editorDb, 'trees', TREE, 'activity', 'a1'), { kind: 'tampered' })));

await check('activity log cannot be deleted', () =>
  assertFails(deleteDoc(doc(editorDb, 'trees', TREE, 'activity', 'a1'))));

// ── Member-roster read (finding 5): outsider cannot harvest member emails ─
await check('outsider cannot read the member roster', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'members'))));

// ── Moments integrity (finding 6): byUid must equal the author ───────────
await check('member can create a moment with their own byUid', () =>
  assertSucceeds(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm2'), { byUid: EDITOR, text: 'mine' })));

await check('member cannot create a moment with a foreign byUid', () =>
  assertFails(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm3'), { byUid: OWNER, text: 'forged' })));

// ── Moment reactions (one-doc-per-member, keyed by reactor uid) ──────────
await check('member can read reactions', () =>
  assertSucceeds(getDocs(collection(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions'))));

await check('member can add their OWN reaction (uid-keyed)', () =>
  assertSucceeds(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions', EDITOR),
    { byUid: EDITOR, emoji: '👍' })));

await check('member cannot write a reaction under someone else\'s uid', () =>
  assertFails(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions', OWNER),
    { byUid: EDITOR, emoji: '👍' })));

await check('member cannot forge a reaction with a foreign byUid', () =>
  assertFails(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions', EDITOR),
    { byUid: OWNER, emoji: '👍' })));

await check('outsider cannot react', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'moments', 'm1', 'reactions', OUTSIDER),
    { byUid: OUTSIDER, emoji: '👍' })));

await check('outsider cannot read reactions', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'moments', 'm1', 'reactions'))));

await check('member can remove their OWN reaction', () =>
  assertSucceeds((async () => {
    await setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions', EDITOR), { byUid: EDITOR, emoji: '👍' });
    await deleteDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions', EDITOR));
  })()));

await check('member cannot delete another member\'s reaction', () =>
  assertFails(deleteDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'reactions', OWNER))));

// ── Moment comments (member-authored, author/owner-deletable, immutable) ──
await check('member can read comments', () =>
  assertSucceeds(getDocs(collection(editorDb, 'trees', TREE, 'moments', 'm1', 'comments'))));

await check('member can add a comment with their own byUid', () =>
  assertSucceeds(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c2'),
    { byUid: EDITOR, byEmail: 'e@x.com', text: 'agreed' })));

await check('member cannot add a comment with a foreign byUid', () =>
  assertFails(setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c3'),
    { byUid: OWNER, byEmail: 'o@x.com', text: 'forged' })));

await check('outsider cannot read comments', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'moments', 'm1', 'comments'))));

await check('outsider cannot create a comment', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c4'),
    { byUid: OUTSIDER, text: 'spam' })));

await check('a comment cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c1'), { text: 'tampered' })));

await check('comment author can delete their own comment', () =>
  assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c1'))));

await check('owner can delete another member\'s comment (moderation)', () =>
  assertSucceeds((async () => {
    await setDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c5'),
      { byUid: EDITOR, byEmail: 'e@x.com', text: 'mine' });
    await deleteDoc(doc(ownerDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c5'));
  })()));

await check('non-author non-owner member cannot delete a comment', () =>
  assertFails(deleteDoc(doc(editorDb, 'trees', TREE, 'moments', 'm1', 'comments', 'c1'))));

// Reactions/comments gate on isMember (a shared family feed), NOT canEdit — so
// a viewer CAN react and comment, mirroring moments `create`. These lock that
// intent so a future isMember→canEdit slip fails loudly here.
await check('viewer can react (shared feed, isMember not canEdit)', () =>
  assertSucceeds(setDoc(doc(viewerDb, 'trees', TREE, 'moments', 'm1', 'reactions', VIEWER),
    { byUid: VIEWER, emoji: '👍' })));

await check('viewer can comment (shared feed, isMember not canEdit)', () =>
  assertSucceeds(setDoc(doc(viewerDb, 'trees', TREE, 'moments', 'm1', 'comments', 'cv'),
    { byUid: VIEWER, byEmail: 'v@x.com', text: 'مبارك' })));

// ── Photos subcollection (base64 docs kept out of the tree doc) ──────────
await check('member can read a photo doc', () =>
  assertSucceeds(getDoc(doc(viewerDb, 'trees', TREE, 'photos', 'p_x'))));

await check('outsider cannot read a photo doc', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'photos', 'p_x'))));

await check('editor can create a photo doc', () =>
  assertSucceeds(setDoc(doc(editorDb, 'trees', TREE, 'photos', 'p_e'), { data: 'data:image/jpeg;base64,BBB' })));

await check('editor can overwrite (replace) a photo doc', () =>
  assertSucceeds(setDoc(doc(editorDb, 'trees', TREE, 'photos', 'p_x'), { data: 'data:image/jpeg;base64,CCC' })));

await check('viewer cannot write a photo doc', () =>
  assertFails(setDoc(doc(viewerDb, 'trees', TREE, 'photos', 'p_v'), { data: 'data:image/jpeg;base64,DDD' })));

await check('outsider cannot write a photo doc', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'photos', 'p_o'), { data: 'x' })));

await check('editor can delete a photo doc', () =>
  assertSucceeds(deleteDoc(doc(editorDb, 'trees', TREE, 'photos', 'p_x'))));

await check('viewer cannot delete a photo doc', () =>
  assertFails(deleteDoc(doc(viewerDb, 'trees', TREE, 'photos', 'p_e'))));

// Signed-out and cross-tenant (a non-member is, by definition, a member of some
// OTHER tree): both must be denied — closes the regression from the removed
// storage suite. `outsiderDb` above already covers the authenticated non-member
// (cross-tenant) case for read+write; these add the unauthenticated case.
const anonDb = testEnv.unauthenticatedContext().firestore();
await check('signed-out user cannot read a photo doc', () =>
  assertFails(getDoc(doc(anonDb, 'trees', TREE, 'photos', 'p_x'))));

await check('signed-out user cannot write a photo doc', () =>
  assertFails(setDoc(doc(anonDb, 'trees', TREE, 'photos', 'p_anon'), { data: 'x' })));

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

// ── Link protocol: linkRequests (project 2) ──────────────────────────────
// OUTSIDER stands in for another tree's owner: a non-member of TREE, so the
// external-approver path must rest on a matching pending request, never on
// membership of TREE.
await check('owner can create a link request', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req2'),
    { kind: 'same_person', localPersonId: 'pA', requestedBy: OWNER })));

await check('editor cannot create a link request (owner only)', () =>
  assertFails(setDoc(doc(editorDb, 'trees', TREE, 'linkRequests', 'req3'),
    { kind: 'same_person', localPersonId: 'pA', requestedBy: EDITOR })));

await check('link request must carry kind same_person', () =>
  assertFails(setDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req4'),
    { kind: 'marriage', localPersonId: 'pA', requestedBy: OWNER })));

await check('any signed-in user can read a link request by token', () =>
  assertSucceeds(getDoc(doc(outsiderDb, 'trees', TREE, 'linkRequests', 'req1'))));

await check('outsider cannot enumerate link requests', () =>
  assertFails(getDocs(collection(outsiderDb, 'trees', TREE, 'linkRequests'))));

await check('a link request cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req1'), { localPersonId: 'z' })));

await check('owner can delete (cancel) their link request', () =>
  assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'linkRequests', 'req1'))));

// ── Link protocol: links (mirrored, owner-or-pending-request) ────────────
const LINK = { kind: 'same_person', status: 'accepted', grantedScope: 'view_tree',
  requestedBy: OWNER, approvedBy: OWNER, remoteTreeId: 'tB', remotePersonId: 'pY',
  remoteFamilyName: { ar: '', en: '' } };

await check('owner can create their own link copy', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'links', 'L_ownnew'),
    Object.assign({ localPersonId: 'pX' }, LINK))));

await check('remote approver can create A-side link via a matching pending request', () =>
  assertSucceeds(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_via'),
    Object.assign({ localPersonId: 'pX', viaRequest: 'req1' }, LINK))));

await check('link create FAILS with a non-existent request', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_bad'),
    Object.assign({ localPersonId: 'pX', viaRequest: 'nope' }, LINK))));

await check('link create FAILS when localPersonId does not match the request', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_mismatch'),
    Object.assign({ localPersonId: 'WRONG', viaRequest: 'req1' }, LINK))));

await check('link create FAILS with a forged grantedScope', () =>
  assertFails(setDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_scope'),
    Object.assign({ localPersonId: 'pX', viaRequest: 'req1', grantedScope: 'edit' },
      { kind: 'same_person', status: 'accepted', requestedBy: OWNER, approvedBy: OWNER,
        remoteTreeId: 'tB', remotePersonId: 'pY' }))));

await check('member can read links', () =>
  assertSucceeds(getDoc(doc(viewerDb, 'trees', TREE, 'links', 'L_own'))));

await check('outsider cannot read links', () =>
  assertFails(getDoc(doc(outsiderDb, 'trees', TREE, 'links', 'L_own'))));

await check('a link cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'links', 'L_own'), { remoteTreeId: 'evil' })));

await check('owner can revoke (delete) a link; editor cannot', async () => {
  await assertFails(deleteDoc(doc(editorDb, 'trees', TREE, 'links', 'L_own')));
  await assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'links', 'L_own')));
});

// ── Cross-tree viewer grant (project 3a) ─────────────────────────────────
await check('a granted viewer can READ the whole tree doc', () =>
  assertSucceeds(getDoc(doc(linkedDb, 'trees', TREE))));
await check('a granted viewer can READ a photo doc', () =>
  assertSucceeds(getDoc(doc(linkedDb, 'trees', TREE, 'photos', 'p_x'))));
await check('a non-granted outsider still cannot read the tree', () =>
  assertFails(getDoc(doc(throwawayDb, 'trees', TREE))));
await check('a viewer CANNOT read the private moments feed', () =>
  assertFails(getDoc(doc(linkedDb, 'trees', TREE, 'moments', 'm1'))));
await check('a viewer CANNOT read the member roster', () =>
  assertFails(getDocs(collection(linkedDb, 'trees', TREE, 'members'))));
await check('a viewer CANNOT read the activity log', () =>
  assertFails(getDoc(doc(linkedDb, 'trees', TREE, 'activity', 'a1'))));
await check('a viewer CANNOT read moment reactions', () =>
  assertFails(getDocs(collection(linkedDb, 'trees', TREE, 'moments', 'm1', 'reactions'))));
await check('a viewer CANNOT read moment comments', () =>
  assertFails(getDocs(collection(linkedDb, 'trees', TREE, 'moments', 'm1', 'comments'))));
await check('a viewer CANNOT write the tree', () =>
  assertFails(updateDoc(doc(linkedDb, 'trees', TREE), { rootId: 'x' })));
await check('a viewer CANNOT write a photo', () =>
  assertFails(setDoc(doc(linkedDb, 'trees', TREE, 'photos', 'p_hack'), { data: 'x' })));
await check('owner can create a viewer grant directly', () =>
  assertSucceeds(setDoc(doc(ownerDb, 'trees', TREE, 'viewers', 'uid-added'), { grantedBy: OWNER, remoteTreeId: 'tB' })));
await check('self-grant via a matching pending request succeeds', () =>
  assertSucceeds(setDoc(doc(throwawayDb, 'trees', TREE, 'viewers', THROWAWAY), { grantedBy: THROWAWAY, viaRequest: 'req1', remoteTreeId: 'tB' })));
await check('self-grant with NO pending request fails', () =>
  assertFails(setDoc(doc(throwawayDb, 'trees', TREE, 'viewers', THROWAWAY), { grantedBy: THROWAWAY, viaRequest: 'nope', remoteTreeId: 'tB' })));
await check('cannot grant a viewer doc under ANOTHER uid via request', () =>
  assertFails(setDoc(doc(throwawayDb, 'trees', TREE, 'viewers', OUTSIDER), { grantedBy: THROWAWAY, viaRequest: 'req1', remoteTreeId: 'tB' })));
await check('a viewer grant cannot be edited', () =>
  assertFails(updateDoc(doc(ownerDb, 'trees', TREE, 'viewers', LINKED), { remoteTreeId: 'evil' })));
await check('viewer can revoke their OWN grant', () =>
  assertSucceeds(deleteDoc(doc(linkedDb, 'trees', TREE, 'viewers', LINKED))));
await check('owner can revoke any viewer grant', () =>
  assertSucceeds(deleteDoc(doc(ownerDb, 'trees', TREE, 'viewers', LINKED))));
await check('a third party cannot revoke someone else\'s viewer grant', () =>
  assertFails(deleteDoc(doc(throwawayDb, 'trees', TREE, 'viewers', LINKED))));
await check('outsider cannot list viewers', () =>
  assertFails(getDocs(collection(throwawayDb, 'trees', TREE, 'viewers'))));

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
