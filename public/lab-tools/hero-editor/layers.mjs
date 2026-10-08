/**
 * Hero compositor layers — tissue, networks (edge DLA), flows (vector field).
 */

export var DEFAULT_LAYERS = {
  tissueStyle: 'outline',
  networks: false,
  flows: false,
  networkSeed: 42,
  networkEdgeCoverage: 42,
  networkBranchDepth: 5,
  networkRandomness: 24,
  flowSeed: 7,
  flowParticles: 64,
  flowCurl: 40,
  flowTrailLength: 88,
};

export function mergeLayers(saved) {
  var layers = Object.assign({}, DEFAULT_LAYERS, saved || {});
  if (saved && !saved._generativeLayersV2) {
    layers.networkEdgeCoverage = DEFAULT_LAYERS.networkEdgeCoverage;
    layers.networkBranchDepth = DEFAULT_LAYERS.networkBranchDepth;
    layers.networkRandomness = DEFAULT_LAYERS.networkRandomness;
    layers.flowParticles = DEFAULT_LAYERS.flowParticles;
    layers.flowCurl = DEFAULT_LAYERS.flowCurl;
    layers.flowTrailLength = DEFAULT_LAYERS.flowTrailLength;
    layers._generativeLayersV2 = true;
  }
  return layers;
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

function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(x, y, seed) {
  var n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
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
  var a = hash01(x0, y0, seed);
  var b = hash01(x0 + 1, y0, seed);
  var c = hash01(x0, y0 + 1, seed);
  var d = hash01(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbmScalar(x, y, seed, scale) {
  var v = 0;
  var amp = 1;
  var f = scale || 0.0022;
  var sum = 0;
  for (var o = 0; o < 4; o++) {
    v += amp * valueNoise2D(x * f + o * 13, y * f + o * 7, seed + o * 29);
    sum += amp;
    f *= 2.05;
    amp *= 0.52;
  }
  return v / sum;
}

function fbmAngle(x, y, seed, curl) {
  var eps = 3.5;
  var s = 0.0016 * (0.55 + curl / 70);
  var dx = fbmScalar(x + eps, y, seed, s) - fbmScalar(x - eps, y, seed, s);
  var dy = fbmScalar(x, y + eps, seed, s) - fbmScalar(x, y - eps, seed, s);
  return Math.atan2(dy, dx);
}

function lerpAngle(a, b, t) {
  var d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function polygonCentroid(poly) {
  var x = 0;
  var y = 0;
  for (var i = 0; i < poly.length; i++) {
    x += poly[i][0];
    y += poly[i][1];
  }
  return [x / poly.length, y / poly.length];
}

function polygonArea(poly) {
  var area = 0;
  for (var i = 0; i < poly.length; i++) {
    var j = (i + 1) % poly.length;
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  return Math.abs(area) * 0.5;
}

function boundaryFade(x, y, vb, radius) {
  radius = radius || 120;
  var edgeDist = Math.min(x, y, vb.w - x, vb.h - y);
  return Math.max(0, Math.min(1, edgeDist / radius));
}

function rgba(rgb, alpha) {
  return 'rgba(' + rgb.join(',') + ',' + alpha + ')';
}

function strokeBezier(ctx, x0, y0, cx, cy, x1, y1, rgb, width, alpha) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.strokeStyle = rgba(rgb, alpha);
  ctx.lineWidth = width;
  ctx.stroke();
}

function cellFillRgb(index, base) {
  var h = ((index * 1103515245 + 12345) >>> 16) & 0xffff;
  var v = (h % 41) / 255 - 0.08;
  return [
    clamp255(base[0] * (1 + v * 0.35)),
    clamp255(base[1] * (1 + v * 0.28)),
    clamp255(base[2] * (1 + v * 0.32)),
  ];
}

function drawPolygon(ctx, poly, fill) {
  if (!poly || poly.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function edgeKey(a, b) {
  var ax = Math.round(a[0] * 2);
  var ay = Math.round(a[1] * 2);
  var bx = Math.round(b[0] * 2);
  var by = Math.round(b[1] * 2);
  if (ax < bx || (ax === bx && ay < by)) return ax + ',' + ay + '|' + bx + ',' + by;
  return bx + ',' + by + '|' + ax + ',' + ay;
}

function collectEdges(polyByPath) {
  var edges = [];
  var seen = {};
  Object.keys(polyByPath).forEach(function (key) {
    var poly = polyByPath[key];
    if (!poly || poly.length < 3) return;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i];
      var b = poly[(i + 1) % poly.length];
      var k = edgeKey(a, b);
      if (seen[k]) continue;
      seen[k] = true;
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var len = Math.hypot(dx, dy);
      edges.push({
        x0: a[0], y0: a[1], x1: b[0], y1: b[1],
        mx: (a[0] + b[0]) * 0.5, my: (a[1] + b[1]) * 0.5,
        tx: dx / (len || 1), ty: dy / (len || 1),
        len: len,
      });
    }
  });
  edges.sort(function (a, b) { return b.len - a.len; });
  return edges;
}

function vtxKey(p) {
  return Math.round(p[0] * 0.5) + ',' + Math.round(p[1] * 0.5);
}

function collectGraph(polyByPath) {
  var edgeMap = {};
  var verts = {};

  function getVert(p) {
    var k = vtxKey(p);
    if (!verts[k]) verts[k] = { x: p[0], y: p[1], key: k, edges: [] };
    return verts[k];
  }

  Object.keys(polyByPath).forEach(function (cellKey) {
    var poly = polyByPath[cellKey];
    if (!poly || poly.length < 3) return;
    var centroid = polygonCentroid(poly);
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i];
      var b = poly[(i + 1) % poly.length];
      var k = edgeKey(a, b);
      if (edgeMap[k]) continue;
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var len = Math.hypot(dx, dy);
      var va = getVert(a);
      var vb = getVert(b);
      var edge = {
        key: k,
        x0: a[0], y0: a[1], x1: b[0], y1: b[1],
        mx: (a[0] + b[0]) * 0.5, my: (a[1] + b[1]) * 0.5,
        tx: dx / (len || 1), ty: dy / (len || 1),
        nx: -dy / (len || 1), ny: dx / (len || 1),
        len: len,
        cellKey: cellKey,
        centroid: centroid,
        va: va,
        vb: vb,
      };
      edgeMap[k] = edge;
      va.edges.push(edge);
      vb.edges.push(edge);
    }
  });

  var vertList = Object.keys(verts).map(function (k) {
    var v = verts[k];
    v.degree = v.edges.length;
    return v;
  });

  return { edges: Object.values(edgeMap), verts: vertList };
}

function pickInteriorNormal(edge, rand) {
  var towardCell = Math.atan2(
    edge.centroid[1] - edge.my,
    edge.centroid[0] - edge.mx
  );
  var nAng = Math.atan2(edge.ny, edge.nx);
  var alt = nAng + Math.PI;
  var d0 = Math.abs(Math.atan2(Math.sin(towardCell - nAng), Math.cos(towardCell - nAng)));
  var d1 = Math.abs(Math.atan2(Math.sin(towardCell - alt), Math.cos(towardCell - alt)));
  var ang = d0 < d1 ? nAng : alt;
  ang += (rand() - 0.5) * 0.22;
  return ang;
}

function growBranch(ctx, x0, y0, angle, length, depth, maxDepth, rand, rgbBase, rgbTip, chaos, vb) {
  if (depth > maxDepth || length < 8) return;

  var wobble = (rand() - 0.5) * length * (0.08 + chaos * 0.12);
  var cx = x0 + Math.cos(angle) * length * 0.42 + Math.cos(angle + Math.PI / 2) * wobble;
  var cy = y0 + Math.sin(angle) * length * 0.42 + Math.sin(angle + Math.PI / 2) * wobble;
  var x1 = x0 + Math.cos(angle) * length + Math.cos(angle + Math.PI / 2) * wobble * 0.4;
  var y1 = y0 + Math.sin(angle) * length + Math.sin(angle + Math.PI / 2) * wobble * 0.4;

  if (x1 < -40 || x1 > vb.w + 40 || y1 < -40 || y1 > vb.h + 40) return;

  var t = depth / Math.max(1, maxDepth);
  var rgb = mixRgb(rgbBase, rgbTip, 0.25 + t * 0.55);
  var alpha = (0.34 - t * 0.14) * boundaryFade(x1, y1, vb, 100);
  var width = Math.max(0.35, 1.15 - depth * 0.18);
  strokeBezier(ctx, x0, y0, cx, cy, x1, y1, rgb, width, alpha);

  if (depth < maxDepth && rand() < 0.42 - chaos * 0.12) {
    var forkAng = angle + (rand() < 0.5 ? 1 : -1) * (0.35 + rand() * 0.45);
    growBranch(ctx, x1, y1, forkAng, length * (0.45 + rand() * 0.2), depth + 1, maxDepth, rand, rgbBase, rgbTip, chaos, vb);
  }
}

function buildCellIndex(polyByPath) {
  var cells = [];
  Object.keys(polyByPath).forEach(function (key) {
    var poly = polyByPath[key];
    if (!poly || poly.length < 3) return;
    var area = polygonArea(poly);
    var c = polygonCentroid(poly);
    cells.push({ key: key, poly: poly, cx: c[0], cy: c[1], area: area });
  });
  cells.sort(function (a, b) { return b.area - a.area; });
  var medianArea = cells.length ? cells[Math.floor(cells.length / 2)].area : 1;
  return { cells: cells, medianArea: medianArea };
}

function nearestCell(x, y, cells) {
  var best = null;
  var bestD = Infinity;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var dx = c.cx - x;
    var dy = c.cy - y;
    var d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function nearestEdge(x, y, edges, maxDist) {
  var best = null;
  var bestD = maxDist;
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    var t = Math.max(0, Math.min(1,
      ((x - e.x0) * (e.x1 - e.x0) + (y - e.y0) * (e.y1 - e.y0)) / ((e.len * e.len) || 1)
    ));
    var px = e.x0 + (e.x1 - e.x0) * t;
    var py = e.y0 + (e.y1 - e.y0) * t;
    var d = Math.hypot(x - px, y - py);
    if (d < bestD) {
      bestD = d;
      best = { edge: e, dist: d, t: t };
    }
  }
  return best;
}

function flowAngleAt(x, y, flowCtx) {
  var curl = flowCtx.curl;
  var angle = fbmAngle(x, y, flowCtx.seed, curl);

  var cell = nearestCell(x, y, flowCtx.cells);
  if (cell) {
    var rel = cell.area / flowCtx.medianArea;
    if (rel > 1.15) {
      var toCenter = Math.atan2(cell.cy - y, cell.cx - x);
      var circulation = toCenter + Math.PI / 2;
      var pool = Math.min(0.42, 0.14 + (rel - 1) * 0.12);
      angle = lerpAngle(angle, circulation, pool * (curl / 55));
    } else if (rel < 0.72) {
      var outward = Math.atan2(y - cell.cy, x - cell.cx);
      angle = lerpAngle(angle, outward, 0.18);
    }
  }

  var near = nearestEdge(x, y, flowCtx.edges, 56);
  if (near) {
    var channel = Math.atan2(near.edge.ty, near.edge.tx);
    var w = (1 - near.dist / 56) * 0.38;
    angle = lerpAngle(angle, channel, w);
  }

  return angle;
}

function traceStreamline(x, y, steps, flowCtx, vb) {
  var pts = [[x, y]];
  var stepLen = 5.5 + (flowCtx.trailScale || 1) * 2.2;
  for (var s = 0; s < steps; s++) {
    var a0 = flowAngleAt(x, y, flowCtx);
    var a1 = flowAngleAt(x + Math.cos(a0) * stepLen, y + Math.sin(a0) * stepLen, flowCtx);
    var angle = lerpAngle(a0, a1, 0.5);
    x += Math.cos(angle) * stepLen;
    y += Math.sin(angle) * stepLen;
    if (x < -20 || x > vb.w + 20 || y < -20 || y > vb.h + 20) break;
    pts.push([x, y]);
  }
  return pts;
}

function drawStreamline(ctx, pts, rgbLight, rgbWarm, vb) {
  if (pts.length < 3) return;
  var total = pts.length - 1;
  for (var i = 1; i < pts.length; i++) {
    var t = i / total;
    var bell = Math.sin(t * Math.PI);
    var fade = boundaryFade(pts[i][0], pts[i][1], vb, 130);
    var alpha = (0.04 + bell * 0.22) * fade;
    var rgb = mixRgb(rgbLight, rgbWarm, Math.pow(t, 0.85));
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = rgba(rgb, alpha);
    ctx.lineWidth = 0.45 + bell * 1.1;
    ctx.stroke();
  }
}

function drawTissueFilled(ctx, polyByPath, vb) {
  var tissueLight = cssRgb('--pillar-tissue-light', '#DDF48A');
  var paperBg = cssRgb('--paper-100', '#F7F5F0');
  ctx.fillStyle = rgbCss(paperBg);
  ctx.fillRect(0, 0, vb.w, vb.h);

  var keys = Object.keys(polyByPath).sort();
  for (var ki = 0; ki < keys.length; ki++) {
    var poly = polyByPath[keys[ki]];
    var depth = keys[ki].split('/').length;
    var fill = cellFillRgb(ki, tissueLight);
    if (depth > 1) fill = mixRgb(fill, tissueLight, 0.12 * (depth - 1));
    drawPolygon(ctx, poly, rgbCss(fill));
  }
}

function drawNetworks(ctx, polyByPath, layers, vb) {
  var neuralLight = cssRgb('--pillar-neural-light', '#B8F4ED');
  var neuralMid = cssRgb('--pillar-neural-mid', '#426EAF');
  var neuralDark = cssRgb('--pillar-neural-dark', '#184B7A');
  var graph = collectGraph(polyByPath);
  var edges = graph.edges;
  if (!edges.length) return;

  var rand = mulberry32((layers.networkSeed | 0) || 42);
  var coverage = Math.max(0.18, Math.min(0.72, (layers.networkEdgeCoverage || 42) / 100));
  var depthMax = Math.max(2, Math.min(8, Math.round(layers.networkBranchDepth || 5)));
  var chaos = Math.max(0, Math.min(1, (layers.networkRandomness || 24) / 100));

  var sorted = edges.slice().sort(function (a, b) { return b.len - a.len; });
  var target = Math.max(6, Math.floor(edges.length * coverage));
  var active = [];
  for (var i = 0; i < sorted.length && active.length < target; i++) {
    if (i < target * 0.55 || rand() > 0.28) active.push(sorted[i]);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  for (var ei = 0; ei < active.length; ei++) {
    var e = active[ei];
    var spineFade = boundaryFade(e.mx, e.my, vb, 110);
    ctx.beginPath();
    ctx.moveTo(e.x0, e.y0);
    ctx.lineTo(e.x1, e.y1);
    ctx.strokeStyle = rgba(mixRgb(neuralLight, neuralMid, 0.35), 0.1 * spineFade);
    ctx.lineWidth = 0.55;
    ctx.stroke();

    var junctions = [e.va, e.vb];
    for (var ji = 0; ji < junctions.length; ji++) {
      var v = junctions[ji];
      if (v.degree < 2 && rand() > 0.35) continue;

      var branchCount = v.degree >= 3 ? 2 : 1;
      for (var bi = 0; bi < branchCount; bi++) {
        var ang = pickInteriorNormal(e, rand);
        if (bi === 1) ang += (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.35);
        var reach = Math.min(e.len * (0.28 + rand() * 0.22), 95 + rand() * 40);
        reach *= 1 + chaos * 0.15;
        growBranch(
          ctx, v.x, v.y, ang, reach, 1, depthMax, rand,
          mixRgb(neuralLight, neuralMid, 0.2),
          mixRgb(neuralMid, neuralDark, 0.55),
          chaos, vb
        );
      }
    }

    if (rand() < 0.55 + chaos * 0.15) {
      var t = 0.32 + rand() * 0.36;
      var sx = e.x0 + (e.x1 - e.x0) * t;
      var sy = e.y0 + (e.y1 - e.y0) * t;
      var sideAng = pickInteriorNormal(e, rand) + (rand() - 0.5) * 0.5;
      growBranch(
        ctx, sx, sy, sideAng, e.len * (0.16 + rand() * 0.12), 2, depthMax, rand,
        mixRgb(neuralMid, neuralDark, 0.15),
        neuralDark,
        chaos * 0.7, vb
      );
    }
  }

  var hubs = graph.verts.filter(function (v) { return v.degree >= 3; });
  hubs.sort(function (a, b) { return b.degree - a.degree; });
  for (var hi = 0; hi < Math.min(8, hubs.length); hi++) {
    if (rand() > 0.62) continue;
    var hub = hubs[hi];
    for (var he = 0; he < hub.edges.length && he < 3; he++) {
      var edge = hub.edges[he];
      var hubAng = pickInteriorNormal(edge, rand);
      growBranch(
        ctx, hub.x, hub.y, hubAng, 55 + rand() * 45, 1, depthMax - 1, rand,
        neuralMid, neuralDark, chaos * 0.5, vb
      );
    }
  }

  ctx.restore();
}

function drawFlows(ctx, polyByPath, layers, vb) {
  var flowLight = cssRgb('--pillar-flow-light', '#FFDD80');
  var flowMid = cssRgb('--pillar-flow-mid', '#E58961');
  var flowDark = cssRgb('--pillar-flow-dark', '#613400');
  var flowWarm = mixRgb(flowMid, flowDark, 0.35);
  var cellIndex = buildCellIndex(polyByPath);
  var edges = collectEdges(polyByPath);
  var rand = mulberry32((layers.flowSeed | 0) || 7);
  var curl = layers.flowCurl || 40;
  var streamCount = Math.max(18, Math.min(96, Math.round((layers.flowParticles || 64) * 0.85)));
  var steps = Math.max(24, Math.min(140, Math.round((layers.flowTrailLength || 88) * 0.9)));

  var flowCtx = {
    seed: (layers.flowSeed | 0) || 7,
    curl: curl,
    cells: cellIndex.cells,
    medianArea: cellIndex.medianArea,
    edges: edges,
    trailScale: steps / 80,
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  var cols = Math.ceil(Math.sqrt(streamCount * (vb.w / vb.h)));
  var rows = Math.ceil(streamCount / cols);
  var used = 0;
  for (var row = 0; row < rows && used < streamCount; row++) {
    for (var col = 0; col < cols && used < streamCount; col++) {
      var x = ((col + 0.5) / cols) * vb.w + (rand() - 0.5) * (vb.w / cols) * 0.65;
      var y = ((row + 0.5) / rows) * vb.h + (rand() - 0.5) * (vb.h / rows) * 0.65;
      if (boundaryFade(x, y, vb, 90) < 0.12) continue;
      if (rand() < 0.08) continue;
      var pts = traceStreamline(x, y, steps, flowCtx, vb);
      drawStreamline(ctx, pts, flowLight, flowWarm, vb);
      used++;
    }
  }

  for (var si = 0; si < Math.floor(streamCount * 0.22); si++) {
    var cx = rand() * vb.w;
    var cy = rand() * vb.h;
    if (boundaryFade(cx, cy, vb, 100) < 0.2) continue;
    var cell = nearestCell(cx, cy, cellIndex.cells);
    if (!cell || cell.area < cellIndex.medianArea * 0.9) continue;
    var orbit = traceStreamline(
      cell.cx + (rand() - 0.5) * 30,
      cell.cy + (rand() - 0.5) * 30,
      Math.floor(steps * 0.55),
      flowCtx,
      vb
    );
    drawStreamline(ctx, orbit, mixRgb(flowLight, flowMid, 0.25), flowMid, vb);
  }

  ctx.restore();
}

export function renderCanvasLayers(ctx, vb, polyByPath, layers) {
  ctx.clearRect(0, 0, vb.w, vb.h);
  var showCanvas = layers.tissueStyle === 'filled' || layers.networks || layers.flows;
  if (!showCanvas) return false;

  if (layers.tissueStyle === 'filled') drawTissueFilled(ctx, polyByPath, vb);
  if (layers.flows) drawFlows(ctx, polyByPath, layers, vb);
  if (layers.networks) drawNetworks(ctx, polyByPath, layers, vb);
  return true;
}

export function exportGenerativePng(vb, polyByPath, layers, svgClone, scale) {
  scale = scale || 2;
  var canvas = document.createElement('canvas');
  canvas.width = vb.w * scale;
  canvas.height = vb.h * scale;
  var ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas unsupported'));

  ctx.scale(scale, scale);
  renderCanvasLayers(ctx, vb, polyByPath, layers);

  return new Promise(function (resolve, reject) {
    var svgData = new XMLSerializer().serializeToString(svgClone);
    var blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      ctx.drawImage(img, 0, 0, vb.w, vb.h);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('PNG export failed'));
      }, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('PNG export failed'));
      }, 'image/png');
    };
    img.src = url;
  });
}

export function downloadBlob(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 2000);
}
