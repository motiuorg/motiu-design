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
The package holds no site content. Components that render it read YAML from the **consuming project's**
`src/data/`; this repo ships sample versions in `src/data/` for the workshop site.

| File | Read by | Keys |
|---|---|---|
| `site.yaml` | `Layout`, `Nav`, `LangSwitch`, `Footer` | `name`, `url`, `description` (required); `favicon`, `ogImage`, `ogImageWidth`, `ogImageHeight`, `titleTemplate` (default `{title} · {name}`), `goatcounter` (analytics URL), `legalNote`, `locales` |
| `nav.yaml` | `Nav` | `items` (`id`, `href`, `label`, `external?`), `cta`, `label`, `homeLabel` |
| `footer.yaml` | `Footer` | `columns` (`label`, `links`), `blurb` (falls back to `legalNote`), `meta` |
| `stats.yaml`, `process.yaml` | `StatBand`, `ProcessStrip` | see the samples |

**Languages.** `site.yaml` declares `locales: { default, list: [{ code, label }] }`. The default language is
served unprefixed and the others under `/<code>/`. Without a `locales` block a site is single-language and
`LangSwitch` renders nothing. Any user-visible string in these files may be a plain string or a per-language
map (`{ es: "…", en: "…" }`). Internal links (starting with `/`) take the current language prefix and the
project's `base` path. Astro's own i18n routing is used when the project configures it; otherwise the language
is read from the URL.

## Develop

```bash
npm install
npm run dev     # workshop site: /design-system and /lab
npm test        # brand-token + preset + voronoi tests
```

Large render output (`brand/renders/`) is not tracked; regenerate with `scripts/render-motif.mjs`.

Preset `pillarImages` are relative to an assets folder, because the photos belong to the website. The renderer looks in `--assets <dir>`, then `$MOTIU_ASSETS_DIR`, then `../motiu-website/public/assets`.
