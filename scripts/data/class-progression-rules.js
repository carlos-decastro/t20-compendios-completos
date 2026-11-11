/**
 * @fileoverview Canonical Tormenta20 JdA (1–20) class progression rules,
 * power slot schedules, progressive scaling specs, and spellcasting quotas.
 * Pure data + deterministic helpers (Node & Foundry safe).
 */

export const MODULE_ID = "t20-compendios-completos";

/** T20 Patamares (Tiers) used for Aumento de Atributo & progression gates */
export const T20_TIERS = [
  { key: "iniciante", label: "Iniciante", min: 1, max: 4 },
  { key: "veterano", label: "Veterano", min: 5, max: 10 },
  { key: "campeao", label: "Campeão", min: 11, max: 16 },
  { key: "lenda", label: "Lenda", min: 17, max: 20 }
];

export const BONUS_SPELL_POWERS = [
  { pattern: /^conhecimento magico\b/, spellsPerRank: 2, label: "Conhecimento Mágico" },
  { pattern: /^aumentar repertorio\b/, spellsPerRank: 2, label: "Aumentar Repertório" },
  { pattern: /^segredos da natureza\b/, spellsPerRank: 2, label: "Segredos da Natureza" },
  { pattern: /^aspecto d[ao] (inverno|outono|primavera|verao)\b/, spellsPerRank: 1, label: "Aspecto Elemental" },
  { pattern: /^linhagem .*basica\b|^basica$/, spellsPerRank: 1, label: "Linhagem Básica" }
];

export function normalizeProgressKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getTierForLevel(level) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  return T20_TIERS.find((t) => lvl >= t.min && lvl <= t.max) || T20_TIERS[0];
}

/**
 * Helper to build a 1..20 level map concisely from declarative overrides.
 * By default, levels 2..20 grant a class power slot unless `noSlotLevels` excludes them.
 */
function buildLevels(powerSubtype, { fixed = {}, scaling = {}, noSlotLevels = [1] } = {}) {
  const levels = {};
  for (let lvl = 1; lvl <= 20; lvl += 1) {
    const fixedList = fixed[lvl] ? [...fixed[lvl]] : [];
    const scalingList = scaling[lvl] ? [...scaling[lvl]] : [];
    const hasSlot = !noSlotLevels.includes(lvl);
    levels[lvl] = {
      level: lvl,
      fixed: fixedList,
      scaling: scalingList,
      slot: hasSlot,
      slotLabel: hasSlot ? `Poder de ${powerSubtype}` : null
    };
  }
  return levels;
}

/**
 * Computes highest circle unlocked and total expected known spells
 * for a given spellcaster config + actor class level + extra bonus spells.
 */
export function evaluateCasterProgression(casterSpec, classLevel, { pathKey = null, bonusSpells = 0 } = {}) {
  if (!casterSpec) return null;
  const lvl = Math.max(1, Math.min(20, Number(classLevel) || 1));
  let unlockedCircle = 0;
  for (let i = 0; i < casterSpec.circles.length; i += 1) {
    if (lvl >= casterSpec.circles[i]) unlockedCircle = i + 1;
  }

  let formula = casterSpec.spellQuota;
  let activeAttr = casterSpec.keyAttr;
  let pathLabel = null;

  if (casterSpec.hasPaths && casterSpec.paths) {
    const chosenKey = pathKey && casterSpec.paths[pathKey] ? pathKey : casterSpec.defaultPath;
    const p = casterSpec.paths[chosenKey];
    formula = p;
    activeAttr = p.attr;
    pathLabel = p.label;
  }

  let baseQuota = 0;
  if (formula) {
    const extraCircles = Math.max(0, unlockedCircle - 1);
    if (formula.mode === "even") {
      // Starts with `base` at 1st; learns +1 on even levels (2, 4, 6...)
      baseQuota = formula.base + Math.floor(lvl / 2);
    } else if (formula.mode === "odd") {
      // Feiticeiro: starts with 3 at 1st; learns +1 on odd levels (3, 5, 7...)
      baseQuota = formula.base + Math.floor((lvl - 1) / 2);
    } else {
      // Standard per level (Bruxo/Clerigo = 3 + lvl-1; Mago = 4 + lvl-1 + extraCircles)
      baseQuota = formula.base + (lvl - 1) + (formula.perNewCircle || 0) * extraCircles;
    }
  }

  return {
    tradicao: casterSpec.tradicao,
    tradicaoLabel: casterSpec.tradicao === "arc" ? "Arcana" : "Divina",
    keyAttr: activeAttr,
    pathKey: casterSpec.hasPaths ? (pathKey || null) : null,
    pathLabel,
    unlockedCircle,
    maxCircle: casterSpec.maxCircle,
    schoolRestrictedCount: casterSpec.schoolLimit || 0,
    baseQuota,
    bonusSpells,
    totalQuota: baseQuota + bonusSpells,
    nextCircleLevel: casterSpec.circles.find((reqLvl) => reqLvl > lvl) || null
  };
}

/**
 * Canonical rules for all 14 Tormenta20 Jogo do Ano base classes.
 */
export const CLASS_PROGRESSION_RULES = {
  arcanista: {
    key: "arcanista",
    name: "Arcanista",
    powerSubtype: "Arcanista",
    pmPerLevelAttrChoice: true,
    caster: {
      tradicao: "arc",
      keyAttr: "int",
      circles: [1, 5, 9, 13, 17],
      maxCircle: 5,
      hasPaths: true,
      defaultPath: "bruxo",
      paths: {
        bruxo: { label: "Bruxo", attr: "int", mode: "perLevel", base: 3, perNewCircle: 0 },
        mago: { label: "Mago", attr: "int", mode: "perLevel", base: 4, perNewCircle: 1 },
        feiticeiro: { label: "Feiticeiro", attr: "car", mode: "odd", base: 3, perNewCircle: 0 }
      }
    },
    scalingSpecs: {
      "magias": {
        evaluate: (lvl) => {
          const circ = lvl >= 17 ? 5 : lvl >= 13 ? 4 : lvl >= 9 ? 3 : lvl >= 5 ? 2 : 1;
          return { rank: circ, display: `${circ}º Círculo` };
        }
      }
    },
    levels: buildLevels("Arcanista", {
      fixed: {
        1: ["Caminho do Arcanista", "Magias (Arcanista)"],
        20: ["Alta Arcana"]
      },
      scaling: {
        5: [{ name: "Magias (Arcanista)", display: "2º Círculo" }],
        9: [{ name: "Magias (Arcanista)", display: "3º Círculo" }],
        13: [{ name: "Magias (Arcanista)", display: "4º Círculo" }],
        17: [{ name: "Magias (Arcanista)", display: "5º Círculo" }]
      }
    })
  },

  barbaro: {
    key: "barbaro",
    name: "Bárbaro",
    powerSubtype: "Bárbaro",
    caster: null,
    scalingSpecs: {
      "furia": {
        evaluate: (lvl) => {
          const bonus = lvl >= 16 ? 5 : lvl >= 11 ? 4 : lvl >= 6 ? 3 : 2;
          return { rank: bonus, display: `+${bonus}`, numericValue: bonus };
        },
        effectUpdates: ({ numericValue }) => ({
          matchNonOnuse: true,
          keys: { "system.modificadores.ataque.cac": numericValue, "system.modificadores.dano.cac": numericValue }
        })
      },
      "instinto selvagem": {
        evaluate: (lvl) => {
          const bonus = lvl >= 15 ? 3 : lvl >= 9 ? 2 : 1;
          return { rank: bonus, display: `+${bonus}` };
        }
      },
      "reducao de dano": {
        evaluate: (lvl) => {
          const rd = lvl >= 17 ? 10 : lvl >= 14 ? 8 : lvl >= 11 ? 6 : lvl >= 8 ? 4 : 2;
          return { rank: rd, display: `RD ${rd}` };
        }
      }
    },
    levels: buildLevels("Bárbaro", {
      fixed: {
        1: ["Fúria"],
        3: ["Instinto Selvagem"],
        5: ["Redução de Dano"],
        20: ["Fúria Titânica"]
      },
      scaling: {
        6: [{ name: "Fúria", display: "+3" }],
        8: [{ name: "Redução de Dano", display: "RD 4" }],
        9: [{ name: "Instinto Selvagem", display: "+2" }],
        11: [{ name: "Fúria", display: "+4" }, { name: "Redução de Dano", display: "RD 6" }],
        14: [{ name: "Redução de Dano", display: "RD 8" }],
        15: [{ name: "Instinto Selvagem", display: "+3" }],
        16: [{ name: "Fúria", display: "+5" }],
        17: [{ name: "Redução de Dano", display: "RD 10" }]
      }
    })
  },

  bardo: {
    key: "bardo",
    name: "Bardo",
    powerSubtype: "Bardo",
    caster: {
      tradicao: "arc",
      keyAttr: "car",
      circles: [1, 6, 10, 14],
      maxCircle: 4,
      schoolLimit: 3,
      spellQuota: { mode: "even", base: 2, perNewCircle: 0 }
    },
    scalingSpecs: {
      "inspiracao": {
        evaluate: (lvl) => {
          const bonus = 1 + Math.floor((lvl - 1) / 4);
          return { rank: bonus, display: `+${bonus}`, numericValue: bonus };
        },
        effectUpdates: ({ numericValue }) => ({
          matchNonOnuse: true,
          keys: { "@modificador": numericValue }
        })
      },
      "magias": {
        evaluate: (lvl) => {
          const circ = lvl >= 14 ? 4 : lvl >= 10 ? 3 : lvl >= 6 ? 2 : 1;
          return { rank: circ, display: `${circ}º Círculo` };
        }
      }
    },
    levels: buildLevels("Bardo", {
      fixed: {
        1: ["Inspiração", "Magias (Bardo)"],
        2: ["Eclético"],
        20: ["Artista Completo"]
      },
      scaling: {
        5: [{ name: "Inspiração", display: "+2" }],
        6: [{ name: "Magias (Bardo)", display: "2º Círculo" }],
        9: [{ name: "Inspiração", display: "+3" }],
        10: [{ name: "Magias (Bardo)", display: "3º Círculo" }],
        13: [{ name: "Inspiração", display: "+4" }],
        14: [{ name: "Magias (Bardo)", display: "4º Círculo" }],
        17: [{ name: "Inspiração", display: "+5" }]
      }
    })
  },

  bucaneiro: {
    key: "bucaneiro",
    name: "Bucaneiro",
    powerSubtype: "Bucaneiro",
    caster: null,
    scalingSpecs: {
      "esquiva sagaz": {
        evaluate: (lvl) => {
          const bonus = 1 + Math.floor((lvl - 3) / 4);
          return { rank: bonus, display: `+${bonus}` };
        }
      }
    },
    levels: buildLevels("Bucaneiro", {
      fixed: {
        1: ["Audácia", "Insolência"],
        2: ["Evasão"],
        3: ["Esquiva Sagaz"],
        5: ["Panache"],
        10: ["Evasão Aprimorada"],
        20: ["Sorte de Nimb"]
      },
      scaling: {
        7: [{ name: "Esquiva Sagaz", display: "+2" }],
        11: [{ name: "Esquiva Sagaz", display: "+3" }],
        15: [{ name: "Esquiva Sagaz", display: "+4" }],
        19: [{ name: "Esquiva Sagaz", display: "+5" }]
      }
    })
  },

  cacador: {
    key: "cacador",
    name: "Caçador",
    powerSubtype: "Caçador",
    caster: null,
    scalingSpecs: {
      "marca da presa": {
        evaluate: (lvl) => {
          const die = lvl >= 17 ? "2d10" : lvl >= 13 ? "2d8" : lvl >= 9 ? "1d12" : lvl >= 5 ? "1d8" : "1d4";
          const rank = lvl >= 17 ? 5 : lvl >= 13 ? 4 : lvl >= 9 ? 3 : lvl >= 5 ? 2 : 1;
          return { rank, display: `+${die}`, diceFormula: die };
        },
        effectUpdates: ({ diceFormula }) => ({
          matchOnuse: true,
          keys: { "dano": diceFormula }
        })
      },
      "explorador": {
        evaluate: (lvl) => {
          const count = 1 + Math.floor((lvl - 3) / 4);
          return { rank: count, display: `${count} terreno(s)` };
        }
      }
    },
    levels: buildLevels("Caçador", {
      fixed: {
        1: ["Marca da Presa", "Rastreador"],
        3: ["Explorador"],
        5: ["Caminho do Explorador"],
        20: ["Mestre Caçador"]
      },
      scaling: {
        5: [{ name: "Marca da Presa", display: "+1d8" }],
        7: [{ name: "Explorador", display: "2 terrenos" }],
        9: [{ name: "Marca da Presa", display: "+1d12" }],
        11: [{ name: "Explorador", display: "3 terrenos" }],
        13: [{ name: "Marca da Presa", display: "+2d8" }],
        15: [{ name: "Explorador", display: "4 terrenos" }],
        17: [{ name: "Marca da Presa", display: "+2d10" }],
        19: [{ name: "Explorador", display: "5 terrenos" }]
      }
    })
  },

  cavaleiro: {
    key: "cavaleiro",
    name: "Cavaleiro",
    powerSubtype: "Cavaleiro",
    caster: null,
    scalingSpecs: {
      "baluarte": {
        evaluate: (lvl) => {
          const bonus = 2 * (1 + Math.floor((lvl - 1) / 4));
          const rangeNote = lvl >= 15 ? " (alcance curto)" : lvl >= 7 ? " (aliados adjacentes)" : "";
          return { rank: bonus, display: `+${bonus}${rangeNote}`, numericValue: bonus };
        },
        effectUpdates: ({ numericValue }) => ({
          matchAll: true,
          keys: {
            "system.attributes.defesa.bonus": `+${numericValue}`,
            "system.modificadores.pericias.resistencia": `+${numericValue}`
          }
        })
      },
      "duelo": {
        evaluate: (lvl) => {
          const bonus = lvl >= 17 ? 5 : lvl >= 12 ? 4 : lvl >= 7 ? 3 : 2;
          return { rank: bonus, display: `+${bonus}`, numericValue: bonus };
        },
        effectUpdates: ({ numericValue }) => ({
          matchOnuse: true,
          keys: { "ataque": numericValue, "dano": numericValue }
        })
      }
    },
    levels: buildLevels("Cavaleiro", {
      fixed: {
        1: ["Baluarte", "Código de Honra"],
        2: ["Duelo"],
        5: ["Caminho do Cavaleiro"],
        11: ["Resoluto"],
        20: ["Bravura Final"]
      },
      scaling: {
        5: [{ name: "Baluarte", display: "+4" }],
        7: [{ name: "Baluarte", display: "aliados adjacentes" }, { name: "Duelo", display: "+3" }],
        9: [{ name: "Baluarte", display: "+6" }],
        12: [{ name: "Duelo", display: "+4" }],
        13: [{ name: "Baluarte", display: "+8" }],
        15: [{ name: "Baluarte", display: "aliados alcance curto" }],
        17: [{ name: "Baluarte", display: "+10" }, { name: "Duelo", display: "+5" }]
      }
    })
  },

  clerigo: {
    key: "clerigo",
    name: "Clérigo",
    powerSubtype: "Clérigo",
    caster: {
      tradicao: "div",
      keyAttr: "sab",
      circles: [1, 5, 9, 13, 17],
      maxCircle: 5,
      spellQuota: { mode: "perLevel", base: 3, perNewCircle: 0 }
    },
    scalingSpecs: {
      "magias": {
        evaluate: (lvl) => {
          const circ = lvl >= 17 ? 5 : lvl >= 13 ? 4 : lvl >= 9 ? 3 : lvl >= 5 ? 2 : 1;
          return { rank: circ, display: `${circ}º Círculo` };
        }
      }
    },
    levels: buildLevels("Clérigo", {
      fixed: {
        1: ["Devoto Fiel", "Magias (Clérigo)"],
        20: ["Mão da Divindade"]
      },
      scaling: {
        5: [{ name: "Magias (Clérigo)", display: "2º Círculo" }],
        9: [{ name: "Magias (Clérigo)", display: "3º Círculo" }],
        13: [{ name: "Magias (Clérigo)", display: "4º Círculo" }],
        17: [{ name: "Magias (Clérigo)", display: "5º Círculo" }]
      }
    })
  },

  druida: {
    key: "druida",
    name: "Druida",
    powerSubtype: "Druida",
    caster: {
      tradicao: "div",
      keyAttr: "sab",
      circles: [1, 6, 10, 14],
      maxCircle: 4,
      schoolLimit: 3,
      spellQuota: { mode: "even", base: 2, perNewCircle: 0 }
    },
    scalingSpecs: {
      "magias": {
        evaluate: (lvl) => {
          const circ = lvl >= 14 ? 4 : lvl >= 10 ? 3 : lvl >= 6 ? 2 : 1;
          return { rank: circ, display: `${circ}º Círculo` };
        }
      }
    },
    levels: buildLevels("Druida", {
      fixed: {
        1: ["Devoto Fiel", "Empatia Selvagem", "Magias (Druida)"],
        2: ["Caminho dos Ermos"],
        20: ["Força da Natureza"]
      },
      scaling: {
        6: [{ name: "Magias (Druida)", display: "2º Círculo" }],
        10: [{ name: "Magias (Druida)", display: "3º Círculo" }],
        14: [{ name: "Magias (Druida)", display: "4º Círculo" }]
      }
    })
  },

  guerreiro: {
    key: "guerreiro",
    name: "Guerreiro",
    powerSubtype: "Guerreiro",
    caster: null,
    scalingSpecs: {
      "ataque especial": {
        evaluate: (lvl) => {
          const rank = 1 + Math.floor((lvl - 1) / 4);
          const bonus = rank * 4;
          return { rank, display: `+${bonus}`, numericValue: bonus };
        },
        // Keeps base 1PM = +4 option AND appends max tier note on description
        effectUpdates: () => null
      }
    },
    levels: buildLevels("Guerreiro", {
      fixed: {
        1: ["Ataque Especial"],
        3: ["Durão"],
        6: ["Ataque Extra"],
        20: ["Campeão"]
      },
      scaling: {
        5: [{ name: "Ataque Especial", display: "+8" }],
        9: [{ name: "Ataque Especial", display: "+12" }],
        13: [{ name: "Ataque Especial", display: "+16" }],
        17: [{ name: "Ataque Especial", display: "+20" }]
      }
    })
  },

  inventor: {
    key: "inventor",
    name: "Inventor",
    powerSubtype: "Inventor",
    caster: null,
    scalingSpecs: {
      "fabricar item superior": {
        evaluate: (lvl) => {
          const mods = lvl >= 11 ? 4 : lvl >= 8 ? 3 : lvl >= 5 ? 2 : 1;
          return { rank: mods, display: `${mods} melhoria${mods > 1 ? "s" : ""}` };
        }
      },
      "fabricar item magico": {
        evaluate: (lvl) => {
          const tier = lvl >= 17 ? "Maior" : lvl >= 13 ? "Médio" : "Menor";
          return { rank: tier, display: `(${tier})` };
        }
      }
    },
    levels: buildLevels("Inventor", {
      fixed: {
        1: ["Engenhosidade", "Protótipo"],
        2: ["Fabricar Item Superior"],
        3: ["Comerciante"],
        7: ["Encontrar Fraqueza"],
        9: ["Fabricar Item Mágico"],
        10: ["Olho do Dragão"],
        20: ["Obra-Prima"]
      },
      scaling: {
        5: [{ name: "Fabricar Item Superior", display: "2 melhorias" }],
        8: [{ name: "Fabricar Item Superior", display: "3 melhorias" }],
        11: [{ name: "Fabricar Item Superior", display: "4 melhorias" }],
        13: [{ name: "Fabricar Item Mágico", display: "Médio" }],
        17: [{ name: "Fabricar Item Mágico", display: "Maior" }]
      }
    })
  },

  ladino: {
    key: "ladino",
    name: "Ladino",
    powerSubtype: "Ladino",
    caster: null,
    scalingSpecs: {
      "ataque furtivo": {
        evaluate: (lvl) => {
          const dice = Math.min(10, 1 + Math.floor((lvl - 1) / 2));
          return { rank: dice, display: `+${dice}d6`, diceFormula: `${dice}d6` };
        },
        rollFormula: ({ diceFormula }) => diceFormula
      }
    },
    levels: buildLevels("Ladino", {
      fixed: {
        1: ["Ataque Furtivo", "Especialista"],
        2: ["Evasão"],
        4: ["Esquiva Sobrenatural"],
        8: ["Olhos nas Costas"],
        10: ["Evasão Aprimorada"],
        20: ["A Pessoa Certa para o Trabalho"]
      },
      scaling: {
        3: [{ name: "Ataque Furtivo", display: "+2d6" }],
        5: [{ name: "Ataque Furtivo", display: "+3d6" }],
        7: [{ name: "Ataque Furtivo", display: "+4d6" }],
        9: [{ name: "Ataque Furtivo", display: "+5d6" }],
        11: [{ name: "Ataque Furtivo", display: "+6d6" }],
        13: [{ name: "Ataque Furtivo", display: "+7d6" }],
        15: [{ name: "Ataque Furtivo", display: "+8d6" }],
        17: [{ name: "Ataque Furtivo", display: "+9d6" }],
        19: [{ name: "Ataque Furtivo", display: "+10d6" }]
      }
    })
  },

  lutador: {
    key: "lutador",
    name: "Lutador",
    powerSubtype: "Lutador",
    caster: null,
    scalingSpecs: {
      "briga": {
        evaluate: (lvl) => {
          const die = lvl >= 20 ? "2d10" : lvl >= 17 ? "2d8" : lvl >= 13 ? "2d6" : lvl >= 9 ? "1d10" : lvl >= 5 ? "1d8" : "1d6";
          return { rank: die, display: die, diceFormula: die };
        }
      },
      "casca grossa": {
        evaluate: (lvl) => {
          const extra = lvl >= 19 ? 4 : lvl >= 15 ? 3 : lvl >= 11 ? 2 : lvl >= 7 ? 1 : 0;
          return { rank: extra, display: extra > 0 ? `Con+${extra}` : "Con" };
        }
      }
    },
    levels: buildLevels("Lutador", {
      fixed: {
        1: ["Briga", "Golpe Relâmpago"],
        3: ["Casca Grossa"],
        5: ["Golpe Cruel"],
        9: ["Golpe Violento"],
        20: ["Dono da Rua"]
      },
      scaling: {
        5: [{ name: "Briga", display: "1d8" }],
        7: [{ name: "Casca Grossa", display: "Con+1" }],
        9: [{ name: "Briga", display: "1d10" }],
        11: [{ name: "Casca Grossa", display: "Con+2" }],
        13: [{ name: "Briga", display: "2d6" }],
        15: [{ name: "Casca Grossa", display: "Con+3" }],
        17: [{ name: "Briga", display: "2d8" }],
        19: [{ name: "Casca Grossa", display: "Con+4" }],
        20: [{ name: "Briga", display: "2d10" }]
      }
    })
  },

  nobre: {
    key: "nobre",
    name: "Nobre",
    powerSubtype: "Nobre",
    caster: null,
    scalingSpecs: {
      "palavras afiadas": {
        evaluate: (lvl) => {
          const rank = 1 + Math.floor((lvl - 2) / 4);
          const dice = `${rank * 2}d6`;
          return { rank, display: dice, diceFormula: dice };
        },
        rollFormula: ({ diceFormula }) => diceFormula,
        effectUpdates: ({ diceFormula }) => ({
          matchOnuse: true,
          keys: { "dano": diceFormula }
        })
      }
    },
    levels: buildLevels("Nobre", {
      fixed: {
        1: ["Autoconfiança", "Espólio", "Orgulho"],
        2: ["Palavras Afiadas"],
        3: ["Riqueza"],
        4: ["Gritar Ordens"],
        5: ["Presença Aristocrática"],
        20: ["Realeza"]
      },
      scaling: {
        6: [{ name: "Palavras Afiadas", display: "4d6" }],
        10: [{ name: "Palavras Afiadas", display: "6d6" }],
        14: [{ name: "Palavras Afiadas", display: "8d6" }],
        18: [{ name: "Palavras Afiadas", display: "10d6" }]
      }
    })
  },

  paladino: {
    key: "paladino",
    name: "Paladino",
    powerSubtype: "Paladino",
    caster: null,
    scalingSpecs: {
      "golpe divino": {
        evaluate: (lvl) => {
          const rank = 1 + Math.floor((lvl - 1) / 4);
          const dice = `${rank}d8`;
          return { rank, display: `+${dice}`, diceFormula: dice };
        },
        rollFormula: ({ diceFormula }) => diceFormula,
        effectUpdates: ({ diceFormula }) => ({
          matchOnuse: true,
          keys: { "dano": diceFormula }
        })
      },
      "cura pelas maos": {
        evaluate: (lvl) => {
          const rank = 1 + Math.floor((lvl - 2) / 4);
          const formula = `${rank}d8+${rank}`;
          return { rank, display: `${formula} PV`, diceFormula: formula };
        },
        rollFormula: ({ diceFormula }) => diceFormula,
        effectUpdates: ({ diceFormula }) => ({
          matchOnuse: true,
          keys: { "dano": diceFormula }
        })
      }
    },
    levels: buildLevels("Paladino", {
      fixed: {
        1: ["Abençoado", "Código do Herói", "Golpe Divino"],
        2: ["Cura pelas Mãos"],
        3: ["Aura Sagrada"],
        5: ["Bênção da Justiça"],
        20: ["Vingador Sagrado"]
      },
      scaling: {
        5: [{ name: "Golpe Divino", display: "+2d8" }],
        6: [{ name: "Cura pelas Mãos", display: "2d8+2 PV" }],
        9: [{ name: "Golpe Divino", display: "+3d8" }],
        10: [{ name: "Cura pelas Mãos", display: "3d8+3 PV" }],
        13: [{ name: "Golpe Divino", display: "+4d8" }],
        14: [{ name: "Cura pelas Mãos", display: "4d8+4 PV" }],
        17: [{ name: "Golpe Divino", display: "+5d8" }],
        18: [{ name: "Cura pelas Mãos", display: "5d8+5 PV" }]
      }
    })
  }
};

export function getClassProgressionRule(classNameOrSlug) {
  const key = normalizeProgressKey(classNameOrSlug);
  return CLASS_PROGRESSION_RULES[key] || null;
}

/**
 * Tracks `Aumento de Atributo` picks per Patamar (Iniciante/Veterano/Campeao/Lenda).
 * T20 JdA rule: can be chosen multiple times, max 1x per patamar FOR THE SAME attribute.
 */
export function getAttributeIncreaseStatus(existingPowers = [], slotLevel = 1) {
  const tier = getTierForLevel(slotLevel);
  const perTierCounts = { iniciante: 0, veterano: 0, campeao: 0, lenda: 0 };
  const chosenAttrsByTier = { iniciante: [], veterano: [], campeao: [], lenda: [] };
  const attrDetectRe = /\((forca|destreza|constituicao|inteligencia|sabedoria|carisma)\)/i;
  const attrMap = {
    forca: "for",
    destreza: "des",
    constituicao: "con",
    inteligencia: "int",
    sabedoria: "sab",
    carisma: "car"
  };

  for (const item of existingPowers) {
    const norm = normalizeProgressKey(item.name);
    if (!norm.startsWith("aumento de atributo")) continue;
    const itemFlags = item.flags?.[MODULE_ID] || {};
    const lvl = Number(itemFlags.slotLevel || itemFlags.sourceLevel || 1);
    const t = getTierForLevel(lvl);
    perTierCounts[t.key] += 1;

    let attr = itemFlags.chosenAttribute || null;
    if (!attr) {
      const m = normalizeProgressKey(item.name).match(/\b(forca|destreza|constituicao|inteligencia|sabedoria|carisma)\b/);
      if (m) attr = attrMap[m[1]];
      else {
        const rawMatch = (item.name || "").match(attrDetectRe);
        if (rawMatch) attr = attrMap[normalizeProgressKey(rawMatch[1])];
      }
    }
    if (attr && !chosenAttrsByTier[t.key].includes(attr)) {
      chosenAttrsByTier[t.key].push(attr);
    }
  }

  return {
    currentTier: tier,
    countInCurrentTier: perTierCounts[tier.key],
    blockedAttrsInTier: [...chosenAttrsByTier[tier.key]],
    perTierCounts,
    chosenAttrsByTier
  };
}
