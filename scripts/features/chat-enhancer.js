import { buildRollMetadataSnapshot } from "./roll-metadata.js";

const MODULE_ID = "t20-compendios-completos";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTraitsStripHtml(traitsObj, extraClass = "") {
  if (!traitsObj?.primary) return "";
  const itemsHtml = (traitsObj.items || [])
    .map((label) => `<span class="t20pf2e-trait">${escapeHtml(label)}</span>`)
    .join("");
  const sep = itemsHtml ? `<span class="t20pf2e-trait-sep" aria-hidden="true">|</span>` : "";
  return `
    <div class="t20pf2e-chat-traits ${extraClass}">
      <span class="t20pf2e-trait is-primary">${escapeHtml(traitsObj.primary)}</span>
      ${sep}${itemsHtml}
    </div>`;
}

function buildModifiersHtml(modifiers) {
  if (!Array.isArray(modifiers) || !modifiers.length) return "";
  const pills = modifiers
    .map((m) => {
      const toneClass = m.tone ? ` is-${escapeHtml(m.tone)}` : "";
      return `<span class="t20pf2e-mod-pill${toneClass}">${escapeHtml(m.label)} <strong>${escapeHtml(m.display)}</strong></span>`;
    })
    .join("");
  return `<div class="t20pf2e-chat-modifiers">${pills}</div>`;
}

function decorateChatMessageHeader(message, root) {
  root.classList.add("t20pf2e-chat-card");
  const senderEl = root.querySelector(".message-header .message-sender");
  if (!senderEl || senderEl.querySelector(".t20pf2e-chat-avatar")) return;

  const speakerActor =
    ChatMessage.getSpeakerActor?.(message.speaker) ||
    game.actors?.get?.(message.speaker?.actor) ||
    null;
  const imgSrc = speakerActor?.img || message.author?.avatar || "";
  if (!imgSrc) return;

  const avatar = document.createElement("img");
  avatar.className = "t20pf2e-chat-avatar";
  avatar.src = imgSrc;
  avatar.alt = "";
  senderEl.prepend(avatar);
}

function renderPf2eRollMetadata(message, root) {
  const rollMeta = message?.getFlag?.(MODULE_ID, "rollMeta");
  if (!rollMeta) return;

  if (rollMeta.cardTraits && !root.querySelector(".t20pf2e-chat-traits:not(.is-subroll)")) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildTraitsStripHtml(rollMeta.cardTraits, "is-card-header");
    const traitsEl = wrapper.firstElementChild;
    const cardHeader = root.querySelector(".tormenta20.chat-card > .card-header");
    const chatCard = root.querySelector(".tormenta20.chat-card");
    const msgContent = root.querySelector(".message-content") || root;

    if (cardHeader) {
      cardHeader.after(traitsEl);
    } else if (chatCard) {
      chatCard.prepend(traitsEl);
    } else {
      msgContent.prepend(traitsEl);
    }
  }

  const rollEntries = Array.isArray(rollMeta.rolls) ? rollMeta.rolls : [];
  if (!rollEntries.length) return;

  const rollContainers = root.querySelectorAll(".tormenta20.chat-card > div.roll, .tormenta20.chat-card div.roll");
  const targets = rollContainers.length
    ? [...rollContainers]
    : [...root.querySelectorAll(":scope > .dice-roll, .message-content > .dice-roll")];

  targets.forEach((container, idx) => {
    const entry = rollEntries[idx];
    if (!entry) return;

    const diceRoll = container.classList.contains("dice-roll")
      ? container
      : container.querySelector(".dice-roll") || container;
    const formulaEl = diceRoll.querySelector(".dice-formula");

    const showSubTraits =
      entry.traits?.primary &&
      (idx > 0 || entry.traits.primary !== rollMeta.cardTraits?.primary) &&
      !container.querySelector(".t20pf2e-chat-traits.is-subroll");

    if (showSubTraits) {
      const subWrap = document.createElement("div");
      subWrap.innerHTML = buildTraitsStripHtml(entry.traits, "is-subroll");
      if (formulaEl) formulaEl.before(subWrap.firstElementChild);
      else diceRoll.prepend(subWrap.firstElementChild);
    }

    if (entry.modifiers?.length && !diceRoll.querySelector(".t20pf2e-chat-modifiers")) {
      const modWrap = document.createElement("div");
      modWrap.innerHTML = buildModifiersHtml(entry.modifiers);
      if (formulaEl) formulaEl.before(modWrap.firstElementChild);
      else diceRoll.prepend(modWrap.firstElementChild);
    }
  });
}

/**
 * Smart Chat Cards (Arton Ledger):
 * - Captures current targeted tokens on attack/d20 rolls into message flags.
 * - Renders Hit / Crit / Miss outcome pills against Target Defense without duplicating T20's native Apply Damage buttons.
 */
export function initChatEnhancer() {
  // Fix Tormenta20's "Mostrar no Chat" (T20.DisplayCard) context menu action which crashes when options.onUseEffects is undefined
  Hooks.on("tormenta20.getItemToggleContextOptions", (item, menuItems) => {
    if (!Array.isArray(menuItems)) return;
    const displayEntry = menuItems.find((e) => e?.name === "T20.DisplayCard");
    if (!displayEntry) return;

    const safeShowInChat = async () => {
      if (!item) return;
      try {
        const msg = await item.displayCard({
          options: {
            itemId: item.id,
            onUseEffects: [],
            effects: [],
            template: item.hasAreaTarget
              ? { area: item.system?.area, alcance: item.system?.alcance }
              : undefined
          }
        });
        if (msg?.setFlag) {
          await msg.setFlag(MODULE_ID, "expandedCard", true).catch(() => {});
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | Fallback ao mostrar item no chat:`, err);
        const rawDesc = item.system?.description?.value || "";
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: item.actor }),
          content: `
            <div class="tormenta20 chat-card item-card">
              <header class="card-header flexrow">
                ${item.img ? `<img src="${escapeHtml(item.img)}" width="36" height="36" style="flex:0" />` : ""}
                <h3 class="item-name"><div>${escapeHtml(item.name)}</div></h3>
              </header>
              <div class="card-content">${rawDesc || "<em>Sem descrição cadastrada.</em>"}</div>
            </div>`
        });
      }
    };

    displayEntry.onClick = () => {
      safeShowInChat();
    };
    displayEntry.callback = () => {
      safeShowInChat();
    };
  });

  Hooks.on("preCreateChatMessage", (message) => {
    const updates = {};

    const targets = Array.from(game.user?.targets || []);
    const hasD20 = Boolean(message.rolls?.some((r) => r.dice?.[0]?.faces === 20));
    if (targets.length && hasD20) {
      const snapshot = targets
        .map((token) => {
          const actor = token.actor;
          if (!actor) return null;
          return {
            name: token.name || actor.name,
            defense: Number(actor.system?.attributes?.defesa?.value ?? 10)
          };
        })
        .filter(Boolean);

      if (snapshot.length) {
        updates[`flags.${MODULE_ID}.targets`] = snapshot;
      }
    }

    if (!message.getFlag?.(MODULE_ID, "rollMeta")) {
      const speakerActor =
        ChatMessage.getSpeakerActor?.(message.speaker) ||
        game.actors?.get(message.speaker?.actor) ||
        null;
      const itemId = String(message.content || "").match(/data-item-id=["']([^"']+)["']/i)?.[1] || "";
      const liveItem = itemId && speakerActor?.items ? speakerActor.items.get(itemId) || null : null;

      let hasAcuidade = Boolean(speakerActor?.getFlag?.("tormenta20", "acuidade"));
      try {
        if (!hasAcuidade && game.settings?.settings?.has?.("tormenta20.lightFinesseWeapons")) {
          hasAcuidade = Boolean(game.settings.get("tormenta20", "lightFinesseWeapons"));
        }
      } catch (_err) {
        // ignore missing setting
      }

      const rollMeta = buildRollMetadataSnapshot({
        actor: speakerActor,
        item: liveItem,
        itemDataFlag: message.flags?.tormenta20?.itemData || null,
        content: message.content || "",
        flavor: message.flavor || "",
        rolls: message.rolls || [],
        hasAcuidade,
        hasPotentThrow: Boolean(speakerActor?.getFlag?.("tormenta20", "arremessoPotente"))
      });

      if (rollMeta) {
        updates[`flags.${MODULE_ID}.rollMeta`] = rollMeta;
      }
    }

    if (Object.keys(updates).length) {
      message.updateSource(updates);
    }
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    decorateChatMessageHeader(message, root);
    if (!message.isContentVisible) return;

    if (message.getFlag(MODULE_ID, "expandedCard")) {
      const cardContent = root.querySelector(".card-content");
      if (cardContent && cardContent.textContent.trim()) {
        cardContent.style.display = "";
      }
    }

    renderPf2eRollMetadata(message, root);

    const targets = message.getFlag(MODULE_ID, "targets");
    if (!Array.isArray(targets) || !targets.length) return;
    if (root.querySelector(".t20pf2e-target-outcomes")) return;

    // Locate first d20 roll (prefer explicit attack rolls; skip pure damage cards)
    const d20Roll =
      message.rolls.find((r) => r.options?.type === "attack" && r.dice?.[0]?.faces === 20) ||
      message.rolls.find((r) => r.dice?.[0]?.faces === 20);
    if (!d20Roll) return;

    const evalResult = evaluateAttackAgainstTargets(message);
    if (!evalResult) return;

    const canSeeDefense =
      game.user.isGM ||
      Boolean(game.settings.get("tormenta20", "showFoeDc"));

    const pills = evalResult.targets
      .map((t) => {
        const defHint = canSeeDefense ? ` <small>(DEF ${t.defense})</small>` : "";
        return `
          <div class="t20pf2e-outcome-row ${t.status}">
            <span class="t20pf2e-outcome-target"><i class="fa-solid fa-crosshairs"></i> ${escapeHtml(t.name)}${defHint}</span>
            <span class="t20pf2e-outcome-badge"><i class="fa-solid ${t.icon}"></i> ${t.label}</span>
          </div>`;
      })
      .join("");

    const box = document.createElement("div");
    box.className = "t20pf2e-target-outcomes";
    box.innerHTML = pills;

    const anchor =
      root.querySelector(".roll:not(.roll--dano)") ||
      root.querySelector(".dice-roll") ||
      root.querySelector(".message-content");
    if (anchor) {
      anchor.after(box);
    }

    const damageAnchor = root.querySelector(".roll--dano");
    if (damageAnchor && evalResult.isThreat && !root.querySelector(".t20pf2e-crit-note")) {
      const note = document.createElement("div");
      const unconfirmedCrit = evalResult.targets.length > 0 && evalResult.hitTargets.length === 0;
      note.className = `t20pf2e-crit-note ${unconfirmedCrit ? "is-unconfirmed" : "is-confirmed"}`;
      note.innerHTML = unconfirmedCrit
        ? `<i class="fa-solid fa-triangle-exclamation"></i> Ameaça (${evalResult.natural}) errou a Defesa — crítico não confirmado (sem dano).`
        : `<i class="fa-solid fa-burst"></i> Crítico ×${evalResult.critMult} aplicado nos dados da arma (bônus fixos não multiplicam).`;
      damageAnchor.after(note);
    }
  });
}

export function evaluateAttackAgainstTargets(message) {
  const d20Roll = Array.isArray(message?.rolls)
    ? message.rolls.find((r) => r.dice?.[0]?.faces === 20)
    : null;
  if (!d20Roll) return null;

  const d20 = d20Roll.dice[0];
  const natural = Number(d20.total ?? d20.results?.[0]?.result ?? 0);
  const critThreshold = Number(d20.options?.critical || 20);
  const fumbleThreshold = Number(d20.options?.fumble || 1);
  const total = Number(d20Roll.total ?? 0);
  const itemData = message?.flags?.tormenta20?.itemData || {};
  const critMult = Math.max(2, Number(itemData.criticoX || 2));
  const targets = message?.getFlag?.(MODULE_ID, "targets");
  const targetUuids = message?.getFlag?.(MODULE_ID, "targetTokenUuids") || [];

  const evaluatedTargets = Array.isArray(targets)
    ? targets.map((t, index) => {
        const def = Number(t.defense ?? 10);
        let status = "miss";
        let label = "Errou";
        let icon = "fa-xmark";

        if (natural === 20 || (natural >= critThreshold && total >= def)) {
          status = "crit";
          label = `Crítico (×${critMult})!`;
          icon = "fa-burst";
        } else if (natural <= fumbleThreshold) {
          status = "fumble";
          label = "Falha Crítica";
          icon = "fa-skull";
        } else if (total >= def) {
          status = "hit";
          label = "Acertou";
          icon = "fa-bullseye";
        }

        const isHit = status === "hit" || status === "crit";
        return {
          index,
          uuid: t.uuid || targetUuids[index] || null,
          name: t.name,
          defense: def,
          status,
          label,
          icon,
          isHit
        };
      })
    : [];

  return {
    natural,
    critThreshold,
    fumbleThreshold,
    total,
    critMult,
    isThreat: natural >= critThreshold,
    targets: evaluatedTargets,
    hitTargets: evaluatedTargets.filter((t) => t.isHit),
    missTargets: evaluatedTargets.filter((t) => !t.isHit)
  };
}

