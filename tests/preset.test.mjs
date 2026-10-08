import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, validatePreset, generateSites } from "../scripts/lib/preset.mjs";
import { getPalettes } from "../scripts/lib/brand-tokens.mjs";

const palettes = getPalettes();
const base = {
  name: "t",
  format: "tile",
  palette: "rule-on-paper",
  field: { seed: 7, count: 12 },
};

test("named formats exist with the spec dimensions", () => {
  assert.deepEqual(FORMATS.tile, { w: 1200, h: 800 });
  assert.deepEqual(FORMATS.mark, { w: 1200, h: 1200 });
  assert.deepEqual(FORMATS["ig-post"], { w: 1080, h: 1350 });
  assert.deepEqual(FORMATS["ig-story"], { w: 1080, h: 1920 });
  assert.deepEqual(FORMATS.og, { w: 1200, h: 630 });
  assert.deepEqual(FORMATS.hero, { w: 1600, h: 1100 });
});

test("valid preset normalizes with defaults", () => {
  const p = validatePreset(base, palettes);
  assert.equal(p.stroke, 4);
  assert.equal(p.cornerRadius, 25);
  assert.equal(p.fill, "none");
  assert.equal(p.padRatio, 0.05);
  assert.deepEqual(p.transform, {
    scale: 1,
    stretchX: 1,
    stretchY: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
  });
});

test("fail-loud: unknown palette / format / key; missing sites+field; both", () => {
  assert.throws(
    () => validatePreset({ ...base, palette: "nope" }, palettes),
    /unknown palette/,
  );
  assert.throws(
    () => validatePreset({ ...base, format: "a4" }, palettes),
    /unknown format/,
  );
  assert.throws(
    () => validatePreset({ ...base, wat: 1 }, palettes),
    /unknown key/,
  );
  assert.throws(
    () =>
      validatePreset(
        { name: "t", format: "tile", palette: "rule-on-paper" },
        palettes,
      ),
    /sites or field/,
  );
  assert.throws(
    () =>
      validatePreset(
        { ...base, sites: [[0, 0], [1, 1], [2, 2]] },
        palettes,
      ),
    /not both/,
  );
});

test("generateSites is deterministic and in-bounds", () => {
  const a = generateSites({ seed: 7, count: 12 }, { w: 1200, h: 800 }, 0.28);
  const b = generateSites({ seed: 7, count: 12 }, { w: 1200, h: 800 }, 0.28);
  assert.deepEqual(a, b);
  assert.equal(a.length, 12);
  const c = generateSites({ seed: 8, count: 12 }, { w: 1200, h: 800 }, 0.28);
  assert.notDeepEqual(a, c);
  for (const [x, y] of a) {
    assert.ok(x >= -0.28 * 1200 && x <= 1200 * 1.28);
    assert.ok(y >= -0.28 * 800 && y <= 800 * 1.28);
  }
});
