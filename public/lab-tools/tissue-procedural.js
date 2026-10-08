/**
 * Tissues motif — polygon mesh (Voronoi cells + growth selection).
 * Hotspots: macro lumens + density. Patch = BFS on dual graph (whole cells only).
 * Render: fill lumens, stroke walls; outer boundary = exposed mesh edges.
 */
(function () {
  var STORAGE_KEY = 'refi-tissue-proc-v3';
  var STORAGE_KEYS_LEGACY = ['refi-tissue-proc-v2', 'refi-tissue-proc-v1'];
  var LOGICAL = 640;
  var MARGIN = 12;
  var MAX_HOTSPOTS = 16;
  var HIT_R = 14;
  var DRAG_THRESHOLD = 5;
  var DEFAULT_HOTSPOT = { nx: 0.5, ny: 0.45 };
  var BOUNDS = {
    minX: MARGIN,
    minY: MARGIN,
    maxX: LOGICAL - MARGIN,
    maxY: LOGICAL - MARGIN,
  };

  var canvas = document.getElementById('tissue-proc-canvas');
  if (!canvas) return;

  var seedInput = document.getElementById('tissue-proc-seed');
  var colsInput = document.getElementById('tissue-proc-cols');
  var colsVal = document.getElementById('tissue-proc-cols-val');
  var wallInput = document.getElementById('tissue-proc-wall');
  var wallVal = document.getElementById('tissue-proc-wall-val');
  var jitterInput = document.getElementById('tissue-proc-jitter');
  var jitterVal = document.getElementById('tissue-proc-jitter-val');
  var fineInput = document.getElementById('tissue-proc-fine');
  var fineVal = document.getElementById('tissue-proc-fine-val');
  var sigmaInput = document.getElementById('tissue-proc-sigma');
  var sigmaVal = document.getElementById('tissue-proc-sigma-val');
  var densityInput = document.getElementById('tissue-proc-density');
  var densityVal = document.getElementById('tissue-proc-density-val');
  var macroInput = document.getElementById('tissue-proc-macro');
  var macroVal = document.getElementById('tissue-proc-macro-val');
  var patchInput = document.getElementById('tissue-proc-patch');
  var patchVal = document.getElementById('tissue-proc-patch-val');
  var rimInput = document.getElementById('tissue-proc-rim');
  var rimVal = document.getElementById('tissue-proc-rim-val');
  var organicInput = document.getElementById('tissue-proc-organic');
  var organicVal = document.getElementById('tissue-proc-organic-val');
  var btnDraw = document.getElementById('tissue-proc-draw');
  var btnRandom = document.getElementById('tissue-proc-random');
  var btnClear = document.getElementById('tissue-proc-clear-centers');
  var hintEl = document.getElementById('tissue-proc-centers-hint');
  var hotspotListEl = document.getElementById('tissue-proc-hotspot-list');

  var hotspots = [cloneHotspot(DEFAULT_HOTSPOT)];
  var selectedHotspotIdx = 0;
  var dragHotspotIdx = -1;
  var dragMoved = false;
  var pendingDrawRaf = 0;

  function cloneHotspot(h) {
    return { nx: h.nx, ny: h.ny };
  }

  function ensureAtLeastOneHotspot() {
    if (hotspots.length === 0) {
      hotspots = [cloneHotspot(DEFAULT_HOTSPOT)];
      selectedHotspotIdx = 0;
    }
  }

  function mulberry32(a) {
    return function () {
      var t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function siteRng(gx, gy, seed) {
    var h = ((gx * 73856093) ^ (gy * 19349663) ^ (seed * 83492791)) >>> 0;
    return mulberry32(h || 1);
  }

  function cssRgb(varName, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    var el = document.createElement('span');
    el.style.color = v || fallback;
    document.body.appendChild(el);
    var rgbStr = getComputedStyle(el).color;
    document.body.removeChild(el);
    var m = rgbStr.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (!m) return [242, 230, 216];
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function rgbCss(rgb) {
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  function clamp255(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function mixRgb(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [
      clamp255(a[0] + (b[0] - a[0]) * t),
      clamp255(a[1] + (b[1] - a[1]) * t),
      clamp255(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hash01(ix, iy, iz) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1442695041);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise2D(x, y, seed) {
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var tx = x - x0;
    var ty = y - y0;
    var sx = tx * tx * (3 - 2 * tx);
    var sy = ty * ty * (3 - 2 * ty);
    var s = seed | 0;
    var a = hash01(x0, y0, s);
    var b = hash01(x0 + 1, y0, s);
    var c = hash01(x0, y0 + 1, s);
    var d = hash01(x0 + 1, y0 + 1, s);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }

  function fbm01(px, py, seed) {
    var v = 0;
    var amp = 0.5;
    var f = 0.04;
    for (var o = 0; o < 3; o++) {
      v += amp * valueNoise2D(px * f + o * 11.7, py * f + o * 3.1, seed + o * 101);
      f *= 2.05;
      amp *= 0.52;
    }
    return Math.max(0, Math.min(1, v));
  }

  function cellInteriorRgb(siteIndex, base) {
    var h = ((siteIndex * 1103515245 + 12345) >>> 16) & 0xffff;
    var v = (h % 41) / 255 - 0.08;
    return [
      clamp255(base[0] * (1 + v * 0.35)),
      clamp255(base[1] * (1 + v * 0.28)),
      clamp255(base[2] * (1 + v * 0.32)),
    ];
  }

  function randn(rand) {
    return Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());
  }

  function readParams() {
    var seed = Math.max(1, Math.floor(Number(seedInput.value) || 1));
    var cols = Math.max(5, Math.min(22, Math.floor(Number(colsInput.value) || 11)));
    var wall = wallInput ? Math.max(0.4, Math.min(4, Number(wallInput.value) || 1.2)) : 1.2;
    var jitter = Math.max(5, Math.min(60, Number(jitterInput.value) || 38));
    var fine = Math.max(0, Math.min(600, Math.floor(Number(fineInput.value) || 280)));
    var sigma = sigmaInput ? Math.max(10, Math.min(120, Number(sigmaInput.value) || 42)) : 42;
    var density = densityInput ? Math.max(0, Math.min(100, Number(densityInput.value) || 58)) : 58;
    var macro = macroInput ? Math.max(0, Math.min(100, Number(macroInput.value) || 52)) : 52;
    var patch = patchInput ? Math.max(0, Math.min(100, Number(patchInput.value) || 48)) : 48;
    var rim = rimInput ? Math.max(0.5, Math.min(3.5, Number(rimInput.value) || 1.65)) : 1.65;
    var organic = organicInput ? Math.max(0, Math.min(100, Number(organicInput.value) || 32)) : 32;
    return {
      seed: seed,
      cols: cols,
      wall: wall,
      jitter: jitter,
      fine: fine,
      sigma: sigma,
      density: density,
      macro: macro,
      patch: patch,
      rim: rim,
      organic: organic,
    };
  }

  function applyStoredParams(p) {
    if (typeof p.seed === 'number') seedInput.value = String(p.seed);
    if (typeof p.cols === 'number') colsInput.value = String(p.cols);
    if (typeof p.wall === 'number' && wallInput) wallInput.value = String(p.wall);
    else if (typeof p.edge === 'number' && wallInput) wallInput.value = String(Math.max(0.4, p.edge / 18));
    if (typeof p.jitter === 'number') jitterInput.value = String(p.jitter);
    if (typeof p.fine === 'number' && fineInput) fineInput.value = String(p.fine);
    if (typeof p.sigma === 'number' && sigmaInput) sigmaInput.value = String(p.sigma);
    if (typeof p.density === 'number' && densityInput) densityInput.value = String(p.density);
    if (typeof p.macro === 'number' && macroInput) macroInput.value = String(p.macro);
    if (typeof p.patch === 'number' && patchInput) patchInput.value = String(p.patch);
    else if (typeof p.footprint === 'number' && patchInput)
      patchInput.value = String(Math.max(0, Math.min(100, 100 - p.footprint)));
    if (typeof p.rim === 'number' && rimInput) rimInput.value = String(p.rim);
    else if (typeof p.outerRim === 'number' && rimInput)
      rimInput.value = String(Math.max(0.5, 0.5 + p.outerRim / 10));
    if (typeof p.organic === 'number' && organicInput) organicInput.value = String(p.organic);
    if (Array.isArray(p.centers)) {
      hotspots = p.centers
        .map(function (pair) {
          if (!Array.isArray(pair) || pair.length < 2) return null;
          return { nx: clamp01(pair[0]), ny: clamp01(pair[1]) };
        })
        .filter(Boolean)
        .slice(0, MAX_HOTSPOTS);
    }
    ensureAtLeastOneHotspot();
  }

  function loadParams() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        applyStoredParams(JSON.parse(raw));
        return;
      }
      for (var li = 0; li < STORAGE_KEYS_LEGACY.length; li++) {
        raw = localStorage.getItem(STORAGE_KEYS_LEGACY[li]);
        if (raw) {
          applyStoredParams(JSON.parse(raw));
          return;
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  function saveParams() {
    try {
      var p = readParams();
      p.centers = hotspots.map(function (h) {
        return [Math.round(h.nx * 10000) / 10000, Math.round(h.ny * 10000) / 10000];
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (_) {
      /* ignore */
    }
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  function syncSliderLabels() {
    if (colsVal) colsVal.textContent = colsInput.value;
    if (wallVal && wallInput) wallVal.textContent = wallInput.value;
    if (jitterVal) jitterVal.textContent = jitterInput.value;
    if (fineVal && fineInput) fineVal.textContent = fineInput.value;
    if (sigmaVal && sigmaInput) sigmaVal.textContent = sigmaInput.value + 'px';
    if (densityVal && densityInput) densityVal.textContent = densityInput.value;
    if (macroVal && macroInput) macroVal.textContent = macroInput.value;
    if (patchVal && patchInput) patchVal.textContent = patchInput.value;
    if (rimVal && rimInput) rimVal.textContent = rimInput.value;
    if (organicVal && organicInput) organicVal.textContent = organicInput.value;
    if (hintEl) {
      var n = hotspots.length;
      hintEl.textContent =
        n +
        ' hotspot' +
        (n === 1 ? '' : 's') +
        ' · mesh growth · click add · drag move · Shift+click remove · max ' +
        MAX_HOTSPOTS;
    }
  }

  function syncLabels() {
    syncSliderLabels();
    rebuildHotspotList();
  }

  function rebuildHotspotList() {
    if (!hotspotListEl) return;
    hotspotListEl.innerHTML = '';
    for (var i = 0; i < hotspots.length; i++) {
      (function (idx) {
        var row = document.createElement('div');
        row.className = 'tissue-proc__hotspot-row';
        if (idx === selectedHotspotIdx) row.classList.add('tissue-proc__hotspot-row--selected');

        var label = document.createElement('button');
        label.type = 'button';
        label.className = 'tissue-proc__hotspot-label';
        label.textContent = 'Hotspot ' + (idx + 1);
        label.addEventListener('click', function () {
          selectedHotspotIdx = idx;
          syncLabels();
          draw();
        });

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'tissue-proc__hotspot-remove';
        removeBtn.setAttribute('aria-label', 'Remove hotspot ' + (idx + 1));
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function () {
          hotspots.splice(idx, 1);
          ensureAtLeastOneHotspot();
          selectedHotspotIdx = Math.min(selectedHotspotIdx, hotspots.length - 1);
          draw();
          syncLabels();
        });

        row.appendChild(label);
        row.appendChild(removeBtn);
        hotspotListEl.appendChild(row);
      })(i);
    }
  }

  function minDistToHotspotsSq(px, py) {
    var best = 1e20;
    for (var i = 0; i < hotspots.length; i++) {
      var hx = hotspots[i].nx * LOGICAL;
      var hy = hotspots[i].ny * LOGICAL;
      var dx = px - hx;
      var dy = py - hy;
      var d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return best;
  }

  function densityAt(px, py, p) {
    var d = 1;
    var sigma = LOGICAL * 0.12;
    var k = (p.density / 100) * 2.6;
    for (var i = 0; i < hotspots.length; i++) {
      var hx = hotspots[i].nx * LOGICAL;
      var hy = hotspots[i].ny * LOGICAL;
      var dx = px - hx;
      var dy = py - hy;
      d += k * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
    return d;
  }

  function circumcircle(ax, ay, bx, by, cx, cy) {
    var d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return null;
    var a2 = ax * ax + ay * ay;
    var b2 = bx * bx + by * by;
    var c2 = cx * cx + cy * cy;
    var ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    var uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { x: ux, y: uy };
  }

  function inCircumcircle(px, py, ax, ay, bx, by, cx, cy) {
    var cc = circumcircle(ax, ay, bx, by, cx, cy);
    if (!cc) return false;
    var dx = px - cc.x;
    var dy = py - cc.y;
    var ax0 = ax - cc.x;
    var ay0 = ay - cc.y;
    return dx * dx + dy * dy < ax0 * ax0 + ay0 * ay0 - 1e-9;
  }

  function delaunayTriangles(pts) {
    var n = pts.length;
    if (n < 3) return [];

    var minX = pts[0].x;
    var minY = pts[0].y;
    var maxX = minX;
    var maxY = minY;
    for (var i = 1; i < n; i++) {
      minX = Math.min(minX, pts[i].x);
      minY = Math.min(minY, pts[i].y);
      maxX = Math.max(maxX, pts[i].x);
      maxY = Math.max(maxY, pts[i].y);
    }
    var dmax = Math.max(maxX - minX, maxY - minY) * 20 + 1;
    var mx = (minX + maxX) * 0.5;
    var my = (minY + maxY) * 0.5;

    var superA = n;
    var superB = n + 1;
    var superC = n + 2;
    var all = pts.concat([
      { x: mx - dmax, y: my - dmax },
      { x: mx + dmax, y: my - dmax },
      { x: mx, y: my + dmax },
    ]);

    var tris = [[superA, superB, superC]];

    function keyEdge(i, j) {
      return i < j ? i + ',' + j : j + ',' + i;
    }

    for (var pi = 0; pi < n; pi++) {
      var px = all[pi].x;
      var py = all[pi].y;
      var bad = [];
      for (var ti = 0; ti < tris.length; ti++) {
        var t = tris[ti];
        if (
          inCircumcircle(
            px,
            py,
            all[t[0]].x,
            all[t[0]].y,
            all[t[1]].x,
            all[t[1]].y,
            all[t[2]].x,
            all[t[2]].y
          )
        ) {
          bad.push(ti);
        }
      }

      var edgeCount = {};
      for (var bi = 0; bi < bad.length; bi++) {
        var bt = tris[bad[bi]];
        for (var e = 0; e < 3; e++) {
          var i0 = bt[e];
          var i1 = bt[(e + 1) % 3];
          var k = keyEdge(i0, i1);
          edgeCount[k] = (edgeCount[k] || 0) + 1;
        }
      }

      var poly = [];
      for (var ek in edgeCount) {
        if (edgeCount[ek] === 1) {
          var parts = ek.split(',');
          poly.push([Number(parts[0]), Number(parts[1])]);
        }
      }

      for (var bj = bad.length - 1; bj >= 0; bj--) tris.splice(bad[bj], 1);
      for (var pj = 0; pj < poly.length; pj++) {
        tris.push([poly[pj][0], poly[pj][1], pi]);
      }
    }

    var out = [];
    for (var ti2 = tris.length - 1; ti2 >= 0; ti2--) {
      var t2 = tris[ti2];
      if (t2[0] >= n || t2[1] >= n || t2[2] >= n) tris.splice(ti2, 1);
      else out.push(t2);
    }
    return out;
  }

  function buildNeighbors(tris, n) {
    var adj = [];
    for (var i = 0; i < n; i++) adj[i] = [];
    var seen = {};
    for (var ti = 0; ti < tris.length; ti++) {
      var t = tris[ti];
      for (var e = 0; e < 3; e++) {
        var a = t[e];
        var b = t[(e + 1) % 3];
        var key = a < b ? a + '|' + b : b + '|' + a;
        if (seen[key]) continue;
        seen[key] = true;
        adj[a].push(b);
        adj[b].push(a);
      }
    }
    return adj;
  }

  function intersectLines(ax, ay, bx, by, cx, cy, dx, dy) {
    var denom = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
    if (Math.abs(denom) < 1e-12) return null;
    var t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / denom;
    return { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
  }

  function clipLineToRect(mx, my, dx, dy, bounds) {
    var len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    var pts = [];
    var candidates = [
      { t: (bounds.minX - mx) / (dx || 1e-9), edge: 'x0' },
      { t: (bounds.maxX - mx) / (dx || 1e-9), edge: 'x1' },
      { t: (bounds.minY - my) / (dy || 1e-9), edge: 'y0' },
      { t: (bounds.maxY - my) / (dy || 1e-9), edge: 'y1' },
    ];
    for (var ci = 0; ci < candidates.length; ci++) {
      var t = candidates[ci].t;
      var px = mx + t * dx;
      var py = my + t * dy;
      if (
        px >= bounds.minX - 0.5 &&
        px <= bounds.maxX + 0.5 &&
        py >= bounds.minY - 0.5 &&
        py <= bounds.maxY + 0.5
      ) {
        pts.push({ x: px, y: py, t: t });
      }
    }
    if (pts.length < 2) return null;
    pts.sort(function (a, b) {
      return a.t - b.t;
    });
    return { x0: pts[0].x, y0: pts[0].y, x1: pts[pts.length - 1].x, y1: pts[pts.length - 1].y };
  }

  function voronoiVertex(pi, pj, pk) {
    var mx1 = (pi.x + pj.x) * 0.5;
    var my1 = (pi.y + pj.y) * 0.5;
    var dx1 = pj.y - pi.y;
    var dy1 = pi.x - pj.x;
    var mx2 = (pi.x + pk.x) * 0.5;
    var my2 = (pi.y + pk.y) * 0.5;
    var dx2 = pk.y - pi.y;
    var dy2 = pi.x - pk.x;
    return intersectLines(mx1, my1, mx1 + dx1, my1 + dy1, mx2, my2, mx2 + dx2, my2 + dy2);
  }

  function dedupeVerts(verts, eps) {
    var out = [];
    for (var i = 0; i < verts.length; i++) {
      var dup = false;
      for (var j = 0; j < out.length; j++) {
        if (Math.hypot(verts[i].x - out[j].x, verts[i].y - out[j].y) < eps) {
          dup = true;
          break;
        }
      }
      if (!dup) out.push(verts[i]);
    }
    return out;
  }

  function clipPolygonToRect(poly, bounds) {
    if (poly.length < 3) return poly;
    function clipEdge(points, inside) {
      if (points.length === 0) return [];
      var out = [];
      for (var i = 0; i < points.length; i++) {
        var a = points[i];
        var b = points[(i + 1) % points.length];
        var aIn = inside(a);
        var bIn = inside(b);
        if (aIn && bIn) out.push(b);
        else if (aIn && !bIn) {
          var t = intersectSegmentWithLine(a, b, inside);
          if (t) out.push(t);
        } else if (!aIn && bIn) {
          var t2 = intersectSegmentWithLine(a, b, inside);
          if (t2) out.push(t2);
          out.push(b);
        }
      }
      return out;
    }
    function intersectSegmentWithLine(a, b, inside) {
      for (var s = 0; s <= 1; s += 0.05) {
        var p = { x: lerp(a.x, b.x, s), y: lerp(a.y, b.y, s) };
        if (inside(p)) return p;
      }
      return null;
    }
    var p = poly.slice();
    p = clipEdge(p, function (v) {
      return v.x >= bounds.minX;
    });
    p = clipEdge(p, function (v) {
      return v.x <= bounds.maxX;
    });
    p = clipEdge(p, function (v) {
      return v.y >= bounds.minY;
    });
    p = clipEdge(p, function (v) {
      return v.y <= bounds.maxY;
    });
    return p;
  }

  function buildCellPolygons(pts, neighbors) {
    var n = pts.length;
    var polys = new Array(n);
    for (var i = 0; i < n; i++) {
      var pi = pts[i];
      var nbrs = neighbors[i].slice();
      if (nbrs.length < 2) {
        polys[i] = [];
        continue;
      }
      nbrs.sort(function (a, b) {
        return (
          Math.atan2(pts[a].y - pi.y, pts[a].x - pi.x) -
          Math.atan2(pts[b].y - pi.y, pts[b].x - pi.x)
        );
      });
      var verts = [];
      for (var ni = 0; ni < nbrs.length; ni++) {
        var j = nbrs[ni];
        var k = nbrs[(ni + 1) % nbrs.length];
        var v = voronoiVertex(pi, pts[j], pts[k]);
        if (v && isFinite(v.x) && isFinite(v.y)) verts.push(v);
      }
      verts = dedupeVerts(verts, 1.5);
      verts = clipPolygonToRect(verts, BOUNDS);
      if (verts.length >= 3) polys[i] = verts;
      else polys[i] = [];
    }
    return polys;
  }

  function polygonCentroid(poly) {
    var x = 0;
    var y = 0;
    for (var i = 0; i < poly.length; i++) {
      x += poly[i].x;
      y += poly[i].y;
    }
    return { x: x / poly.length, y: y / poly.length };
  }

  function nearestSiteIndex(pts, nx, ny) {
    var best = 0;
    var bd = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - nx;
      var dy = pts[i].y - ny;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  function selectIncludedCells(pts, neighbors, polys, p, fr) {
    var n = pts.length;
    var included = new Array(n);
    for (var i = 0; i < n; i++) included[i] = false;

    var seeds = [];
    for (var hi = 0; hi < hotspots.length; hi++) {
      var hx = hotspots[hi].nx * LOGICAL;
      var hy = hotspots[hi].ny * LOGICAL;
      seeds.push(nearestSiteIndex(pts, hx, hy));
    }
    for (var si = 0; si < n; si++) {
      if (pts[si].macro) {
        included[si] = true;
        if (seeds.indexOf(si) < 0) seeds.push(si);
      }
    }

    var maxDepth = Math.floor(lerp(6, 22, p.patch / 100));
    var org = p.organic / 100;
    var depth = new Array(n);
    for (var di = 0; di < n; di++) depth[di] = -1;

    var queue = [];
    for (var s = 0; s < seeds.length; s++) {
      var id = seeds[s];
      if (depth[id] < 0) {
        depth[id] = 0;
        included[id] = true;
        queue.push(id);
      }
    }

    var head = 0;
    while (head < queue.length) {
      var u = queue[head++];
      if (depth[u] >= maxDepth) continue;
      var nbrs = neighbors[u];
      for (var ni = 0; ni < nbrs.length; ni++) {
        var v = nbrs[ni];
        if (depth[v] >= 0) continue;
        var frontier = depth[u] >= maxDepth - 3;
        var prob = frontier ? lerp(0.92, 0.28, org) : 1;
        if (frontier) {
          var cx = polys[v].length ? polygonCentroid(polys[v]).x : pts[v].x;
          var cy = polys[v].length ? polygonCentroid(polys[v]).y : pts[v].y;
          prob *= 0.55 + 0.45 * fbm01(cx * 0.02, cy * 0.02, p.seed);
        }
        if (fr() > prob) continue;
        depth[v] = depth[u] + 1;
        included[v] = true;
        queue.push(v);
      }
    }

    return included;
  }

  function buildSites(p) {
    var cols = p.cols;
    var cw = LOGICAL / cols;
    var ch = LOGICAL / cols;
    var jitterAmt = (p.jitter / 100) * 0.42 * Math.min(cw, ch);
    var macroR = LOGICAL * lerp(0.06, 0.2, p.macro / 100);
    var macroR2 = macroR * macroR;
    /** @type {{x:number,y:number,macro?:boolean}[]} */
    var sites = [];

    for (var hi = 0; hi < hotspots.length; hi++) {
      var hx = hotspots[hi].nx * LOGICAL;
      var hy = hotspots[hi].ny * LOGICAL;
      sites.push({ x: hx, y: hy, macro: true });
      var frH = mulberry32((p.seed + hi * 131) >>> 0);
      var lobes = 2 + Math.floor(frH() * 2);
      for (var lb = 0; lb < lobes; lb++) {
        var ang = frH() * Math.PI * 2;
        var rad = macroR * (0.55 + frH() * 0.45);
        sites.push({
          x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, hx + Math.cos(ang) * rad)),
          y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, hy + Math.sin(ang) * rad)),
          macro: true,
        });
      }
    }

    for (var gy = 0; gy < cols; gy++) {
      for (var gx = 0; gx < cols; gx++) {
        var cx = gx * cw + 0.5 * cw;
        var cy = gy * ch + 0.5 * ch;
        if (minDistToHotspotsSq(cx, cy) < macroR2 * 0.85) continue;
        var rand = siteRng(gx, gy, p.seed);
        var dens = densityAt(cx, cy, p);
        var keepProb = Math.min(1, 0.3 + 0.7 * (dens / (1 + (p.density / 100) * 2.6)));
        if (rand() > keepProb) continue;
        sites.push({
          x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, cx + (rand() - 0.5) * 2 * jitterAmt)),
          y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, cy + (rand() - 0.5) * 2 * jitterAmt)),
        });
      }
    }

    var fr = mulberry32(((p.seed * 793487) >>> 0) ^ 0xbeefcafe);
    var sigma = p.sigma;
    if (p.fine > 0) {
      var weights = [];
      var wSum = 0;
      for (var wi = 0; wi < hotspots.length; wi++) {
        var w = densityAt(hotspots[wi].nx * LOGICAL, hotspots[wi].ny * LOGICAL, p);
        weights.push(w);
        wSum += w;
      }
      for (var fi = 0; fi < p.fine; fi++) {
        var pick = fr() * wSum;
        var acc = 0;
        var chosen = 0;
        for (var wj = 0; wj < weights.length; wj++) {
          acc += weights[wj];
          if (pick <= acc) {
            chosen = wj;
            break;
          }
        }
        var c = hotspots[chosen];
        var ox = c.nx * LOGICAL + sigma * randn(fr);
        var oy = c.ny * LOGICAL + sigma * randn(fr);
        if (minDistToHotspotsSq(ox, oy) < macroR2 * 0.35) continue;
        sites.push({
          x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, ox)),
          y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, oy)),
        });
      }
    }

    if (sites.length < 12) {
      for (var gy2 = 0; gy2 < cols; gy2++) {
        for (var gx2 = 0; gx2 < cols; gx2++) {
          var r2 = siteRng(gx2, gy2, p.seed + 77);
          sites.push({
            x: gx2 * cw + 0.5 * cw,
            y: gy2 * ch + 0.5 * ch,
          });
        }
      }
    }

    return sites;
  }

  function bisectorSegment(pi, pj, bounds) {
    var mx = (pi.x + pj.x) * 0.5;
    var my = (pi.y + pj.y) * 0.5;
    var dx = pj.y - pi.y;
    var dy = pi.x - pj.x;
    return clipLineToRect(mx, my, dx, dy, bounds);
  }

  function draw() {
    var p = readParams();
    seedInput.value = String(p.seed);
    ensureAtLeastOneHotspot();
    syncSliderLabels();

    var tissueLight = cssRgb('--pillar-tissue-light', '#F2E6D8');
    var tissueMid = cssRgb('--pillar-tissue-mid', '#B86A48');
    var tissueDark = cssRgb('--pillar-tissue-dark', '#3F261A');
    var paperBg = cssRgb('--paper-50', '#F7F5F0');

    var sites = buildSites(p);
    var tris = delaunayTriangles(sites);
    if (tris.length === 0) return;

    var neighbors = buildNeighbors(tris, sites.length);
    var polys = buildCellPolygons(sites, neighbors);
    var fr = mulberry32(((p.seed * 99173) >>> 0) ^ 0xc0ffee);
    var included = selectIncludedCells(sites, neighbors, polys, p, fr);

    canvas.width = LOGICAL;
    canvas.height = LOGICAL;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = rgbCss(paperBg);
    ctx.fillRect(0, 0, LOGICAL, LOGICAL);

    for (var ci = 0; ci < sites.length; ci++) {
      if (!included[ci] || polys[ci].length < 3) continue;
      var fillRgb = sites[ci].macro
        ? mixRgb(cellInteriorRgb(ci, tissueLight), tissueLight, 0.15)
        : cellInteriorRgb(ci, tissueLight);
      ctx.fillStyle = rgbCss(fillRgb);
      ctx.beginPath();
      var poly = polys[ci];
      ctx.moveTo(poly[0].x, poly[0].y);
      for (var vi = 1; vi < poly.length; vi++) ctx.lineTo(poly[vi].x, poly[vi].y);
      ctx.closePath();
      ctx.fill();
    }

    var wallW = p.wall;
    var rimW = wallW * p.rim;
    var org = p.organic / 100;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var seenEdge = {};
    for (var ti = 0; ti < tris.length; ti++) {
      var t = tris[ti];
      for (var e = 0; e < 3; e++) {
        var i = t[e];
        var j = t[(e + 1) % 3];
        var key = i < j ? i + '|' + j : j + '|' + i;
        if (seenEdge[key]) continue;
        seenEdge[key] = true;

        var incI = included[i];
        var incJ = included[j];
        if (!incI && !incJ) continue;

        var seg = bisectorSegment(sites[i], sites[j], BOUNDS);
        if (!seg) continue;

        var boundary = incI !== incJ;
        var w = boundary ? rimW : wallW;
        if (org > 0) {
          var mx = (seg.x0 + seg.x1) * 0.5;
          var my = (seg.y0 + seg.y1) * 0.5;
          w *= 0.75 + fbm01(mx * 0.03, my * 0.03, p.seed + 7) * 0.55 * org;
        }

        ctx.strokeStyle = boundary
          ? 'rgba(' + tissueDark.join(',') + ',0.92)'
          : 'rgba(' + tissueMid.join(',') + ',0.78)';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(seg.x0, seg.y0);
        ctx.lineTo(seg.x1, seg.y1);
        ctx.stroke();
      }
    }

    ctx.save();
    for (var h = 0; h < hotspots.length; h++) {
      var hx = hotspots[h].nx * LOGICAL;
      var hy = hotspots[h].ny * LOGICAL;
      var isSel = h === selectedHotspotIdx;
      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,248,242,0.3)';
      ctx.fill();
      ctx.strokeStyle = isSel ? 'rgba(120,48,32,0.9)' : 'rgba(148,76,54,0.45)';
      ctx.lineWidth = isSel ? 2.5 : 1.75;
      ctx.stroke();
    }
    ctx.restore();

    saveParams();
  }

  function scheduleDraw() {
    if (pendingDrawRaf) cancelAnimationFrame(pendingDrawRaf);
    pendingDrawRaf = requestAnimationFrame(function () {
      pendingDrawRaf = 0;
      draw();
    });
  }

  function randomSeed() {
    seedInput.value = String(1 + Math.floor(Math.random() * 2e9));
    draw();
  }

  function canvasToLogical(ev) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
    };
  }

  function hitHotspot(lx, ly) {
    for (var i = hotspots.length - 1; i >= 0; i--) {
      var hx = hotspots[i].nx * LOGICAL;
      var hy = hotspots[i].ny * LOGICAL;
      var dx = lx - hx;
      var dy = ly - hy;
      if (dx * dx + dy * dy <= HIT_R * HIT_R) return i;
    }
    return -1;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    var pt = canvasToLogical(ev);
    var idx = hitHotspot(pt.x, pt.y);
    if (idx >= 0) {
      dragHotspotIdx = idx;
      dragMoved = false;
      selectedHotspotIdx = idx;
      rebuildHotspotList();
      canvas.setPointerCapture(ev.pointerId);
      try {
        canvas.style.cursor = 'grabbing';
      } catch (_) {}
    }
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (dragHotspotIdx < 0) return;
    var pt = canvasToLogical(ev);
    var hx = hotspots[dragHotspotIdx].nx * LOGICAL;
    var hy = hotspots[dragHotspotIdx].ny * LOGICAL;
    if (Math.abs(pt.x - hx) > DRAG_THRESHOLD || Math.abs(pt.y - hy) > DRAG_THRESHOLD) {
      dragMoved = true;
    }
    hotspots[dragHotspotIdx].nx = clamp01(pt.x / LOGICAL);
    hotspots[dragHotspotIdx].ny = clamp01(pt.y / LOGICAL);
    scheduleDraw();
  });

  canvas.addEventListener('pointerup', function (ev) {
    var hadGrab = dragHotspotIdx >= 0;
    var wasDrag = dragMoved;
    var grabIdx = dragHotspotIdx;

    if (hadGrab) {
      dragHotspotIdx = -1;
      dragMoved = false;
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      canvas.style.cursor = 'crosshair';
      if (wasDrag) {
        draw();
        syncLabels();
        return;
      }
      if (ev.shiftKey && grabIdx >= 0) {
        hotspots.splice(grabIdx, 1);
        ensureAtLeastOneHotspot();
        selectedHotspotIdx = Math.min(selectedHotspotIdx, hotspots.length - 1);
      }
      draw();
      syncLabels();
      return;
    }

    var pt = canvasToLogical(ev);
    var nx = pt.x / LOGICAL;
    var ny = pt.y / LOGICAL;

    if (ev.shiftKey) {
      var best = -1;
      var bd = Infinity;
      for (var i = 0; i < hotspots.length; i++) {
        var dx = nx - hotspots[i].nx;
        var dy = ny - hotspots[i].ny;
        var d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      if (best >= 0 && bd < 0.04) {
        hotspots.splice(best, 1);
        ensureAtLeastOneHotspot();
        selectedHotspotIdx = Math.min(selectedHotspotIdx, hotspots.length - 1);
      }
    } else {
      if (hotspots.length >= MAX_HOTSPOTS) hotspots.shift();
      hotspots.push({ nx: clamp01(nx), ny: clamp01(ny) });
      selectedHotspotIdx = hotspots.length - 1;
    }
    draw();
    syncLabels();
  });

  canvas.addEventListener('pointercancel', function (ev) {
    var had = dragHotspotIdx >= 0 && dragMoved;
    dragHotspotIdx = -1;
    dragMoved = false;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch (_) {}
    canvas.style.cursor = 'crosshair';
    if (had) {
      draw();
      syncLabels();
    }
  });

  function clearHotspots() {
    hotspots = [cloneHotspot(DEFAULT_HOTSPOT)];
    selectedHotspotIdx = 0;
    draw();
    syncLabels();
  }

  loadParams();
  ensureAtLeastOneHotspot();
  syncLabels();
  draw();

  if (btnDraw) btnDraw.addEventListener('click', draw);
  if (btnRandom) btnRandom.addEventListener('click', randomSeed);
  if (btnClear) btnClear.addEventListener('click', clearHotspots);

  var slideTimer;
  function debouncedDraw() {
    clearTimeout(slideTimer);
    slideTimer = setTimeout(draw, 80);
  }

  [
    colsInput,
    wallInput,
    jitterInput,
    fineInput,
    sigmaInput,
    densityInput,
    macroInput,
    patchInput,
    rimInput,
    organicInput,
  ].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      syncLabels();
      debouncedDraw();
    });
  });

  if (seedInput) seedInput.addEventListener('change', draw);
})();
