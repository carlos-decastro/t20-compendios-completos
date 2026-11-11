const MODULE_ID = "t20-compendios-completos";

const SCALE_PRESETS = {
  weak: {
    label: "Fraco (-1 ND)",
    ndDelta: -1,
    pvMult: 0.75,
    changes: [
      { key: "system.attributes.defesa.bonus", mode: 2, value: "-2" },
      { key: "system.modificadores.pericias.ataque", mode: 2, value: "-2" },
      { key: "system.modificadores.pericias.resistencia", mode: 2, value: "-2" },
      { key: "system.modificadores.dano.geral", mode: 2, value: "-2" }
    ]
  },
  normal: {
    label: "Padrão",
    ndDelta: 0,
    pvMult: 1,
    changes: []
  },
  elite: {
    label: "Elite (+1 ND)",
    ndDelta: 1,
    pvMult: 1.35,
    changes: [
      { key: "system.attributes.defesa.bonus", mode: 2, value: "2" },
      { key: "system.modificadores.pericias.ataque", mode: 2, value: "2" },
      { key: "system.modificadores.pericias.resistencia", mode: 2, value: "2" },
      { key: "system.modificadores.dano.geral", mode: 2, value: "2" }
    ]
  },
  boss: {
    label: "Chefe (PV ×2)",
    ndDelta: 2,
    pvMult: 2,
    changes: [
      { key: "system.attributes.defesa.bonus", mode: 2, value: "2" },
      { key: "system.modificadores.pericias.ataque", mode: 2, value: "3" },
      { key: "system.modificadores.pericias.resistencia", mode: 2, value: "2" },
      { key: "system.modificadores.dano.geral", mode: 2, value: "4" }
    ]
  }
};

function stepNd(baseNdRaw, delta) {
  const ladder = ["1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "S"];
  const s = String(baseNdRaw ?? "1").trim().toUpperCase();
  const idx = ladder.indexOf(s);
  if (idx !== -1) {
    const nextIdx = Math.max(0, Math.min(ladder.length - 1, idx + delta));
    return ladder[nextIdx];
  }
  const num = Number(s);
  if (Number.isFinite(num)) {
    return String(Math.max(1, num + delta));
  }
  return s;
}

/**
 * Applies Weak / Normal / Elite / Boss scaling cleanly on an NPC Actor.
 */
export async function applyNpcScale(actor, scaleKey) {
  if (!actor || actor.type !== "npc") return;
  const preset = SCALE_PRESETS[scaleKey];
  if (!preset) return;

  // Persist original baseline stats once
  let base = actor.getFlag(MODULE_ID, "npcScaleBase");
  if (!base) {
    base = {
      pvMax: Number(actor.system?.attributes?.pv?.max ?? 10),
      nd: String(actor.system?.attributes?.nd ?? "1")
    };
    await actor.setFlag(MODULE_ID, "npcScaleBase", base);
  }

  // Remove any prior scaler effect
  const existingFx = actor.effects.filter((e) => e.getFlag(MODULE_ID, "npcScaleEffect"));
  if (existingFx.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", existingFx.map((e) => e.id));
  }

  const newPvMax = Math.max(1, Math.round(base.pvMax * preset.pvMult));
  const curPv = Number(actor.system?.attributes?.pv?.value ?? newPvMax);
  const oldMax = Math.max(1, Number(actor.system?.attributes?.pv?.max ?? newPvMax));
  const pvRatio = Math.min(1, Math.max(0, curPv / oldMax));
  const newPvVal = scaleKey === "normal" ? Math.min(newPvMax, curPv) : Math.max(1, Math.round(newPvMax * pvRatio));
  const newNd = stepNd(base.nd, preset.ndDelta);

  await actor.update({
    "system.attributes.pv.max": newPvMax,
    "system.attributes.pv.value": newPvVal,
    "system.attributes.nd": newNd,
    [`flags.${MODULE_ID}.npcScaleMode`]: scaleKey
  });

  if (preset.changes.length) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `[Escala T20] ${preset.label}`,
      img: scaleKey === "weak" ? "icons/svg/downgrade.svg" : "icons/svg/upgrade.svg",
      changes: preset.changes,
      disabled: false,
      flags: {
        [MODULE_ID]: { npcScaleEffect: true }
      }
    }]);
  }

  ui.notifications.info(`${actor.name}: ajustado para "${preset.label}" (ND ${newNd}, PV ${newPvMax}).`);
}

/**
 * Registers the PF2e-style Weak / Normal / Elite / Boss toolbar on NPC sheets.
 */
export function initNpcScaler() {
  const injectScaler = (app, html) => {
    const actor = app?.actor;
    if (!actor || actor.type !== "npc" || (!game.user.isGM && !actor.isOwner)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".t20pf2e-npc-scaler")) return;

    const currentScale = actor.getFlag(MODULE_ID, "npcScaleMode") || "normal";
    const bar = document.createElement("div");
    bar.className = "t20pf2e-npc-scaler";
    bar.innerHTML = `
      <span class="t20pf2e-scaler-title"><i class="fa-solid fa-scale-balanced"></i> Escala rápida:</span>
      ${Object.entries(SCALE_PRESETS)
        .map(
          ([k, p]) => `
        <button type="button" class="t20pf2e-scale-btn ${currentScale === k ? "active" : ""}" data-scale="${k}">
          ${p.label}
        </button>`
        )
        .join("")}`;

    bar.querySelectorAll("[data-scale]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await applyNpcScale(actor, btn.dataset.scale);
      });
    });

    const statblockTab = root.querySelector(".tab.statblock");
    if (statblockTab) {
      statblockTab.prepend(bar);
      return;
    }

    const target = root.querySelector(".sheet-header") || root.querySelector("header") || root.querySelector("form") || root;
    if (target) target.prepend(bar);
  };

  Hooks.on("renderActorSheetT20NPC", injectScaler);
  Hooks.on("renderActorSheet", injectScaler);
}

