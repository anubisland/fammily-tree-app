require('../kinship.js');
const K = global.ftKinship;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

const P = {};
function add(id,g,parentId,spouseIds){ P[id]={id,gender:g,parentId:parentId||null,spouseIds:spouseIds||[],childrenIds:[]}; }
add('g2m','m',null,[]);                 // great-grandfather
add('g1m','m','g2m',['g1f']); add('g1f','f',null,['g1m']);
add('fa','m','g1m',['mo']); add('mo','f',null,['fa']);
add('un','m','g1m',[]);                 // father's brother
add('me','m','fa',['wf']);
add('sib','f','fa',[]);                 // my sister
add('wf','f',null,['me']);
add('ch','m','me',['chw']); add('chw','f',null,['ch']);   // my son + his wife
add('dau','f','me',['dauh']); add('dauh','m',null,['dau']); // my daughter + her husband
add('gch','m','ch',[]);
add('cuz','m','un',[]);                 // uncle's son
add('neph','m','sib',[]);               // sister's son
add('wf_fa','m',null,['wf_mo']); add('wf_mo','f',null,['wf_fa']);
P['wf'].parentId='wf_fa';

function ar(a,b){ return K(P,a,b); }
function en(a,b){ return K(P,a,b,'en'); }

// ── Arabic (locked — must not change) ──────────────────────────────────────
ok(ar('me','fa')==='أب', 'ar father');
ok(ar('me','mo')==='أم', 'ar mother');
ok(ar('me','g1m')==='جد', 'ar grandfather');
ok(ar('me','g2m')==='جد الأب', 'ar great-grandfather (side)');
ok(ar('me','sib')==='أخت', 'ar sister');
ok(ar('me','ch')==='ابن', 'ar son');
ok(ar('me','gch')==='حفيد', 'ar grandson');
ok(ar('me','un')==='عم', 'ar paternal uncle');
ok(ar('me','cuz')==='ابن العم', 'ar paternal cousin');
ok(ar('me','neph')==='ابن الأخت', 'ar sister\'s son');
ok(ar('me','wf')==='زوجة', 'ar wife');
ok(ar('me','wf_fa')==='حمو (والد الزوج/الزوجة)', 'ar father-in-law');
ok(ar('me','wf_mo')==='حماة (والدة الزوج/الزوجة)', 'ar mother-in-law');
ok(ar('me','chw')==='زوجة الابن (كنّة)', 'ar daughter-in-law');
ok(ar('me','dauh')==='زوج البنت (صهر)', 'ar son-in-law');
ok(ar('me','me')==='الشخص نفسه', 'ar self');

// ── English (new, natural) ─────────────────────────────────────────────────
ok(en('me','fa')==='father', 'en father');
ok(en('me','mo')==='mother', 'en mother');
ok(en('me','g1m')==='grandfather', 'en grandfather');
ok(en('me','g2m')==='great-grandfather', 'en great-grandfather');
ok(en('me','sib')==='sister', 'en sister');
ok(en('me','ch')==='son', 'en son');
ok(en('me','gch')==='grandson', 'en grandson');
ok(en('me','un')==='uncle', 'en uncle (collapsed)');
ok(en('me','cuz')==='first cousin', 'en first cousin');
ok(en('me','neph')==='nephew', 'en nephew');
ok(en('me','wf')==='wife', 'en wife');
ok(en('me','wf_fa')==='father-in-law', 'en father-in-law');
ok(en('me','wf_mo')==='mother-in-law', 'en mother-in-law');
ok(en('me','chw')==='daughter-in-law', 'en daughter-in-law');
ok(en('me','dauh')==='son-in-law', 'en son-in-law');
ok(en('me','me')==='the same person', 'en self');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
