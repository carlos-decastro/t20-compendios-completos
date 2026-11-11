import {
  FORGE_ENCHANT_COSTS,
  FORGE_ENCANTOS_ARMADURAS,
  FORGE_ENCANTOS_ARMAS,
  FORGE_IMPROVEMENT_COSTS,
  FORGE_MATERIAIS,
  FORGE_MELHORIAS
} from "../data/forge-catalog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID = "t20-compendios-completos";
const FORGE_DESC_MARKER = "<!-- T20-FORGE-BLOCK -->";

function isForgeableItem(item) {
  return ["arma", "equipamento"].includes(item?.type);
}

function getEquipKind(item) {
  if (!item) return "all";
  if (item.type === "arma") return "arma";
  const t = String(item.system?.tipo || "").toLowerCase();
  if (t.includes("escud")) return "escudo";
  if (t.includes("esoter")) return "esoterico";
  if (t.includes("leve") || t.includes("pesad")) return "armadura";
  return "equipamento";
}

function getMaterialCost(mat, item) {
  if (!mat) return 0;
  if (item.type === "arma") return mat.armaCost || 1500;
  const sub = String(item.system?.tipo || "").toLowerCase();
  if (sub.includes("pesad")) return mat.armPesadaCost || 3000;
  if (sub.includes("escud")) return mat.escudoCost || 1500;
  if (sub.includes("esoter")) return mat.esotCost || 1500;
  return mat.armLeveCost || 1500;
}

function stripForgeBlock(html) {
  const s = String(html || "");
  const idx = s.indexOf(FORGE_DESC_MARKER);
  return idx === -1 ? s : s.slice(0, idx).trimEnd();
}

function cloneSnapshot(item) {
  const existing = item.getFlag(MODULE_ID, "forge")?.baseSnapshot;
  if (existing) return existing;
  return {
    name: item.name,
    preco: Number(item.system?.preco || 0),
    espacos: Number(item.system?.espacos || 0),
    criticoM: Number(item.system?.criticoM || 20),
    criticoX: Number(item.system?.criticoX || 2),
    armaduraValue: Number(item.system?.armadura?.value || 0),
    armaduraPen: Number(item.system?.armadura?.penalidade || 0),
    armaduraMaxAtr: Number(item.system?.armadura?.maxAtr || 0),
    rolls: foundry.utils.deepClone(item.system?.rolls || []),
    description: stripForgeBlock(item.system?.description?.value || "")
  };
}

export function getActorTotalTP(actor) {
  const d = actor?.system?.dinheiro || {};
  return Number(d.to || 0) * 10 + Number(d.tp || 0) + Number(d.tc || 0) * 0.1;
}

export async function deductActorTP(actor, amountTP) {
  if (!actor || amountTP <= 0) return true;
  const total = getActorTotalTP(actor);
  if (total + 0.001 < amountTP) return false;
  let remainingTenths = Math.round((total - amountTP) * 10);
  const to = Math.floor(remainingTenths / 100);
  remainingTenths %= 100;
  const tp = Math.floor(remainingTenths / 10);
  const tc = remainingTenths % 10;
  await actor.update({
    "system.dinheiro.to": to,
    "system.dinheiro.tp": tp,
    "system.dinheiro.tc": tc
  });
  return true;
}

/**
 * PF2e-inspired Item Forge Assistant (Melhorias, Materiais Especiais & Encantos).
 */
export class ForgeModalT20 extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
    this.itemId = options.itemId || null;
    this.selectedMelhorias = new Set();
    this.selectedMaterial = "";
    this.selectedEncantos = new Set();
    this.chargePlayer = !game.user.isGM;
    this._loadedItemId = null;
  }

  static DEFAULT_OPTIONS = {
    id: "t20-forge-modal",
    classes: ["t20pf2e-forge-app"],
    window: {
      title: "Assistente de Forja — Melhorias, Materiais & Encantos",
      icon: "fa-solid fa-hammer",
      resizable: true
    },
    position: {
      width: 780,
      height: 600
    },
    actions: {
      applyForge: ForgeModalT20._onApplyForge,
      resetForge: ForgeModalT20._onResetForge
    }
  };

  static PARTS = {
    main: {
      template: "modules/t20-compendios-completos/templates/apps/forge-modal.hbs"
    }
  };

  static init() {
    Hooks.on("tormenta20.getItemToggleContextOptions", (item, menuItems) => {
      if (!item?.isOwner || !isForgeableItem(item) || !Array.isArray(menuItems)) return;
      if (menuItems.some((m) => m?.name === "Forjar / Melhorar")) return;
      menuItems.push({
        name: "Forjar / Melhorar",
        icon: '<i class="fa-solid fa-hammer"></i>',
        onClick: () => ForgeModalT20.open(item.actor, item.id),
        callback: () => ForgeModalT20.open(item.actor, item.id)
      });
    });
  }

  static open(actor, itemId = null) {
    if (!actor) {
      ui.notifications.warn("Selecione um personagem para abrir a Forja.");
      return null;
    }
    return new this({ actor, itemId }).render({ force: true });
  }

  _syncSelectionFromItem(item) {
    if (!item || this._loadedItemId === item.id) return;
    this._loadedItemId = item.id;
    const saved = item.getFlag(MODULE_ID, "forge");
    this.selectedMelhorias = new Set(saved?.melhorias || []);
    this.selectedMaterial = saved?.material || "";
    this.selectedEncantos = new Set(saved?.encantos || []);
  }

  _computePreview(item) {
    const base = cloneSnapshot(item);
    const kind = getEquipKind(item);
    const melhorias = FORGE_MELHORIAS.filter((m) => this.selectedMelhorias.has(m.id));
    const material = FORGE_MATERIAIS.find((m) => m.id === this.selectedMaterial) || null;
    const encSource = item.type === "arma" ? FORGE_ENCANTOS_ARMAS : FORGE_ENCANTOS_ARMADURAS;
    const encantos = encSource.filter((e) => this.selectedEncantos.has(e.id));

    const totalSlots = melhorias.length + (material ? 1 : 0);
    const clampedSlots = Math.min(4, totalSlots);
    const impCost = FORGE_IMPROVEMENT_COSTS[clampedSlots] || 0;
    const matCost = getMaterialCost(material, item);
    const encCost = FORGE_ENCHANT_COSTS[Math.min(3, encantos.length)] || 0;
    const addedCost = impCost + matCost + encCost;
    const totalPrice = base.preco + addedCost;
    const deltaCharge = Math.max(0, totalPrice - Number(item.system?.preco || base.preco));

    let atkDelta = 0;
    let dmgDelta = 0;
    let critMDelta = 0;
    let critXDelta = 0;
    let defDelta = 0;
    let penDelta = 0;
    let maxAtrDelta = 0;
    let espDelta = 0;

    for (const m of melhorias) {
      atkDelta += m.atkDelta || 0;
      dmgDelta += m.dmgDelta || 0;
      critMDelta += m.critMDelta || 0;
      critXDelta += m.critXDelta || 0;
      defDelta += m.defDelta || 0;
      penDelta += m.penDelta || 0;
      maxAtrDelta += m.maxAtrDelta || 0;
      espDelta += m.espDelta || 0;
    }
    if (material) {
      if (item.type === "arma") critMDelta += material.critMDelta || 0;
      else {
        penDelta += material.penDelta || 0;
        espDelta += material.espDelta || 0;
      }
    }

    const tags = [];
    if (atkDelta) tags.push(`Ataque +${atkDelta}`);
    if (dmgDelta) tags.push(`Dano +${dmgDelta}`);
    if (critMDelta) tags.push(`Margem ${base.criticoM + critMDelta}`);
    if (critXDelta) tags.push(`Crítico ×${base.criticoX + critXDelta}`);
    if (defDelta) tags.push(`Defesa +${defDelta}`);
    if (penDelta) tags.push(`Penalidade ${Math.min(0, base.armaduraPen + penDelta)}`);
    if (maxAtrDelta) tags.push(`Des Máx +${maxAtrDelta}`);
    if (espDelta) tags.push(`Espaços ${Math.max(1, base.espacos + espDelta)}`);

    return {
      base,
      kind,
      melhorias,
      material,
      encantos,
      slotCount: totalSlots,
      enchantCount: encantos.length,
      addedCost,
      totalPrice,
      deltaCharge,
      deltas: { atkDelta, dmgDelta, critMDelta, critXDelta, defDelta, penDelta, maxAtrDelta, espDelta },
      previewDeltasText: tags.length ? tags.join(" · ") : "Efeitos descritivos / sem alteração direta nos números base"
    };
  }

  async _prepareContext() {
    const items = this.actor.items.filter(isForgeableItem).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (!items.length) return { actor: this.actor, hasItems: false };

    const selectedItem = items.find((i) => i.id === this.itemId) || items[0];
    this.itemId = selectedItem.id;
    this._syncSelectionFromItem(selectedItem);

    const calc = this._computePreview(selectedItem);
    const kind = calc.kind;

    const melhorias = FORGE_MELHORIAS.filter((m) =>
      m.appliesTo.includes("all") || m.appliesTo.includes(kind) || (selectedItem.type === "equipamento" && m.appliesTo.includes("equipamento"))
    ).map((m) => ({
      ...m,
      checked: this.selectedMelhorias.has(m.id)
    }));

    const materiais = FORGE_MATERIAIS.map((m) => ({
      ...m,
      selected: this.selectedMaterial === m.id,
      costText: `+T$ ${getMaterialCost(m, selectedItem)}`
    }));

    const canEnchant = selectedItem.type === "arma" || ["armadura", "escudo"].includes(kind);
    const rawEncantos = selectedItem.type === "arma" ? FORGE_ENCANTOS_ARMAS : FORGE_ENCANTOS_ARMADURAS;
    const encantos = canEnchant
      ? rawEncantos.map((e) => ({ ...e, checked: this.selectedEncantos.has(e.id) }))
      : [];

    return {
      hasItems: true,
      actor: this.actor,
      selectedItem,
      forgeableItems: items.map((i) => ({
        id: i.id,
        label: `${i.name} (${i.type === "arma" ? "Arma" : (i.system?.tipo || "Equip.")})`,
        selected: i.id === selectedItem.id
      })),
      melhorias,
      materiais,
      encantos,
      enchantScopeLabel: selectedItem.type === "arma" ? "Armas" : "Armaduras & Escudos",
      slotCount: calc.slotCount,
      enchantCount: calc.enchantCount,
      addedCostText: calc.addedCost.toLocaleString("pt-BR"),
      totalPriceText: calc.totalPrice.toLocaleString("pt-BR"),
      deltaChargeText: calc.deltaCharge.toLocaleString("pt-BR"),
      previewDeltasText: calc.previewDeltasText,
      actorTotalTP: Math.floor(getActorTotalTP(this.actor)).toLocaleString("pt-BR"),
      chargePlayer: this.chargePlayer
    };
  }

  _onRender() {
    const root = this.element;
    if (!root) return;

    root.querySelector(".t20pf2e-forge-select")?.addEventListener("change", (ev) => {
      this.itemId = ev.currentTarget.value;
      this._loadedItemId = null;
      this.render();
    });

    root.querySelector(".t20pf2e-forge-mat-select")?.addEventListener("change", (ev) => {
      const next = ev.currentTarget.value;
      const totalIf = this.selectedMelhorias.size + (next ? 1 : 0);
      if (totalIf > 4) {
        ui.notifications.warn("Um item pode ter no máximo 4 melhorias (incluindo Material Especial).");
        ev.currentTarget.value = this.selectedMaterial;
        return;
      }
      this.selectedMaterial = next;
      this.render();
    });

    root.querySelectorAll(".t20pf2e-forge-mel").forEach((cb) => {
      cb.addEventListener("change", (ev) => {
        const id = ev.currentTarget.value;
        if (ev.currentTarget.checked) {
          if (this.selectedMelhorias.size + (this.selectedMaterial ? 1 : 0) >= 4) {
            ui.notifications.warn("Limite máximo de 4 melhorias atingido.");
            ev.currentTarget.checked = false;
            return;
          }
          this.selectedMelhorias.add(id);
        } else {
          this.selectedMelhorias.delete(id);
        }
        this.render();
      });
    });

    root.querySelectorAll(".t20pf2e-forge-enc").forEach((cb) => {
      cb.addEventListener("change", (ev) => {
        const id = ev.currentTarget.value;
        if (ev.currentTarget.checked) {
          if (this.selectedEncantos.size >= 3) {
            ui.notifications.warn("Limite de até 3 encantos mágicos por item.");
            ev.currentTarget.checked = false;
            return;
          }
          this.selectedEncantos.add(id);
        } else {
          this.selectedEncantos.delete(id);
        }
        this.render();
      });
    });

    root.querySelector(".t20pf2e-forge-charge")?.addEventListener("change", (ev) => {
      this.chargePlayer = ev.currentTarget.checked;
    });
  }

  static async _onApplyForge() {
    const item = this.actor.items.get(this.itemId);
    if (!item) return;

    const calc = this._computePreview(item);
    if (this.chargePlayer && calc.deltaCharge > 0) {
      const ok = await deductActorTP(this.actor, calc.deltaCharge);
      if (!ok) {
        ui.notifications.warn(`${this.actor.name} não possui T$ ${calc.deltaCharge} suficientes.`);
        return;
      }
    }

    const base = calc.base;
    const labels = [
      ...calc.melhorias.map((m) => m.nome),
      ...(calc.material ? [calc.material.nome] : []),
      ...calc.encantos.map((e) => e.nome)
    ];

    const newName = labels.length ? `${base.name} (${labels.join(", ")})` : base.name;
    const forgeLines = [
      ...calc.melhorias.map((m) => `<p><strong>Melhoria — ${m.nome}:</strong> ${m.descricao}</p>`),
      ...(calc.material ? [`<p><strong>Material Especial — ${calc.material.nome}:</strong> ${calc.material.descricao}</p>`] : []),
      ...calc.encantos.map((e) => `<p><strong>Encanto — ${e.nome}:</strong> ${e.descricao}</p>`)
    ];
    const newDesc = labels.length
      ? `${base.description}\n${FORGE_DESC_MARKER}<hr/><h4>Forja & Encantamentos</h4>${forgeLines.join("")}`
      : base.description;

    const updates = {
      name: newName,
      "system.preco": calc.totalPrice,
      "system.espacos": Math.max(base.espacos > 0 ? 1 : 0, base.espacos + calc.deltas.espDelta),
      "system.description.value": newDesc,
      [`flags.${MODULE_ID}.forge`]: {
        baseSnapshot: base,
        melhorias: [...this.selectedMelhorias],
        material: this.selectedMaterial,
        encantos: [...this.selectedEncantos]
      }
    };

    if (item.type === "arma") {
      updates["system.criticoM"] = Math.max(2, base.criticoM + calc.deltas.critMDelta);
      updates["system.criticoX"] = Math.max(2, base.criticoX + calc.deltas.critXDelta);

      const nextRolls = foundry.utils.deepClone(base.rolls || []);
      const atkRoll = nextRolls.find((r) => r.type === "ataque");
      if (atkRoll) {
        atkRoll.parts = Array.isArray(atkRoll.parts) ? atkRoll.parts : [[], ["luta", ""], [""]];
        while (atkRoll.parts.length < 3) atkRoll.parts.push([""]);
        const curBonus = Number(atkRoll.parts[2]?.[0] || 0);
        const sumBonus = curBonus + calc.deltas.atkDelta;
        atkRoll.parts[2] = [sumBonus ? String(sumBonus) : ""];
      }
      const dmgRoll = nextRolls.find((r) => r.type === "dano");
      if (dmgRoll && calc.deltas.dmgDelta) {
        dmgRoll.parts = Array.isArray(dmgRoll.parts) ? dmgRoll.parts : [];
        dmgRoll.parts.push([String(calc.deltas.dmgDelta), "dano"]);
      }
      updates["system.rolls"] = nextRolls;
    } else {
      updates["system.armadura.value"] = base.armaduraValue + calc.deltas.defDelta;
      updates["system.armadura.penalidade"] = Math.min(0, base.armaduraPen + calc.deltas.penDelta);
      updates["system.armadura.maxAtr"] = base.armaduraMaxAtr + calc.deltas.maxAtrDelta;
    }

    await item.update(updates);
    ui.notifications.info(`Forja aplicada em "${newName}"!`);
    await this.close();
  }

  static async _onResetForge() {
    const item = this.actor.items.get(this.itemId);
    if (!item) return;
    const saved = item.getFlag(MODULE_ID, "forge");
    if (!saved?.baseSnapshot) {
      this.selectedMelhorias.clear();
      this.selectedMaterial = "";
      this.selectedEncantos.clear();
      this.render();
      return;
    }
    const base = saved.baseSnapshot;
    const updates = {
      name: base.name,
      "system.preco": base.preco,
      "system.espacos": base.espacos,
      "system.description.value": base.description,
      [`flags.${MODULE_ID}.-=forge`]: null
    };
    if (item.type === "arma") {
      updates["system.criticoM"] = base.criticoM;
      updates["system.criticoX"] = base.criticoX;
      updates["system.rolls"] = foundry.utils.deepClone(base.rolls || []);
    } else {
      updates["system.armadura.value"] = base.armaduraValue;
      updates["system.armadura.penalidade"] = base.armaduraPen;
      updates["system.armadura.maxAtr"] = base.armaduraMaxAtr;
    }
    await item.update(updates);
    this.selectedMelhorias.clear();
    this.selectedMaterial = "";
    this.selectedEncantos.clear();
    this._loadedItemId = null;
    ui.notifications.info(`"${base.name}" restaurado ao estado original.`);
    this.render();
  }
}

