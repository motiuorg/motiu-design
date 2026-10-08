/**
 * glyph.mjs — loads a real font, used only for the outer silhouette. Everything inside that
 * silhouette (the Voronoi cells) has nothing to do with the font; opentype.js just gives us a
 * clip boundary shaped like the letter, the same role a hand-drawn outline would play.
 */
import { parse as parseFont } from "https://cdn.jsdelivr.net/npm/opentype.js@latest/+esm";

export const FONT_OPTIONS = {
  "geist-bold": {
    label: "Geist Bold (outline only)",
    url: "https://raw.githubusercontent.com/vercel/geist-font/main/fonts/Geist/ttf/Geist-Bold.ttf",
  },
};

const fontCache = new Map();

function loadFont(key) {
  if (!fontCache.has(key)) {
    const url = FONT_OPTIONS[key].url;
    fontCache.set(
      key,
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => parseFont(buf)),
    );
  }
  return fontCache.get(key);
}

/**
 * Letter + font → a normalized SVG path `d` string, its bounding box, and a Path2D for
 * point-in-glyph hit-testing (used to seed Voronoi sites only inside the letter, including
 * correctly leaving holes/counters like the inside of an "O" empty — TrueType contour winding
 * is already nonzero/evenodd-consistent, so this just works, no special-casing).
 *
 * The transform (uniform scale + center) is baked into the path's own coordinates once here,
 * rather than applied via an SVG `transform` attribute downstream — so the exact same `d` is
 * usable identically for the <clipPath> and for canvas hit-testing, no separate coordinate
 * spaces to keep in sync.
 */
export async function getGlyphOutline(fontKey, letter, { viewBox = [0, 0, 100, 100], fill = 0.78 } = {}) {
  const font = await loadFont(fontKey);
  const rawPath = font.getPath(letter, 0, 0, 1000);
  if (!rawPath.commands.length) return null;

  const bbox = rawPath.getBoundingBox();
  const w = bbox.x2 - bbox.x1;
  const h = bbox.y2 - bbox.y1;
  const [vx1, vy1, vx2, vy2] = viewBox;
  const vw = vx2 - vx1;
  const vh = vy2 - vy1;
  const target = Math.min(vw, vh) * fill;
  const scale = target / Math.max(w, h);
  const cx = (bbox.x1 + bbox.x2) / 2;
  const cy = (bbox.y1 + bbox.y2) / 2;
  const tx = (vx1 + vx2) / 2;
  const ty = (vy1 + vy2) / 2;

  // opentype.js y-axis runs opposite SVG's (font-space is +y up, SVG is +y down) — flip y
  // while normalizing so the glyph doesn't render upside down.
  const norm = (x, y) => [(x - cx) * scale + tx, (cy - y) * scale + ty];

  for (const cmd of rawPath.commands) {
    for (const [xk, yk] of [["x", "y"], ["x1", "y1"], ["x2", "y2"]]) {
      if (cmd[xk] !== undefined) {
        const [nx, ny] = norm(cmd[xk], cmd[yk]);
        cmd[xk] = nx;
        cmd[yk] = ny;
      }
    }
  }

  const d = rawPath.toPathData(2);
  const path2d = new Path2D(d);

  // Re-derive the bbox in normalized (viewBox) space for seeding/bounds.
  const corners = [norm(bbox.x1, bbox.y1), norm(bbox.x2, bbox.y2)];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const normBBox = { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };

  return { d, path2d, bbox: normBBox };
}
