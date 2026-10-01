/* Family-link pure helpers — parse a link request hash and build the mirrored
   link-doc pair. No imports; node-testable. The per-tree members doc stays the
   authority — a link only grants view (consumed in project 3). */
(function(global){
  'use strict';
  function parseLinkHash(text){
    var raw = String(text == null ? '' : text).trim();
    var i = raw.indexOf('#link='); if(i !== -1) raw = raw.slice(i + '#link='.length);
    try{ raw = decodeURIComponent(raw); }catch(e){}
    raw = raw.trim();
    var dot = raw.indexOf('.');
    if(dot < 1) return null;
    var treeId = raw.slice(0, dot), token = raw.slice(dot + 1);
    if(!treeId || !token || treeId.indexOf('/') !== -1 || token.indexOf('/') !== -1) return null;
    return { treeId: treeId, token: token };
  }
  function buildLinkPair(req, approveTreeId, remotePersonId, remoteFamilyName, approvedBy, linkId){
    var common = { kind: 'same_person', status: 'accepted', grantedScope: 'view_tree',
                   requestedBy: req.requestedBy, approvedBy: approvedBy };
    var aSide = Object.assign({}, common, {
      localPersonId: req.localPersonId, remoteTreeId: approveTreeId, remotePersonId: remotePersonId,
      remoteFamilyName: remoteFamilyName || {ar:'',en:''}, viaRequest: req.token
    });
    var bSide = Object.assign({}, common, {
      localPersonId: remotePersonId, remoteTreeId: req.treeId, remotePersonId: req.localPersonId,
      remoteFamilyName: req.localFamilyName || {ar:'',en:''}
    });
    return { aSide: aSide, bSide: bSide, linkId: linkId };
  }
  // Cross-tree read grants (project 3a): one uid-keyed viewer doc per tree, so the
  // rule can check it with exists(uid). onRequestTree grants the approver (B) view
  // of A (authorised by the pending request); onApproveTree grants the requester
  // (A) view of B (written by B, who owns B).
  function buildViewerGrants(req, approveTreeId, approverUid){
    return {
      onRequestTree: { treeId: req.treeId, uid: approverUid,
        data: { grantedBy: approverUid, viaRequest: req.token, remoteTreeId: approveTreeId } },
      onApproveTree: { treeId: approveTreeId, uid: req.requestedBy,
        data: { grantedBy: approverUid, remoteTreeId: req.treeId } }
    };
  }

  var api = { parseLinkHash: parseLinkHash, buildLinkPair: buildLinkPair, buildViewerGrants: buildViewerGrants };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ftLinks = api;
})(typeof window !== 'undefined' ? window : globalThis);
