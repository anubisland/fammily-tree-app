/* Tree completeness engine — pure, no DOM/Firebase, unit-testable in node.
   Measures how filled-in the tree is across the fields that matter most, and
   returns the IDs of who is missing each one so the UI can turn every gap into
   an actionable invitation ("أكمل"). Returns IDs, not names — the caller
   resolves display names via t()/fullNameOf, same as ftStats/ftOccasions. */
(function(global){
  'use strict';

  function has(v){ return !!(v && String(v).trim()); }
  // English name is nested ({ar,en}) and mandatory by design, so it gets its
  // own test rather than a flat field lookup.
  function hasEn(p){ return !!(p && p.name && has(p.name.en)); }

  // The fields completeness is scored against. `key` doubles as the i18n label
  // suffix and the routing hint the sheet uses, so order here is display order.
  var FIELDS = [
    { key: 'nameEn',    test: hasEn },
    { key: 'birthDate', test: function(p){ return has(p && p.birthDate); } },
    { key: 'photo',     test: function(p){ return has(p && p.photo); } }
  ];

  function ftCompleteness(people){
    people = people || {};
    var ids = Object.keys(people);
    var total = ids.length;

    var fields = {};
    FIELDS.forEach(function(f){ fields[f.key] = { have: 0, missing: [] }; });

    var filledCells = 0;
    ids.forEach(function(id){
      var p = people[id];
      FIELDS.forEach(function(f){
        if(f.test(p)){ fields[f.key].have++; filledCells++; }
        else fields[f.key].missing.push(id);
      });
    });

    var cells = total * FIELDS.length;
    var percent = cells ? Math.round((filledCells / cells) * 100) : 0;

    return {
      total: total,
      percent: percent,
      fields: fields,
      fieldOrder: FIELDS.map(function(f){ return f.key; })
    };
  }

  if(typeof module !== 'undefined' && module.exports) module.exports = ftCompleteness;
  global.ftCompleteness = ftCompleteness;
})(typeof window !== 'undefined' ? window : globalThis);
