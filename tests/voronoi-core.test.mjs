// tests/voronoi-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeCellPaths,
  computeCellPolygons,
  transformPoint,
  roundPolygonPath,
} from "../src/lib/voronoi-core.mjs";
import { HERO_VORONOI_DEFAULT } from "../public/lab-tools/hero-editor/hero-default-preset.mjs";

const VB = { w: 1600, h: 1100 };
const PAD = { x: 450, y: 450 };

function closeTo(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: ${actual} vs ${expected} (tolerance ${tolerance})`,
  );
}

function pointCloseTo([ax, ay], [ex, ey], tolerance, message) {
  closeTo(ax, ex, tolerance, `${message} x`);
  closeTo(ay, ey, tolerance, `${message} y`);
}

// This asserts HERO_VORONOI_DEFAULT.transform against a hardcoded literal —
// it does NOT import hero-voronoi-live.ts (node --test has no TS loader, so
// it can't), and it does not verify that the .ts module's own TRANSFORM
// constant still matches. That coupling is currently unchecked by any test
// in this suite; keep the two in sync by hand when either changes.
test("the baked preset transform still equals the literal the hero was baked from", () => {
  assert.deepEqual(HERO_VORONOI_DEFAULT.transform, {
    scale: 1, stretchX: 0.93, stretchY: 1, rotation: 0, offsetX: 34, offsetY: 185,
  });
});

/** Split a path `d` into its command letters and its numbers, separately.
 * Comparing numbers alone lets a mutation that swaps e.g. " L" for " M" —
 * shattering a closed cell into disconnected subpaths — slip through with
 * identical numeric coordinates but a totally different visual result. */
function tokenize(d) {
  const letters = (d.match(/[A-Za-z]/g) || []).join("");
  const numbers = (d.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g) || []).map(Number);
  return { letters, numbers };
}

test("computeCellPaths reproduces the baked hero fallback markup", () => {
  const astro = readFileSync(
    new URL("../src/components/HeroVoronoi.astro", import.meta.url), "utf8");
  // Scoped to the data-hero-voronoi-cells group so a future decorative path
  // elsewhere in the file can't fail this test with a misleading message.
  const groupMatch = astro.match(
    /data-hero-voronoi-cells>([\s\S]*?)<\/g>/,
  );
  assert.ok(groupMatch, "expected a data-hero-voronoi-cells group in HeroVoronoi.astro");
  const baked = [...groupMatch[1].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(baked.length === 10, `expected 10 baked paths, got ${baked.length}`);

  const paths = computeCellPaths({
    sites: HERO_VORONOI_DEFAULT.sites,
    transform: HERO_VORONOI_DEFAULT.transform,
    viewBox: VB,
    pad: PAD,
    cornerRadius: HERO_VORONOI_DEFAULT.cornerRadius,
  });
  assert.equal(paths.length, baked.length);
  for (let i = 0; i < paths.length; i++) {
    const got = tokenize(paths[i]);
    const want = tokenize(baked[i]);
    assert.equal(got.letters, want.letters, `path ${i}: command letter sequence`);
    assert.equal(got.numbers.length, want.numbers.length, `path ${i}: coordinate count`);
    for (let j = 0; j < got.numbers.length; j++) {
      assert.ok(Math.abs(got.numbers[j] - want.numbers[j]) < 1e-6,
        `path ${i} coord ${j}: ${got.numbers[j]} vs ${want.numbers[j]}`);
    }
  }
});

// The invariant production actually depends on: hero-voronoi-live.ts
// pre-transforms sites itself (content-protection needs the effective
// coordinates) and then calls computeCellPolygons with transform: null, to
// avoid transforming twice. Pre-transforming + passing null must be
// identical to passing the raw sites with the transform applied inline.
test("pre-transforming sites then passing transform: null matches applying the transform inline", () => {
  const transform = HERO_VORONOI_DEFAULT.transform;
  const center = [VB.w / 2, VB.h / 2];
  const preTransformed = HERO_VORONOI_DEFAULT.sites.map((p) =>
    transformPoint(p, transform, center),
  );

  const viaNullTransform = computeCellPaths({
    sites: preTransformed, transform: null,
    viewBox: VB, pad: PAD, cornerRadius: HERO_VORONOI_DEFAULT.cornerRadius,
  });
  const viaInlineTransform = computeCellPaths({
    sites: HERO_VORONOI_DEFAULT.sites, transform,
    viewBox: VB, pad: PAD, cornerRadius: HERO_VORONOI_DEFAULT.cornerRadius,
  });

  assert.equal(viaNullTransform.length, viaInlineTransform.length);
  // Prefer exact equality; only the numeric loop needs to fall back to a
  // tolerance if floating-point noise from the two code paths differs.
  let exact = true;
  for (let i = 0; i < viaNullTransform.length; i++) {
    if (viaNullTransform[i] !== viaInlineTransform[i]) { exact = false; break; }
  }
  if (exact) {
    assert.deepEqual(viaNullTransform, viaInlineTransform);
    return;
  }
  for (let i = 0; i < viaNullTransform.length; i++) {
    const a = viaNullTransform[i];
    const b = viaInlineTransform[i];
    assert.equal(a === null, b === null, `path ${i}: null-ness mismatch`);
    if (a === null) continue;
    const ta = tokenize(a);
    const tb = tokenize(b);
    assert.equal(ta.letters, tb.letters, `path ${i}: command letter sequence`);
    assert.equal(ta.numbers.length, tb.numbers.length, `path ${i}: coordinate count`);
    for (let j = 0; j < ta.numbers.length; j++) {
      assert.ok(Math.abs(ta.numbers[j] - tb.numbers[j]) < 1e-6,
        `path ${i} coord ${j}: ${ta.numbers[j]} vs ${tb.numbers[j]}`);
    }
  }
});

test("computeCellPolygons stays aligned 1:1 with sites when a site is degenerate", () => {
  // Site index 2 is an exact duplicate of index 1, so d3 collapses one of
  // the pair to a null (empty) cell. The old implementation compacted nulls
  // out of the returned array, shifting every later index — which meant
  // renderSvg's per-index ramp fill silently misassigned colors from that
  // point on.
  const sites = [
    [100, 100],
    [400, 100],
    [400, 100], // duplicate of index 1
    [100, 400],
    [400, 400],
  ];
  const polys = computeCellPolygons({
    sites, transform: null, viewBox: VB, pad: PAD,
  });
  assert.equal(polys.length, sites.length);
  assert.equal(polys[2], null, "the duplicate site's cell must be null, not dropped");
  // A known non-degenerate site (index 0) must still sit at its original
  // index with a real polygon.
  assert.ok(Array.isArray(polys[0]) && polys[0].length >= 3,
    "non-degenerate cell at index 0 must remain a polygon at its original index");
});

test("transformPoint: 90-degree rotation about a known center", () => {
  // Point 10 units to the right of center, rotated 90deg, lands 10 units
  // below center (this formula's positive rotation is clockwise in
  // screen/SVG y-down coordinates).
  const result = transformPoint(
    [60, 50],
    { scale: 1, stretchX: 1, stretchY: 1, rotation: 90, offsetX: 0, offsetY: 0 },
    [50, 50],
  );
  pointCloseTo(result, [50, 60], 1e-9, "90-degree rotation");
});

test("transformPoint: scale != 1 scales distance from center on both axes", () => {
  const result = transformPoint(
    [10, 10],
    { scale: 2, stretchX: 1, stretchY: 1, rotation: 0, offsetX: 0, offsetY: 0 },
    [0, 0],
  );
  pointCloseTo(result, [20, 20], 1e-9, "scale != 1");
});

test("transformPoint: stretchY != 1 scales only the y distance from center", () => {
  const result = transformPoint(
    [10, 10],
    { scale: 1, stretchX: 1, stretchY: 3, rotation: 0, offsetX: 0, offsetY: 0 },
    [0, 0],
  );
  pointCloseTo(result, [10, 30], 1e-9, "stretchY != 1");
});

test("transformPoint: offsets are applied after rotation", () => {
  // Same point/center/rotation as the 90-degree case above (translated to
  // center [0,0]), plus a nonzero offset. If offsets were applied before
  // rotation (e.g. folded into the center) the result would differ from
  // simply adding [offsetX, offsetY] to the un-offset rotated point.
  const rotatedNoOffset = transformPoint(
    [10, 0],
    { scale: 1, stretchX: 1, stretchY: 1, rotation: 90, offsetX: 0, offsetY: 0 },
    [0, 0],
  );
  const rotatedWithOffset = transformPoint(
    [10, 0],
    { scale: 1, stretchX: 1, stretchY: 1, rotation: 90, offsetX: 5, offsetY: 7 },
    [0, 0],
  );
  pointCloseTo(
    rotatedWithOffset,
    [rotatedNoOffset[0] + 5, rotatedNoOffset[1] + 7],
    1e-9,
    "offset applied after rotation",
  );
});

test("roundPolygonPath: corner radius clamps to 0.45 * shortest adjacent edge", () => {
  // A small right triangle: every vertex's adjacent edges are 10 or
  // 10*sqrt(2), so 0.45*len caps at 4.5 — far under the requested radius of
  // 100. The baked hero preset's min edge (~87 units) never exercises this
  // branch, so an unclamped Math.min(radius, ...) regression would pass the
  // baked-markup lock silently.
  const points = [
    [0, 0],
    [10, 0],
    [0, 10],
  ];
  const d = roundPolygonPath(points, 100);
  const firstM = d.match(/^M(-?[\d.]+),(-?[\d.]+)/);
  assert.ok(firstM, "expected the path to start with an M command");
  const p1 = [Number(firstM[1]), Number(firstM[2])];
  // p1 is curr [0,0] pulled back along the incoming edge by the clamped
  // radius, so its distance from [0,0] IS the radius actually used.
  const distanceFromVertex = Math.hypot(p1[0] - 0, p1[1] - 0);
  closeTo(distanceFromVertex, 4.5, 1e-9, "clamped radius (not the requested 100)");
});

test("roundPolygonPath: radius <= 0 falls back to a plain closed polyline", () => {
  const points = [
    [0, 0],
    [10, 0],
    [5, 10],
  ];
  assert.equal(roundPolygonPath(points, 0), "M0,0 L10,0 L5,10 Z");
  assert.equal(roundPolygonPath(points, -5), "M0,0 L10,0 L5,10 Z");
});

test("roundPolygonPath: fewer than 3 points falls back to the same polyline form", () => {
  const points = [
    [0, 0],
    [10, 10],
  ];
  assert.equal(roundPolygonPath(points, 25), "M0,0 L10,10 Z");
});
