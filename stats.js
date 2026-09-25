/* Family statistics engine — pure, no DOM/Firebase, unit-testable in node.
   Given the people map (and today's Date for ages) returns aggregate stats.
   Returns person IDs (not names) so the caller resolves display names via t(). */
(function(global){
  'use strict';

  function parse(str){
    if(!str || typeof str !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    if(!m) return null;
    return { y: +m[1], m: +m[2] - 1, d: +m[3] };
  }
  function ageOf(birth, today){
    var b = parse(birth); if(!b) return null;
    var a = today.getFullYear() - b.y;
    var passed = (today.getMonth() > b.m) || (today.getMonth() === b.m && today.getDate() >= b.d);
    if(!passed) a--;
    return a < 0 ? null : a;
  }
  // depth = number of ancestors above a person (root = 0), cycle-guarded.
  function depth(id, people, memo){
    if(memo[id] !== undefined) return memo[id];
    memo[id] = 0; // break cycles: temporarily 0 while computing
    var p = people[id];
    var d = (p && p.parentId && people[p.parentId]) ? depth(p.parentId, people, memo) + 1 : 0;
    memo[id] = d;
    return d;
  }

  function ftStats(people, today){
    people = people || {};
    today = today || new Date();
    var ids = Object.keys(people);
    var males = 0, females = 0, living = 0, deceased = 0, withBirthDate = 0, withPhoto = 0;
    var childCount = {}, cities = {}, ages = [];
    var oldest = null, youngest = null;

    ids.forEach(function(id){
      var pid = people[id].parentId;
      if(pid && people[pid]) childCount[pid] = (childCount[pid] || 0) + 1;
    });

    ids.forEach(function(id){
      var p = people[id];
      var isDead = !!(p.deathDate || p.deceased);  // date OR the dateless flag
      if(p.gender === 'f') females++; else males++;
      if(isDead) deceased++; else living++;
      if(p.birthDate) withBirthDate++;
      if(p.photo) withPhoto++;
      if(p.residence && String(p.residence).trim()){
        var c = String(p.residence).trim();
        cities[c] = (cities[c] || 0) + 1;
      }
      if(!isDead){
        var a = ageOf(p.birthDate, today);
        if(a != null){
          ages.push(a);
          if(!oldest || a > oldest.age) oldest = { id: id, age: a };
          if(!youngest || a < youngest.age) youngest = { id: id, age: a };
        }
      }
    });

    var memo = {}, gens = 0;
    ids.forEach(function(id){ var d = depth(id, people, memo); if(d > gens) gens = d; });
    gens = ids.length ? gens + 1 : 0;

    var mostChildren = null;
    Object.keys(childCount).forEach(function(id){
      if(!mostChildren || childCount[id] > mostChildren.count) mostChildren = { id: id, count: childCount[id] };
    });

    var topCity = null;
    Object.keys(cities).forEach(function(c){
      if(!topCity || cities[c] > topCity.count) topCity = { city: c, count: cities[c] };
    });

    var avgAge = ages.length ? Math.round(ages.reduce(function(a, b){ return a + b; }, 0) / ages.length) : null;

    return {
      total: ids.length, males: males, females: females,
      living: living, deceased: deceased, generations: gens,
      mostChildren: mostChildren, oldest: oldest, youngest: youngest,
      avgAge: avgAge, topCity: topCity,
      withBirthDate: withBirthDate, withPhoto: withPhoto
    };
  }

  // Chart-ready breakdowns for the stats visualisations. Kept separate from
  // ftStats so its 13 existing tests stay untouched. Returns plain count arrays;
  // the caller supplies labels/colours (repo convention: engine = data only).
  var AGE_BUCKETS = [
    { key: '0-12',  min: 0,  max: 12 },
    { key: '13-19', min: 13, max: 19 },
    { key: '20-39', min: 20, max: 39 },
    { key: '40-59', min: 40, max: 59 },
    { key: '60+',   min: 60, max: Infinity }
  ];

  function ftStatsBreakdown(people, today){
    people = people || {};
    today = today || new Date();
    var ids = Object.keys(people);

    var males = 0, females = 0;
    var cities = {};
    var ageCounts = AGE_BUCKETS.map(function(){ return 0; });
    var memo = {}, genCounts = [];

    ids.forEach(function(id){
      var p = people[id];
      if(p.gender === 'f') females++; else males++;
      var g = depth(id, people, memo);
      genCounts[g] = (genCounts[g] || 0) + 1;
      var isDead = !!(p.deathDate || p.deceased);
      if(p.residence && String(p.residence).trim()){
        var c = String(p.residence).trim();
        cities[c] = (cities[c] || 0) + 1;
      }
      if(!isDead){
        var a = ageOf(p.birthDate, today);
        if(a != null){
          for(var i=0;i<AGE_BUCKETS.length;i++){ if(a >= AGE_BUCKETS[i].min && a <= AGE_BUCKETS[i].max){ ageCounts[i]++; break; } }
        }
      }
    });

    var generations = [];
    for(var gi=0; gi<genCounts.length; gi++) generations.push({ gen: gi, count: genCounts[gi] || 0 });

    var ageBuckets = AGE_BUCKETS.map(function(b, i){ return { key: b.key, count: ageCounts[i] }; });

    var topCities = Object.keys(cities).map(function(c){ return { city: c, count: cities[c] }; })
      .sort(function(a, b){ return b.count - a.count; }).slice(0, 6);

    return { gender: { m: males, f: females }, generations: generations, ageBuckets: ageBuckets, topCities: topCities };
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = ftStats;
    module.exports.breakdown = ftStatsBreakdown;
  }
  global.ftStats = ftStats;
  global.ftStatsBreakdown = ftStatsBreakdown;
})(typeof window !== 'undefined' ? window : globalThis);
