// Exercises the pure name computation exported by app.js for tests.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
// app.js is a browser IIFE; pull out the exported pure helper via a tiny shim.
global.window = undefined;
// The helper is exposed as global.__ftComputeFullName when running under node.
require('../app.js');   // must not throw at load under node (guarded); see Step 3
const compute = global.__ftComputeFullName;
function P(id,ar,en,g,parentId,spouseIds){return {id,name:{ar,en},gender:g,parentId:parentId||null,spouseIds:spouseIds||[],childrenIds:[]};}
var people={
  r:P('r','أحمد الوزير','Ahmed Alwazir','m',null,['w']),
  w:P('w','فاطمة','Fatima','f',null,['r']),
  s:P('s','محمد','Mohammed','m','r',['sw']),
  sw:P('sw','مريم','Mariam','f',null,['s']),
  g:P('g','خالد','Khaled','m','s',[])
};
let pass=0, fail=0; function eq(a,b,l){ if(a===b) pass++; else { fail++; console.error('✗',l,'=>',JSON.stringify(a),'want',JSON.stringify(b)); } }
eq(compute(people,'g','ar'), 'خالد محمد أحمد الوزير', 'ar nasab up paternal chain');
eq(compute(people,'g','en'), 'Khaled Mohammed Ahmed Alwazir', 'en nasab');
// child of a mother whose husband is the father: nasab still paternal
var p2=Object.assign({},people);
eq(compute(people,'r','ar'), 'أحمد الوزير', 'root = own segment incl surname');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
