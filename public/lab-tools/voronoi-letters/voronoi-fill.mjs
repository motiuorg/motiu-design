/**
 * voronoi-fill.mjs — seeding + cell geometry, independent of where the outline came from.
 */

/**
 * Auto-seeds `count` points inside a glyph using Mitchell's best-candidate algorithm: for each
 * new point, generate several random candidates and keep whichever is farthest from every point
 * already placed. Plain rejection sampling (pick any valid random point) was unreliable with only
 * 2–4 seeds — it regularly clustered two seeds together in one lobe of a letter (e.g. both inside
 * an M's valley) while a third claimed a lopsided majority of the remaining area. Best-candidate
 * actively spreads points toward maximum mutual distance, which reliably lands one seed per
 * visually distinct lobe (M's left stem / valley / right stem) without knowing anything about the
 * glyph's structure — it only needs isPointInPath, still correctly skipping holes/counters.
 */
export function seedInGlyph(ctx, path2d, bbox, count, { candidatesPerPoint = 30, maxAttempts = 4000 } = {}) {
  const w = bbox.x2 - bbox.x1;
  const h = bbox.y2 - bbox.y1;

  function randomPointInGlyph() {
    for (let i = 0; i < maxAttempts; i++) {
      const x = bbox.x1 + Math.random() * w;
      const y = bbox.y1 + Math.random() * h;
      if (ctx.isPointInPath(path2d, x, y)) return [x, y];
    }
    return [bbox.x1 + w / 2, bbox.y1 + h / 2]; // fallback for a pathologically thin glyph
  }

  const sites = [randomPointInGlyph()];
  while (sites.length < count) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < candidatesPerPoint; i++) {
      const candidate = randomPointInGlyph();
      const minDistToExisting = Math.min(
        ...sites.map(([sx, sy]) => Math.hypot(sx - candidate[0], sy - candidate[1])),
      );
      if (minDistToExisting > bestScore) {
        bestScore = minDistToExisting;
        best = candidate;
      }
    }
    sites.push(best);
  }
  return sites;
}

/** Moves every vertex toward the polygon's centroid by a fixed distance — a cheap approximation
 * of erosion/inset that's good enough for the roughly-convex, star-shaped cells Voronoi produces
 * here. Creates the visual gap between adjacent cells with no separate stroke/line drawn. */
export function insetPolygon(points, gap) {
  if (gap <= 0) return points;
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const shrink = Math.max(0, dist - gap) / dist;
    return [cx + dx * shrink, cy + dy * shrink];
  });
}

/** Same corner-rounding technique as hero-editor.mjs's roundPolygonPath — copied, not imported,
 * matching this tool's self-contained convention. Safe to apply per-cell here since cells are
 * never merged (each is independently inset first), so there's no shared-seam notching. */
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
