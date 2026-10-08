import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTokens, getPalettes, mixHex } from "../scripts/lib/brand-tokens.mjs";

test("tokens parse from the canonical theme CSS (v5 relock values)", () => {
  const t = loadTokens();
  assert.equal(t["pillar-flow-4"], "#8A2200"); // primary since 2026-08-14 (was --terracotta #D12B00)
  assert.equal(t["pillar-neural-3"], "#00AEFF"); // v5 relock — Core step
  assert.equal(t["pillar-tissue-4"], "#2C5A0D");
  assert.equal(t.umber, "#221a12");
  assert.equal(t.paper, "#fffdfb");
});

test("rule is resolved from the color-mix (SVG has no color-mix)", () => {
  const t = loadTokens();
  // 65% umber #221a12 + 35% paper #fffdfb
  assert.equal(t.rule, mixHex("#221a12", "#fffdfb", 0.65));
  assert.equal(t.rule, "#6f6964");
});

test("palettes resolve against tokens and refuse the stale JSON", () => {
  const p = getPalettes();
  assert.equal(p["primary-on-paper"].stroke, "#8A2200");
  assert.equal(p["rule-on-paper"].bg, "#fffdfb");
  assert.equal(p.neural.ramp.length, 4);
  assert.equal(p.neural.ramp[2], "#00AEFF");
  assert.ok(
    !Object.values(p).some((x) => x.stroke === "#C92637"),
    "pre-relock red must not appear in any palette",
  );
});
