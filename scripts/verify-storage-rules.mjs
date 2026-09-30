/**
 * Storage security-rules regression suite — runs against the Firestore + Storage
 * emulators and asserts photos are readable only by tree members and writable
 * only by non-viewer members, with size/content-type limits and tenant isolation.
 *   Usage: npm run test:storage
 *
 * Membership authority lives in Firestore (trees/{treeId}/members/{uid}); the
 * Storage rules read it via firestore.get/exists. Seeded once with rules
 * disabled; upload checks use distinct paths so they don't interfere.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const TREE = 't1', OTHER = 't2';
const IMG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);           // tiny "jpeg"
const BIG = new Uint8Array(2 * 1024 * 1024 + 16);               // > 2MB
const JPEG = { contentType: 'image/jpeg' };
const TEXT = { contentType: 'text/plain' };

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failed++; console.error(`  FAIL ${name}\n       ${String(err.message).split('\n')[0]}`); }
};

const testEnv = await initializeTestEnvironment({
  projectId: 'family-tree-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  storage:   { rules: readFileSync('storage.rules', 'utf8'),   host: '127.0.0.1', port: 9199 },
});

// Seed membership (authority) and any files the read/delete checks need.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'trees', TREE, 'members', 'uid-owner'),  { role: 'owner',  email: 'o@x.com' });
  await setDoc(doc(db, 'trees', TREE, 'members', 'uid-editor'), { role: 'editor', email: 'e@x.com' });
  await setDoc(doc(db, 'trees', TREE, 'members', 'uid-viewer'), { role: 'viewer', email: 'v@x.com' });
  const st = ctx.storage();
  await uploadBytes(ref(st, `trees/${TREE}/people/p1.jpg`),  IMG, JPEG);   // for read checks
  await uploadBytes(ref(st, `trees/${TREE}/people/del.jpg`), IMG, JPEG);   // for editor-delete
  await uploadBytes(ref(st, `trees/${TREE}/people/delv.jpg`), IMG, JPEG);  // for viewer-delete-denied
});

const editor = testEnv.authenticatedContext('uid-editor').storage();
const viewer = testEnv.authenticatedContext('uid-viewer').storage();
const outsider = testEnv.authenticatedContext('uid-outsider').storage();

console.log('\nstorage.rules');

// ── READ ────────────────────────────────────────────────────────────────
await check('member (viewer) can read a tree photo', () =>
  assertSucceeds(getBytes(ref(viewer, `trees/${TREE}/people/p1.jpg`))));

await check('outsider cannot read a tree photo', () =>
  assertFails(getBytes(ref(outsider, `trees/${TREE}/people/p1.jpg`))));

// ── WRITE (upload) ──────────────────────────────────────────────────────
await check('editor can upload a small image', () =>
  assertSucceeds(uploadBytes(ref(editor, `trees/${TREE}/people/e1.jpg`), IMG, JPEG)));

await check('viewer cannot upload', () =>
  assertFails(uploadBytes(ref(viewer, `trees/${TREE}/people/v1.jpg`), IMG, JPEG)));

await check('outsider cannot upload', () =>
  assertFails(uploadBytes(ref(outsider, `trees/${TREE}/people/o1.jpg`), IMG, JPEG)));

await check('editor cannot upload a non-image (text/plain)', () =>
  assertFails(uploadBytes(ref(editor, `trees/${TREE}/people/e2.jpg`), IMG, TEXT)));

await check('editor cannot upload an image over 2MB', () =>
  assertFails(uploadBytes(ref(editor, `trees/${TREE}/people/e3.jpg`), BIG, JPEG)));

// ── DELETE ──────────────────────────────────────────────────────────────
await check('editor can delete a tree photo', () =>
  assertSucceeds(deleteObject(ref(editor, `trees/${TREE}/people/del.jpg`))));

await check('viewer cannot delete a tree photo', () =>
  assertFails(deleteObject(ref(viewer, `trees/${TREE}/people/delv.jpg`))));

// ── TENANT ISOLATION ────────────────────────────────────────────────────
await check('editor of t1 cannot upload into another tree (t2)', () =>
  assertFails(uploadBytes(ref(editor, `trees/${OTHER}/people/x.jpg`), IMG, JPEG)));

await check('editor of t1 cannot read another tree (t2)', () =>
  assertFails(getBytes(ref(editor, `trees/${OTHER}/people/p1.jpg`))));

// ── CONTENT TYPE: raster only, no svg ───────────────────────────────────
await check('editor can upload a PNG', () =>
  assertSucceeds(uploadBytes(ref(editor, `trees/${TREE}/people/png.jpg`), IMG, { contentType: 'image/png' })));

await check('editor cannot upload an SVG (script-carrying)', () =>
  assertFails(uploadBytes(ref(editor, `trees/${TREE}/people/svg.jpg`), IMG, { contentType: 'image/svg+xml' })));

// ── {sub} is constrained to people|moments ──────────────────────────────
await check('editor cannot write outside people/moments (e.g. sub=other)', () =>
  assertFails(uploadBytes(ref(editor, `trees/${TREE}/other/x.jpg`), IMG, JPEG)));

await check('editor can write into moments/', () =>
  assertSucceeds(uploadBytes(ref(editor, `trees/${TREE}/moments/m1.jpg`), IMG, JPEG)));

// ── OVERWRITE (update) is gated like create ─────────────────────────────
await check('editor can overwrite an existing photo', () =>
  assertSucceeds(uploadBytes(ref(editor, `trees/${TREE}/people/p1.jpg`), IMG, JPEG)));

await check('viewer cannot overwrite an existing photo', () =>
  assertFails(uploadBytes(ref(viewer, `trees/${TREE}/people/p1.jpg`), IMG, JPEG)));

// ── UNAUTHENTICATED ─────────────────────────────────────────────────────
const anon = testEnv.unauthenticatedContext().storage();
await check('signed-out user cannot read', () =>
  assertFails(getBytes(ref(anon, `trees/${TREE}/people/p1.jpg`))));

await check('signed-out user cannot upload', () =>
  assertFails(uploadBytes(ref(anon, `trees/${TREE}/people/anon.jpg`), IMG, JPEG)));

// ── DEFAULT-DENY: nested / no-fileName paths ────────────────────────────
await check('editor cannot write a deeper nested path', () =>
  assertFails(uploadBytes(ref(editor, `trees/${TREE}/people/sub/deep.jpg`), IMG, JPEG)));

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
