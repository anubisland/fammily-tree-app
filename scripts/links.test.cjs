require('../links.js');
const L = global.ftLinks;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }
ok(!!L, 'ftLinks exposed');
// parseLinkHash
ok(JSON.stringify(L.parseLinkHash('x#link=A.tok123')) === JSON.stringify({treeId:'A',token:'tok123'}), 'full link');
ok(JSON.stringify(L.parseLinkHash('A.tok')) === JSON.stringify({treeId:'A',token:'tok'}), 'bare');
ok(L.parseLinkHash('nodot') === null, 'no dot -> null');
ok(L.parseLinkHash('#link=.tok') === null, 'empty tree -> null');
ok(L.parseLinkHash('#link=A.') === null, 'empty token -> null');
ok(L.parseLinkHash('#link=a/b.tok') === null, 'slash in tree -> null');
ok(L.parseLinkHash('') === null, 'empty -> null');
// buildLinkPair
const req = { treeId:'A', token:'tk', localPersonId:'x', localPersonName:{ar:'فاطمة',en:'F'}, localFamilyName:{ar:'الوزير',en:'W'}, requestedBy:'uidA' };
const p = L.buildLinkPair(req, 'B', 'y', {ar:'إبراهيم',en:'Ibrahim'}, 'uidB', 'L1');
ok(p.aSide.localPersonId==='x' && p.aSide.remoteTreeId==='B' && p.aSide.remotePersonId==='y', 'A side points to B/y');
ok(p.aSide.viaRequest==='tk', 'A side carries viaRequest');
ok(p.aSide.remoteFamilyName.ar==='إبراهيم', 'A side shows B family name');
ok(p.bSide.localPersonId==='y' && p.bSide.remoteTreeId==='A' && p.bSide.remotePersonId==='x', 'B side points to A/x');
ok(p.bSide.viaRequest===undefined, 'B side has no viaRequest');
ok(p.bSide.remoteFamilyName.ar==='الوزير', 'B side shows A family name');
ok(p.aSide.kind==='same_person' && p.aSide.status==='accepted' && p.aSide.grantedScope==='view_tree', 'A side constants');
ok(p.bSide.approvedBy==='uidB' && p.bSide.requestedBy==='uidA', 'both record approver+requester');
// buildViewerGrants
var g = L.buildViewerGrants({ treeId:'A', token:'tk', requestedBy:'uidA' }, 'B', 'uidB');
ok(g.onRequestTree.treeId==='A' && g.onRequestTree.uid==='uidB', 'request-tree grant: on A, for B');
ok(g.onRequestTree.data.viaRequest==='tk' && g.onRequestTree.data.remoteTreeId==='B', 'request-tree grant carries viaRequest + remote=B');
ok(g.onApproveTree.treeId==='B' && g.onApproveTree.uid==='uidA', 'approve-tree grant: on B, for A');
ok(g.onApproveTree.data.viaRequest===undefined && g.onApproveTree.data.remoteTreeId==='A', 'approve-tree grant has no viaRequest, remote=A');
ok(g.onApproveTree.data.grantedBy==='uidB' && g.onRequestTree.data.grantedBy==='uidB', 'both record approver as grantedBy');
// requestsToGC
var reqs = [{token:'t1'},{token:'t2'},{token:'t3'}];
var lks = [{viaRequest:'t1'},{viaRequest:'t3'},{localPersonId:'x'}];
var gc = L.requestsToGC(reqs, lks);
ok(gc.length===2 && gc.indexOf('t1')!==-1 && gc.indexOf('t3')!==-1, 'GC picks tokens with a matching link');
ok(gc.indexOf('t2')===-1, 'GC leaves a request with no link');
ok(JSON.stringify(L.requestsToGC([], lks))==='[]', 'GC empty requests -> []');
ok(JSON.stringify(L.requestsToGC(reqs, []))==='[]', 'GC no links -> []');
ok(JSON.stringify(L.requestsToGC(null, null))==='[]', 'GC null-safe');
console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
