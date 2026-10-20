import * as sword from "./weapons.js";

export const FAMILIES = {
  "weapon-sword": sword
};

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