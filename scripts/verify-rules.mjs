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
