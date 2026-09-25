require('../duplicates.js');   // IIFE exposes ftDuplicates on the global (repo convention)
const ftDuplicates = global.ftDuplicates;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(!!ftDuplicates, 'engine exposed');

// Normalisation
ok(ftDuplicates.norm('مُحَمَّد') === ftDuplicates.norm('محمد'), 'tashkeel ignored');
ok(ftDuplicates.norm('أحمد') === ftDuplicates.norm('احمد'), 'alef hamza unified');
ok(ftDuplicates.norm('سميه') === ftDuplicates.norm('سمية'), 'taa marbuta unified');

// Same person entered twice: identical name + same father → one cluster.
const dupTwice = {
  f:  { name:{ar:'أحمد', en:'Ahmad'}, parentId:null },
  m1: { name:{ar:'محمد', en:'M'}, parentId:'f' },
  m2: { name:{ar:'مُحمّد', en:'M2'}, parentId:'f' },   // same name (tashkeel), same father
};
let r = ftDuplicates(dupTwice);
ok(r.length === 1, 'one cluster found, got '+r.length);
ok(r[0].ids.length === 2 && r[0].ids.indexOf('m1')>=0 && r[0].ids.indexOf('m2')>=0, 'cluster = [m1,m2]');

// Cousins sharing a first name but DIFFERENT fathers → NOT flagged.
const cousins = {
  a: { name:{ar:'خالد'}, parentId:null },
  b: { name:{ar:'سعيد'}, parentId:null },
  ca:{ name:{ar:'محمد'}, parentId:'a' },   // محمد بن خالد
  cb:{ name:{ar:'محمد'}, parentId:'b' },   // محمد بن سعيد
};
ok(ftDuplicates(cousins).length === 0, 'cousins with same first name are NOT duplicates');

// Two ROOT people with the same name → flagged (no parent to disambiguate).
const roots = { r1:{ name:{ar:'سليمان'}, parentId:null }, r2:{ name:{ar:'سليمان'}, parentId:null } };
ok(ftDuplicates(roots).length === 1, 'same-name roots flagged');

// Nameless records are skipped, no throw.
ok(ftDuplicates({ x:{ name:{ar:''}, parentId:null }, y:{ name:{ar:''}, parentId:null } }).length === 0, 'blank names skipped');
ok(ftDuplicates({}).length === 0, 'empty -> no clusters');
ok(ftDuplicates().length === 0, 'no-arg -> no throw');

// Cycle guard: a self-parent must not loop forever.
ok(ftDuplicates({ z:{ name:{ar:'دائري'}, parentId:'z' } }).length === 0, 'self-parent cycle safe');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
