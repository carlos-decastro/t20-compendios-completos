/**
 * Foundry document loader & atomic commit builder for the Character Creation Wizard.
 */

import {
  CRAFT_KEYS,
  SKILL_LABELS_PT,
  normalizeText,
  parseClassSkills,
  parseProficienciesText,
  resolveSkillToken
} from "../automation/skill-parser.js";
import { MODULE_ID, getClassProgressionRule, normalizeProgressKey } from "../data/class-progression-rules.js";
import { applyArcanistaPathToActor, syncClassLevelProgression } from "../automation/progression-slots.js";
import {
  ATTR_ORDER,
  CLASS_STARTER_KITS,
  collectTrainedSkills,
  computeEquipmentBudget,
  detectDynamicRaceSpec,
  resolveBaseAttributes,
  resolveRacialAttributes,
  resolveWizardCasterSpec,
  validateWizardStep
} from "./wizard-state.js";

function skillLabel(key) {
  const cfg = globalThis.CONFIG?.T20?.pericias?.[key];
  if (cfg?.label && globalThis.game?.i18n) return game.i18n.localize(cfg.label);
  return SKILL_LABELS_PT[key] || key.toUpperCase();
}

/**
 * Loads full Race document metadata including resolved `grants` choice docs.
 */
export async function loadRaceDetails(uuid) {
  const doc = await fromUuid(uuid).catch(() => null);
  if (!doc) return null;
  const obj = doc.toObject();
  const fixedAttrs = {};
  for (const k of ATTR_ORDER) {
    fixedAttrs[k] = Number(obj.system?.atributos?.[k] ?? 0);
  }
  const dynamic = detectDynamicRaceSpec(obj);

  const grants = [];
  for (const grant of obj.system?.grants || []) {
    const rawChoices = Array.isArray(grant.choices) ? grant.choices : [];
    const docs = await Promise.all(rawChoices.map((c) => fromUuid(c.uuid).catch(() => null)));
    const choices = rawChoices
      .map((c, idx) => {
        const choiceDoc = docs[idx];
        return {
          uuid: c.uuid,
          name: choiceDoc?.name || c.name || "Opção",
          img: choiceDoc?.img || "icons/svg/item-bag.svg",
          type: choiceDoc?.type || "poder",
          desc: choiceDoc?.system?.description?.value || ""
        };
      })
      .filter((c) => c.uuid);

    grants.push({
      title: grant.title || "Habilidade Racial",
      desc: grant.desc || "",
      type: grant.type || "auto",
      choices
    });
  }

  return {
    uuid: doc.uuid,
    name: doc.name,
    img: doc.img || "icons/svg/mystery-man.svg",
    description: obj.system?.description?.value || "",
    fixedAttrs,
    dynamic,
    grants
  };
}

/**
 * Loads full Origin JournalEntry metadata (`origemData`).
 */
export async function loadOriginDetails(uuid) {
  const doc = await fromUuid(uuid).catch(() => null);
  if (!doc) return null;
  const data = doc.flags?.[MODULE_ID]?.origemData || {};
  const skillOptions = [];
  const seenSkills = new Set();

  for (const rawSkill of data.pericias || []) {
    const key = resolveSkillToken(rawSkill);
    if (key === "oficio") {
      for (const ck of CRAFT_KEYS) {
        if (!seenSkills.has(ck)) {
          seenSkills.add(ck);
          skillOptions.push({ key: ck, label: skillLabel(ck) });
        }
      }
    } else if (key && !seenSkills.has(key)) {
      seenSkills.add(key);
      skillOptions.push({ key, label: skillLabel(key) });
    }
  }

  return {
    uuid: doc.uuid,
    name: doc.name,
    img: "icons/sundries/documents/document-sealed-red-tan.webp",
    beneficiosTexto: data.beneficiosTexto || "",
    itensIniciaisTexto: data.itensIniciais || "—",
    skillOptions,
    poderChoices: Array.isArray(data.poderChoices) ? data.poderChoices : [],
    itemMatches: Array.isArray(data.itemMatches) ? data.itemMatches : []
  };
}

/**
 * Loads full Class item metadata (`parsedSkills`, proficiencies, caster progression).
 */
export async function loadClassDetails(uuid) {
  const doc = await fromUuid(uuid).catch(() => null);
  if (!doc) return null;
  const obj = doc.toObject();
  const modClassData = doc.flags?.[MODULE_ID]?.classData || {};
  const { profArmas, profArmaduras } = modClassData.profArmas
    ? modClassData
    : parseProficienciesText(modClassData.proficienciasTexto || obj.system?.description?.value || "");

  const parsedSkills = parseClassSkills(
    obj.system?.pericias?.inatas,
    obj.system?.pericias?.numero
  );

  const rule = getClassProgressionRule(doc.name);
  return {
    uuid: doc.uuid,
    name: doc.name,
    img: doc.img || "icons/svg/sword.svg",
    description: obj.system?.description?.value || "",
    pvPorNivel: Number(obj.system?.pvPorNivel ?? 0),
    pmPorNivel: Number(obj.system?.pmPorNivel ?? 0),
    profArmas: profArmas || ["simples"],
    profArmaduras: profArmaduras || [],
    parsedSkills,
    caster: rule?.caster || null
  };
}

/**
 * Loads full Deity JournalEntry metadata (`divindadeData`) and its granted powers.
 */
export async function loadDeityDetails(uuid) {
  const doc = await fromUuid(uuid).catch(() => null);
  if (!doc) return null;
  const data = doc.flags?.[MODULE_ID]?.divindadeData || {};
  const powerEntries = await Promise.all(
    (data.poderesConcedidos || []).map(async (gp) => {
      const pDoc = gp.uuid ? await fromUuid(gp.uuid).catch(() => null) : null;
      return pDoc
        ? {
            uuid: gp.uuid,
            name: pDoc.name || gp.name,
            img: pDoc.img || "icons/svg/sun.svg",
            desc: pDoc.system?.description?.value || ""
          }
        : null;
    })
  );

  return {
    uuid: doc.uuid,
    name: doc.name,
    img: "icons/magic/holy/chalice-glowing-gold.webp",
    devotos: data.devotos || "",
    armaPreferida: data.armaPreferida || "",
    canalizar: data.canalizar || "",
    obrigacoes: data.obrigacoes || "",
    poderesConcedidos: powerEntries.filter(Boolean)
  };
}

/**
 * Resolves the suggested Starter Kit items for a class against indexed equipment entries.
 */
export function resolveStarterKitFromCatalog(className, equipmentEntries = []) {
  const clsKey = normalizeProgressKey(className);
  const desiredNames = CLASS_STARTER_KITS[clsKey] || ["Adaga", "Mochila", "Corda"];
  const byNorm = new Map();
  for (const eq of equipmentEntries) {
    const k = normalizeText(eq.name);
    if (!byNorm.has(k)) byNorm.set(k, eq);
  }

  const matched = [];
  for (const target of desiredNames) {
    const k = normalizeText(target);
    const exact = byNorm.get(k);
    if (exact) {
      matched.push({
        uuid: exact.uuid,
        name: exact.name,
        img: exact.img,
        type: exact.itemType,
        priceTp: Number(exact.system?.preco || 0)
      });
      continue;
    }
    const baseName = normalizeText(target.replace(/\s*\([^)]*\)\s*/g, ""));
    const loose = equipmentEntries.find((e) => normalizeText(e.name) === baseName || normalizeText(e.name).startsWith(baseName));
    if (loose) {
      matched.push({
        uuid: loose.uuid,
        name: loose.name,
        img: loose.img,
        type: loose.itemType,
        priceTp: Number(loose.system?.preco || 0)
      });
    }
  }
  return matched;
}

/**
 * Atomically creates (or populates) the finished Level-1 Actor from a validated WizardDraft
 * with zero blocking system popups.
 */
export async function commitCharacterWizard(draft, { existingActor = null } = {}) {
  const validation = validateWizardStep(draft, 8);
  if (!validation.valid) {
    throw new Error(validation.errors[0] || "Ainda existem pendências obrigatórias na criação.");
  }

  const baseAttrs = resolveBaseAttributes(draft);
  const racialAttrs = resolveRacialAttributes(draft);
  const trainedSkills = collectTrainedSkills(draft, { upToStep: 8 });
  const caster = resolveWizardCasterSpec(draft);
  const budget = computeEquipmentBudget(draft);

  const actorDataPayload = {
    name: draft.identity.name.trim(),
    img: draft.identity.img || "icons/svg/mystery-man.svg",
    prototypeToken: {
      name: draft.identity.name.trim(),
      texture: { src: draft.identity.img || "icons/svg/mystery-man.svg" }
    }
  };

  let actor = existingActor;
  if (!actor) {
    actor = await Actor.create({
      ...actorDataPayload,
      type: "character"
    });
  } else {
    await actor.update(actorDataPayload);
    // Clean any partial race/class on an empty target actor if re-running wizard cleanly
    const staleIds = [...(actor.itemTypes.race || []), ...(actor.itemTypes.classe || [])].map((i) => i.id);
    if (staleIds.length) {
      await actor.deleteEmbeddedDocuments("Item", staleIds);
    }
  }

  if (!actor) {
    throw new Error("Não foi possível criar ou atualizar a ficha do personagem.");
  }

  // 1. Set base/racial attributes, skills, proficiencies, origin/deity metadata, currency & auto-calc flag
  const actorUpdate = {
    "system.detalhes.origem": draft.origin.name || "",
    "system.detalhes.divindade": draft.deity?.uuid ? draft.deity.name : "",
    "system.tracos.profArmas.value": [...new Set(draft.class.profArmas || ["simples"])],
    "system.tracos.profArmaduras.value": [...new Set(draft.class.profArmaduras || [])],
    "system.dinheiro.tp": Math.max(0, Math.floor(budget.remainingGold)),
    "flags.tormenta20.lvlconfig": { manual: false },
    [`flags.${MODULE_ID}.origemUuid`]: draft.origin.uuid || null,
    [`flags.${MODULE_ID}.divindadeUuid`]: draft.deity?.uuid || null,
    [`flags.${MODULE_ID}.wizardCreated`]: true
  };

  if (draft.identity.notes?.trim()) {
    actorUpdate["system.detalhes.biography.value"] = `<p>${draft.identity.notes.trim().replace(/\n/g, "</p><p>")}</p>`;
  }

  for (const key of ATTR_ORDER) {
    actorUpdate[`system.atributos.${key}.base`] = Number(baseAttrs[key] ?? 0);
    actorUpdate[`system.atributos.${key}.racial`] = Number(racialAttrs[key] ?? 0);
  }

  for (const skKey of trainedSkills.keys()) {
    if (actor.system?.pericias?.[skKey] !== undefined) {
      actorUpdate[`system.pericias.${skKey}.treinado`] = true;
    }
  }

  if (caster?.keyAttr) {
    actorUpdate["system.attributes.conjuracao"] = caster.keyAttr;
  }

  await actor.update(actorUpdate);

  // 2. Embed Race cleanly while bypassing T20's blocking `_onCreateOwnedRace` dynamic-attributes popup
  const raceDoc = await fromUuid(draft.race.uuid).catch(() => null);
  const raceGrantItems = [];
  if (raceDoc) {
    const raceObj = raceDoc.toObject();
    const grants = draft.race.grants || [];

    for (const [idx, grant] of grants.entries()) {
      if (grant.type === "single" && grant.choices?.length > 1) {
        const pickedUuid = draft.race.grantChoices?.[idx]?.chosenUuid;
        if (pickedUuid) {
          const gDoc = await fromUuid(pickedUuid).catch(() => null);
          if (gDoc) raceGrantItems.push(gDoc.toObject());
        }
      } else {
        for (const ch of grant.choices || []) {
          const gDoc = await fromUuid(ch.uuid).catch(() => null);
          if (gDoc) raceGrantItems.push(gDoc.toObject());
        }
      }
    }

    // Clear grants & dynamic attributes on cloned item so `_preCreate` never pops a modal or double-creates
    if (raceObj.system) {
      raceObj.system.grants = [];
      if (raceObj.system.atributosDinamicos) {
        raceObj.system.atributosDinamicos.value = [];
      }
    }

    await actor.createEmbeddedDocuments("Item", [raceObj]);

    // Re-apply explicit base + racial attributes after `_onCreateOwnedRace` fires its non-awaited update
    const postRaceAttrPatch = {};
    for (const key of ATTR_ORDER) {
      postRaceAttrPatch[`system.atributos.${key}.base`] = Number(baseAttrs[key] ?? 0);
      postRaceAttrPatch[`system.atributos.${key}.racial`] = Number(racialAttrs[key] ?? 0);
    }
    await actor.update(postRaceAttrPatch);
  }

  // 3. Embed Class at Level 1 & sync Level 1 fixed features via `syncClassLevelProgression`
  const classDoc = await fromUuid(draft.class.uuid).catch(() => null);
  let createdClass = null;
  if (classDoc) {
    const classObj = classDoc.toObject();
    classObj.system.inicial = true;
    classObj.system.niveis = 1;
    const createdClasses = await actor.createEmbeddedDocuments("Item", [classObj]);
    createdClass = createdClasses[0] || null;
    if (createdClass) {
      await syncClassLevelProgression(actor, createdClass, 0, 1);
      if (draft.class.arcanistaPath) {
        await applyArcanistaPathToActor(actor, draft.class.arcanistaPath);
      }
    }
  }

  // 4. Collect all remaining items (race grants, origin powers & items, deity powers, free powers, spells, gear)
  const existingNames = new Set(actor.items.map((i) => normalizeText(i.name)));
  const batchItems = [];
  const pushUniqueFeature = (itemObj) => {
    const k = normalizeText(itemObj.name);
    if (!k || existingNames.has(k)) return;
    existingNames.add(k);
    batchItems.push(itemObj);
  };

  for (const rGrant of raceGrantItems) {
    pushUniqueFeature(rGrant);
  }

  // Origin chosen fixed powers
  for (const idx of draft.origin?.pickedPowerIndices || []) {
    const choice = draft.origin?.poderChoices?.[idx];
    if (choice?.uuid) {
      const pDoc = await fromUuid(choice.uuid).catch(() => null);
      if (pDoc) pushUniqueFeature(pDoc.toObject());
    }
  }

  // Deity granted powers
  for (const pUuid of draft.deity?.selectedPowerUuids || []) {
    const dDoc = await fromUuid(pUuid).catch(() => null);
    if (dDoc) pushUniqueFeature(dDoc.toObject());
  }

  // Free powers from Step 7 (Versátil, Memória Póstuma, Origin wildcards)
  for (const fp of draft.magicAndPowers?.selectedFreePowers || []) {
    const fpDoc = await fromUuid(fp.uuid).catch(() => null);
    if (fpDoc) pushUniqueFeature(fpDoc.toObject());
  }

  // Starting 1st-circle spells
  const castingAttr = caster?.keyAttr || actor.system?.attributes?.conjuracao || "int";
  for (const sp of draft.magicAndPowers?.selectedSpells || []) {
    const spDoc = await fromUuid(sp.uuid).catch(() => null);
    if (!spDoc) continue;
    const spObj = spDoc.toObject();
    if (spObj.system?.resistencia) {
      spObj.system.resistencia.atributo = castingAttr;
    }
    pushUniqueFeature(spObj);
  }

  // Origin starting items
  if (draft.origin?.includeOriginItems && Array.isArray(draft.origin.itemMatches)) {
    const allowedSet = Array.isArray(draft.origin.selectedOriginItemUuids)
      ? new Set(draft.origin.selectedOriginItemUuids)
      : null;
    for (const it of draft.origin.itemMatches) {
      if (allowedSet && !allowedSet.has(it.uuid)) continue;
      const itDoc = it.uuid ? await fromUuid(it.uuid).catch(() => null) : null;
      if (itDoc) batchItems.push(itDoc.toObject());
    }
  }

  // Step 8 kit or shop gear
  const gearList = draft.equipment?.mode === "kit"
    ? (draft.equipment.kitItems || [])
    : draft.equipment?.mode === "shop"
      ? (draft.equipment.shopItems || [])
      : [];

  for (const g of gearList) {
    const gDoc = g.uuid ? await fromUuid(g.uuid).catch(() => null) : null;
    if (!gDoc) continue;
    const gObj = gDoc.toObject();
    if (g.qty && Number(g.qty) > 1 && gObj.system && "qtd" in gObj.system) {
      gObj.system.qtd = Number(g.qty);
    }
    batchItems.push(gObj);
  }

  if (batchItems.length > 0) {
    await actor.createEmbeddedDocuments("Item", batchItems);
  }

  // 5. Recompute actor derived PV/PM max and fill current PV/PM to 100%
  actor.prepareData();
  const maxPv = Number(actor.system?.attributes?.pv?.max || 0);
  const maxPm = Number(actor.system?.attributes?.pm?.max || 0);
  await actor.update({
    "system.attributes.pv.value": maxPv,
    "system.attributes.pm.value": maxPm
  });

  actor.sheet?.render(true);
  ui.notifications.info(`Personagem "${actor.name}" criado com sucesso pelo Assistente!`);
  return {
    actor,
    createdItemsCount: batchItems.length + (createdClass ? 1 : 0) + (raceDoc ? 1 : 0)
  };
}

