const TURN_CONDITIONS = {
  sangrando: {
    label: "Sangrando",
    alert: "Perde <strong>1d6 PV</strong> no início do turno se falhar em Constituição CD 15.",
    damageFormula: "1d6",
    checkHtml: "@Check[con|cd:15|label:Estancar Sangramento]"
  },
  "em-chamas": {
    label: "Em Chamas",
    alert: "Sofre <strong>1d6 de dano de fogo</strong> no início do turno (Ação Padrão ou água apaga).",
    damageFormula: "1d6"
  },
  queimando: {
    label: "Em Chamas",
    alert: "Sofre <strong>1d6 de dano de fogo</strong> no início do turno.",
    damageFormula: "1d6"
  },
  envenenado: {
    label: "Envenenado",
    alert: "Verifique a duração/efeito contínuo do veneno ativo neste turno."
  },
  sustentando: {
    label: "Sustentando Efeito",
    alert: "Lembre-se de pagar <strong>1 PM</strong> para manter efeitos sustentados neste turno."
  },
  atordoado: {
    label: "Atordoado",
    alert: "Fica <strong>Desprevenido</strong> e <strong>não pode realizar ações</strong> neste turno."
  },
  pasmo: {
    label: "Pasmo",
    alert: "<strong>Não pode fazer ações</strong> neste turno (exceto reações)."
  },
  agarrado: {
    label: "Agarrado",
    alert: "Imóvel, −2 em ataques, só pode atacar com armas leves."
  },
  abalado: {
    label: "Abalado",
    alert: "Sofre −2 em testes de perícia enquanto abalado."
  },
  caido: {
    label: "Caído",
    alert: "−5 em ataque corpo a corpo e −5 Defesa contra corpo a corpo (+5 vs distância). Levantar exige Ação de Movimento."
  }
};

let _lastTurnAlertKey = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Enhances Foundry Combat Tracker with:
 * - Active condition badges & HP state indicator per combatant row
 * - Automatic Turn-Start Reminders for ongoing T20 conditions (Sangrando, Em Chamas, Sustentar, etc.)
 * - Clickable ongoing damage buttons right on the chat alert card
 */
export function initCombatEnhancer() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const combat = app?.viewed;
    if (!root || !combat) return;

    root.querySelectorAll("li.combatant").forEach((li) => {
      const combatant = combat.combatants?.get(li.dataset.combatantId);
      const actor = combatant?.actor;
      if (!actor) return;

      // Remove prior injected badges before re-adding cleanly
      li.querySelector(".t20pf2e-ct-strip")?.remove();

      const strip = document.createElement("div");
      strip.className = "t20pf2e-ct-strip";

      // Health state tag for GMs
      if (game.user.isGM) {
        const pv = actor.system?.attributes?.pv;
        if (pv && pv.max > 0) {
          const pct = Math.round((Math.max(0, Number(pv.value || 0)) / Number(pv.max)) * 100);
          let cls = "healthy";
          let txt = `${pv.value}/${pv.max} PV`;
          if (pct <= 0) {
            cls = "down";
            txt = `${pv.value}/${pv.max}`;
          } else if (pct <= 25) {
            cls = "crit";
          } else if (pct <= 50) {
            cls = "bloodied";
          }
          const hpTag = document.createElement("span");
          hpTag.className = `t20pf2e-ct-hp ${cls}`;
          hpTag.textContent = txt;
          strip.appendChild(hpTag);
        }
      }

      // Active condition icons
      const activeEffects = (actor.effects || []).filter((e) => !e.disabled);
      for (const ef of activeEffects.slice(0, 6)) {
        const img = document.createElement("img");
        img.className = "t20pf2e-ct-icon";
        img.src = ef.img || "icons/svg/aura.svg";
        img.title = ef.name;
        img.alt = ef.name;
        img.addEventListener("click", (ev) => {
          ev.stopPropagation();
          ef.sheet?.render(true);
        });
        strip.appendChild(img);
      }

      if (strip.childElementCount > 0) {
        const nameBlock = li.querySelector(".token-name") || li;
        nameBlock.appendChild(strip);
      }
    });
  });

  // Turn start alerts (active GM triggers once per round+turn+combatant)
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!game.user.isGM || !game.user.isActiveGM) return;
    if (!combat?.started) return;
    if (changed.turn === undefined && changed.round === undefined) return;

    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!actor) return;

    const key = `${combat.id}:${combat.round}:${combat.turn}:${combatant.id}`;
    if (_lastTurnAlertKey === key) return;
    _lastTurnAlertKey = key;

    const matchedAlerts = [];
    const seenKeys = new Set();
    for (const ef of actor.effects || []) {
      if (ef.disabled) continue;
      for (const st of ef.statuses || []) {
        const cfg = TURN_CONDITIONS[st];
        if (cfg && !seenKeys.has(cfg.label)) {
          seenKeys.add(cfg.label);
          matchedAlerts.push({ status: st, ...cfg });
        }
      }
    }

    if (!matchedAlerts.length) return;

    const rowsHtml = matchedAlerts
      .map((a) => {
        const rollBtn = a.damageFormula
          ? `<button type="button" class="t20pf2e-turn-dmg-btn" data-t20-turn-dmg="${a.damageFormula}" data-actor-id="${actor.id}" data-label="${escapeHtml(a.label)}">
               <i class="fa-solid fa-fire"></i> Rolar ${a.damageFormula} (${escapeHtml(a.label)})
             </button>`
          : "";
        return `
          <div class="t20pf2e-turn-alert-row">
            <div><strong>${escapeHtml(a.label)}:</strong> ${a.alert}</div>
            ${a.checkHtml ? `<div>${a.checkHtml}</div>` : ""}
            ${rollBtn}
          </div>`;
      })
      .join("");

    const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rowsHtml, { async: true });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="t20pf2e-check-prompt-card t20pf2e-turn-card">
          <div class="t20pf2e-cp-title">
            <i class="fa-solid fa-hourglass-half"></i>
            <span>Início do Turno: <strong>${escapeHtml(actor.name)}</strong> (Rodada ${combat.round})</span>
          </div>
          ${enriched}
        </div>`
    });
  });

  // Wire ongoing damage roll buttons inside turn alert cards
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-t20-turn-dmg]");
    if (!btn) return;
    ev.preventDefault();
    const formula = btn.dataset.t20TurnDmg;
    const label = btn.dataset.label || "Dano Contínuo";
    const actor = game.actors.get(btn.dataset.actorId);
    if (!formula) return;

    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({
      speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined,
      flavor: `${label} — Dano Contínuo (${formula})`
    });

    if (actor && (actor.isOwner || game.user.isGM)) {
      const pvCur = Number(actor.system?.attributes?.pv?.value ?? 0);
      await actor.update({ "system.attributes.pv.value": pvCur - roll.total });
    }
  });
}

