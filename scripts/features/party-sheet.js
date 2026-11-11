import { openCheckPromptDialog } from "./check-prompt.js";
import { LootMerchantAppT20 } from "./loot-merchant.js";
import { SKILL_LABELS_PT } from "../automation/skill-parser.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MATRIX_SKILL_KEYS = [
  "perc",
  "inve",
  "furt",
  "atle",
  "acro",
  "sobr",
  "intu",
  "coni",
  "mist",
  "dipl",
  "inti",
  "enga",
  "ladi",
  "cura",
  "reli",
  "fort",
  "refl",
  "vont"
];

function fmtSigned(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

function getSkillMod(actor, key) {
  return Number(actor.system?.pericias?.[key]?.value ?? 0);
}

function isSkillTrained(actor, key) {
  return Boolean(actor.system?.pericias?.[key]?.treinado);
}

/**
 * Consolidated PF2e-style Party Sheet for Tormenta20.
 */
export class PartySheetT20 extends HandlebarsApplicationMixin(ApplicationV2) {
  static _instance = null;

  constructor(options = {}) {
    super(options);
    this.activeTab = options.tab || "overview";
    this.scopeMode = options.scopeMode || "auto"; // "auto" | "players" | "all"
  }

  static DEFAULT_OPTIONS = {
    id: "t20-party-sheet",
    classes: ["t20pf2e-party-sheet"],
    window: {
      title: "Ficha do Grupo (Estilo PF2e)",
      icon: "fa-solid fa-users-rectangle",
      resizable: true
    },
    position: {
      width: 820,
      height: 580
    },
    actions: {
      switchTab: PartySheetT20._onSwitchTab,
      toggleScope: PartySheetT20._onToggleScope,
      openActor: PartySheetT20._onOpenActor,
      rollSkill: PartySheetT20._onRollSkill,
      promptCheck: PartySheetT20._onPromptCheck,
      openLoot: () => LootMerchantAppT20.open(),
      distributeWealth: PartySheetT20._onDistributeWealth,
      groupRest: PartySheetT20._onGroupRest
    }
  };

  static PARTS = {
    main: {
      template: "modules/t20-compendios-completos/templates/apps/party-sheet.hbs"
    }
  };

  static init() {
    Hooks.on("renderActorDirectory", (_app, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root) return;
      const dirHeader = root.querySelector("header.directory-header");
      if (!dirHeader || dirHeader.querySelector(".t20pf2e-open-party-btn")) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "t20pf2e-open-party-btn";
      btn.innerHTML = '<i class="fa-solid fa-users-rectangle"></i> Ficha do Grupo (Party)';
      btn.addEventListener("click", () => PartySheetT20.open());

      const searchEl = dirHeader.querySelector("search");
      if (searchEl) searchEl.before(btn);
      else dirHeader.appendChild(btn);
    });

    Hooks.on("getSceneControlButtons", (controls) => {
      const tokenTools = controls?.tokens?.tools;
      if (!tokenTools || tokenTools.t20PartySheet) return;
      tokenTools.t20PartySheet = {
        name: "t20PartySheet",
        order: 91,
        title: "Ficha do Grupo (Party)",
        icon: "fa-solid fa-users-rectangle",
        button: true,
        onChange: () => PartySheetT20.open()
      };
    });

    const refreshIfOpen = (doc) => {
      const actor = doc?.documentName === "Actor" ? doc : doc?.parent;
      if (actor?.type === "character" && this._instance?.rendered) {
        this._instance.render();
      }
    };
    Hooks.on("updateActor", refreshIfOpen);
    Hooks.on("createActor", refreshIfOpen);
    Hooks.on("deleteActor", refreshIfOpen);
  }

  static open(opts = {}) {
    if (!this._instance) {
      this._instance = new this(opts);
    }
    this._instance.render({ force: true });
    return this._instance;
  }

  _onClose(options) {
    super._onClose(options);
    if (PartySheetT20._instance === this) {
      PartySheetT20._instance = null;
    }
  }

  _resolvePartyMembers() {
    const chars = game.actors.filter((a) => a.type === "character");
    const playerChars = chars.filter((a) => a.hasPlayerOwner);

    if (this.scopeMode === "players") return playerChars;
    if (this.scopeMode === "all") return chars;
    // "auto": prefer player-owned characters if at least one exists; fallback to all characters for solo GM testing
    return playerChars.length > 0 ? playerChars : chars;
  }

  async _prepareContext() {
    const actors = this._resolvePartyMembers().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const playerCount = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner).length;

    let scopeLabel = "Todos os PJs";
    if (this.scopeMode === "players" || (this.scopeMode === "auto" && playerCount > 0)) {
      scopeLabel = "Grupo (Jogadores)";
    }

    let totalTO = 0;
    let totalTP = 0;
    let totalTC = 0;

    const members = actors.map((actor) => {
      const pv = actor.system?.attributes?.pv || { value: 0, max: 1 };
      const pm = actor.system?.attributes?.pm || { value: 0, max: 0 };
      const pvMax = Math.max(1, Number(pv.max) || 1);
      const pvVal = Math.max(0, Number(pv.value) || 0);
      const pmMax = Math.max(1, Number(pm.max) || 0);
      const pmVal = Math.max(0, Number(pm.value) || 0);

      const classes = actor.items
        .filter((i) => i.type === "classe")
        .map((c) => `${c.name} ${c.system?.niveis ?? 1}`)
        .join(" / ");
      const race = actor.items.find((i) => i.type === "raca")?.name || "";
      const subtitle = [race, classes].filter(Boolean).join(" • ") || "Sem classe";

      const coins = actor.system?.dinheiro || {};
      const to = Number(coins.to || 0);
      const tp = Number(coins.tp || 0);
      const tc = Number(coins.tc || 0);
      totalTO += to;
      totalTP += tp;
      totalTC += tc;

      const coinParts = [];
      if (to) coinParts.push(`${to} TO`);
      coinParts.push(`${tp} T$`);
      if (tc) coinParts.push(`${tc} TC`);

      const walk = actor.system?.attributes?.movement?.walk;
      const speed = typeof walk === "number" ? walk : Number(walk?.value ?? walk?.base ?? 9);

      return {
        id: actor.id,
        name: actor.name,
        shortName: actor.name.split(" ")[0].slice(0, 12),
        img: actor.img || "icons/svg/mystery-man.svg",
        subtitle,
        defesa: Number(actor.system?.attributes?.defesa?.value ?? 10),
        pvValue: pvVal,
        pvMax: Number(pv.max) || 0,
        pvPct: Math.min(100, Math.round((pvVal / pvMax) * 100)),
        pmValue: pmVal,
        pmMax: Number(pm.max) || 0,
        pmPct: pm.max > 0 ? Math.min(100, Math.round((pmVal / pmMax) * 100)) : 0,
        fort: fmtSigned(getSkillMod(actor, "fort")),
        refl: fmtSigned(getSkillMod(actor, "refl")),
        vont: fmtSigned(getSkillMod(actor, "vont")),
        perc: fmtSigned(getSkillMod(actor, "perc")),
        inic: fmtSigned(getSkillMod(actor, "inic")),
        coinsText: coinParts.join(" · "),
        deslocamento: speed
      };
    });

    const skillRows = MATRIX_SKILL_KEYS.map((key) => {
      const rawLabel = CONFIG.T20?.pericias?.[key]?.label;
      const label = rawLabel ? game.i18n.localize(rawLabel) : (SKILL_LABELS_PT[key] || key);

      const mods = actors.map((a) => getSkillMod(a, key));
      const maxMod = mods.length ? Math.max(...mods) : 0;

      return {
        key,
        label,
        cells: actors.map((actor) => {
          const val = getSkillMod(actor, key);
          return {
            actorId: actor.id,
            modText: fmtSigned(val),
            trained: isSkillTrained(actor, key),
            isBest: actors.length > 1 && val === maxMod
          };
        })
      };
    });

    const wealthTotalTP = (totalTO * 10 + totalTP + totalTC * 0.1).toFixed(1).replace(/\.0$/, "");

    return {
      isGM: game.user.isGM,
      isOverview: this.activeTab === "overview",
      isSkills: this.activeTab === "skills",
      scopeLabel,
      members,
      skillRows,
      wealthSummary: `${totalTP} T$ / ${totalTO} TO / ${totalTC} TC (~${wealthTotalTP} T$)`
    };
  }

  static _onSwitchTab(_ev, target) {
    const tab = target.dataset.tab;
    if (!tab) return;
    this.activeTab = tab;
    this.render();
  }

  static _onToggleScope() {
    this.scopeMode = this.scopeMode === "players" ? "all" : "players";
    this.render();
  }

  static _onOpenActor(_ev, target) {
    const actor = game.actors.get(target.dataset.actorId);
    actor?.sheet?.render(true);
  }

  static async _onRollSkill(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    const key = target.dataset.skill;
    if (!actor || !key) return;
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(`Você não tem permissão para rolar por ${actor.name}.`);
      return;
    }
    if (typeof actor.rollPericia === "function") {
      await actor.rollPericia(key, { event, message: true });
    }
  }

  static async _onPromptCheck() {
    if (!game.user.isGM) return;
    await openCheckPromptDialog();
  }

  static async _onGroupRest() {
    if (!game.user.isGM) return;
    const actors = this._resolvePartyMembers();
    if (!actors.length) return;

    const quality = await foundry.applications.api.DialogV2.wait({
      classes: ["t20pf2e-dialog-window"],
      window: { title: "Descanso do Grupo", icon: "fa-solid fa-campground" },
      position: { width: 400 },
      content: `
        <form class="t20pf2e-dialog">
          <p>Aplicar descanso para <strong>${actors.length}</strong> personagem(ns):</p>
          <div class="t20pf2e-form-row">
            <label>Qualidade do Descanso:</label>
            <select name="modificador">
              <option value="0.5">Ruim (0,5× nível)</option>
              <option value="1" selected>Normal (1× nível)</option>
              <option value="2">Confortável (2× nível)</option>
              <option value="3">Luxuoso (3× nível)</option>
            </select>
          </div>
          <label class="t20pf2e-checkbox-inline">
            <input type="checkbox" name="clearDaily" /> Exibir detalhes individuais de descanso
          </label>
        </form>`,
      buttons: [
        {
          action: "rest",
          label: "Aplicar Descanso",
          icon: "fa-solid fa-moon",
          default: true,
          callback: (_ev, _btn, dialog) => {
            const fd = new FormData(dialog.element.querySelector("form"));
            return {
              mod: Number(fd.get("modificador") || 1),
              toChatEach: fd.get("clearDaily") === "on"
            };
          }
        },
        { action: "cancel", label: "Cancelar" }
      ]
    });

    if (!quality || typeof quality !== "object") return;

    const results = [];
    for (const actor of actors) {
      if (typeof actor.descanso === "function") {
        const beforePV = Number(actor.system?.attributes?.pv?.value ?? 0);
        const beforePM = Number(actor.system?.attributes?.pm?.value ?? 0);
        await actor.descanso(quality.mod, 0, 0, false, false, quality.toChatEach);
        const afterPV = Number(actor.system?.attributes?.pv?.value ?? 0);
        const afterPM = Number(actor.system?.attributes?.pm?.value ?? 0);
        results.push(`<li><strong>${actor.name}</strong>: +${Math.max(0, afterPV - beforePV)} PV, +${Math.max(0, afterPM - beforePM)} PM</li>`);
      }
    }

    await ChatMessage.create({
      content: `
        <div class="t20pf2e-check-prompt-card">
          <div class="t20pf2e-cp-header"><i class="fa-solid fa-campground"></i> <strong>Descanso do Grupo (${quality.mod}×)</strong></div>
          <ul style="margin: 6px 0 0; padding-left: 18px; font-size: 12px;">${results.join("")}</ul>
        </div>`,
      speaker: { alias: "Grupo — Descanso" }
    });
    this.render();
  }

  static async _onDistributeWealth() {
    if (!game.user.isGM) return;
    const actors = this._resolvePartyMembers();
    if (!actors.length) return;

    const result = await foundry.applications.api.DialogV2.wait({
      classes: ["t20pf2e-dialog-window"],
      window: { title: "Distribuir Tibares (T$)", icon: "fa-solid fa-coins" },
      position: { width: 420 },
      content: `
        <form class="t20pf2e-dialog">
          <div class="t20pf2e-form-row">
            <label>Tibares de Ouro (TO):</label>
            <input type="number" name="to" value="0" />
          </div>
          <div class="t20pf2e-form-row">
            <label>Tibares (T$ / TP):</label>
            <input type="number" name="tp" value="0" />
          </div>
          <div class="t20pf2e-form-row">
            <label>Tibares de Cobre (TC):</label>
            <input type="number" name="tc" value="0" />
          </div>
          <div class="t20pf2e-form-row">
            <label>Modo de Distribuição:</label>
            <select name="mode">
              <option value="split">Dividir igualmente entre ${actors.length} PJs</option>
              <option value="each">Dar este valor completo para CADA PJ</option>
            </select>
          </div>
        </form>`,
      buttons: [
        {
          action: "give",
          label: "Distribuir",
          icon: "fa-solid fa-coins",
          default: true,
          callback: (_ev, _btn, dialog) => {
            const fd = new FormData(dialog.element.querySelector("form"));
            return {
              to: Number(fd.get("to") || 0),
              tp: Number(fd.get("tp") || 0),
              tc: Number(fd.get("tc") || 0),
              mode: String(fd.get("mode") || "split")
            };
          }
        },
        { action: "cancel", label: "Cancelar" }
      ]
    });

    if (!result || typeof result !== "object") return;
    const count = actors.length;
    const div = result.mode === "split" ? count : 1;

    // Convert split into TO / TP / TC evenly via TP tenths when splitting
    let perTO = Math.floor(result.to / div);
    let remTPFromTO = ((result.to % div) * 10) / div;
    let totalPerTP = Math.floor(result.tp / div + remTPFromTO);
    let perTC = Math.floor(result.tc / div + (((result.tp % div) + remTPFromTO) % 1) * 10);

    if (result.mode === "each") {
      perTO = result.to;
      totalPerTP = result.tp;
      perTC = result.tc;
    }

    if (perTO === 0 && totalPerTP === 0 && perTC === 0) {
      ui.notifications.warn("Valor muito baixo para distribuir.");
      return;
    }

    for (const actor of actors) {
      const cur = actor.system?.dinheiro || {};
      await actor.update({
        "system.dinheiro.to": Number(cur.to || 0) + perTO,
        "system.dinheiro.tp": Number(cur.tp || 0) + totalPerTP,
        "system.dinheiro.tc": Number(cur.tc || 0) + perTC
      });
    }

    await ChatMessage.create({
      content: `
        <div class="t20pf2e-check-prompt-card">
          <div class="t20pf2e-cp-header"><i class="fa-solid fa-coins"></i> <strong>Tesouro Distribuído</strong></div>
          <p style="margin: 4px 0 0; font-size: 12px;">Cada um dos ${count} personagens recebeu: <strong>${perTO} TO, ${totalPerTP} T$, ${perTC} TC</strong>.</p>
        </div>`,
      speaker: { alias: "Tesouro do Grupo" }
    });
    this.render();
  }
}

