import { initConjurarArma } from "./conjurar-arma.js";

const MODULE_ID = "t20-compendios-completos";

const PT_NUMBER_WORDS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6
};

const ATTR_ORDER = ["for", "des", "con", "int", "sab", "car"];
const ATTR_LABELS = {
  for: "FOR",
  des: "DES",
  con: "CON",
  int: "INT",
  sab: "SAB",
  car: "CAR"
};

function parseDynamicAttributePrompt(description) {
  const clean = String(description || "").toLowerCase();
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

function enhanceDynamicAttributesDialog(app, html) {
  const title = app?.options?.window?.title || app?.title || "";
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  const isDynAttr = title.includes("Atributos Dinâmicos") || app?.options?.window?.contentClasses?.includes?.("attribute-config");
  if (!isDynAttr || root.querySelector(".t20pf2e-dynattr-picker")) return;

  const inputs = ATTR_ORDER
    .map((key) => ({ key, input: root.querySelector(`input[name="${key}"]`) }))
    .filter((entry) => entry.input);

  if (!inputs.length) return;

  const descEl = root.querySelector("h4");
  const descText = descEl?.textContent?.trim() || "";
  const { bonus, count } = parseDynamicAttributePrompt(descText);

  // Only transform into click-to-toggle cards when the rule asks for selecting N attributes (e.g. "+1 em três atributos diferentes")
  if (!count || count > inputs.length) return;

  const rawGroup = inputs[0].input.closest(".form-group");
  if (rawGroup) rawGroup.style.display = "none";

  const picker = document.createElement("div");
  picker.className = "t20pf2e-dynattr-picker";
  picker.innerHTML = `
    <div class="t20pf2e-dynattr-status">
      <span>Clique nos atributos desejados (+${bonus} em cada):</span>
      <strong class="t20pf2e-dynattr-counter">0 / ${count}</strong>
    </div>
    <div class="t20pf2e-dynattr-grid">
      ${inputs.map(({ key }) => `
        <button type="button" class="t20pf2e-dynattr-btn" data-attr-key="${key}">
          <span class="t20pf2e-dynattr-abbr">${ATTR_LABELS[key] || key.toUpperCase()}</span>
          <span class="t20pf2e-dynattr-val">+0</span>
        </button>
      `).join("")}
    </div>
  `;

  const selected = new Set();
  const counterEl = picker.querySelector(".t20pf2e-dynattr-counter");
  const buttons = [...picker.querySelectorAll(".t20pf2e-dynattr-btn")];

  const syncUi = () => {
    counterEl.textContent = `${selected.size} / ${count}`;
    counterEl.classList.toggle("is-complete", selected.size === count);
    const atLimit = selected.size >= count;

    for (const { key, input } of inputs) {
      const isActive = selected.has(key);
      input.value = isActive ? String(bonus) : "0";
      const btn = buttons.find((b) => b.dataset.attrKey === key);
      if (!btn) continue;
      btn.classList.toggle("is-selected", isActive);
      btn.disabled = !isActive && atLimit;
      const valEl = btn.querySelector(".t20pf2e-dynattr-val");
      if (valEl) valEl.textContent = isActive ? `+${bonus}` : "+0";
    }
  };

  for (const btn of buttons) {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const key = btn.dataset.attrKey;
      if (selected.has(key)) selected.delete(key);
      else if (selected.size < count) selected.add(key);
      syncUi();
    });
  }

  if (descEl) descEl.after(picker);
  else if (rawGroup) rawGroup.before(picker);

  syncUi();
}

function isWeaponRanged(item) {
  const purpose = String(item?.system?.proposito || "").toLowerCase();
  if (["arremesso", "disparo", "fogo"].includes(purpose)) return true;
  if (purpose === "corpo-a-corpo") return false;
  return /\b(arco|besta|funda|pistola|mosquete|arcabuz|escopeta|azagaia|dardo)\b/i.test(String(item?.name || ""));
}

function clonePlainRolls(rawRolls) {
  if (!Array.isArray(rawRolls)) return [];
  return rawRolls.map((r) => {
    if (typeof r?.toObject === "function") return r.toObject();
    return foundry.utils.deepClone(r);
  });
}

function normalizeRollParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map((p) => {
    const arr = Array.isArray(p) ? p : [p];
    return [String(arr[0] ?? ""), String(arr[1] ?? ""), String(arr[2] ?? "")];
  });
}

export function buildNormalizedWeaponRollsUpdate(item) {
  if (!item || item.type !== "arma") return null;

  const isRanged = isWeaponRanged(item);
  const skillKey = isRanged ? "pont" : "luta";
  const rolls = clonePlainRolls(item.system?.rolls);
  let changed = false;

  const atkIndex = rolls.findIndex((r) => r?.type === "ataque");
  if (atkIndex === -1) {
    rolls.unshift({
      key: "ataque0",
      name: "Ataque",
      parts: [["1d20", "", ""], [skillKey, "", ""]],
      type: "ataque"
    });
    changed = true;
  } else {
    const atk = rolls[atkIndex];
    const parts = normalizeRollParts(atk.parts);
    const hasDie = Boolean(String(parts[0]?.[0] || "").trim());
    const hasSkill = Boolean(String(parts[1]?.[0] || "").trim());
    if (!hasDie || !hasSkill) {
      if (!hasDie) parts[0] = ["1d20", "", ""];
      if (!hasSkill) parts[1] = [skillKey, "", ""];
      atk.parts = parts;
      changed = true;
    }
  }

  const dmgIndex = rolls.findIndex((r) => r?.type === "dano");
  if (dmgIndex === -1) {
    const descDice = String(item.system?.description?.value || "").match(/\b(\d+d\d+)\b/i)?.[1] || "1d6";
    rolls.push({
      key: "dano0",
      name: "Dano",
      parts: [[descDice, "", ""], [isRanged ? "" : "@for", "", ""]],
      type: "dano"
    });
    changed = true;
  } else {
    const dmg = rolls[dmgIndex];
    const parts = normalizeRollParts(dmg.parts);
    const baseFormula = String(parts[0]?.[0] || "").trim();
    if (!baseFormula || baseFormula === "d0") {
      const descDice = String(item.system?.description?.value || "").match(/\b(\d+d\d+)\b/i)?.[1] || "1d6";
      parts[0] = [descDice, parts[0]?.[1] || "dano", parts[0]?.[2] || ""];
      dmg.parts = parts;
      changed = true;
    }
    if (parts[1]?.[0] === "padrao") {
      parts[1] = [isRanged ? "" : "@for", parts[1]?.[1] || "", parts[1]?.[2] || ""];
      dmg.parts = parts;
      changed = true;
    }
  }

  return changed ? { "system.rolls": rolls } : null;
}

function computeSneakAttackDiceCount(actor, furtivoItem) {
  const ladinoClass = (actor?.items || []).find(
    (i) => i.type === "classe" && /\bladino\b/i.test(String(i.name || ""))
  );
  const ladinoLevels = Number(ladinoClass?.system?.niveis ?? 0);
  if (ladinoLevels >= 1) return Math.max(1, Math.ceil(ladinoLevels / 2));

  const desc = String(furtivoItem?.system?.description?.value || "");
  const descDiceMatch = desc.match(/\+(\d+)\s*d6\b/i);
  if (descDiceMatch) return Math.max(1, Number(descDiceMatch[1]));

  const rollDiceMatch = String(
    (furtivoItem?.system?.rolls || []).find((r) => r?.type === "dano")?.parts?.[0]?.[0] || ""
  ).match(/^(\d+)\s*d6\b/i);
  if (rollDiceMatch) return Math.max(1, Number(rollDiceMatch[1]));

  return 1;
}

export async function repairActorSneakAttack(actor) {
  if (!actor?.isOwner) return;
  const furtivoItem = (actor.items || []).find(
    (i) => /^ataque\s+furtivo\b/i.test(String(i.name || "").trim())
  );
  if (!furtivoItem) return;

  const diceCount = computeSneakAttackDiceCount(actor, furtivoItem);
  const diceFormula = `${diceCount}d6`;
  const desiredDesc = `<p>Ataque Furtivo: adiciona <strong>+${diceFormula}</strong> de dano extra (não multiplica em crítico).</p>`;
  const targetChange = { key: "dano", type: "add", value: diceFormula, priority: 0 };

  const itemEffects = Array.from(furtivoItem.effects || []);
  let onUseEffect = itemEffects.find((ef) => ef.system?.onuse) || itemEffects[0] || null;

  if (!onUseEffect) {
    await furtivoItem.createEmbeddedDocuments("ActiveEffect", [{
      name: `Ataque Furtivo (+${diceFormula})`,
      img: furtivoItem.img || "icons/skills/melee/strike-dagger-white-orange.webp",
      type: "base",
      disabled: true,
      transfer: false,
      origin: furtivoItem.uuid,
      description: desiredDesc,
      system: {
        onuse: true,
        abilityUse: {
          automatic: false,
          aumenta: false,
          custo: null,
          names: [],
          types: ["attack"]
        },
        changes: [targetChange]
      }
    }]).catch((err) => console.warn(`${MODULE_ID} | Falha ao criar efeito de Ataque Furtivo:`, err));
    return;
  }

  const existingChanges = Array.isArray(onUseEffect.system?.changes) ? onUseEffect.system.changes : [];
  const existingTypes = Array.from(onUseEffect.system?.abilityUse?.types || []);
  const hasDesiredChange = existingChanges.length === 1
    && existingChanges[0]?.key === "dano"
    && existingChanges[0]?.type === "add"
    && String(existingChanges[0]?.value || "").trim() === diceFormula;

  const update = {};
  if (onUseEffect.origin !== furtivoItem.uuid) update.origin = furtivoItem.uuid;
  if (!onUseEffect.system?.onuse) update["system.onuse"] = true;
  if (onUseEffect.system?.abilityUse?.aumenta) update["system.abilityUse.aumenta"] = false;
  if (!existingTypes.includes("attack")) update["system.abilityUse.types"] = [...existingTypes, "attack"];
  if (!hasDesiredChange) update["system.changes"] = [targetChange];
  if (!String(onUseEffect.name || "").includes(diceFormula)) update.name = `Ataque Furtivo (+${diceFormula})`;
  if (!String(onUseEffect.description || "").includes(diceFormula)) update.description = desiredDesc;

  if (Object.keys(update).length) {
    await onUseEffect.update(update).catch((err) => {
      console.warn(`${MODULE_ID} | Falha ao atualizar efeito de Ataque Furtivo:`, err);
    });
  }

  // Remove any orphan duplicate Ataque Furtivo onuse effect lingering directly on actor.effects
  const orphanIds = (actor.effects || [])
    .filter((ef) => ef.system?.onuse && /^ataque\s+furtivo\b/i.test(String(ef.name || "").trim()))
    .map((ef) => ef.id);
  if (orphanIds.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", orphanIds).catch(() => {});
  }
}

function installWeaponRollRepairWrapper() {
  const ItemProto = CONFIG.Item?.documentClass?.prototype;
  if (!ItemProto || ItemProto._t20FixWeaponRollPatched) return;
  ItemProto._t20FixWeaponRollPatched = true;

  const origRoll = ItemProto.roll;
  if (typeof origRoll !== "function") return;

  ItemProto.roll = async function patchedT20ItemRoll(options = {}) {
    if (this.type === "arma") {
      if (this.actor) await repairActorSneakAttack(this.actor);
      const update = buildNormalizedWeaponRollsUpdate(this);
      if (update) {
        if (this.parent && this.id && this.isOwner) {
          await this.update(update).catch((err) => {
            console.warn(`${MODULE_ID} | Falha ao atualizar rolls da arma ${this.name}:`, err);
          });
        }
        // Guarantee _source in memory has normalized rolls before ItemT20.roll clones `this`
        if (buildNormalizedWeaponRollsUpdate(this)) {
          this.updateSource(update);
        }
        if (typeof this.prepareFinalAttributes === "function") this.prepareFinalAttributes();
      }
    }
    if (options && typeof options === "object" && !options.event) {
      options = { ...options, event: {} };
    }
    return origRoll.call(this, options);
  };
}

async function repairExistingWeaponRolls() {
  const seenActors = new Set();
  const actorsToCheck = [];
  for (const actor of game.actors || []) {
    if (actor.isOwner && !seenActors.has(actor.uuid)) {
      seenActors.add(actor.uuid);
      actorsToCheck.push(actor);
    }
  }
  for (const token of canvas?.tokens?.placeables || []) {
    const actor = token?.actor;
    if (actor?.isOwner && !seenActors.has(actor.uuid)) {
      seenActors.add(actor.uuid);
      actorsToCheck.push(actor);
    }
  }

  for (const actor of actorsToCheck) {
    for (const item of actor.items || []) {
      const update = buildNormalizedWeaponRollsUpdate(item);
      if (update) {
        await item.update(update).catch((err) => {
          console.warn(`${MODULE_ID} | Falha ao normalizar arma ${item.name}:`, err);
        });
      }
    }
    await repairActorSneakAttack(actor);
  }
}

export function initSheetUxEnhancers() {
  installWeaponRollRepairWrapper();
  initConjurarArma();
  Hooks.on("renderDialogV2", enhanceDynamicAttributesDialog);
  Hooks.once("ready", () => {
    installWeaponRollRepairWrapper();
    void repairExistingWeaponRolls();
  });
  Hooks.on("canvasReady", () => {
    void repairExistingWeaponRolls();
  });
  for (const itemHook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(itemHook, (item) => {
      const actor = item?.parent;
      if (!actor?.isOwner) return;
      if (item.type === "classe" || /^ataque\s+furtivo\b/i.test(String(item.name || ""))) {
        void repairActorSneakAttack(actor);
      }
    });
  }

  // Normalize missing weapon attack rolls & default PC gear to unequipped
  Hooks.on("preCreateItem", (item, data) => {
    const update = {};

    if (item.type === "arma") {
      const rollsUpdate = buildNormalizedWeaponRollsUpdate(item);
      if (rollsUpdate) Object.assign(update, rollsUpdate);
    }

    const actor = item.parent;
    const shouldUnequip = actor
      && actor.type === "character"
      && ["arma", "equipamento"].includes(item.type)
      && !(item.type === "arma" && item.system?.proficiencia === "natural")
      && !data?.flags?.[MODULE_ID]?.preserveEquipped;

    if (shouldUnequip) {
      if (item.system?.equipado) update["system.equipado"] = item.type === "arma" ? 0 : false;
      if (item.system?.equipado2?.slot) update["system.equipado2.slot"] = 0;
    }

    if (Object.keys(update).length) item.updateSource(update);
  });
}

/**
 * Shared weapon grip helper for Combate tab and Token Quick Actions.
 */
export function getWeaponGripVariants(item) {
  if (!item || item.type !== "arma") return [];
  const damageRoll = (item.system?.rolls || []).find((r) => r.type === "dano");
  const adaptFormula = String(damageRoll?.adaptavel || "").trim();
  const baseFormula = String(damageRoll?.parts?.[0]?.[0] || "").trim();
  const hasAdaptable = Boolean(
    adaptFormula
    && item.system?.empunhadura !== "duas"
    && (item.system?.propriedades?.ada || adaptFormula !== baseFormula)
  );

  if (!hasAdaptable) return [];
  return [
    { grip: 1, label: "1 Mão", damageHint: baseFormula || item.labels?.dano || "" },
    { grip: 2, label: "2 Mãos", damageHint: adaptFormula }
  ];
}

export async function rollWeaponWithGrip(item, grip, event) {
  if (!item) return;
  const equipmentSlots = game.settings.get("tormenta20", "equipmentSlots");
  const cloneData = item.toObject();

  if (grip === 2) {
    if (equipmentSlots) foundry.utils.setProperty(cloneData, "system.equipado2.slot", 12.1);
    else foundry.utils.setProperty(cloneData, "system.equipado", 2);
    foundry.utils.setProperty(cloneData, "system.propriedades.ada", true);
  } else {
    if (equipmentSlots) foundry.utils.setProperty(cloneData, "system.equipado2.slot", 1.1);
    else foundry.utils.setProperty(cloneData, "system.equipado", 1);
  }

  const tempItem = new Item.implementation(cloneData, { parent: item.actor });
  if (typeof tempItem.prepareFinalAttributes === "function") tempItem.prepareFinalAttributes();
  return tempItem.roll({ event });
}

