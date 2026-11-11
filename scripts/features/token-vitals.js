import { evaluateAttackAgainstTargets } from "./chat-enhancer.js";

const MODULE_ID = "t20-compendios-completos";
const HUD_ROOT_ID = "t20pf2e-vitals-hud-root";
const HUD_TEMPLATE = `modules/${MODULE_ID}/templates/hud/token-vitals-hud.hbs`;
const STORAGE_POS_KEY = "t20pf2e.vitalsHudPos";
const STORAGE_COLLAPSE_KEY = "t20pf2e.vitalsHudCollapsed";

const RECOVERY_TYPES = new Set(["curapv", "curatpv", "curapm", "curatpm"]);

function stripHtml(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actorHasVitals(actor) {
  return Boolean(actor?.system?.attributes?.pv);
}

function getTargetActorsForHud() {
  const controlled = (canvas?.tokens?.controlled || [])
    .filter((token) => token.actor && token.actor.isOwner && actorHasVitals(token.actor));

  if (controlled.length) {
    const seen = new Set();
    const actors = [];
    for (const token of controlled) {
      const actor = token.actor;
      const key = actor.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      actors.push({ actor, token });
    }
    return actors;
  }

  const assigned = game.user?.character;
  if (assigned && actorHasVitals(assigned)) {
    return [{ actor: assigned, token: null }];
  }
  return [];
}

function getMissingTokenBarUpdate(tokenLike, actor) {
  if (actor && !actorHasVitals(actor)) return null;
  const bar1Attr = tokenLike?.bar1?.attribute ?? "";
  const bar2Attr = tokenLike?.bar2?.attribute ?? "";
  const displayBars = tokenLike?.displayBars;

  const update = {};
  if (!bar1Attr) update["bar1.attribute"] = "attributes.pv";
  if (!bar2Attr) update["bar2.attribute"] = "attributes.pm";
  if (displayBars === undefined || displayBars === null || displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) {
    update.displayBars = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
  }
  return Object.keys(update).length ? update : null;
}

function getMissingProtoBarUpdate(actor) {
  if (!actor || !["character", "npc"].includes(actor.type)) return null;
  const proto = actor.prototypeToken;
  const raw = getMissingTokenBarUpdate(proto, actor);
  if (!raw) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[`prototypeToken.${k}`] = v;
  }
  return out;
}

function installTopBarsWrapper() {
  const TokenClass = CONFIG.Token?.objectClass || foundry?.canvas?.placeables?.Token;
  const proto = TokenClass?.prototype;
  if (!proto || typeof proto._drawBar !== "function" || proto._t20TopBarsPatched) return;

  const origDrawBar = proto._drawBar;
  proto._drawBar = function (index, bar, data) {
    origDrawBar.call(this, index, bar, data);
    if (!game.settings.get(MODULE_ID, "stackBarsOnTop")) return;

    const s = canvas?.dimensions?.uiScale || 1;
    const bh = 8 * (this.document?.height >= 2 ? 1.5 : 1) * s;
    const hasBar2 = Boolean(this.document?.bar2?.max);
    // Stack PV (bar1) and PM (bar2) cleanly above the top edge so token art remains uncovered
    const posY = index === 0
      ? (hasBar2 ? -(bh * 2 + 2 * s) : -(bh + 1 * s))
      : -(bh + 1 * s);
    bar.position.set(0, posY);
  };
  proto._t20TopBarsPatched = true;
}

async function applyPvDelta(actor, delta) {
  if (!actor || !delta) return;
  if (delta < 0) {
    await actor.applyDamage(Math.abs(delta), 1, false);
  } else {
    await actor.applyDamage(-delta, 1, false);
  }
}

async function applyPmDelta(actor, delta) {
  if (!actor || !delta) return;
  if (delta < 0) {
    await actor.spendMana(Math.abs(delta), 0, false);
  } else {
    await actor.spendMana(delta, 0, true);
  }
}

async function applyTempVital(actor, type, amount) {
  if (!actor || !amount) return;
  const path = type === "pv" ? "system.attributes.pv.temp" : "system.attributes.pm.temp";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);
  await actor.update({ [path]: Math.max(0, current + amount) });
}

async function applyRecoveryToActor(actor, recovery) {
  if (!actor || !recovery) return [];
  const appliedParts = [];
  if (recovery.pv > 0) {
    await actor.applyDamage(-recovery.pv, 1, false);
    appliedParts.push(`+${recovery.pv} PV`);
  }
  if (recovery.pm > 0) {
    await actor.spendMana(recovery.pm, 0, true);
    appliedParts.push(`+${recovery.pm} PM`);
  }
  if (recovery.tempPv > 0) {
    await applyTempVital(actor, "pv", recovery.tempPv);
    appliedParts.push(`+${recovery.tempPv} PV temp`);
  }
  if (recovery.tempPm > 0) {
    await applyTempVital(actor, "pm", recovery.tempPm);
    appliedParts.push(`+${recovery.tempPm} PM temp`);
  }
  return appliedParts;
}

function actorHasPm(actor) {
  return Boolean(actor?.system?.attributes?.pm && Number(actor.system.attributes.pm.max ?? 0) >= 0);
}

function getActorAvailablePm(actor) {
  const pm = actor?.system?.attributes?.pm;
  if (!pm) return 0;
  return Math.max(0, Number(pm.value || 0)) + Math.max(0, Number(pm.temp || 0));
}

async function spendActorManaDirect(actor, requestedAmount) {
  const cost = Math.max(0, Math.floor(Number(requestedAmount || 0)));
  if (!actor || !cost || !actorHasPm(actor)) return null;

  const pm = actor.system.attributes.pm;
  const prevValue = Math.max(0, Number(pm.value || 0));
  const prevTemp = Math.max(0, Number(pm.temp || 0));
  const maxPm = Math.max(0, Number(pm.max || 0));
  const available = prevValue + prevTemp;

  const actualSpent = Math.min(cost, available);
  const tempSpent = Math.min(prevTemp, actualSpent);
  const valueSpent = actualSpent - tempSpent;
  const newTemp = Math.max(0, prevTemp - tempSpent);
  const newValue = Math.clamp(prevValue - valueSpent, 0, Math.max(maxPm, prevValue));

  if (actualSpent > 0) {
    await actor.update({
      "system.attributes.pm.temp": newTemp,
      "system.attributes.pm.value": newValue
    });
  }

  return {
    requested: cost,
    actualSpent,
    shortBy: Math.max(0, cost - actualSpent),
    tempSpent,
    valueSpent,
    remaining: newValue + newTemp,
    remainingValue: newValue,
    remainingTemp: newTemp,
    max: maxPm,
    actorUuid: actor.uuid,
    actorName: actor.name,
    undone: false
  };
}

async function refundActorManaDirect(actor, manaInfo) {
  if (!actor || !manaInfo || !actorHasPm(actor)) return false;
  const pm = actor.system.attributes.pm;
  const curValue = Math.max(0, Number(pm.value || 0));
  const curTemp = Math.max(0, Number(pm.temp || 0));
  const maxPm = Math.max(0, Number(pm.max || 0));

  const nextTemp = curTemp + Math.max(0, Number(manaInfo.tempSpent || 0));
  const nextValue = Math.clamp(curValue + Math.max(0, Number(manaInfo.valueSpent || 0)), 0, Math.max(maxPm, curValue));

  await actor.update({
    "system.attributes.pm.temp": nextTemp,
    "system.attributes.pm.value": nextValue
  });
  return true;
}

function extractMessageManaCost(message) {
  const htmlStr = String(message?.content || "");
  if (!htmlStr.includes("chat-spend-mana")) return 0;

  const tpl = document.createElement("template");
  tpl.innerHTML = htmlStr;
  const btn = tpl.content.querySelector(".chat-spend-mana");
  if (!btn || btn.disabled || btn.classList.contains("truque")) return 0;

  const raw = btn.getAttribute("value") ?? btn.value ?? "";
  const cost = Number(raw);
  return Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : 0;
}

function resolveCasterActorFromMessage(message) {
  const speaker = message?.speaker || {};
  if (typeof ChatMessage.getSpeakerActor === "function") {
    const bySpeaker = ChatMessage.getSpeakerActor(speaker);
    if (bySpeaker) return bySpeaker;
  }
  if (speaker.token) {
    const tokenDoc = (speaker.scene ? game.scenes?.get(speaker.scene) : canvas?.scene)?.tokens?.get(speaker.token);
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  if (speaker.actor) {
    const byId = game.actors?.get(speaker.actor);
    if (byId) return byId;
  }
  const idMatch = String(message?.content || "").match(/data-actor-id=["']([^"']+)["']/);
  return idMatch?.[1] ? game.actors?.get(idMatch[1]) || null : null;
}

function computeAbilityUseDialogCost(root, app) {
  const item = app?.item;
  const baseCost = Math.max(0, Number(item?.system?.ativacao?.custo ?? 0));
  let aprsDelta = 0;
  let hasPositiveApr = false;
  let isTruque = false;

  const rows = root?.querySelectorAll(".aprimoramentos-list li") || [];
  for (const row of rows) {
    const input = row.querySelector('input:not([type="hidden"])');
    const hidden = row.querySelector('input[type="hidden"]');
    if (!input || !hidden) continue;

    const qty = input.type === "checkbox" ? (input.checked ? 1 : 0) : Math.max(0, Number(input.value || 0));
    if (!qty) continue;

    const rawCost = String(hidden.value ?? "").trim();
    if (/^truque$/i.test(rawCost)) {
      isTruque = true;
      continue;
    }

    const numericCost = Number(rawCost);
    if (Number.isFinite(numericCost) && numericCost !== 0) {
      aprsDelta += numericCost * qty;
      if (numericCost > 0) hasPositiveApr = true;
    }
  }

  if (isTruque) return { cost: 0, isTruque: true };

  const adjustRaw = root?.querySelector('input[name="ajustecusto"]')?.value?.trim() || "0";
  const adjustCost = Number.isFinite(Number(adjustRaw)) ? Number(adjustRaw) : 0;

  const hasAnyCost = baseCost > 0 || hasPositiveApr || adjustCost > 0;
  let total = baseCost + aprsDelta + adjustCost;
  total = hasAnyCost ? Math.max(1, total) : Math.max(0, total);

  if (total > 0 && item?.actor) {
    const extraMod = Number(item.actor.system?.modificadores?.custoPM ?? 0);
    if (Number.isFinite(extraMod) && extraMod !== 0) {
      total = hasAnyCost ? Math.max(1, total + extraMod) : Math.max(0, total + extraMod);
    }
  }
  return { cost: Math.floor(total), isTruque: false };
}

function estimateAutomaticItemManaCost(item) {
  if (!item) return 0;
  let total = Math.max(0, Number(item.system?.ativacao?.custo ?? 0));
  let hasCost = total > 0;
  let isTruque = false;
  let halfCost = false;

  const effects = typeof item._allApplicableOnUseEffects === "function" ? item._allApplicableOnUseEffects() : [];
  for (const ef of effects) {
    if (!ef?.system?.abilityUse?.automatic) continue;
    if (ef.system?.isCantrip && item.type === "magia") isTruque = true;
    const raw = Number(ef.system?.abilityUse?.custo || 0);
    if (Number.isFinite(raw) && raw !== 0) {
      total += raw;
      if (raw > 0) hasCost = true;
    }
    if (Array.isArray(ef.system?.changes) && ef.system.changes.some((ch) => ch.key === "custo" && ch.value === "/2")) {
      halfCost = true;
    }
  }

  if (isTruque || (!hasCost && total <= 0)) return 0;
  total = Math.max(1, total);
  const extraMod = Number(item.actor?.system?.modificadores?.custoPM ?? 0);
  if (Number.isFinite(extraMod) && extraMod !== 0) total = Math.max(1, total + extraMod);
  if (halfCost) total = Math.floor(total / 2);
  return Math.max(0, Math.floor(total));
}

function installManaSpendEnhancers() {
  if (!Hooks._t20AutoManaDialogHookRegistered) {
    Hooks._t20AutoManaDialogHookRegistered = true;
    Hooks.on("renderAbilityUseDialog", (app, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      const actor = app?.item?.actor;
      if (!root || !actor || !actorHasPm(actor)) return;

      const form = root.querySelector("form#ability-use-form") || root;
      const totalRow = form.querySelector(".total-cost");
      const costInput = totalRow?.querySelector("input.cost");
      if (!totalRow || !costInput) return;

      let statusEl = form.querySelector(".t20pf2e-mana-dialog-status");
      if (!statusEl) {
        statusEl = document.createElement("div");
        statusEl.className = "t20pf2e-mana-dialog-status";
        totalRow.after(statusEl);
      }

      const refreshStatus = () => {
        const { cost, isTruque } = computeAbilityUseDialogCost(form, app);
        costInput.value = String(cost);

        const pm = actor.system.attributes.pm;
        const valPm = Math.max(0, Number(pm.value || 0));
        const tempPm = Math.max(0, Number(pm.temp || 0));
        const avail = valPm + tempPm;
        const insufficient = !isTruque && cost > 0 && cost > avail;

        statusEl.classList.toggle("is-insufficient", insufficient);
        const availText = tempPm > 0 ? `${valPm} PM (+${tempPm} temp)` : `${valPm} PM`;
        statusEl.innerHTML = insufficient
          ? `<span><i class="fa-solid fa-triangle-exclamation"></i> PM insuficiente (faltam ${cost - avail} PM)</span><span>Disponível: ${availText}</span>`
          : `<span><i class="fa-solid fa-droplet"></i> ${cost > 0 ? `Custo real: ${cost} PM` : (isTruque ? "Truque (0 PM)" : "Sem custo de PM")}</span><span>Disponível: ${availText}</span>`;
      };

      const scheduleRefresh = () => setTimeout(refreshStatus, 0);
      form.addEventListener("input", scheduleRefresh);
      form.addEventListener("change", scheduleRefresh);
      form.querySelectorAll(".numCtrl").forEach((btn) => btn.addEventListener("click", scheduleRefresh));

      if (!app._t20ManaSubmitPatched && typeof app.submit === "function") {
        app._t20ManaSubmitPatched = true;
        const origSubmit = app.submit;
        app.submit = function patchedAbilityDialogSubmit(button, event) {
          const isBrew = app.data?.buttons?.brew && button === app.data.buttons.brew;
          const shouldGuard = !isBrew
            && !event?.altKey
            && game.settings.get(MODULE_ID, "autoSpendManaOnUse")
            && game.settings.get(MODULE_ID, "blockInsufficientMana");

          if (shouldGuard) {
            const { cost, isTruque } = computeAbilityUseDialogCost(form, app);
            const available = getActorAvailablePm(actor);
            if (!isTruque && cost > 0 && cost > available) {
              ui.notifications.warn(
                `PM insuficiente para ${app.item?.name || "esta ação"}: custa ${cost} PM, mas ${actor.name} possui apenas ${available} PM. (Segure Alt ao clicar para forçar)`
              );
              return this;
            }
          }
          return origSubmit.call(this, button, event);
        };
      }

      refreshStatus();
    });
  }

  const AbilityUseDialog = game.tormenta20?.applications?.AbilityUseDialog;
  if (AbilityUseDialog && !AbilityUseDialog._t20CreatePatched && typeof AbilityUseDialog.create === "function") {
    AbilityUseDialog._t20CreatePatched = true;
    const origCreate = AbilityUseDialog.create;
    AbilityUseDialog.create = async function patchedAbilityUseCreate(item, ...args) {
      const result = await origCreate.call(this, item, ...args);
      if (result && !result.truque && !result.brew && item?.system?.ativacao) {
        const adj = Number(String(result.ajustecusto ?? "").trim());
        if (Number.isFinite(adj) && adj !== 0) {
          const prev = Number(item.system.ativacao.custo || 0);
          const hasCost = prev > 0 || adj > 0;
          item.system.ativacao.custo = hasCost ? Math.max(1, prev + adj) : Math.max(0, prev + adj);
        }
      }
      return result;
    };
  }

  const ItemProto = CONFIG.Item?.documentClass?.prototype;
  if (ItemProto && !ItemProto._t20ManaGuardPatched && typeof ItemProto.roll === "function") {
    ItemProto._t20ManaGuardPatched = true;
    const origRoll = ItemProto.roll;
    ItemProto.roll = async function patchedItemManaGuardRoll(options = {}) {
      const shouldGuard = !options?.event?.altKey
        && game.settings.get(MODULE_ID, "autoSpendManaOnUse")
        && game.settings.get(MODULE_ID, "blockInsufficientMana")
        && !game.settings.get("tormenta20", "automaticManaSpend");

      if (shouldGuard && this.actor && actorHasPm(this.actor)) {
        const usageConfig = game.settings.get("tormenta20", "UsageConfig") === "default";
        const applicable = typeof this._allApplicableOnUseEffects === "function" ? this._allApplicableOnUseEffects() : [];
        const hasEffectsOrRolls = Boolean(applicable.length || this.system?.rolls?.length);
        const willOpenDialog = hasEffectsOrRolls && (usageConfig ? !options?.event?.shiftKey : Boolean(options?.event?.shiftKey));

        if (!willOpenDialog) {
          const estimatedCost = estimateAutomaticItemManaCost(this);
          const available = getActorAvailablePm(this.actor);
          if (estimatedCost > 0 && estimatedCost > available) {
            ui.notifications.warn(
              `PM insuficiente para ${this.name}: custa ${estimatedCost} PM, mas ${this.actor.name} possui apenas ${available} PM. (Segure Alt ao clicar para forçar)`
            );
            return null;
          }
        }
      }

      if (options && typeof options === "object" && !options.event) {
        options = { ...options, event: {} };
      }
      return origRoll.call(this, options);
    };
  }
}

function extractRecoveryFromRollTerms(rolls) {
  const result = { pv: 0, pm: 0, tempPv: 0, tempPm: 0, hasStructured: false, detail: [] };
  if (!Array.isArray(rolls) || !rolls.length) return result;

  for (const roll of rolls) {
    if (!Array.isArray(roll?.terms)) continue;
    let lastOp = "+";
    for (const term of roll.terms) {
      if (term?.operator) {
        lastOp = term.operator;
        continue;
      }
      const flavor = String(term?.options?.flavor || roll.terms[0]?.options?.flavor || "").toLowerCase();
      if (!RECOVERY_TYPES.has(flavor)) continue;
      result.hasStructured = true;
      const val = Number(term?.total ?? 0) * (lastOp === "-" ? -1 : 1);
      if (val <= 0) continue;
      if (flavor === "curapv") result.pv += val;
      else if (flavor === "curatpv") result.tempPv += val;
      else if (flavor === "curapm") result.pm += val;
      else if (flavor === "curatpm") result.tempPm += val;
    }
  }
  return result;
}

function parseConsumableTextRecovery(name, descriptionText) {
  const cleanName = stripHtml(name).toLowerCase();
  const cleanDesc = stripHtml(descriptionText);
  const pvMatch = cleanDesc.match(/(?:recupera[rm]?|cura[rm]?|ganha[rm]?)\s+(?:(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+(?:pontos?\s+de\s+vida|pv\b))/i);
  const pmMatch = cleanDesc.match(/(?:recupera[rm]?|restaura[rm]?|ganha[rm]?)\s+(?:(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+(?:pontos?\s+de\s+mana|pm\b))/i);

  let pvFormula = pvMatch?.[1] || null;
  let pmFormula = pmMatch?.[1] || null;

  if (!pvFormula && /b[aá]lsamo restaurador/i.test(cleanName)) pvFormula = "2d4";
  if (!pmFormula && /ess[eê]ncia de mana/i.test(cleanName)) pmFormula = "1d4";

  if (!pvFormula && !pmFormula) return null;
  return { pvFormula, pmFormula };
}

function resolveMessageItem(message, speakerActor) {
  const htmlStr = String(message?.content || "");
  const itemMatch = htmlStr.match(/data-item-id=["']([^"']+)["']/);
  const itemId = itemMatch?.[1] || null;
  if (itemId && speakerActor?.items?.get(itemId)) {
    return speakerActor.items.get(itemId);
  }
  const flagItemData = message?.flags?.tormenta20?.itemData;
  if (flagItemData) {
    return {
      name: flagItemData.name || "",
      type: flagItemData.type || (htmlStr.includes("Consumível") ? "consumivel" : ""),
      system: flagItemData
    };
  }
  return null;
}

function getMessageSpeakerActor(message) {
  const speaker = message?.speaker || {};
  if (speaker.scene && speaker.token) {
    const tokenDoc = game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token);
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  if (speaker.actor) return game.actors?.get(speaker.actor) || null;
  const actorMatch = String(message?.content || "").match(/data-actor-id=["']([^"']+)["']/);
  if (actorMatch?.[1]) return game.actors?.get(actorMatch[1]) || null;
  return null;
}

async function resolveMessageRecovery(message, allowEvaluateDice = false) {
  const fromRolls = extractRecoveryFromRollTerms(message?.rolls);
  const speakerActor = getMessageSpeakerActor(message);
  const item = resolveMessageItem(message, speakerActor);
  const isConsumable = item?.type === "consumivel" || Boolean(item?.system?.tipo && ["alchemy", "potion", "food"].includes(item.system.tipo));

  if (fromRolls.hasStructured) {
    return { ...fromRolls, isConsumable, itemName: item?.name || "", speakerActor };
  }

  if (!item) return null;
  const desc = item.system?.description?.value || message?.content || "";
  const parsed = parseConsumableTextRecovery(item.name || message?.flavor || "", desc);
  if (!parsed) return null;

  const out = { pv: 0, pm: 0, tempPv: 0, tempPm: 0, hasStructured: false, isConsumable, itemName: item.name || "", speakerActor, formulas: parsed, rolledNotes: [] };

  // Reuse an unflavored roll already present on the message if only one recovery resource applies
  const existingGenericRoll = (message?.rolls || []).find((r) => r?.dice?.[0]?.faces !== 20 && Number.isFinite(r?.total));
  if (existingGenericRoll && (Boolean(parsed.pvFormula) !== Boolean(parsed.pmFormula))) {
    if (parsed.pvFormula) out.pv = Math.max(0, Number(existingGenericRoll.total));
    if (parsed.pmFormula) out.pm = Math.max(0, Number(existingGenericRoll.total));
    return out;
  }

  if (!allowEvaluateDice) return out;

  if (parsed.pvFormula) {
    const r = await new Roll(parsed.pvFormula).evaluate();
    out.pv = Math.max(0, Number(r.total ?? 0));
    out.rolledNotes.push(`${parsed.pvFormula} = ${out.pv}`);
  }
  if (parsed.pmFormula) {
    const r = await new Roll(parsed.pmFormula).evaluate();
    out.pm = Math.max(0, Number(r.total ?? 0));
    out.rolledNotes.push(`${parsed.pmFormula} = ${out.pm}`);
  }
  return out;
}

function getDamageRollsFromMessage(message) {
  if (!Array.isArray(message?.rolls)) return [];
  return message.rolls.filter((r) => {
    const isD20 = r.dice?.[0]?.faces === 20;
    if (isD20) return false;
    const isExplicitRecovery = r.terms?.some((t) => RECOVERY_TYPES.has(String(t?.options?.flavor || "").toLowerCase()));
    if (isExplicitRecovery) return false;
    return r.options?.type === "damage" || Boolean(r.dice?.length) || Number.isFinite(r.total);
  });
}

async function resolveTargetActorsFromMessage(message, { fallbackControlled = true, fallbackSpeaker = false } = {}) {
  const uuids = message?.getFlag?.(MODULE_ID, "targetTokenUuids") || [];
  const targetActors = [];
  const seen = new Set();

  for (const uuid of uuids) {
    try {
      const doc = await fromUuid(uuid);
      const actor = doc?.actor || (doc?.documentName === "Actor" ? doc : null);
      if (actor && !seen.has(actor.uuid)) {
        seen.add(actor.uuid);
        targetActors.push({ actor, tokenUuid: uuid, label: doc?.name || actor.name });
      }
    } catch {
      // Ignore deleted tokens
    }
  }
  if (targetActors.length) return { mode: "targets", recipients: targetActors };

  if (fallbackControlled) {
    const controlled = (canvas?.tokens?.controlled || [])
      .filter((t) => t.actor && actorHasVitals(t.actor));
    if (controlled.length) {
      return {
        mode: "controlled",
        recipients: controlled.map((t) => ({ actor: t.actor, label: t.name || t.actor.name }))
      };
    }
  }

  if (fallbackSpeaker) {
    const speakerActor = getMessageSpeakerActor(message) || game.user?.character;
    if (speakerActor && actorHasVitals(speakerActor)) {
      return { mode: "speaker", recipients: [{ actor: speakerActor, label: speakerActor.name }] };
    }
  }

  return { mode: "none", recipients: [] };
}

export function registerTokenVitalsSettings() {
  game.settings.register(MODULE_ID, "showVitalsHud", {
    name: "T20COMP.Settings.ShowVitalsHudName",
    hint: "T20COMP.Settings.ShowVitalsHudHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => TokenVitalsHudT20.render()
  });

  game.settings.register(MODULE_ID, "autoTokenBars", {
    name: "T20COMP.Settings.AutoTokenBarsName",
    hint: "T20COMP.Settings.AutoTokenBarsHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (enabled) => {
      if (enabled && game.user?.isGM) TokenVitalsHudT20.syncAllTokenBars({ notify: true });
    }
  });

  game.settings.register(MODULE_ID, "stackBarsOnTop", {
    name: "T20COMP.Settings.StackBarsOnTopName",
    hint: "T20COMP.Settings.StackBarsOnTopHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      canvas?.tokens?.placeables?.forEach((t) => t.drawBars());
    }
  });

  game.settings.register(MODULE_ID, "autoApplyConsumables", {
    name: "T20COMP.Settings.AutoApplyConsumablesName",
    hint: "T20COMP.Settings.AutoApplyConsumablesHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "autoApplyTargetDamage", {
    name: "T20COMP.Settings.AutoApplyTargetDamageName",
    hint: "T20COMP.Settings.AutoApplyTargetDamageHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "autoSpendManaOnUse", {
    name: "T20COMP.Settings.AutoSpendManaName",
    hint: "T20COMP.Settings.AutoSpendManaHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "blockInsufficientMana", {
    name: "T20COMP.Settings.BlockInsufficientManaName",
    hint: "T20COMP.Settings.BlockInsufficientManaHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

function filterHitRecipients(recipients, evalResult) {
  if (!evalResult?.targets?.length) return recipients;
  const hitUuids = new Set(evalResult.hitTargets.map((t) => t.uuid).filter(Boolean));
  const hitNames = new Set(evalResult.hitTargets.map((t) => t.name));
  return recipients.filter((r) => (r.tokenUuid && hitUuids.size ? hitUuids.has(r.tokenUuid) : hitNames.has(r.label)));
}

function scaleRollForT20Damage(roll, multiplier) {
  if (multiplier === 1) return roll;
  const terms = Array.isArray(roll?.terms) ? roll.terms : [];
  if (!terms.length) return roll;

  const byFlavor = new Map();
  let lastOp = "+";
  for (const term of terms) {
    if (term?.operator) {
      lastOp = term.operator;
      continue;
    }
    const flavor = term?.options?.flavor || terms[0]?.options?.flavor || "dano";
    const entry = byFlavor.get(flavor) || { value: 0, porDado: 0 };
    const signed = (Number(term?.total ?? 0)) * (lastOp === "-" ? -1 : 1);
    entry.value += signed;
    if (term?.faces) entry.porDado += Number(term.number ?? 0);
    byFlavor.set(flavor, entry);
  }

  const scaledTerms = [];
  for (const [flavor, entry] of byFlavor.entries()) {
    const scaled = Math.max(0, Math.floor(entry.value * multiplier));
    if (scaledTerms.length) scaledTerms.push({ operator: "+" });
    scaledTerms.push({
      total: scaled,
      faces: entry.porDado > 0 ? 1 : undefined,
      number: entry.porDado,
      options: { flavor }
    });
  }
  return {
    total: scaledTerms.reduce((sum, t) => sum + (t.operator ? 0 : Number(t.total ?? 0)), 0),
    options: roll?.options || {},
    terms: scaledTerms
  };
}

async function applyDamageRollsToRecipients(editable, damageRolls, multiplier = 1) {
  if (multiplier <= 0) return;
  for (const { actor } of editable) {
    for (const roll of damageRolls) {
      if (typeof actor.applyDamageV2 === "function") {
        const preparedRoll = multiplier === 1 ? roll : scaleRollForT20Damage(roll, multiplier);
        if (Number(preparedRoll?.total ?? 0) > 0) {
          await actor.applyDamageV2(preparedRoll, 1, "dano");
        }
      } else {
        await actor.applyDamage(Math.floor(Number(roll.total ?? 0) * multiplier), 1, true);
      }
    }
  }
}

function extractSaveRequirementFromMessage(message) {
  const itemData = message?.flags?.tormenta20?.itemData || {};
  const rawHtml = String(message?.content || "");
  const headerText = stripHtml(rawHtml);
  const headerSaveMatch = headerText.match(/Resist[êe]ncia:\s*([^;\n]+)/i);
  const saveTxt = [itemData?.resistencia?.txt, headerSaveMatch?.[1]].filter(Boolean).join(" ").trim();
  if (!saveTxt) return null;

  let skillKey = null;
  let skillLabel = null;
  if (/reflexos|\brefl\b/i.test(saveTxt)) {
    skillKey = "refl";
    skillLabel = "Reflexos";
  } else if (/fortitude|\bfort\b/i.test(saveTxt)) {
    skillKey = "fort";
    skillLabel = "Fortitude";
  } else if (/vontade|\bvont\b/i.test(saveTxt)) {
    skillKey = "vont";
    skillLabel = "Vontade";
  }
  if (!skillKey) return null;

  const cdMatch = saveTxt.match(/CD\s*(\d+)/i);
  const speakerActor = getMessageSpeakerActor(message);
  const cd = Number(cdMatch?.[1] || itemData?.resistencia?.cd || speakerActor?.system?.attributes?.cd || 0);

  let effect = "half";
  let passMultiplier = 0.5;
  let effectHint = "passou = ½ dano";
  if (/anula|evita|nenhum/i.test(saveTxt)) {
    effect = "negate";
    passMultiplier = 0;
    effectHint = "passou = anula";
  } else if (/parcial/i.test(saveTxt)) {
    effect = "partial";
    passMultiplier = 0.5;
    effectHint = "passou = parcial";
  }

  return { skillKey, skillLabel, cd, effect, passMultiplier, effectHint, rawText: saveTxt };
}

function getActorEvasionTier(actor) {
  const items = actor?.items || [];
  let hasEvasion = false;
  let hasImproved = false;
  for (const item of items) {
    const clean = String(item?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (clean.includes("evasao aprimorada")) hasImproved = true;
    else if (clean.includes("evasao")) hasEvasion = true;
  }
  return { hasEvasion: hasEvasion || hasImproved, hasImproved };
}

async function resolveCurrentOrSavedRecipients(message) {
  const fromSaved = await resolveTargetActorsFromMessage(message, {
    fallbackControlled: false,
    fallbackSpeaker: false
  });
  if (fromSaved.recipients.length) return fromSaved;

  const liveTargets = Array.from(game.user?.targets || [])
    .filter((t) => t.actor && actorHasVitals(t.actor));
  if (liveTargets.length) {
    return {
      mode: "targets",
      recipients: liveTargets.map((t) => ({ actor: t.actor, tokenUuid: t.document?.uuid, label: t.name || t.actor.name }))
    };
  }

  return resolveTargetActorsFromMessage(message, { fallbackControlled: true, fallbackSpeaker: false });
}

export class TokenVitalsHudT20 {
  static _root = null;
  static _lastPvAmount = 5;
  static _lastPmAmount = 1;
  static _collapsed = localStorage.getItem(STORAGE_COLLAPSE_KEY) === "1";

  static init() {
    installTopBarsWrapper();
    installManaSpendEnhancers();
    Hooks.once("ready", () => installManaSpendEnhancers());
    this._registerHooks();
  }

  static _registerHooks() {
    Hooks.on("preCreateActor", (actor, data) => {
      if (!game.settings.get(MODULE_ID, "autoTokenBars")) return;
      if (data?.type && !["character", "npc"].includes(data.type)) return;
      const bar1 = foundry.utils.getProperty(data, "prototypeToken.bar1.attribute");
      const bar2 = foundry.utils.getProperty(data, "prototypeToken.bar2.attribute");
      const displayBars = foundry.utils.getProperty(data, "prototypeToken.displayBars");

      const update = {};
      if (!bar1) update["prototypeToken.bar1.attribute"] = "attributes.pv";
      if (!bar2) update["prototypeToken.bar2.attribute"] = "attributes.pm";
      if (displayBars === undefined || displayBars === null || displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) {
        update["prototypeToken.displayBars"] = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
      }
      if (Object.keys(update).length) actor.updateSource(update);
    });

    Hooks.on("preCreateToken", (tokenDoc, data) => {
      if (!game.settings.get(MODULE_ID, "autoTokenBars")) return;
      const actor = tokenDoc.actor || (data?.actorId ? game.actors?.get(data.actorId) : null);
      if (actor && !actorHasVitals(actor)) return;
      const update = getMissingTokenBarUpdate(data || tokenDoc, actor);
      if (update) tokenDoc.updateSource(update);
    });

    Hooks.on("canvasReady", () => {
      installTopBarsWrapper();
      if (game.user?.isGM && game.settings.get(MODULE_ID, "autoTokenBars")) {
        this.syncAllTokenBars({ notify: false });
      }
      this.render();
    });

    Hooks.on("controlToken", () => this.render());
    Hooks.on("updateActor", () => this.render());
    Hooks.on("updateToken", () => this.render());
    Hooks.on("refreshToken", () => {
      installTopBarsWrapper();
    });

    this._registerTokenHudHook();
    this._registerChatAutomationHooks();
  }

  static _registerTokenHudHook() {
    Hooks.on("renderTokenHUD", (hud, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      const actor = hud?.object?.actor;
      if (!root || !actor || !actorHasVitals(actor)) return;

      for (const barKey of ["bar1", "bar2"]) {
        const container = root.querySelector(`.attribute.${barKey}`);
        if (!container || container.querySelector(".t20pf2e-tokenhud-steppers")) continue;

        const attrPath = hud.object.document?.[barKey]?.attribute;
        const isPm = attrPath?.includes("pm") || (barKey === "bar2" && !attrPath?.includes("pv"));
        const steps = isPm ? [-5, -1, 1, 5] : [-5, -1, 1, 5];

        const row = document.createElement("div");
        row.className = "t20pf2e-tokenhud-steppers";
        for (const delta of steps) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `t20pf2e-hud-step ${delta < 0 ? "is-neg" : "is-pos"}`;
          btn.textContent = delta > 0 ? `+${delta}` : String(delta);
          btn.title = `${delta > 0 ? "Adicionar" : "Remover"} ${Math.abs(delta)} ${isPm ? "PM" : "PV"}`;
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (isPm) await applyPmDelta(actor, delta);
            else await applyPvDelta(actor, delta);
          });
          row.appendChild(btn);
        }
        container.appendChild(row);
      }
    });
  }

  static _registerChatAutomationHooks() {
    Hooks.on("preCreateChatMessage", (message) => {
      const targets = Array.from(game.user?.targets || []);
      if (!targets.length) return;
      const isItemOrRoll = Boolean(message.rolls?.length || message.flags?.tormenta20?.itemData || String(message.content || "").includes("chat-card"));
      if (!isItemOrRoll) return;

      const uuids = targets.map((t) => t.document?.uuid).filter(Boolean);
      if (uuids.length) {
        message.updateSource({ [`flags.${MODULE_ID}.targetTokenUuids`]: uuids });
      }
    });

    Hooks.on("createChatMessage", async (message) => {
      if (message.author?.id !== game.user?.id) return;
      if (message.getFlag(MODULE_ID, "expandedCard")) return;

      const shouldAutoMana = game.settings.get(MODULE_ID, "autoSpendManaOnUse")
        && !game.settings.get("tormenta20", "automaticManaSpend")
        && !message.getFlag(MODULE_ID, "manaSpent");
      if (shouldAutoMana) {
        const manaCost = extractMessageManaCost(message);
        if (manaCost > 0) {
          const caster = resolveCasterActorFromMessage(message);
          if (caster?.isOwner && actorHasPm(caster)) {
            const spent = await spendActorManaDirect(caster, manaCost);
            if (spent) {
              await message.setFlag(MODULE_ID, "manaSpent", spent).catch(() => {});
              if (spent.shortBy > 0) {
                ui.notifications.warn(
                  `${caster.name} tinha PM insuficiente: descontados ${spent.actualSpent} de ${spent.requested} PM.`
                );
              }
            }
          }
        }
      }

      if (message.getFlag(MODULE_ID, "vitalsApplied")) return;

      const autoConsumables = game.settings.get(MODULE_ID, "autoApplyConsumables");
      const recovery = await resolveMessageRecovery(message, autoConsumables);

      if (autoConsumables && recovery && (recovery.isConsumable || recovery.hasStructured)) {
        const hasAmount = recovery.pv > 0 || recovery.pm > 0 || recovery.tempPv > 0 || recovery.tempPm > 0;
        if (hasAmount) {
          const { recipients } = await resolveTargetActorsFromMessage(message, {
            fallbackControlled: false,
            fallbackSpeaker: recovery.isConsumable
          });
          const editable = recipients.filter((r) => r.actor.isOwner);
          if (editable.length) {
            const labels = [];
            let partsSummary = [];
            for (const { actor, label } of editable) {
              partsSummary = await applyRecoveryToActor(actor, recovery);
              labels.push(label);
            }
            if (partsSummary.length) {
              const summaryText = `${partsSummary.join(", ")} em ${labels.join(", ")}`;
              await message.setFlag(MODULE_ID, "vitalsApplied", {
                summary: summaryText,
                notes: recovery.rolledNotes || []
              }).catch(() => {});
              ui.notifications.info(`PV/PM atualizado automaticamente: ${summaryText}`);
            }
            return;
          }
        }
      }

      const isPrimaryApplier = Boolean(game.users?.activeGM ? game.users.activeGM.isSelf : message.isAuthor);
      if (isPrimaryApplier && game.settings.get(MODULE_ID, "autoApplyTargetDamage")) {
        const damageRolls = getDamageRollsFromMessage(message);
        const uuids = message.getFlag(MODULE_ID, "targetTokenUuids") || [];
        if (damageRolls.length && uuids.length) {
          const evalResult = evaluateAttackAgainstTargets(message);
          const saveReq = !evalResult ? extractSaveRequirementFromMessage(message) : null;
          // Spells/abilities with a saving throw (e.g. Bola de Fogo) wait for targets to roll Reflexos/Fortitude/Vontade first
          if (!saveReq) {
            const allMissed = Boolean(evalResult?.targets?.length && evalResult.hitTargets.length === 0);
            if (!allMissed) {
              const { recipients } = await resolveTargetActorsFromMessage(message, {
                fallbackControlled: false,
                fallbackSpeaker: false
              });
              const hitRecipients = filterHitRecipients(recipients, evalResult);
              const editable = hitRecipients.filter((r) => r.actor.isOwner);
              if (editable.length) {
                await applyDamageRollsToRecipients(editable, damageRolls, 1);
                const totalDmg = damageRolls.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
                const missNotes = evalResult?.missTargets?.length
                  ? [`Errou: ${evalResult.missTargets.map((m) => m.name).join(", ")}`]
                  : [];
                const summaryText = `-${totalDmg} dano aplicado em ${editable.map((e) => e.label).join(", ")}`;
                await message.setFlag(MODULE_ID, "vitalsApplied", { summary: summaryText, notes: missNotes }).catch(() => {});
              }
            }
          }
        }
      }
    });

    Hooks.on("renderChatMessageHTML", async (message, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || !message.isContentVisible) return;

      const evalResult = evaluateAttackAgainstTargets(message);
      const saveReq = !evalResult ? extractSaveRequirementFromMessage(message) : null;
      const damageRolls = getDamageRollsFromMessage(message);
      const damageAnchor = root.querySelector(".roll--dano");
      if (damageAnchor && damageRolls.length && evalResult?.isThreat && !root.querySelector(".t20pf2e-crit-note")) {
        const note = document.createElement("div");
        const unconfirmedCrit = evalResult.targets.length > 0 && evalResult.hitTargets.length === 0;
        note.className = `t20pf2e-crit-note ${unconfirmedCrit ? "is-unconfirmed" : "is-confirmed"}`;
        note.innerHTML = unconfirmedCrit
          ? `<i class="fa-solid fa-triangle-exclamation"></i> Ameaça (${evalResult.natural}) errou a Defesa — crítico não confirmado (sem dano).`
          : `<i class="fa-solid fa-burst"></i> Crítico ×${evalResult.critMult} aplicado nos dados da arma (bônus fixos não multiplicam).`;
        damageAnchor.after(note);
      }

      const saveOutcomes = message.getFlag(MODULE_ID, "saveOutcomes");
      if (Array.isArray(saveOutcomes) && saveOutcomes.length && !root.querySelector(".t20pf2e-save-outcomes")) {
        const box = document.createElement("div");
        box.className = "t20pf2e-target-outcomes t20pf2e-save-outcomes";
        box.innerHTML = saveOutcomes
          .map((o) => `
            <div class="t20pf2e-outcome-row ${o.passed ? "hit" : "miss"}">
              <span class="t20pf2e-outcome-target"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(o.label)} <small>(${escapeHtml(o.rollDetail)})</small></span>
              <span class="t20pf2e-outcome-badge">${escapeHtml(o.badge)}</span>
            </div>`)
          .join("");
        const anchor = damageAnchor || root.querySelector(".card-item-header") || root.querySelector(".message-content");
        if (anchor) anchor.after(box);
      }

      const manaInfo = message.getFlag(MODULE_ID, "manaSpent");
      if (manaInfo) {
        const nativeManaBtn = root.querySelector(".chat-spend-mana");
        if (nativeManaBtn && !manaInfo.undone && manaInfo.actualSpent > 0 && !nativeManaBtn.classList.contains("is-paid")) {
          nativeManaBtn.classList.add("is-paid");
          nativeManaBtn.disabled = true;
          nativeManaBtn.title = "Mana descontada automaticamente ao lançar/usar";
          if (!nativeManaBtn.querySelector(".fa-check")) {
            nativeManaBtn.insertAdjacentHTML("afterbegin", `<i class="fa-solid fa-check"></i> `);
          }
        }

        if (!root.querySelector(".t20pf2e-chat-mana-bar")) {
          const isInsufficient = manaInfo.shortBy > 0;
          const isSpell = Boolean(root.querySelector(".card-item-header h4"));
          const manaBar = document.createElement("div");
          manaBar.className = `t20pf2e-chat-mana-bar${isInsufficient && !manaInfo.undone ? " is-insufficient" : ""}`;

          if (!manaInfo.undone) {
            const badge = document.createElement("span");
            badge.className = `t20pf2e-chat-vitals-mana${isInsufficient ? " is-insufficient" : ""}`;

            if (isInsufficient) {
              const title = isSpell ? "Magia conjurada sem mana suficiente" : "Efeito usado sem mana suficiente";
              badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span><strong>${title}</strong> (${escapeHtml(manaInfo.actorName)}: custo ${manaInfo.requested} PM · descontados ${manaInfo.actualSpent} PM · faltaram ${manaInfo.shortBy} PM)</span>`;
            } else {
              badge.innerHTML = `<i class="fa-solid fa-droplet"></i> -${manaInfo.actualSpent} PM (${escapeHtml(manaInfo.actorName)}: ${manaInfo.remaining}/${manaInfo.max} PM)`;
            }
            manaBar.appendChild(badge);

            const casterActor = resolveCasterActorFromMessage(message);
            if (manaInfo.actualSpent > 0 && (casterActor?.isOwner || game.user?.isGM)) {
              manaBar.appendChild(this._makeChatBtn("Desfazer PM", "is-muted", async () => {
                const resolved = (manaInfo.actorUuid ? await fromUuid(manaInfo.actorUuid).catch(() => null) : null) || casterActor;
                if (!resolved?.isOwner) {
                  return ui.notifications.warn("Sem permissão para devolver PM a este personagem.");
                }
                await refundActorManaDirect(resolved, manaInfo);
                await message.setFlag(MODULE_ID, "manaSpent", { ...manaInfo, undone: true }).catch(() => {});
                ui.notifications.info(`+${manaInfo.actualSpent} PM devolvidos para ${resolved.name}.`);
              }));
            }
          } else {
            manaBar.innerHTML = `
              <span class="t20pf2e-chat-vitals-applied">
                <i class="fa-solid fa-rotate-left"></i> +${manaInfo.actualSpent} PM devolvidos (${escapeHtml(manaInfo.actorName)})
              </span>`;
          }

          const cardRoot = root.querySelector(".chat-card") || root.querySelector(".message-content") || root;
          cardRoot.appendChild(manaBar);
        }
      }

      if (root.querySelector(".t20pf2e-chat-vitals-bar")) return;

      const applied = message.getFlag(MODULE_ID, "vitalsApplied");
      const targetUuids = message.getFlag(MODULE_ID, "targetTokenUuids") || [];
      const recovery = await resolveMessageRecovery(message, false);

      const hasActionableRecovery = Boolean(
        recovery && !applied && (recovery.pv > 0 || recovery.pm > 0 || recovery.tempPv > 0 || recovery.tempPm > 0 || recovery.formulas)
      );
      const hasSavePrompt = Boolean(saveReq && damageRolls.length);
      const hasTargetDamage = Boolean(damageRolls.length && (targetUuids.length || hasSavePrompt));

      if (!applied && !hasActionableRecovery && !hasTargetDamage) return;

      const container = document.createElement("div");
      container.className = "t20pf2e-chat-vitals-bar";

      if (applied?.summary) {
        const noteSuffix = applied.notes?.length ? ` (${applied.notes.join(" | ")})` : "";
        container.innerHTML = `
          <span class="t20pf2e-chat-vitals-applied">
            <i class="fa-solid fa-circle-check"></i> ${escapeHtml(applied.summary)}${escapeHtml(noteSuffix)}
          </span>`;
      } else {
        if (hasTargetDamage) {
          const totalDmg = damageRolls.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
          const missedAllTargets = Boolean(evalResult?.targets?.length && evalResult.hitTargets.length === 0);

          const applyToTargets = async (multiplier, allowMissOverride = false) => {
            const { mode, recipients } = await resolveCurrentOrSavedRecipients(message);
            const filtered = !allowMissOverride && mode === "targets"
              ? filterHitRecipients(recipients, evalResult)
              : recipients;
            const editable = filtered.filter((r) => r.actor.isOwner);
            if (!editable.length) return ui.notifications.warn("Nenhum alvo/token acessível encontrado (mire ou selecione os tokens).");
            await applyDamageRollsToRecipients(editable, damageRolls, multiplier);
            const shownDmg = Math.floor(totalDmg * multiplier);
            const label = multiplier === 0
              ? `0 dano (anulado) para ${editable.map((e) => e.label).join(", ")}`
              : `-${shownDmg} dano aplicado em ${editable.map((e) => e.label).join(", ")}`;
            await message.setFlag(MODULE_ID, "vitalsApplied", {
              summary: label,
              notes: multiplier === 0.5 ? ["½ dano"] : []
            }).catch(() => {});
            const prefix = multiplier === 0 ? "Dano anulado" : (multiplier === 0.5 ? "Metade do dano aplicada" : "Dano aplicado");
            ui.notifications.info(`${prefix} em ${editable.map((e) => e.label).join(", ")}.`);
          };

          if (hasSavePrompt) {
            const cdLabel = saveReq.cd > 0 ? `CD ${saveReq.cd}` : "Resistência";
            const saveBadge = document.createElement("span");
            saveBadge.className = "t20pf2e-chat-vitals-save";
            saveBadge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${escapeHtml(saveReq.skillLabel)} (${escapeHtml(cdLabel)} · ${escapeHtml(saveReq.effectHint)})`;
            container.appendChild(saveBadge);

            container.appendChild(this._makeChatBtn(`Rolar ${saveReq.skillLabel} e Aplicar`, "is-save", async () => {
              const { recipients } = await resolveCurrentOrSavedRecipients(message);
              const editable = recipients.filter((r) => r.actor.isOwner);
              if (!editable.length) {
                return ui.notifications.warn("Mire (T) ou selecione os tokens afetados para rolar a resistência.");
              }

              const outcomes = [];
              const summaryParts = [];
              for (const rec of editable) {
                const mod = Number(rec.actor.system?.pericias?.[saveReq.skillKey]?.value ?? 0);
                const formula = mod >= 0 ? `1d20 + ${mod}` : `1d20 - ${Math.abs(mod)}`;
                const roll = await new Roll(formula).evaluate();
                if (game.dice3d?.showForRoll) {
                  game.dice3d.showForRoll(roll, game.user, true).catch(() => {});
                }
                const total = Number(roll.total ?? 0);
                const passed = saveReq.cd > 0 ? total >= saveReq.cd : false;

                let mult = passed ? saveReq.passMultiplier : 1;
                let evasionTag = "";
                if (saveReq.skillKey === "refl" && saveReq.effect !== "negate") {
                  const evasion = getActorEvasionTier(rec.actor);
                  if (passed && evasion.hasEvasion) {
                    mult = 0;
                    evasionTag = " · Evasão";
                  } else if (!passed && evasion.hasImproved) {
                    mult = 0.5;
                    evasionTag = " · Evasão Aprimorada";
                  }
                }

                if (mult > 0) {
                  await applyDamageRollsToRecipients([rec], damageRolls, mult);
                }
                const dmgApplied = Math.floor(totalDmg * mult);
                const badge = mult === 0
                  ? `${passed ? "Passou" : "Falhou"}${evasionTag} → 0 dano`
                  : mult < 1
                    ? `${passed ? "Passou" : "Falhou"}${evasionTag} → ${dmgApplied} dano (½)`
                    : `Falhou → ${dmgApplied} dano`;

                outcomes.push({
                  label: rec.label,
                  passed,
                  rollDetail: `${saveReq.skillLabel} ${total}${saveReq.cd ? ` vs CD ${saveReq.cd}` : ""}`,
                  badge
                });
                summaryParts.push(`${rec.label}: ${dmgApplied}`);
              }

              await message.update({
                [`flags.${MODULE_ID}.saveOutcomes`]: outcomes,
                [`flags.${MODULE_ID}.vitalsApplied`]: {
                  summary: `Resistência resolvida (${summaryParts.join(", ")})`,
                  notes: []
                }
              }).catch(() => {});
            }));

            container.appendChild(this._makeChatBtn(`Total (${totalDmg})`, "is-damage", () => applyToTargets(1, true)));
            container.appendChild(this._makeChatBtn(`½ (${Math.floor(totalDmg * 0.5)})`, "is-half", () => applyToTargets(0.5, true)));
            if (saveReq.effect === "negate") {
              container.appendChild(this._makeChatBtn("Anular (0)", "is-muted", () => applyToTargets(0, true)));
            }
          } else if (missedAllTargets) {
            const missBadge = document.createElement("span");
            missBadge.className = "t20pf2e-chat-vitals-miss";
            missBadge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Errou a Defesa — sem dano`;
            container.appendChild(missBadge);
            container.appendChild(this._makeChatBtn(`Aplicar mesmo assim (${totalDmg})`, "is-muted", () => applyToTargets(1, true)));
          } else {
            container.appendChild(this._makeChatBtn(`Dano no Alvo (${totalDmg})`, "is-damage", () => applyToTargets(1, false)));
            container.appendChild(this._makeChatBtn("½ Alvo", "is-half", () => applyToTargets(0.5, false)));
          }
        }

        if (hasActionableRecovery) {
          const hintLabel = recovery.pv > 0
            ? `Curar +${recovery.pv} PV`
            : recovery.pm > 0
              ? `Recuperar +${recovery.pm} PM`
              : recovery.formulas?.pvFormula
                ? `Rolar/Curar (${recovery.formulas.pvFormula})`
                : `Rolar/Recuperar (${recovery.formulas.pmFormula})`;

          container.appendChild(this._makeChatBtn(hintLabel, "is-heal", async () => {
            const resolved = await resolveMessageRecovery(message, true);
            const { recipients } = await resolveTargetActorsFromMessage(message, {
              fallbackControlled: true,
              fallbackSpeaker: true
            });
            const editable = recipients.filter((r) => r.actor.isOwner);
            if (!editable.length) return ui.notifications.warn("Selecione um token ou vincule um personagem.");
            let summary = [];
            for (const { actor } of editable) {
              summary = await applyRecoveryToActor(actor, resolved);
            }
            const text = `${summary.join(", ")} em ${editable.map((e) => e.label).join(", ")}`;
            await message.setFlag(MODULE_ID, "vitalsApplied", {
              summary: text,
              notes: resolved.rolledNotes || []
            }).catch(() => {});
            ui.notifications.info(`Aplicado: ${text}`);
          }));
        }
      }

      if (container.childElementCount || applied) {
        const msgContent = root.querySelector(".message-content") || root;
        msgContent.appendChild(container);
      }
    });
  }

  static _makeChatBtn(label, variantClass, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `t20pf2e-chat-vital-btn ${variantClass}`;
    btn.textContent = label;
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await handler();
    });
    return btn;
  }

  static async syncAllTokenBars({ notify = false } = {}) {
    if (!game.user?.isGM) return 0;
    let updatedCount = 0;

    if (canvas?.scene) {
      const tokenUpdates = [];
      for (const tokenDoc of canvas.scene.tokens) {
        const update = getMissingTokenBarUpdate(tokenDoc, tokenDoc.actor);
        if (update) tokenUpdates.push({ _id: tokenDoc.id, ...update });
      }
      if (tokenUpdates.length) {
        await canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates);
        updatedCount += tokenUpdates.length;
      }
      canvas.tokens?.placeables?.forEach((t) => t.drawBars());
    }

    const actorUpdates = [];
    for (const actor of game.actors || []) {
      const update = getMissingProtoBarUpdate(actor);
      if (update) actorUpdates.push({ _id: actor.id, ...update });
    }
    if (actorUpdates.length) {
      await Actor.updateDocuments(actorUpdates);
    }

    if (notify) {
      ui.notifications.info(`Barras PV/PM sincronizadas (${updatedCount} tokens na cena, ${actorUpdates.length} protótipos).`);
    }
    return updatedCount;
  }

  static _ensureRoot() {
    let root = document.getElementById(HUD_ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = HUD_ROOT_ID;
      document.body.appendChild(root);
    }
    this._applySavedPosition(root);
    this._root = root;
    return root;
  }

  static _applySavedPosition(root) {
    try {
      const raw = localStorage.getItem(STORAGE_POS_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (Number.isFinite(pos?.left) && Number.isFinite(pos?.top)) {
        const maxLeft = Math.max(12, window.innerWidth - 280);
        const maxTop = Math.max(12, window.innerHeight - 120);
        root.style.left = `${Math.clamp(pos.left, 8, maxLeft)}px`;
        root.style.top = `${Math.clamp(pos.top, 8, maxTop)}px`;
        root.style.right = "auto";
        root.style.bottom = "auto";
      }
    } catch {
      // Ignore malformed stored coordinates
    }
  }

  static async render() {
    if (!game?.ready && !canvas?.ready) return;
    const enabled = game.settings.get(MODULE_ID, "showVitalsHud");
    const root = this._ensureRoot();

    const targets = enabled ? getTargetActorsForHud() : [];
    if (!targets.length) {
      root.innerHTML = "";
      return;
    }

    const primary = targets[0];
    const pv = primary.actor.system.attributes.pv || { value: 0, max: 1, temp: 0 };
    const pm = primary.actor.system.attributes.pm || { value: 0, max: 0, temp: 0 };
    const pvMax = Math.max(1, Number(pv.max) || 1);
    const pmMax = Math.max(1, Number(pm.max) || 1);

    const html = await foundry.applications.handlebars.renderTemplate(HUD_TEMPLATE, {
      visible: true,
      collapsed: this._collapsed,
      isGM: Boolean(game.user?.isGM),
      name: primary.token?.name || primary.actor.name,
      img: primary.token?.document?.texture?.src || primary.actor.img,
      multiCount: targets.length > 1 ? targets.length - 1 : 0,
      lastPvAmount: this._lastPvAmount,
      lastPmAmount: this._lastPmAmount,
      pv: {
        value: Number(pv.value ?? 0),
        max: Number(pv.max ?? 0),
        temp: Number(pv.temp ?? 0),
        pct: Math.clamp((Number(pv.value ?? 0) / pvMax) * 100, 0, 100).toFixed(1)
      },
      pm: {
        value: Number(pm.value ?? 0),
        max: Number(pm.max ?? 0),
        temp: Number(pm.temp ?? 0),
        pct: Number(pm.max ?? 0) > 0
          ? Math.clamp((Number(pm.value ?? 0) / pmMax) * 100, 0, 100).toFixed(1)
          : 0
      }
    });

    root.innerHTML = html;
    this._bindHudEvents(root, targets.map((t) => t.actor));
  }

  static _bindHudEvents(root, actors) {
    const pvInput = root.querySelector('[data-vital-input="pv"]');
    const pmInput = root.querySelector('[data-vital-input="pm"]');

    const readAmount = (inputEl, fallback) => {
      const val = Math.max(0, Math.floor(Number(inputEl?.value ?? fallback) || 0));
      return val;
    };

    pvInput?.addEventListener("change", () => {
      this._lastPvAmount = readAmount(pvInput, this._lastPvAmount);
    });
    pmInput?.addEventListener("change", () => {
      this._lastPmAmount = readAmount(pmInput, this._lastPmAmount);
    });

    root.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const action = btn.dataset.action;

        if (action === "toggle-collapse") {
          this._collapsed = !this._collapsed;
          localStorage.setItem(STORAGE_COLLAPSE_KEY, this._collapsed ? "1" : "0");
          return this.render();
        }
        if (action === "sync-bars") {
          return this.syncAllTokenBars({ notify: true });
        }
        if (action === "delta-pv") {
          const delta = Number(btn.dataset.delta || 0);
          for (const actor of actors) await applyPvDelta(actor, delta);
          return;
        }
        if (action === "delta-pm") {
          const delta = Number(btn.dataset.delta || 0);
          for (const actor of actors) await applyPmDelta(actor, delta);
          return;
        }
        if (action === "apply-damage-rd" || action === "apply-damage-raw" || action === "apply-heal" || action === "add-pv-temp") {
          const amount = readAmount(pvInput, this._lastPvAmount);
          this._lastPvAmount = amount;
          if (!amount) return;
          for (const actor of actors) {
            if (action === "apply-damage-rd") await actor.applyDamage(amount, 1, true);
            else if (action === "apply-damage-raw") await actor.applyDamage(amount, 1, false);
            else if (action === "apply-heal") await actor.applyDamage(-amount, 1, false);
            else if (action === "add-pv-temp") await applyTempVital(actor, "pv", amount);
          }
          return;
        }
        if (action === "spend-pm" || action === "recover-pm") {
          const amount = readAmount(pmInput, this._lastPmAmount);
          this._lastPmAmount = amount;
          if (!amount) return;
          for (const actor of actors) {
            await applyPmDelta(actor, action === "spend-pm" ? -amount : amount);
          }
        }
      });
    });

    const dragHandle = root.querySelector("[data-drag-handle]");
    if (dragHandle) {
      dragHandle.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("button")) return;
        ev.preventDefault();
        const rect = root.getBoundingClientRect();
        const offsetX = ev.clientX - rect.left;
        const offsetY = ev.clientY - rect.top;

        const onMove = (moveEv) => {
          const left = Math.clamp(moveEv.clientX - offsetX, 8, window.innerWidth - rect.width - 8);
          const top = Math.clamp(moveEv.clientY - offsetY, 8, window.innerHeight - rect.height - 8);
          root.style.left = `${left}px`;
          root.style.top = `${top}px`;
          root.style.right = "auto";
          root.style.bottom = "auto";
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          const finalRect = root.getBoundingClientRect();
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify({
            left: Math.round(finalRect.left),
            top: Math.round(finalRect.top)
          }));
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }
  }
}
