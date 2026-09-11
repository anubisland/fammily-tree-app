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
const TREE = 'tree-1';
const INVITE_EDITOR = 'invite-editor-token';

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
  await setDoc(doc(db, 'trees', TREE, 'invites', INVITE_EDITOR), { role: 'editor', createdBy: OWNER });
  await setDoc(doc(db, 'users', OWNER), { email: 'o@x.com', treeId: TREE });
  await setDoc(doc(db, 'users', OUTSIDER), { email: 'out@x.com', treeId: '' });
  await setDoc(doc(db, 'trees', TREE, 'moments', 'm1'), { byUid: OWNER, text: 'hi' });
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

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
