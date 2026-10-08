# motiu-design

The motiu design system: tokens, themes, Astro components, brand tooling, the lab and the inspo library.
One source, many consumers: `motiu-website`, `altiplano-map`, and future projects.

## What's in here

| Path | What |
|---|---|
| `src/styles/` | `tokens.css` (structural), `themes/` (palette + type), `global.css`, `lab.css` |
| `src/components/` | Shared Astro components (Layout, Nav, Footer, Hero, Tile, cards, badges…) |
| `src/lib/` | Voronoi core + live hero |
| `src/pages/design-system/` | Documentation pages (colors, type, spacing, components…) |
| `src/pages/lab/`, `public/lab-tools/` | Experiments: voronoi letters, hero editor, color/font comparison |
| `scripts/`, `brand/presets/` | Brand render tooling (motifs, LinkedIn/social formats) |
| `inspo/` | Inspiration library (images tracked with Git LFS) |

## Use it in a project

```json
"dependencies": { "@motiu/design": "github:motiuorg/motiu-design#v0.1.0" }
```

```js
// astro.config.mjs
export default defineConfig({ vite: { ssr: { noExternal: ["@motiu/design"] } } });
```

```astro
---
import Layout from "@motiu/design/components/Layout.astro";
---
```

### Contract: the consumer provides its content
Components that render site content (`Layout`, `Nav`, `Footer`, `StatBand`, `ProcessStrip`) read YAML from
the **consuming project's** `src/data/`: `site.yaml`, `stats.yaml`, `process.yaml`, `sibling-surfaces.yaml`.
This repo ships sample versions in `src/data/` for the workshop site.

## Develop

```bash
npm install
npm run dev     # workshop site: /design-system and /lab
npm test        # brand-token + preset + voronoi tests
```

Large render output (`brand/renders/`) is not tracked; regenerate with `scripts/render-motif.mjs`.
