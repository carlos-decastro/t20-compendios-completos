import { POWER_PREREQS } from "../data/power-prereqs.js";
import { normalizeText, resolveSkillToken } from "./skill-parser.js";

const ATTR_KEY_MAP = {
  for: "for",
  forca: "for",
  des: "des",
  destreza: "des",
  con: "con",
  constituicao: "con",
  int: "int",
  inteligencia: "int",
  sab: "sab",
  sabedoria: "sab",
  car: "car",
  carisma: "car"
};

function normPowerKey(name) {
  return normalizeText(String(name || "").replace(/\(.*?\)/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves prereq/level metadata for a power entry from static OCR table.
 */
export function lookupPowerPrereqMeta(name, subtipo = "") {
  const baseKey = normPowerKey(name);
  if (!baseKey) return null;

  for (const part of String(subtipo || "").split(/[,/]/)) {
    const subKey = normPowerKey(part);
    if (subKey && POWER_PREREQS[`${baseKey}::${subKey}`]) {
      return POWER_PREREQS[`${baseKey}::${subKey}`];
    }
  }
  return POWER_PREREQS[baseKey] || null;
}

function buildCompactLabel(meta) {
  if (!meta) return "";
  if (meta.prereq) {
    return meta.prereq
      .replace(/\s*[ºo°]\s*n[ií]vel\s+de\s+/gi, "º nv ")
      .replace(/treinad[oa]\s+em\s+/gi, "")
      .trim();
  }
  if (meta.minLevel) {
    return meta.className ? `${meta.minLevel}º nv ${meta.className}` : `Nv ${meta.minLevel}`;
  }
  return "";
}

function extractActorSnapshot(actor) {
  if (!actor) return null;
  const classLevels = new Map();
  let totalLevel = 0;
  const ownedItems = new Set();

  for (const it of actor.items || []) {
    const k = normPowerKey(it.name);
    if (k) ownedItems.add(k);
    if (it.type === "classe") {
      const lv = Number(it.system?.niveis || 1);
      totalLevel += lv;
      if (k) classLevels.set(k, (classLevels.get(k) || 0) + lv);
    }
  }
  if (totalLevel === 0) {
    totalLevel = Number(actor.system?.attributes?.nivel?.value || 0);
  }

  return {
    totalLevel,
    classLevels,
    ownedItems,
    atributos: actor.system?.atributos || {},
    pericias: actor.system?.pericias || {}
  };
}

/**
 * Evaluates a power's level & prerequisites against an optional target actor.
 * Returns badge text, semantic state ("owned"|"eligible"|"locked"|"neutral"),
 * icon, tooltip, and list of missing requirements.
 */
export function evaluatePowerStatus(entry, actor = null, actorSnapshot = null) {
  const meta = lookupPowerPrereqMeta(entry?.name, entry?.system?.subtipo);
  const baseKey = normPowerKey(entry?.name);
  const snap = actorSnapshot || extractActorSnapshot(actor);

  const isOwned = Boolean(snap && baseKey && snap.ownedItems.has(baseKey));
  const compactLabel = buildCompactLabel(meta);
  const fullPrereq = meta?.prereq || "";

  if (!meta && !isOwned) {
    return {
      hasPrereq: false,
      prereqLabel: "",
      prereqFull: "",
      prereqState: "none",
      prereqIcon: "",
      prereqTooltip: "",
      missing: []
    };
  }

  if (isOwned) {
    return {
      hasPrereq: true,
      prereqLabel: compactLabel ? `Adquirido · ${compactLabel}` : "Adquirido",
      prereqFull: fullPrereq,
      prereqState: "owned",
      prereqIcon: "fa-solid fa-check-double",
      prereqTooltip: fullPrereq ? `Já adquirido • Pré-req: ${fullPrereq}` : "O personagem já possui este poder",
      missing: []
    };
  }

  if (!snap) {
    return {
      hasPrereq: Boolean(compactLabel),
      prereqLabel: compactLabel,
      prereqFull: fullPrereq,
      prereqState: "neutral",
      prereqIcon: meta?.minLevel ? "fa-solid fa-layer-group" : "fa-solid fa-lock-open",
      prereqTooltip: fullPrereq || compactLabel,
      missing: []
    };
  }

  const missing = [];
  let checkedCount = 0;

  if (fullPrereq) {
    const clauses = fullPrereq.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    for (const clause of clauses) {
      // 1. Level check (class-specific or total character level)
      const lvMatch =
        clause.match(/(\d+)\s*[ºo°]\s*n[ií]vel(?:\s+de\s+([a-zà-ú-]+))?/i)
        || clause.match(/n[ií]vel\s+(\d+)(?:\s+de\s+([a-zà-ú-]+))?/i);
      if (lvMatch) {
        checkedCount++;
        const reqLv = Number(lvMatch[1]);
        const clsHint = lvMatch[2] ? normPowerKey(lvMatch[2]) : "";
        if (clsHint && clsHint !== "personagem" && clsHint !== "conjurador") {
          const curLv = snap.classLevels.get(clsHint) || 0;
          if (curLv < reqLv) missing.push(`${lvMatch[2]} nível ${reqLv} (atual: ${curLv})`);
        } else if (snap.totalLevel < reqLv) {
          missing.push(`Nível ${reqLv} de personagem (atual: ${snap.totalLevel})`);
        }
        continue;
      }

      // 2. Attribute check (e.g. "Des 2", "Força 1")
      const attrMatch = clause.match(/^(for|forca|des|destreza|con|constituicao|int|inteligencia|sab|sabedoria|car|carisma)\s+(\d+)$/i);
      if (attrMatch) {
        checkedCount++;
        const attrKey = ATTR_KEY_MAP[normalizeText(attrMatch[1])];
        const reqVal = Number(attrMatch[2]);
        const curVal = Number(snap.atributos?.[attrKey]?.value ?? 0);
        if (attrKey && curVal < reqVal) {
          missing.push(`${attrMatch[1]} ${reqVal} (atual: ${curVal})`);
        }
        continue;
      }

      // 3. Skill training check (e.g. "treinado em Ladinagem")
      const skillMatch = clause.match(/^treinad[oa]\s+em\s+(.+)$/i);
      if (skillMatch) {
        const sKey = resolveSkillToken(skillMatch[1]);
        if (sKey && sKey !== "oficio") {
          checkedCount++;
          if (!snap.pericias?.[sKey]?.treinado) {
            missing.push(`Treinado em ${skillMatch[1]}`);
          }
        }
        continue;
      }

      // 4. Prerequisite power check (verified against known power names to avoid false positives)
      const cKey = normPowerKey(clause);
      if (cKey && POWER_PREREQS[cKey]) {
        checkedCount++;
        if (!snap.ownedItems.has(cKey)) {
          missing.push(clause);
        }
      }
    }
  } else if (meta?.minLevel) {
    checkedCount++;
    const clsHint = normPowerKey(meta.className);
    const curLv = clsHint ? (snap.classLevels.get(clsHint) || 0) : snap.totalLevel;
    if (curLv < meta.minLevel) {
      missing.push(meta.className ? `${meta.className} nível ${meta.minLevel} (atual: ${curLv})` : `Nível ${meta.minLevel}`);
    }
  }

  if (missing.length > 0) {
    return {
      hasPrereq: true,
      prereqLabel: compactLabel,
      prereqFull: fullPrereq,
      prereqState: "locked",
      prereqIcon: "fa-solid fa-lock",
      prereqTooltip: `Falta: ${missing.join(" • ")}`,
      missing
    };
  }

  if (checkedCount > 0) {
    return {
      hasPrereq: true,
      prereqLabel: compactLabel,
      prereqFull: fullPrereq,
      prereqState: "eligible",
      prereqIcon: "fa-solid fa-circle-check",
      prereqTooltip: `Pré-requisito atendido (${fullPrereq})`,
      missing: []
    };
  }

  return {
    hasPrereq: Boolean(compactLabel),
    prereqLabel: compactLabel,
    prereqFull: fullPrereq,
    prereqState: "neutral",
    prereqIcon: "fa-solid fa-circle-info",
    prereqTooltip: fullPrereq || compactLabel,
    missing: []
  };
}

export { extractActorSnapshot };

