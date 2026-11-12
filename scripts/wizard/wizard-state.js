/**
 * Pure Tormenta20 JdA Level-1 Character Creation Wizard state, rules & strict validator.
 * Zero Foundry runtime globals so every rule can be unit-tested cleanly in Node.js.
 */

import {
  CRAFT_KEYS,
  SKILL_LABELS_PT,
  SKILL_NAME_TO_KEY,
  normalizeText,
  parseClassSkills,
  parseProficienciesText
} from "../automation/skill-parser.js";
import {
  evaluateCasterProgression,
  getClassProgressionRule,
  normalizeProgressKey
} from "../data/class-progression-rules.js";

export const ATTR_ORDER = ["for", "des", "con", "int", "sab", "car"];

export const ATTR_LABELS_PT = {
  for: "Força",
  des: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  sab: "Sabedoria",
  car: "Carisma"
};

export const ATTR_ABBR_PT = {
  for: "FOR",
  des: "DES",
  con: "CON",
  int: "INT",
  sab: "SAB",
  car: "CAR"
};

export const POINT_BUY_BUDGET = 10;

export const POINT_BUY_COSTS = Object.freeze({
  "-1": -1,
  0: 0,
  1: 1,
  2: 2,
  3: 4,
  4: 7
});

export const POINT_BUY_MIN = -1;
export const POINT_BUY_MAX = 4;

export const WIZARD_STEPS = [
  { num: 1, key: "identity", label: "Identidade", icon: "fa-solid fa-id-card" },
  { num: 2, key: "attributes", label: "Atributos", icon: "fa-solid fa-sliders" },
  { num: 3, key: "race", label: "Raça", icon: "fa-solid fa-masks-theater" },
  { num: 4, key: "origin", label: "Origem", icon: "fa-solid fa-compass" },
  { num: 5, key: "class", label: "Classe", icon: "fa-solid fa-shield-halved" },
  { num: 6, key: "deity", label: "Divindade", icon: "fa-solid fa-sun" },
  { num: 7, key: "magic", label: "Poderes & Magias", icon: "fa-solid fa-wand-sparkles" },
  { num: 8, key: "equipment", label: "Equipamento & Revisão", icon: "fa-solid fa-sack-dollar" }
];

export const ALL_SKILL_KEYS = [...Object.values(SKILL_NAME_TO_KEY), ...CRAFT_KEYS];

export const MANDATORY_DEVOTEE_CLASSES = new Set(["clerigo", "druida", "paladino"]);

const PT_NUMBER_WORDS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6
};

/**
 * Class starter kits (equipment names resolved against Compendium `equipamentos` pack).
 */
export const CLASS_STARTER_KITS = {
  arcanista: ["Bordão", "Mochila", "Saco de Dormir", "Ração de Viagem"],
  barbaro: ["Machado de Batalha", "Couro Batido", "Mochila", "Corda"],
  bardo: ["Florete", "Couro Batido", "Alaúde", "Mochila"],
  bucaneiro: ["Sabre", "Pistola", "Mochila", "Corda"],
  cacador: ["Arco Curto", "Flechas (20)", "Couro Batido", "Adaga", "Mochila"],
  cavaleiro: ["Espada Longa", "Brunea", "Escudo Pesado", "Mochila"],
  clerigo: ["Maça", "Cota de Malha", "Escudo Leve", "Símbolo Sagrado", "Mochila"],
  druida: ["Cimitarra", "Gibão de Peles", "Escudo Leve", "Mochila"],
  guerreiro: ["Espada Longa", "Brunea", "Escudo Leve", "Arco Curto", "Mochila"],
  inventor: ["Mosquete", "Balas (20)", "Couro Batido", "Ferramentas de Ofício", "Mochila"],
  ladino: ["Adaga", "Arco Curto", "Flechas (20)", "Couro Batido", "Ferramentas de Ladrão"],
  lutador: ["Manopla", "Couro Batido", "Mochila", "Ração de Viagem"],
  nobre: ["Florete", "Couraça", "Mochila", "Traje de Corte"],
  paladino: ["Espada Longa", "Cota de Malha", "Escudo Pesado", "Símbolo Sagrado", "Mochila"]
};

/**
 * Official Tormenta20 JdA conversion from 4d6-drop-lowest sum to attribute modifier.
 */
export function sumToAbilityMod(sum) {
  const val = Number(sum);
  if (!Number.isFinite(val)) return 0;
  if (val <= 7) return -2;
  if (val <= 9) return -1;
  if (val <= 11) return 0;
  if (val <= 13) return 1;
  if (val <= 15) return 2;
  if (val <= 17) return 3;
  return 4;
}

/**
 * Rolls one 4d6-drop-lowest ability score and returns raw dice, sum, and JdA modifier.
 */
export function rollSingleAbility4d6(rng = Math.random) {
  const dice = Array.from({ length: 4 }, () => Math.floor(rng() * 6) + 1);
  const sorted = [...dice].sort((a, b) => a - b);
  const dropped = sorted[0];
  const kept = sorted.slice(1);
  const sum = kept.reduce((acc, n) => acc + n, 0);
  return { dice, dropped, sum, mod: sumToAbilityMod(sum) };
}

/**
 * Generates a full set of 6 rolled JdA attribute modifiers along with total modifier sum.
 */
export function rollAbilitySet4d6(rng = Math.random) {
  const rolls = Array.from({ length: 6 }, () => rollSingleAbility4d6(rng));
  const totalMod = rolls.reduce((acc, r) => acc + r.mod, 0);
  return { rolls, totalMod, belowRecommended: totalMod < 6 };
}

/**
 * Rolls 4d6 for starting T$ (Tormenta20 JdA Level 1 default = 4d6 T$).
 */
export function rollStartingGold4d6(rng = Math.random) {
  const dice = Array.from({ length: 4 }, () => Math.floor(rng() * 6) + 1);
  return {
    dice,
    total: dice.reduce((acc, n) => acc + n, 0)
  };
}

/**
 * Evaluates Point-Buy cost/remaining budget for base attributes.
 */
export function computePointBuySummary(baseAttrs = {}) {
  let spent = 0;
  let allInBounds = true;
  const perAttrCost = {};

  for (const key of ATTR_ORDER) {
    const val = Number(baseAttrs[key] ?? 0);
    if (!Number.isInteger(val) || val < POINT_BUY_MIN || val > POINT_BUY_MAX) {
      allInBounds = false;
      perAttrCost[key] = null;
      continue;
    }
    const cost = POINT_BUY_COSTS[String(val)];
    perAttrCost[key] = cost;
    spent += cost;
  }

  const remaining = POINT_BUY_BUDGET - spent;
  return {
    budget: POINT_BUY_BUDGET,
    spent,
    remaining,
    allInBounds,
    perAttrCost,
    valid: allInBounds && remaining === 0
  };
}

/**
 * Parses dynamic racial attribute instructions such as "+1 em Três Atributos Diferentes".
 */
export function parseDynamicAttributePrompt(description) {
  const clean = normalizeText(description);
  const bonusMatch = clean.match(/\+(\d+)/);
  const bonus = bonusMatch ? Number(bonusMatch[1]) : 1;

  let count = 0;
  const digitCount = clean.match(/\bem\s+(\d+)\s+atributo/);
  if (digitCount) {
    count = Number(digitCount[1]);
  } else {
    for (const [word, num] of Object.entries(PT_NUMBER_WORDS)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(clean)) {
        count = num;
        break;
      }
    }
  }
  return { bonus, count };
}

/**
 * Extracts normalized dynamic-attribute metadata from a Race item object.
 */
export function detectDynamicRaceSpec(raceObj) {
  const rawList = raceObj?.system?.atributosDinamicos?.value;
  const eligible = Array.isArray(rawList)
    ? rawList.filter((k) => ATTR_ORDER.includes(k))
    : rawList instanceof Set
      ? [...rawList].filter((k) => ATTR_ORDER.includes(k))
      : [];

  const desc = raceObj?.system?.atributosDinamicos?.description || "";
  const parsed = parseDynamicAttributePrompt(desc);
  const count = eligible.length > 0 ? Math.min(eligible.length, parsed.count || 0) : 0;

  return {
    eligible,
    count,
    bonus: parsed.bonus || 1,
    description: desc
  };
}

/**
 * Returns whether the selected class requires a deity and how many granted powers apply.
 */
export function getClassDevoteePolicy(className) {
  const key = normalizeProgressKey(className);
  const isMandatory = MANDATORY_DEVOTEE_CLASSES.has(key);
  return {
    classKey: key,
    isMandatory,
    // In Tormenta20 JdA, faithful classes (Clérigo, Druida, Paladino) receive all/2+ granted powers; common devotees pick 1
    recommendedPowersLabel: isMandatory
      ? "Devoto Fiel (Clérigo/Druida/Paladino: selecione seus poderes concedidos ou marque todos)"
      : "Devoto Comum: selecione 1 Poder Concedido",
    minPowersIfDevoted: 1,
    maxPowersIfDevoted: isMandatory ? null : 1
  };
}

/**
 * Checks whether a class/race satisfies a deity's `devotos` string (informational check).
 */
export function isDeityCompatibleWith(deityDevotosText, { raceName = "", className = "" } = {}) {
  const raw = normalizeText(deityDevotosText);
  if (!raw || raw.includes("todas as racas e classes") || raw === "todos" || raw.includes("qualquer")) {
    return { compatible: true, reason: "Aceita qualquer devoto" };
  }
  const rNorm = normalizeText(raceName);
  const cNorm = normalizeText(className);
  if ((rNorm && raw.includes(rNorm)) || (cNorm && raw.includes(cNorm))) {
    return { compatible: true, reason: "Compatível com sua raça/classe" };
  }
  return { compatible: false, reason: `Restrito a: ${deityDevotosText}` };
}

/**
 * Creates a fresh Level-1 WizardDraft state, optionally seeded from an existing empty actor.
 */
export function createInitialWizardDraft(existingActor = null) {
  return {
    step: 1,
    targetActorId: existingActor?.id || null,
    identity: {
      name: existingActor?.name && existingActor.name !== "Novo Personagem" ? existingActor.name : "",
      img: existingActor?.img || "icons/svg/mystery-man.svg",
      notes: ""
    },
    attributes: {
      mode: "pointbuy",
      base: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 },
      rolledSet: null,
      // Map of attribute key -> index in rolledSet.rolls (0..5)
      rollAssignments: { for: null, des: null, con: null, int: null, sab: null, car: null }
    },
    race: {
      uuid: null,
      name: "",
      img: "",
      description: "",
      fixedAttrs: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 },
      dynamicEligible: [],
      dynamicCount: 0,
      dynamicBonus: 1,
      dynamicPicked: [],
      grants: [],
      // grantIdx -> { chosenUuid, chosenName, chosenKind, extraSkillKeys: [] }
      grantChoices: {},
      extraSkillChoices: []
    },
    origin: {
      uuid: null,
      name: "",
      img: "",
      beneficiosTexto: "",
      itensIniciaisTexto: "",
      skillOptions: [],
      poderChoices: [],
      itemMatches: [],
      pickedSkills: [],
      pickedPowerIndices: [],
      includeOriginItems: true
    },
    class: {
      uuid: null,
      name: "",
      img: "",
      pvPorNivel: 0,
      pmPorNivel: 0,
      profArmas: ["simples"],
      profArmaduras: [],
      parsedSkills: { fixedSkills: [], orChoices: [], choiceCount: 0, poolSkills: [] },
      orSelections: {},
      selectedPoolSkills: [],
      selectedIntSkills: [],
      arcanistaPath: null,
      pmAttr: null
    },
    deity: {
      uuid: null,
      name: "",
      img: "",
      devotos: "",
      armaPreferida: "",
      canalizar: "",
      obrigacoes: "",
      poderesConcedidos: [],
      selectedPowerUuids: []
    },
    magicAndPowers: {
      selectedFreePowers: [], // [{ uuid, name, subtipo, sourceLabel }]
      selectedSpells: [] // [{ uuid, name, circulo, escola, tipo, img }]
    },
    equipment: {
      mode: "gold", // "gold" | "kit" | "shop"
      goldRolled: rollStartingGold4d6(),
      manualGold: 24,
      kitItems: [], // [{ uuid, name, priceTp, img, type }]
      shopItems: [] // [{ uuid, name, priceTp, img, type, qty }]
    }
  };
}

/**
 * Returns the resolved base attributes from the currently active attribute method.
 */
export function resolveBaseAttributes(draft) {
  const attrState = draft.attributes;
  if (attrState.mode === "roll" && attrState.rolledSet?.rolls?.length === 6) {
    const out = {};
    for (const key of ATTR_ORDER) {
      const idx = attrState.rollAssignments?.[key];
      out[key] = idx !== null && idx !== undefined ? Number(attrState.rolledSet.rolls[idx]?.mod ?? 0) : 0;
    }
    return out;
  }
  const out = {};
  for (const key of ATTR_ORDER) {
    out[key] = Number(attrState.base?.[key] ?? 0);
  }
  return out;
}

/**
 * Returns racial attribute modifiers (fixed + dynamic picks).
 */
export function resolveRacialAttributes(draft) {
  const out = { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 };
  const race = draft.race;
  if (!race?.uuid) return out;
  for (const key of ATTR_ORDER) {
    out[key] += Number(race.fixedAttrs?.[key] ?? 0);
  }
  const bonus = Number(race.dynamicBonus || 1);
  for (const picked of race.dynamicPicked || []) {
    if (ATTR_ORDER.includes(picked) && race.dynamicEligible.includes(picked)) {
      out[picked] += bonus;
    }
  }
  return out;
}

/**
 * Returns final attributes (`base + racial`).
 */
export function resolveFinalAttributes(draft) {
  const base = resolveBaseAttributes(draft);
  const racial = resolveRacialAttributes(draft);
  const final = {};
  for (const key of ATTR_ORDER) {
    final[key] = Number(base[key] ?? 0) + Number(racial[key] ?? 0);
  }
  return final;
}

/**
 * Evaluates extra skill & free power slots granted by racial `grants` and origin benefits.
 */
export function resolveFeatureSlotRequirements(draft) {
  let raceExtraSkillCount = 0;
  let raceChoiceGrant = null;
  const freePowerSlots = [];
  const raceNorm = normalizeProgressKey(draft.race?.name || "");

  for (const [idx, grant] of (draft.race?.grants || []).entries()) {
    const picked = draft.race.grantChoices?.[idx];
    const choices = Array.isArray(grant.choices) ? grant.choices : [];
    const targetName = normalizeProgressKey(
      picked?.chosenName || (choices.length === 1 ? choices[0]?.name : "") || grant.title || ""
    );
    const targetDesc = normalizeProgressKey(picked?.chosenDesc || grant.desc || "");

    const isVersatil = targetName.includes("versatil") || targetDesc.includes("duas pericias");
    const isMemoriaPostuma = targetName.includes("memoria postuma") || targetDesc.includes("pericia ou um poder geral");

    if (isVersatil) {
      const subMode = picked?.versatilMode || "two_skills";
      raceChoiceGrant = { kind: "versatil", grantIdx: idx, mode: subMode };
      if (subMode === "skill_and_power") {
        raceExtraSkillCount += 1;
        freePowerSlots.push({
          slotId: `race:grant:${idx}:versatil`,
          label: "Poder Geral (Humano — Versátil)",
          allowedTipos: ["geral"],
          source: "Raça"
        });
      } else {
        raceExtraSkillCount += 2;
      }
    } else if (isMemoriaPostuma) {
      const subMode = picked?.versatilMode || "one_skill";
      raceChoiceGrant = { kind: "memoria", grantIdx: idx, mode: subMode };
      if (subMode === "one_power") {
        freePowerSlots.push({
          slotId: `race:grant:${idx}:memoria`,
          label: "Poder Geral (Osteon — Memória Póstuma)",
          allowedTipos: ["geral"],
          source: "Raça"
        });
      } else {
        raceExtraSkillCount += 1;
      }
    }
  }

  // Fallback for race documents whose grants list didn't index Versátil/Memória Póstuma directly
  if (!raceChoiceGrant && raceNorm === "humano") {
    const subMode = draft.race?.specialMode || "two_skills";
    raceChoiceGrant = { kind: "versatil", grantIdx: -1, mode: subMode };
    if (subMode === "skill_and_power") {
      raceExtraSkillCount += 1;
      freePowerSlots.push({
        slotId: "race:versatil",
        label: "Poder Geral (Humano — Versátil)",
        allowedTipos: ["geral"],
        source: "Raça"
      });
    } else {
      raceExtraSkillCount += 2;
    }
  } else if (!raceChoiceGrant && raceNorm === "osteon") {
    const subMode = draft.race?.specialMode || "one_skill";
    raceChoiceGrant = { kind: "memoria", grantIdx: -1, mode: subMode };
    if (subMode === "one_power") {
      freePowerSlots.push({
        slotId: "race:memoria",
        label: "Poder Geral (Osteon — Memória Póstuma)",
        allowedTipos: ["geral"],
        source: "Raça"
      });
    } else {
      raceExtraSkillCount += 1;
    }
  }

  for (const idx of draft.origin?.pickedPowerIndices || []) {
    const choice = draft.origin?.poderChoices?.[idx];
    if (choice && choice.wildcard && !choice.uuid) {
      freePowerSlots.push({
        slotId: `origin:power:${idx}`,
        label: `Poder de Origem (${choice.name || choice.wildcard})`,
        allowedTipos: [normalizeProgressKey(choice.wildcard || "geral")],
        source: "Origem"
      });
    }
  }

  return { raceExtraSkillCount, raceChoiceGrant, freePowerSlots };
}

/**
 * Builds deduplicated trained skills breakdown up to a given phase.
 */
export function collectTrainedSkills(draft, { upToStep = 8 } = {}) {
  const map = new Map();
  const addSkill = (key, source) => {
    if (!key || !ALL_SKILL_KEYS.includes(key) || map.has(key)) return;
    map.set(key, { key, label: SKILL_LABELS_PT[key] || key.toUpperCase(), source });
  };

  if (upToStep >= 3) {
    for (const sk of draft.race?.extraSkillChoices || []) addSkill(sk, "Raça");
  }
  if (upToStep >= 4) {
    for (const sk of draft.origin?.pickedSkills || []) addSkill(sk, "Origem");
  }
  if (upToStep >= 5 && draft.class?.uuid) {
    const parsed = draft.class.parsedSkills || {};
    for (const sk of parsed.fixedSkills || []) addSkill(sk, "Classe");
    for (const [idx, group] of (parsed.orChoices || []).entries()) {
      const chosen = draft.class.orSelections?.[idx];
      if (chosen && group.includes(chosen)) addSkill(chosen, "Classe");
    }
    for (const sk of draft.class.selectedPoolSkills || []) addSkill(sk, "Classe");
    for (const sk of draft.class.selectedIntSkills || []) addSkill(sk, "Inteligência");
  }

  return map;
}

/**
 * Computes caster spell quota at Level 1 including selected bonus powers.
 */
export function resolveWizardCasterSpec(draft) {
  if (!draft.class?.uuid) return null;
  const rule = getClassProgressionRule(draft.class.name);
  if (!rule?.caster) return null;

  const evalRes = evaluateCasterProgression(rule.caster, 1, {
    pathKey: draft.class.arcanistaPath,
    bonusSpells: 0
  });

  return {
    ...evalRes,
    className: rule.name,
    hasPaths: Boolean(rule.caster.hasPaths),
    paths: rule.caster.paths || null
  };
}

/**
 * Computes available gold and spent gold across Step 8 equipment modes.
 */
export function computeEquipmentBudget(draft) {
  const eq = draft.equipment || {};
  const startingGold = eq.mode === "gold"
    ? Number(eq.goldRolled?.total ?? eq.manualGold ?? 24)
    : Number(eq.goldRolled?.total ?? 24);

  if (eq.mode === "shop") {
    const spent = (eq.shopItems || []).reduce((acc, it) => acc + (Number(it.priceTp || 0) * Number(it.qty || 1)), 0);
    return {
      startingGold,
      spentGold: spent,
      remainingGold: Number((startingGold - spent).toFixed(2)),
      overspent: spent > startingGold
    };
  }

  if (eq.mode === "kit") {
    return {
      startingGold,
      spentGold: 0,
      remainingGold: startingGold,
      overspent: false
    };
  }

  return {
    startingGold: Number(eq.goldRolled?.total ?? 24),
    spentGold: 0,
    remainingGold: Number(eq.goldRolled?.total ?? 24),
    overspent: false
  };
}

/**
 * Prunes downstream selections cleanly if the player backtracks and changes
 * attributes, race, origin, class, or Arcanista path.
 */
export function reconcileDraftAfterMutation(draft) {
  const finalAttrs = resolveFinalAttributes(draft);
  const { raceExtraSkillCount, freePowerSlots } = resolveFeatureSlotRequirements(draft);

  // 1. Race extra skills
  if (Array.isArray(draft.race?.extraSkillChoices)) {
    draft.race.extraSkillChoices = draft.race.extraSkillChoices
      .filter((k, idx, arr) => ALL_SKILL_KEYS.includes(k) && arr.indexOf(k) === idx)
      .slice(0, raceExtraSkillCount);
  }

  // 2. Class pool skills & INT bonus skills (avoid duplicates with prior steps)
  if (draft.class?.uuid) {
    const parsed = draft.class.parsedSkills || {};
    const beforePool = collectTrainedSkills(
      { ...draft, class: { ...draft.class, selectedPoolSkills: [], selectedIntSkills: [] } },
      { upToStep: 5 }
    );
    const poolSet = new Set(parsed.poolSkills || []);
    const availablePoolCount = (parsed.poolSkills || []).filter((k) => !beforePool.has(k)).length;
    const maxPool = Math.min(Number(parsed.choiceCount || 0), availablePoolCount);

    draft.class.selectedPoolSkills = (draft.class.selectedPoolSkills || [])
      .filter((k, idx, arr) => poolSet.has(k) && !beforePool.has(k) && arr.indexOf(k) === idx)
      .slice(0, maxPool);

    const beforeInt = collectTrainedSkills(
      { ...draft, class: { ...draft.class, selectedIntSkills: [] } },
      { upToStep: 5 }
    );
    const intBonus = Math.max(0, Number(finalAttrs.int || 0));
    const remainingGlobal = ALL_SKILL_KEYS.filter((k) => !beforeInt.has(k)).length;
    const maxInt = Math.min(intBonus, remainingGlobal);

    draft.class.selectedIntSkills = (draft.class.selectedIntSkills || [])
      .filter((k, idx, arr) => ALL_SKILL_KEYS.includes(k) && !beforeInt.has(k) && arr.indexOf(k) === idx)
      .slice(0, maxInt);
  }

  // 3. Free powers & spells
  if (Array.isArray(draft.magicAndPowers?.selectedFreePowers)) {
    draft.magicAndPowers.selectedFreePowers = draft.magicAndPowers.selectedFreePowers.slice(0, freePowerSlots.length);
  }

  const caster = resolveWizardCasterSpec(draft);
  if (!caster || caster.totalQuota <= 0) {
    draft.magicAndPowers.selectedSpells = [];
  } else {
    const allowedTipos = new Set([caster.tradicao, "uni"]);
    draft.magicAndPowers.selectedSpells = (draft.magicAndPowers.selectedSpells || [])
      .filter((s) => Number(s.circulo || 1) <= caster.unlockedCircle && (!s.tipo || allowedTipos.has(s.tipo)))
      .slice(0, caster.totalQuota);
  }

  return draft;
}

/**
 * Validates a single wizard step strictly (`1..8`). Returns `{ valid, errors }`.
 */
export function validateWizardStep(draft, stepNum) {
  const errors = [];
  const finalAttrs = resolveFinalAttributes(draft);
  const { raceExtraSkillCount, freePowerSlots } = resolveFeatureSlotRequirements(draft);

  switch (stepNum) {
    case 1: {
      if (!String(draft.identity?.name || "").trim()) {
        errors.push("Informe o nome do personagem.");
      }
      break;
    }
    case 2: {
      const mode = draft.attributes?.mode || "pointbuy";
      if (mode === "pointbuy") {
        const pb = computePointBuySummary(draft.attributes.base);
        if (!pb.allInBounds) {
          errors.push(`Atributos na compra por pontos devem estar entre ${POINT_BUY_MIN} e +${POINT_BUY_MAX}.`);
        } else if (pb.remaining > 0) {
          errors.push(`Ainda restam ${pb.remaining} ponto(s) para distribuir.`);
        } else if (pb.remaining < 0) {
          errors.push(`Você gastou ${Math.abs(pb.remaining)} ponto(s) além do limite de ${POINT_BUY_BUDGET}.`);
        }
      } else if (mode === "roll") {
        if (!draft.attributes.rolledSet?.rolls?.length) {
          errors.push("Clique em Rolar Atributos (4d6) para gerar os 6 valores.");
        } else {
          const used = new Set();
          for (const key of ATTR_ORDER) {
            const idx = draft.attributes.rollAssignments?.[key];
            if (idx === null || idx === undefined || !Number.isInteger(idx) || idx < 0 || idx > 5) {
              errors.push(`Atribua um valor rolado para ${ATTR_LABELS_PT[key]}.`);
            } else if (used.has(idx)) {
              errors.push("Cada valor rolado só pode ser usado uma vez.");
            } else {
              used.add(idx);
            }
          }
        }
      }
      break;
    }
    case 3: {
      if (!draft.race?.uuid) {
        errors.push("Selecione uma Raça.");
        break;
      }
      const dynCount = Number(draft.race.dynamicCount || 0);
      if (dynCount > 0) {
        const picked = draft.race.dynamicPicked || [];
        const uniqueValid = new Set(picked.filter((k) => draft.race.dynamicEligible.includes(k)));
        if (uniqueValid.size < dynCount) {
          errors.push(`Escolha ${dynCount} atributo(s) dinâmico(s) da raça (${uniqueValid.size}/${dynCount}).`);
        }
      }
      for (const [idx, grant] of (draft.race.grants || []).entries()) {
        if (grant.type === "single" && grant.choices?.length > 1 && !draft.race.grantChoices?.[idx]?.chosenUuid) {
          errors.push(`Complete a escolha racial: ${grant.title || `Opção ${idx + 1}`}.`);
        }
      }
      if (raceExtraSkillCount > 0) {
        const chosenCount = (draft.race.extraSkillChoices || []).length;
        if (chosenCount < raceExtraSkillCount) {
          errors.push(`Escolha ${raceExtraSkillCount} perícia(s) concedida(s) pela raça (${chosenCount}/${raceExtraSkillCount}).`);
        }
      }
      break;
    }
    case 4: {
      if (!draft.origin?.uuid) {
        errors.push("Selecione uma Origem.");
        break;
      }
      const totalBenefitsAvailable = (draft.origin.skillOptions?.length || 0) + (draft.origin.poderChoices?.length || 0);
      const requiredBenefits = Math.min(2, totalBenefitsAvailable);
      const pickedCount = (draft.origin.pickedSkills?.length || 0) + (draft.origin.pickedPowerIndices?.length || 0);
      if (pickedCount !== requiredBenefits) {
        errors.push(`Selecione exatamente ${requiredBenefits} benefício(s) da Origem (${pickedCount}/${requiredBenefits}).`);
      }
      break;
    }
    case 5: {
      if (!draft.class?.uuid) {
        errors.push("Selecione uma Classe inicial.");
        break;
      }
      const rule = getClassProgressionRule(draft.class.name);
      if (rule?.caster?.hasPaths && !draft.class.arcanistaPath) {
        errors.push("Escolha o Caminho do Arcanista (Bruxo, Mago ou Feiticeiro).");
      }
      const parsed = draft.class.parsedSkills || {};
      for (const [idx, group] of (parsed.orChoices || []).entries()) {
        if (!draft.class.orSelections?.[idx] || !group.includes(draft.class.orSelections[idx])) {
          errors.push(`Escolha uma das perícias obrigatórias da classe (${idx + 1}º grupo).`);
        }
      }
      const preTrainedBeforePool = collectTrainedSkills({ ...draft, class: { ...draft.class, selectedPoolSkills: [], selectedIntSkills: [] } }, { upToStep: 5 });
      const availablePoolCount = (parsed.poolSkills || []).filter((k) => !preTrainedBeforePool.has(k)).length;
      const reqPool = Math.min(Number(parsed.choiceCount || 0), availablePoolCount);
      if ((draft.class.selectedPoolSkills?.length || 0) !== reqPool) {
        errors.push(`Selecione ${reqPool} perícia(s) de classe (${draft.class.selectedPoolSkills?.length || 0}/${reqPool}).`);
      }

      const intBonus = Math.max(0, Number(finalAttrs.int || 0));
      const trainedBeforeInt = collectTrainedSkills({ ...draft, class: { ...draft.class, selectedIntSkills: [] } }, { upToStep: 5 });
      const remainingGlobalCount = ALL_SKILL_KEYS.filter((k) => !trainedBeforeInt.has(k)).length;
      const reqInt = Math.min(intBonus, remainingGlobalCount);
      if ((draft.class.selectedIntSkills?.length || 0) !== reqInt) {
        errors.push(`Selecione ${reqInt} perícia(s) bônus por Inteligência (${draft.class.selectedIntSkills?.length || 0}/${reqInt}).`);
      }
      break;
    }
    case 6: {
      const policy = getClassDevoteePolicy(draft.class?.name);
      if (policy.isMandatory && !draft.deity?.uuid) {
        errors.push(`${draft.class.name || "Esta classe"} exige escolher uma Divindade devotada.`);
        break;
      }
      if (draft.deity?.uuid && (draft.deity.poderesConcedidos?.length || 0) > 0) {
        const pickedCount = draft.deity.selectedPowerUuids?.length || 0;
        if (pickedCount < policy.minPowersIfDevoted) {
          errors.push("Selecione ao menos 1 Poder Concedido pela Divindade.");
        } else if (policy.maxPowersIfDevoted !== null && pickedCount > policy.maxPowersIfDevoted) {
          errors.push(`Devoto comum pode escolher no máximo ${policy.maxPowersIfDevoted} Poder Concedido.`);
        }
      }
      break;
    }
    case 7: {
      if (freePowerSlots.length > 0) {
        const pickedPowers = draft.magicAndPowers?.selectedFreePowers?.length || 0;
        if (pickedPowers < freePowerSlots.length) {
          errors.push(`Escolha os Poderes livres pendentes (${pickedPowers}/${freePowerSlots.length}).`);
        }
      }
      const caster = resolveWizardCasterSpec(draft);
      if (caster && caster.totalQuota > 0) {
        const pickedSpells = draft.magicAndPowers?.selectedSpells || [];
        if (pickedSpells.length !== caster.totalQuota) {
          errors.push(`Selecione exatamente ${caster.totalQuota} magias de 1º círculo (${pickedSpells.length}/${caster.totalQuota}).`);
        } else if (caster.schoolRestrictedCount > 0) {
          const schools = new Set(pickedSpells.map((s) => normalizeText(s.escola)).filter(Boolean));
          if (schools.size > caster.schoolRestrictedCount) {
            errors.push(`${caster.className} permite no máximo ${caster.schoolRestrictedCount} escolas de magia.`);
          }
        }
      }
      break;
    }
    case 8: {
      const budget = computeEquipmentBudget(draft);
      if (budget.overspent) {
        errors.push(`O gasto em equipamentos (${budget.spentGold} T$) ultrapassa seu saldo inicial (${budget.startingGold} T$).`);
      }
      for (let s = 1; s <= 7; s += 1) {
        const sub = validateWizardStep(draft, s);
        if (!sub.valid) {
          errors.push(`Passo ${s} (${WIZARD_STEPS[s - 1].label}): ${sub.errors[0]}`);
        }
      }
      break;
    }
    default:
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Builds an actor-like snapshot consumed by `evaluatePowerStatus(entry, null, snapshot)`.
 */
export function buildDraftActorSnapshot(draft) {
  const finalAttrs = resolveFinalAttributes(draft);
  const trained = collectTrainedSkills(draft, { upToStep: 7 });
  const classLevels = new Map();
  const ownedItems = new Set();

  if (draft.class?.uuid && draft.class.name) {
    classLevels.set(normalizeProgressKey(draft.class.name), 1);
    ownedItems.add(normalizeProgressKey(draft.class.name));
  }
  if (draft.race?.uuid && draft.race.name) {
    ownedItems.add(normalizeProgressKey(draft.race.name));
  }
  for (const idx of draft.origin?.pickedPowerIndices || []) {
    const c = draft.origin.poderChoices?.[idx];
    if (c?.name) ownedItems.add(normalizeProgressKey(c.name));
  }
  for (const pw of draft.magicAndPowers?.selectedFreePowers || []) {
    if (pw?.name) ownedItems.add(normalizeProgressKey(pw.name));
  }
  for (const uuid of draft.deity?.selectedPowerUuids || []) {
    const match = draft.deity.poderesConcedidos?.find((p) => p.uuid === uuid);
    if (match?.name) ownedItems.add(normalizeProgressKey(match.name));
  }

  const atributos = {};
  for (const key of ATTR_ORDER) {
    atributos[key] = { value: finalAttrs[key] };
  }
  const pericias = {};
  for (const key of ALL_SKILL_KEYS) {
    pericias[key] = { treinado: trained.has(key) };
  }

  return {
    totalLevel: draft.class?.uuid ? 1 : 0,
    classLevels,
    ownedItems,
    atributos,
    pericias
  };
}

/**
 * Computes full live preview state for the right-hand summary panel and step bar.
 */
export function computeWizardPreview(draft) {
  const baseAttrs = resolveBaseAttributes(draft);
  const racialAttrs = resolveRacialAttributes(draft);
  const finalAttrs = resolveFinalAttributes(draft);
  const pointBuy = computePointBuySummary(draft.attributes?.base);
  const trainedMap = collectTrainedSkills(draft, { upToStep: 8 });
  const caster = resolveWizardCasterSpec(draft);
  const devoteePolicy = getClassDevoteePolicy(draft.class?.name);
  const { raceExtraSkillCount, raceChoiceGrant, freePowerSlots } = resolveFeatureSlotRequirements(draft);
  const budget = computeEquipmentBudget(draft);

  const pvBase = Number(draft.class?.pvPorNivel || 0);
  const pmBase = Number(draft.class?.pmPorNivel || 0);
  const pvMax = draft.class?.uuid ? Math.max(1, pvBase * 4 + finalAttrs.con) : 0;

  let pmBonus = 0;
  if (draft.class?.uuid) {
    const clsKey = normalizeProgressKey(draft.class.name);
    if (clsKey === "arcanista" && caster?.keyAttr) pmBonus += Math.max(0, finalAttrs[caster.keyAttr] || 0);
    else if (clsKey === "clerigo" || clsKey === "druida") pmBonus += Math.max(0, finalAttrs.sab || 0);
    else if (clsKey === "bardo" || clsKey === "paladino") pmBonus += Math.max(0, finalAttrs.car || 0);
  }
  const pmMax = draft.class?.uuid ? Math.max(0, pmBase + pmBonus) : 0;

  const validationByStep = {};
  let allStepsValid = true;
  for (const step of WIZARD_STEPS) {
    const v = validateWizardStep(draft, step.num);
    validationByStep[step.num] = v;
    if (!v.valid) allStepsValid = false;
  }

  return {
    baseAttrs,
    racialAttrs,
    finalAttrs,
    pointBuy,
    trainedSkills: [...trainedMap.values()],
    trainedMap,
    pvMax,
    pmMax,
    defesa: 10 + finalAttrs.des,
    caster,
    devoteePolicy,
    raceExtraSkillCount,
    raceChoiceGrant,
    freePowerSlots,
    budget,
    validationByStep,
    allStepsValid,
    parseProficienciesFallback: parseProficienciesText,
    parseClassSkillsFn: parseClassSkills
  };
}
