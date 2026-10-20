import assert from "node:assert/strict";
import test from "node:test";
import { listFamilies } from "../lib/generators/index.js";
import { forgeModel } from "../lib/model-forge.js";
import { MATERIALS, MATERIAL_NAMES, paintTile } from "../lib/generators/materials.js";

test("the recipe registry exposes weapon-sword with documented parameters", () => {
  const families = listFamilies();
  const sword = families.find(f => f.family === "weapon-sword");
  assert.ok(sword, "weapon-sword must be registered");
  for (const key of ["variant", "length", "width", "segments", "guardSpan", "grip", "gems", "runes"]) assert.ok(sword.params[key], "missing param " + key);
  assert.deepEqual(sword.params.variant.options, ["longsword", "greatsword", "dagger"]);
});

test("every material paints a full 16x16 opaque tile", () => {
  for (const name of MATERIAL_NAMES) {
    const px = paintTile(name);
    assert.equal(px.length, 16 * 16 * 4);
    for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 255, name + " must be opaque");
  }
  assert.equal(MATERIALS.gem.kind, "gem");
});

test("every registered family forges a clean model with default parameters", () => {
  const families = listFamilies();
  assert.ok(families.length >= 10, "expected at least 10 families, got " + families.length);
  for (const entry of families) {
    const forged = forgeModel({ family: entry.family, params: {} });
    assert.equal(forged.stats.validate.errors, 0, entry.family + " errors: " + JSON.stringify(forged.stats.validate));
    assert.ok(forged.stats.elements >= 25, entry.family + " only " + forged.stats.elements + " elements");
    assert.equal(forged.model.textures[0].uv_width, 16, entry.family + " uv_width");
    assert.ok(forged.stats.materials.length <= 8, entry.family + " uses more than 8 materials");
    const lowest = Math.min(...forged.model.elements.map(e => Math.min(e.from[1], e.to[1])));
    assert.equal(Number.isFinite(lowest), true, entry.family + " has a non-finite floor");
    assert.ok(lowest <= 0, entry.family + " lowest point should be at or below the origin, got " + lowest);
  }
});

test("every family parameter really changes the silhouette", () => {
  for (const entry of listFamilies()) {
    const params = entry.params || {};
    const numeric = Object.keys(params).filter(k => params[k].type === "number");
    if (!numeric.length) continue;
    const low = {};
    const high = {};
    for (const key of numeric) { low[key] = params[key].min; high[key] = params[key].max; }
    const a = forgeModel({ family: entry.family, params: low });
    const b = forgeModel({ family: entry.family, params: high });
    const changed = JSON.stringify(a.stats.bounds.size) !== JSON.stringify(b.stats.bounds.size) || a.stats.elements !== b.stats.elements;
    assert.equal(changed, true, entry.family + " ignores its numeric parameters");
  }
});

test("forging a longsword produces a valid textured model", () => {
  const forged = forgeModel({ family: "weapon-sword", params: { variant: "longsword" }, name: "t_sword" });
  assert.ok(forged.stats.elements >= 40, "expected a detailed blade, got " + forged.stats.elements);
  assert.equal(forged.stats.validate.ok, true, JSON.stringify(forged.stats.validate));
  assert.equal(forged.stats.validate.errors, 0);
  const model = forged.model;
  assert.equal(model.meta.model_format, "bedrock");
  assert.equal(model.textures[0].width, 128);
  assert.equal(model.textures[0].uv_width, 16);
  assert.equal(model.outliner.length, model.elements.length);
});

test("every face UV stays inside the 16-unit logical space", () => {
  const forged = forgeModel({ family: "weapon-sword", params: { variant: "greatsword" } });
  for (const element of forged.model.elements) {
    for (const face of Object.values(element.faces)) {
      assert.equal(face.uv.every(v => Number.isFinite(v) && v >= 0 && v <= 16), true, element.name + " uv " + JSON.stringify(face.uv));
      assert.equal(face.texture, 0);
    }
  }
});

test("variants change the silhouette and an unknown family is refused", () => {
  const sword = forgeModel({ family: "weapon-sword", params: { variant: "longsword" } });
  const great = forgeModel({ family: "weapon-sword", params: { variant: "greatsword" } });
  const dagger = forgeModel({ family: "weapon-sword", params: { variant: "dagger" } });
  assert.ok(great.stats.elements > sword.stats.elements);
  assert.ok(sword.stats.elements > dagger.stats.elements);
  assert.ok(great.stats.bounds.size[1] > sword.stats.bounds.size[1]);
  assert.throws(() => forgeModel({ family: "weapon-axe_bogus" }), /unknown family/);
});