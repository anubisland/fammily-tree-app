/* ============================================================
   Fan-chart engine — pure, node-testable (no DOM/Firebase). Given the people map
   it lays out a DESCENDANT sunburst centred on one person: the centre is depth 0,
   each outward ring is the next generation. Each node's angular span is its share
   of its subtree's leaves, so the outer ring is evenly distributed and labels
   don't collide. Colours follow the branch (each child-of-centre subtree a vivid
   family; deeper rings = lighter shades) — matching the Family-Archive look.
   The renderer (app.js) turns these nodes into SVG arcs.
   ============================================================ */
(function(global){
  'use strict';

  // 8 rich harmonic branch palettes: fill shade by depth (deeper = lighter),
  // with a text colour that stays legible on that shade.
  var PALETTES = [
    { shades:['#1D4ED8','#3B82F6','#60A5FA','#93C5FD','#BFDBFE'], text:['#FFFFFF','#FFFFFF','#1E3A8A','#1E3A8A','#1E3A8A'] },
    { shades:['#B45309','#F59E0B','#FBBF24','#FCD34D','#FDE68A'], text:['#FFFFFF','#FFFFFF','#78350F','#78350F','#78350F'] },
    { shades:['#047857','#10B981','#34D399','#6EE7B7','#A7F3D0'], text:['#FFFFFF','#FFFFFF','#064E3B','#064E3B','#064E3B'] },
    { shades:['#6D28D9','#8B5CF6','#A78BFA','#C4B5FD','#DDD6FE'], text:['#FFFFFF','#FFFFFF','#4C1D95','#4C1D95','#4C1D95'] },
    { shades:['#BE123C','#F43F5E','#FB7185','#FDA4AF','#FECDD3'], text:['#FFFFFF','#FFFFFF','#881337','#881337','#881337'] },
    { shades:['#0E7490','#06B6D4','#22D3EE','#67E8F9','#A5F3FC'], text:['#FFFFFF','#FFFFFF','#164E63','#164E63','#164E63'] },
    { shades:['#C2410C','#F97316','#FB923C','#FDBA74','#FED7AA'], text:['#FFFFFF','#FFFFFF','#7C2D12','#7C2D12','#7C2D12'] },
    { shades:['#4338CA','#6366F1','#818CF8','#A5B4FC','#C7D2FE'], text:['#FFFFFF','#FFFFFF','#312E81','#312E81','#312E81'] }
  ];
  function shadeFor(branchIndex, depth){
    var p = PALETTES[((branchIndex % PALETTES.length) + PALETTES.length) % PALETTES.length];
    var i = Math.min(Math.max(depth - 1, 0), p.shades.length - 1);
    return { fill: p.shades[i], text: p.text[i] };
  }

  // Donut-segment (or full-ring) SVG path between two radii and two angles.
  function arcPath(cx, cy, rInner, rOuter, a0, a1){
    var diff = Math.abs(a1 - a0);
    var f = function(n){ return Number(n).toFixed(2); };
    if(diff >= 2 * Math.PI - 0.01){   // full ring: two half-arcs each way
      return [
        'M', f(cx + rOuter), f(cy), 'A', rOuter, rOuter, 0, 1, 1, f(cx - rOuter), f(cy),
        'A', rOuter, rOuter, 0, 1, 1, f(cx + rOuter), f(cy),
        'M', f(cx + rInner), f(cy), 'A', rInner, rInner, 0, 1, 0, f(cx - rInner), f(cy),
        'A', rInner, rInner, 0, 1, 0, f(cx + rInner), f(cy), 'Z'
      ].join(' ');
    }
    var large = diff > Math.PI ? 1 : 0;
    var p1x = f(cx + rOuter * Math.cos(a0)), p1y = f(cy + rOuter * Math.sin(a0));
    var p2x = f(cx + rOuter * Math.cos(a1)), p2y = f(cy + rOuter * Math.sin(a1));
    var p3x = f(cx + rInner * Math.cos(a1)), p3y = f(cy + rInner * Math.sin(a1));
    var p4x = f(cx + rInner * Math.cos(a0)), p4y = f(cy + rInner * Math.sin(a0));
    return ['M',p1x,p1y, 'A',rOuter,rOuter,0,large,1,p2x,p2y, 'L',p3x,p3y, 'A',rInner,rInner,0,large,0,p4x,p4y, 'Z'].join(' ');
  }

  // Lay out the descendant sunburst. Returns { centerId, nodes:[{id,depth,
  // startAngle,endAngle,branchIndex,leafCount}] } (centre excluded from nodes;
  // nodes are the rings, depth>=1).
  function layout(people, centerId, opts){
    opts = opts || {};
    var generations = Math.max(1, opts.generations || 4);   // ring count (depth 1..generations)
    var full = opts.mode === 'full';
    people = people || {};
    if(!people[centerId]) return { centerId: centerId, nodes: [] };

    function childrenOf(id, visited){
      var p = people[id]; if(!p || !p.childrenIds) return [];
      return p.childrenIds.filter(function(cid){ return people[cid] && !visited[cid]; });
    }
    // leaves of a subtree, capped at the visible generation depth.
    function countLeaves(id, depth, visited){
      if(depth >= generations) return 1;
      var v = Object.assign({}, visited); v[id] = true;
      var kids = childrenOf(id, v);
      if(!kids.length) return 1;
      var sum = 0;
      kids.forEach(function(k){ sum += countLeaves(k, depth + 1, v); });
      return Math.max(1, sum);
    }

    var nodes = [];
    var baseStart = full ? 0 : Math.PI;
    var baseEnd   = full ? 2 * Math.PI : 2 * Math.PI;   // half = [π,2π] (top semicircle)

    function build(id, depth, a0, a1, branchIndex, visited){
      var v = Object.assign({}, visited); v[id] = true;
      if(depth >= 1){   // the centre (depth 0) is drawn separately, not a ring node
        nodes.push({ id: id, depth: depth, startAngle: a0, endAngle: a1, branchIndex: branchIndex, leafCount: countLeaves(id, depth, visited) });
      }
      if(depth >= generations) return;
      var kids = childrenOf(id, v);
      if(!kids.length) return;
      var leaves = kids.map(function(k){ return countLeaves(k, depth + 1, v); });
      var total = leaves.reduce(function(a, b){ return a + b; }, 0) || 1;
      var cur = a0, span = a1 - a0;
      kids.forEach(function(k, idx){
        var kSpan = (leaves[idx] / total) * span;
        var ks = cur, ke = cur + kSpan; cur = ke;
        // Each child of the centre seeds a distinct palette; descendants inherit it.
        var bi = depth === 0 ? idx : branchIndex;
        build(k, depth + 1, ks, ke, bi, v);
      });
    }
    build(centerId, 0, baseStart, baseEnd, 0, {});
    return { centerId: centerId, nodes: nodes, generations: generations, mode: full ? 'full' : 'half' };
  }

  var api = { layout: layout, arcPath: arcPath, shadeFor: shadeFor, PALETTES: PALETTES };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ftFan = api;
})(typeof window !== 'undefined' ? window : globalThis);
