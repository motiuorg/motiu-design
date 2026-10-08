/**
 * voronoi-letters.mjs — Voronoi letter-logo generator.
 *
 * The outer silhouette comes from a real font (Geist Bold), used only as a clip boundary — no
 * typographic detail shows, since the inside is entirely covered by Voronoi cells. Each cell is
 * seeded independently inside the glyph, inset toward its own centroid (creating the gap between
 * neighboring cells — no line is drawn, the gap is background color showing through), and
 * corner-rounded. Cells default to one shared color, so an unpainted mark reads as a single
 * solid shape with thin gaps between its pieces; clicking a cell repaints just that one.
 */
import { Delaunay } from "https://cdn.jsdelivr.net/npm/d3-delaunay@6/+esm";
import { getGlyphOutline } from "./glyph.mjs";
import { seedInGlyph, insetPolygon, roundPolygonPath } from "./voronoi-fill.mjs";
import { buildSwatchGrid, markActiveSwatch } from "./color-library.mjs";
import { exportSvg, exportPng } from "./export.mjs";
import { defaultState } from "./default-state.mjs";

const VB = { x1: 0, y1: 0, x2: 100, y2: 100 };
const BOUNDS_PAD = 10;

export function initVoronoiLetters() {
  const svg = document.querySelector("[data-vl-svg]");
  const cellsEl = document.querySelector("[data-vl-cells]");
  const handlesEl = document.querySelector("[data-vl-handles]");
  const letterClipShapesEl = document.querySelector("[data-vl-letter-clip-shapes]");
  const clipCircleEl = document.querySelector("[data-vl-clip-circle]");
  const bgRectEl = document.querySelector("[data-vl-bg]");
  const clipGroupEl = document.querySelector("[data-vl-clip-group]");
  const swatchGridEl = document.querySelector("[data-vl-swatches]");
  const statusEl = document.querySelector("[data-vl-status]");
  const panel = document.querySelector("[data-vl-panel]");
  if (!svg || !cellsEl || !handlesEl || !clipCircleEl || !bgRectEl || !clipGroupEl || !letterClipShapesEl || !panel) {
    throw new Error("Voronoi letters markup missing");
  }

  const hitCanvas = document.createElement("canvas");
  const hitCtx = hitCanvas.getContext("2d");

  let state = defaultState();
  let sites = [];
  let bbox = null;
  let glyphD = "";
  let glyphPath2D = null;
  let loading = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  async function regenerateGlyphAndSites() {
    loading = true;
    setStatus("Loading font…");
    const outline = await getGlyphOutline(state.fontKey, state.letter, { viewBox: [VB.x1, VB.y1, VB.x2, VB.y2] });
    loading = false;
    if (!outline) {
      setStatus(`"${state.letter}" has no outline in this font — try another character.`);
      sites = [];
      letterClipShapesEl.innerHTML = "";
      cellsEl.innerHTML = "";
      return;
    }
    glyphD = outline.d;
    glyphPath2D = outline.path2d;
    bbox = outline.bbox;

    letterClipShapesEl.innerHTML = "";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", glyphD);
    letterClipShapesEl.appendChild(path);

    if (!state.circle) {
      state.circle = {
        cx: (bbox.x1 + bbox.x2) / 2,
        cy: (bbox.y1 + bbox.y2) / 2,
        r: Math.max(bbox.x2 - bbox.x1, bbox.y2 - bbox.y1) / 2,
      };
    }

    hitCanvas.width = VB.x2 - VB.x1;
    hitCanvas.height = VB.y2 - VB.y1;
    sites = seedInGlyph(hitCtx, glyphPath2D, bbox, state.cellCount);
    state.cellColors = {};
    state.selectedCell = null;
    setStatus("");
  }

  function clientToSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const local = pt.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  }

  function render() {
    if (loading || !bbox) return;
    const bounds = [bbox.x1 - BOUNDS_PAD, bbox.y1 - BOUNDS_PAD, bbox.x2 + BOUNDS_PAD, bbox.y2 + BOUNDS_PAD];
    const delaunay = Delaunay.from(sites);
    const voronoi = delaunay.voronoi(bounds);

    cellsEl.innerHTML = "";
    for (let i = 0; i < sites.length; i++) {
      const poly = voronoi.cellPolygon(i);
      if (!poly) continue;
      const inset = insetPolygon(poly, state.gap);
      const fill = state.cellColors[i] || state.baseColor;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", roundPolygonPath(inset, state.cornerRadius));
      path.setAttribute("fill", fill);
      path.dataset.cellIndex = String(i);
      path.classList.add("vl-cell");
      if (state.selectedCell === i) path.classList.add("is-selected");
      cellsEl.appendChild(path);
    }

    if (state.mode === "circular") {
      clipCircleEl.setAttribute("cx", String(state.circle.cx));
      clipCircleEl.setAttribute("cy", String(state.circle.cy));
      clipCircleEl.setAttribute("r", String(state.circle.r));
      clipGroupEl.setAttribute("clip-path", "url(#vl-circle-clip)");
    } else {
      clipGroupEl.removeAttribute("clip-path");
    }

    // `hidden` only works inside a live HTML document — the cloned/serialized SVG used for
    // export (both the .svg file and the PNG rasterization step) is a standalone SVG document,
    // where `hidden` has no effect and a fill-less <rect> defaults to opaque black. Toggle the
    // fill itself instead, so transparent mode is genuinely transparent everywhere, not just
    // on-screen.
    bgRectEl.setAttribute("fill", state.background.mode === "solid" ? state.background.color : "none");

    renderHandles();
  }

  function renderHandles() {
    handlesEl.innerHTML = "";
    handlesEl.toggleAttribute("hidden", !state.editingSites);
    if (!state.editingSites) return;
    sites.forEach((site, i) => {
      const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      handle.setAttribute("cx", String(site[0]));
      handle.setAttribute("cy", String(site[1]));
      handle.setAttribute("r", "1.4");
      handle.classList.add("vl-handle");
      handle.dataset.index = String(i);
      handle.setAttribute("data-interactive-only", "");
      handlesEl.appendChild(handle);
    });
  }

  // --- Site dragging + cell painting ---
  let dragIndex = -1;
  svg.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".vl-handle");
    if (handle) {
      dragIndex = Number(handle.dataset.index);
      event.preventDefault();
      return;
    }
    const cell = event.target.closest(".vl-cell");
    if (cell) {
      const i = Number(cell.dataset.cellIndex);
      state.selectedCell = i;
      state.cellColors[i] = state.activeColor;
      setStatus(`Painted shape ${i + 1} · ${state.activeColor}`);
      render();
    }
  });
  window.addEventListener("pointermove", (event) => {
    if (dragIndex < 0) return;
    const [x, y] = clientToSvg(event.clientX, event.clientY);
    sites[dragIndex] = [x, y];
    render();
  });
  window.addEventListener("pointerup", () => {
    dragIndex = -1;
  });

  // --- Panel wiring ---
  async function onLetterChange(value) {
    const letter = (value || "").slice(0, 1) || "M";
    state.letter = letter;
    state.circle = null;
    await regenerateGlyphAndSites();
    syncCircleControlsVisibility();
    render();
  }

  function bindLetterInput() {
    const input = panel.querySelector("[data-vl-letter-input]");
    if (!input) return;
    input.value = state.letter;
    input.addEventListener("change", () => onLetterChange(input.value));
  }

  function bindCellCount() {
    const input = panel.querySelector("[data-vl-cell-count]");
    const output = panel.querySelector("[data-vl-cell-count-out]");
    if (!input) return;
    input.value = state.cellCount;
    if (output) output.textContent = state.cellCount;
    input.addEventListener("input", async () => {
      state.cellCount = Number(input.value);
      if (output) output.textContent = state.cellCount;
      if (bbox) {
        sites = seedInGlyph(hitCtx, glyphPath2D, bbox, state.cellCount);
        state.cellColors = {};
        state.selectedCell = null;
      }
      render();
    });
  }

  function bindSlider(selector, outSelector, key, format) {
    const input = panel.querySelector(selector);
    const output = outSelector ? panel.querySelector(outSelector) : null;
    if (!input) return;
    input.value = state[key];
    if (output) output.textContent = format ? format(state[key]) : state[key];
    input.addEventListener("input", () => {
      const value = Number(input.value);
      state[key] = value;
      if (output) output.textContent = format ? format(value) : value;
      render();
    });
  }

  function bindCircleSlider(selector, circleKey) {
    const input = panel.querySelector(selector);
    if (!input) return;
    input.addEventListener("input", () => {
      state.circle[circleKey] = Number(input.value);
      const output = panel.querySelector(`[data-vl-circle-${circleKey}-out]`);
      if (output) output.textContent = input.value;
      render();
    });
  }

  function syncCircleControlsVisibility() {
    const circleZone = panel.querySelector("[data-vl-circle-zone]");
    if (circleZone) circleZone.classList.toggle("is-disabled", state.mode !== "circular");
    panel.querySelectorAll("[data-vl-circle-cx],[data-vl-circle-cy],[data-vl-circle-r]").forEach((input) => {
      const key = input.dataset.vlCircleCx !== undefined ? "cx" : input.dataset.vlCircleCy !== undefined ? "cy" : "r";
      input.min = key === "r" ? "5" : "-20";
      input.max = key === "r" ? "80" : "100";
      input.value = state.circle ? state.circle[key] : 0;
      const output = panel.querySelector(`[data-vl-circle-${key}-out]`);
      if (output) output.textContent = state.circle ? state.circle[key].toFixed(0) : "0";
    });
  }

  function bindModeToggle() {
    panel.querySelectorAll("[data-vl-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.mode = btn.dataset.vlMode;
        panel.querySelectorAll("[data-vl-mode]").forEach((b) => b.classList.toggle("is-active", b === btn));
        syncCircleControlsVisibility();
        render();
        setStatus(`Shape: ${state.mode}`);
      });
    });
  }

  function bindEditToggle() {
    const btn = panel.querySelector("[data-vl-edit-toggle]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      state.editingSites = !state.editingSites;
      btn.classList.toggle("is-active", state.editingSites);
      renderHandles();
      setStatus(state.editingSites ? "Editing sites — drag the pink handles." : "");
    });
  }

  function bindShuffle() {
    const btn = panel.querySelector("[data-vl-shuffle]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!bbox) return;
      sites = seedInGlyph(hitCtx, glyphPath2D, bbox, state.cellCount);
      render();
      setStatus("Shuffled seed positions.");
    });
  }

  function bindClearFill() {
    const btn = panel.querySelector("[data-vl-clear-fill]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (state.selectedCell === null) {
        setStatus("Select a shape first — click any colored region.");
        return;
      }
      delete state.cellColors[state.selectedCell];
      render();
      setStatus(`Cleared shape ${state.selectedCell + 1} back to base color.`);
    });
  }

  function bindFillAll() {
    const btn = panel.querySelector("[data-vl-fill-all]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      state.baseColor = state.activeColor;
      state.cellColors = {};
      render();
      setStatus(`Filled all shapes with ${state.activeColor}.`);
    });
  }

  function bindBackground() {
    panel.querySelectorAll("[data-vl-bg-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.background.mode = btn.dataset.vlBgMode;
        panel.querySelectorAll("[data-vl-bg-mode]").forEach((b) => b.classList.toggle("is-active", b === btn));
        render();
      });
    });
    const colorInput = panel.querySelector("[data-vl-bg-color]");
    if (colorInput) {
      colorInput.addEventListener("input", () => {
        state.background.color = colorInput.value;
        render();
      });
    }
  }

  function bindSwatchGrid() {
    if (!swatchGridEl) return;
    buildSwatchGrid(swatchGridEl, {
      activeHex: state.activeColor,
      onPick: (hex) => {
        state.activeColor = hex;
        markActiveSwatch(swatchGridEl, hex);
        if (state.selectedCell !== null) {
          state.cellColors[state.selectedCell] = hex;
          render();
        }
        setStatus(`Active color: ${hex}`);
      },
    });
  }

  function bindExport() {
    const svgBtn = panel.querySelector("[data-vl-export-svg]");
    const pngBtn = panel.querySelector("[data-vl-export-png]");
    if (svgBtn) {
      svgBtn.addEventListener("click", () => {
        exportSvg(svg, `voronoi-${state.letter.toLowerCase()}.svg`);
        setStatus("Exported SVG.");
      });
    }
    if (pngBtn) {
      pngBtn.addEventListener("click", () => {
        exportPng(svg, { width: VB.x2, height: VB.y2, scale: 8 }, `voronoi-${state.letter.toLowerCase()}.png`)
          .then(() => setStatus("Exported PNG."))
          .catch((err) => setStatus("PNG export failed: " + err.message));
      });
    }
  }

  function bindReset() {
    const btn = panel.querySelector("[data-vl-reset]");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      state = defaultState();
      const letterInput = panel.querySelector("[data-vl-letter-input]");
      if (letterInput) letterInput.value = state.letter;
      panel.querySelectorAll("[data-vl-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.vlMode === state.mode));
      panel.querySelectorAll("[data-vl-bg-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.vlBgMode === state.background.mode));
      const cellCountInput = panel.querySelector("[data-vl-cell-count]");
      if (cellCountInput) cellCountInput.value = state.cellCount;
      await regenerateGlyphAndSites();
      syncCircleControlsVisibility();
      if (swatchGridEl) markActiveSwatch(swatchGridEl, state.activeColor);
      render();
      setStatus("Reset to defaults.");
    });
  }

  bindLetterInput();
  bindCellCount();
  bindSlider("[data-vl-gap]", "[data-vl-gap-out]", "gap", (v) => Number(v).toFixed(1));
  bindSlider("[data-vl-corner]", "[data-vl-corner-out]", "cornerRadius");
  bindCircleSlider("[data-vl-circle-cx]", "cx");
  bindCircleSlider("[data-vl-circle-cy]", "cy");
  bindCircleSlider("[data-vl-circle-r]", "r");
  bindModeToggle();
  bindEditToggle();
  bindShuffle();
  bindClearFill();
  bindFillAll();
  bindBackground();
  bindSwatchGrid();
  bindExport();
  bindReset();

  regenerateGlyphAndSites().then(() => {
    syncCircleControlsVisibility();
    render();
  });
}
