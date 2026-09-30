/* Photo doc-path builders — pure, node-testable (classic IIFE, no imports).
   Photos live in a Firestore subcollection trees/{treeId}/photos/{key}; the
   SDK-backed upload/resolve/delete live in photos.js. personId/momentId are
   eternal, so a photo's doc path is stable and overwrites cleanly. The p_/m_
   prefixes keep person and moment photos from colliding in one collection. */
(function(global){
  'use strict';
  var ftPhotoPaths = {
    person: function(treeId, personId){ return 'trees/' + treeId + '/photos/p_' + personId; },
    moment: function(treeId, momentId){ return 'trees/' + treeId + '/photos/m_' + momentId; }
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = ftPhotoPaths;
  global.ftPhotoPaths = ftPhotoPaths;
})(typeof window !== 'undefined' ? window : globalThis);
