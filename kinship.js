/* ============================================================
   Kinship engine — pure function, no DOM/Firebase dependency so it can be
   unit-tested in node. Given the people map (id -> {id,name,gender,parentId,
   spouseIds,childrenIds}) it returns how person B relates to person A
   ("B is ___ to A"), in Arabic (default) or natural English (lang='en').

   The traversal (shortest path through the lowest common ancestor) is
   language-neutral; it yields a structured descriptor which is then formatted
   per language. Arabic is rich (عم vs خال, ابن العم vs ابن الخال); natural
   English collapses these to uncle/cousin and drops the paternal/maternal side.

   parentId links a person to ONE parent, which may be the father OR the mother
   (children of a woman in the tree are attached to her). We therefore read the
   parent's GENDER: a male parent is the father (mother = his spouse); a female
   parent is the mother (father = her spouse). This is what lets خال/خالة and
   the maternal side resolve correctly, not just عم/عمة.
   ============================================================ */
(function(global){
  'use strict';

  function make(people){
    function P(id){ return people[id] || null; }
    function gender(id){ var p = P(id); return p && p.gender === 'f' ? 'f' : 'm'; }
    function firstSpouse(id){ var p = P(id); return p && p.spouseIds && p.spouseIds.length ? p.spouseIds[0] : null; }

    // Father/mother resolved by the GENDER of the linked parent.
    function fatherOf(id){
      var p = P(id); if(!p || !p.parentId) return null;
      var par = P(p.parentId); if(!par) return null;
      if(par.gender === 'm') return p.parentId;      // parent is the father
      return firstSpouse(p.parentId);                // parent is the mother -> father = her spouse
    }
    function motherOf(id){
      var p = P(id); if(!p || !p.parentId) return null;
      var par = P(p.parentId); if(!par) return null;
      if(par.gender === 'f') return p.parentId;      // parent is the mother
      return firstSpouse(p.parentId);                // parent is the father -> mother = his spouse
    }

    /* Ancestors via father+mother with shortest distance and the step path
       ('f' up through father / 'm' up through mother). Includes self at 0. */
    function ancestorsMap(id){
      var map = {}, q = [{ id: id, dist: 0, path: [] }], visited = {};
      while(q.length){
        var cur = q.shift(), key = cur.id;
        if(!(key in map) || cur.dist < map[key].dist) map[key] = { dist: cur.dist, path: cur.path };
        if(visited[key]) continue; visited[key] = true;
        var f = fatherOf(cur.id);
        if(f) q.push({ id: f, dist: cur.dist + 1, path: cur.path.concat('f') });
        var m = motherOf(cur.id);
        if(m && m !== f) q.push({ id: m, dist: cur.dist + 1, path: cur.path.concat('m') });
      }
      return map;
    }
    function lca(aId, bId){
      var am = ancestorsMap(aId), bm = ancestorsMap(bId), best = null;
      for(var k in am){ if(k in bm){
        var tot = am[k].dist + bm[k].dist;
        if(!best || tot < best.tot) best = { id: k, dA: am[k].dist, dB: bm[k].dist, pathA: am[k].path, pathB: bm[k].path, tot: tot };
      }}
      return best;
    }
    // id's ancestor sitting one level below lcaId (the child-of-LCA on id's line).
    function nodeBelowLca(id, lcaId){
      var prev = id, cur = id, guard = 0;
      while(cur && cur !== lcaId && guard++ < 128){
        prev = cur;
        var f = fatherOf(cur), m = motherOf(cur);
        cur = (f && reaches(f, lcaId)) ? f : (m && reaches(m, lcaId)) ? m : (f || m);
      }
      return prev;
    }
    function reaches(id, target){ return target in ancestorsMap(id); }

    // ---------- structured blood descriptor (language-neutral) ----------
    function bloodDesc(aId, bId){
      if(aId === bId) return null;
      var L = lca(aId, bId);
      if(!L) return null;
      var dA = L.dA, dB = L.dB, gB = gender(bId), sideA = L.pathA[0];

      if(dA === 0) return { cat: 'desc', d: dB, g: gB };                 // B descends from A
      if(dB === 0) return { cat: 'anc', d: dA, side: sideA, g: gB };     // B is A's ancestor

      if(dA === 1 && dB === 1){                                          // siblings
        var fA = fatherOf(aId), fB = fatherOf(bId), mA = motherOf(aId), mB = motherOf(bId);
        var half = '';
        // Only qualify as half-sibling when the OTHER parent is known to differ;
        // an unrecorded mother must not turn full brothers into half-siblings.
        if((fA && fB && fA === fB) && (mA && mB && mA !== mB)) half = 'father';
        else if((mA && mB && mA === mB) && (fA && fB && fA !== fB)) half = 'mother';
        return { cat: 'sib', g: gB, half: half };
      }
      if(dA === 1 && dB >= 2) return { cat: 'nib', k: dB - 1, g: gB, sg: gender(nodeBelowLca(bId, L.id)) };
      if(dB === 1 && dA >= 2) return { cat: 'uncle', dA: dA, side: sideA, g: gB };
      return { cat: 'cousin', dA: dA, dB: dB, side: sideA, g: gB, ug: gender(nodeBelowLca(bId, L.id)) };
    }

    // ---------- Arabic formatting ----------
    function descTermAr(d, g){
      if(d === 1) return g === 'f' ? 'ابنة' : 'ابن';
      if(d === 2) return g === 'f' ? 'حفيدة' : 'حفيد';
      if(d === 3) return (g === 'f' ? 'بنت' : 'ابن') + ' الحفيد';
      if(d === 4) return (g === 'f' ? 'حفيدة' : 'حفيد') + ' الحفيد';
      return 'من الذرّية';
    }
    function ancTermAr(d, side, g){
      if(d === 1) return g === 'f' ? 'أم' : 'أب';
      if(d === 2) return g === 'f' ? 'جدة' : 'جد';
      if(d === 3) return (g === 'f' ? 'جدة' : 'جد') + ' ' + (side === 'm' ? 'الأم' : 'الأب');
      return (g === 'f' ? 'جدة' : 'جد') + ' الأعلى';
    }
    function uncleTermAr(dA, side, g){
      var base = side === 'm' ? (g === 'f' ? 'خالة' : 'خال') : (g === 'f' ? 'عمة' : 'عم');
      if(dA === 2) return base;
      if(dA === 3) return base + ' ' + (side === 'm' ? 'الأم' : 'الأب');
      if(dA === 4) return base + ' الجد';
      return base + ' الأعلى';
    }
    function niblingTermAr(k, g, sg){
      var sw = sg === 'f' ? 'الأخت' : 'الأخ';
      if(k === 1) return (g === 'f' ? 'بنت' : 'ابن') + ' ' + sw;
      if(k === 2) return (g === 'f' ? 'حفيدة' : 'حفيد') + ' ' + sw;
      if(k === 3) return (g === 'f' ? 'بنت' : 'ابن') + ' حفيد ' + sw;
      return 'من ذرّية ' + sw;
    }
    function uncleForCousinAr(dA, side, ug){
      var base = side === 'm' ? (ug === 'f' ? 'خالة' : 'خال') : (ug === 'f' ? 'عمة' : 'عم');
      if(dA === 2) return 'ال' + base;
      if(dA === 3) return base + ' ' + (side === 'm' ? 'الأم' : 'الأب');
      return base + ' الأعلى';
    }
    function cousinTermAr(dA, dB, side, g, ug){
      var unc = uncleForCousinAr(dA, side, ug);
      var k = dB - 1;
      var desc = k === 1 ? (g === 'f' ? 'بنت' : 'ابن')
               : k === 2 ? (g === 'f' ? 'حفيدة' : 'حفيد')
               : (g === 'f' ? 'بنت' : 'ابن') + ' حفيد';
      return desc + ' ' + unc;
    }
    function fmtAr(d){
      switch(d.cat){
        case 'desc':   return descTermAr(d.d, d.g);
        case 'anc':    return ancTermAr(d.d, d.side, d.g);
        case 'sib':    { var b = d.g === 'f' ? 'أخت' : 'أخ'; return d.half === 'father' ? b + ' لأب' : d.half === 'mother' ? b + ' لأم' : b; }
        case 'nib':    return niblingTermAr(d.k, d.g, d.sg);
        case 'uncle':  return uncleTermAr(d.dA, d.side, d.g);
        case 'cousin': return cousinTermAr(d.dA, d.dB, d.side, d.g, d.ug);
      }
      return '';
    }

    // ---------- English formatting (natural, side/gender collapsed) ----------
    function greats(n){ var s = ''; for(var i = 0; i < n; i++) s += 'great-'; return s; }   // n>=0
    function ordinal(n){ var w = { 1:'first', 2:'second', 3:'third', 4:'fourth', 5:'fifth' }; return w[n] || (n + 'th'); }
    function removedEn(r){ return r === 0 ? '' : r === 1 ? ' once removed' : r === 2 ? ' twice removed' : ' ' + r + ' times removed'; }
    function fmtEn(d){
      switch(d.cat){
        case 'desc': {
          if(d.d === 1) return d.g === 'f' ? 'daughter' : 'son';
          return greats(d.d - 2) + 'grand' + (d.g === 'f' ? 'daughter' : 'son');
        }
        case 'anc': {
          if(d.d === 1) return d.g === 'f' ? 'mother' : 'father';
          return greats(d.d - 2) + 'grand' + (d.g === 'f' ? 'mother' : 'father');
        }
        case 'sib': {
          var base = d.g === 'f' ? 'sister' : 'brother';
          return d.half ? 'half-' + base : base;
        }
        case 'nib': {
          var nn = d.g === 'f' ? 'niece' : 'nephew';
          if(d.k === 1) return nn;
          return greats(d.k - 2) + 'grand-' + nn;             // grand-nephew, great-grand-nephew…
        }
        case 'uncle': {
          var un = d.g === 'f' ? 'aunt' : 'uncle';
          if(d.dA === 2) return un;
          return greats(d.dA - 3) + 'great-' + un;            // great-uncle, great-great-uncle…
        }
        case 'cousin': {
          // ordinal = how many generations to the common ancestor (min side) minus 1;
          // removed = the generation gap between the two cousins.
          var ord = Math.min(d.dA, d.dB) - 1;
          return ordinal(ord) + ' cousin' + removedEn(Math.abs(d.dA - d.dB));
        }
      }
      return '';
    }

    function fmtBlood(d, lang){ return lang === 'en' ? fmtEn(d) : fmtAr(d); }

    // Arabic-only helpers for composing in-law phrases.
    function genitive(term){
      var map = { 'أخ':'الأخ','أخت':'الأخت','أب':'الأب','أم':'الأم','ابن':'الابن','ابنة':'الابنة','بنت':'البنت','عم':'العم','عمة':'العمة','خال':'الخال','خالة':'الخالة' };
      if(map[term]) return map[term];
      if(term.indexOf('أخ') === 0) return 'الأخ';
      if(term.indexOf('أخت') === 0) return 'الأخت';
      return term;
    }
    // Construct (إضافة) form: drop the leading "ال" from the LAST word.
    function construct(term){
      var w = String(term).split(' ');
      var last = w[w.length - 1];
      if(last.indexOf('ال') === 0) w[w.length - 1] = last.slice(2);
      return w.join(' ');
    }

    // Back-compat: the Arabic blood term as a string (used by older callers/tests).
    function bloodRelation(aId, bId){ var d = bloodDesc(aId, bId); return d ? fmtAr(d) : null; }

    function relate(aId, bId, lang){
      var en = lang === 'en';
      if(aId === bId) return en ? 'the same person' : 'الشخص نفسه';
      var A = P(aId), B = P(bId);
      if(!A || !B) return '';

      if((A.spouseIds || []).indexOf(bId) !== -1) return en ? (gender(bId) === 'f' ? 'wife' : 'husband') : (gender(bId) === 'f' ? 'زوجة' : 'زوج');

      var bd = bloodDesc(aId, bId);
      if(bd) return fmtBlood(bd, lang);

      // B is a blood relative of A's spouse
      var sA = firstSpouse(aId);
      if(sA){
        var rbd = bloodDesc(sA, bId);
        if(rbd){
          var isFather = rbd.cat === 'anc' && rbd.d === 1 && rbd.g === 'm';
          var isMother = rbd.cat === 'anc' && rbd.d === 1 && rbd.g === 'f';
          if(en){
            if(isFather) return 'father-in-law';
            if(isMother) return 'mother-in-law';
            if(rbd.cat === 'sib') return gender(bId) === 'f' ? 'sister-in-law' : 'brother-in-law';
            return (gender(sA) === 'f' ? 'wife' : 'husband') + "'s " + fmtEn(rbd);
          }
          if(isFather) return 'حمو (والد الزوج/الزوجة)';
          if(isMother) return 'حماة (والدة الزوج/الزوجة)';
          var sw = gender(sA) === 'f' ? 'الزوجة' : 'الزوج';
          if(rbd.cat === 'sib') return (rbd.g === 'f' ? 'أخت ' : 'أخو ') + sw;
          return construct(fmtAr(rbd)) + ' ' + sw;
        }
      }
      // A is a blood relative of B's spouse
      var sB = firstSpouse(bId);
      if(sB){
        var rad = bloodDesc(aId, sB);
        if(rad){
          var isSon = rad.cat === 'desc' && rad.d === 1 && rad.g === 'm';
          var isDaughter = rad.cat === 'desc' && rad.d === 1 && rad.g === 'f';
          if(en){
            if(isSon) return gender(bId) === 'f' ? 'daughter-in-law' : 'son-in-law';
            if(isDaughter) return 'son-in-law';
            return fmtEn(rad) + "'s " + (gender(bId) === 'f' ? 'wife' : 'husband');
          }
          if(isSon) return gender(bId) === 'f' ? 'زوجة الابن (كنّة)' : '';
          if(isDaughter) return 'زوج البنت (صهر)';
          return (gender(bId) === 'f' ? 'زوجة ' : 'زوج ') + genitive(fmtAr(rad));
        }
      }
      // A and B are each married, and their two spouses are blood relatives.
      if(sA && sB && sA !== sB){
        var rrd = bloodDesc(sA, sB);
        if(rrd){
          if(rrd.cat === 'sib'){
            if(en) return gender(bId) === 'f' ? 'sister-in-law' : 'brother-in-law';
            if(gender(aId) === 'f' && gender(bId) === 'f') return 'سِلفة';
            if(gender(aId) === 'm' && gender(bId) === 'm') return 'عديل';
          }
          if(en) return 'relative by marriage';
          var connector = gender(sA) === 'm' ? 'الزوج' : 'الزوجة';
          return (gender(bId) === 'f' ? 'زوجة ' : 'زوج ') + construct(fmtAr(rrd)) + ' ' + connector;
        }
      }
      return en ? 'distant relative' : 'قرابة بعيدة';
    }

    return { relate: relate, bloodRelation: bloodRelation, bloodDesc: bloodDesc, _lca: lca, _father: fatherOf, _mother: motherOf };
  }

  function ftKinship(people, aId, bId, lang){ return make(people).relate(aId, bId, lang); }
  ftKinship.make = make;

  if(typeof module !== 'undefined' && module.exports) module.exports = ftKinship;
  global.ftKinship = ftKinship;
})(typeof window !== 'undefined' ? window : globalThis);
