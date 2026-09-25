/* Duplicate-detection engine — pure, no DOM/Firebase, unit-testable in node.
   Finds people who are almost certainly the SAME person entered twice (the
   classic multi-editor / re-import hazard), and returns them as clusters of
   IDs for the caller to surface for manual review. It never merges or deletes
   — personId is eternal (constant #1), so consolidation stays a human decision.

   Precision over recall: two people match only when their whole nasab key
   (own name | father | grandfather, all Arabic-normalised) is identical. That
   avoids flagging cousins who merely share a first name. */
(function(global){
  'use strict';

  // Arabic normalisation: drop tashkeel + superscript alef + tatweel, unify the
  // alef/yaa/waw-hamza/taa-marbuta variants, collapse whitespace, lowercase.
  function norm(s){
    return String(s == null ? '' : s)
      .replace(/[ً-ْٰ]/g, '')   // harakat + dagger alef
      .replace(/ـ/g, '')                    // tatweel
      .replace(/[آأإٱ]/g, 'ا') // آأإٱ -> ا
      .replace(/ى/g, 'ي')              // ى -> ي
      .replace(/ئ/g, 'ي')              // ئ -> ي
      .replace(/ؤ/g, 'و')              // ؤ -> و
      .replace(/ة/g, 'ه')              // ة -> ه
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function ownAr(people, id){
    var p = people[id];
    return p && p.name ? p.name.ar : '';
  }

  // Nasab key: own name + up to two ancestors, normalised and joined. Cycle- and
  // depth-guarded so a malformed parent pointer can't loop or wander too far.
  function nasabKey(people, id){
    var parts = [], cur = id, guard = 0;
    while(cur && people[cur] && guard < 3){
      parts.push(norm(ownAr(people, cur)));
      cur = people[cur].parentId;
      guard++;
    }
    return parts.join('|');
  }

  function ftDuplicates(people){
    people = people || {};
    var ids = Object.keys(people);
    var groups = {};
    ids.forEach(function(id){
      if(!norm(ownAr(people, id))) return;   // skip nameless / blank records
      var k = nasabKey(people, id);
      (groups[k] = groups[k] || []).push(id);
    });
    var clusters = [];
    Object.keys(groups).forEach(function(k){
      if(groups[k].length > 1){
        clusters.push({ key: k, ids: groups[k], name: ownAr(people, groups[k][0]) });
      }
    });
    // Largest clusters first — the worst offenders surface at the top.
    clusters.sort(function(a, b){ return b.ids.length - a.ids.length; });
    return clusters;
  }

  ftDuplicates.norm = norm;   // exposed for tests

  if(typeof module !== 'undefined' && module.exports) module.exports = ftDuplicates;
  global.ftDuplicates = ftDuplicates;
})(typeof window !== 'undefined' ? window : globalThis);
