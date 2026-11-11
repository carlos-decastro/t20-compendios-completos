const ATTR_LABELS = {
  for: "Força",
  des: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  sab: "Sabedoria",
  car: "Carisma"
};

const SKILL_LABELS = {
  acro: "Acrobacia",
  ades: "Adestramento",
  atle: "Atletismo",
  atua: "Atuação",
  cava: "Cavalgar",
  conh: "Conhecimento",
  cura: "Cura",
  dipl: "Diplomacia",
  enga: "Enganação",
  fort: "Fortitude",
  furt: "Furtividade",
  guer: "Guerra",
  inic: "Iniciativa",
  inti: "Intimidação",
  intu: "Intuição",
  inve: "Investigação",
  joga: "Jogatina",
  ladi: "Ladinagem",
  luta: "Luta",
  mist: "Misticismo",
  nobr: "Nobreza",
  ofic: "Ofício",
  perc: "Percepção",
  pilo: "Pilotagem",
  pont: "Pontaria",
  refl: "Reflexos",
  reli: "Religião",
  sobr: "Sobrevivência",
  vont: "Vontade"
};

const RESISTANCE_SKILLS = new Set(["fort", "refl", "vont"]);

const WEAPON_PURPOSE_LABELS = {
  "corpo-a-corpo": "CORPO A CORPO",
  "corpo-a-corpo-arremesso": "CORPO A CORPO / ARREMESSO",
  arremesso: "ARREMESSO",
  disparo: "À DISTÂNCIA"
};

const WEAPON_GRIP_LABELS = {
  leve: "LEVE",
  uma: "UMA MÃO",
  duas: "DUAS MÃOS"
};

const WEAPON_PROP_LABELS = {
  agi: "ÁGIL",
  ada: "ADAPTÁVEL",
  alo: "ALONGADA",
  des: "DESBALANCEADA",
  dup: "DUPLA",
  hib: "HÍBRIDA",
  ver: "VERSÁTIL",
  arr: "ARREMESSO",
  dst: "À DISTÂNCIA",
  dms: "DUAS MÃOS",
  lev: "LEVE",
  mun: "MUNIÇÃO"
};

const SPELL_TYPE_LABELS = {
  arc: "ARCANA",
  div: "DIVINA",
  uni: "UNIVERSAL"
};

const SPELL_SCHOOL_LABELS = {
  abj: "ABJURAÇÃO",
  adv: "ADIVINHAÇÃO",
  con: "CONVOCAÇÃO",
  enc: "ENCANTAMENTO",
  evo: "EVOCAÇÃO",
  ilu: "ILUSÃO",
  nec: "NECROMANCIA",
  tra: "TRANSMUTAÇÃO"
};

const POWER_TYPE_LABELS = {
  ability: "HABILIDADE DE CLASSE",
  classe: "PODER DE CLASSE",
  habilidade: "HABILIDADE DE RAÇA",
  racial: "HABILIDADE DE RAÇA",
  origem: "PODER DE ORIGEM",
  geral: "PODER GERAL",
  concedido: "PODER CONCEDIDO",
  tormenta: "PODER DA TORMENTA",
  magia: "PODER DE MAGIA",
  distincao: "PODER DE DISTINÇÃO",
  complicacao: "COMPLICAÇÃO",
  combate: "COMBATE",
  destino: "DESTINO"
};

const CONSUMABLE_SUBTYPE_LABELS = {
  potion: "POÇÃO",
  scroll: "PERGAMINHO",
  alchemy: "ALQUÍMICO",
  ammo: "MUNIÇÃO",
  food: "ALIMENTO",
  material: "MATÉRIA-PRIMA"
};

const DAMAGE_TYPE_LABELS = {
  corte: "CORTE",
  impacto: "IMPACTO",
  perfuracao: "PERFURAÇÃO",
  fogo: "FOGO",
  frio: "FRIO",
  eletricidade: "ELETRICIDADE",
  acido: "ÁCIDO",
  trevas: "TREVAS",
  luz: "LUZ",
  psiquico: "PSÍQUICO",
  veneno: "VENENO",
  essencia: "ESSÊNCIA",
  magico: "MÁGICO",
  curapv: "CURA PV",
  curapm: "CURA PM",
  curatpv: "PV TEMP",
  curatpm: "PM TEMP",
  perda: "PERDA DE PV"
};

export function formatSigned(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return String(value ?? "");
  return num >= 0 ? `+${num}` : String(num);
}

function addTrait(list, seen, rawLabel) {
  const clean = String(rawLabel || "").trim().toUpperCase();
  if (!clean || seen.has(clean)) return;
  seen.add(clean);
  list.push(clean);
}

function makePill(label, value, tone = "neutral") {
  const isNumeric = typeof value === "number" && Number.isFinite(value);
  const displayValue = isNumeric ? formatSigned(value) : String(value ?? "");
  return {
    label: String(label || "").trim(),
    value: isNumeric ? value : null,
    display: displayValue,
    tone: isNumeric && value < 0 ? "penalty" : tone
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function extractCardTitleFromMessage({ content = "", flavor = "" } = {}) {
  const htmlMatch = String(content).match(/<h3[^>]*class=["'][^"']*item-name[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
  if (htmlMatch?.[1]) {
    const text = htmlMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return String(flavor || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveSkillKeyByLabel(pericias = {}, label = "") {
  const target = normalizeText(label);
  if (!target || !pericias || typeof pericias !== "object") return null;

  if (pericias[target]) return target;
  for (const [key, data] of Object.entries(pericias)) {
    const candidate = normalizeText(data?.label || SKILL_LABELS[key] || key);
    if (candidate === target) return key;
  }
  return null;
}

export function resolveAttributeKeyByLabel(atributos = {}, label = "") {
  const target = normalizeText(label);
  if (!target || !atributos || typeof atributos !== "object") return null;

  if (atributos[target]) return target;
  for (const [key, fullLabel] of Object.entries(ATTR_LABELS)) {
    if (normalizeText(fullLabel) === target || normalizeText(atributos[key]?.name) === target) {
      return key;
    }
  }
  return null;
}

function sumNumericArray(entries) {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((sum, entry) => {
    const parsed = Number(entry);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
}

/**
 * Computes evaluated non-die flat bonus and extra non-d20 dice terms from a Roll (or serialized roll).
 */
export function inspectEvaluatedRollModifiers(roll) {
  const terms = Array.isArray(roll?.terms) ? roll.terms : [];
  let flatTotal = 0;
  let currentSign = 1;
  const extraDice = [];

  for (const term of terms) {
    if (!term) continue;
    const op = term.operator;
    if (op === "+") {
      currentSign = 1;
      continue;
    }
    if (op === "-") {
      currentSign = -1;
      continue;
    }

    const className = term.constructor?.name || term.class || "";
    const isNumeric = className === "NumericTerm" || typeof term.number === "number";
    const isDie = className === "Die" || typeof term.faces === "number";

    if (isNumeric && !isDie) {
      flatTotal += currentSign * Number(term.number || 0);
      currentSign = 1;
      continue;
    }

    if (!isDie && term.isDeterministic && typeof term.total === "number") {
      flatTotal += currentSign * Number(term.total || 0);
      currentSign = 1;
      continue;
    }

    if (isDie) {
      const faces = Number(term.faces || 0);
      const count = Number(term.number || 1);
      if (faces !== 20) {
        const prefix = currentSign < 0 ? "-" : "+";
        const flavor = term.options?.flavor ? ` [${String(term.options.flavor).toUpperCase()}]` : "";
        extraDice.push(`${prefix}${count}d${faces}${flavor}`);
      }
      currentSign = 1;
    }
  }

  return { flatTotal, extraDice };
}

export function buildSkillBreakdown({ skillId, skillData, actorSystem, rollData = {}, roll = null }) {
  if (!skillData) return { traits: [], modifiers: [] };

  const nivel = Number(rollData.nivel ?? actorSystem?.attributes?.nivel?.value ?? 1);
  const halfLevel = Number.isFinite(Number(rollData.meionivel))
    ? Number(rollData.meionivel)
    : Math.floor(nivel / 2);

  const attrKey = skillData.atributo || "for";
  const attrName = ATTR_LABELS[attrKey] || attrKey.toUpperCase();
  const attrVal = Number(rollData[attrKey] ?? actorSystem?.atributos?.[attrKey]?.value ?? 0);

  const trainedVal = Number(
    rollData.treino ?? actorSystem?.attributes?.treino ?? (nivel >= 15 ? 6 : nivel >= 7 ? 4 : 2)
  );

  const modifiers = [
    makePill("½ Nível", halfLevel, "base"),
    makePill(attrName, attrVal, "attribute"),
    skillData.treinado
      ? makePill("Treino", trainedVal, "trained")
      : makePill("Não Treinada", 0, "untrained")
  ];

  const bonusArrVal = sumNumericArray(skillData.bonus);
  if (bonusArrVal) modifiers.push(makePill("Bônus", bonusArrVal, "bonus"));

  const pdaVal = Number(rollData.pda ?? actorSystem?.attributes?.defesa?.pda ?? 0);
  if (skillData.pda && pdaVal) {
    modifiers.push(makePill("Pen. Armadura", pdaVal, pdaVal < 0 ? "penalty" : "bonus"));
  }

  const sizeVal = Number(rollData.tamanho ?? 0);
  if (skillData.size && sizeVal) {
    modifiers.push(makePill("Tamanho", sizeVal, sizeVal < 0 ? "penalty" : "bonus"));
  }

  const outrosVal = Number(skillData.outros || 0);
  if (outrosVal) modifiers.push(makePill("Outros", outrosVal, "bonus"));

  const condiVal = Number(skillData.condi || 0);
  if (condiVal) modifiers.push(makePill("Condições", condiVal, condiVal < 0 ? "penalty" : "bonus"));

  const modPericias = actorSystem?.modificadores?.pericias || {};
  const addGlobalMod = (label, numVal) => {
    const parsed = Number(numVal || 0);
    if (parsed) modifiers.push(makePill(label, parsed, "bonus"));
  };

  if (modPericias.geral?.filter(Boolean).length) addGlobalMod("Mod. Perícias", rollData.pericia);
  if (RESISTANCE_SKILLS.has(skillId) && modPericias.resistencia?.filter(Boolean).length) {
    addGlobalMod("Mod. Resistência", rollData.resistencia);
  } else if (!["luta", "pont"].includes(skillId) && modPericias.semataque?.filter(Boolean).length) {
    addGlobalMod("Mod. S/ Ataque", rollData.semataque);
  } else if (["luta", "pont"].includes(skillId) && modPericias.ataque?.filter(Boolean).length) {
    addGlobalMod("Mod. Ataque", rollData.ataque);
  }
  const atrModVal = sumNumericArray(modPericias.atr?.[attrKey]);
  if (atrModVal) addGlobalMod(`Mod. ${attrName}`, atrModVal);

  const traits = [];
  const seen = new Set();
  addTrait(traits, seen, attrName);
  addTrait(traits, seen, skillData.treinado ? "TREINADA" : "NÃO TREINADA");
  if (skillData.pda && pdaVal) addTrait(traits, seen, "PENALIDADE ARMADURA");

  if (roll) {
    const { flatTotal, extraDice } = inspectEvaluatedRollModifiers(roll);
    const accounted = modifiers.reduce((sum, pill) => sum + Number(pill.value || 0), 0);
    const delta = flatTotal - accounted;
    if (delta !== 0) {
      modifiers.push(makePill("Mod. Teste", delta, delta < 0 ? "penalty" : "bonus"));
    }
    for (const dieStr of extraDice) {
      modifiers.push(makePill("Dado Extra", dieStr, "dice"));
    }
  }

  return { traits, modifiers };
}

export function buildAttributeBreakdown({ attrKey, actorSystem, rollData = {}, roll = null }) {
  const attrName = ATTR_LABELS[attrKey] || attrKey.toUpperCase();
  const baseAttrVal = Number(rollData[attrKey] ?? actorSystem?.atributos?.[attrKey]?.value ?? 0);
  const modifiers = [makePill(attrName, baseAttrVal, "attribute")];

  const mods = actorSystem?.modificadores?.atributos || {};
  if (mods.geral?.filter(Boolean).length && Number(rollData.atributo)) {
    modifiers.push(makePill("Mod. Atributos", Number(rollData.atributo), "bonus"));
  }
  if (["for", "des", "con"].includes(attrKey) && mods.fisicos?.filter(Boolean).length && Number(rollData.fisicos)) {
    modifiers.push(makePill("Mod. Físicos", Number(rollData.fisicos), "bonus"));
  }
  if (["int", "sab", "car"].includes(attrKey) && mods.mentais?.filter(Boolean).length && Number(rollData.mentais)) {
    modifiers.push(makePill("Mod. Mentais", Number(rollData.mentais), "bonus"));
  }

  if (roll) {
    const { flatTotal, extraDice } = inspectEvaluatedRollModifiers(roll);
    const accounted = modifiers.reduce((sum, pill) => sum + Number(pill.value || 0), 0);
    const delta = flatTotal - accounted;
    if (delta !== 0) modifiers.push(makePill("Mod. Teste", delta, delta < 0 ? "penalty" : "bonus"));
    for (const dieStr of extraDice) modifiers.push(makePill("Dado Extra", dieStr, "dice"));
  }

  return {
    traits: {
      primary: "ATRIBUTO",
      items: [attrName.toUpperCase(), "TESTE DE ATRIBUTO"]
    },
    modifiers
  };
}

export function buildWeaponTraits({ itemData, hasAcuidade = false, hasPotentThrow = false, actorSystem }) {
  const items = [];
  const seen = new Set();

  const purposeLabel = WEAPON_PURPOSE_LABELS[itemData?.proposito];
  if (purposeLabel) addTrait(items, seen, purposeLabel);

  const gripLabel = WEAPON_GRIP_LABELS[itemData?.empunhadura];
  if (gripLabel) addTrait(items, seen, gripLabel);

  for (const [propKey, active] of Object.entries(itemData?.propriedades || {})) {
    if (!active) continue;
    addTrait(items, seen, WEAPON_PROP_LABELS[propKey] || propKey);
  }

  const isFinesse = itemData?.empunhadura === "leve" || Boolean(itemData?.propriedades?.agi);
  const forVal = Number(actorSystem?.atributos?.for?.value ?? 0);
  const desVal = Number(actorSystem?.atributos?.des?.value ?? 0);
  if (isFinesse && hasAcuidade && desVal > forVal && itemData?.proposito !== "disparo") {
    addTrait(items, seen, "ACUIDADE");
  }
  if (hasPotentThrow && itemData?.proposito === "arremesso") {
    addTrait(items, seen, "ARREMESSO POTENTE");
  }

  const critM = Number(itemData?.criticoM || 20);
  const critX = Number(itemData?.criticoX || 2);
  addTrait(items, seen, `CRÍTICO ${critM}/×${critX}`);

  return items;
}

export function buildAttackBreakdown({
  itemData,
  actorSystem,
  rollData = {},
  roll = null,
  hasAcuidade = false,
  hasPotentThrow = false
}) {
  const atkRollDef = (itemData?.rolls || []).find((r) => r.type === "ataque");
  const skillId = atkRollDef?.parts?.[1]?.[0] || "";
  const explicitAttr = atkRollDef?.parts?.[1]?.[1] || "";

  let effectiveSkill = actorSystem?.pericias?.[skillId] ? { ...actorSystem.pericias[skillId] } : null;
  let swappedReason = "";

  if (effectiveSkill) {
    let usedAttr = explicitAttr || "";
    const forVal = Number(actorSystem?.atributos?.for?.value ?? 0);
    const desVal = Number(actorSystem?.atributos?.des?.value ?? 0);
    const isFinesse = itemData?.empunhadura === "leve" || Boolean(itemData?.propriedades?.agi);

    if (!usedAttr) {
      if (itemData?.proposito === "arremesso" && hasPotentThrow) {
        usedAttr = "for";
        swappedReason = "Arremesso Potente";
      } else if (
        isFinesse &&
        hasAcuidade &&
        desVal > forVal &&
        itemData?.proposito !== "disparo" &&
        itemData?.proposito !== "arremesso"
      ) {
        usedAttr = "des";
        swappedReason = "Acuidade";
      }
    }

    if (usedAttr && usedAttr !== effectiveSkill.atributo) {
      effectiveSkill.atributo = usedAttr;
    }
  }

  const skillPart = effectiveSkill
    ? buildSkillBreakdown({ skillId, skillData: effectiveSkill, actorSystem, rollData, roll: null })
    : { traits: [], modifiers: [] };

  const modifiers = [...skillPart.modifiers];
  if (swappedReason) {
    const attrPill = modifiers.find((m) => m.tone === "attribute");
    if (attrPill) attrPill.label = `${attrPill.label} (${swappedReason})`;
  }

  const skillName = effectiveSkill?.label || SKILL_LABELS[skillId] || (skillId ? skillId.toUpperCase() : "");

  if (roll) {
    const { flatTotal, extraDice } = inspectEvaluatedRollModifiers(roll);
    const accounted = modifiers.reduce((sum, pill) => sum + Number(pill.value || 0), 0);
    const delta = flatTotal - accounted;
    if (delta !== 0) {
      const hasAttackMod = Boolean(
        actorSystem?.modificadores?.ataque?.geral?.filter(Boolean).length ||
        actorSystem?.modificadores?.ataque?.cac?.filter(Boolean).length ||
        actorSystem?.modificadores?.ataque?.ad?.filter(Boolean).length
      );
      const deltaLabel = hasAttackMod ? "Bônus Ataque" : "Mod. Ataque";
      modifiers.push(makePill(deltaLabel, delta, delta < 0 ? "penalty" : "bonus"));
    }
    for (const dieStr of extraDice) {
      modifiers.push(makePill("Dado Extra", dieStr, "dice"));
    }
  }

  const weaponTraits = itemData?.proposito || itemData?.criticoM
    ? buildWeaponTraits({ itemData, hasAcuidade, hasPotentThrow, actorSystem })
    : [];

  const seen = new Set(weaponTraits);
  if (skillName) addTrait(weaponTraits, seen, skillName);

  return {
    traits: {
      primary: "ATAQUE",
      items: weaponTraits
    },
    modifiers
  };
}

export function buildDamageBreakdown({ roll, itemData, isCritical = false }) {
  const terms = Array.isArray(roll?.terms) ? roll.terms : [];
  const modifiers = [];
  const dmgTypes = [];
  const seenTypes = new Set();

  let currentSign = 1;
  let flatBonusSum = 0;

  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
    if (!term) continue;
    if (term.operator === "+") {
      currentSign = 1;
      continue;
    }
    if (term.operator === "-") {
      currentSign = -1;
      continue;
    }

    const className = term.constructor?.name || term.class || "";
    const isDie = className === "Die" || typeof term.faces === "number";
    const isNumeric = !isDie && (className === "NumericTerm" || typeof term.number === "number");
    const flavorKey = normalizeText(term.options?.flavor || "");
    const typeLabel = DAMAGE_TYPE_LABELS[flavorKey] || (flavorKey ? flavorKey.toUpperCase() : "");

    if (typeLabel) addTrait(dmgTypes, seenTypes, typeLabel);

    if (isDie) {
      const dieExpr = `${currentSign < 0 ? "-" : ""}${term.number || 1}d${term.faces}`;
      const label = typeLabel ? `${typeLabel.charAt(0) + typeLabel.slice(1).toLowerCase()}` : "Dado";
      modifiers.push(makePill(label, dieExpr, "dice"));
      currentSign = 1;
    } else if (isNumeric) {
      const val = currentSign * Number(term.number || 0);
      if (val !== 0) {
        if (modifiers.length === 0 || typeLabel) {
          modifiers.push(makePill(typeLabel ? "Bônus" : "Fixo", val, val < 0 ? "penalty" : "bonus"));
        } else {
          flatBonusSum += val;
        }
      }
      currentSign = 1;
    }
  }

  if (flatBonusSum !== 0) {
    modifiers.push(makePill("Mod. Dano", flatBonusSum, flatBonusSum < 0 ? "penalty" : "bonus"));
  }

  // Fallback type from item roll parts if roll terms didn't preserve flavor
  if (!dmgTypes.length && Array.isArray(itemData?.rolls)) {
    const dmgDef = itemData.rolls.find((r) => r.type === "dano");
    for (const part of dmgDef?.parts || []) {
      const key = normalizeText(part?.[1] || "");
      const label = DAMAGE_TYPE_LABELS[key] || (key ? key.toUpperCase() : "");
      if (label) addTrait(dmgTypes, seenTypes, label);
    }
  }

  let primary = "DANO";
  if (dmgTypes.some((t) => t.startsWith("CURA"))) primary = "CURA";
  else if (dmgTypes.some((t) => t === "PERDA DE PV")) primary = "EFEITO";

  if (isCritical) {
    const mult = Math.max(2, Number(itemData?.criticoX || 2));
    addTrait(dmgTypes, seenTypes, `ACERTO CRÍTICO ×${mult}`);
  }

  return {
    traits: { primary, items: dmgTypes },
    modifiers
  };
}

export function buildSpellOrPowerHeader({ itemType, itemData, liveItem }) {
  const sys = itemData || liveItem?.system || {};
  const traits = [];
  const seen = new Set();

  if (itemType === "magia") {
    if (sys.circulo) addTrait(traits, seen, `${sys.circulo}º CÍRCULO`);
    if (SPELL_TYPE_LABELS[sys.tipo]) addTrait(traits, seen, SPELL_TYPE_LABELS[sys.tipo]);
    if (SPELL_SCHOOL_LABELS[sys.escola]) addTrait(traits, seen, SPELL_SCHOOL_LABELS[sys.escola]);

    const saveCd = Number(liveItem?.labels?.save?.match?.(/CD\s*(\d+)/i)?.[1] || sys.resistencia?.cd || 0);
    if (sys.resistencia?.txt) {
      addTrait(traits, seen, saveCd ? `${sys.resistencia.txt} CD ${saveCd}` : sys.resistencia.txt);
    }
    return { primary: "MAGIA", items: traits };
  }

  if (itemType === "poder") {
    const typeLabel = POWER_TYPE_LABELS[sys.tipo] || (sys.tipo ? String(sys.tipo).toUpperCase() : "");
    if (typeLabel) addTrait(traits, seen, typeLabel);
    if (sys.subtipo) addTrait(traits, seen, sys.subtipo);
    if (sys.resistencia?.cd && sys.resistencia?.txt) {
      addTrait(traits, seen, `${sys.resistencia.txt} CD ${sys.resistencia.cd}`);
    }
    return { primary: "PODER", items: traits };
  }

  if (itemType === "consumivel") {
    const subLabel = CONSUMABLE_SUBTYPE_LABELS[sys.subtipo] || sys.subtipo;
    if (subLabel) addTrait(traits, seen, subLabel);
    return { primary: "CONSUMÍVEL", items: traits };
  }

  return null;
}

function inferAttributeKeyFromRoll(rolls = []) {
  const formula = String(rolls?.[0]?._formula || rolls?.[0]?.formula || "");
  const match = formula.match(/@(for|des|con|int|sab|car)\b/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extracts compact PF2e-style traits + modifier breakdown pills for a Tormenta20 ChatMessage.
 * Safe in headless tests and live Foundry hooks.
 */
export function buildRollMetadataSnapshot({
  actor = null,
  item = null,
  itemDataFlag = null,
  content = "",
  flavor = "",
  rolls = [],
  hasAcuidade = false,
  hasPotentThrow = false
}) {
  const actorSystem = actor?.system || null;
  const rollData = typeof actor?.getRollData === "function" ? actor.getRollData() : {};
  const title = extractCardTitleFromMessage({ content, flavor });

  // 1. Item cards (Armas, Magias, Poderes, Consumíveis)
  const itemSys = itemDataFlag || item?.system || null;
  const itemType = item?.type || (itemSys?.escola ? "magia" : itemSys?.proposito || itemSys?.criticoM ? "arma" : itemSys?.tipo && itemSys?.subtipo !== undefined ? "poder" : null);

  if (itemSys || item) {
    let cardTraits = buildSpellOrPowerHeader({ itemType, itemData: itemSys, liveItem: item });
    const perRollMeta = [];
    let atkCritical = false;

    for (const roll of rolls) {
      const isD20 = roll?.dice?.[0]?.faces === 20 || roll?.options?.type === "attack";
      if (isD20) {
        const nat = Number(roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? 0);
        const critM = Number(itemSys?.criticoM || 20);
        atkCritical = Boolean(roll?._critical) || nat === 20 || (nat >= critM && critM <= 20);

        const atkMeta = buildAttackBreakdown({
          itemData: itemSys,
          actorSystem,
          rollData,
          roll,
          hasAcuidade,
          hasPotentThrow
        });
        perRollMeta.push(atkMeta);
        if (!cardTraits) cardTraits = atkMeta.traits;
      } else {
        const dmgMeta = buildDamageBreakdown({ roll, itemData: itemSys, isCritical: atkCritical });
        perRollMeta.push(dmgMeta);
        if (!cardTraits) cardTraits = dmgMeta.traits;
      }
    }

    if (!cardTraits && itemType === "arma") {
      cardTraits = {
        primary: "ARMA",
        items: buildWeaponTraits({ itemData: itemSys, hasAcuidade, hasPotentThrow, actorSystem })
      };
    }

    if (cardTraits || perRollMeta.length) {
      return { cardTraits, rolls: perRollMeta };
    }
  }

  // 2. Skill check cards
  if (actorSystem?.pericias && title) {
    const skillId = resolveSkillKeyByLabel(actorSystem.pericias, title);
    if (skillId) {
      const skillData = actorSystem.pericias[skillId];
      const firstRoll = rolls[0] || null;
      const skillBreakdown = buildSkillBreakdown({
        skillId,
        skillData,
        actorSystem,
        rollData,
        roll: firstRoll
      });
      const primary = RESISTANCE_SKILLS.has(skillId) ? "RESISTÊNCIA" : "PERÍCIA";
      const cardTraits = { primary, items: skillBreakdown.traits };
      const perRoll = firstRoll
        ? [{ traits: null, modifiers: skillBreakdown.modifiers }]
        : [];
      return { cardTraits, rolls: perRoll };
    }
  }

  // 3. Attribute check cards (with @key formula fallback when system abl.name was unset)
  if (actorSystem?.atributos) {
    const attrKey =
      (title ? resolveAttributeKeyByLabel(actorSystem.atributos, title) : null) ||
      inferAttributeKeyFromRoll(rolls);
    if (attrKey) {
      const firstRoll = rolls[0] || null;
      const attrBreakdown = buildAttributeBreakdown({
        attrKey,
        actorSystem,
        rollData,
        roll: firstRoll
      });
      return {
        cardTraits: attrBreakdown.traits,
        rolls: firstRoll ? [{ traits: null, modifiers: attrBreakdown.modifiers }] : []
      };
    }
  }

  return null;
}
