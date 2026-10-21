import assert from "node:assert/strict";
import test from "node:test";
import { getFamily } from "../lib/generators/index.js";
import { forgeModel } from "../lib/model-forge.js";

function bladeProfile(parts) {
  const segs = new Map();
  for (const part of parts) {
    const match = part.name.match(/^blade_(\d+)_/);
    if (!match) continue;
    const key = match[1];
    const cur = segs.get(key) || { y0: Infinity, y1: -Infinity, hw: 0 };
    cur.y0 = Math.min(cur.y0, part.from[1]);
    cur.y1 = Math.max(cur.y1, part.to[1]);
    cur.hw = Math.max(cur.hw, Math.abs(part.from[0]), Math.abs(part.to[0]));
    segs.set(key, cur);
  }
  return [...segs.values()].sort((a, b) => a.y0 - b.y0);
}

test("the blade is slim and only narrows near the tip", () => {
  for (const variant of ["longsword", "greatsword", "dagger"]) {
    const profile = bladeProfile(getFamily("weapon-sword").build({ variant }));
    assert.ok(profile.length >= 10, variant + " needs at least ten segments");
    const base = profile[0].hw;
    const bladeLen = profile[profile.length - 1].y1 - profile[0].y0;
    const aspect = bladeLen / (base * 2);
    assert.ok(aspect >= 6 && aspect <= 10, variant + " blade aspect must sit between 6 and 10, got " + aspect.toFixed(2));
    for (const seg of profile) {
      const t = (seg.y0 - profile[0].y0) / bladeLen;
      if (t < 0.68) assert.ok(seg.hw >= base * 0.84, variant + " narrows too early: t=" + t.toFixed(2) + " hw=" + seg.hw.toFixed(2));
    }
    const tip = profile[profile.length - 1];
    assert.ok(tip.hw < base * 0.5, variant + " tip must come to a point, got " + tip.hw.toFixed(2));
  }
});

test("the crossguard stays proportionate to the blade", () => {
  const forged = forgeModel({ family: "weapon-sword", params: { variant: "longsword" } });
  const size = forged.stats.bounds.size;
  assert.ok(size[0] < size[1] / 3.5, "the guard must not rival the blade length, got " + JSON.stringify(size));
});