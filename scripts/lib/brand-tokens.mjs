// scripts/lib/brand-tokens.mjs — resolves brand tokens for the render CLI by
// PARSING the canonical theme CSS (src/styles/themes/editorial-organic.css).
// Single source of truth; if the theme moves, the tests fail loud.
// ⚠️ public/lab-tools/colors-locked.json is the STALE 2026-05-31 lock — never
// consume it here (it still carries pre-relock red #C92637).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const THEME_CSS = fileURLToPath(
  new URL("../../src/styles/themes/editorial-organic.css", import.meta.url),
);

/** Mix two hex colors in sRGB: aWeight of a + (1-aWeight) of b. Mirrors
 * CSS color-mix(in srgb, a W%, b (100-W)%). */
export function mixHex(aHex, bHex, aWeight) {
  const ch = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const mix = (i) =>
    Math.round(ch(aHex, i) * aWeight + ch(bHex, i) * (1 - aWeight));
  return (
    "#" + [0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0")).join("")
  );
}

/** Parse `--name: #hex` declarations. First definition wins (the :root block
 * precedes .on-dark, which carries no raw hexes anyway). */
export function loadTokens(cssPath = THEME_CSS) {
  const css = readFileSync(cssPath, "utf8");
  const tokens = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    if (!(m[1] in tokens)) tokens[m[1]] = m[2];
  }
  for (const req of ["pillar-flow-4", "umber", "paper", "pillar-neural-3"]) {
    if (!tokens[req]) {
      throw new Error(
        `brand-tokens: --${req} not found in ${cssPath} — theme moved or renamed?`,
      );
    }
  }
  // --rule is color-mix(in srgb, var(--umber) 65%, var(--paper) 35%) in CSS;
  // resolve it here because SVG attributes can't use color-mix.
  tokens.rule = mixHex(tokens.umber, tokens.paper, 0.65);
  return tokens;
}

const ramp = (t, pillar) =>
  [1, 2, 3, 4].map((i) => t[`pillar-${pillar}-${i}`]);

/** Named palettes for presets. bg + stroke are hexes; ramp (optional) cycles
 * across cells when a preset asks for fill: "ramp". */
export function getPalettes(tokens = loadTokens()) {
  const t = tokens;
  return {
    "rule-on-paper": { bg: t.paper, stroke: t.rule, ramp: null },
    "umber-on-paper": { bg: t.paper, stroke: t.umber, ramp: null },
    "primary-on-paper": { bg: t.paper, stroke: t["pillar-flow-4"], ramp: null },
    "primary-on-bone": { bg: t.bone, stroke: t["pillar-flow-4"], ramp: null },
    "paper-on-umber": { bg: t.umber, stroke: t.paper, ramp: null },
    neural: {
      bg: t.paper,
      stroke: t["pillar-neural-3"],
      ramp: ramp(t, "neural"),
    },
    tissue: {
      bg: t.paper,
      stroke: t["pillar-tissue-3"],
      ramp: ramp(t, "tissue"),
    },
    flow: { bg: t.paper, stroke: t["pillar-flow-3"], ramp: ramp(t, "flow") },
  };
}
