const MODULE_ID = "t20-compendios-completos";
const FLAG_MANAGED_MODES = "autoVisionModes";
const FLAG_MANAGED_RANGE = "autoVisionRange";

const SENSE_POWERS_PATTERNS = {
  darkvision: /visao\s+no\s+escuro|darkvision/i,
  dimvision: /visao\s+na\s+penumbra|sentidos\s+elficos/i,
  blindsight: /percepcao\s+as\s+cegas|blindsight/i,
  devilsSight: /visao\s+nas\s+trevas/i,
  detectMagic: /visao\s+mistica/i,
  seeInvisibility: /ver\s+o\s+invisivel/i,
  truesight: /visao\s+da\s+verdade/i
};

const pendingActorSyncs = new Map();

function normalizeText(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSensesSet(actor) {
  const raw = actor?.system?.attributes?.sentidos?.value;
  if (raw instanceof Set) return new Set([...raw].map(normalizeText));
  if (Array.isArray(raw)) return new Set(raw.map(normalizeText));
  return new Set();
}

function extractMetersFromText(text, fallback) {
  const match = String(text ?? "").match(/(\d+(?:[.,]\d+)?)\s*m\b/i);
  if (!match) return fallback;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Extracts a Foundry v14-native vision and detection profile from a Tormenta20 actor.
 * Uses sheet senses, passive sense powers, and active effects without monkeypatching CanvasVisibility.
 */
export function extractT20VisionProfile(actor) {
  const senses = getSensesSet(actor);
  const customSenses = normalizeText(actor?.system?.attributes?.sentidos?.custom);

  const profile = {
    darkvisionRange: 0,
    dimvision: senses.has("penumbra") || SENSE_POWERS_PATTERNS.dimvision.test(customSenses),
    blindsightRange: 0,
    devilsSightRange: 0,
    detectMagicRange: 0,
    seeInvisibilityRange: 0,
    truesightRange: 0
  };

  if (senses.has("escuro") || SENSE_POWERS_PATTERNS.darkvision.test(customSenses)) {
    profile.darkvisionRange = extractMetersFromText(customSenses, 9);
  }
  if (senses.has("cegas") || SENSE_POWERS_PATTERNS.blindsight.test(customSenses)) {
    profile.blindsightRange = extractMetersFromText(customSenses, 9);
  }

  for (const item of actor?.items || []) {
    if (item.type !== "poder") continue;
    const cleanName = normalizeText(item.name);
    if (SENSE_POWERS_PATTERNS.darkvision.test(cleanName)) {
      profile.darkvisionRange = Math.max(profile.darkvisionRange, 9);
    }
    if (SENSE_POWERS_PATTERNS.dimvision.test(cleanName)) {
      profile.dimvision = true;
    }
    if (SENSE_POWERS_PATTERNS.blindsight.test(cleanName)) {
      profile.blindsightRange = Math.max(profile.blindsightRange, 9);
    }
    if (SENSE_POWERS_PATTERNS.devilsSight.test(cleanName)) {
      profile.devilsSightRange = Math.max(profile.devilsSightRange, 18);
    }
  }

  const activeEffects = actor?.appliedEffects || actor?.effects?.filter((e) => !e.disabled) || [];
  for (const effect of activeEffects) {
    if (effect.disabled) continue;
    const cleanName = normalizeText(effect.name);
    if (SENSE_POWERS_PATTERNS.darkvision.test(cleanName)) {
      profile.darkvisionRange = Math.max(profile.darkvisionRange, 18);
    }
    if (SENSE_POWERS_PATTERNS.blindsight.test(cleanName)) {
      profile.blindsightRange = Math.max(profile.blindsightRange, 9);
    }
    if (SENSE_POWERS_PATTERNS.devilsSight.test(cleanName)) {
      profile.devilsSightRange = Math.max(profile.devilsSightRange, 18);
    }
    if (SENSE_POWERS_PATTERNS.detectMagic.test(cleanName)) {
      profile.detectMagicRange = Math.max(profile.detectMagicRange, 30);
    }
    if (SENSE_POWERS_PATTERNS.seeInvisibility.test(cleanName)) {
      profile.seeInvisibilityRange = Infinity;
    }
    if (SENSE_POWERS_PATTERNS.truesight.test(cleanName)) {
      profile.truesightRange = Infinity;
      profile.seeInvisibilityRange = Infinity;
    }
  }

  if (profile.devilsSightRange > 0) {
    profile.darkvisionRange = Math.max(profile.darkvisionRange, profile.devilsSightRange);
  }
  return profile;
}

function pickAvailableDetectionId(candidates) {
  const registered = CONFIG?.Canvas?.detectionModes || {};
  return candidates.find((id) => Boolean(registered[id])) || null;
}

function pickAvailableVisionMode(candidates) {
  const registered = CONFIG?.Canvas?.visionModes || {};
  return candidates.find((id) => Boolean(registered[id])) || "basic";
}

function toSceneDistance(meters, sceneUnits) {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  if (sceneUnits === "km") return meters / 1000;
  return meters;
}

/**
 * Computes native Foundry v14 `sight` and `detectionModes` updates for a TokenDocument or prototypeToken.
 * Preserves larger GM-configured sight ranges and never forces `brightness: -1` on basic sight.
 */
export function buildNativeVisionUpdate(tokenLike, actor, { prefix = "", sceneUnits = "m" } = {}) {
  if (!actor || !["character", "npc"].includes(actor.type)) return null;

  const profile = extractT20VisionProfile(actor);
  const monochromeDarkvision = Boolean(game.settings.get(MODULE_ID, "darkvisionMonochrome"));
  const defaultBasicRange = Math.max(0, Number(game.settings.get(MODULE_ID, "defaultNormalSightRange") ?? 0));

  const sight = tokenLike?.sight || {};
  const existingModes = Array.isArray(tokenLike?.detectionModes) ? tokenLike.detectionModes : [];
  const previouslyManaged = new Set(
    foundry.utils.getProperty(tokenLike, `flags.${MODULE_ID}.${FLAG_MANAGED_MODES}`) || []
  );
  const prevManagedRange = foundry.utils.getProperty(tokenLike, `flags.${MODULE_ID}.${FLAG_MANAGED_RANGE}`);
  const currentRange = Number(sight.range ?? 0);
  const hasCustomRange = Number.isFinite(currentRange) && currentRange > 0 && currentRange !== Number(prevManagedRange);
  const manualFloorRange = hasCustomRange ? currentRange : 0;

  const desiredModesMap = new Map();
  const managedIds = [];

  const lightId = pickAvailableDetectionId(["lightPerception"]);
  if (lightId) {
    desiredModesMap.set(lightId, { id: lightId, enabled: true, range: null });
    managedIds.push(lightId);
  }

  const darkRange = toSceneDistance(profile.darkvisionRange, sceneUnits);
  const basicId = pickAvailableDetectionId(["basicSight"]);
  if (basicId && darkRange > 0) {
    const prevBasic = existingModes.find((m) => m.id === basicId);
    const preservedRange = prevBasic?.range && !previouslyManaged.has(basicId)
      ? Math.max(prevBasic.range, darkRange)
      : Math.max(manualFloorRange, darkRange);
    desiredModesMap.set(basicId, { id: basicId, enabled: true, range: preservedRange });
    managedIds.push(basicId);
  }

  if (profile.blindsightRange > 0) {
    const blindId = pickAvailableDetectionId(["blindsight", "feelTremor", "senseAll"]);
    if (blindId) {
      desiredModesMap.set(blindId, {
        id: blindId,
        enabled: true,
        range: toSceneDistance(profile.blindsightRange, sceneUnits)
      });
      managedIds.push(blindId);
    }
  }

  if (profile.seeInvisibilityRange > 0) {
    const seeInvisId = pickAvailableDetectionId(["seeInvisibility", "senseInvisibility"]);
    if (seeInvisId) {
      desiredModesMap.set(seeInvisId, {
        id: seeInvisId,
        enabled: true,
        range: Number.isFinite(profile.seeInvisibilityRange)
          ? toSceneDistance(profile.seeInvisibilityRange, sceneUnits)
          : null
      });
      managedIds.push(seeInvisId);
    }
  }

  if (profile.truesightRange > 0 || profile.detectMagicRange > 0) {
    const specialRange = profile.truesightRange > 0
      ? null
      : toSceneDistance(profile.detectMagicRange, sceneUnits);
    const specialId = pickAvailableDetectionId(["truesight", "senseAll"]);
    if (specialId) {
      desiredModesMap.set(specialId, { id: specialId, enabled: true, range: specialRange });
      managedIds.push(specialId);
    }
  }

  // Keep user-added custom detection modes untouched; replace only module-managed ones
  const mergedModes = [];
  for (const mode of existingModes) {
    if (!mode?.id) continue;
    if (desiredModesMap.has(mode.id)) {
      mergedModes.push(desiredModesMap.get(mode.id));
      desiredModesMap.delete(mode.id);
    } else if (!previouslyManaged.has(mode.id)) {
      mergedModes.push({ id: mode.id, enabled: mode.enabled !== false, range: mode.range ?? null });
    }
  }
  for (const remaining of desiredModesMap.values()) {
    mergedModes.push(remaining);
  }

  let targetVisionMode = "basic";
  let autoComputedRange = defaultBasicRange;
  let targetSaturation = 0;

  if (profile.truesightRange > 0) {
    targetVisionMode = pickAvailableVisionMode(["truesight", "darkvision", "basic"]);
    autoComputedRange = 36;
  } else if (darkRange > 0) {
    targetVisionMode = pickAvailableVisionMode(["darkvision", "basic"]);
    autoComputedRange = darkRange;
    targetSaturation = monochromeDarkvision ? -1 : 0;
  } else if (profile.blindsightRange > 0) {
    targetVisionMode = pickAvailableVisionMode(["tremorsense", "basic"]);
    autoComputedRange = toSceneDistance(profile.blindsightRange, sceneUnits) || 9;
  }

  const targetRange = Math.max(manualFloorRange, autoComputedRange);

  const update = {};
  if (sight.enabled !== true) update[`${prefix}sight.enabled`] = true;
  if (sight.visionMode !== targetVisionMode) update[`${prefix}sight.visionMode`] = targetVisionMode;
  if (currentRange !== targetRange) update[`${prefix}sight.range`] = targetRange;
  if (Number(sight.saturation ?? 0) !== targetSaturation) update[`${prefix}sight.saturation`] = targetSaturation;
  if (Number(sight.brightness ?? 0) < 0) update[`${prefix}sight.brightness`] = 0;

  const normalizedOld = existingModes.map((m) => ({ id: m.id, enabled: m.enabled !== false, range: m.range ?? null }));
  if (JSON.stringify(normalizedOld) !== JSON.stringify(mergedModes)) {
    update[`${prefix}detectionModes`] = mergedModes;
  }

  const prevManagedArr = Array.from(previouslyManaged);
  if (JSON.stringify(prevManagedArr) !== JSON.stringify(managedIds)) {
    update[`${prefix}flags.${MODULE_ID}.${FLAG_MANAGED_MODES}`] = managedIds;
  }
  if (Number(prevManagedRange ?? -1) !== autoComputedRange) {
    update[`${prefix}flags.${MODULE_ID}.${FLAG_MANAGED_RANGE}`] = autoComputedRange;
  }

  return Object.keys(update).length ? update : null;
}

function getSelectableVisionChoices(tokenDoc) {
  const actor = tokenDoc?.actor;
  if (!actor) return [];
  const profile = extractT20VisionProfile(actor);
  const choices = [
    { id: "basic", label: "Visão Normal", range: Math.max(0, Number(game.settings.get(MODULE_ID, "defaultNormalSightRange") ?? 0)) }
  ];

  if (profile.darkvisionRange > 0 && CONFIG?.Canvas?.visionModes?.darkvision) {
    choices.push({ id: "darkvision", label: "Visão no Escuro", range: profile.darkvisionRange });
  }
  if (profile.blindsightRange > 0) {
    const modeId = pickAvailableVisionMode(["blindsight", "tremorsense"]);
    if (modeId !== "basic") {
      choices.push({ id: modeId, label: "Percepção às Cegas", range: profile.blindsightRange });
    }
  }
  if (profile.truesightRange > 0 && CONFIG?.Canvas?.visionModes?.truesight) {
    choices.push({ id: "truesight", label: "Visão da Verdade", range: 36 });
  }
  return choices;
}

function queueActorVisionSync(actor) {
  if (!actor || !["character", "npc"].includes(actor.type)) return;
  if (!game.settings.get(MODULE_ID, "autoSyncTokenVision")) return;
  if (!actor.isOwner) return;

  if (pendingActorSyncs.has(actor.id)) return;
  pendingActorSyncs.set(actor.id, setTimeout(async () => {
    pendingActorSyncs.delete(actor.id);
    await TokenVisionT20.syncActorAndTokens(actor);
  }, 60));
}

export function registerTokenVisionSettings() {
  game.settings.register(MODULE_ID, "autoSyncTokenVision", {
    name: "T20COMP.Settings.AutoSyncVisionName",
    hint: "T20COMP.Settings.AutoSyncVisionHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (enabled) => {
      if (enabled && game.user?.isGM) TokenVisionT20.syncAll({ notify: true });
    }
  });

  game.settings.register(MODULE_ID, "darkvisionMonochrome", {
    name: "T20COMP.Settings.DarkvisionMonochromeName",
    hint: "T20COMP.Settings.DarkvisionMonochromeHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (game.user?.isGM && game.settings.get(MODULE_ID, "autoSyncTokenVision")) {
        TokenVisionT20.syncAll({ notify: false });
      }
    }
  });

  game.settings.register(MODULE_ID, "defaultNormalSightRange", {
    name: "T20COMP.Settings.DefaultNormalSightRangeName",
    hint: "T20COMP.Settings.DefaultNormalSightRangeHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 60, step: 1.5 },
    onChange: () => {
      if (game.user?.isGM && game.settings.get(MODULE_ID, "autoSyncTokenVision")) {
        TokenVisionT20.syncAll({ notify: false });
      }
    }
  });
}

export class TokenVisionT20 {
  static init() {
    Hooks.on("preCreateActor", (actor, data) => {
      if (!game.settings.get(MODULE_ID, "autoSyncTokenVision")) return;
      if (!["character", "npc"].includes(data?.type || actor?.type)) return;
      const mergedProto = foundry.utils.mergeObject(
        actor.prototypeToken?.toObject?.() || {},
        data?.prototypeToken || {},
        { inplace: false }
      );
      const update = buildNativeVisionUpdate(mergedProto, actor, {
        prefix: "prototypeToken.",
        sceneUnits: canvas?.scene?.grid?.units || "m"
      });
      if (update) actor.updateSource(update);
    });

    Hooks.on("preCreateToken", (tokenDoc, data) => {
      if (!game.settings.get(MODULE_ID, "autoSyncTokenVision")) return;
      const actor = tokenDoc.actor || (data?.actorId ? game.actors?.get(data.actorId) : null);
      if (!actor) return;
      const update = buildNativeVisionUpdate(data || tokenDoc, actor, {
        sceneUnits: tokenDoc.parent?.grid?.units || "m"
      });
      if (update) tokenDoc.updateSource(update);
    });

    Hooks.on("canvasReady", () => {
      if (game.user?.isGM && game.settings.get(MODULE_ID, "autoSyncTokenVision")) {
        this.syncSceneTokens({ notify: false });
      }
    });

    Hooks.on("updateActor", (actor, changes) => {
      if (changes?.system?.attributes?.sentidos !== undefined) {
        queueActorVisionSync(actor);
      }
    });

    for (const hookName of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(hookName, (doc) => {
        const actor = doc?.parent?.documentName === "Actor" ? doc.parent : null;
        if (actor) queueActorVisionSync(actor);
      });
    }

    Hooks.on("renderTokenHUD", (hud, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      const tokenDoc = hud?.object?.document;
      if (!root || !tokenDoc?.isOwner || !tokenDoc.sight?.enabled) return;

      const choices = getSelectableVisionChoices(tokenDoc);
      if (choices.length <= 1 || root.querySelector('[data-palette="t20pf2e.visionModes"]')) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "control-icon";
      btn.dataset.tooltip = "Selecionar Modo de Visão";
      btn.ariaLabel = "Selecionar Modo de Visão";
      btn.innerHTML = `<i class="fa-solid fa-eye"></i>`;

      const palette = document.createElement("div");
      palette.className = "palette t20pf2e-vision-palette";
      palette.dataset.palette = "t20pf2e.visionModes";
      palette.style.display = "none";

      for (const choice of choices) {
        const item = document.createElement("a");
        item.className = `flexrow${tokenDoc.sight.visionMode === choice.id ? " active" : ""}`;
        item.textContent = choice.label;
        item.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          await tokenDoc.update({
            "sight.visionMode": choice.id,
            "sight.range": choice.range,
            "sight.saturation": choice.id === "darkvision" && game.settings.get(MODULE_ID, "darkvisionMonochrome") ? -1 : 0
          });
          palette.style.display = "none";
        });
        palette.appendChild(item);
      }

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        palette.style.display = palette.style.display === "none" ? "flex" : "none";
      });

      const targetBtn = root.querySelector('.control-icon[data-action="target"]') || root.querySelector(".col.right");
      if (targetBtn?.dataset?.action === "target") {
        targetBtn.insertAdjacentElement("beforebegin", btn);
        btn.insertAdjacentElement("afterend", palette);
      } else if (targetBtn) {
        targetBtn.append(btn, palette);
      }
    });
  }

  static async syncActorAndTokens(actor) {
    if (!actor || !actor.isOwner) return;
    if (!actor.isToken) {
      const protoUpdate = buildNativeVisionUpdate(actor.prototypeToken, actor, {
        prefix: "prototypeToken.",
        sceneUnits: canvas?.scene?.grid?.units || "m"
      });
      if (protoUpdate) {
        await actor.update(protoUpdate).catch(() => {});
      }
    }

    const activeTokens = typeof actor.getActiveTokens === "function"
      ? actor.getActiveTokens(false, true)
      : [];
    for (const tokenDoc of activeTokens) {
      if (!tokenDoc?.isOwner) continue;
      const tokenUpdate = buildNativeVisionUpdate(tokenDoc, actor, {
        sceneUnits: tokenDoc.parent?.grid?.units || "m"
      });
      if (tokenUpdate) {
        await tokenDoc.update(tokenUpdate).catch(() => {});
      }
    }
  }

  static async syncSceneTokens({ notify = false } = {}) {
    if (!game.user?.isGM || !canvas?.scene) return 0;
    const updates = [];
    const sceneUnits = canvas.scene.grid?.units || "m";
    for (const tokenDoc of canvas.scene.tokens) {
      const update = buildNativeVisionUpdate(tokenDoc, tokenDoc.actor, { sceneUnits });
      if (update) updates.push({ _id: tokenDoc.id, ...update });
    }
    if (updates.length) {
      await canvas.scene.updateEmbeddedDocuments("Token", updates).catch(() => {});
    }
    if (notify) {
      ui.notifications.info(`Visão dos tokens sincronizada (${updates.length} atualizados na cena).`);
    }
    return updates.length;
  }

  static async syncAll({ notify = false } = {}) {
    if (!game.user?.isGM) return 0;
    const sceneCount = await this.syncSceneTokens({ notify: false });
    const actorUpdates = [];
    const sceneUnits = canvas?.scene?.grid?.units || "m";

    for (const actor of game.actors || []) {
      const update = buildNativeVisionUpdate(actor.prototypeToken, actor, {
        prefix: "prototypeToken.",
        sceneUnits
      });
      if (update) actorUpdates.push({ _id: actor.id, ...update });
    }
    if (actorUpdates.length) {
      await Actor.updateDocuments(actorUpdates).catch(() => {});
    }
    if (notify) {
      ui.notifications.info(`Visão T20 v14 sincronizada (${sceneCount} tokens na cena, ${actorUpdates.length} protótipos).`);
    }
    return sceneCount + actorUpdates.length;
  }
}
