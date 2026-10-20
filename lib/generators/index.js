import * as sword from "./weapons.js";
import * as props from "./props.js";
import * as polearms from "./polearms.js";
import * as creature from "./creature.js";

export const FAMILIES = Object.assign(
  {},
  sword.FAMILIES || { "weapon-sword": sword },
  props.FAMILIES || {},
  polearms.FAMILIES || {},
  creature.FAMILIES || {}
);

export function listFamilies() {
  return Object.entries(FAMILIES).map(([id, mod]) => ({
    family: id,
    label: mod.LABEL,
    params: mod.PARAMS
  }));
}

export function getFamily(id) {
  const mod = FAMILIES[id];
  if (!mod) throw new Error("unknown family: " + id + " (available: " + Object.keys(FAMILIES).join(", ") + ")");
  return mod;
}