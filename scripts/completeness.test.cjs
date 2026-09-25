require('../completeness.js');       // IIFE exposes ftCompleteness on the global (repo convention)
const ftCompleteness = global.ftCompleteness;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

const people = {
  a: { name:{ar:'أ', en:'A'}, birthDate:'1950-01-01', photo:'data:x' }, // all 3 present
  b: { name:{ar:'ب', en:''},  birthDate:'',           photo:'' },       // all 3 missing
  c: { name:{ar:'ج', en:'C'}, birthDate:'1980-05-05', photo:'' },       // photo missing
};
const r = ftCompleteness(people);

ok(!!ftCompleteness, 'engine exported');
ok(r.total === 3, 'total 3, got '+r.total);
// filled cells: a=3, b=0, c=2 => 5 of 9
ok(r.percent === Math.round(5/9*100), 'percent = round(5/9), got '+r.percent);
ok(r.fields.nameEn.have === 2, 'nameEn have 2, got '+r.fields.nameEn.have);
ok(r.fields.nameEn.missing.length === 1 && r.fields.nameEn.missing[0] === 'b', 'nameEn missing = [b]');
ok(r.fields.birthDate.have === 2, 'birthDate have 2, got '+r.fields.birthDate.have);
ok(r.fields.photo.missing.length === 2, 'photo missing 2 (b,c), got '+r.fields.photo.missing.length);
ok(r.fieldOrder.join(',') === 'nameEn,birthDate,photo', 'field order stable');

// Edge cases
ok(ftCompleteness({}).percent === 0, 'empty -> 0%');
ok(ftCompleteness({}).total === 0, 'empty total 0');
ok(ftCompleteness().total === 0, 'no-arg -> 0 total (no throw)');
// whitespace-only English name counts as missing
ok(ftCompleteness({ z:{ name:{ar:'ز', en:'   '} } }).fields.nameEn.have === 0, 'blank en name = missing');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
