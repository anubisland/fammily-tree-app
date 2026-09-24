require('../places.js');            // IIFE exposes ftPlaces on the global (repo convention)
const ftPlaces = global.ftPlaces;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

const N = ar => ({ ar, en: ar });
const people = {
  a: { name:N('أ'), residence:'القاهرة' },
  b: { name:N('ب'), residence:'القاهرة' },
  c: { name:N('ج'), residence:'جدة' },
  d: { name:N('د'), residence:'  القاهرة  ' }, // trimmed -> same city
  e: { name:N('هـ'), residence:'' },            // no residence
  f: { name:N('و') },                            // undefined residence
};
const r = ftPlaces(people);

ok(r.groups.length === 2, 'two city groups, got '+r.groups.length);
ok(r.groups[0].city === 'القاهرة' && r.groups[0].ids.length === 3, 'top city القاهرة x3, got '+JSON.stringify(r.groups[0]));
ok(r.groups[1].city === 'جدة' && r.groups[1].ids.length === 1, 'second جدة x1');
ok(r.withoutCount === 2, 'two without residence (e,f), got '+r.withoutCount);
ok(r.groups[0].ids.length >= r.groups[1].ids.length, 'sorted by count desc');

const empty = ftPlaces({});
ok(empty.groups.length === 0 && empty.withoutCount === 0, 'empty people -> no groups');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
