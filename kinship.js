/* ============================================================
   Kinship engine — pure function, no DOM/Firebase dependency so it can be
   unit-tested in node. Given the people map (id -> {id,name,gender,parentId,
   spouseIds,childrenIds}) it returns the Arabic term for how person B relates
   to person A ("B هو/هي ___ لـ A").

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
      var p = P(id); if(!p || !p.parentId) return firstSpouseFather(id);
      var par = P(p.parentId); if(!par) return null;
      if(par.gender === 'm') return p.parentId;      // parent is the father
      return firstSpouse(p.parentId);                // parent is the mother -> father = her spouse
    }
    function firstSpouseFather(){ return null; }
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

    // ---------- naming ----------
    function descTerm(d, g){                 // B is d levels below A
      if(d === 1) return g === 'f' ? 'ابنة' : 'ابن';
      if(d === 2) return g === 'f' ? 'حفيدة' : 'حفيد';
      if(d === 3) return (g === 'f' ? 'بنت' : 'ابن') + ' الحفيد';
      if(d === 4) return (g === 'f' ? 'حفيدة' : 'حفيد') + ' الحفيد';
      return 'من الذرّية';
    }
    function ancTerm(d, side, g){             // B is d levels above A
      if(d === 1) return g === 'f' ? 'أم' : 'أب';
      if(d === 2) return g === 'f' ? 'جدة' : 'جد';
      if(d === 3) return (g === 'f' ? 'جدة' : 'جد') + ' ' + (side === 'm' ? 'الأم' : 'الأب');
      return (g === 'f' ? 'جدة' : 'جد') + ' الأعلى';
    }
    function uncleTerm(dA, side, g){          // B is A's ancestor's sibling
      var base = side === 'm' ? (g === 'f' ? 'خالة' : 'خال') : (g === 'f' ? 'عمة' : 'عم');
      if(dA === 2) return base;              // parent's sibling
      if(dA === 3) return base + ' ' + (side === 'm' ? 'الأم' : 'الأب'); // grandparent's sibling: عم الأب / خال الأم
      if(dA === 4) return base + ' الجد';
      return base + ' الأعلى';
    }
    function niblingTerm(k, g, sg){           // B is k levels below A's sibling
      var sw = sg === 'f' ? 'الأخت' : 'الأخ';
      if(k === 1) return (g === 'f' ? 'بنت' : 'ابن') + ' ' + sw;   // ابن الأخ / بنت الأخت
      if(k === 2) return (g === 'f' ? 'حفيدة' : 'حفيد') + ' ' + sw; // حفيد الأخ
      if(k === 3) return (g === 'f' ? 'بنت' : 'ابن') + ' حفيد ' + sw;
      return 'من ذرّية ' + sw;
    }
    // The connecting relative, from A's view: A's (dA-1)-level ancestor's sibling.
    function uncleForCousin(dA, side, ug){
      var base = side === 'm' ? (ug === 'f' ? 'خالة' : 'خال') : (ug === 'f' ? 'عمة' : 'عم');
      if(dA === 2) return 'ال' + base;                                   // العم / الخالة
      if(dA === 3) return base + ' ' + (side === 'm' ? 'الأم' : 'الأب'); // عم الأب / خال الأم
      return base + ' الأعلى';
    }
    function cousinTerm(dA, dB, side, g, ug){ // dA>=2, dB>=2 (uncle gender ug)
      var unc = uncleForCousin(dA, side, ug);
      var k = dB - 1;                          // B is k levels below that relative
      var desc = k === 1 ? (g === 'f' ? 'بنت' : 'ابن')
               : k === 2 ? (g === 'f' ? 'حفيدة' : 'حفيد')
               : (g === 'f' ? 'بنت' : 'ابن') + ' حفيد';
      return desc + ' ' + unc;                 // ابن العم / حفيد العم / ابن عم الأب / حفيد عم الأب …
    }

    function bloodRelation(aId, bId){
      if(aId === bId) return null;
      var L = lca(aId, bId);
      if(!L) return null;
      var dA = L.dA, dB = L.dB, gB = gender(bId), sideA = L.pathA[0];

      if(dA === 0) return descTerm(dB, gB);          // B descends from A
      if(dB === 0) return ancTerm(dA, sideA, gB);    // B is A's ancestor

      if(dA === 1 && dB === 1){                       // siblings
        var fA = fatherOf(aId), fB = fatherOf(bId), mA = motherOf(aId), mB = motherOf(bId);
        var base = gB === 'f' ? 'أخت' : 'أخ';
        // Only qualify as half-sibling when the OTHER parent is known to differ;
        // an unrecorded mother must not turn full brothers into "أخ لأب".
        if((fA && fB && fA === fB) && (mA && mB && mA !== mB)) return base + ' لأب';
        if((mA && mB && mA === mB) && (fA && fB && fA !== fB)) return base + ' لأم';
        return base;
      }
      if(dA === 1 && dB >= 2){                         // B descends from A's sibling
        return niblingTerm(dB - 1, gB, gender(nodeBelowLca(bId, L.id)));
      }
      if(dB === 1 && dA >= 2){                         // B is A's ancestor's sibling
        return uncleTerm(dA, sideA, gB);
      }
      return cousinTerm(dA, dB, sideA, gB, gender(nodeBelowLca(bId, L.id))); // cousins & beyond
    }

    function genitive(term){
      var map = { 'أخ':'الأخ','أخت':'الأخت','أب':'الأب','أم':'الأم','ابن':'الابن','ابنة':'الابنة','بنت':'البنت','عم':'العم','عمة':'العمة','خال':'الخال','خالة':'الخالة' };
      if(map[term]) return map[term];
      if(term.indexOf('أخ') === 0) return 'الأخ';
      if(term.indexOf('أخت') === 0) return 'الأخت';
      return term;
    }

    function relate(aId, bId){
      if(aId === bId) return 'الشخص نفسه';
      var A = P(aId), B = P(bId);
      if(!A || !B) return '';

      if((A.spouseIds || []).indexOf(bId) !== -1) return gender(bId) === 'f' ? 'زوجة' : 'زوج';

      var bl = bloodRelation(aId, bId);
      if(bl) return bl;

      // B is a blood relative of A's spouse
      var sA = firstSpouse(aId);
      if(sA){
        var rb = bloodRelation(sA, bId);
        if(rb){
          if(rb === 'أب') return 'حمو (والد الزوج/الزوجة)';
          if(rb === 'أم') return 'حماة (والدة الزوج/الزوجة)';
          var sw = gender(sA) === 'f' ? 'الزوجة' : 'الزوج';
          if(rb.indexOf('أخت') === 0) return 'أخت ' + sw;
          if(rb.indexOf('أخ') === 0) return 'أخو ' + sw;
          return rb + ' ' + sw;
        }
      }
      // A is a blood relative of B's spouse
      var sB = firstSpouse(bId);
      if(sB){
        var ra = bloodRelation(aId, sB);
        if(ra){
          if(ra === 'ابن') return gender(bId) === 'f' ? 'زوجة الابن (كنّة)' : '';
          if(ra === 'ابنة' || ra === 'بنت') return 'زوج البنت (صهر)';
          return (gender(bId) === 'f' ? 'زوجة ' : 'زوج ') + genitive(ra);
        }
      }
      // A and B are each married, and their two spouses are blood siblings —
      // classically married to two brothers/sisters: سِلفة (two wives) / عديل (two husbands).
      if(sA && sB && sA !== sB){
        var rr = bloodRelation(sA, sB);                 // how B's spouse relates to A's spouse
        if(rr && rr.indexOf('أخ') === 0){               // أخ / أخت / أخ لأب / أخت لأم …
          if(gender(aId) === 'f' && gender(bId) === 'f') return 'سِلفة';  // two women married to brothers
          if(gender(aId) === 'm' && gender(bId) === 'm') return 'عديل';   // two men married to sisters
          return gender(bId) === 'f' ? 'زوجة قريب' : 'زوج قريبة';        // mixed: spouse of A's in-law sibling
        }
      }
      return 'قرابة بعيدة';
    }

    return { relate: relate, bloodRelation: bloodRelation, _lca: lca, _father: fatherOf, _mother: motherOf };
  }

  function ftKinship(people, aId, bId){ return make(people).relate(aId, bId); }
  ftKinship.make = make;

  if(typeof module !== 'undefined' && module.exports) module.exports = ftKinship;
  global.ftKinship = ftKinship;
})(typeof window !== 'undefined' ? window : globalThis);
