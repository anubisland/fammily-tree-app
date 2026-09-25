require('../timeline.js');   // IIFE exposes ftTimeline on the global (repo convention)
const ftTimeline = global.ftTimeline;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(!!ftTimeline, 'engine exposed');

const people = {
  g:  { name:{ar:'الجد'},  birthDate:'1920-05-10', deathDate:'1990-03-01' },
  f:  { name:{ar:'الأب'},  birthDate:'1950-01-01' },
  s:  { name:{ar:'الابن'}, birthDate:'1980-07-15' },
  x:  { name:{ar:'بلا'},   /* no dates */ },
  d:  { name:{ar:'راحل'},  deceased:true /* flag only, no date */ },
};
const ev = ftTimeline(people);

// g-birth(1920), f-birth(1950), s-birth(1980), g-death(1990) => 4 events
ok(ev.length === 4, '4 dated events, got '+ev.length);
ok(ev[0].id === 'g' && ev[0].type === 'birth' && ev[0].year === 1920, 'oldest = grandfather birth 1920');
ok(ev[ev.length-1].id === 'g' && ev[ev.length-1].type === 'death' && ev[ev.length-1].year === 1990, 'newest = grandfather death 1990');
ok(ev[1].id === 'f' && ev[2].id === 's', 'chronological middle order f then s');
ok(!ev.some(e => e.id === 'x'), 'dateless person excluded');
ok(!ev.some(e => e.id === 'd'), 'deceased-flag-only (no date) excluded');

// Birth before death at the same sort instant (defensive tie-break).
const same = { p:{ name:{ar:'p'}, birthDate:'2000-01-01', deathDate:'2000-01-01' } };
const se = ftTimeline(same);
ok(se[0].type === 'birth' && se[1].type === 'death', 'birth sorts before death on tie');

// Bare-year date is accepted and sorts at the start of its year.
ok(ftTimeline({ y:{ name:{ar:'y'}, birthDate:'1900' } })[0].year === 1900, 'bare year parsed');

// Edge cases
ok(ftTimeline({}).length === 0, 'empty -> no events');
ok(ftTimeline().length === 0, 'no-arg -> no throw');
ok(ftTimeline.parseDate('not-a-date') === null, 'invalid date -> null');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
