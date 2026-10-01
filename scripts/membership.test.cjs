require('../membership.js');
const M = global.ftMembership;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(!!M, 'ftMembership exposed');
// resolveActiveTree
ok(M.resolveActiveTree({ activeTreeId:'t2' }, ['t1','t2']) === 't2', 'active wins when a member');
ok(M.resolveActiveTree({ activeTreeId:'gone' }, ['t1','t2']) === 't1', 'stale active -> first membership');
ok(M.resolveActiveTree({ treeId:'t9' }, []) === 't9', 'legacy treeId when no memberships');
ok(M.resolveActiveTree({ activeTreeId:'t3', treeId:'t9' }, ['t1','t3']) === 't3', 'active preferred over legacy');
ok(M.resolveActiveTree({}, ['t1']) === 't1', 'first membership fallback');
ok(M.resolveActiveTree({}, []) === null, 'nothing -> null');
ok(M.resolveActiveTree(null, null) === null, 'null-safe');
// needsLegacySeed
ok(M.needsLegacySeed({ treeId:'t9' }, []) === 't9', 'seed when empty + legacy');
ok(M.needsLegacySeed({ treeId:'t9' }, ['t1']) === null, 'no seed when memberships exist');
ok(M.needsLegacySeed({}, []) === null, 'no seed when no legacy');
ok(M.needsLegacySeed(null, []) === null, 'null-safe seed');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
