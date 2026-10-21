import assert from "node:assert/strict";
import test from "node:test";
import { listFamilies } from "../lib/generators/index.js";
import { forgeModel } from "../lib/model-forge.js";

const layout = model => model.elements.map(e => e.name + ":" + JSON.stringify(e.from) + ":" + JSON.stringify(e.to) + ":" + JSON.stringify(e.rotation)).join("|");
const atlasSum = png => png.reduce((acc, byte) => (acc + byte) % 1000000007, 0);
const signature = forged => JSON.stringify(forged.stats.bounds.size) + "#" + forged.stats.elements + "#" + layout(forged.model).length + "#" + atlasSum(forged.png);

test("every boolean parameter actually changes the model or its atlas", () => {
  for (const entry of listFamilies()) {
    const specs = entry.params || {};
    for (const key of Object.keys(specs).filter(k => specs[k].type === "boolean")) {
      const on = forgeModel({ family: entry.family, params: { [key]: true } });
      const off = forgeModel({ family: entry.family, params: { [key]: false } });
      assert.notEqual(signature(on), signature(off), entry.family + "." + key + " is a no-op switch");
    }
  }
});

test("every numeric parameter reaches the geometry", () => {
  for (const entry of listFamilies()) {
    const specs = entry.params || {};
    for (const key of Object.keys(specs).filter(k => specs[k].type === "number")) {
      const low = forgeModel({ family: entry.family, params: { [key]: specs[key].min } });
      const high = forgeModel({ family: entry.family, params: { [key]: specs[key].max } });
      assert.notEqual(signature(low), signature(high), entry.family + "." + key + " does not reach the geometry");
    }
  }
});