/* Places engine — pure, no DOM/Firebase, unit-testable in node.
   Groups people by their (trimmed) residence city, sorted by group size, and
   reports how many have no residence. Returns person IDs; the caller resolves
   display names. */
(function(global){
  'use strict';

  function ftPlaces(people){
    people = people || {};
    var map = {}, without = 0;
    Object.keys(people).forEach(function(id){
      var p = people[id]; if(!p) return;
      var c = (p.residence == null ? '' : String(p.residence)).trim();
      if(c){ (map[c] = map[c] || []).push(id); }
      else { without++; }
    });
    var groups = Object.keys(map).map(function(c){ return { city: c, ids: map[c] }; });
    groups.sort(function(a, b){
      return b.ids.length - a.ids.length || a.city.localeCompare(b.city, 'ar');
    });
    return { groups: groups, withoutCount: without };
  }

  if(typeof module !== 'undefined' && module.exports) module.exports = ftPlaces;
  global.ftPlaces = ftPlaces;
})(typeof window !== 'undefined' ? window : globalThis);
