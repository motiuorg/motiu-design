import { LIB_FAMILIES } from "./color-library.mjs";

export function defaultState() {
  return {
    letter: "M",
    fontKey: "geist-bold",
    cellCount: 3, // 2–4, "shapes" from the original brief
    mode: "freeform", // 'freeform' | 'circular'
    circle: null, // { cx, cy, r } — derived from the glyph bbox on letter change if null
    gap: 2.5, // inset toward each cell's own centroid — this is what makes the crack/gap read
    cornerRadius: 3,
    cellColors: {}, // { [cellIndex]: hex } — unset cells fall back to baseColor
    baseColor: LIB_FAMILIES[0].stops[3], // shared default so an unpainted mark still reads as one color, not gray
    selectedCell: null,
    activeColor: LIB_FAMILIES[0].stops[3],
    background: { mode: "transparent", color: "#FFFFFF" },
    editingSites: false,
  };
}
