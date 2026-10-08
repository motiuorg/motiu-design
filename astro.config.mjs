import { defineConfig } from "astro/config";

// motiu-design workshop: /design-system (documentation) + /lab (experiments).
// The same repo is also the @motiu/design package (see package.json "exports").
export default defineConfig({
  site: "https://design.motiu.org",
  output: "static",
  build: { format: "directory" },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ca", "es"],
    routing: { prefixDefaultLocale: false, fallbackType: "rewrite" },
    fallback: { ca: "en", es: "en" },
  },
});
