/**
 * color-library.mjs — the site's 10-family/6-step Color Library, hand-ported.
 *
 * Canonical source: src/pages/design-system/colors.astro (the "Color Library" section) — this
 * is the only place this data exists in the repo; there's no portable JSON/CSS-var export to
 * import instead, so this is a direct copy. If the Design System's library changes, re-copy it
 * here by hand (same situation as this tool's sibling, hero-lab.html, which also carries its
 * own frozen copy of tokens rather than reading the live site's).
 */

export const LIB_STEP_ROLES = ["Tint", "Light", "Soft", "Core", "Dark", "Shade"];

export const LIB_FAMILIES = [
  { label: "red", name: "Red", stops: ["#FFE0E0", "#FFA8A8", "#FF4D4D", "#E60000", "#A30000", "#5C0000"] },
  { label: "orange", name: "Orange", stops: ["#FFECB0", "#FFD27B", "#FFBB26", "#FF7A00", "#FF5500", "#8A2200"] },
  { label: "yellow", name: "Yellow", stops: ["#FFFBD1", "#FFF67A", "#FFEE00", "#E6D400", "#A69900", "#5C5400"] },
  { label: "lime", name: "Lime", stops: ["#EFFFB8", "#DFFF80", "#D9FF4A", "#8FE84A", "#6DBF23", "#2C5A0D"] },
  { label: "green", name: "Green", stops: ["#D6FFEA", "#94FFC7", "#33E894", "#00B86B", "#00804A", "#00502E"] },
  { label: "cyan", name: "Cyan", stops: ["#C9F7FF", "#96F3FF", "#4DEFFF", "#00AEFF", "#0055FF", "#000FA0"] },
  { label: "blue", name: "Blue", stops: ["#E8EAFF", "#C2C8FF", "#8F97FF", "#5B62F0", "#3A3AC0", "#1F1D80"] },
  { label: "purple", name: "Purple", stops: ["#F5E1FF", "#E5BBFF", "#CE7AFF", "#A62FFF", "#750FCC", "#3D0870"] },
  { label: "pink", name: "Pink", stops: ["#FFE0F2", "#FFB0DE", "#FF5FB8", "#FF1E9C", "#C40074", "#6E0040"] },
  { label: "gray", name: "Gray", stops: ["#F4F4F2", "#E3E3DF", "#C9C9C3", "#9C9C94", "#6B6B63", "#3A3A34"] },
];

/**
 * Builds the 10×6 clickable swatch grid into `container`. Reuses the existing (previously
 * unused) .voronoi-editor__swatch button styling from hero-editor.css for individual swatches —
 * only the grid container layout is new, in voronoi-letters.css.
 */
export function buildSwatchGrid(container, { activeHex, onPick }) {
  container.innerHTML = "";
  for (const family of LIB_FAMILIES) {
    family.stops.forEach((hex, stepIndex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "voronoi-editor__swatch letter-swatch";
      btn.style.background = hex;
      btn.title = `${family.name} · ${LIB_STEP_ROLES[stepIndex]} · ${hex}`;
      btn.dataset.hex = hex;
      if (hex.toLowerCase() === (activeHex || "").toLowerCase()) btn.classList.add("is-active");
      btn.addEventListener("click", () => onPick(hex));
      container.appendChild(btn);
    });
  }
}

/** Updates which swatch button carries .is-active without rebuilding the whole grid. */
export function markActiveSwatch(container, activeHex) {
  const hex = (activeHex || "").toLowerCase();
  container.querySelectorAll(".letter-swatch").forEach((btn) => {
    btn.classList.toggle("is-active", (btn.dataset.hex || "").toLowerCase() === hex);
  });
}
