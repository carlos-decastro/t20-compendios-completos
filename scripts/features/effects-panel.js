import { normalizeText } from "../automation/skill-parser.js";

const TEMPLATE_PATH = "modules/t20-compendios-completos/templates/hud/effects-panel.hbs";

/**
 * Floating PF2e-style Active Effects & Quick Conditions Panel on the Canvas.
 */
export class EffectsPanelT20 {
  static _rootEl = null;
  static _showPicker = false;
  static _pickerQuery = "";

  static init() {
    const refresh = () => this.render();
    Hooks.on("canvasReady", refresh);
    Hooks.on("controlToken", refresh);
    Hooks.on("createActiveEffect", (eff) => this._onEffectChange(eff));
    Hooks.on("updateActiveEffect", (eff) => this._onEffectChange(eff));
    Hooks.on("deleteActiveEffect", (eff) => this._onEffectChange(eff));
    Hooks.on("updateActor", (actor) => {
      if (actor.id === this.getTargetActor()?.id) this.render();
    });
    Hooks.on("updateCombat", refresh);
    Hooks.on("collapseSidebar", () => this._positionPanel());
  }

  static _onEffectChange(eff) {
    const target = this.getTargetActor();
    if (target && eff?.parent?.id === target.id) {
      this.render();
    }
  }

  static getTargetActor() {
    const controlled = canvas?.tokens?.controlled;
    if (controlled?.length) {
      return controlled[0].actor || null;
    }
    return game.user?.character || null;
  }

  static _ensureRoot() {
    if (!this._rootEl || !document.body.contains(this._rootEl)) {
      this._rootEl = document.createElement("div");
      this._rootEl.id = "t20pf2e-effects-root";
      document.body.appendChild(this._rootEl);
    }
    return this._rootEl;
  }

  static _positionPanel() {
    const root = this._rootEl;
    if (!root) return;
    const sidebar = document.getElementById("sidebar");
    const rect = sidebar?.getBoundingClientRect();
    const rightOffset = rect && rect.width > 0 ? Math.max(window.innerWidth - rect.left + 14, 16) : 64;
    root.style.right = `${rightOffset}px`;
  }

  static async render() {
    const actor = this.getTargetActor();
    const root = this._ensureRoot();
    if (!actor || !canvas?.ready) {
      root.innerHTML = "";
      return;
    }

    const activeStatuses = new Set();
    const effects = [];
    for (const ef of actor.effects || []) {
      if (ef.disabled) continue;
      for (const st of ef.statuses || []) activeStatuses.add(st);

      let badge = "";
      if (Number.isFinite(ef.duration?.remaining) && ef.duration.remaining > 0) {
        badge = `${ef.duration.remaining}${ef.duration.type === "turns" ? "t" : "r"}`;
      } else if (Number.isFinite(ef.duration?.rounds) && ef.duration.rounds > 0) {
        badge = `${ef.duration.rounds}r`;
      }

      const rawDesc = (ef.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const tooltip = `<strong>${ef.name}</strong>${rawDesc ? `<br>${rawDesc}` : ""}<br><em>Clique esquerdo: inspecionar · Clique direito: remover</em>`;

      effects.push({
        id: ef.id,
        name: ef.name,
        img: ef.img || "icons/svg/aura.svg",
        badge,
        tooltip
      });
    }

    const conditions = Object.values(CONFIG.statusEffects || {})
      .filter((s) => s?.id && s?.name)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((s) => ({
        id: s.id,
        name: s.name,
        img: s.img,
        nameNorm: normalizeText(s.name),
        active: activeStatuses.has(s.id)
      }));

    // Don't display HUD clutter when there are 0 effects and picker is closed? Keep minimal header chip!
    const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATH, {
      actor,
      effects,
      conditions,
      showPicker: this._showPicker,
      pickerQuery: this._pickerQuery
    });
    root.innerHTML = html;
    this._positionPanel();
    this._bindEvents(root, actor);
  }

  static _bindEvents(root, actor) {
    root.querySelector('[data-action="togglePicker"]')?.addEventListener("click", (ev) => {
      ev.preventDefault();
      this._showPicker = !this._showPicker;
      this.render();
    });

    const search = root.querySelector(".t20pf2e-ep-search");
    if (search) {
      search.addEventListener("input", (ev) => {
        this._pickerQuery = ev.currentTarget.value;
        const q = normalizeText(this._pickerQuery);
        root.querySelectorAll(".t20pf2e-ep-cond-chip").forEach((chip) => {
          chip.style.display = !q || (chip.dataset.nameNorm || "").includes(q) ? "" : "none";
        });
      });
    }

    root.querySelectorAll('[data-action="toggleCondition"]').forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const statusId = ev.currentTarget.dataset.statusId;
        if (!statusId || !actor.isOwner) return;
        const existing = actor.effects.find((e) => e.statuses?.has(statusId));
        if (existing) {
          await existing.delete();
        } else {
          const ef = await ActiveEffect.fromStatusEffect(statusId);
          if (ef) await actor.createEmbeddedDocuments("ActiveEffect", [ef.toObject()]);
        }
      });
    });

    root.querySelectorAll(".t20pf2e-ep-item").forEach((el) => {
      el.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const ef = actor.effects.get(el.dataset.effectId);
        if (ef?.sheet) ef.sheet.render(true);
      });
      el.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        if (!actor.isOwner) return;
        const ef = actor.effects.get(el.dataset.effectId);
        if (ef) await ef.delete();
      });
    });
  }
}

