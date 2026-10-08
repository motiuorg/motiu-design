#!/usr/bin/env node
// render-contact-sheet.mjs — brand/renders/<target>/ → contact-sheet.html
// (flat grid of every round's SVGs, opens off file://). The review surface for
// the operator kill/iterate/candidate pass — the refi-dao-os contact-sheet
// pattern, minus animation.
// Usage: node scripts/render-contact-sheet.mjs --dir brand/renders/org-os-tile
import { readdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--dir");
const dir = i >= 0 ? args[i + 1] : null;
if (!dir) {
  console.error("usage: render-contact-sheet --dir brand/renders/<target>");
  process.exit(1);
}

const rounds = readdirSync(dir)
  .filter((d) => /^round-\d+$/.test(d) && statSync(join(dir, d)).isDirectory())
  .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));

let cards = "";
for (const round of rounds) {
  const svgs = readdirSync(join(dir, round)).filter((f) => f.endsWith(".svg")).sort();
  for (const f of svgs) {
    cards += `    <figure><img src="${round}/${f}" loading="lazy"><figcaption>${round} · ${f.replace(/\.svg$/, "")}</figcaption></figure>\n`;
  }
}

writeFileSync(
  join(dir, "contact-sheet.html"),
  `<!doctype html><meta charset="utf-8"><title>contact sheet — ${dir}</title>
<style>
  body{font:14px/1.4 ui-monospace,monospace;background:#faf8f4;color:#221a12;margin:2rem}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.5rem}
  figure{margin:0;border:1px solid #ddd}
  img{width:100%;height:auto;display:block}
  figcaption{padding:.4rem .6rem;border-top:1px solid #ddd}
</style>
<h1>${dir}</h1>
<p>Review: <strong>kill / iterate / candidate</strong> per figure. Slop gate:
recognisably ours next to ten other regen projects, or discard.</p>
<main>
${cards}</main>
`,
);
console.log(`contact sheet: ${join(dir, "contact-sheet.html")} (${rounds.length} rounds)`);
