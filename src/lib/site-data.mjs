// site-data.mjs — consumer-data helpers shared by Layout, Nav, LangSwitch and
// Footer. The design system holds no site content: every project supplies it
// in its own src/data/*.yaml, read from the project root (process.cwd()).
//
//   site.yaml    name, url, description, [legalNote], [ogImage], [favicon],
//                [titleTemplate], [goatcounter], [locales]
//   nav.yaml     items, cta, label
//   footer.yaml  blurb, columns, meta
//
// Any user-visible string may be a plain string or a per-language map
// ({ es: "…", en: "…" }); see t().
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/** Read src/data/<name> from the consuming project. */
export function readData(name, { optional = false } = {}) {
  const file = path.join(process.cwd(), "src/data", name);
  if (optional && !fs.existsSync(file)) return null;
  return yaml.load(fs.readFileSync(file, "utf8"));
}

/**
 * Language setup from site.yaml:
 *   locales: { default: es, list: [{ code: es, label: ES }, { code: en, label: EN }] }
 * The default language is served unprefixed, the others under /<code>/.
 * Without a `locales` block a site is single-language.
 */
export function getLocales(site) {
  const list = site.locales?.list ?? [{ code: "en", label: "EN" }];
  return { list, default: site.locales?.default ?? list[0].code };
}

/** BASE_URL without its trailing slash ("" at the site root). */
export const baseOf = (baseUrl) => (baseUrl ?? "/").replace(/\/+$/, "");

/** Current language and language-free path for a request pathname. */
export function locate(pathname, locales, baseUrl) {
  const base = baseOf(baseUrl);
  let p = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if (!p.startsWith("/")) p = "/" + p;
  let loc = locales.default;
  for (const l of locales.list) {
    if (l.code === locales.default) continue;
    const prefix = "/" + l.code;
    if (p === prefix || p.startsWith(prefix + "/")) {
      loc = l.code;
      p = p.slice(prefix.length) || "/";
      break;
    }
  }
  return { loc, logicalPath: p || "/" };
}

/**
 * The language of the page being rendered. Astro's own i18n routing wins when
 * the project configures it (it stays right on rewrite-fallback pages, whose
 * URL has no prefix); otherwise the language is read from the URL.
 */
export function currentLang(Astro, locales, baseUrl) {
  const l = Astro.currentLocale;
  if (l && locales.list.some((x) => x.code === l)) return l;
  return locate(Astro.url.pathname, locales, baseUrl).loc;
}

/** Site-internal href for a language: base + language prefix + path. */
export function localize(href, loc, locales, baseUrl) {
  return baseOf(baseUrl) + (loc === locales.default ? "" : "/" + loc) + href;
}

/** Pick the string for a language from a plain string or a per-language map. */
export function t(value, loc, locales) {
  if (value == null || typeof value === "string") return value;
  return value[loc] ?? value[locales.default] ?? Object.values(value)[0];
}

/** True for hrefs that stay on this site (and so take base + language). */
export const isInternal = (href) => typeof href === "string" && href.startsWith("/");
