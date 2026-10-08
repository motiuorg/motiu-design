// voronoi-core.mjs — pure Voronoi geometry shared by the live hero
// (src/lib/hero-voronoi-live.ts) and the render CLI (scripts/render-motif.mjs).
// No DOM, no side effects. Extracted 2026-08-10 from hero-voronoi-live.ts;
// behavior-locked by tests/voronoi-core.test.mjs against the baked fallback
// markup in HeroVoronoi.astro.
import { Delaunay } from "d3";

/** Apply scale/stretch/rotate/offset around `center`. Verbatim from
 * hero-voronoi-live.ts transformPoint (2026-08-07 containment session). */
export function transformPoint([x, y], t, center) {
  const dx = (x - center[0]) * t.scale * t.stretchX;
  const dy = (y - center[1]) * t.scale * t.stretchY;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    center[0] + dx * cos - dy * sin + t.offsetX,
    center[1] + dx * sin + dy * cos + t.offsetY,
  ];
}

/** Rounded-corner closed path for a polygon ring. Verbatim from
 * hero-voronoi-live.ts roundPolygonPath. */
export function roundPolygonPath(points, radius) {
  const n = points.length;
  if (n < 3 || radius <= 0) {
    return "M" + points.map((p) => p[0] + "," + p[1]).join(" L") + " Z";
  }
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(radius, len1 * 0.45, len2 * 0.45);
    const p1x = curr[0] - (v1x / len1) * r;
    const p1y = curr[1] - (v1y / len1) * r;
    const p2x = curr[0] + (v2x / len2) * r;
    const p2y = curr[1] + (v2y / len2) * r;
    d += (i === 0 ? "M" : " L") + p1x + "," + p1y;
    d += " Q" + curr[0] + "," + curr[1] + " " + p2x + "," + p2y;
  }
  return d + " Z";
}

/** sites (+ optional transform) → Voronoi cell polygon rings, clipped to the
 * padded viewBox (pad pushes clip edges off-screen, as the live hero does).
 * The returned array is aligned 1:1 with `sites` — d3 returns `null` for an
 * empty cell (e.g. a duplicate site), and that `null` is passed straight
 * through at the same index rather than compacted away, so callers that key
 * off array position (e.g. renderSvg's per-index ramp fill) stay correct. */
export function computeCellPolygons({ sites, transform, viewBox, pad }) {
  const center = [viewBox.w / 2, viewBox.h / 2];
  const effective = transform
    ? sites.map((p) => transformPoint(p, transform, center))
    : sites;
  const delaunay = Delaunay.from(effective);
  const voronoi = delaunay.voronoi([
    -pad.x, -pad.y, viewBox.w + pad.x, viewBox.h + pad.y,
  ]);
  const polys = [];
  for (let i = 0; i < effective.length; i++) {
    polys.push(voronoi.cellPolygon(i));
  }
  return polys;
}

/** sites → rounded-corner SVG path strings, one per cell, aligned 1:1 with
 * sites. A `null` polygon (empty/degenerate cell) maps straight through as
 * `null` rather than being run through roundPolygonPath. */
export function computeCellPaths(opts) {
  const { cornerRadius = 25 } = opts;
  return computeCellPolygons(opts).map((poly) =>
    poly ? roundPolygonPath(poly, cornerRadius) : null,
  );
}
