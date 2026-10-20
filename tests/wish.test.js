import assert from "node:assert/strict";
import test from "node:test";
import { routeWish, resolveParams } from "../lib/wish.js";
import { listFamilies } from "../lib/generators/index.js";

test("a fancy greatsword wish routes to the sword family with the greatsword variant", () => {
  const route = routeWish("一把华丽的大剑");
  assert.equal(route.ok, true);
  assert.equal(route.family, "weapon-sword");
  assert.equal(route.known, true);
  assert.equal(route.params.variant, "greatsword");
  assert.equal(route.params.gems, true);
  assert.ok(route.confidence > 0.6);
});

test("a small dagger wish routes to the dagger variant", () => {
  const route = routeWish("短小的匕首");
  assert.equal(route.family, "weapon-sword");
  assert.equal(route.params.variant, "dagger");
  assert.ok(route.params.__widthScale < 1);
});

test("english wishes work too", () => {
  const route = routeWish("an elegant long sword");
  assert.equal(route.family, "weapon-sword");
  assert.equal(route.known, true);
});

test("a wish for a family that is not installed reports known=false but still routes", () => {
  const route = routeWish("一对翅膀");
  assert.equal(route.ok, true);
  assert.equal(route.family, "creature-wing");
  assert.equal(route.known, false);
});

test("nonsense returns a plan with the available list instead of throwing", () => {
  const route = routeWish("随便来点啥");
  assert.equal(route.ok, false);
  assert.ok(Array.isArray(route.available));
  assert.ok(route.available.includes("weapon-sword"));
  assert.throws(() => routeWish("   "), /non-empty/);
});

test("scale words become concrete numbers against family defaults", () => {
  const family = listFamilies().find(f => f.family === "weapon-sword");
  const long = resolveParams(routeWish("很长的长剑"), family.params);
  assert.ok(long.length > family.params.length.default, "long wish should grow length, got " + long.length);
  const slim = resolveParams(routeWish("细长的长剑"), family.params);
  assert.ok(slim.width < family.params.width.default, "slim wish should shrink width");
  assert.equal(slim.__widthScale, undefined);
});

test("an explicit number with a length word overrides the default", () => {
  const family = listFamilies().find(f => f.family === "weapon-sword");
  const params = resolveParams(routeWish("长 24 的剑"), family.params);
  assert.equal(params.length, 24);
});