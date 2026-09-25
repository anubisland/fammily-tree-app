/* Photo Storage path builders — pure, node-testable (classic IIFE, no imports).
   The SDK-backed upload/resolve/delete live in photos.js (Task 3).
   personId is eternal, so a person's photo path is stable and overwrites cleanly. */
(function(global){
  'use strict';
  var ftPhotoPaths = {
    person: function(treeId, personId){ return 'trees/' + treeId + '/people/' + personId + '.jpg'; },
    moment: function(treeId, momentId){ return 'trees/' + treeId + '/moments/' + momentId + '.jpg'; }
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = ftPhotoPaths;
  global.ftPhotoPaths = ftPhotoPaths;
})(typeof window !== 'undefined' ? window : globalThis);
