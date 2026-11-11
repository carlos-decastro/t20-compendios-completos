import { SKILL_LABELS_PT } from "../automation/skill-parser.js";

const MODULE_ID = "t20-compendios-completos";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAllSkillChoices() {
  const keys = Object.keys(CONFIG.T20?.pericias || SKILL_LABELS_PT);
  return keys
    .map((key) => ({
      key,
      label: CONFIG.T20?.pericias?.[key]?.label
        ? game.i18n.localize(CONFIG.T20.pericias[key].label)
        : (SKILL_LABELS_PT[key] || key)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * Opens a PF2e-style Check Prompt modal for GMs to send clickable skill/save roll requests to Chat.
 */
export async function openCheckPromptDialog() {
  const skills = getAllSkillChoices();
  const quickButtons = [
    { key: "fort", label: "Fortitude" },
    { key: "refl", label: "Reflexos" },
    { key: "vont", label: "Vontade" },
    { key: "perc", label: "Percepção" },
    { key: "inic", label: "Iniciativa" }
  ];

  const optionsHtml = skills
    .map(
      (s) =>
        `<option value="${escapeHtml(s.key)}" ${s.key === "perc" ? "selected" : ""}>${escapeHtml(s.label)}</option>`
    )
    .join("");

  const quickHtml = quickButtons
    .map(
      (q) =>
        `<button type="button" class="t20pf2e-mini-btn" data-pick-skill="${escapeHtml(q.key)}">${escapeHtml(q.label)}</button>`
    )
    .join("");

  const payload = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: "Pedir Teste / Salvaguarda (Estilo PF2e)", icon: "fa-solid fa-dice-d20" },
    position: { width: 460 },
    content: `
      <form class="t20pf2e-dialog">
        <div class="t20pf2e-section">
          <strong>Atalhos Rápidos:</strong>
          <div class="t20pf2e-pill-row">${quickHtml}</div>
        </div>
        <div class="t20pf2e-section">
          <div class="t20pf2e-form-row">
            <label>Perícia ou Resistência:</label>
            <select name="skillKey">${optionsHtml}</select>
          </div>
          <div class="t20pf2e-form-row">
            <label>CD (Opcional):</label>
            <input type="number" name="dc" min="1" max="99" placeholder="Ex: 18" />
          </div>
          <div class="t20pf2e-form-row">
            <label>Descrição / Motivo:</label>
            <input type="text" name="reason" placeholder="Ex: Evitar armadilha ou detectar emboscada" />
          </div>
        </div>
      </form>`,
    render: (_ev, dialog) => {
      const sel = dialog.element.querySelector('select[name="skillKey"]');
      dialog.element.querySelectorAll("[data-pick-skill]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (sel) sel.value = btn.dataset.pickSkill;
        });
      });
    },
    buttons: [
      {
        action: "send",
        label: "Enviar Pedido no Chat",
        default: true,
        callback: (_ev, btn) => {
          const skillKey = btn.form.querySelector('select[name="skillKey"]')?.value || "perc";
          const dcRaw = btn.form.querySelector('input[name="dc"]')?.value;
          const reason = btn.form.querySelector('input[name="reason"]')?.value?.trim() || "";
          return {
            skillKey,
            dc: dcRaw ? Number(dcRaw) : null,
            reason
          };
        }
      }
    ],
    rejectClose: false
  });

  if (!payload) return null;

  const skillLabel =
    skills.find((s) => s.key === payload.skillKey)?.label || payload.skillKey.toUpperCase();
  const dcBadge = Number.isFinite(payload.dc) ? ` (CD ${payload.dc})` : "";

  const html = `
    <div class="t20pf2e-check-prompt-card">
      <div class="t20pf2e-cp-title">
        <i class="fa-solid fa-dice-d20"></i>
        <span>Teste Solicitado: <strong>${escapeHtml(skillLabel)}${dcBadge}</strong></span>
      </div>
      ${payload.reason ? `<p class="t20pf2e-cp-reason">${escapeHtml(payload.reason)}</p>` : ""}
      <button type="button"
              class="t20pf2e-roll-check-btn"
              data-t20-check="${escapeHtml(payload.skillKey)}"
              ${Number.isFinite(payload.dc) ? `data-t20-dc="${payload.dc}"` : ""}>
        <i class="fa-solid fa-dice-d20"></i> Rolar ${escapeHtml(skillLabel)}${dcBadge}
      </button>
    </div>`;

  return ChatMessage.create({
    user: game.user.id,
    content: html,
    flags: {
      [MODULE_ID]: {
        checkPrompt: payload
      }
    }
  });
}

/**
 * Registers `@Check[skill|cd:18|label:...]` enricher for Journals and Item descriptions,
 * and adds a "Pedir Teste (CD)" button in Chat controls for GMs.
 */
export function registerCheckPromptAndEnricher() {
  CONFIG.TextEditor.enrichers.push({
    pattern: /@Check\[([^\]]+)\]/gi,
    enricher: async (match) => {
      const parts = match[1].split("|").map((s) => s.trim());
      const skillKey = parts[0]?.toLowerCase() || "perc";
      let dc = null;
      let label = null;
      for (const p of parts.slice(1)) {
        const [k, ...rest] = p.split(":");
        const val = rest.join(":").trim();
        if (k?.toLowerCase() === "cd" || k?.toLowerCase() === "dc") dc = Number(val) || null;
        if (k?.toLowerCase() === "label") label = val;
      }

      const skillName = CONFIG.T20?.pericias?.[skillKey]?.label
        ? game.i18n.localize(CONFIG.T20.pericias[skillKey].label)
        : (SKILL_LABELS_PT[skillKey] || skillKey);

      const btn = document.createElement("a");
      btn.className = "t20pf2e-inline-check";
      btn.dataset.t20Check = skillKey;
      if (dc) btn.dataset.t20Dc = String(dc);
      btn.innerHTML = `<i class="fa-solid fa-dice-d20"></i> ${label || skillName}${dc ? ` CD ${dc}` : ""}`;
      return btn;
    }
  });

  // Wire global inline @Check clicks in journals/items
  document.addEventListener("click", async (ev) => {
    const trigger = ev.target.closest("[data-t20-check]");
    if (!trigger) return;
    ev.preventDefault();
    const skillKey = trigger.dataset.t20Check;
    const dc = trigger.dataset.t20Dc ? Number(trigger.dataset.t20Dc) : null;
    await rollCheckForActiveActors(skillKey, dc, ev);
  });

  Hooks.on("renderChatInput", (_app, elements) => {
    if (!game.user.isGM) return;
    const chatControls = elements?.["#chat-controls"];
    if (!chatControls) return;
    const controls = chatControls.querySelector(".control-buttons") || chatControls;
    if (!controls || controls.querySelector(".t20pf2e-prompt-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ui-control icon fa-solid fa-dice-d20 t20pf2e-prompt-btn";
    btn.dataset.tooltip = "";
    btn.setAttribute("aria-label", "Pedir Teste / Salvaguarda aos Jogadores (GM)");
    btn.title = "Pedir Teste / Salvaguarda aos Jogadores (GM)";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      openCheckPromptDialog();
    });
    controls.prepend(btn);
  });

  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenTools = controls?.tokens?.tools;
    if (!tokenTools || tokenTools.t20CheckPrompt) return;
    tokenTools.t20CheckPrompt = {
      name: "t20CheckPrompt",
      order: 92,
      title: "Pedir Teste aos Jogadores (CD)",
      icon: "fa-solid fa-dice-d20",
      visible: game.user.isGM,
      button: true,
      onChange: () => openCheckPromptDialog()
    };
  });
}

function extractRollResult(result) {
  if (!result) return { total: null, d20: null };
  const rollObj = Array.isArray(result.rolls)
    ? result.rolls[0]
    : (typeof result.total === "number" ? result : null);
  const rawTotal = Number.isFinite(rollObj?.total)
    ? rollObj.total
    : result.flags?.tormenta20?.rollTotal;
  const total = rawTotal !== undefined && rawTotal !== null && Number.isFinite(Number(rawTotal))
    ? Number(rawTotal)
    : null;
  const d20Face = rollObj?.dice?.[0]?.total ?? null;
  return { total, d20: Number.isFinite(d20Face) ? d20Face : null };
}

/**
 * Rolls the requested skill on controlled tokens (or the user's assigned character)
 * and evaluates Pass/Fail if a DC was provided.
 */
export async function rollCheckForActiveActors(skillKey, dc = null, event = null) {
  const controlledActors = (canvas?.tokens?.controlled || []).map((t) => t.actor).filter(Boolean);
  const actors = controlledActors.length
    ? controlledActors
    : (game.user.character ? [game.user.character] : []);

  if (!actors.length) {
    ui.notifications.warn("Selecione um token no mapa ou associe um personagem ao seu usuário.");
    return;
  }

  for (const actor of actors) {
    if (!actor.system?.pericias?.[skillKey]) {
      ui.notifications.warn(`${actor.name} não possui a perícia "${skillKey}".`);
      continue;
    }

    const result = await actor.rollPericia(skillKey, { event, message: true });
    if (!result) continue;

    const { total, d20 } = extractRollResult(result);
    if (Number.isFinite(dc) && total !== null) {
      const passed = total >= dc;
      const diff = total - dc;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const rawLabel = actor.system.pericias[skillKey]?.label;
      const skillName = rawLabel
        ? game.i18n.localize(rawLabel)
        : (SKILL_LABELS_PT[skillKey] || skillKey);
      const natLabel = d20 === 20 ? " • 20 natural!" : d20 === 1 ? " • 1 natural!" : "";
      const iconCls = passed ? "fa-circle-check" : "fa-circle-xmark";
      const statusText = passed ? "Sucesso!" : "Falha!";

      const msgData = {
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="t20pf2e-dc-outcome ${passed ? "success" : "failure"}">
          <i class="fa-solid ${iconCls}"></i>
          <span>
            <strong>${escapeHtml(actor.name)}</strong> (${escapeHtml(skillName)}):
            <strong>${total}</strong> vs <strong>CD ${dc}</strong> (${diffStr}) —
            <strong>${statusText}</strong>${escapeHtml(natLabel)}
          </span>
        </div>`
      };
      if (Array.isArray(result.whisper) && result.whisper.length) msgData.whisper = result.whisper;
      if (result.blind) msgData.blind = true;

      await ChatMessage.create(msgData);
    }
  }
}

