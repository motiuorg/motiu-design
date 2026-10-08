/**
 * export.mjs — SVG + PNG export.
 *
 * Not a cross-import from ../hero-editor/layers.mjs — no existing lab tool imports across
 * sibling tool folders (each is self-contained and independently copyable), and this tool has
 * no equivalent of the hero tool's canvas-composited decorative layers to justify sharing that
 * larger export function. Only the proven *technique* (serialize SVG → blob URL → offscreen
 * canvas → toBlob) is reused, as a small local implementation.
 */

export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Clones the live SVG, strips interactive-only elements, serializes it. */
function cleanSvgClone(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll("[data-interactive-only]").forEach((el) => el.remove());
  return clone;
}

export function exportSvg(svgEl, filename) {
  const clone = cleanSvgClone(svgEl);
  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function exportPng(svgEl, { width, height, scale = 3 } = {}, filename) {
  const clone = cleanSvgClone(svgEl);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas unsupported"));
  ctx.scale(scale, scale);

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          reject(new Error("PNG export failed"));
          return;
        }
        if (filename) downloadBlob(pngBlob, filename);
        resolve(pngBlob);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterize SVG"));
    };
    img.src = url;
  });
}
