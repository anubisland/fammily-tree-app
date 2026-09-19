require('../app.js');   // node-guard exposes helpers, then returns before DOM
const H = global.__ftDateHelpers;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }
ok(!!H, 'helpers exposed');
ok(H.gregText('1980-03-14').length > 0, 'greg formats');
ok(H.hijriText('1980-03-14').indexOf('هـ') !== -1 || H.hijriText('1980-03-14') === '', 'hijri has هـ or empty (unsupported)');
ok(H.fmtDate('') === '', 'empty date -> empty');
ok(H.fmtDate('not-a-date') === '', 'invalid date -> empty');
ok(H.ageYears('2000-01-01','2020-01-01') === 20, 'age 20');
ok(H.ageYears('2000-06-01','2020-01-01') === 19, 'age not-yet-birthday = 19');
ok(H.ageYears('') === null, 'no birth -> null age');
ok(H.lifespanText('1900-01-01','1980-01-01').indexOf('80') !== -1, 'lifespan 80');
ok(H.lifespanText('1900-01-01','') === '', 'no death -> empty lifespan');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
