import { CompendiumBrowserT20 } from "../browser/compendium-browser.js";
import { CharacterWizardT20 } from "../wizard/character-wizard.js";
import { normalizeText } from "../automation/skill-parser.js";
import { ForgeModalT20 } from "../features/forge-modal.js";
import { getWeaponGripVariants, rollWeaponWithGrip } from "../features/sheet-ux-enhancers.js";
import { COMBAT_EFFECTS_CATALOG } from "../data/combat-effects-catalog.js";
import {
  addStandardItemToActor,
  applyClassToActor,
  applyDeityToActor,
  applyOriginToActor,
  applyRaceToActor,
  levelUpClassOnActor,
  promptArcanistaPathDialog
} from "../automation/character-builders.js";
import { getClassProgressionRule, normalizeProgressKey } from "../data/class-progression-rules.js";
import {
  computeActorProgression,
  syncClassLevelProgression
} from "../automation/progression-slots.js";

const MODULE_ID = "t20-compendios-completos";

/**
 * Factory creating the PF2e-inspired Tormenta20 character sheet once `tormenta20` is loaded.
 */
export function buildPF2eSheetClass() {
  const BaseCharacterSheet = tormenta20.applications.ActorSheetT20CharacterTabbed;

  return class ActorSheetT20PF2e extends BaseCharacterSheet {
    _onlyTrainedSkills = false;
    _skillFilterText = "";

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["tormenta20", "sheet", "actor", "character", "pf2e-style"],
        width: 980,
        height: 760,
        tabs: [
          {
            navSelector: ".sheet-tabs",
            contentSelector: ".sheet-body",
            initial: "attributes"
          }
        ],
        scrollY: [
          ".pf2e-body",
          ".pf2e-sidebar",
          ".tab.attributes",
          ".tab.combat",
          ".tab.skills",
          ".tab.powers",
          ".tab.spells",
          ".tab.inventory",
          ".tab.effects",
          ".tab.journal"
        ]
      });
    }

    get template() {
      const limitedSetting = game.settings.get("tormenta20", "limitedSheet");
      if (!game.user.isGM && limitedSetting === "limited" && this.actor.limited) {
        return "systems/tormenta20/templates/actor/limited-sheet.hbs";
      }
      return `modules/${MODULE_ID}/templates/sheet/character-pf2e-sheet.hbs`;
    }

    async getData() {
      const sheetData = await super.getData();

      // Guarantee full `pericias` keys regardless of compact filters for sidebar saves
      const pv = sheetData.system.attributes?.pv || { value: 0, max: 1 };
      const pm = sheetData.system.attributes?.pm || { value: 0, max: 1 };
      const hpPct = pv.max > 0 ? Math.clamp(Math.round((pv.value / pv.max) * 100), 0, 100) : 0;
      const mpPct = pm.max > 0 ? Math.clamp(Math.round((pm.value / pm.max) * 100), 0, 100) : 0;

      const quickKeys = [
        { key: "fort", shortLabel: "Fortitude" },
        { key: "refl", shortLabel: "Reflexos" },
        { key: "vont", shortLabel: "Vontade" },
        { key: "inic", shortLabel: "Iniciativa" },
        { key: "perc", shortLabel: "Percepção" }
      ];

      const quickSkills = quickKeys.map((q) => ({
        ...q,
        label: sheetData.system.pericias?.[q.key]?.label || q.shortLabel,
        value: sheetData.system.pericias?.[q.key]?.value ?? 0
      }));

      sheetData.pf2eMeta = {
        hpPct,
        mpPct,
        quickSkills,
        showWizardBanner: this.actor.isOwner && !this.actor.itemTypes.race?.length && !this.actor.itemTypes.classe?.length,
        progression: computeActorProgression(this.actor)
      };
      return sheetData;
    }

    activateListeners(html) {
      super.activateListeners(html);

      // Rebind item context menus with `fixed: true` on scrollable subcontainers so menus never clip/scroll
      const rootEl = html[0];
      if (rootEl) {
        for (const containerSel of [".pf2e-body", ".pf2e-top-header"]) {
          const container = rootEl.querySelector(containerSel);
          if (container) {
            new foundry.applications.ux.ContextMenu.implementation(
              container,
              ":not(.effects-list) .item",
              [],
              {
                eventName: "contextmenu",
                fixed: true,
                jQuery: false,
                onOpen: (target) => this._onItemToggleContext(target)
              }
            );
          }
        }
        const mainCol = rootEl.querySelector(".pf2e-main-col");
        if (mainCol) {
          mainCol.addEventListener("contextmenu", (ev) => {
            if (ev.target.closest(":not(.effects-list) .item")) {
              ev.stopPropagation();
            }
          });
        }
      }

      // Clickable Compendium Browser triggers (header identity cards + tab buttons)
      html.find("[data-pf2e-browse]").click((ev) => {
        ev.preventDefault();
        const btn = ev.currentTarget;
        const category = btn.dataset.pf2eBrowse;
        const itemType = btn.dataset.itemType || "";
        CompendiumBrowserT20.open({ category, itemType }, this.actor);
      });

      // Open Forge Assistant directly from Inventory toolbar
      html.find("[data-pf2e-open-forge]").click((ev) => {
        ev.preventDefault();
        ForgeModalT20.open(this.actor);
      });

      // Launch Guided Character Creation Wizard for this empty character sheet
      html.find("[data-pf2e-open-wizard]").click((ev) => {
        ev.preventDefault();
        CharacterWizardT20.open(this.actor);
      });

      // Open linked Origem / Divindade JournalEntry on click
      html.find(".pf2e-open-origem").click(async (ev) => {
        ev.preventDefault();
        const uuid = this.actor.getFlag(MODULE_ID, "origemUuid");
        const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
        if (doc?.sheet) doc.sheet.render(true);
        else CompendiumBrowserT20.open({ category: "origens", query: this.actor.system.detalhes?.origem || "" }, this.actor);
      });

      html.find(".pf2e-open-divindade").click(async (ev) => {
        ev.preventDefault();
        const uuid = this.actor.getFlag(MODULE_ID, "divindadeUuid");
        const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
        if (doc?.sheet) doc.sheet.render(true);
        else CompendiumBrowserT20.open({ category: "divindades", query: this.actor.system.detalhes?.divindade || "" }, this.actor);
      });

      // Skills search + trained-only toggle inside Perícias tab
      const skillFilterInput = html.find(".pf2e-skill-filter");
      skillFilterInput.val(this._skillFilterText);
      skillFilterInput.on("input", (ev) => {
        this._skillFilterText = ev.currentTarget.value;
        this._applySkillDomFilter(html);
      });

      // 1-Click Class Level-Up inside header Class card
      const openBrowserForActor = (opts) => CompendiumBrowserT20.open(opts, this.actor);

      html.find("[data-pf2e-levelup]").click(async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!this.actor.isOwner) return;
        const clsId = ev.currentTarget.dataset.pf2eLevelup;
        const cls = this.actor.items.get(clsId);
        if (!cls) return;
        const maxLvl = game.settings.get("tormenta20", "gameSystem") === "Skyfall" ? 10 : 20;
        const currentLvl = Number(cls.system?.niveis ?? 1);
        if (currentLvl >= maxLvl) {
          return ui.notifications.warn(`${cls.name} já está no nível máximo (${maxLvl}).`);
        }
        await levelUpClassOnActor(this.actor, cls, currentLvl + 1, {
          onOpenBrowser: openBrowserForActor,
          showSummary: true
        });
      });

      // Downgrade class level (-1) and remove features/slots unlocked above the new level
      html.find("[data-pf2e-leveldown]").click(async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!this.actor.isOwner) return;
        const clsId = ev.currentTarget.dataset.pf2eLeveldown;
        const cls = this.actor.items.get(clsId);
        if (!cls) return;
        const currentLvl = Number(cls.system?.niveis ?? 1);
        if (currentLvl <= 1) return;
        const nextLvl = currentLvl - 1;
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: `Reduzir Nível — ${cls.name}` },
          content: `<p>Reduzir <strong>${cls.name}</strong> do nível ${currentLvl} para <strong>${nextLvl}</strong>?</p><p>Habilidades passivas e poderes escolhidos nos espaços acima do nível ${nextLvl} serão <strong>removidos</strong> automaticamente para permitir nova escolha ao subir de nível.</p>`,
          yes: { label: `Reduzir para Nv ${nextLvl}` },
          no: { label: "Cancelar" }
        });
        if (!ok) return;
        await levelUpClassOnActor(this.actor, cls, nextLvl, {
          onOpenBrowser: openBrowserForActor,
          showSummary: false
        });
      });

      // Remove Class when added by mistake or at Level 1
      html.find("[data-pf2e-delete-class]").click(async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!this.actor.isOwner) return;
        const clsId = ev.currentTarget.dataset.pf2eDeleteClass;
        const cls = this.actor.items.get(clsId);
        if (!cls) return;

        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: `Remover Classe — ${cls.name}` },
          content: `<p>Remover a classe <strong>${cls.name}</strong> (Nível 1) do personagem?</p><p class="t20pf2e-muted">Todas as habilidades e poderes desta classe serão removidos da ficha.</p>`,
          yes: { label: "Remover Classe" },
          no: { label: "Cancelar" }
        });
        if (!ok) return;

        const rule = getClassProgressionRule(cls.name);
        const ruleKey = rule?.key || normalizeProgressKey(cls.name);
        const deleteIds = new Set([cls.id]);

        for (const it of this.actor.items) {
          if (it.type !== "poder" && it.type !== "habilidade") continue;
          const flags = it.flags?.[MODULE_ID] || {};
          const isClassItem =
            flags.classItemId === cls.id ||
            flags.classKey === ruleKey ||
            (flags.slotId && flags.slotId.startsWith(`${ruleKey}:`));

          if (isClassItem) {
            deleteIds.add(it.id);
          }
        }

        await this.actor.deleteEmbeddedDocuments("Item", Array.from(deleteIds));
        ui.notifications.info(`Classe ${cls.name} e habilidades vinculadas foram removidas de ${this.actor.name}.`);
      });

      // Open contextual Compendium Browser to fill/replace a specific Progression Power Slot
      html.find("[data-pf2e-pick-slot]").click((ev) => {
        ev.preventDefault();
        const ds = ev.currentTarget.dataset;
        CompendiumBrowserT20.open(
          {
            category: "poderes",
            slotContext: {
              slotId: ds.slotId,
              slotLevel: Number(ds.slotLevel) || 1,
              classKey: ds.classKey,
              className: ds.className,
              powerSubtype: ds.powerSubtype || ds.className,
              allowGeneralPowers: true
            }
          },
          this.actor
        );
      });

      // Remove a slotted power to re-open its progression slot
      html.find("[data-pf2e-unlink-slot]").click(async (ev) => {
        ev.preventDefault();
        if (!this.actor.isOwner) return;
        const itemId = ev.currentTarget.dataset.pf2eUnlinkSlot;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        const confirmDel = await foundry.applications.api.DialogV2.confirm({
          window: { title: `Esvaziar Espaço — ${item.name}` },
          content: `<p>Remover <strong>${item.name}</strong> da ficha para liberar novamente este espaço de poder?</p>`,
          yes: { label: "Remover e Liberar Espaço" },
          no: { label: "Cancelar" }
        });
        if (!confirmDel) return;
        await item.delete();
      });

      // Open item sheet directly from a filled slot row
      html.find("[data-pf2e-open-item]").click((ev) => {
        ev.preventDefault();
        const item = this.actor.items.get(ev.currentTarget.dataset.pf2eOpenItem);
        item?.sheet?.render(true);
      });

      // Sync existing classes/abilities/scaling for characters built prior to pipeline
      html.find("[data-pf2e-sync-progression]").click(async (ev) => {
        ev.preventDefault();
        if (!this.actor.isOwner) return;
        const classes = this.actor.itemTypes?.classe || [];
        if (!classes.length) {
          return ui.notifications.warn("Adicione uma classe primeiro para sincronizar a progressão.");
        }
        let added = 0;
        let scaled = 0;
        for (const cls of classes) {
          const lvl = Number(cls.system?.niveis ?? 1);
          const rep = await syncClassLevelProgression(this.actor, cls, 0, lvl, { linkExistingSlots: true });
          if (rep) {
            added += rep.addedAbilities.length;
            scaled += rep.scaledAbilities.length;
          }
        }
        ui.notifications.info(
          `Progressão sincronizada para ${this.actor.name}: ${added} habilidade(s) adicionada(s), ${scaled} escalonamento(s) atualizado(s).`
        );
      });

      // Choose/Change Arcanista Path
      html.find("[data-pf2e-arcanista-path]").click(async (ev) => {
        ev.preventDefault();
        if (!this.actor.isOwner) return;
        await promptArcanistaPathDialog(this.actor);
      });

      // Open spell browser pre-filtered by tradition + max unlocked circle
      html.find("[data-pf2e-learn-spell]").click((ev) => {
        ev.preventDefault();
        const ds = ev.currentTarget.dataset;
        const maxCirculo = Number(ds.maxCirculo) || 1;
        const tradicao = ds.tradicao || "";
        CompendiumBrowserT20.open(
          {
            category: "magias",
            spellTipo: tradicao,
            maxCirculo: String(maxCirculo),
            spellContext: {
              tradicao,
              tradicaoLabel: ds.tradicaoLabel || "Magias",
              maxCirculo
            }
          },
          this.actor
        );
      });

      this._enhanceEquipmentAndCombatControls(rootEl);
      this._enhanceFavoritesOnSheet(rootEl);

      const trainedBtn = html.find('[data-skill-only="trained"]');
      if (this._onlyTrainedSkills) trainedBtn.addClass("active");
      trainedBtn.click((ev) => {
        ev.preventDefault();
        this._onlyTrainedSkills = !this._onlyTrainedSkills;
        trainedBtn.toggleClass("active", this._onlyTrainedSkills);
        this._applySkillDomFilter(html);
      });

      this._applySkillDomFilter(html);
    }

    _applySkillDomFilter(html) {
      const q = normalizeText(this._skillFilterText);
      html.find(".pf2e-skills-container li.skill:not(.item-header)").each((_, li) => {
        const name = normalizeText(li.querySelector(".item-name")?.textContent || "");
        const isTrained = li.querySelector('input[type="hidden"]')?.value === "true";
        let visible = true;
        if (q && !name.includes(q)) visible = false;
        if (visible && this._onlyTrainedSkills && !isTrained) visible = false;
        li.style.display = visible ? "" : "none";
      });
    }

    /** @override */
    async _onDrop(event) {
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type === "EffectPreset" && data.uuid?.startsWith("t20fx:")) {
        if (!this.actor.isOwner) return false;
        const presetId = data.uuid.slice("t20fx:".length);
        const preset = COMBAT_EFFECTS_CATALOG.find((e) => e.id === presetId);
        if (!preset?.effectData) return false;
        const existing = this.actor.effects.find((ef) => ef.getFlag(MODULE_ID, "presetId") === preset.id);
        if (existing) {
          await existing.delete();
          ui.notifications.info(`Efeito removido de ${this.actor.name}: ${preset.name}`);
        } else {
          await this.actor.createEmbeddedDocuments("ActiveEffect", [{
            ...foundry.utils.deepClone(preset.effectData),
            disabled: false,
            flags: { [MODULE_ID]: { presetId: preset.id } }
          }]);
          ui.notifications.info(`Efeito aplicado em ${this.actor.name}: ${preset.name}`);
        }
        return true;
      }
      if (data?.type === "JournalEntry" && data.uuid) {
        if (!this.actor.isOwner) return false;
        const doc = await fromUuid(data.uuid).catch(() => null);
        if (!doc) return false;
        const openBrowser = (opts) => CompendiumBrowserT20.open(opts, this.actor);
        if (doc.flags?.[MODULE_ID]?.origemData || String(doc.pack || "").endsWith(".origens")) {
          return applyOriginToActor(this.actor, doc, { onOpenBrowser: openBrowser });
        }
        if (doc.flags?.[MODULE_ID]?.divindadeData || String(doc.pack || "").endsWith(".divindades")) {
          return applyDeityToActor(this.actor, doc);
        }
      }
      return super._onDrop(event);
    }

    /** @override */
    async _onDropItemCreate(itemData) {
      const items = Array.isArray(itemData) ? itemData : [itemData];
      const passthrough = [];

      for (const raw of items) {
        if (raw.type === "race") {
          const tempRace = new Item.implementation(raw);
          await applyRaceToActor(this.actor, tempRace);
          continue;
        }
        if (raw.type === "classe") {
          const tempClass = new Item.implementation(raw);
          await applyClassToActor(this.actor, tempClass, {
            onOpenBrowser: (opts) => CompendiumBrowserT20.open(opts, this.actor)
          });
          continue;
        }
        if (raw.type === "poder" && normalizeProgressKey(raw.name).startsWith("aumento de atributo")) {
          const tempPower = new Item.implementation(raw);
          await addStandardItemToActor(this.actor, tempPower);
          continue;
        }
        passthrough.push(raw);
      }

      if (!passthrough.length) return [];
      return super._onDropItemCreate(passthrough);
    }

    _enhanceEquipmentAndCombatControls(rootEl) {
      if (!rootEl || !this.actor?.isOwner) return;
      const equipmentSlots = game.settings.get("tormenta20", "equipmentSlots");

      const setEquipMode = async (item, mode) => {
        const updateItems = [];
        if (item.type === "arma") {
          if (equipmentSlots) {
            if (mode === 0) {
              updateItems.push({ _id: item.id, "system.equipado2.slot": 0, "system.equipado": 0 });
            } else if (mode === 2) {
              for (const it of this.actor.items) {
                const s = Number(it.system?.equipado2?.slot ?? 0);
                if (it.id !== item.id && [1.1, 2.1, 12.1].includes(s)) {
                  updateItems.push({ _id: it.id, "system.equipado2.slot": 0, "system.equipado": 0 });
                }
              }
              updateItems.push({ _id: item.id, "system.equipado2.slot": 12.1, "system.equipado": 2 });
            } else {
              const occupied1 = this.actor.items.some((it) => it.id !== item.id && Number(it.system?.equipado2?.slot) === 1.1);
              const targetSlot = occupied1 ? 2.1 : 1.1;
              for (const it of this.actor.items) {
                const s = Number(it.system?.equipado2?.slot ?? 0);
                if (it.id !== item.id && (s === 12.1 || s === targetSlot)) {
                  updateItems.push({ _id: it.id, "system.equipado2.slot": 0, "system.equipado": 0 });
                }
              }
              updateItems.push({ _id: item.id, "system.equipado2.slot": targetSlot, "system.equipado": 1 });
            }
          } else {
            updateItems.push({ _id: item.id, "system.equipado": mode });
          }
          await this.actor.updateEmbeddedDocuments("Item", updateItems);
          return;
        }

        // Armor / Shield / Worn gear
        const nextEquipped = mode > 0;
        if (equipmentSlots) {
          const isHandItem = item.system?.equipado2?.type === "hand";
          const slotBase = isHandItem ? 2.1 : 1.2;
          updateItems.push({
            _id: item.id,
            "system.equipado2.slot": nextEquipped ? slotBase : 0,
            "system.equipado": nextEquipped
          });
        } else {
          updateItems.push({ _id: item.id, "system.equipado": nextEquipped });
        }
        await this.actor.updateEmbeddedDocuments("Item", updateItems);
      };

      // Inline Equip / Grip controls inside Combate & Inventário
      rootEl.querySelectorAll(".tab.inventory .item[data-item-id], .tab.combat .item[data-item-id]").forEach((row) => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;

        const eqCell = row.querySelector(".item-equipped");
        if (eqCell && !eqCell.querySelector(".pf2e-equip-toggles")) {
          const slotVal = Number(item.system?.equipado2?.slot ?? 0);
          if (item.type === "arma" && item.system?.proficiencia !== "natural") {
            const is2H = equipmentSlots ? Math.floor(slotVal) === 12 : item.system?.equipado === 2;
            const is1H = equipmentSlots ? (slotVal > 0 && !is2H) : item.system?.equipado === 1;
            const can1H = item.system?.empunhadura !== "duas";
            const can2H = item.system?.empunhadura !== "uma";

            let badgeText = "Des.";
            let badgeClass = "";
            let badgeTitle = "Desequipada (clique para equipar)";
            let nextMode = can1H ? 1 : 2;

            if (is2H) {
              badgeText = "2M";
              badgeClass = "is-active-2h";
              badgeTitle = "Equipada com 2 Mãos (clique para desequipar)";
              nextMode = 0;
            } else if (is1H) {
              badgeText = "1M";
              badgeClass = "is-active";
              badgeTitle = can2H ? "Equipada em 1 Mão (clique para 2 Mãos)" : "Equipada em 1 Mão (clique para desequipar)";
              nextMode = can2H ? 2 : 0;
            }

            eqCell.innerHTML = `<div class="pf2e-equip-toggles">
              <button type="button" class="pf2e-equip-btn ${badgeClass}" data-next-mode="${nextMode}" title="${badgeTitle}">${badgeText}</button>
            </div>`;
            eqCell.querySelector("[data-next-mode]")?.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              setEquipMode(item, nextMode);
            });
          } else if (item.type === "equipamento") {
            const isEquipped = equipmentSlots ? slotVal > 0 : Boolean(item.system?.equipado);
            eqCell.innerHTML = `<div class="pf2e-equip-toggles">
              <button type="button" class="pf2e-equip-btn ${isEquipped ? "is-active" : ""}" data-eq-armor="1" title="${isEquipped ? "Clique para desequipar" : "Clique para equipar"}">
                ${isEquipped ? "Equip." : "Des."}
              </button>
            </div>`;
            eqCell.querySelector("[data-eq-armor]")?.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              setEquipMode(item, isEquipped ? 0 : 1);
            });
          }
        }

        // Show BOTH 1H and 2H attack buttons in Combate for weapons where 1H vs 2H differs
        if (row.closest(".tab.combat") && item.type === "arma") {
          const variants = getWeaponGripVariants(item);
          const rollsCell = row.querySelector(".item-rolls");
          if (variants.length && rollsCell && !rollsCell.querySelector(".pf2e-grip-attacks")) {
            const wrap = document.createElement("div");
            wrap.className = "pf2e-grip-attacks";
            for (const v of variants) {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "pf2e-grip-atk-btn";
              btn.title = `Atacar usando ${v.label} (${v.damageHint})`;
              btn.textContent = `${v.label} (${v.damageHint})`;
              btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                rollWeaponWithGrip(item, v.grip, ev);
              });
              wrap.appendChild(btn);
            }
            rollsCell.appendChild(wrap);
          }
        }
      });
    }

    _enhanceFavoritesOnSheet(rootEl) {
      if (!rootEl || !this.actor?.isOwner) return;

      const validCombatTypes = new Set(["arma"]);
      const validInventoryTypes = new Set(["equipamento", "consumivel", "tesouro"]);
      const validPowerSpellTypes = new Set(["magia", "poder"]);

      const selector = ".tab.combat .item[data-item-id], .tab.powers .item[data-item-id], .tab.spells .item[data-item-id], .tab.inventory .item[data-item-id]";

      rootEl.querySelectorAll(selector).forEach((row) => {
        const itemId = row.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;

        // Skip weapons in inventory tab (weapons are favorited in combat tab)
        const inInv = row.closest(".tab.inventory");
        const inCombat = row.closest(".tab.combat");
        if (inInv && !validInventoryTypes.has(item.type)) return;
        if (inCombat && !validCombatTypes.has(item.type)) return;
        if (!inInv && !inCombat && !validPowerSpellTypes.has(item.type)) return;

        if (row.querySelector(".pf2e-star-btn")) return;

        const isFav = Boolean(item.flags?.tormenta20?.favorito);
        const starBtn = document.createElement("a");
        starBtn.className = `pf2e-star-btn ${isFav ? "is-favorite" : ""}`;
        starBtn.dataset.tooltip = isFav ? "Remover dos Atalhos Rápidos (Favorito)" : "Adicionar aos Atalhos Rápidos (Favorito)";
        starBtn.setAttribute("aria-label", "Favorito");
        starBtn.innerHTML = `<i class="${isFav ? "fa-solid fa-star" : "fa-regular fa-star"}"></i>`;

        starBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const current = Boolean(item.flags?.tormenta20?.favorito);
          await item.setFlag("tormenta20", "favorito", !current);
        });

        const nameEl = row.querySelector(".item-name");
        if (nameEl) {
          nameEl.prepend(starBtn);
        }
      });
    }
  };
}

