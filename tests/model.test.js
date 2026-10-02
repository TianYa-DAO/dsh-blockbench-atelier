import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import test from "node:test";
import { catalog } from "../bin/mc-atelier.js";
import { createModel } from "../lib/generate.js";
import { analyzeModel, boxFaces, validateModel } from "../lib/model.js";

const spec = {
  name: "test_creature",
  atlasWidth: 64,
  atlasHeight: 64,
  detailRate: 0,
  parts: [
    { name: "body", from: [-4, 0, -2], to: [4, 10, 2] },
    { name: "head", from: [-3, 10, -3], to: [3, 16, 3], pivot: [0, 10, 0], rotation: [0, 0, 4] }
  ]
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "mc-atelier-test-"));
  t.after(async () => {
    const absolute = resolve(directory), base = resolve(tmpdir()) + sep;
    assert.ok(absolute.startsWith(base), "test cleanup path must stay within the system temp directory");
    await rm(absolute, { recursive: true, force: true });
  });
  return directory;
}

test("box UV maps all six faces to the expected rectangles", () => {
  const faces = boxFaces([2, 3], [4, 2, 1], 7);
  assert.deepEqual(faces, {
    north: { uv: [3, 4, 7, 6], texture: 7 },
    east: { uv: [7, 4, 8, 6], texture: 7 },
    south: { uv: [8, 4, 12, 6], texture: 7 },
    west: { uv: [2, 4, 3, 6], texture: 7 },
    up: { uv: [3, 3, 7, 4], texture: 7 },
    down: { uv: [7, 3, 8, 4], texture: 7 }
  });
});

test("generator writes a valid editable model and atlas", async t => {
  const directory = await temporaryDirectory(t);
  const modelPath = join(directory, "creature.bbmodel"), atlasPath = join(directory, "atlas.png");
  assert.ok(isAbsolute(modelPath));
  await createModel(spec, { modelPath, atlasPath });
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  const validation = validateModel(model);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.equal(model.elements.length, 2);
  assert.equal(model.groups.length, 3);
  assert.ok(model.textures[0].source.startsWith("data:image/png;base64,"));
  assert.ok((await readFile(atlasPath)).length > 24);
  const analysis = analyzeModel(model);
  assert.equal(analysis.cubes, 2);
});

test("generator accepts the published example spec", async t => {
  const directory = await temporaryDirectory(t);
  const example = JSON.parse(await readFile(new URL("../examples/creature.json", import.meta.url), "utf8"));
  const modelPath = join(directory, "example.bbmodel");
  await createModel(example, { modelPath });
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  assert.equal(validateModel(model).ok, true);
  assert.equal(model.elements.length, example.parts.length);
});

test("validator rejects active faces with missing UV or texture references", async t => {
  const directory = await temporaryDirectory(t);
  const modelPath = join(directory, "creature.bbmodel");
  await createModel(spec, { modelPath });
  const original = JSON.parse(await readFile(modelPath, "utf8"));
  const missingUv = structuredClone(original);
  delete missingUv.elements[0].faces.north.uv;
  assert.ok(validateModel(missingUv).issues.some(issue => issue.code === "UV"));
  const missingTexture = structuredClone(original);
  missingTexture.elements[0].faces.north.texture = "absent";
  assert.ok(validateModel(missingTexture).issues.some(issue => issue.code === "TEXTURE_REF"));
});

test("generator refuses to replace an existing output", async t => {
  const directory = await temporaryDirectory(t);
  const modelPath = join(directory, "existing.bbmodel"), original = "keep this file";
  await writeFile(modelPath, original);
  await assert.rejects(createModel(spec, { modelPath }), /never overwritten/i);
  assert.equal(await readFile(modelPath, "utf8"), original);
});

test("catalog reports metadata without embedding source image bytes", async t => {
  const directory = await temporaryDirectory(t);
  const modelPath = join(directory, "creature.bbmodel");
  await createModel(spec, { modelPath });
  const result = await catalog(directory);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.assetsCopied, false);
  assert.equal(result.samples[0].cubes, 2);
  assert.equal(JSON.stringify(result).includes("data:image/png;base64"), false);
});
