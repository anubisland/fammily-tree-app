require('../stats.js');   // IIFE exposes ftStatsBreakdown on the global (repo convention)
const bd = global.ftStatsBreakdown;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(typeof bd === 'function', 'breakdown exposed');

const today = new Date(2026, 0, 1); // 2026-01-01
const people = {
  g:  { name:{ar:'ج'}, gender:'m', parentId:null, birthDate:'1940-01-01', deathDate:'2010-01-01' }, // deceased, gen0
  f:  { name:{ar:'ف'}, gender:'m', parentId:'g', birthDate:'1970-01-01', residence:'القاهرة' },     // 56, gen1
  m:  { name:{ar:'م'}, gender:'f', parentId:'g', birthDate:'1975-01-01', residence:'القاهرة' },     // 51, gen1
  s:  { name:{ar:'س'}, gender:'m', parentId:'f', birthDate:'2010-01-01', residence:'دبي' },         // 16, gen2
  b:  { name:{ar:'ب'}, gender:'f', parentId:'f', birthDate:'2020-01-01' },                          // 6,  gen2
};
const r = bd(people, today);

// Gender
ok(r.gender.m === 3 && r.gender.f === 2, 'gender m3/f2, got '+JSON.stringify(r.gender));

// Generations: gen0=1 (g), gen1=2 (f,m), gen2=2 (s,b)
ok(r.generations.length === 3, '3 generations, got '+r.generations.length);
ok(r.generations[0].count === 1 && r.generations[1].count === 2 && r.generations[2].count === 2, 'gen counts 1/2/2');

// Age buckets (living only): g is deceased -> excluded. b=6 (0-12), s=16 (13-19), m=51 (40-59), f=56 (40-59)
const byKey = {}; r.ageBuckets.forEach(x => byKey[x.key] = x.count);
ok(byKey['0-12'] === 1, '0-12 = 1 (b), got '+byKey['0-12']);
ok(byKey['13-19'] === 1, '13-19 = 1 (s), got '+byKey['13-19']);
ok(byKey['40-59'] === 2, '40-59 = 2 (f,m), got '+byKey['40-59']);
ok(byKey['60+'] === 0, '60+ = 0 (deceased g excluded), got '+byKey['60+']);

// Top cities
ok(r.topCities[0].city === 'القاهرة' && r.topCities[0].count === 2, 'top city Cairo x2');
ok(r.topCities.length === 2, '2 cities total');

// Edge
ok(bd({}).gender.m === 0 && bd({}).generations.length === 0, 'empty safe');
ok(bd().topCities.length === 0, 'no-arg -> no throw');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
