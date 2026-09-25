/* Family timeline engine — pure, no DOM/Firebase, unit-testable in node.
   Builds a single chronological stream of life events (births + deaths) from the
   dates already on each person, sorted oldest→newest, so the UI can tell the
   family's story across the years. Returns IDs + event metadata, not names —
   the caller resolves display names/gender via t()/getPerson (repo convention). */
(function(global){
  'use strict';

  // Accept a full YYYY-MM-DD or a bare YYYY. Returns {year, sort} where sort is a
  // comparable YYYYMMDD number (missing month/day default to 00 so a year-only
  // date sorts at the very start of its year). Invalid → null.
  function parseDate(str){
    if(!str || typeof str !== 'string') return null;
    var m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(str);
    if(!m) return null;
    var y = +m[1], mo = m[2] ? +m[2] : 0, d = m[3] ? +m[3] : 0;
    if(y < 1 || y > 3000) return null;
    return { year: y, sort: y * 10000 + mo * 100 + d };
  }

  function ftTimeline(people){
    people = people || {};
    var events = [];
    Object.keys(people).forEach(function(id){
      var p = people[id]; if(!p) return;
      var b = parseDate(p.birthDate);
      if(b) events.push({ id: id, type: 'birth', dateStr: p.birthDate, year: b.year, sort: b.sort });
      // A death event needs an actual date; the dateless "deceased" flag has no
      // point on a timeline, so it is intentionally skipped.
      var d = parseDate(p.deathDate);
      if(d) events.push({ id: id, type: 'death', dateStr: p.deathDate, year: d.year, sort: d.sort });
    });
    // Oldest first. Ties broken by type (birth before death in the same instant)
    // then id, so the order is stable across runs.
    events.sort(function(a, b){
      if(a.sort !== b.sort) return a.sort - b.sort;
      if(a.type !== b.type) return a.type === 'birth' ? -1 : 1;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    return events;
  }

  ftTimeline.parseDate = parseDate;   // exposed for tests

  if(typeof module !== 'undefined' && module.exports) module.exports = ftTimeline;
  global.ftTimeline = ftTimeline;
})(typeof window !== 'undefined' ? window : globalThis);
