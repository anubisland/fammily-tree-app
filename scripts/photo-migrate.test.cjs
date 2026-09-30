require('../app.js');   // exposes ftPhotosNeedingMigration on the global (node guard)
const need = global.ftPhotosNeedingMigration;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(typeof need === 'function', 'ftPhotosNeedingMigration exposed');

const people = {
  a: { photo: 'data:image/jpeg;base64,AAA' },                          // base64, no path -> NEEDS
  b: { photo: 'data:image/jpeg;base64,AAA', photoPath: 'trees/t/p.jpg' }, // already has path -> no
  c: { photoPath: 'trees/t/c.jpg' },                                   // path only -> no
  d: { },                                                              // nothing -> no
  e: { photo: 'data:image/jpeg;base64,BBB' },                          // base64, no path -> NEEDS
};
const r = need(people);
ok(r.length === 2, 'two need migration, got '+r.length);
ok(r.indexOf('a') !== -1 && r.indexOf('e') !== -1, 'exactly a and e');
ok(r.indexOf('b') === -1 && r.indexOf('c') === -1 && r.indexOf('d') === -1, 'migrated/path-only/none excluded');

ok(need({}).length === 0, 'empty -> none');
ok(need().length === 0, 'no-arg -> no throw');
ok(need({ x:{ photo:'' } }).length === 0, 'blank base64 not counted');
ok(need({ y:{ photo:'data:x', photoPath:'' } }).length === 1, 'empty photoPath still needs migration');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
