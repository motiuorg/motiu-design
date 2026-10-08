import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSvg } from "../scripts/render-motif.mjs";
import { getPalettes } from "../scripts/lib/brand-tokens.mjs";
import { validatePreset } from "../scripts/lib/preset.mjs";

const palettes = getPalettes();

test("renderSvg: bg rect + one path per cell + correct dimensions", () => {
  const preset = validatePreset(
    { name: "t", format: "tile", palette: "rule-on-paper", field: { seed: 7, count: 12 } },
    palettes,
  );
  const svg = renderSvg(preset, palettes);
  assert.match(svg, /viewBox="0 0 1200 800"/);
  assert.match(svg, /<rect[^>]+fill="#fffdfb"/);
  const cells = svg.match(/<path /g) || [];
  assert.equal(cells.length, 12);
  assert.match(svg, /stroke="#6f6964"/);
  assert.doesNotMatch(svg, /C92637/); // stale pre-relock red never renders
});

test("renderSvg: ramp fill cycles the pillar ramp", () => {
  const preset = validatePreset(
    { name: "t", format: "mark", palette: "neural", field: { seed: 3, count: 6 }, fill: "ramp" },
    palettes,
  );
  const svg = renderSvg(preset, palettes);
  assert.match(svg, /fill="#96F3FF"/);  // ramp step 1 (v5 relock)
  assert.match(svg, /fill-opacity="0.12"/);
});

test("renderSvg is deterministic for a field preset", () => {
  const p = validatePreset(
    { name: "t", format: "og", palette: "umber-on-paper", field: { seed: 11, count: 9 } },
    palettes,
  );
  assert.equal(renderSvg(p, palettes), renderSvg(p, palettes));
});
