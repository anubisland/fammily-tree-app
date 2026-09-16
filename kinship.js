/* ============================================================
   Kinship engine — pure function, no DOM/Firebase dependency so it can be
   unit-tested in node. Given the people map (id -> {id,name,gender,parentId,
   spouseIds,childrenIds}) it returns the Arabic term for how person B relates
   to person A ("B هو ___ لـ A").

   Model: parentId is the FATHER (patrilineal tree). The MOTHER of a person is
   taken to be the father's spouse. Maternal relatives (خال/خالة/ابن الخال …)
   are therefore only resolvable when the mother is herself present in the tree
   (e.g. cousin marriage) — otherwise only the paternal side is known.
   ============================================================ */
(function(global){
  'use strict';

  function make(people){
    function P(id){ return people[id] || null; }
    function fatherOf(id){ var p = P(id); return p && p.parentId ? p.parentId : null; }
    // Mother = a spouse of the father. If the father has several spouses we
    // cannot know which bore this child, so we take the first — a documented
    // approximation. Returns an id or null.
    function motherOf(id){
      var f = fatherOf(id); if(!f) return null;
      var fp = P(f); if(!fp || !fp.spouseIds || !fp.spouseIds.length) return null;
      return fp.spouseIds[0];
    }
    function gender(id){ var p = P(id); return p && p.gender === 'f' ? 'f' : 'm'; }
    function firstName(id){ var p = P(id); return p ? String(p.name || '').trim().split(/\s+/)[0] : ''; }

    /* Ancestors reachable via father+mother, with the shortest distance and the
       step sequence ('f'/'m') taken to reach each. Includes self at dist 0. */
    function ancestorsMap(id){
      var map = {}, q = [{ id: id, dist: 0, path: [] }], visited = {};
      while(q.length){
        var cur = q.shift();
        var key = cur.id;
        if(!(key in map) || cur.dist < map[key].dist){ map[key] = { dist: cur.dist, path: cur.path }; }
        if(visited[key]) continue; visited[key] = true;
        var f = fatherOf(cur.id);
        if(f) q.push({ id: f, dist: cur.dist + 1, path: cur.path.concat('f') });
        var m = motherOf(cur.id);
        if(m) q.push({ id: m, dist: cur.dist + 1, path: cur.path.concat('m') });
      }
      return map;
    }

    /* The lowest common ancestor of A and B minimising dA+dB, with the paths. */
    function lca(aId, bId){
      var am = ancestorsMap(aId), bm = ancestorsMap(bId), best = null;
      for(var k in am){
        if(k in bm){
          var tot = am[k].dist + bm[k].dist;
          if(!best || tot < best.tot){
            best = { id: k, dA: am[k].dist, dB: bm[k].dist, pathA: am[k].path, pathB: bm[k].path, tot: tot };
          }
        }
      }
      return best;
    }

    // The ancestor of `id` sitting one level below `lcaId` on id's line
    // (i.e. the child-of-LCA through which id descends). Used to read the
    // gender of the connecting sibling/uncle.
    function nodeBelowLca(id, lcaId){
      var prev = id, cur = id, guard = 0;
      while(cur && cur !== lcaId && guard++ < 64){
        prev = cur;
        var f = fatherOf(cur), m = motherOf(cur);
        // follow whichever parent leads to the LCA (prefer father)
        cur = (f && reaches(f, lcaId)) ? f : (m && reaches(m, lcaId)) ? m : f || m;
      }
      return prev;
    }
    function reaches(id, targetId){ return targetId in ancestorsMap(id); }

    // ---- naming helpers ----
    function child(g){ return g === 'f' ? 'بنت' : 'ابن'; }
    function sib(g){ return g === 'f' ? 'الأخت' : 'الأخ'; }

    function descendantTerm(dB, g){
      if(dB === 1) return g === 'f' ? 'ابنة' : 'ابن';
      if(dB === 2) return g === 'f' ? 'حفيدة' : 'حفيد';
      if(dB === 3) return (g === 'f' ? 'حفيدة' : 'حفيد') + ' الحفيد';
      return g === 'f' ? 'من الذرّية' : 'من الذرّية';
    }
    function ancestorTerm(dA, side, g){
      if(dA === 1) return g === 'f' ? 'أم' : 'أب';
      if(dA === 2) return g === 'f' ? 'جدة' : 'جد';
      if(dA === 3) return (g === 'f' ? 'جدة' : 'جد') + ' ' + (side === 'm' ? 'الأم' : 'الأب');
      return (g === 'f' ? 'جدة' : 'جد') + ' الأعلى';
    }

    function bloodRelation(aId, bId){
      if(aId === bId) return null;
      var L = lca(aId, bId);
      if(!L) return null;
      var dA = L.dA, dB = L.dB, gB = gender(bId);
      var sideA = L.pathA[0]; // 'f' paternal / 'm' maternal (from A's side)

      if(dA === 0) return descendantTerm(dB, gB);          // B descends from A
      if(dB === 0) return ancestorTerm(dA, sideA, gB);     // B is A's ancestor

      // siblings
      if(dA === 1 && dB === 1){
        var sameFather = fatherOf(aId) && fatherOf(aId) === fatherOf(bId);
        var mA = motherOf(aId), mB = motherOf(bId);
        var sameMother = mA && mB && mA === mB;
        var base = gB === 'f' ? 'أخت' : 'أخ';
        if(sameFather && sameMother) return base;                 // شقيق
        if(sameFather) return base + ' لأب';
        return base + ' لأم';
      }
      // B is A's nibling (child of A's sibling)
      if(dA === 1 && dB === 2){
        var sibNode = nodeBelowLca(bId, L.id);
        return child(gB) + ' ' + sib(gender(sibNode));           // ابن الأخ / بنت الأخت
      }
      // B is A's uncle/aunt (A's parent's sibling)
      if(dA === 2 && dB === 1){
        if(sideA === 'm') return gB === 'f' ? 'خالة' : 'خال';
        return gB === 'f' ? 'عمة' : 'عم';
      }
      // cousins (A's parent's sibling's child)
      if(dA === 2 && dB === 2){
        var uncle = nodeBelowLca(bId, L.id);                     // B's parent = A's uncle/aunt
        var ug = gender(uncle);
        var uncleTerm = sideA === 'm'
          ? (ug === 'f' ? 'الخالة' : 'الخال')
          : (ug === 'f' ? 'العمة' : 'العم');
        return child(gB) + ' ' + uncleTerm;                      // ابن العم / بنت الخالة …
      }
      // B is child of A's cousin (cousin's child)
      if(dA === 2 && dB === 3){
        var uncle2 = nodeBelowLca(bId, L.id);
        var ug2 = gender(uncle2);
        var t2 = sideA === 'm' ? (ug2 === 'f' ? 'الخالة' : 'الخال') : (ug2 === 'f' ? 'العمة' : 'العم');
        return child(gB) + ' ' + child('m') + ' ' + t2;          // ابن ابن العم …
      }
      // A is child of B's cousin  => B is A's parent's cousin
      if(dA === 3 && dB === 2){
        var uncle3 = nodeBelowLca(bId, L.id);
        var ug3 = gender(uncle3);
        var t3 = sideA === 'm' ? (ug3 === 'f' ? 'الخالة' : 'الخال') : (ug3 === 'f' ? 'العمة' : 'العم');
        return (gB === 'f' ? 'بنت' : 'ابن') + ' ' + t3 + ' ' + (sideA === 'm' ? 'للأم' : 'للأب'); // ابن العم للأب
      }
      // distant collateral — describe by side
      return 'قريب من جهة ' + (sideA === 'm' ? 'الأم' : 'الأب');
    }

    // genitive form of a blood term for in-law composition ("زوجة الأخ")
    function genitive(term){
      var map = {
        'أخ':'الأخ','أخت':'الأخت','أب':'الأب','أم':'الأم',
        'ابن':'الابن','ابنة':'الابنة','بنت':'البنت','عم':'العم','عمة':'العمة','خال':'الخال','خالة':'الخالة'
      };
      if(map[term]) return map[term];
      if(term.indexOf('أخ لأب') === 0 || term.indexOf('أخ لأم') === 0) return 'الأخ';
      if(term.indexOf('أخت لأب') === 0 || term.indexOf('أخت لأم') === 0) return 'الأخت';
      return term;
    }

    function relate(aId, bId){
      if(aId === bId) return 'الشخص نفسه';
      var A = P(aId), B = P(bId);
      if(!A || !B) return '';

      // direct spouse
      if((A.spouseIds || []).indexOf(bId) !== -1) return gender(bId) === 'f' ? 'زوجة' : 'زوج';

      // blood
      var bl = bloodRelation(aId, bId);
      if(bl) return bl;

      // B is a blood relative of A's spouse -> in-law on A's spouse's side
      var sA = (A.spouseIds || [])[0];
      if(sA){
        var rb = bloodRelation(sA, bId);
        if(rb){
          if(rb === 'أب') return 'حمو (والد الزوج/الزوجة)';
          if(rb === 'أم') return 'حماة (والدة الزوج/الزوجة)';
          var spouseWord = gender(sA) === 'f' ? 'الزوجة' : 'الزوج';
          if(rb === 'أخ') return 'أخو ' + spouseWord;
          if(rb === 'أخت') return 'أخت ' + spouseWord;
          return rb + ' ' + spouseWord;
        }
      }

      // B's spouse is a blood relative of A -> "زوج/زوجة [relative]"
      var sB = (B.spouseIds || [])[0];
      if(sB){
        var ra = bloodRelation(aId, sB);
        if(ra){
          if(ra === 'ابن' || ra === 'ابنة') return gender(bId) === 'f' ? 'زوجة الابن (كنّة)' : 'زوج الابنة (صهر)';
          if(ra === 'بنت') return 'زوج البنت (صهر)';
          return (gender(bId) === 'f' ? 'زوجة ' : 'زوج ') + genitive(ra);
        }
      }

      return 'لا توجد قرابة معروفة';
    }

    return { relate: relate, bloodRelation: bloodRelation };
  }

  function ftKinship(people, aId, bId){ return make(people).relate(aId, bId); }
  ftKinship.make = make;

  if(typeof module !== 'undefined' && module.exports){ module.exports = ftKinship; }
  global.ftKinship = ftKinship;
})(typeof window !== 'undefined' ? window : globalThis);
