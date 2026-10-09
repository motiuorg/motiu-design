#!/usr/bin/env node
// render-motif.mjs — preset JSON → SVG (+ optional PNG). The headless half of
// the Voronoi motif pipeline; the manual half is public/lab-tools/hero-lab.html.
// Usage:
//   node scripts/render-motif.mjs --preset brand/presets/<name>.json
//     [--out brand/renders/<target>/round-1] [--assets <dir>] [--png] [--smoke]
//   Preset pillarImages are relative to --assets (default $MOTIU_ASSETS_DIR, else
//   ../motiu-website/public/assets).
// Never deploys anything. brand/ is outside src/ and public/, so nothing here
// reaches the built site.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, isAbsolute, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeCellPolygons,
  roundPolygonPath,
} from "../src/lib/voronoi-core.mjs";
import { loadTokens, getPalettes } from "./lib/brand-tokens.mjs";
import { FORMATS, validatePreset, generateSites } from "./lib/preset.mjs";

/** Shoelace area of a polygon ring (absolute — winding direction doesn't
 * matter for the "biggest cells" ranking that consumes this). */
function polygonArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function polygonBbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

const MIME_BY_EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

/** Data-URI-encode an image so the SVG is self-contained (no relative-path
 * resolution needed when the render is copied/screenshotted elsewhere). */
function imageDataUri(path) {
  const mime = MIME_BY_EXT[extname(path).toLowerCase()];
  if (!mime) throw new Error(`renderSvg: unsupported image type "${path}"`);
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

export function renderSvg(preset, palettes) {
  const { w, h } = FORMATS[preset.format];
  const pal = palettes[preset.palette];
  const sites =
    preset.sites ?? generateSites(preset.field, { w, h }, preset.padRatio);
  const pad = { x: preset.padRatio * w, y: preset.padRatio * h };
  const polys = computeCellPolygons({
    sites,
    transform: preset.transform,
    viewBox: { w, h },
    pad,
  });

  // Pillar cells: the N largest non-degenerate cells get a clipped photo
  // (largest-first so a photo never lands in a sliver). Keyed by site index
  // so the ramp fill below stays aligned for the untouched cells.
  const pillarBySiteIndex = new Map();
  if (preset.pillarImages && preset.pillarImages.length) {
    const byArea = polys
      .map((poly, i) => (poly ? { i, area: polygonArea(poly) } : null))
      .filter(Boolean)
      .sort((a, b) => b.area - a.area)
      .slice(0, preset.pillarImages.length);
    byArea.forEach(({ i }, rank) => pillarBySiteIndex.set(i, preset.pillarImages[rank]));
  }

  const cells = polys
    .map((poly, i) => {
      // Keep the ramp indexed by site index (i) even though degenerate
      // (null) cells are dropped from the joined output — otherwise a
      // dropped cell would shift the ramp fill of every cell after it.
      if (poly === null) return null;
      const d = roundPolygonPath(poly, preset.cornerRadius);
      const outline = `stroke="${pal.stroke}" stroke-width="${preset.stroke}" stroke-linejoin="round" stroke-linecap="round"`;
      const imagePath = pillarBySiteIndex.get(i);
      if (imagePath) {
        const clipId = `pillar-clip-${i}`;
        const { minX, maxX, minY, maxY } = polygonBbox(poly);
        // Pad the image past the cell's bbox so `slice` always has enough
        // to cover every corner once clipped to the rounded cell shape.
        const bw = maxX - minX;
        const bh = maxY - minY;
        const pctX = bw * 0.15;
        const pctY = bh * 0.15;
        return [
          `  <clipPath id="${clipId}"><path d="${d}"/></clipPath>`,
          `  <image href="${imageDataUri(imagePath)}" x="${minX - pctX}" y="${minY - pctY}" width="${bw + 2 * pctX}" height="${bh + 2 * pctY}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`,
          `  <path d="${d}" fill="none" ${outline}/>`,
        ].join("\n");
      }
      const fill =
        preset.fill === "ramp"
          ? `fill="${pal.ramp[i % pal.ramp.length]}" fill-opacity="${preset.fillOpacity}"`
          : `fill="none"`;
      return `  <path d="${d}" ${fill} ${outline}/>`;
    })
    .filter((s) => s !== null)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${pal.bg}"/>
${cells}
</svg>
`;
}

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

export async function renderPng(svgPath, pngPath, { w, h }) {
  const chrome = CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) {
    console.warn("png: SKIPPED — no Chrome/Chromium found (SVG still written)");
    return false;
  }
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: chrome });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await page.goto("file://" + svgPath);
    await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: w, height: h } });
  } finally {
    await browser.close();
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const presetPath = get("--preset");
  if (!presetPath) {
    console.error("usage: render-motif --preset <file.json> [--out <dir>] [--png] [--smoke]");
    process.exit(1);
  }
  const palettes = getPalettes(loadTokens());
  const preset = validatePreset(
    JSON.parse(readFileSync(presetPath, "utf8")),
    palettes,
  );
  // pillarImages are relative to an assets folder (the photos live in the
  // consuming website, not here). --assets > $MOTIU_ASSETS_DIR > sibling repo.
  const assetsDir = resolve(
    get("--assets") ?? process.env.MOTIU_ASSETS_DIR ?? "../motiu-website/public/assets",
  );
  if (preset.pillarImages) {
    preset.pillarImages = preset.pillarImages.map((p) =>
      isAbsolute(p) ? p : join(assetsDir, p),
    );
  }
  const outDirArg = get("--out") ?? "brand/renders/_scratch";
  const outDir = isAbsolute(outDirArg) ? outDirArg : join(process.cwd(), outDirArg);
  mkdirSync(outDir, { recursive: true });
  const svg = renderSvg(preset, palettes);
  const svgPath = join(outDir, basename(presetPath, ".json") + ".svg");
  writeFileSync(svgPath, svg);
  // Count outline paths, not raw `<path`: a pillar-image cell emits two
  // (a clipPath shape + the outline redrawn on top), only the latter of
  // which carries stroke-width, so this stays 1-per-cell either way.
  const cellCount = (svg.match(/stroke-width="/g) || []).length;
  console.log(`svg: ${svgPath} (${cellCount} cells, ${preset.format}, ${preset.palette})`);
  if (args.includes("--smoke")) {
    const expected = preset.sites ? preset.sites.length : preset.field.count;
    if (cellCount !== expected) {
      console.error(`smoke: FAIL — ${cellCount} cells, expected ${expected}`);
      process.exit(1);
    }
    console.log("smoke: OK");
  }
  if (args.includes("--png")) {
    const ok = await renderPng(svgPath, svgPath.replace(/\.svg$/, ".png"), FORMATS[preset.format]);
    if (ok) console.log(`png: ${svgPath.replace(/\.svg$/, ".png")}`);
  }
}

// Robust against spaces/URL-escaping in the path (this repo lives under
// ".../03 Libraries/..."), unlike a raw "file://" + process.argv[1] compare.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
