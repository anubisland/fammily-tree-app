require('../fan.js');
const F = global.ftFan;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }
function approx(a,b){ return Math.abs(a-b) < 1e-6; }

ok(!!F, 'ftFan exposed');

// A small family: center g with 2 children (a,b); a has 2 kids (a1,a2), b has 1 (b1).
const P = {};
function add(id,kids){ P[id]={id,name:{ar:id},gender:'m',childrenIds:kids||[],spouseIds:[]}; }
add('g',['a','b']); add('a',['a1','a2']); add('b',['b1']); add('a1'); add('a2'); add('b1');

// full mode, 3 generations
var r = F.layout(P,'g',{generations:3, mode:'full'});
ok(r.centerId==='g', 'center id');
ok(r.nodes.length===5, 'full/3gen → 5 ring nodes (a,b,a1,a2,b1)');
var byId = {}; r.nodes.forEach(n=>byId[n.id]=n);
ok(byId.a.depth===1 && byId.a1.depth===2, 'depths');
// children partition the parent's span exactly
ok(approx(byId.a.startAngle, 0), 'first child starts at base 0 (full)');
ok(approx(byId.b.endAngle, 2*Math.PI), 'last child ends at 2π (full)');
ok(approx(byId.a.endAngle, byId.b.startAngle), 'siblings are contiguous');
// a has 2 leaves, b has 1 → a spans 2/3 of the circle, b 1/3
ok(approx(byId.a.endAngle-byId.a.startAngle, (2/3)*2*Math.PI), 'a span = 2/3 (leaf-weighted)');
ok(approx(byId.b.endAngle-byId.b.startAngle, (1/3)*2*Math.PI), 'b span = 1/3');
// a1,a2 split a's span evenly, contiguous within a
ok(approx(byId.a1.startAngle, byId.a.startAngle) && approx(byId.a2.endAngle, byId.a.endAngle), 'grandchildren fill parent span');
// branch coloring: a and b are different branches (0 and 1); descendants inherit
ok(byId.a.branchIndex===0 && byId.b.branchIndex===1, 'top branches get distinct palettes');
ok(byId.a1.branchIndex===0 && byId.a2.branchIndex===0 && byId.b1.branchIndex===1, 'descendants inherit branch');

// half mode spans [π,2π]
var h = F.layout(P,'g',{generations:3, mode:'half'});
var hById={}; h.nodes.forEach(n=>hById[n.id]=n);
ok(approx(hById.a.startAngle, Math.PI), 'half starts at π');
ok(approx(hById.b.endAngle, 2*Math.PI), 'half ends at 2π');

// generations cap: 2 generations → only a,b (depth1) + their kids? depth<generations builds kids.
var g2 = F.layout(P,'g',{generations:2, mode:'full'});
ok(g2.nodes.every(n=>n.depth<=2), '2-gen cap: no depth>2');
ok(g2.nodes.some(n=>n.id==='a1')===true, '2-gen still includes depth-2 grandchildren');
var g1 = F.layout(P,'g',{generations:1, mode:'full'});
ok(g1.nodes.length===2 && g1.nodes.every(n=>n.depth===1), '1-gen → only the two children');

// shadeFor: branch palette + depth shade
var s = F.shadeFor(0,1); ok(s.fill==='#1D4ED8' && s.text==='#FFFFFF', 'shade depth1 branch0');
var s3 = F.shadeFor(0,3); ok(s3.fill==='#60A5FA', 'shade lightens with depth');
ok(F.shadeFor(8,1).fill===F.shadeFor(0,1).fill, 'branchIndex wraps mod 8');

// arcPath: full ring contains two arcs + Z; wedge contains L
ok(F.arcPath(0,0,10,20,0,2*Math.PI).indexOf('Z')!==-1, 'full-ring path closes');
ok(F.arcPath(0,0,10,20,0,1).indexOf('L')!==-1, 'wedge path has inner line');

// missing center → empty
ok(F.layout(P,'nope',{}).nodes.length===0, 'missing center → no nodes');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
