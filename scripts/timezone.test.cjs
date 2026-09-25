require('../occasions.js');   // IIFE exposes ftOccasions + ftTodayInZone on the global
const ftOccasions = global.ftOccasions;
const todayInZone = global.ftTodayInZone;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(typeof todayInZone === 'function', 'todayInZone exported');

// A UTC instant where Tokyo (UTC+9) and Los Angeles (UTC-7) sit on different dates.
const now = new Date('2026-05-21T02:00:00Z'); // Tokyo: 21st 11:00 · LA: 20th 19:00
ok(todayInZone('Asia/Tokyo', now).getDate() === 21, 'Tokyo date = 21, got '+todayInZone('Asia/Tokyo', now).getDate());
ok(todayInZone('America/Los_Angeles', now).getDate() === 20, 'LA date = 20, got '+todayInZone('America/Los_Angeles', now).getDate());
ok(todayInZone('Asia/Tokyo', now).getMonth() === 4, 'Tokyo month = May(4)');

// Empty tz → the device date (same instant handed back).
ok(todayInZone('', now) === now, 'empty tz returns the given now');

// Invalid tz → falls back to now, never throws.
let threw = false, res;
try{ res = todayInZone('Not/AZone', now); }catch(e){ threw = true; }
ok(!threw, 'invalid tz does not throw');
ok(res === now, 'invalid tz falls back to now');

// Returned value is a local-midnight Date so ftOccasions reads clean Y/M/D.
const tok = todayInZone('Asia/Tokyo', now);
ok(tok.getHours() === 0 && tok.getMinutes() === 0, 'returns local-midnight date');

// Integration: an occasion dated "today in Tokyo" shows daysUntil 0 when today is
// computed in Tokyo, even though the raw UTC instant is the 20th in some zones.
const people = { p:{ name:{ar:'x',en:'x'}, birthDate:'1990-05-21', parentId:null } };
const occ = ftOccasions(people, todayInZone('Asia/Tokyo', now), 30);
ok(occ.length === 1 && occ[0].daysUntil === 0, 'birthday is "today" in Tokyo zone, got '+(occ[0]&&occ[0].daysUntil));

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
