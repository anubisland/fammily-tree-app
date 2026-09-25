/* Occasions engine — pure, no DOM/Firebase, unit-testable in node.
   Given the people map and today's Date, returns birthdays (living) and death
   anniversaries (deceased) whose next Gregorian occurrence falls within
   windowDays. Sorted by daysUntil ascending. */
(function(global){
  'use strict';

  function parse(str){
    if(!str || typeof str !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    if(!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var dt = new Date(y, mo, d);
    if(dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function isLeap(y){ return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  // Next occurrence of (month, day) on/after `todayMid` (a midnight Date).
  // Feb 29 falls back to Feb 28 in a non-leap occurrence year.
  function nextOccurrence(mo, d, todayMid){
    function make(year){
      var day = (mo === 1 && d === 29 && !isLeap(year)) ? 28 : d;
      return new Date(year, mo, day);
    }
    var occ = make(todayMid.getFullYear());
    if(occ < todayMid) occ = make(todayMid.getFullYear() + 1);
    return occ;
  }
  function daysBetween(a, b){ return Math.round((b - a) / 86400000); }

  function ftOccasions(people, today, windowDays){
    today = today || new Date();
    windowDays = (windowDays == null) ? 30 : windowDays;
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var out = [];
    Object.keys(people || {}).forEach(function(id){
      var p = people[id]; if(!p) return;
      // Deceased via an explicit death date OR the dateless "deceased" flag; a
      // flagged-but-dateless person yields no occasion (no anniversary to match).
      var deceased = !!(p.deathDate || p.deceased);
      var srcStr = deceased ? p.deathDate : p.birthDate;
      var src = parse(srcStr); if(!src) return;
      var occ = nextOccurrence(src.m, src.d, todayMid);
      var du = daysBetween(todayMid, occ);
      if(du < 0 || du > windowDays) return;
      out.push({
        id: id,
        type: deceased ? 'memorial' : 'birthday',
        dateStr: srcStr,
        daysUntil: du,
        years: occ.getFullYear() - src.y
      });
    });
    out.sort(function(a, b){ return a.daysUntil - b.daysUntil; });
    return out;
  }

  // Today's calendar date IN a given IANA timezone, as a local-midnight Date so
  // ftOccasions (which reads local Y/M/D) treats it as "today there". Empty/invalid
  // tz, or an environment without Intl tz support, falls back to the device date —
  // so a diaspora family can pin occasions to the home timezone, or leave it local.
  function todayInZone(tz, now){
    now = now || new Date();
    if(!tz) return now;
    try{
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      var y, mo, d;
      parts.forEach(function(p){
        if(p.type === 'year') y = +p.value;
        else if(p.type === 'month') mo = +p.value;
        else if(p.type === 'day') d = +p.value;
      });
      if(!y || !mo || !d) return now;
      return new Date(y, mo - 1, d);
    }catch(e){ return now; }
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = ftOccasions;
    module.exports.todayInZone = todayInZone;
  }
  global.ftOccasions = ftOccasions;
  global.ftTodayInZone = todayInZone;
})(typeof window !== 'undefined' ? window : globalThis);
