// scripts/lib/preset.mjs — preset schema for brand renders. A preset is the
// reproducibility contract: every committed render names its preset, and both
// the manual lab and the agent skill read/write this format.
export const FORMATS = {
  mark: { w: 1200, h: 1200 },
  "ig-post": { w: 1080, h: 1350 },
  "ig-story": { w: 1080, h: 1920 },
  og: { w: 1200, h: 630 },
  tile: { w: 1200, h: 800 },
  hero: { w: 1600, h: 1100 },
  "linkedin-banner": { w: 1129, h: 191 },
};

const KNOWN_KEYS = new Set([
  "name",
  "format",
  "palette",
  "sites",
  "field",
  "transform",
  "stroke",
  "cornerRadius",
  "fill",
  "fillOpacity",
  "padRatio",
  "pillarImages",
  "notes",
]);
const IDENTITY = {
  scale: 1,
  stretchX: 1,
  stretchY: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
};

/** mulberry32 — tiny deterministic PRNG; seed in, same field out, forever. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform sites over the padded box (matches the render clip bounds). */
export function generateSites(field, { w, h }, padRatio) {
  const rnd = mulberry32(field.seed);
  const px = padRatio * w;
  const py = padRatio * h;
  const sites = [];
  for (let i = 0; i < field.count; i++) {
    sites.push([-px + rnd() * (w + 2 * px), -py + rnd() * (h + 2 * py)]);
  }
  return sites;
}

/** Validate + normalize. Throws with a precise message on anything off. */
export function validatePreset(raw, palettes) {
  for (const k of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(k)) throw new Error(`preset: unknown key "${k}"`);
  }
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error("preset: name (string) is required");
  }
  if (!FORMATS[raw.format]) {
    throw new Error(
      `preset: unknown format "${raw.format}" (known: ${Object.keys(FORMATS).join(", ")})`,
    );
  }
  if (!palettes[raw.palette]) {
    throw new Error(
      `preset: unknown palette "${raw.palette}" (known: ${Object.keys(palettes).join(", ")})`,
    );
  }
  if (raw.sites && raw.field)
    throw new Error("preset: sites or field, not both");
  if (!raw.sites && !raw.field)
    throw new Error("preset: sites or field is required");
  if (raw.sites) {
    if (
      !Array.isArray(raw.sites) ||
      raw.sites.length < 3 ||
      raw.sites.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          p.some((n) => typeof n !== "number"),
      )
    ) {
      throw new Error("preset: sites must be ≥3 [x,y] number pairs");
    }
  } else if (
    !Number.isInteger(raw.field.seed) ||
    !Number.isInteger(raw.field.count) ||
    raw.field.count < 3
  ) {
    throw new Error("preset: field needs integer seed and count ≥ 3");
  }
  if (raw.fill && raw.fill !== "none" && raw.fill !== "ramp") {
    throw new Error('preset: fill must be "none" or "ramp"');
  }
  if (raw.fill === "ramp" && !palettes[raw.palette].ramp) {
    throw new Error(
      `preset: palette "${raw.palette}" has no ramp for fill: "ramp"`,
    );
  }
  if (
    raw.pillarImages &&
    (!Array.isArray(raw.pillarImages) ||
      raw.pillarImages.some((p) => typeof p !== "string"))
  ) {
    throw new Error("preset: pillarImages must be an array of file paths");
  }
  return {
    name: raw.name,
    format: raw.format,
    palette: raw.palette,
    sites: raw.sites ?? null,
    field: raw.field ?? null,
    transform: { ...IDENTITY, ...(raw.transform ?? {}) },
    stroke: raw.stroke ?? 4,
    cornerRadius: raw.cornerRadius ?? 25,
    fill: raw.fill ?? "none",
    fillOpacity: raw.fillOpacity ?? 0.12,
    // Default 0.05: standalone assets should fill the frame. The old 0.28
    // default was inherited from the live hero, where scattering sites over
    // ~2.4x the canvas area gives a sparse, zoomed-in field behind text —
    // correct there, wrong here. Request ~0.28 explicitly for that look.
    padRatio: raw.padRatio ?? 0.05,
    pillarImages: raw.pillarImages ?? null,
    notes: raw.notes ?? "",
  };
}
