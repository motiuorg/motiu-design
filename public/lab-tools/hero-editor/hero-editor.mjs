/**
 * Hero generative editor — shared compositor for tissue, networks, flows.
 */
import { Delaunay } from 'https://cdn.jsdelivr.net/npm/d3-delaunay@6/+esm';
import {
  DEFAULT_LAYERS,
  mergeLayers,
  renderCanvasLayers,
  exportGenerativePng,
  downloadBlob,
} from './layers.mjs';
import { HERO_VORONOI_DEFAULT } from './hero-default-preset.mjs';

export function initHeroEditor(userOptions) {
  var options = Object.assign({
    mode: 'index',
    storageKey: 'refi-voronoi-experiment-2026-06-04',
    sectionCollapseKey: 'refi-voronoi-section-collapsed-2026-06-04',
    panelPosKey: 'refi-voronoi-panel-pos-2026-06-04',
    startExpanded: false,
    autoEdit: false
  }, userOptions || {});

var STORAGE_KEY = options.storageKey;
var SECTION_COLLAPSE_KEY = options.sectionCollapseKey;
var MAX_SUB_DEPTH = 4;
var DEFAULT_SECTION_COLLAPSED = { tissueNesting: true };
var DEFAULT_STROKE_WIDTH = HERO_VORONOI_DEFAULT.strokeWidth;
var VB = { w: 1600, h: 1100 };
var CENTER = { x: VB.w / 2, y: VB.h / 2 };
var DEFAULT_SITES = HERO_VORONOI_DEFAULT.sites;

/** Extend past the viewBox so clip edges sit off-screen. */
var VORONOI_PAD = { x: 450, y: 450 };

function getParentVoronoiBounds() {
  return [
    -VORONOI_PAD.x,
    -VORONOI_PAD.y,
    VB.w + VORONOI_PAD.x,
    VB.h + VORONOI_PAD.y
  ];
}
var DEFAULT_TRANSFORM = Object.assign({}, HERO_VORONOI_DEFAULT.transform);

var openingEl = document.querySelector('.opening-voronoi');
var illustrationEl = document.querySelector('.opening-voronoi__illustration');
var svg = document.querySelector('[data-voronoi-svg]');
var cellsEl = document.querySelector('[data-voronoi-cells]');
var handlesEl = document.querySelector('[data-voronoi-handles]');
var subHandlesEl = document.querySelector('[data-voronoi-sub-handles]');
var layerCanvas = document.querySelector('[data-hero-canvas]');
var editor = document.querySelector('[data-voronoi-editor]');
if (!openingEl || !illustrationEl || !svg || !cellsEl || !handlesEl || !subHandlesEl || !editor) {
  throw new Error('Voronoi editor markup missing');
}

var statusEl = editor.querySelector('[data-voronoi-status]');
var editBtn = editor.querySelector('[data-voronoi-edit-toggle]');
var panelToggle = editor.querySelector('[data-voronoi-panel-toggle]');
var panelDrag = editor.querySelector('[data-voronoi-panel-drag]');
var editingBadge = editor.querySelector('[data-voronoi-editing-badge]');
var PANEL_POS_KEY = options.panelPosKey;
var panelPos = null;
var draggingPanel = false;
var panelDragOffset = { x: 0, y: 0 };
var subSelectionEl = editor.querySelector('[data-voronoi-sub-selection]');
var subCornerInput = editor.querySelector('[data-voronoi-sub-corner]');
var subStrokeInput = editor.querySelector('[data-voronoi-sub-stroke]');
var subCornerOut = editor.querySelector('[data-voronoi-sub-corner-out]');
var subStrokeOut = editor.querySelector('[data-voronoi-sub-stroke-out]');
var subToggleBtn = editor.querySelector('[data-voronoi-sub-toggle]');
var subUpBtn = editor.querySelector('[data-voronoi-sub-up]');
var protectToggle = editor.querySelector('[data-voronoi-protect-toggle]');
var protectStatusEl = editor.querySelector('[data-voronoi-protect-status]');
var protectOverlayEl = document.querySelector('[data-voronoi-protect-overlay]');

var sliderBindings = [
  ['cornerRadius', '[data-voronoi-corner]', '[data-voronoi-corner-out]', function (v) { return v; }],
  ['strokeWidth', '[data-voronoi-stroke]', '[data-voronoi-stroke-out]', function (v) { return v; }],
  ['scale', '[data-voronoi-scale]', '[data-voronoi-scale-out]', function (v) { return Number(v).toFixed(2); }],
  ['stretchX', '[data-voronoi-stretch-x]', '[data-voronoi-stretch-x-out]', function (v) { return Number(v).toFixed(2); }],
  ['stretchY', '[data-voronoi-stretch-y]', '[data-voronoi-stretch-y-out]', function (v) { return Number(v).toFixed(2); }],
  ['rotation', '[data-voronoi-rotation]', '[data-voronoi-rotation-out]', function (v) { return v; }],
  ['offsetX', '[data-voronoi-offset-x]', '[data-voronoi-offset-x-out]', function (v) { return v; }],
  ['offsetY', '[data-voronoi-offset-y]', '[data-voronoi-offset-y-out]', function (v) { return v; }]
];

var transformKeys = ['scale', 'stretchX', 'stretchY', 'rotation', 'offsetX', 'offsetY'];

var state = loadState();
var editing = false;
var dragIndex = -1;
var dragPathKey = '';
var dragSiteIndex = -1;
var selectedPath = normalizeSelectedPath(state.selectedPath, state.selectedCellIndex);
var parentPolys = [];
var polyByPath = {};

function defaultState() {
  var d = HERO_VORONOI_DEFAULT;
  return {
    sites: d.sites.map(function (p) { return p.slice(); }),
    cornerRadius: d.cornerRadius,
    strokeWidth: d.strokeWidth,
    transform: Object.assign({}, d.transform),
    subCells: JSON.parse(JSON.stringify(d.subCells)),
    subDismissed: {},
    seedSubDefaults: d.seedSubDefaults,
    subDefaultCells: d.subDefaultCells.slice(),
    protectContent: false,
    selectedPath: null,
    layers: mergeLayers(DEFAULT_LAYERS)
  };
}

function applyVoronoiColors() {
  openingEl.style.setProperty('--voronoi-edge-stroke', 'var(--paper-200)');
}

function countSitesInViewBox(sites) {
  return sites.filter(function (p) {
    return p[0] >= 0 && p[0] <= VB.w && p[1] >= 0 && p[1] <= VB.h;
  }).length;
}

function migrateSitesInView(saved) {
  if (saved._sitesInViewV4) return;
  if (countSitesInViewBox(saved.sites) < Math.min(6, saved.sites.length)) {
    saved.sites = DEFAULT_SITES.map(function (p) { return p.slice(); });
  }
  saved._sitesInViewV4 = true;
}

function pathKey(path) {
  if (!path || !path.length) return '';
  return path.join('/');
}

function parsePathKey(key) {
  if (!key) return [];
  return key.split('/').map(function (n) { return Number(n); });
}

function pathsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parentPath(path) {
  if (!path || !path.length) return null;
  return path.slice(0, -1);
}

function pathDepth(path) {
  return path && path.length ? path.length : 0;
}

function normalizeSubNode(node) {
  if (!node) return null;
  if (!node.children) node.children = {};
  return node;
}

function migrateSubNode(node) {
  if (!node) return;
  normalizeSubNode(node);
  Object.keys(node.children).forEach(function (k) {
    migrateSubNode(node.children[k]);
  });
}

function applyStrokeWidthToNode(node, width) {
  if (!node) return;
  node.strokeWidth = width;
  if (!node.children) return;
  Object.keys(node.children).forEach(function (k) {
    applyStrokeWidthToNode(node.children[k], width);
  });
}

function applyStrokeWidthToSubCells(subCells, width) {
  Object.keys(subCells || {}).forEach(function (k) {
    applyStrokeWidthToNode(subCells[k], width);
  });
}

function migrateSubCellsTree(subCells) {
  Object.keys(subCells || {}).forEach(function (k) {
    migrateSubNode(subCells[k]);
  });
}

function normalizeSelectedPath(selectedPath, selectedCellIndex) {
  if (Array.isArray(selectedPath) && selectedPath.length) return selectedPath.slice();
  if (selectedCellIndex != null && !isNaN(selectedCellIndex)) return [selectedCellIndex];
  return null;
}

function loadState() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.sites) && saved.sites.length >= 3) {
      saved.transform = Object.assign({}, DEFAULT_TRANSFORM, saved.transform || {});
      saved.subCells = saved.subCells || {};
      saved.subDismissed = saved.subDismissed || {};
      if (saved.seedSubDefaults == null) saved.seedSubDefaults = false;
      if (!saved.subDefaultCells) saved.subDefaultCells = [0, 1];
      if (!saved._subVoronoiMigrated) {
        saved.seedSubDefaults = true;
        saved.subDefaultCells = [0, 1];
        saved._subVoronoiMigrated = true;
      }
      migrateSubCellsTree(saved.subCells);
      if (!saved._subVoronoiTreeMigrated) {
        saved.selectedPath = normalizeSelectedPath(saved.selectedPath, saved.selectedCellIndex);
        delete saved.selectedCellIndex;
        saved._subVoronoiTreeMigrated = true;
      }
      migrateSitesInView(saved);
      if (!saved._heroGeometryDefaultV5) {
        var geom = defaultState();
        saved.sites = geom.sites;
        saved.cornerRadius = geom.cornerRadius;
        saved.strokeWidth = geom.strokeWidth;
        saved.transform = geom.transform;
        saved.subCells = geom.subCells;
        saved.seedSubDefaults = geom.seedSubDefaults;
        saved.subDefaultCells = geom.subDefaultCells;
        saved._heroGeometryDefaultV5 = true;
      }
      delete saved.edgeColorKey;
      delete saved.editColorKey;
      saved.layers = mergeLayers(saved.layers);
      if (!saved._strokeWidthSetTo4) {
        saved.strokeWidth = DEFAULT_STROKE_WIDTH;
        applyStrokeWidthToSubCells(saved.subCells, DEFAULT_STROKE_WIDTH);
        saved._strokeWidthSetTo4 = true;
      }
      return saved;
    }
  } catch (e) {}
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getTransform() {
  return Object.assign({}, DEFAULT_TRANSFORM, state.transform || {});
}

function transformPoint(x, y, t) {
  var dx = (x - CENTER.x) * t.scale * t.stretchX;
  var dy = (y - CENTER.y) * t.scale * t.stretchY;
  var rad = t.rotation * Math.PI / 180;
  var cos = Math.cos(rad);
  var sin = Math.sin(rad);
  return [
    CENTER.x + dx * cos - dy * sin + t.offsetX,
    CENTER.y + dx * sin + dy * cos + t.offsetY
  ];
}

function inverseTransformPoint(x, y, t) {
  var dx = x - CENTER.x - t.offsetX;
  var dy = y - CENTER.y - t.offsetY;
  var rad = -t.rotation * Math.PI / 180;
  var cos = Math.cos(rad);
  var sin = Math.sin(rad);
  var rx = dx * cos - dy * sin;
  var ry = dx * sin + dy * cos;
  var scaleX = t.scale * t.stretchX || 1;
  var scaleY = t.scale * t.stretchY || 1;
  return [CENTER.x + rx / scaleX, CENTER.y + ry / scaleY];
}

function getEffectiveSites() {
  var t = getTransform();
  return state.sites.map(function (p) {
    return transformPoint(p[0], p[1], t);
  });
}

function polygonCentroid(points) {
  var x = 0;
  var y = 0;
  for (var i = 0; i < points.length; i++) {
    x += points[i][0];
    y += points[i][1];
  }
  return [x / points.length, y / points.length];
}

function polygonBBox(points) {
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;
  for (var i = 0; i < points.length; i++) {
    minX = Math.min(minX, points[i][0]);
    minY = Math.min(minY, points[i][1]);
    maxX = Math.max(maxX, points[i][0]);
    maxY = Math.max(maxY, points[i][1]);
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Content-protection prototype — pins the nearest site to each named DOM
 * region's centroid, then nudges every other site until no Voronoi cell
 * edge can cross that region. See discussion in the hero-voronoi containment
 * design session (2026-08-07): the goal is "always fully inside one cell"
 * for the logo, nav links, hero copy, and approach copy, while the rest of
 * the diagram stays free to move. This block is prototype-only — nothing in
 * production HeroVoronoi.astro depends on it yet.
 */
// Selectors are the *text content*, not the layout wrapper — #approach
// itself is a full-width block (max-width: container-xl, padding) so its
// box would span most of the viewport even though the actual copy only
// occupies a narrow left-aligned column. Protecting text elements directly
// keeps the region fit to what's actually on screen.
var PROTECTED_REGIONS_DEF = [
  { id: 'logo', label: 'Logo', selectors: ['.nav__brand'] },
  { id: 'nav', label: 'Nav', selectors: ['.nav__links'] },
  { id: 'hero', label: 'Hero', selectors: ['.hero__content'] },
  { id: 'approach', label: 'Approach', selectors: ['#approach'] },
];

function rectCorners(domRect) {
  return [
    [domRect.left, domRect.top],
    [domRect.right, domRect.top],
    [domRect.right, domRect.bottom],
    [domRect.left, domRect.bottom],
  ];
}

/** A block element's layout box (getBoundingClientRect) fills its container
 * up to any max-width it has — for a plain <h2>/<p> with no max-width of its
 * own (e.g. .section-block__title) that box can be far wider than the text
 * actually rendered. selectNodeContents(el) + getClientRects() mostly fixes
 * that (per-line rects instead of the box), but when `el` itself contains
 * block-level children, Blink can also throw in one phantom full-width rect
 * for the child's own block box alongside its real line-box rects — so we
 * walk to individual text nodes and range over each one directly, which
 * only ever reports actual glyph-line rects. */
function collectInkRects(el) {
  var rects = [];
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      return /\S/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  var node;
  while ((node = walker.nextNode())) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var nodeRects = range.getClientRects();
    for (var i = 0; i < nodeRects.length; i++) rects.push(nodeRects[i]);
  }
  return rects;
}

function measureInkRect(el) {
  var rects = collectInkRects(el);
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (!r.width || !r.height) continue;
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right);
    maxY = Math.max(maxY, r.bottom);
  }
  if (minX === Infinity) return el.getBoundingClientRect();
  return { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX, height: maxY - minY };
}

/** Measure the protected DOM elements and map their corners into SVG-local
 * (viewBox) space via the SVG's own screen transform — this is what keeps
 * the containment correct at any viewport width without hand-tuned numbers.
 * A region can span several elements (e.g. a heading + a paragraph); their
 * corners are pooled into one bounding box. */
function measureProtectedRegions() {
  var regions = [];
  PROTECTED_REGIONS_DEF.forEach(function (def) {
    var corners = [];
    def.selectors.forEach(function (selector) {
      var el = document.querySelector(selector);
      if (!el) return;
      var domRect = measureInkRect(el);
      if (!domRect.width || !domRect.height) return;
      corners = corners.concat(rectCorners(domRect).map(function (p) { return clientToSvg(p[0], p[1]); }));
    });
    if (!corners.length) return;
    var box = polygonBBox(corners);
    regions.push({
      id: def.id,
      label: def.label,
      corners: corners,
      bbox: box,
      center: [box.minX + box.w / 2, box.minY + box.h / 2],
      violated: false,
    });
  });
  return regions;
}

/** Negative = `corner` is on `anchor`'s side of the anchor/other perpendicular bisector. */
function bisectorSideScore(corner, anchor, other) {
  var mx = (anchor[0] + other[0]) / 2;
  var my = (anchor[1] + other[1]) / 2;
  var nx = other[0] - anchor[0];
  var ny = other[1] - anchor[1];
  return (corner[0] - mx) * nx + (corner[1] - my) * ny;
}

function regionClearsSite(region, anchor, other, margin) {
  for (var i = 0; i < region.corners.length; i++) {
    if (bisectorSideScore(region.corners[i], anchor, other) > -margin) return false;
  }
  return true;
}

/**
 * Returns a clone of `sites` with one site per region snapped to that
 * region's centroid, and every non-anchor site pushed clear of any bisector
 * that would otherwise cut into a protected rect. Never moves an anchor —
 * two protected regions whose fixed centroids can't be separated by a
 * straight bisector (e.g. they overlap, or aren't stacked/side-by-side) show
 * up as a `violated` region afterward instead of being silently "fixed."
 */
function applyContentProtection(sites, regions) {
  var result = sites.map(function (p) { return p.slice(); });
  var margin = 8;
  var claimed = {};
  var anchors = regions.map(function (region) {
    var best = -1;
    var bestDist = Infinity;
    for (var i = 0; i < result.length; i++) {
      if (claimed[i]) continue;
      var dx = result[i][0] - region.center[0];
      var dy = result[i][1] - region.center[1];
      var d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best < 0) return null;
    claimed[best] = true;
    result[best] = region.center.slice();
    return { siteIndex: best, region: region };
  }).filter(Boolean);

  var anchorIndexSet = {};
  anchors.forEach(function (a) { anchorIndexSet[a.siteIndex] = true; });

  var maxIter = 60;
  for (var iter = 0; iter < maxIter; iter++) {
    var moved = false;
    for (var ai = 0; ai < anchors.length; ai++) {
      var anchorIdx = anchors[ai].siteIndex;
      var anchor = result[anchorIdx];
      var region = anchors[ai].region;
      for (var si = 0; si < result.length; si++) {
        if (si === anchorIdx || anchorIndexSet[si]) continue;
        var other = result[si];
        if (regionClearsSite(region, anchor, other, margin)) continue;
        var dx = other[0] - region.center[0];
        var dy = other[1] - region.center[1];
        var len = Math.hypot(dx, dy) || 1;
        result[si] = [other[0] + (dx / len) * 16, other[1] + (dy / len) * 16];
        moved = true;
      }
    }
    if (!moved) break;
  }

  anchors.forEach(function (a) {
    var anchor = result[a.siteIndex];
    var clear = true;
    for (var si = 0; si < result.length; si++) {
      if (si === a.siteIndex) continue;
      if (!regionClearsSite(a.region, anchor, result[si], margin)) { clear = false; break; }
    }
    a.region.violated = !clear;
  });

  return { sites: result, regions: regions };
}

function renderProtectionOverlay(regions) {
  if (!protectOverlayEl) return;
  protectOverlayEl.innerHTML = '';
  regions.forEach(function (region) {
    var rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectEl.setAttribute('x', String(region.bbox.minX));
    rectEl.setAttribute('y', String(region.bbox.minY));
    rectEl.setAttribute('width', String(region.bbox.w));
    rectEl.setAttribute('height', String(region.bbox.h));
    rectEl.setAttribute('class', 'voronoi-protect-rect' + (region.violated ? ' is-violated' : ' is-clear'));
    protectOverlayEl.appendChild(rectEl);
  });
}

function updateProtectionStatus(regions) {
  if (!protectStatusEl) return;
  if (!state.protectContent) { protectStatusEl.textContent = ''; return; }
  if (!regions.length) { protectStatusEl.textContent = 'No protected elements found on this page.'; return; }
  var anyViolated = regions.some(function (r) { return r.violated; });
  protectStatusEl.textContent = regions.map(function (r) { return r.label + (r.violated ? ' ✗' : ' ✓'); }).join('  ·  ');
  protectStatusEl.classList.toggle('is-violated', anyViolated);
}

function createDefaultSubSites(poly) {
  var c = polygonCentroid(poly);
  var box = polygonBBox(poly);
  var padX = box.w * 0.22;
  var padY = box.h * 0.22;
  return [
    [c[0], c[1]],
    [box.minX + padX, box.minY + padY],
    [box.maxX - padX, box.minY + padY * 1.2],
    [box.minX + padX * 1.1, box.maxY - padY],
    [box.maxX - padX * 0.9, box.maxY - padY * 0.8]
  ];
}

function defaultSubConfig(poly) {
  return {
    enabled: true,
    sites: createDefaultSubSites(poly),
    cornerRadius: 20,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    children: {}
  };
}

function getSubNode(path) {
  if (!path || !path.length) return null;
  if (!state.subCells) state.subCells = {};
  var node = state.subCells[String(path[0])];
  if (!node) return null;
  normalizeSubNode(node);
  for (var i = 1; i < path.length; i++) {
    if (!node.children) return null;
    node = node.children[String(path[i])];
    if (!node) return null;
    normalizeSubNode(node);
  }
  return node;
}

function hasActiveSub(path) {
  var sub = getSubNode(path);
  return !!(sub && sub.enabled !== false && sub.sites && sub.sites.length >= 3);
}

function isSubDismissed(path) {
  if (!state.subDismissed) state.subDismissed = {};
  return !!state.subDismissed[pathKey(path)];
}

function setSubNode(path, config) {
  if (!path || !path.length) return;
  if (!state.subCells) state.subCells = {};
  if (path.length === 1) {
    var rootKey = String(path[0]);
    if (config) state.subCells[rootKey] = normalizeSubNode(config);
    else delete state.subCells[rootKey];
    return;
  }
  var parent = getSubNode(path.slice(0, -1));
  if (!parent) return;
  if (!parent.children) parent.children = {};
  var key = String(path[path.length - 1]);
  if (config) parent.children[key] = normalizeSubNode(config);
  else delete parent.children[key];
}

function dismissSub(path) {
  if (!state.subDismissed) state.subDismissed = {};
  state.subDismissed[pathKey(path)] = true;
  setSubNode(path, null);
  state.seedSubDefaults = false;
}

function allowSub(path) {
  if (!state.subDismissed) state.subDismissed = {};
  delete state.subDismissed[pathKey(path)];
}

function getPolyForPath(path) {
  if (!path || !path.length) return null;
  return polyByPath[pathKey(path)] || null;
}

function formatPathBreadcrumb(path) {
  if (!path || !path.length) return '';
  var parts = ['Cell ' + path[0]];
  for (var i = 1; i < path.length; i++) {
    parts.push('sub ' + path[i]);
  }
  return parts.join(' → ');
}

function ensureSubDefaults(parentIndex, poly) {
  var path = [parentIndex];
  if (!state.seedSubDefaults) return;
  if (isSubDismissed(path)) return;
  if (!state.subDefaultCells || state.subDefaultCells.indexOf(parentIndex) < 0) return;
  if (hasActiveSub(path)) return;
  setSubNode(path, defaultSubConfig(poly));
}

function finishSubDefaultSeeding() {
  if (!state.seedSubDefaults) return;
  state.seedSubDefaults = false;
}

function roundPolygonPath(points, radius) {
  var n = points.length;
  if (n < 3 || radius <= 0) {
    return 'M' + points.map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + ' Z';
  }
  var d = '';
  for (var i = 0; i < n; i++) {
    var prev = points[(i - 1 + n) % n];
    var curr = points[i];
    var next = points[(i + 1) % n];
    var v1x = curr[0] - prev[0];
    var v1y = curr[1] - prev[1];
    var v2x = next[0] - curr[0];
    var v2y = next[1] - curr[1];
    var len1 = Math.hypot(v1x, v1y) || 1;
    var len2 = Math.hypot(v2x, v2y) || 1;
    var r = Math.min(radius, len1 * 0.45, len2 * 0.45);
    var p1x = curr[0] - (v1x / len1) * r;
    var p1y = curr[1] - (v1y / len1) * r;
    var p2x = curr[0] + (v2x / len2) * r;
    var p2y = curr[1] + (v2y / len2) * r;
    if (i === 0) d += 'M' + p1x + ',' + p1y;
    else d += ' L' + p1x + ',' + p1y;
    d += ' Q' + curr[0] + ',' + curr[1] + ' ' + p2x + ',' + p2y;
  }
  return d + ' Z';
}

function clientToSvg(clientX, clientY) {
  var pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  var ctm = svg.getScreenCTM();
  if (!ctm) return [0, 0];
  var local = pt.matrixTransform(ctm.inverse());
  return [local.x, local.y];
}

var HANDLE_HIT_RADIUS = 28;

function nearestHandleIndex(svgPt) {
  var effectiveSites = getEffectiveSites();
  var best = -1;
  var bestDist = HANDLE_HIT_RADIUS;
  for (var i = 0; i < effectiveSites.length; i++) {
    var dx = effectiveSites[i][0] - svgPt[0];
    var dy = effectiveSites[i][1] - svgPt[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function startHandleDrag(index) {
  dragIndex = index;
  var handle = handlesEl.querySelector('[data-index="' + index + '"]');
  if (handle) handle.classList.add('is-dragging');
  startWindowDrag();
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || '';
}

function syncControls() {
  sliderBindings.forEach(function (binding) {
    var key = binding[0];
    var input = editor.querySelector(binding[1]);
    var output = editor.querySelector(binding[2]);
    var formatter = binding[3];
    var value = transformKeys.indexOf(key) >= 0 ? getTransform()[key] : state[key];
    if (input) input.value = String(value);
    if (output) output.textContent = formatter(value);
  });
}

function syncSubPanel() {
  if (!subSelectionEl) return;
  if (!selectedPath || !selectedPath.length) {
    subSelectionEl.textContent = 'Select a cell (click its outline in edit mode).';
  } else if (hasActiveSub(selectedPath)) {
    var sub = getSubNode(selectedPath);
    subSelectionEl.textContent = formatPathBreadcrumb(selectedPath)
      + ' — nested on (' + sub.sites.length + ' points, depth ' + pathDepth(selectedPath) + '/' + MAX_SUB_DEPTH + ')';
  } else {
    subSelectionEl.textContent = formatPathBreadcrumb(selectedPath) + ' — no nested voronoi';
  }
  if (subToggleBtn) {
    subToggleBtn.textContent = selectedPath && hasActiveSub(selectedPath)
      ? 'Remove sub'
      : 'Add sub';
  }
  if (subUpBtn) subUpBtn.hidden = !(selectedPath && selectedPath.length);
  var activeSub = selectedPath && hasActiveSub(selectedPath) ? getSubNode(selectedPath) : null;
  var corner = activeSub ? activeSub.cornerRadius : 20;
  var stroke = activeSub ? activeSub.strokeWidth : DEFAULT_STROKE_WIDTH;
  if (subCornerInput) subCornerInput.value = String(corner);
  if (subStrokeInput) subStrokeInput.value = String(stroke);
  if (subCornerOut) subCornerOut.textContent = String(corner);
  if (subStrokeOut) subStrokeOut.textContent = String(stroke);
}

function renderSubTree(path, parentPoly, parentPathD, defsEl, containerEl) {
  if (!hasActiveSub(path)) return;
  var sub = getSubNode(path);
  var depth = pathDepth(path);
  var clipId = 'voronoi-clip-' + pathKey(path).replace(/\//g, '-');
  var clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPath.setAttribute('id', clipId);
  var clipShape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  clipShape.setAttribute('d', parentPathD);
  clipPath.appendChild(clipShape);
  defsEl.appendChild(clipPath);

  var box = polygonBBox(parentPoly);
  var delaunay = Delaunay.from(sub.sites);
  var voronoi = delaunay.voronoi([
    box.minX - 20,
    box.minY - 20,
    box.maxX + 20,
    box.maxY + 20
  ]);

  var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('clip-path', 'url(#' + clipId + ')');

  for (var i = 0; i < sub.sites.length; i++) {
    var poly = voronoi.cellPolygon(i);
    if (!poly) continue;
    var cellPath = path.concat([i]);
    var cellKey = pathKey(cellPath);
    polyByPath[cellKey] = poly;
    var subPathD = roundPolygonPath(poly, sub.cornerRadius);
    var depthClass = depth >= 2 ? ' opening-voronoi__cell-sub--depth-' + Math.min(depth, 4) : '';
    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute(
      'class',
      'opening-voronoi__cell-sub' + depthClass + (pathsEqual(selectedPath, cellPath) ? ' is-selected' : '')
    );
    pathEl.setAttribute('data-cell-path', cellKey);
    pathEl.setAttribute('d', subPathD);
    pathEl.setAttribute('stroke-width', String(sub.strokeWidth));
    group.appendChild(pathEl);

    if (pathDepth(cellPath) < MAX_SUB_DEPTH && hasActiveSub(cellPath)) {
      renderSubTree(cellPath, poly, subPathD, defsEl, group);
    }
  }

  containerEl.appendChild(group);
}

function render() {
  var effectiveSites = getEffectiveSites();
  var renderSites = effectiveSites;
  var protectedRegions = [];
  if (state.protectContent) {
    var measured = measureProtectedRegions();
    if (measured.length) {
      var protection = applyContentProtection(effectiveSites, measured);
      renderSites = protection.sites;
      protectedRegions = protection.regions;
    }
  }
  var delaunay = Delaunay.from(renderSites);
  var voronoi = delaunay.voronoi(getParentVoronoiBounds());
  parentPolys = [];
  polyByPath = {};
  cellsEl.innerHTML = '';

  var defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  cellsEl.appendChild(defsEl);
  var parentLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  var subLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  cellsEl.appendChild(parentLayer);
  cellsEl.appendChild(subLayer);

  for (var i = 0; i < renderSites.length; i++) {
    var poly = voronoi.cellPolygon(i);
    if (!poly) continue;
    parentPolys[i] = poly;
    var cellPath = [i];
    var cellKey = pathKey(cellPath);
    polyByPath[cellKey] = poly;
    ensureSubDefaults(i, poly);

    var pathD = roundPolygonPath(poly, state.cornerRadius);
    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('class', 'opening-voronoi__cell' + (pathsEqual(selectedPath, cellPath) ? ' is-selected' : ''));
    pathEl.setAttribute('data-cell-path', cellKey);
    pathEl.setAttribute('d', pathD);
    pathEl.setAttribute('stroke-width', String(state.strokeWidth));
    parentLayer.appendChild(pathEl);

    renderSubTree(cellPath, poly, pathD, defsEl, subLayer);
  }

  finishSubDefaultSeeding();

  handlesEl.innerHTML = '';
  if (editing) {
    for (var j = 0; j < effectiveSites.length; j++) {
      var site = effectiveSites[j];
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'voronoi-handle');
      circle.setAttribute('cx', site[0]);
      circle.setAttribute('cy', site[1]);
      circle.setAttribute('r', '18');
      circle.setAttribute('data-index', String(j));
      handlesEl.appendChild(circle);
    }
  }

  subHandlesEl.innerHTML = '';
  if (editing && selectedPath && selectedPath.length && hasActiveSub(selectedPath)) {
    var activeSub = getSubNode(selectedPath);
    var selKey = pathKey(selectedPath);
    for (var k = 0; k < activeSub.sites.length; k++) {
      var subSite = activeSub.sites[k];
      var subCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      subCircle.setAttribute('class', 'voronoi-sub-handle');
      subCircle.setAttribute('cx', subSite[0]);
      subCircle.setAttribute('cy', subSite[1]);
      subCircle.setAttribute('r', '10');
      subCircle.setAttribute('data-cell-path', selKey);
      subCircle.setAttribute('data-site-index', String(k));
      subHandlesEl.appendChild(subCircle);
    }
  }

  state.selectedPath = selectedPath;
  applyVoronoiColors();
  syncControls();
  syncSubPanel();
  syncLayerChrome();
  renderLayerCanvas();
  renderProtectionOverlay(protectedRegions);
  updateProtectionStatus(protectedRegions);
  saveState();
}


function setLayerParam(key, input, output, formatter) {
  if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
  var val = state.layers[key];
  if (input) input.value = String(val);
  if (output) output.textContent = formatter ? formatter(val) : String(val);
}

function setZoneDisabled(selector, disabled) {
  var el = editor.querySelector(selector);
  if (el) el.classList.toggle('is-disabled', !!disabled);
}

function syncLayerChrome() {
  if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
  var tissueSelect = editor.querySelector('[data-layer-tissue-style]');
  if (tissueSelect) tissueSelect.value = state.layers.tissueStyle || 'outline';
  var netToggle = editor.querySelector('[data-layer-networks]');
  if (netToggle) netToggle.checked = !!state.layers.networks;
  var flowToggle = editor.querySelector('[data-layer-flows]');
  if (flowToggle) flowToggle.checked = !!state.layers.flows;
  setLayerParam('networkSeed', editor.querySelector('[data-layer-network-seed]'), editor.querySelector('[data-layer-network-seed-out]'));
  setLayerParam('networkEdgeCoverage', editor.querySelector('[data-layer-network-coverage]'), editor.querySelector('[data-layer-network-coverage-out]'));
  setLayerParam('networkBranchDepth', editor.querySelector('[data-layer-network-depth]'), editor.querySelector('[data-layer-network-depth-out]'));
  setLayerParam('networkRandomness', editor.querySelector('[data-layer-network-chaos]'), editor.querySelector('[data-layer-network-chaos-out]'));
  setLayerParam('flowSeed', editor.querySelector('[data-layer-flow-seed]'), editor.querySelector('[data-layer-flow-seed-out]'));
  setLayerParam('flowParticles', editor.querySelector('[data-layer-flow-particles]'), editor.querySelector('[data-layer-flow-particles-out]'));
  setLayerParam('flowCurl', editor.querySelector('[data-layer-flow-curl]'), editor.querySelector('[data-layer-flow-curl-out]'));
  setLayerParam('flowTrailLength', editor.querySelector('[data-layer-flow-trail]'), editor.querySelector('[data-layer-flow-trail-out]'));
  setZoneDisabled('[data-layer-network-params]', !state.layers.networks);
  setZoneDisabled('[data-layer-flow-params]', !state.layers.flows);
  illustrationEl.classList.toggle('is-tissue-filled', state.layers.tissueStyle === 'filled');
  illustrationEl.classList.toggle('has-network-layer', !!state.layers.networks);
  illustrationEl.classList.toggle('has-flow-layer', !!state.layers.flows);
}

function renderLayerCanvas() {
  if (!layerCanvas) return;
  if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
  layerCanvas.width = VB.w;
  layerCanvas.height = VB.h;
  var ctx = layerCanvas.getContext('2d');
  if (!ctx) return;
  var visible = renderCanvasLayers(ctx, VB, polyByPath, state.layers);
  layerCanvas.hidden = !visible;
}

function buildPresetPayload() {
  return {
    version: 1,
    viewBox: '0 0 ' + VB.w + ' ' + VB.h,
    cornerRadius: state.cornerRadius,
    strokeWidth: state.strokeWidth,
    sites: state.sites,
    transform: getTransform(),
    subCells: state.subCells,
    subDismissed: state.subDismissed,
    seedSubDefaults: state.seedSubDefaults,
    subDefaultCells: state.subDefaultCells,
    selectedPath: selectedPath,
    layers: state.layers,
  };
}

function applyPresetPayload(data) {
  if (!data || !Array.isArray(data.sites) || data.sites.length < 3) {
    setStatus('Invalid preset — need sites array with 3+ points.');
    return false;
  }
  state.sites = data.sites.map(function (p) { return p.slice(); });
  state.cornerRadius = data.cornerRadius != null ? data.cornerRadius : state.cornerRadius;
  state.strokeWidth = data.strokeWidth != null ? data.strokeWidth : state.strokeWidth;
  state.transform = Object.assign({}, DEFAULT_TRANSFORM, data.transform || {});
  state.subCells = data.subCells || {};
  state.subDismissed = data.subDismissed || {};
  state.seedSubDefaults = !!data.seedSubDefaults;
  state.subDefaultCells = data.subDefaultCells || [0, 1];
  state.layers = mergeLayers(data.layers);
  selectedPath = normalizeSelectedPath(data.selectedPath, null);
  migrateSubCellsTree(state.subCells);
  applyVoronoiColors();
  render();
  setStatus('Preset loaded.');
  return true;
}

function bindLayerSlider(key, selector, outputSelector) {
  var input = editor.querySelector(selector);
  if (!input) return;
  input.addEventListener('input', function () {
    if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
    state.layers[key] = Number(input.value);
    var output = outputSelector ? editor.querySelector(outputSelector) : null;
    if (output) output.textContent = String(state.layers[key]);
    render();
  });
}

function bindProtectControls() {
  if (!protectToggle) return;
  protectToggle.checked = !!state.protectContent;
  protectToggle.addEventListener('change', function () {
    state.protectContent = protectToggle.checked;
    render();
    setStatus(state.protectContent ? 'Content protection on — logo, nav, hero, approach pinned clear.' : 'Content protection off.');
  });
}

function bindLayerControls() {
  var tissueSelect = editor.querySelector('[data-layer-tissue-style]');
  if (tissueSelect) {
    tissueSelect.addEventListener('change', function () {
      if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
      state.layers.tissueStyle = tissueSelect.value;
      render();
      setStatus('Tissue: ' + tissueSelect.value + '.');
    });
  }
  var netToggle = editor.querySelector('[data-layer-networks]');
  if (netToggle) {
    netToggle.addEventListener('change', function () {
      if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
      state.layers.networks = netToggle.checked;
      syncLayerChrome();
      render();
      setStatus(netToggle.checked ? 'Networks on — branches follow Voronoi edges.' : 'Networks off.');
    });
  }
  var flowToggle = editor.querySelector('[data-layer-flows]');
  if (flowToggle) {
    flowToggle.addEventListener('change', function () {
      if (!state.layers) state.layers = mergeLayers(DEFAULT_LAYERS);
      state.layers.flows = flowToggle.checked;
      syncLayerChrome();
      render();
      setStatus(flowToggle.checked ? 'Flows on — particles follow noise field.' : 'Flows off.');
    });
  }
  bindLayerSlider('networkSeed', '[data-layer-network-seed]', '[data-layer-network-seed-out]');
  bindLayerSlider('networkEdgeCoverage', '[data-layer-network-coverage]', '[data-layer-network-coverage-out]');
  bindLayerSlider('networkBranchDepth', '[data-layer-network-depth]', '[data-layer-network-depth-out]');
  bindLayerSlider('networkRandomness', '[data-layer-network-chaos]', '[data-layer-network-chaos-out]');
  bindLayerSlider('flowSeed', '[data-layer-flow-seed]', '[data-layer-flow-seed-out]');
  bindLayerSlider('flowParticles', '[data-layer-flow-particles]', '[data-layer-flow-particles-out]');
  bindLayerSlider('flowCurl', '[data-layer-flow-curl]', '[data-layer-flow-curl-out]');
  bindLayerSlider('flowTrailLength', '[data-layer-flow-trail]', '[data-layer-flow-trail-out]');

  var exportBtn = editor.querySelector('[data-hero-export-png]');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      var svgClone = svg.cloneNode(true);
      var h = svgClone.querySelector('[data-voronoi-handles]');
      if (h) h.remove();
      var sh = svgClone.querySelector('[data-voronoi-sub-handles]');
      if (sh) sh.remove();
      exportGenerativePng(VB, polyByPath, state.layers, svgClone, 2)
        .then(function (blob) {
          downloadBlob(blob, 'hero-generative.png');
          setStatus('Exported PNG.');
        })
        .catch(function () {
          setStatus('Export failed.');
        });
    });
  }
  var loadBtn = editor.querySelector('[data-hero-load-preset]');
  var loadInput = editor.querySelector('[data-hero-load-input]');
  if (loadBtn && loadInput) {
    loadBtn.addEventListener('click', function () { loadInput.click(); });
    loadInput.addEventListener('change', function () {
      var file = loadInput.files && loadInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          applyPresetPayload(JSON.parse(reader.result));
        } catch (e) {
          setStatus('Could not parse JSON file.');
        }
      };
      reader.readAsText(file);
      loadInput.value = '';
    });
  }
  var pasteBtn = editor.querySelector('[data-hero-paste-preset]');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', function () {
      var raw = window.prompt('Paste preset JSON');
      if (!raw) return;
      try {
        applyPresetPayload(JSON.parse(raw));
      } catch (e) {
        setStatus('Could not parse pasted JSON.');
      }
    });
  }
}

function clearEditLayerInlineStyles() {
  svg.style.position = '';
  svg.style.left = '';
  svg.style.top = '';
  svg.style.width = '';
  svg.style.height = '';
  svg.style.zIndex = '';
  if (layerCanvas) {
    layerCanvas.style.position = '';
    layerCanvas.style.left = '';
    layerCanvas.style.top = '';
    layerCanvas.style.width = '';
    layerCanvas.style.height = '';
    layerCanvas.style.zIndex = '';
  }
}

function loadPanelPos() {
  try {
    var saved = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      panelPos = saved;
      applyPanelPos();
    }
  } catch (e) {}
}

function savePanelPos() {
  if (!panelPos) return;
  localStorage.setItem(PANEL_POS_KEY, JSON.stringify(panelPos));
}

function applyPanelPos() {
  if (!panelPos) return;
  editor.classList.add('is-positioned');
  editor.style.left = Math.round(panelPos.x) + 'px';
  editor.style.top = Math.round(panelPos.y) + 'px';
  editor.style.right = 'auto';
  editor.style.bottom = 'auto';
}

function clampPanelPos(x, y) {
  var maxX = Math.max(8, window.innerWidth - editor.offsetWidth - 8);
  var maxY = Math.max(8, window.innerHeight - editor.offsetHeight - 8);
  return {
    x: Math.max(8, Math.min(maxX, x)),
    y: Math.max(8, Math.min(maxY, y))
  };
}

function syncPanelChrome() {
  if (editingBadge) editingBadge.hidden = !editing;
  editor.classList.toggle('is-editing-active', editing);
  if (panelToggle) {
    panelToggle.textContent = editor.classList.contains('is-collapsed') ? '+' : '−';
    panelToggle.setAttribute('aria-label', editor.classList.contains('is-collapsed')
      ? 'Expand panel'
      : 'Minimize panel');
  }
}

function setEditing(on) {
  editing = on;
  illustrationEl.classList.toggle('is-voronoi-editing', on);
  document.body.classList.toggle('is-voronoi-editing', on);
  handlesEl.hidden = !on;
  subHandlesEl.hidden = !on;
  editBtn.textContent = on
    ? (options.mode === 'lab' ? 'Done' : 'Done editing')
    : (options.mode === 'lab' ? 'Edit geometry' : 'Edit mode');
  clearEditLayerInlineStyles();
  syncPanelChrome();
  render();
  setStatus(on
    ? 'Edit view (pink): drag dots or click outlines to nest up to 4 levels.'
    : 'Preview view: showing your paper edge color.');
}

function copyPaths() {
  var payload = JSON.stringify(buildPresetPayload(), null, 2);
  navigator.clipboard.writeText(payload).then(function () {
    setStatus('Copied JSON to clipboard.');
  }).catch(function () {
    setStatus('Could not copy — check browser permissions.');
  });
}

function bindTransformSlider(key, selector, outputSelector, formatter) {
  var input = editor.querySelector(selector);
  if (!input) return;
  input.addEventListener('input', function () {
    var value = Number(input.value);
    if (transformKeys.indexOf(key) >= 0) {
      if (!state.transform) state.transform = Object.assign({}, DEFAULT_TRANSFORM);
      state.transform[key] = value;
    } else {
      state[key] = value;
    }
    var output = editor.querySelector(outputSelector);
    if (output) output.textContent = formatter(value);
    render();
  });
}

sliderBindings.forEach(function (binding) {
  bindTransformSlider(binding[0], binding[1], binding[2], binding[3]);
});

panelToggle.addEventListener('click', function (event) {
  event.stopPropagation();
  var collapsed = editor.classList.toggle('is-collapsed');
  panelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  syncPanelChrome();
});

if (panelDrag) {
  panelDrag.addEventListener('pointerdown', function (event) {
    if (event.target.closest('[data-voronoi-panel-toggle]')) return;
    draggingPanel = true;
    panelDrag.classList.add('is-dragging');
    var rect = editor.getBoundingClientRect();
    if (!editor.classList.contains('is-positioned')) {
      editor.classList.add('is-positioned');
      editor.style.left = rect.left + 'px';
      editor.style.top = rect.top + 'px';
      editor.style.right = 'auto';
      editor.style.bottom = 'auto';
    }
    panelDragOffset.x = event.clientX - rect.left;
    panelDragOffset.y = event.clientY - rect.top;
    panelDrag.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  panelDrag.addEventListener('pointermove', function (event) {
    if (!draggingPanel) return;
    var next = clampPanelPos(
      event.clientX - panelDragOffset.x,
      event.clientY - panelDragOffset.y
    );
    editor.style.left = next.x + 'px';
    editor.style.top = next.y + 'px';
    panelPos = next;
  });

  function endPanelDrag() {
    if (!draggingPanel) return;
    draggingPanel = false;
    panelDrag.classList.remove('is-dragging');
    savePanelPos();
  }

  panelDrag.addEventListener('pointerup', endPanelDrag);
  panelDrag.addEventListener('pointercancel', endPanelDrag);
}

editBtn.addEventListener('click', function () {
  setEditing(!editing);
});

editor.querySelector('[data-voronoi-add-point]').addEventListener('click', function () {
  if (!editing) setEditing(true);
  state.sites.push([CENTER.x, CENTER.y]);
  render();
  setStatus('Added point — drag it into place.');
});

editor.querySelector('[data-voronoi-remove-point]').addEventListener('click', function () {
  if (state.sites.length <= 3) {
    setStatus('Need at least 3 points.');
    return;
  }
  state.sites.pop();
  render();
  setStatus('Removed last point.');
});

editor.querySelector('[data-voronoi-reset]').addEventListener('click', function () {
  state = defaultState();
  selectedPath = null;
  render();
  setStatus('Reset to defaults.');
});

if (subUpBtn) {
  subUpBtn.addEventListener('click', function () {
    if (!selectedPath || !selectedPath.length) return;
    var up = parentPath(selectedPath);
    selectedPath = up && up.length ? up : null;
    render();
    setStatus(selectedPath
      ? 'Selected ' + formatPathBreadcrumb(selectedPath) + '.'
      : 'Cleared selection.');
  });
}

editor.querySelector('[data-voronoi-sub-toggle]').addEventListener('click', function () {
  if (!editing) setEditing(true);
  if (!selectedPath || !selectedPath.length) {
    setStatus('Click a cell outline first.');
    return;
  }
  if (pathDepth(selectedPath) > MAX_SUB_DEPTH) {
    setStatus('Max nesting depth (' + MAX_SUB_DEPTH + ') reached.');
    return;
  }
  var poly = getPolyForPath(selectedPath);
  if (!poly) return;
  if (hasActiveSub(selectedPath)) {
    dismissSub(selectedPath);
    setStatus('Removed nested voronoi at ' + formatPathBreadcrumb(selectedPath) + '.');
  } else {
    allowSub(selectedPath);
    setSubNode(selectedPath, defaultSubConfig(poly));
    setStatus('Added nested voronoi at ' + formatPathBreadcrumb(selectedPath) + '.');
  }
  render();
});

editor.querySelector('[data-voronoi-sub-clear-all]').addEventListener('click', function () {
  state.subCells = {};
  state.subDismissed = {};
  state.seedSubDefaults = false;
  for (var i = 0; i < parentPolys.length; i++) {
    if (parentPolys[i]) state.subDismissed[pathKey([i])] = true;
  }
  selectedPath = null;
  render();
  setStatus('Removed all nested voronoi.');
});

editor.querySelector('[data-voronoi-sub-add]').addEventListener('click', function () {
  if (!editing) setEditing(true);
  if (!selectedPath || !selectedPath.length) {
    setStatus('Click a cell outline first.');
    return;
  }
  if (pathDepth(selectedPath) > MAX_SUB_DEPTH) {
    setStatus('Max nesting depth (' + MAX_SUB_DEPTH + ') reached.');
    return;
  }
  var poly = getPolyForPath(selectedPath);
  if (!poly) return;
  var sub = getSubNode(selectedPath);
  if (!hasActiveSub(selectedPath)) {
    allowSub(selectedPath);
    sub = defaultSubConfig(poly);
    setSubNode(selectedPath, sub);
  }
  var c = polygonCentroid(poly);
  sub.sites.push([c[0], c[1]]);
  render();
  setStatus('Added point at ' + formatPathBreadcrumb(selectedPath) + '.');
});

editor.querySelector('[data-voronoi-sub-remove]').addEventListener('click', function () {
  if (!selectedPath || !selectedPath.length) {
    setStatus('Click a cell outline first.');
    return;
  }
  var sub = getSubNode(selectedPath);
  if (!sub || !sub.enabled || sub.sites.length <= 3) {
    setStatus('Need a nested voronoi with at least 3 points.');
    return;
  }
  sub.sites.pop();
  render();
  setStatus('Removed point at ' + formatPathBreadcrumb(selectedPath) + '.');
});

subCornerInput.addEventListener('input', function () {
  if (!selectedPath || !selectedPath.length) return;
  var sub = getSubNode(selectedPath);
  if (!sub || !sub.enabled) return;
  sub.cornerRadius = Number(subCornerInput.value);
  if (subCornerOut) subCornerOut.textContent = String(sub.cornerRadius);
  render();
});

subStrokeInput.addEventListener('input', function () {
  if (!selectedPath || !selectedPath.length) return;
  var sub = getSubNode(selectedPath);
  if (!sub || !sub.enabled) return;
  sub.strokeWidth = Number(subStrokeInput.value);
  if (subStrokeOut) subStrokeOut.textContent = String(sub.strokeWidth);
  render();
});

editor.querySelector('[data-voronoi-copy]').addEventListener('click', copyPaths);

function handlePointerMove(event) {
  if (dragSiteIndex >= 0 && dragPathKey) {
    var pt = clientToSvg(event.clientX, event.clientY);
    var sub = getSubNode(parsePathKey(dragPathKey));
    if (sub && sub.sites[dragSiteIndex]) {
      sub.sites[dragSiteIndex] = [pt[0], pt[1]];
      render();
      var active = subHandlesEl.querySelector(
        '[data-cell-path="' + dragPathKey + '"][data-site-index="' + dragSiteIndex + '"]'
      );
      if (active) active.classList.add('is-dragging');
    }
    return;
  }

  if (dragIndex < 0) return;
  var pt = clientToSvg(event.clientX, event.clientY);
  var base = inverseTransformPoint(pt[0], pt[1], getTransform());
  state.sites[dragIndex] = base;
  render();
  var active = handlesEl.querySelector('[data-index="' + dragIndex + '"]');
  if (active) active.classList.add('is-dragging');
}

function endDrag() {
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  if (dragSiteIndex >= 0) {
    var subHandle = subHandlesEl.querySelector(
      '[data-cell-path="' + dragPathKey + '"][data-site-index="' + dragSiteIndex + '"]'
    );
    if (subHandle) subHandle.classList.remove('is-dragging');
    dragPathKey = '';
    dragSiteIndex = -1;
  }
  if (dragIndex >= 0) {
    var handle = handlesEl.querySelector('[data-index="' + dragIndex + '"]');
    if (handle) handle.classList.remove('is-dragging');
    dragIndex = -1;
  }
}

function startWindowDrag() {
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

svg.addEventListener('pointerdown', function (event) {
  if (!editing) return;

  var subHandle = event.target.closest('.voronoi-sub-handle');
  if (subHandle) {
    dragPathKey = subHandle.getAttribute('data-cell-path') || '';
    dragSiteIndex = Number(subHandle.getAttribute('data-site-index'));
    subHandle.classList.add('is-dragging');
    startWindowDrag();
    event.preventDefault();
    return;
  }

  var handle = event.target.closest('.voronoi-handle');
  if (handle) {
    startHandleDrag(Number(handle.getAttribute('data-index')));
    event.preventDefault();
    return;
  }

  var nearHandle = nearestHandleIndex(clientToSvg(event.clientX, event.clientY));
  if (nearHandle >= 0) {
    startHandleDrag(nearHandle);
    event.preventDefault();
    return;
  }

  var cellEl = event.target.closest('[data-cell-path]');
  if (cellEl) {
    selectedPath = parsePathKey(cellEl.getAttribute('data-cell-path'));
    render();
    setStatus('Selected ' + formatPathBreadcrumb(selectedPath) + '. Add nested or drag pink points.');
    event.preventDefault();
  }
});

function loadSectionCollapsed() {
  try {
    var saved = JSON.parse(localStorage.getItem(SECTION_COLLAPSE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return Object.assign({}, DEFAULT_SECTION_COLLAPSED, saved);
    }
  } catch (e) {}
  return Object.assign({}, DEFAULT_SECTION_COLLAPSED);
}

function applySectionCollapsed(collapsed) {
  editor.querySelectorAll('.voronoi-editor__section[data-voronoi-section]').forEach(function (section) {
    var id = section.getAttribute('data-voronoi-section');
    var isCollapsed = !!collapsed[id];
    section.classList.toggle('is-collapsed', isCollapsed);
    var toggle = section.querySelector('[data-voronoi-section-toggle]');
    var chevron = section.querySelector('.voronoi-editor__section-chevron');
    if (toggle) toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    if (chevron) chevron.textContent = isCollapsed ? '▸' : '▾';
  });
}

applyVoronoiColors();

var sectionCollapsed = loadSectionCollapsed();
applySectionCollapsed(sectionCollapsed);

editor.querySelectorAll('[data-voronoi-section-toggle]').forEach(function (btn) {
  btn.addEventListener('click', function (event) {
    event.stopPropagation();
    var section = btn.closest('[data-voronoi-section]');
    if (!section) return;
    var id = section.getAttribute('data-voronoi-section');
    sectionCollapsed[id] = !sectionCollapsed[id];
    applySectionCollapsed(sectionCollapsed);
    localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(sectionCollapsed));
  });
});

bindLayerControls();
bindProtectControls();
if (options.autoEdit || location.search.indexOf('voronoi=edit') !== -1) {
  editor.classList.remove('is-collapsed');
  panelToggle.setAttribute('aria-expanded', 'true');
  setEditing(true);
} else if (options.startExpanded) {
  editor.classList.remove('is-collapsed');
  panelToggle.setAttribute('aria-expanded', 'true');
  render();
  syncPanelChrome();
} else {
  render();
  syncPanelChrome();
}

loadPanelPos();
clearEditLayerInlineStyles();
var resizeRenderQueued = false;
window.addEventListener('resize', function () {
  if (panelPos) {
    panelPos = clampPanelPos(panelPos.x, panelPos.y);
    applyPanelPos();
    savePanelPos();
  }
  // Protected regions are measured from live DOM rects (they reflow with
  // width), so re-render on resize to keep containment correct — this is
  // the "auto-adjust on width" half of the containment prototype.
  if (state.protectContent && !resizeRenderQueued) {
    resizeRenderQueued = true;
    window.requestAnimationFrame(function () {
      resizeRenderQueued = false;
      render();
    });
  }
});
}
