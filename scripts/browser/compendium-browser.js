import { T20CompendiumIndex } from "./compendium-index.js";
import { normalizeText } from "../automation/skill-parser.js";
import { COMBAT_EFFECTS_CATALOG } from "../data/combat-effects-catalog.js";
import { evaluatePowerStatus, extractActorSnapshot } from "../automation/power-prereq-evaluator.js";
import {
  addStandardItemToActor,
  applyClassToActor,
  applyDeityToActor,
  applyOriginToActor,
  applyRaceToActor
} from "../automation/character-builders.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CATEGORY_TABS = [
  { id: "classes", label: "Classes", icon: "fa-solid fa-shield-halved" },
  { id: "racas", label: "Raças", icon: "fa-solid fa-masks-theater" },
  { id: "origens", label: "Origens", icon: "fa-solid fa-compass" },
  { id: "divindades", label: "Divindades", icon: "fa-solid fa-sun" },
  { id: "poderes", label: "Poderes", icon: "fa-solid fa-star" },
  { id: "magias", label: "Magias", icon: "fa-solid fa-wand-sparkles" },
  { id: "equipamentos", label: "Equipamentos", icon: "fa-solid fa-suitcase" },
  { id: "efeitos", label: "Efeitos & Ações", icon: "fa-solid fa-bolt" },
  { id: "ameacas", label: "Ameaças", icon: "fa-solid fa-skull" }
];

function emptyFilters(opts = {}) {
  return {
    query: opts.query ?? "",
    source: opts.source ?? "",
    circulo: opts.circulo ?? "",
    maxCirculo: opts.maxCirculo ? String(opts.maxCirculo) : "",
    spellTipo: opts.spellTipo ?? "",
    escola: opts.escola ?? "",
    powerTipo: opts.tipo ?? "",
    subtipo: normalizeText(opts.subtipo ?? ""),
    onlyEligible: Boolean(opts.onlyEligible),
    slotClassFilter: Boolean(opts.slotContext),
    itemType: opts.itemType ?? "",
    ndBucket: opts.ndBucket ?? "",
    creatureType: opts.creatureType ?? "",
    size: opts.size ?? "",
    fxGroup: opts.fxGroup ?? ""
  };
}

export class CompendiumBrowserT20 extends HandlebarsApplicationMixin(ApplicationV2) {
  static _instance = null;

  constructor(options = {}) {
    super(options);
    this.activeCategory = options.category || "magias";
    this.targetActor = options.actor || null;
    this.slotContext = options.slotContext || null;
    this.spellContext = options.spellContext || null;
    this.filters = emptyFilters(options);
    this.selectedUuid = null;
    this._previewCache = new Map();
  }

  _onClose(options) {
    super._onClose(options);
    if (CompendiumBrowserT20._instance === this) {
      CompendiumBrowserT20._instance = null;
    }
  }

  static DEFAULT_OPTIONS = {
    id: "t20-compendium-browser",
    classes: ["t20pf2e-browser"],
    window: {
      title: "Navegador de Compêndios — Arton",
      icon: "fa-solid fa-book-atlas",
      resizable: true
    },
    position: {
      width: 1000,
      height: 690
    },
    actions: {
      switchTab: CompendiumBrowserT20._onSwitchTab,
      selectEntry: CompendiumBrowserT20._onSelectEntry,
      applyEntry: CompendiumBrowserT20._onApplyEntry,
      openSheet: CompendiumBrowserT20._onOpenSheet,
      clearFilters: CompendiumBrowserT20._onClearFilters
    }
  };

  static PARTS = {
    main: {
      template: "modules/t20-compendios-completos/templates/browser/compendium-browser.hbs"
    }
  };

  /**
   * Singleton opener that updates actor context & active category/filters smoothly.
   */
  static open(opts = {}, actor = null) {
    if (!this._instance) {
      this._instance = new this({ ...opts, actor });
    } else {
      if (actor) this._instance.targetActor = actor;
      if (opts.category) this._instance.activeCategory = opts.category;
      this._instance.slotContext = opts.slotContext || null;
      this._instance.spellContext = opts.spellContext || null;
      this._instance.filters = emptyFilters(opts);
      this._instance.selectedUuid = null;
    }
    this._instance.render({ force: true });
    return this._instance;
  }

  _resolveTargetActor() {
    if (this.targetActor) return this.targetActor;
    if (canvas?.tokens?.controlled?.length === 1) {
      return canvas.tokens.controlled[0].actor;
    }
    if (game.user.character) return game.user.character;
    return null;
  }

  async _prepareContext(_options) {
    const categories = await T20CompendiumIndex.getCategories();
    const rawEntries = categories[this.activeCategory] || [];

    const tabs = CATEGORY_TABS.map((t) => ({
      ...t,
      count: (categories[t.id] || []).length,
      active: t.id === this.activeCategory
    }));

    const targetActor = this._resolveTargetActor();
    const actorSnap = this.activeCategory === "poderes" ? extractActorSnapshot(targetActor) : null;

    const entries = rawEntries.map((e) => {
      const base = {
        ...e,
        nameNorm: normalizeText(e.name),
        subtipoNorm: normalizeText(e.system?.subtipo || "")
      };
      if (this.activeCategory === "poderes") {
        return { ...base, ...evaluatePowerStatus(e, targetActor, actorSnap) };
      }
      return base;
    });

    const sources = [...new Set(rawEntries.map((e) => e.sourceGroup))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const schools = Object.entries(CONFIG.T20?.spellSchools || {}).map(([key, label]) => ({
      key,
      label: game.i18n.localize(label)
    }));
    const powerTypes = Object.entries(CONFIG.T20?.powerType || {}).map(([key, label]) => ({
      key,
      label: game.i18n.localize(label)
    }));
    const subtypeMap = new Map();
    if (this.activeCategory === "poderes") {
      for (const e of rawEntries) {
        const rawSub = String(e.system?.subtipo || "").trim();
        if (!rawSub) continue;
        for (const part of rawSub.split(/[,/]/)) {
          const clean = part.trim();
          const key = normalizeText(clean);
          if (clean && key && !subtypeMap.has(key)) {
            subtypeMap.set(key, clean);
          }
        }
      }
    }
    const subtypes = [...subtypeMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    const creatureTypes = Object.entries(CONFIG.T20?.creatureTypes || {}).map(([key, label]) => ({
      key,
      label: game.i18n.localize(label)
    }));
    const sizes = Object.entries(CONFIG.T20?.actorSizes || {}).map(([key, label]) => ({
      key,
      label: game.i18n.localize(label)
    }));

    let preview = null;
    if (this.selectedUuid) {
      preview = await this._getPreview(this.selectedUuid, rawEntries, targetActor);
    } else if (entries.length) {
      this.selectedUuid = entries[0].uuid;
      preview = await this._getPreview(this.selectedUuid, rawEntries, targetActor);
    }

    const applyLabelMap = {
      classes: "Aplicar / Subir Nível",
      racas: "Aplicar Raça",
      origens: "Aplicar Origem",
      divindades: "Adotar Divindade",
      poderes: "Adicionar Poder",
      magias: "Adicionar ao Grimório",
      equipamentos: "Adicionar ao Inventário",
      efeitos: "Aplicar Efeito / Rolar Ação",
      ameacas: "Importar para Atores"
    };

    return {
      tabs,
      activeCategory: this.activeCategory,
      entries,
      selectedUuid: this.selectedUuid,
      filters: this.filters,
      filterOptions: { sources, schools, powerTypes, subtypes, creatureTypes, sizes },
      targetActor,
      slotContext: this.slotContext,
      spellContext: this.spellContext,
      preview,
      applyLabel: this.slotContext
        ? `Preencher Espaço (Nv ${this.slotContext.slotLevel})`
        : (applyLabelMap[this.activeCategory] || "Adicionar")
    };
  }

  async _getPreview(uuid, rawEntries, targetActor = null) {
    const cacheKey = `${uuid}::${targetActor?.id || "none"}`;
    if (this._previewCache.has(cacheKey)) return this._previewCache.get(cacheKey);
    const meta = rawEntries.find((e) => e.uuid === uuid);

    if (uuid.startsWith("t20fx:")) {
      const fx = COMBAT_EFFECTS_CATALOG.find((x) => `t20fx:${x.id}` === uuid);
      if (!fx) return null;
      const changesList = (fx.effectData?.changes || [])
        .map((c) => `<li><code>${c.key}</code>: <strong>${Number(c.value) >= 0 ? `+${c.value}` : c.value}</strong></li>`)
        .join("");
      const preview = {
        uuid,
        name: fx.name,
        img: fx.img,
        subtitle: fx.subtitle,
        packLabel: "Ações, Manobras & Buffs",
        html: `${fx.summary}${changesList ? `<h4>Bônus Automáticos</h4><ul>${changesList}</ul>` : ""}`
      };
      this._previewCache.set(uuid, preview);
      return preview;
    }

    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) return null;

    let rawHtml = "";
    if (doc.documentName === "JournalEntry") {
      const pages = [...(doc.pages?.values() || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      rawHtml = pages
        .map((p) => `<h3 class="t20pf2e-preview-section">${p.name}</h3>${p.text?.content || ""}`)
        .join("<hr/>");
    } else if (doc.documentName === "Actor") {
      const pv = doc.system?.attributes?.pv?.max ?? "?";
      const pm = doc.system?.attributes?.pm?.max ?? 0;
      const def = doc.system?.attributes?.defesa?.value ?? "?";
      const nd = doc.system?.attributes?.nd ?? "?";
      const itemsHtml = doc.items
        .map((it) => `<li><strong>${it.name}</strong> <em>(${it.type})</em></li>`)
        .join("");
      rawHtml = `
        <p><strong>ND:</strong> ${nd} · <strong>PV:</strong> ${pv} · <strong>PM:</strong> ${pm} · <strong>Defesa:</strong> ${def}</p>
        ${doc.system?.detalhes?.biography?.value || ""}
        ${itemsHtml ? `<h4>Ataques, Poderes & Magias</h4><ul>${itemsHtml}</ul>` : ""}`;
    } else {
      rawHtml = doc.system?.description?.value || "<p><em>Sem descrição detalhada.</em></p>";
      if (meta?.category === "poderes") {
        const evalRes = evaluatePowerStatus({ name: doc.name, system: doc.system }, targetActor);
        if (evalRes.hasPrereq) {
          const text = evalRes.prereqFull || evalRes.prereqLabel;
          const missingTxt = evalRes.missing?.length
            ? `<div class="t20pf2e-prereq-missing">Falta no personagem: ${evalRes.missing.join(", ")}</div>`
            : "";
          rawHtml = `<div class="t20pf2e-preview-prereq is-${evalRes.prereqState}">
            <i class="${evalRes.prereqIcon}"></i>
            <div>
              <strong>Pré-requisito / Nível:</strong> ${text || "Disponível"}
              ${missingTxt}
            </div>
          </div>${rawHtml}`;
        }
      }
    }

    const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawHtml, {
      async: true,
      relativeTo: doc
    });

    const preview = {
      uuid,
      name: doc.name,
      img: meta?.img || doc.img || "icons/svg/book.svg",
      subtitle: meta?.subtitle || "",
      packLabel: meta?.packLabel || doc.pack || "",
      html
    };
    this._previewCache.set(cacheKey, preview);
    return preview;
  }

  _onRender(_context, _options) {
    const root = this.element;
    // Wire filter controls without full re-render so typing stays seamless
    root.querySelectorAll("[data-filter]").forEach((el) => {
      const isCheckbox = el.type === "checkbox";
      const eventName = (el.tagName === "SELECT" || isCheckbox) ? "change" : "input";
      el.addEventListener(eventName, (ev) => {
        const key = ev.currentTarget.dataset.filter;
        this.filters[key] = isCheckbox ? ev.currentTarget.checked : ev.currentTarget.value;
        this._applyDomFilters();
      });
    });

    // Enable drag-and-drop directly onto sheets or hotbar
    root.querySelectorAll(".t20pf2e-browser-row[draggable='true']").forEach((row) => {
      row.addEventListener("dragstart", (ev) => {
        const payload = {
          type: row.dataset.docType,
          uuid: row.dataset.uuid
        };
        ev.dataTransfer.setData("text/plain", JSON.stringify(payload));
      });
    });

    this._applyDomFilters();
  }

  _applyDomFilters() {
    const root = this.element;
    if (!root) return;
    const rows = root.querySelectorAll(".t20pf2e-browser-row");
    const q = normalizeText(this.filters.query);
    const subQ = normalizeText(this.filters.subtipo);
    let visible = 0;

    for (const row of rows) {
      let show = true;
      if (q && !(row.dataset.nameNorm || "").includes(q)) show = false;
      if (show && this.filters.source && row.dataset.source !== this.filters.source) show = false;
      if (show && this.activeCategory === "magias") {
        if (this.filters.circulo && row.dataset.circulo !== this.filters.circulo) show = false;
        if (show && this.filters.maxCirculo && Number(row.dataset.circulo) > Number(this.filters.maxCirculo)) show = false;
        if (show && this.filters.spellTipo) {
          const st = row.dataset.spellTipo;
          const allowUniversal = this.filters.spellTipo === "arc" || this.filters.spellTipo === "div";
          if (st !== this.filters.spellTipo && !(allowUniversal && st === "uni")) show = false;
        }
        if (show && this.filters.escola && row.dataset.escola !== this.filters.escola) show = false;
      }
      if (show && this.activeCategory === "poderes") {
        if (this.filters.slotClassFilter && this.slotContext) {
          const slotSubNorm = normalizeText(this.slotContext.powerSubtype || this.slotContext.className || "");
          const subParts = (row.dataset.subtipoNorm || "")
            .split(/[,/]/)
            .map((s) => s.trim())
            .filter(Boolean);
          const pTipo = row.dataset.powerTipo;
          const isClassPower = pTipo === "classe" && (subParts.includes(slotSubNorm) || subParts.includes("geral"));
          const isGeneralPower = pTipo === "geral";
          if (!isClassPower && !isGeneralPower) show = false;
        }
        if (show && this.filters.powerTipo && row.dataset.powerTipo !== this.filters.powerTipo) show = false;
        if (show && subQ) {
          const subParts = (row.dataset.subtipoNorm || "")
            .split(/[,/]/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!subParts.includes(subQ)) show = false;
        }
        if (show && this.filters.onlyEligible && row.dataset.prereqState === "locked") show = false;
      }
      if (show && this.activeCategory === "equipamentos") {
        if (this.filters.itemType && row.dataset.itemType !== this.filters.itemType) show = false;
      }
      if (show && this.activeCategory === "ameacas") {
        if (this.filters.ndBucket && row.dataset.ndBucket !== this.filters.ndBucket) show = false;
        if (this.filters.creatureType && row.dataset.creatureType !== this.filters.creatureType) show = false;
        if (this.filters.size && row.dataset.size !== this.filters.size) show = false;
      }
      if (show && this.activeCategory === "efeitos") {
        if (this.filters.fxGroup && row.dataset.fxGroup !== this.filters.fxGroup) show = false;
      }
      row.style.display = show ? "" : "none";
      if (show) visible++;
    }

    const counter = root.querySelector(".t20pf2e-visible-count");
    if (counter) counter.textContent = String(visible);
  }

  static _onSwitchTab(_ev, target) {
    const cat = target.dataset.category;
    if (!cat || cat === this.activeCategory) return;
    this.activeCategory = cat;
    this.selectedUuid = null;
    this.slotContext = null;
    this.spellContext = null;
    this.filters = emptyFilters();
    this.render();
  }

  static _onSelectEntry(_ev, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    this.selectedUuid = uuid;
    this.render();
  }

  static _onClearFilters() {
    this.slotContext = null;
    this.spellContext = null;
    this.filters = emptyFilters();
    this.render();
  }

  static async _onOpenSheet(_ev, target) {
    const uuid = target.dataset.uuid;
    if (uuid?.startsWith("t20fx:")) {
      const fx = COMBAT_EFFECTS_CATALOG.find((x) => `t20fx:${x.id}` === uuid);
      if (fx) {
        await ChatMessage.create({
          content: `<div class="t20pf2e-check-prompt-card"><div class="t20pf2e-cp-title"><i class="fa-solid fa-bolt"></i> <strong>${fx.name}</strong></div>${fx.summary}</div>`,
          speaker: { alias: "Regra de Combate (T20)" }
        });
      }
      return;
    }
    const doc = await fromUuid(uuid).catch(() => null);
    if (doc?.sheet) doc.sheet.render(true);
  }

  static async _onApplyEntry(_ev, target) {
    const uuid = target.dataset.uuid;
    const category = this.activeCategory;

    // Import Threat / NPC into World Actors
    if (category === "ameacas") {
      if (!game.user.isGM && !game.user.can("ACTOR_CREATE")) {
        ui.notifications.warn("Apenas o Mestre pode importar ameaças para o mundo.");
        return;
      }
      const doc = await fromUuid(uuid).catch(() => null);
      if (!doc) return;
      const created = await Actor.create(doc.toObject());
      if (created) {
        ui.notifications.info(`Ameaça "${created.name}" importada para a aba Atores.`);
        created.sheet?.render(true);
      }
      return created;
    }

    const actor = this._resolveTargetActor();
    if (!actor) {
      ui.notifications.warn("Abra uma ficha de personagem ou selecione um token no mapa primeiro.");
      return;
    }

    // Apply Combat Preset Effect or Roll Maneuver
    if (category === "efeitos" && uuid?.startsWith("t20fx:")) {
      const fx = COMBAT_EFFECTS_CATALOG.find((x) => `t20fx:${x.id}` === uuid);
      if (!fx) return;
      if (fx.effectData) {
        const existing = actor.effects.find((e) => e.name === fx.effectData.name);
        if (existing) {
          await existing.delete();
          ui.notifications.info(`Efeito "${fx.effectData.name}" removido de ${actor.name}.`);
        } else {
          await actor.createEmbeddedDocuments("ActiveEffect", [{
            ...fx.effectData,
            origin: uuid,
            disabled: false
          }]);
          ui.notifications.info(`Efeito "${fx.effectData.name}" aplicado em ${actor.name}!`);
        }
      }
      if (fx.skillRoll && typeof actor.rollPericia === "function") {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="t20pf2e-check-prompt-card"><div class="t20pf2e-cp-title"><i class="fa-solid fa-swords"></i> <strong>${fx.name}</strong></div>${fx.summary}</div>`
        });
        await actor.rollPericia(fx.skillRoll.skill, { message: true });
      }
      return;
    }

    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) return;

    let reopened = false;
    const reopen = (opts) => {
      reopened = true;
      CompendiumBrowserT20.open(opts, actor);
    };

    let result = null;
    if (category === "racas") result = await applyRaceToActor(actor, doc);
    else if (category === "classes") result = await applyClassToActor(actor, doc, { onOpenBrowser: reopen });
    else if (category === "divindades") result = await applyDeityToActor(actor, doc);
    else if (category === "origens") result = await applyOriginToActor(actor, doc, { onOpenBrowser: reopen });
    else {
      const activeSlot = category === "poderes" ? this.slotContext : null;
      const created = await addStandardItemToActor(actor, doc, { slotContext: activeSlot });
      if (activeSlot && created) {
        this.slotContext = null;
        this.close();
      }
      return created;
    }

    // Close the browser automatically after applying a single-slot identity choice (ABC + Divindade)
    if (result && !reopened) {
      await this.close();
    }
    return result;
  }
}

