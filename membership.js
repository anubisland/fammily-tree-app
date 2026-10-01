/* Multi-family membership helpers — pure, node-testable (classic IIFE, no imports).
   The memberships index lists a user's trees; the per-tree members doc is the
   authority (these helpers never decide permission). */
(function(global){
  'use strict';
  function resolveActiveTree(userData, membershipIds){
    userData = userData || {}; membershipIds = membershipIds || [];
    if(userData.activeTreeId && membershipIds.indexOf(userData.activeTreeId) !== -1) return userData.activeTreeId;
    if(userData.treeId) return userData.treeId;                 // legacy single-tree users
    return membershipIds.length ? membershipIds[0] : null;
  }
  function needsLegacySeed(userData, membershipIds){
    userData = userData || {}; membershipIds = membershipIds || [];
    if(!membershipIds.length && userData.treeId) return userData.treeId;
    return null;
  }
  var api = { resolveActiveTree: resolveActiveTree, needsLegacySeed: needsLegacySeed };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ftMembership = api;
})(typeof window !== 'undefined' ? window : globalThis);
