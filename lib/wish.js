import { listFamilies } from "./generators/index.js";

const VARIANTS = [
  { words: ["巨剑", "大剑", "greatsword", "great_sword"], family: "weapon-sword", params: { variant: "greatsword" } },
  { words: ["匕首", "短剑", "dagger", "dirk"], family: "weapon-sword", params: { variant: "dagger" } },
  { words: ["长剑", "直剑", "单手剑", "longsword", "sword", "剑"], family: "weapon-sword", params: {} }
];

const FAMILY_WORDS = [
  { family: "weapon-axe", words: ["战斧", "斧头", "斧", "axe", "hatchet", "battleaxe"] },
  { family: "weapon-spear", words: ["长矛", "长枪", "矛", "枪", "戟", "spear", "lance", "halberd", "pike"] },
  { family: "weapon-hammer", words: ["战锤", "巨锤", "锤", "hammer", "maul", "mace"] },
  { family: "prop-lantern", words: ["提灯", "路灯", "灯", "灯笼", "lantern", "lamp"] },
  { family: "prop-chest", words: ["宝箱", "箱子", "储物箱", "chest", "crate", "box"] },
  { family: "prop-sign", words: ["告示牌", "路牌", "牌子", "牌坊", "sign", "signpost", "post"] },
  { family: "creature-wing", words: ["翅膀", "翼", "羽翼", "wing", "wings"] },
  { family: "creature-horn", words: ["角", "犄角", "头饰", "horn", "horns"] },
  { family: "armor-crown", words: ["王冠", "头冠", "皇冠", "crown", "tiara"] }
];

const SCALE_RULES = [
  { words: ["巨大", "超大", "huge", "enormous"], apply: p => Object.assign({}, p, { length: 1.35, width: 1.3 }) },
  { words: ["大", "big", "large", "厚重"], apply: p => Object.assign({}, p, { width: 1.2 }) },
  { words: ["小", "迷你", "small", "tiny", "短小"], apply: p => Object.assign({}, p, { width: 0.82 }) },
  { words: ["修长", "细长", "slim", "slender", "elegant"], apply: p => Object.assign({}, p, { width: 0.78, length: 1.12 }) },
  { words: ["短", "short"], apply: p => Object.assign({}, p, { length: 0.78 }) },
  { words: ["长", "long", "tall", "高"], apply: p => Object.assign({}, p, { length: 1.18 }) },
  { words: ["华丽", "繁复", "ornate", "fancy", "royal", "皇家"], apply: p => Object.assign({}, p, { gems: true, runes: true }) },
  { words: ["朴素", "简单", "plain", "simple", "rustic"], apply: p => Object.assign({}, p, { gems: false, runes: false }) },
  { words: ["符文", "发光", "rune", "runes", "glow", "glowing"], apply: p => Object.assign({}, p, { runes: true }) }
];

const NUMBER_RE = /(\d+(?:\.\d+)?)\s*(?:单位|格|units?|blocks?)?/;

function scoreText(text, words) {
  let hits = [];
  for (const word of words) if (text.includes(word.toLowerCase())) hits.push(word);
  return hits;
}

export function routeWish(rawWish) {
  const wish = String(rawWish || "").trim();
  if (!wish) throw new Error("wish must be a non-empty string");
  const text = wish.toLowerCase();
  const known = listFamilies().map(f => f.family);
  const ranked = [];
  for (const rule of VARIANTS) {
    const hits = scoreText(text, rule.words);
    if (hits.length) ranked.push({ family: rule.family, hits, params: Object.assign({}, rule.params), weight: hits.length + Math.max(...hits.map(h => h.length)) * 0.1 });
  }
  for (const rule of FAMILY_WORDS) {
    const hits = scoreText(text, rule.words);
    if (hits.length) ranked.push({ family: rule.family, hits, params: {}, weight: hits.length + Math.max(...hits.map(h => h.length)) * 0.1 });
  }
  ranked.sort((a, b) => b.weight - a.weight);
  const top = ranked[0] || null;
  if (!top) {
    return {
      ok: false,
      reason: "no family keyword matched this wish",
      wish,
      available: known,
      released: listFamilies().filter(f => f.quality === "release").map(f => f.family),
      hint: "name a shape (sword, axe, lantern, wing, crown) or add the family id explicitly"
    };
  }
  const params = Object.assign({}, top.params);
  const notes = [];
  for (const rule of SCALE_RULES) {
    const hits = scoreText(text, rule.words);
    if (!hits.length) continue;
    const applied = rule.apply({ length: 1, width: 1 });
    if (applied.gems !== undefined) { params.gems = applied.gems; notes.push("gems=" + applied.gems + " (" + hits[0] + ")"); }
    if (applied.runes !== undefined) { params.runes = applied.runes; notes.push("runes=" + applied.runes + " (" + hits[0] + ")"); }
    if (applied.length && applied.length !== 1) { params.__lengthScale = (params.__lengthScale || 1) * applied.length; notes.push("length x" + applied.length + " (" + hits[0] + ")"); }
    if (applied.width && applied.width !== 1) { params.__widthScale = (params.__widthScale || 1) * applied.width; notes.push("width x" + applied.width + " (" + hits[0] + ")"); }
  }
  const numberMatch = text.match(NUMBER_RE);
  if (numberMatch) {
    const value = Number(numberMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      if (/长|高|long|tall|height|length/.test(text)) { params.__lengthAbsolute = value; notes.push("length=" + value); }
      else { params.__widthAbsolute = value; notes.push("width=" + value); }
    }
  }
  const matchFamily = listFamilies().find(f => f.family === top.family);
  const quality = matchFamily ? matchFamily.quality : "release";
  if (quality !== "release") notes.push("this family is still a draft: " + top.family + " is structurally valid but its silhouette is not final");
  return {
    ok: true,
    wish,
    family: top.family,
    quality,
    known: known.includes(top.family),
    matched: top.hits,
    params,
    notes,
    confidence: Math.min(0.95, 0.55 + top.hits.length * 0.12 + (known.includes(top.family) ? 0.15 : 0)),
    alternatives: ranked.slice(1, 4).map(r => ({ family: r.family, matched: r.hits }))
  };
}

export function resolveParams(route, familyParams) {
  const params = Object.assign({}, route.params || {});
  const defaultLength = familyParams && familyParams.length ? Number(familyParams.length.default) : undefined;
  const defaultWidth = familyParams && familyParams.width ? Number(familyParams.width.default) : undefined;
  const lengthScale = params.__lengthScale;
  const widthScale = params.__widthScale;
  const lengthAbs = params.__lengthAbsolute;
  const widthAbs = params.__widthAbsolute;
  delete params.__lengthScale;
  delete params.__widthScale;
  delete params.__lengthAbsolute;
  delete params.__widthAbsolute;
  if (lengthAbs !== undefined && familyParams && familyParams.length) params.length = lengthAbs;
  else if (lengthScale && defaultLength) params.length = Math.round(defaultLength * lengthScale * 100) / 100;
  if (widthAbs !== undefined && familyParams && familyParams.width) params.width = widthAbs;
  else if (widthScale && defaultWidth) params.width = Math.round(defaultWidth * widthScale * 100) / 100;
  return params;
}