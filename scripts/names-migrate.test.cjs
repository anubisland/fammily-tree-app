require('../translit.js');
const ftTranslit = global.ftTranslit;
// Standalone reference of the two-pass migration (mirrors app.js migrateNames).
function migrate(state){
  var ppl = state.people || {};
  var ids = Object.keys(ppl);
  var oldFull = {};
  ids.forEach(function(id){ if(typeof ppl[id].name === 'string') oldFull[id] = ppl[id].name; });
  function father(p){ if(!p||!p.parentId) return null; var par=ppl[p.parentId]; if(!par) return null;
    if(par.gender==='m') return par; var sp=par.spouseIds&&par.spouseIds[0]?ppl[par.spouseIds[0]]:null; return (sp&&sp.gender==='m')?sp:null; }
  ids.forEach(function(id){
    var p = ppl[id]; if(typeof p.name !== 'string') return;
    var full = oldFull[id], f = father(p);
    var fatherFull = f ? oldFull[f.id] : null;
    var ownAr = (fatherFull && full.slice(-(fatherFull.length+1)) === (' '+fatherFull)) ? full.slice(0, full.length-fatherFull.length-1) : full;
    p.name = { ar: ownAr, en: ftTranslit(ownAr) };
  });
  if(typeof state.familyName === 'string') state.familyName = { ar: state.familyName, en: ftTranslit(state.familyName) };
}
function P(id,name,g,parentId,spouseIds){return {id,name,gender:g,parentId:parentId||null,spouseIds:spouseIds||[],childrenIds:[]};}
var state={ familyName:'عائلة الوزير', people:{
  r:P('r','أحمد الوزير','m',null,['w']), w:P('w','فاطمة','f',null,['r']),
  s:P('s','محمد أحمد الوزير','m','r',[]), g:P('g','خالد محمد أحمد الوزير','m','s',[])
}};
migrate(state);
let pass=0, fail=0; function eq(a,b,l){ if(a===b) pass++; else { fail++; console.error('✗',l,'=>',JSON.stringify(a),'want',JSON.stringify(b)); } }
eq(state.people.g.name.ar, 'خالد', 'grandchild own = first segment');
eq(state.people.s.name.ar, 'محمد', 'child own = first segment');
eq(state.people.r.name.ar, 'أحمد الوزير', 'root own = incl surname');
eq(typeof state.people.g.name.en, 'string', 'en auto-filled');
eq(state.familyName.ar, 'عائلة الوزير', 'familyName -> object');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
