require('../occasions.js');            // IIFE exposes the engine on the global (repo convention)
const ftOccasions = global.ftOccasions;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

const today = new Date(2026, 4, 1); // 2026-05-01 (May), non-leap-agnostic fixed date
const people = {
  a: { name:{ar:'أ',en:'A'}, birthDate:'1990-05-01' },              // birthday today, turns 36
  b: { name:{ar:'ب',en:'B'}, birthDate:'2000-05-10' },              // in 9 days
  c: { name:{ar:'ج',en:'C'}, birthDate:'1980-08-01' },              // ~92 days -> excluded
  d: { name:{ar:'د',en:'D'}, birthDate:'1950-05-05', deathDate:'2010-05-05' }, // memorial in 4 days, 16y
  e: { name:{ar:'هـ',en:'E'}, birthDate:'' },                        // no date -> ignored
  f: { name:{ar:'و',en:'F'}, birthDate:'not-a-date' },              // invalid -> ignored
  g: { name:{ar:'ز',en:'G'}, birthDate:'1988-02-29' },              // Feb 29 -> handled, excluded here
};
const occ = ftOccasions(people, today, 30);
const byId = {}; occ.forEach(function(o){ byId[o.id]=o; });

ok(occ.length === 3, 'three occasions in window (a,b,d), got '+occ.length);
ok(byId.a && byId.a.daysUntil === 0 && byId.a.type==='birthday', 'a birthday today');
ok(byId.a && byId.a.years === 36, 'a turns 36, got '+(byId.a&&byId.a.years));
ok(byId.b && byId.b.daysUntil === 9, 'b in 9 days, got '+(byId.b&&byId.b.daysUntil));
ok(!byId.c, 'c excluded (outside 30d)');
ok(byId.d && byId.d.type==='memorial' && byId.d.daysUntil===4, 'd memorial in 4 days');
ok(byId.d && byId.d.years === 16, 'd 16 years since death, got '+(byId.d&&byId.d.years));
ok(!byId.e && !byId.f, 'empty/invalid dates ignored');
ok(occ[0].daysUntil <= occ[occ.length-1].daysUntil, 'sorted ascending by daysUntil');

// Feb 29 matches Feb 28 in a non-leap year window
const feb = ftOccasions({ g:{ name:{ar:'ز',en:'G'}, birthDate:'1988-02-29' } }, new Date(2026,1,27), 5);
ok(feb.length === 1 && feb[0].daysUntil === 1, 'Feb 29 -> Feb 28 (1 day away in 2026), got '+JSON.stringify(feb));

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
