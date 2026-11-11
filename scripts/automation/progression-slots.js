/**
 * @fileoverview Progression Slot Engine & Scaling Synchronizer for Tormenta20 JdA.
 * Computes PF2e-style class power slots, spellcaster circle/known quotas,
 * automatic passive imports, scaling rolls/effects, and downgrade cleanup.
 */

import {
  BONUS_SPELL_POWERS,
  MODULE_ID,
  evaluateCasterProgression,
  getClassProgressionRule,
  getTierForLevel,
  normalizeProgressKey
} from "../data/class-progression-rules.js";

export function buildSlotId(classKey, level) {
  return `${classKey}:L${Number(level) || 1}`;
}

function getDocItems(actor) {
  if (!actor?.items) return [];
  return Array.isArray(actor.items) ? actor.items : Array.from(actor.items.values());
}

function getItemId(item) {
  return item?.id || item?._id || null;
}

/**
 * Strips level/rank/class suffixes when matching a fixed ability name to an actor item.
 */
export function matchAbilityItem(items, abilityName, className = "") {
  const targetFull = normalizeProgressKey(abilityName);
  const targetBase = normalizeProgressKey(String(abilityName || "").replace(/\s*\([^)]+\)\s*$/g, ""));
  const classNorm = normalizeProgressKey(className);

  for (const item of items) {
    if (!item || (item.type !== "poder" && item.type !== "habilidade")) continue;
    const itemNorm = normalizeProgressKey(item.name);
    if (itemNorm === targetFull) return item;
    if (classNorm && itemNorm === normalizeProgressKey(`${targetBase} ${classNorm}`)) return item;
    if (itemNorm === targetBase) {
      const sub = normalizeProgressKey(item.system?.subtipo || "");
      if (!sub || !classNorm || sub === classNorm || sub === "geral") return item;
    }
  }
  return null;
}

/**
 * Counts extra spells granted by class/general powers such as Conhecimento Mágico.
 */
export function countBonusSpellsFromPowers(items) {
  let total = 0;
  const sources = [];
  for (const item of items) {
    if (item?.type !== "poder") continue;
    const norm = normalizeProgressKey(item.name);
    for (const rule of BONUS_SPELL_POWERS) {
      if (rule.pattern.test(norm)) {
        total += rule.spellsPerRank;
        sources.push(item.name);
        break;
      }
    }
  }
  return { total, sources };
}

/**
 * Builds the deterministic progression snapshot for an actor sheet & wizard.
 * Safe to execute synchronously during `getData()`.
 */
export function computeActorProgression(actor) {
  const items = getDocItems(actor);
  const classes = items.filter((i) => i.type === "classe");
  const powers = items.filter((i) => i.type === "poder");
  const spells = items.filter((i) => i.type === "magia");
  const actorFlags = actor?.flags?.[MODULE_ID] || {};

  const slotsByClass = [];
  const allSlots = [];
  const assignedPowerIds = new Set();
  const casters = [];
  const fixedAbilityMap = new Map();

  for (const cls of classes) {
    const rule = getClassProgressionRule(cls.name);
    const clsId = getItemId(cls);
    const level = Math.max(1, Math.min(20, Number(cls.system?.niveis ?? 1)));
    if (!rule) continue;

    const classSlots = [];
    for (let lvl = 1; lvl <= level; lvl += 1) {
      const entry = rule.levels[lvl];
      if (!entry) continue;

      for (const fixedName of entry.fixed) {
        const baseKey = normalizeProgressKey(fixedName.replace(/\s*\([^)]+\)\s*$/g, ""));
        const spec = rule.scalingSpecs?.[baseKey];
        const evalRes = spec ? spec.evaluate(level) : null;
        const ownedItem = matchAbilityItem(powers, fixedName, rule.name);
        fixedAbilityMap.set(`${rule.key}:${baseKey}`, {
          name: fixedName,
          classKey: rule.key,
          className: rule.name,
          unlockLevel: lvl,
          owned: Boolean(ownedItem),
          itemId: getItemId(ownedItem),
          scaledDisplay: evalRes?.display || null,
          needsSync:
            !ownedItem ||
            (evalRes && String(ownedItem.flags?.[MODULE_ID]?.scaledDisplay || "") !== String(evalRes.display))
        });
      }

      if (!entry.slot) continue;
      const slotId = buildSlotId(rule.key, lvl);
      const matched = powers.find((p) => {
        const pId = getItemId(p);
        if (assignedPowerIds.has(pId)) return false;
        const f = p.flags?.[MODULE_ID];
        return f?.slotId === slotId;
      });
      if (matched) assignedPowerIds.add(getItemId(matched));

      const slotObj = {
        slotId,
        classItemId: clsId,
        className: cls.name,
        classKey: rule.key,
        powerSubtype: rule.powerSubtype,
        level: lvl,
        tier: getTierForLevel(lvl),
        label: entry.slotLabel,
        filled: Boolean(matched),
        powerItem: matched
          ? {
              id: getItemId(matched),
              name: matched.name,
              img: matched.img || "icons/svg/book.svg",
              subtipo: matched.system?.subtipo || "",
              chosenAttribute: matched.flags?.[MODULE_ID]?.chosenAttribute || null
            }
          : null
      };
      classSlots.push(slotObj);
      allSlots.push(slotObj);
    }

    slotsByClass.push({
      classItemId: clsId,
      className: cls.name,
      classKey: rule.key,
      powerSubtype: rule.powerSubtype,
      level,
      slots: classSlots,
      filledCount: classSlots.filter((s) => s.filled).length,
      emptyCount: classSlots.filter((s) => !s.filled).length
    });

    if (rule.caster) {
      const bonusInfo = countBonusSpellsFromPowers(powers);
      const casterInfo = evaluateCasterProgression(rule.caster, level, {
        pathKey: rule.caster.hasPaths ? (actorFlags.arcanistaPath || null) : null,
        bonusSpells: bonusInfo.total
      });
      const traditionSpells = spells.filter((s) => {
        const st = normalizeProgressKey(s.system?.tipo || "");
        return !st || st === casterInfo.tradicao || st === "uni";
      });
      const knownCount = spells.length === 0 ? 0 : traditionSpells.length;
      const byCircle = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const s of traditionSpells) {
        const c = Math.max(1, Math.min(5, Number(s.system?.circulo || 1)));
        byCircle[c] += 1;
      }

      casters.push({
        classKey: rule.key,
        className: rule.name,
        classLevel: level,
        ...casterInfo,
        bonusSources: bonusInfo.sources,
        knownCount,
        byCircle,
        remainingQuota: Math.max(0, casterInfo.totalQuota - knownCount),
        overQuota: knownCount > casterInfo.totalQuota,
        needsArcanistaPath: Boolean(rule.caster.hasPaths && !actorFlags.arcanistaPath)
      });
    }
  }

  // Unslotted class/general powers manually dragged or imported prior to slots
  const fixedAbilityNames = new Set(Array.from(fixedAbilityMap.values()).map((a) => normalizeProgressKey(a.name.replace(/\s*\([^)]+\)\s*$/g, ""))));
  const unslottedPowers = powers.filter((p) => {
    const id = getItemId(p);
    if (assignedPowerIds.has(id)) return false;
    if (p.flags?.[MODULE_ID]?.autoProgression) return false;
    const tipo = normalizeProgressKey(p.system?.tipo || "");
    if (tipo === "ability" || tipo === "origem" || tipo === "concedido" || tipo === "raca") return false;
    const pNorm = normalizeProgressKey(p.name.replace(/\s*\([^)]+\)\s*$/g, ""));
    if (fixedAbilityNames.has(pNorm)) return false;
    return tipo === "classe" || tipo === "geral" || tipo === "combate" || tipo === "destino" || tipo === "magia" || tipo === "tormenta";
  });

  const fixedAbilities = Array.from(fixedAbilityMap.values());
  const missingSyncCount = fixedAbilities.filter((f) => f.needsSync).length;

  return {
    classesCount: classes.length,
    totalSlots: allSlots.length,
    filledSlots: allSlots.filter((s) => s.filled).length,
    emptySlots: allSlots.filter((s) => !s.filled).length,
    allSlots,
    slotsByClass,
    unslottedPowers: unslottedPowers.map((p) => ({
      id: getItemId(p),
      name: p.name,
      subtipo: p.system?.subtipo || p.system?.tipo || ""
    })),
    fixedAbilities,
    missingSyncCount,
    casters,
    hasCasters: casters.length > 0,
    arcanistaPath: actorFlags.arcanistaPath || null
  };
}

/**
 * Updates or inserts a clean `<p class="t20-prog-badge">` banner in an item description.
 */
export function applyProgressionBadgeToHtml(html, classKey, displayText) {
  const cleanHtml = String(html || "");
  const stripped = cleanHtml.replace(/<p[^>]*class=["'][^"']*t20-prog-badge[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, "").trim();
  if (!displayText) return stripped;
  const badge = `<p class="t20-prog-badge" data-t20-prog-badge="${classKey}"><strong>Escalonamento Automático:</strong> <span>${displayText}</span></p>`;
  return `${badge}${stripped ? `\n${stripped}` : ""}`;
}

function cloneObj(val) {
  return JSON.parse(JSON.stringify(val));
}

/**
 * Computes item/effect updates required to scale an ability to `targetLevel`.
 */
export function buildScalingUpdatesForItem(item, rule, baseNorm, targetLevel) {
  const spec = rule?.scalingSpecs?.[baseNorm];
  if (!spec) return null;

  const evalRes = spec.evaluate(targetLevel);
  const nextDesc = applyProgressionBadgeToHtml(
    item.system?.description?.value ?? item.system?.descricao?.value ?? "",
    rule.key,
    evalRes.display
  );

  const itemUpdate = {
    _id: getItemId(item),
    [`flags.${MODULE_ID}.scaledRank`]: evalRes.rank,
    [`flags.${MODULE_ID}.scaledDisplay`]: evalRes.display,
    [`flags.${MODULE_ID}.scaledAtLevel`]: targetLevel
  };

  if (item.system?.description !== undefined) {
    itemUpdate["system.description.value"] = nextDesc;
  } else {
    itemUpdate["system.descricao.value"] = nextDesc;
  }

  if (spec.rollFormula && Array.isArray(item.system?.rolls) && item.system.rolls.length > 0) {
    const rollsCopy = cloneObj(item.system.rolls);
    if (Array.isArray(rollsCopy[0]?.parts) && Array.isArray(rollsCopy[0].parts[0])) {
      rollsCopy[0].parts[0][0] = spec.rollFormula(evalRes);
      itemUpdate["system.rolls"] = rollsCopy;
    }
  }

  const effectUpdates = [];
  if (spec.effectUpdates) {
    const fxInstruction = spec.effectUpdates(evalRes);
    if (fxInstruction?.keys) {
      const effects = Array.isArray(item.effects) ? item.effects : Array.from(item.effects?.values?.() || []);
      for (const fx of effects) {
        const isOnuse = Boolean(fx.system?.onuse ?? fx.flags?.tormenta20?.onuse);
        if (fxInstruction.matchNonOnuse && isOnuse) continue;
        if (fxInstruction.matchOnuse && !isOnuse) continue;
        const changes = cloneObj(fx.system?.changes || fx.changes || []);
        let dirty = false;
        for (const ch of changes) {
          if (Object.prototype.hasOwnProperty.call(fxInstruction.keys, ch.key)) {
            const nextVal = fxInstruction.keys[ch.key];
            if (ch.value !== nextVal) {
              ch.value = nextVal;
              dirty = true;
            }
          }
        }
        if (dirty) {
          const patch = { _id: getItemId(fx) };
          if (fx.system?.changes !== undefined) patch["system.changes"] = changes;
          else patch.changes = changes;
          effectUpdates.push(patch);
        }
      }
    }
  }

  return { evalRes, itemUpdate, effectUpdates };
}

/**
 * Default Foundry compendium resolver for fixed class abilities + fallback synthesis.
 */
export async function defaultAbilityResolver(abilityName, classRule, unlockLevel) {
  const pack = game.packs?.get(`${MODULE_ID}.poderes`) || game.packs?.get("tormenta20.poderes");
  if (pack) {
    const idx = await pack.getIndex({ fields: ["name", "system.tipo", "system.subtipo"] });
    const exactClass = normalizeProgressKey(`${abilityName} ${classRule.name}`);
    const baseTarget = normalizeProgressKey(abilityName.replace(/\s*\([^)]+\)\s*$/g, ""));

    const entry =
      idx.find((e) => normalizeProgressKey(e.name) === normalizeProgressKey(abilityName)) ||
      idx.find((e) => normalizeProgressKey(e.name) === exactClass) ||
      idx.find(
        (e) =>
          normalizeProgressKey(e.name) === baseTarget &&
          (!e.system?.subtipo || normalizeProgressKey(e.system.subtipo) === classRule.key)
      ) ||
      idx.find((e) => normalizeProgressKey(e.name) === baseTarget);

    if (entry) {
      const doc = await pack.getDocument(entry._id);
      if (doc) return doc.toObject();
    }
  }

  // Fallback synthesized embedded power for the few class features absent from base packs
  return {
    name: abilityName,
    type: "poder",
    img: "icons/svg/aura.svg",
    system: {
      tipo: "ability",
      subtipo: classRule.powerSubtype,
      description: {
        value: `<p>Habilidade de classe (${classRule.name}, ${unlockLevel}º nível) concedida automaticamente pela progressão.</p>`
      }
    }
  };
}

/**
 * Returns a map from normalized base ability name -> minimum unlock level for a class.
 */
function getFixedUnlockLevels(rule) {
  const unlockMap = new Map();
  for (let lvl = 1; lvl <= 20; lvl += 1) {
    const entry = rule.levels[lvl];
    if (!entry) continue;
    for (const fixedName of entry.fixed) {
      const base = normalizeProgressKey(fixedName.replace(/\s*\([^)]+\)\s*$/g, ""));
      if (!unlockMap.has(base)) {
        unlockMap.set(base, { name: fixedName, unlockLevel: lvl });
      }
    }
  }
  return unlockMap;
}

/**
 * Checks whether another remaining class on the actor ALSO grants the same ability at valid level.
 */
function isGrantedByOtherClass(actorItems, ignoreClassId, baseNorm) {
  for (const other of actorItems) {
    if (other.type !== "classe" || getItemId(other) === ignoreClassId) continue;
    const otherRule = getClassProgressionRule(other.name);
    if (!otherRule) continue;
    const otherLvl = Number(other.system?.niveis ?? 1);
    const unlockMap = getFixedUnlockLevels(otherRule);
    const info = unlockMap.get(baseNorm);
    if (info && info.unlockLevel <= otherLvl) return true;
  }
  return false;
}

/**
 * Applies `Caminho do Arcanista` choice to actor flags, casting attribute, and `Magias (Arcanista)`.
 */
export async function applyArcanistaPathToActor(actor, pathKey) {
  const validKeys = ["bruxo", "mago", "feiticeiro"];
  if (!validKeys.includes(pathKey)) return null;
  const attr = pathKey === "feiticeiro" ? "car" : "int";
  const label = pathKey === "bruxo" ? "Bruxo" : pathKey === "mago" ? "Mago" : "Feiticeiro";

  await actor.setFlag(MODULE_ID, "arcanistaPath", pathKey);
  await actor.update({ "system.attributes.conjuracao": attr });

  const items = getDocItems(actor);
  const magiasItem = items.find((i) => i.type === "poder" && normalizeProgressKey(i.name).startsWith("magias arcanista")) ||
    items.find((i) => i.type === "poder" && normalizeProgressKey(i.name) === "magias" && normalizeProgressKey(i.system?.subtipo) === "arcanista");

  if (magiasItem && typeof magiasItem.update === "function") {
    const desc = applyProgressionBadgeToHtml(
      magiasItem.system?.description?.value ?? magiasItem.system?.descricao?.value ?? "",
      "arcanista-path",
      `Caminho: ${label} (Atributo-chave: ${attr.toUpperCase()})`
    );
    await magiasItem.update({
      ...(magiasItem.system?.description !== undefined
        ? { "system.description.value": desc }
        : { "system.descricao.value": desc })
    });

    const effects = Array.isArray(magiasItem.effects) ? magiasItem.effects : Array.from(magiasItem.effects?.values?.() || []);
    const pmFx = effects.find((fx) =>
      (fx.system?.changes || fx.changes || []).some((c) => String(c.key).startsWith("system.attributes.pm.atributos."))
    );
    const desiredChanges = [
      { key: `system.attributes.pm.atributos.${attr}`, value: true, priority: null, type: "override", phase: "initial" }
    ];
    if (pmFx && typeof magiasItem.updateEmbeddedDocuments === "function") {
      await magiasItem.updateEmbeddedDocuments("ActiveEffect", [
        { _id: getItemId(pmFx), "system.changes": desiredChanges }
      ]);
    } else if (!pmFx && typeof magiasItem.createEmbeddedDocuments === "function") {
      await magiasItem.createEmbeddedDocuments("ActiveEffect", [
        {
          name: `Magias (Arcanista — ${label})`,
          img: magiasItem.img || "icons/svg/book.svg",
          transfer: true,
          disabled: false,
          system: { changes: desiredChanges, onuse: false }
        }
      ]);
    }
  }

  return { pathKey, label, attr };
}

/**
 * Applies `+1` attribute bonus to `Aumento de Atributo` embedded item and updates its badge & flags.
 */
export async function applyAttributeIncreaseToItem(item, attrKey, slotLevel = 1) {
  const ATTR_LABELS = {
    for: "Força",
    des: "Destreza",
    con: "Constituição",
    int: "Inteligência",
    sab: "Sabedoria",
    car: "Carisma"
  };
  if (!item || !ATTR_LABELS[attrKey]) return null;
  const label = ATTR_LABELS[attrKey];
  const tier = getTierForLevel(slotLevel);

  const patch = {
    name: `Aumento de Atributo (${label})`,
    [`flags.${MODULE_ID}.chosenAttribute`]: attrKey,
    [`flags.${MODULE_ID}.chosenTier`]: tier.key,
    [`flags.${MODULE_ID}.slotLevel`]: Number(slotLevel) || 1
  };
  const desc = applyProgressionBadgeToHtml(
    item.system?.description?.value ?? item.system?.descricao?.value ?? "",
    "atributo",
    `+1 ${label} (${tier.label})`
  );
  if (item.system?.description !== undefined) patch["system.description.value"] = desc;
  else patch["system.descricao.value"] = desc;

  await item.update(patch);

  const effects = Array.isArray(item.effects) ? item.effects : Array.from(item.effects?.values?.() || []);
  const attrFx = effects.find((fx) =>
    (fx.system?.changes || fx.changes || []).some((c) => /^system\.atributos\.[a-z]{3}\.value$/.test(c.key))
  );
  const changes = [{ key: `system.atributos.${attrKey}.value`, value: 1, priority: null, type: "add", phase: "initial" }];
  if (attrFx && typeof item.updateEmbeddedDocuments === "function") {
    await item.updateEmbeddedDocuments("ActiveEffect", [{ _id: getItemId(attrFx), name: `Aumento de Atributo - ${label}`, "system.changes": changes }]);
  } else if (!attrFx && typeof item.createEmbeddedDocuments === "function") {
    await item.createEmbeddedDocuments("ActiveEffect", [
      {
        name: `Aumento de Atributo - ${label}`,
        img: item.img || "icons/svg/upgrade.svg",
        transfer: true,
        disabled: false,
        system: { changes, onuse: false }
      }
    ]);
  }
  return { attrKey, label, tier };
}

/**
 * Full level progression sync:
 * - Removes fixed features > toLevel & slotted powers > toLevel on downgrade
 * - Imports missing fixed features <= toLevel
 * - Scales progressive rolls, ActiveEffects, and rank badges to `toLevel`
 */
export async function syncClassLevelProgression(
  actor,
  classItem,
  fromLevel,
  toLevel,
  { resolver = defaultAbilityResolver, linkExistingSlots = false } = {}
) {
  const rule = getClassProgressionRule(classItem?.name);
  if (!actor || !classItem || !rule) return null;

  const fromLvl = Math.max(0, Math.min(20, Number(fromLevel) || 0));
  const toLvl = Math.max(1, Math.min(20, Number(toLevel) || 1));
  const classItemId = getItemId(classItem);
  const unlockMap = getFixedUnlockLevels(rule);

  const removedItems = [];
  const addedAbilities = [];
  const scaledAbilities = [];
  const openedSlots = [];

  // Step 1: Downgrade cleanup (remove fixed features & slotted items above `toLvl`)
  if (toLvl < fromLvl) {
    const actorItems = getDocItems(actor);
    const deleteIds = new Set();

    for (const item of actorItems) {
      if (item.type !== "poder" && item.type !== "habilidade") continue;
      const itemId = getItemId(item);
      const flags = item.flags?.[MODULE_ID] || {};

      // Check slotted class/general power above `toLvl`
      if (flags.slotId && flags.slotId.startsWith(`${rule.key}:L`)) {
        const sLvl = Number(flags.slotLevel || flags.slotId.split(":L")[1] || 0);
        if (sLvl > toLvl) {
          deleteIds.add(itemId);
          removedItems.push({ id: itemId, name: item.name, reason: `Espaço Nv ${sLvl}` });
          continue;
        }
      }

      // Check fixed class feature unlocked above `toLvl`
      const itemNorm = normalizeProgressKey(item.name.replace(/\s*\([^)]+\)\s*$/g, ""));
      const fixedInfo = unlockMap.get(itemNorm);
      if (fixedInfo && fixedInfo.unlockLevel > toLvl) {
        const subNorm = normalizeProgressKey(item.system?.subtipo || "");
        const ownedByClass =
          flags.classItemId === classItemId ||
          flags.classKey === rule.key ||
          !subNorm ||
          subNorm === rule.key;
        if (ownedByClass && !isGrantedByOtherClass(actorItems, classItemId, itemNorm)) {
          deleteIds.add(itemId);
          removedItems.push({ id: itemId, name: item.name, reason: `Habilidade Nv ${fixedInfo.unlockLevel}` });
        }
      }
    }

    if (deleteIds.size > 0) {
      await actor.deleteEmbeddedDocuments("Item", Array.from(deleteIds));
    }
  }

  // Step 2: Optionally pair existing unassigned class/general powers during manual sync
  if (linkExistingSlots) {
    const currentItems = getDocItems(actor);
    const powers = currentItems.filter((i) => i.type === "poder");
    const fixedNames = new Set(Array.from(unlockMap.keys()));
    const takenSlots = new Set(powers.map((p) => p.flags?.[MODULE_ID]?.slotId).filter(Boolean));
    const emptySlotLvls = [];
    for (let lvl = 1; lvl <= toLvl; lvl += 1) {
      if (rule.levels[lvl]?.slot && !takenSlots.has(buildSlotId(rule.key, lvl))) {
        emptySlotLvls.push(lvl);
      }
    }
    const candidates = powers.filter((p) => {
      const f = p.flags?.[MODULE_ID];
      if (f?.slotId || f?.autoProgression) return false;
      const tipo = normalizeProgressKey(p.system?.tipo || "");
      const sub = normalizeProgressKey(p.system?.subtipo || "");
      const base = normalizeProgressKey(p.name.replace(/\s*\([^)]+\)\s*$/g, ""));
      if (fixedNames.has(base)) return false;
      return tipo === "classe" && (sub === rule.key || sub === "geral");
    });

    const linkPatches = [];
    for (let i = 0; i < Math.min(emptySlotLvls.length, candidates.length); i += 1) {
      const lvl = emptySlotLvls[i];
      linkPatches.push({
        _id: getItemId(candidates[i]),
        [`flags.${MODULE_ID}.slotId`]: buildSlotId(rule.key, lvl),
        [`flags.${MODULE_ID}.slotLevel`]: lvl,
        [`flags.${MODULE_ID}.classKey`]: rule.key,
        [`flags.${MODULE_ID}.classItemId`]: classItemId
      });
    }
    if (linkPatches.length > 0) {
      await actor.updateEmbeddedDocuments("Item", linkPatches);
    }
  }

  // Step 3: Import missing fixed abilities unlocked at `<= toLvl`
  const itemsBeforeImport = getDocItems(actor);
  const toCreate = [];
  for (const [baseNorm, info] of unlockMap.entries()) {
    if (info.unlockLevel > toLvl) continue;
    const existing = matchAbilityItem(itemsBeforeImport, info.name, rule.name);
    if (existing) continue;

    const rawItem = await resolver(info.name, rule, info.unlockLevel);
    if (!rawItem) continue;
    rawItem.flags = rawItem.flags || {};
    rawItem.flags[MODULE_ID] = {
      ...(rawItem.flags[MODULE_ID] || {}),
      autoProgression: true,
      classKey: rule.key,
      classItemId,
      sourceLevel: info.unlockLevel
    };

    const scalingEval = buildScalingUpdatesForItem({ ...rawItem, _id: "tmp" }, rule, baseNorm, toLvl);
    if (scalingEval) {
      rawItem.flags[MODULE_ID].scaledRank = scalingEval.evalRes.rank;
      rawItem.flags[MODULE_ID].scaledDisplay = scalingEval.evalRes.display;
      rawItem.flags[MODULE_ID].scaledAtLevel = toLvl;
      if (rawItem.system?.description) rawItem.system.description.value = applyProgressionBadgeToHtml(rawItem.system.description.value, rule.key, scalingEval.evalRes.display);
      else if (rawItem.system?.descricao) rawItem.system.descricao.value = applyProgressionBadgeToHtml(rawItem.system.descricao.value, rule.key, scalingEval.evalRes.display);
      if (scalingEval.itemUpdate["system.rolls"]) {
        rawItem.system.rolls = scalingEval.itemUpdate["system.rolls"];
      }
      if (scalingEval.effectUpdates.length > 0 && Array.isArray(rawItem.effects)) {
        for (const fxPatch of scalingEval.effectUpdates) {
          const targetFx = rawItem.effects.find((f) => getItemId(f) === fxPatch._id);
          if (targetFx && fxPatch["system.changes"]) {
            targetFx.system = targetFx.system || {};
            targetFx.system.changes = fxPatch["system.changes"];
          }
        }
      }
    }

    toCreate.push(rawItem);
    addedAbilities.push({ name: rawItem.name, level: info.unlockLevel, display: scalingEval?.evalRes?.display || null });
  }

  if (toCreate.length > 0) {
    await actor.createEmbeddedDocuments("Item", toCreate);
  }

  // Step 4: Scale all existing scaling items on the actor to `toLvl`
  const currentItems = getDocItems(actor);
  const itemPatches = [];
  for (const [baseNorm, info] of unlockMap.entries()) {
    if (info.unlockLevel > toLvl) continue;
    if (!rule.scalingSpecs?.[baseNorm]) continue;
    const item = matchAbilityItem(currentItems, info.name, rule.name);
    if (!item) continue;

    const alreadyRank = item.flags?.[MODULE_ID]?.scaledDisplay;
    const evalCheck = rule.scalingSpecs[baseNorm].evaluate(toLvl);
    if (alreadyRank === evalCheck.display && toLvl <= fromLvl && item.flags?.[MODULE_ID]?.scaledAtLevel === toLvl) {
      continue;
    }

    const res = buildScalingUpdatesForItem(item, rule, baseNorm, toLvl);
    if (!res) continue;
    itemPatches.push(res.itemUpdate);
    if (res.effectUpdates.length > 0 && typeof item.updateEmbeddedDocuments === "function") {
      await item.updateEmbeddedDocuments("ActiveEffect", res.effectUpdates);
    }
    if (alreadyRank !== res.evalRes.display) {
      scaledAbilities.push({ name: item.name, display: res.evalRes.display });
    }
  }

  if (itemPatches.length > 0) {
    await actor.updateEmbeddedDocuments("Item", itemPatches);
  }

  // Step 5: Report newly opened slots in `(fromLvl, toLvl]`
  if (toLvl > fromLvl) {
    for (let lvl = fromLvl + 1; lvl <= toLvl; lvl += 1) {
      const entry = rule.levels[lvl];
      if (entry?.slot) {
        openedSlots.push({
          slotId: buildSlotId(rule.key, lvl),
          level: lvl,
          label: entry.slotLabel,
          powerSubtype: rule.powerSubtype
        });
      }
    }
  }

  let casterSummary = null;
  if (rule.caster) {
    const bonusInfo = countBonusSpellsFromPowers(getDocItems(actor));
    const prevCaster = fromLvl > 0 ? evaluateCasterProgression(rule.caster, fromLvl, { pathKey: actor.flags?.[MODULE_ID]?.arcanistaPath, bonusSpells: bonusInfo.total }) : null;
    const nextCaster = evaluateCasterProgression(rule.caster, toLvl, { pathKey: actor.flags?.[MODULE_ID]?.arcanistaPath, bonusSpells: bonusInfo.total });
    casterSummary = {
      ...nextCaster,
      circleJustUnlocked: nextCaster.unlockedCircle > (prevCaster?.unlockedCircle || 0) ? nextCaster.unlockedCircle : null
    };
  }

  return {
    className: classItem.name,
    classKey: rule.key,
    fromLevel: fromLvl,
    toLevel: toLvl,
    addedAbilities,
    removedItems,
    scaledAbilities,
    openedSlots,
    casterSummary
  };
}

