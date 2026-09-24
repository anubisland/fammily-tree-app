require('../stats.js');            // IIFE exposes ftStats on the global (repo convention)
const ftStats = global.ftStats;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

const today = new Date(2026, 0, 1); // 2026-01-01
const N = ar => ({ ar, en: ar });
const people = {
  r: { name:N('الجد'),   gender:'m', parentId:null, childrenIds:[], spouseIds:[], birthDate:'1950-06-01', residence:'القاهرة' }, // living, 75
  a: { name:N('الأب'),   gender:'m', parentId:'r',  childrenIds:[], spouseIds:[], birthDate:'1980-06-01', residence:'القاهرة' }, // living, 45
  b: { name:N('العمة'),  gender:'f', parentId:'r',  childrenIds:[], spouseIds:[], birthDate:'1985-06-01', deathDate:'2020-01-01' }, // deceased
  c: { name:N('الابن'),  gender:'m', parentId:'a',  childrenIds:[], spouseIds:[], birthDate:'2010-06-01' }, // living, 15, gen 3
  d: { name:N('البنت'),  gender:'f', parentId:'a',  childrenIds:[], spouseIds:[] }, // no birthDate
};
const s = ftStats(people, today);

ok(s.total === 5, 'total 5, got '+s.total);
ok(s.males === 3 && s.females === 2, 'males 3 / females 2, got '+s.males+'/'+s.females);
ok(s.living === 4 && s.deceased === 1, 'living 4 / deceased 1, got '+s.living+'/'+s.deceased);
ok(s.generations === 3, 'generations 3, got '+s.generations);
ok(s.mostChildren && s.mostChildren.count === 2, 'most children = 2, got '+(s.mostChildren&&s.mostChildren.count));
ok(s.oldest && s.oldest.id === 'r' && s.oldest.age === 75, 'oldest r age 75, got '+JSON.stringify(s.oldest));
ok(s.youngest && s.youngest.id === 'c' && s.youngest.age === 15, 'youngest c age 15, got '+JSON.stringify(s.youngest));
ok(s.avgAge === 45, 'avg age 45, got '+s.avgAge);
ok(s.topCity && s.topCity.city === 'القاهرة' && s.topCity.count === 2, 'top city القاهرة x2, got '+JSON.stringify(s.topCity));
ok(s.withBirthDate === 4 && s.withPhoto === 0, 'withBirth 4 / withPhoto 0, got '+s.withBirthDate+'/'+s.withPhoto);
ok(JSON.stringify(ftStats({}, today)).length > 0 && ftStats({}, today).total === 0, 'empty people -> total 0');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
