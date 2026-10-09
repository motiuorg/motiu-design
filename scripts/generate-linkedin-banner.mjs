#!/usr/bin/env node
// generate-linkedin-banner.mjs — batch-generates LinkedIn company-page
// banner (1129x191) candidates: a Voronoi cell field with the 3 largest
// cells filled with the pillar photos, at a few seeds/cell-counts/styles so
// you can pick a winner instead of hand-tuning one. Round-1 convention
// mirrors the rest of brand/presets + brand/renders (see render-motif.mjs).
// Usage: node scripts/generate-linkedin-banner.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderSvg, renderPng } from "./render-motif.mjs";
import { loadTokens, getPalettes } from "./lib/brand-tokens.mjs";
import { validatePreset } from "./lib/preset.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
// Stored in presets relative to the assets dir (the photos live in the
// website); resolved to real files only for rendering. Same lookup order as
// render-motif.mjs: $MOTIU_ASSETS_DIR, else the sibling website repo.
const PILLAR_IMAGES = [
  "pillar-photos/network-coordination-highlight.jpg",
  "pillar-photos/collective-intelligence-highlight.jpg",
  "pillar-photos/regenerative-finance-highlight.jpg",
];
const ASSETS_DIR = resolve(
  process.env.MOTIU_ASSETS_DIR ?? join(ROOT, "../motiu-website/public/assets"),
);

// Round 2: round-1 feedback was "h and e's layouts are closest, but drop the
// pillar-tinted ramp entirely — paper colors only, like the live hero."
// So every variant here is locked to the hero's own palette (paper bg, rule
// stroke, no fill) and only seed/count vary — pure shape + image-placement
// exploration, no color axis. Seeds 37/68 are e/h carried forward unchanged
// (now in the right palette); the rest are new layouts.
const ROUND = 2;
const VARIANTS = [
  { letter: "a", seed: 37, count: 12 }, // round-1 "e" layout, corrected palette
  { letter: "b", seed: 68, count: 11 }, // round-1 "h" layout, corrected palette
  { letter: "c", seed: 15, count: 9 },
  { letter: "d", seed: 44, count: 10 },
  { letter: "e", seed: 77, count: 8 },
  { letter: "f", seed: 91, count: 12 },
  { letter: "g", seed: 29, count: 10 },
  { letter: "h", seed: 103, count: 11 },
].map((v) => ({ ...v, fill: "none", palette: "rule-on-paper" }));

async function main() {
  const palettes = getPalettes(loadTokens());
  const outDir = join(ROOT, `brand/renders/linkedin-banner/round-${ROUND}`);
  const presetDir = join(ROOT, "brand/presets");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(presetDir, { recursive: true });

  for (const v of VARIANTS) {
    const name = `linkedin-banner-r${ROUND}-${v.letter}`;
    const preset = validatePreset(
      {
        name,
        format: "linkedin-banner",
        palette: v.palette,
        field: { seed: v.seed, count: v.count },
        padRatio: 0.05,
        cornerRadius: 12,
        stroke: 3,
        fill: v.fill,
        fillOpacity: 0.14,
        pillarImages: PILLAR_IMAGES,
        notes: `seed ${v.seed}, ${v.count} cells, fill:${v.fill}, palette:${v.palette}`,
      },
      palettes,
    );
    writeFileSync(join(presetDir, name + ".json"), JSON.stringify(preset, null, 2) + "\n");

    const svg = renderSvg(
      { ...preset, pillarImages: preset.pillarImages.map((p) => join(ASSETS_DIR, p)) },
      palettes,
    );
    const svgPath = join(outDir, name + ".svg");
    writeFileSync(svgPath, svg);

    const pngPath = join(outDir, name + ".png");
    const ok = await renderPng(svgPath, pngPath, { w: 1129, h: 191 });
    console.log(`${name}: ${ok ? pngPath : svgPath + " (png skipped)"}`);
  }

  // Reuse the existing round-based contact sheet builder for review.
  await import("node:child_process").then(({ execFileSync }) =>
    execFileSync(
      process.execPath,
      [join(ROOT, "scripts/render-contact-sheet.mjs"), "--dir", join(ROOT, "brand/renders/linkedin-banner")],
      { stdio: "inherit" },
    ),
  );
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
