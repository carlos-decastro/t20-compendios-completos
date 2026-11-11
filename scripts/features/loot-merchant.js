import { T20CompendiumIndex } from "../browser/compendium-index.js";
import { getActorTotalTP, deductActorTP } from "./forge-modal.js";

const MODULE_ID = "t20-compendios-completos";
const SOCKET_NAME = `module.${MODULE_ID}`;
const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/apps/loot-merchant.hbs`;

const ND_OPTIONS = [
  { value: "0.25", label: "ND 1/4" },
  { value: "0.5", label: "ND 1/2" },
  { value: "1", label: "ND 1" },
  { value: "2", label: "ND 2" },
  { value: "3", label: "ND 3" },
  { value: "4", label: "ND 4" },
  { value: "5", label: "ND 5" },
  { value: "6", label: "ND 6" },
  { value: "7", label: "ND 7" },
  { value: "8", label: "ND 8" },
  { value: "9", label: "ND 9" },
  { value: "10", label: "ND 10" },
  { value: "12", label: "ND 12" },
  { value: "15", label: "ND 15" },
  { value: "18", label: "ND 18" },
  { value: "20", label: "ND 20" }
];

const STORE_PRESETS = {
  emporio: { label: "Empório Geral", types: ["equipamento", "consumivel", "tesouro"], count: 14, maxPrice: 800 },
  armeiro: { label: "Armeiro & Ferreiro", types: ["arma"], count: 14, maxPrice: 2000 },
  boticario: { label: "Boticário & Alquimista", types: ["consumivel"], count: 14, maxPrice: 1200 },
  arcano: { label: "Empório Arcano", types: ["consumivel", "equipamento", "tesouro"], count: 12, maxPrice: 12000 }
};

const MARKUP_OPTIONS = [
  { value: "0.75", label: "75% (Desconto)" },
  { value: "1", label: "100% (Padrão)" },
  { value: "1.25", label: "125% (Escassez)" },
  { value: "1.5", label: "150% (Luxo)" }
];

const TYPE_LABELS = {
  arma: "Arma",
  equipamento: "Equipamento / Armadura",
  consumivel: "Consumível",
  tesouro: "Tesouro"
};

function defaultState() {
  return {
    coins: { to: 0, tp: 0, tc: 0 },
    chestItems: [],
    merchantStock: [],
    merchantPreset: "emporio",
    markup: 1,
    lastND: "3"
  };
}

function getState() {
  try {
    const raw = game.settings.get(MODULE_ID, "lootState");
    return {
      ...defaultState(),
      ...(raw && typeof raw === "object" ? raw : {}),
      coins: { to: 0, tp: 0, tc: 0, ...(raw?.coins || {}) },
      chestItems: Array.isArray(raw?.chestItems) ? foundry.utils.deepClone(raw.chestItems) : [],
      merchantStock: Array.isArray(raw?.merchantStock) ? foundry.utils.deepClone(raw.merchantStock) : []
    };
  } catch (_e) {
    return defaultState();
  }
}

async function saveState(nextState) {
  await game.settings.set(MODULE_ID, "lootState", nextState);
  game.socket?.emit(SOCKET_NAME, { action: "lootStateUpdated" });
  LootMerchantAppT20._instance?.render({ force: true });
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Curva aproximada da Tabela 8-1: Tesouro por ND de Tormenta20.
 */
function rollTreasureCoinsForND(ndNum) {
  const roll = (mult) => Math.max(1, Math.floor((Math.random() * 0.7 + 0.65) * mult));
  if (ndNum < 1) {
    return { to: 0, tp: roll(ndNum <= 0.25 ? 25 : 50), tc: roll(40) };
  }
  if (ndNum <= 4) {
    const tp = roll(ndNum * 95);
    return { to: 0, tp, tc: 0 };
  }
  if (ndNum <= 10) {
    const tp = roll(ndNum * 380);
    return { to: Math.floor(tp / 40), tp: tp - Math.floor(tp / 40) * 10, tc: 0 };
  }
  const tp = roll(ndNum * 1100);
  const to = Math.floor(tp / 20);
  return { to, tp: Math.max(0, tp - to * 10), tc: 0 };
}

function buildItemEntry(doc, qty = 1) {
  const price = Math.max(0, Number(doc.system?.preco || 0));
  return {
    id: foundry.utils.randomID(),
    uuid: doc.uuid,
    name: doc.name,
    img: doc.img || "icons/containers/chest/chest-wooden-brass.webp",
    type: doc.type || "equipamento",
    typeLabel: TYPE_LABELS[doc.type] || "Item",
    price,
    qty: Math.max(1, Number(qty || 1))
  };
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LootMerchantAppT20 extends HandlebarsApplicationMixin(ApplicationV2) {
  static _instance = null;

  static DEFAULT_OPTIONS = {
    id: "t20pf2e-loot-merchant",
    classes: ["t20pf2e-loot-app"],
    window: {
      title: "Baú de Tesouro & Mercador (Estilo PF2e)",
      icon: "fa-solid fa-sack-dollar",
      resizable: true
    },
    position: {
      width: 780,
      height: 640
    },
    actions: {
      switchTab: LootMerchantAppT20._onSwitchTab,
      generateTreasure: LootMerchantAppT20._onGenerateTreasure,
      browseToAdd: LootMerchantAppT20._onBrowseToAdd,
      clearChest: LootMerchantAppT20._onClearChest,
      editCoins: LootMerchantAppT20._onEditCoins,
      splitCoins: LootMerchantAppT20._onSplitCoins,
      claimCoins: LootMerchantAppT20._onClaimCoins,
      takeItem: LootMerchantAppT20._onTakeItem,
      removeChestItem: LootMerchantAppT20._onRemoveChestItem,
      restockMerchant: LootMerchantAppT20._onRestockMerchant,
      buyItem: LootMerchantAppT20._onBuyItem,
      removeMerchantItem: LootMerchantAppT20._onRemoveMerchantItem
    }
  };

  static PARTS = {
    main: { template: TEMPLATE_PATH }
  };

  constructor(options = {}) {
    super(options);
    this.activeTab = options.tab || "chest";
    this.selectedBuyerId = options.actorId || "";
  }

  static init() {
    game.settings.register(MODULE_ID, "lootState", {
      name: "Estado do Baú & Mercador",
      scope: "world",
      config: false,
      type: Object,
      default: defaultState()
    });

    Hooks.on("getSceneControlButtons", (controls) => {
      const tokenControls = controls?.tokens;
      if (!tokenControls?.tools) return;
      tokenControls.tools["t20pf2e-loot-merchant"] = {
        name: "t20pf2e-loot-merchant",
        order: 97,
        title: "Baú de Tesouro & Mercador (T20)",
        icon: "fa-solid fa-sack-dollar",
        button: true,
        onChange: () => LootMerchantAppT20.open()
      };
    });

    game.socket?.on(SOCKET_NAME, async (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.action === "lootStateUpdated") {
        LootMerchantAppT20._instance?.render({ force: true });
        return;
      }
      if (!game.user.isGM) return;

      if (payload.action === "takeChestItem") {
        await LootMerchantAppT20._gmTakeItem(payload.entryId, payload.actorId);
      } else if (payload.action === "buyMerchantItem") {
        await LootMerchantAppT20._gmBuyItem(payload.entryId, payload.actorId);
      } else if (payload.action === "claimChestCoins") {
        await LootMerchantAppT20._gmClaimCoins(payload.actorId);
      }
    });
  }

  static open(options = {}) {
    if (!this._instance) {
      this._instance = new LootMerchantAppT20(options);
    } else {
      if (options.tab) this._instance.activeTab = options.tab;
      if (options.actorId) this._instance.selectedBuyerId = options.actorId;
    }
    this._instance.render({ force: true });
    return this._instance;
  }

  static async addToChest(itemDoc, qty = 1) {
    if (!game.user.isGM) {
      ui.notifications.warn("Apenas o Mestre pode adicionar itens ao baú diretamente.");
      return;
    }
    const state = getState();
    const existing = state.chestItems.find((x) => x.uuid === itemDoc.uuid);
    if (existing) {
      existing.qty += Math.max(1, Number(qty || 1));
    } else {
      state.chestItems.push(buildItemEntry(itemDoc, qty));
    }
    await saveState(state);
    ui.notifications.info(`${itemDoc.name} adicionado ao Baú de Tesouro.`);
  }

  _getBuyerActors() {
    const owned = game.actors
      .filter((a) => a.type === "character" && (game.user.isGM || a.isOwner))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return owned;
  }

  async _prepareContext() {
    const state = getState();
    const buyers = this._getBuyerActors();
    if (!this.selectedBuyerId || !buyers.some((a) => a.id === this.selectedBuyerId)) {
      const assigned = game.user.character;
      this.selectedBuyerId = (assigned && buyers.some((a) => a.id === assigned.id))
        ? assigned.id
        : (buyers[0]?.id || "");
    }

    const buyerActor = buyers.find((a) => a.id === this.selectedBuyerId) || null;
    const buyerTP = buyerActor ? getActorTotalTP(buyerActor) : 0;

    const chestTotalTP = Number(state.coins.to || 0) * 10
      + Number(state.coins.tp || 0)
      + Number((Number(state.coins.tc || 0) * 0.1).toFixed(1));

    const markup = Number(state.markup || 1);
    const merchantPreset = STORE_PRESETS[state.merchantPreset] ? state.merchantPreset : "emporio";

    return {
      isGM: game.user.isGM,
      activeTab: this.activeTab,
      buyerActors: buyers.map((a) => ({
        id: a.id,
        name: a.name,
        selected: a.id === this.selectedBuyerId,
        tpFormatted: `${getActorTotalTP(a).toLocaleString("pt-BR")} T$`
      })),
      selectedBuyer: buyerActor
        ? { id: buyerActor.id, name: buyerActor.name, tpFormatted: `${buyerTP.toLocaleString("pt-BR")} T$` }
        : null,
      chestCoins: {
        to: Number(state.coins.to || 0),
        tp: Number(state.coins.tp || 0),
        tc: Number(state.coins.tc || 0),
        totalTP: chestTotalTP.toLocaleString("pt-BR")
      },
      chestItems: state.chestItems,
      merchantItems: state.merchantStock.map((item) => {
        const finalPrice = Math.max(1, Math.round(Number(item.price || 0) * markup));
        return {
          ...item,
          finalPrice,
          canAfford: Boolean(buyerActor) && buyerTP >= finalPrice
        };
      }),
      merchantTitle: STORE_PRESETS[merchantPreset].label,
      markupPct: Math.round(markup * 100),
      ndOptions: ND_OPTIONS.map((o) => ({ ...o, selected: o.value === String(state.lastND || "3") })),
      presetOptions: Object.entries(STORE_PRESETS).map(([value, cfg]) => ({
        value,
        label: cfg.label,
        selected: value === merchantPreset
      })),
      markupOptions: MARKUP_OPTIONS.map((o) => ({ ...o, selected: Number(o.value) === markup }))
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;

    root.querySelector("[data-loot-buyer]")?.addEventListener("change", (ev) => {
      this.selectedBuyerId = ev.currentTarget.value;
      this.render({ force: true });
    });

    root.querySelector("[data-nd-select]")?.addEventListener("change", async (ev) => {
      if (!game.user.isGM) return;
      const state = getState();
      state.lastND = ev.currentTarget.value;
      await game.settings.set(MODULE_ID, "lootState", state);
    });

    root.querySelector("[data-preset-select]")?.addEventListener("change", async (ev) => {
      if (!game.user.isGM) return;
      const state = getState();
      state.merchantPreset = ev.currentTarget.value;
      await game.settings.set(MODULE_ID, "lootState", state);
    });

    root.querySelector("[data-markup-select]")?.addEventListener("change", async (ev) => {
      if (!game.user.isGM) return;
      const state = getState();
      state.markup = Number(ev.currentTarget.value) || 1;
      await saveState(state);
    });

    const dropzone = root.querySelector("[data-chest-dropzone]");
    if (dropzone && game.user.isGM) {
      dropzone.addEventListener("dragover", (ev) => ev.preventDefault());
      dropzone.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        if (data?.type !== "Item" || !data.uuid) return;
        const doc = await fromUuid(data.uuid).catch(() => null);
        if (!doc) return;
        await LootMerchantAppT20.addToChest(doc, 1);
      });
    }
  }

  static _onSwitchTab(_event, target) {
    this.activeTab = target.dataset.tab || "chest";
    this.render({ force: true });
  }

  static _onBrowseToAdd() {
    game.modules.get(MODULE_ID)?.api?.openBrowser({ category: "equipamentos" });
  }

  static async _onGenerateTreasure() {
    if (!game.user.isGM) return;
    try {
      const ndVal = Number(this.element?.querySelector("[data-nd-select]")?.value || getState().lastND || 3);
      const state = getState();
      state.lastND = String(ndVal);

      const rolled = rollTreasureCoinsForND(ndVal);
      state.coins.to += rolled.to;
      state.coins.tp += rolled.tp;
      state.coins.tc += rolled.tc;

      const cats = await T20CompendiumIndex.getCategories();
      const index = cats?.equipamentos || [];
      const budgetPerItem = ndVal < 1 ? 50 : ndVal <= 4 ? 400 : ndVal <= 10 ? 2500 : 12000;
      let eligible = index.filter((entry) => {
        const p = Number(entry.system?.preco || 0);
        return p > 0 && p <= budgetPerItem && ["arma", "equipamento", "consumivel", "tesouro"].includes(entry.itemType);
      });
      if (!eligible.length) {
        eligible = index.filter((entry) => ["arma", "equipamento", "consumivel", "tesouro"].includes(entry.itemType));
      }

      const itemCount = ndVal < 1 ? 1 : ndVal <= 5 ? 2 : 3;
      const addedNames = [];
      for (let i = 0; i < itemCount; i++) {
        const pick = pickRandom(eligible);
        if (!pick) break;
        const doc = await fromUuid(pick.uuid).catch(() => null);
        if (!doc) continue;
        state.chestItems.push(buildItemEntry(doc, 1));
        addedNames.push(doc.name);
      }

      await saveState(state);
      ui.notifications.info(
        `Tesouro ND ${ndVal} gerado: +${rolled.to} TO, +${rolled.tp} T$, +${rolled.tc} TC${addedNames.length ? ` e ${addedNames.join(", ")}` : ""}.`
      );
    } catch (err) {
      console.error(`${MODULE_ID} | Erro ao gerar tesouro:`, err);
      ui.notifications.error(`Erro ao gerar tesouro: ${err?.message || err}`);
    }
  }

  static async _onClearChest() {
    if (!game.user.isGM) return;
    const state = getState();
    state.chestItems = [];
    state.coins = { to: 0, tp: 0, tc: 0 };
    await saveState(state);
  }

  static async _onEditCoins() {
    if (!game.user.isGM) return;
    const state = getState();
    const content = `
      <div class="t20pf2e-dialog-body">
        <div class="t20pf2e-section">
          <div class="t20pf2e-field"><label>TO (Ouro):</label><input type="number" name="to" value="${state.coins.to}" min="0" /></div>
          <div class="t20pf2e-field"><label>T$ (Prata):</label><input type="number" name="tp" value="${state.coins.tp}" min="0" /></div>
          <div class="t20pf2e-field"><label>TC (Cobre):</label><input type="number" name="tc" value="${state.coins.tc}" min="0" /></div>
        </div>
      </div>
    `;
    const res = await foundry.applications.api.DialogV2.wait({
      classes: ["t20pf2e-dialog-window"],
      window: { title: "Ajustar Moedas do Baú" },
      content,
      buttons: [
        {
          action: "save",
          label: "Salvar",
          default: true,
          callback: (_ev, btn) => ({
            to: Math.max(0, Number(btn.form?.elements?.to?.value || 0)),
            tp: Math.max(0, Number(btn.form?.elements?.tp?.value || 0)),
            tc: Math.max(0, Number(btn.form?.elements?.tc?.value || 0))
          })
        },
        { action: "cancel", label: "Cancelar", callback: () => null }
      ]
    });
    if (!res) return;
    const next = getState();
    next.coins = res;
    await saveState(next);
  }

  static async _onSplitCoins() {
    if (!game.user.isGM) return;
    const pcs = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);
    if (!pcs.length) {
      ui.notifications.warn("Nenhum PJ com jogador associado encontrado.");
      return;
    }
    const state = getState();
    const totalTO = Number(state.coins.to || 0);
    const totalTP = Number(state.coins.tp || 0);
    const totalTC = Number(state.coins.tc || 0);
    if (totalTO + totalTP + totalTC <= 0) {
      ui.notifications.warn("Não há moedas no baú para dividir.");
      return;
    }

    const eachTO = Math.floor(totalTO / pcs.length);
    const eachTP = Math.floor(totalTP / pcs.length);
    const eachTC = Math.floor(totalTC / pcs.length);

    for (const actor of pcs) {
      const cur = actor.system?.dinheiro || {};
      await actor.update({
        "system.dinheiro.to": Number(cur.to || 0) + eachTO,
        "system.dinheiro.tp": Number(cur.tp || 0) + eachTP,
        "system.dinheiro.tc": Number(cur.tc || 0) + eachTC
      });
    }

    state.coins.to = totalTO - eachTO * pcs.length;
    state.coins.tp = totalTP - eachTP * pcs.length;
    state.coins.tc = totalTC - eachTC * pcs.length;
    await saveState(state);

    await ChatMessage.create({
      content: `<div class="t20pf2e-chat-card"><strong>Baú Dividido (${pcs.length} PJs)</strong><br/>Cada personagem recebeu: <b>${eachTO} TO</b>, <b>${eachTP} T$</b>, <b>${eachTC} TC</b>.</div>`
    });
  }

  static async _onClaimCoins() {
    const actorId = this.selectedBuyerId;
    if (!actorId) return ui.notifications.warn("Selecione um personagem primeiro.");
    if (game.user.isGM) {
      await LootMerchantAppT20._gmClaimCoins(actorId);
    } else {
      game.socket?.emit(SOCKET_NAME, { action: "claimChestCoins", actorId });
    }
  }

  static async _gmClaimCoins(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const state = getState();
    const { to, tp, tc } = state.coins;
    if (to + tp + tc <= 0) return;

    const cur = actor.system?.dinheiro || {};
    await actor.update({
      "system.dinheiro.to": Number(cur.to || 0) + to,
      "system.dinheiro.tp": Number(cur.tp || 0) + tp,
      "system.dinheiro.tc": Number(cur.tc || 0) + tc
    });
    state.coins = { to: 0, tp: 0, tc: 0 };
    await saveState(state);
    await ChatMessage.create({
      content: `<div class="t20pf2e-chat-card"><b>${foundry.utils.escapeHTML(actor.name)}</b> recolheu as moedas do baú (${to} TO, ${tp} T$, ${tc} TC).</div>`
    });
  }

  static async _onTakeItem(_event, target) {
    const entryId = target.dataset.entryId;
    const actorId = this.selectedBuyerId;
    if (!entryId || !actorId) return ui.notifications.warn("Selecione um personagem primeiro.");

    if (game.user.isGM) {
      await LootMerchantAppT20._gmTakeItem(entryId, actorId);
    } else {
      game.socket?.emit(SOCKET_NAME, { action: "takeChestItem", entryId, actorId });
    }
  }

  static async _gmTakeItem(entryId, actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const state = getState();
    const idx = state.chestItems.findIndex((i) => i.id === entryId);
    if (idx < 0) return;

    const entry = state.chestItems[idx];
    const doc = await fromUuid(entry.uuid).catch(() => null);
    if (!doc) return ui.notifications.warn("Documento original não encontrado.");

    const itemData = doc.toObject();
    if (itemData.system?.qtd != null) itemData.system.qtd = 1;
    await actor.createEmbeddedDocuments("Item", [itemData]);

    if (entry.qty > 1) entry.qty -= 1;
    else state.chestItems.splice(idx, 1);

    await saveState(state);
    await ChatMessage.create({
      content: `<div class="t20pf2e-chat-card"><b>${foundry.utils.escapeHTML(actor.name)}</b> pegou <b>${foundry.utils.escapeHTML(entry.name)}</b> do Baú de Tesouro.</div>`
    });
  }

  static async _onRemoveChestItem(_event, target) {
    if (!game.user.isGM) return;
    const entryId = target.dataset.entryId;
    const state = getState();
    state.chestItems = state.chestItems.filter((i) => i.id !== entryId);
    await saveState(state);
  }

  static async _onRestockMerchant() {
    if (!game.user.isGM) return;
    try {
      const state = getState();
      const presetKey = this.element?.querySelector("[data-preset-select]")?.value || state.merchantPreset || "emporio";
      const preset = STORE_PRESETS[presetKey] || STORE_PRESETS.emporio;
      state.merchantPreset = presetKey;

      const cats = await T20CompendiumIndex.getCategories();
      const index = cats?.equipamentos || [];
      const pool = index.filter((entry) => {
        const p = Number(entry.system?.preco || 0);
        return p > 0 && p <= preset.maxPrice && preset.types.includes(entry.itemType);
      });

      const chosen = new Set();
      const stock = [];
      let guard = 0;
      while (stock.length < preset.count && guard < 120 && pool.length) {
        guard++;
        const pick = pickRandom(pool);
        if (!pick || chosen.has(pick.uuid)) continue;
        chosen.add(pick.uuid);
        const doc = await fromUuid(pick.uuid).catch(() => null);
        if (!doc) continue;
        const qty = pick.itemType === "consumivel" ? (Math.floor(Math.random() * 4) + 1) : 1;
        stock.push(buildItemEntry(doc, qty));
      }

      stock.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "pt-BR"));
      state.merchantStock = stock;
      await saveState(state);
      ui.notifications.info(`${preset.label} reestocado com ${stock.length} itens.`);
    } catch (err) {
      console.error(`${MODULE_ID} | Erro ao reestocar loja:`, err);
      ui.notifications.error(`Erro ao reestocar loja: ${err?.message || err}`);
    }
  }

  static async _onBuyItem(_event, target) {
    const entryId = target.dataset.entryId;
    const actorId = this.selectedBuyerId;
    if (!entryId || !actorId) return ui.notifications.warn("Selecione um personagem primeiro.");

    if (game.user.isGM) {
      await LootMerchantAppT20._gmBuyItem(entryId, actorId);
    } else {
      game.socket?.emit(SOCKET_NAME, { action: "buyMerchantItem", entryId, actorId });
    }
  }

  static async _gmBuyItem(entryId, actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const state = getState();
    const idx = state.merchantStock.findIndex((i) => i.id === entryId);
    if (idx < 0) return;

    const entry = state.merchantStock[idx];
    const finalPrice = Math.max(1, Math.round(Number(entry.price || 0) * Number(state.markup || 1)));
    const paid = await deductActorTP(actor, finalPrice);
    if (!paid) {
      ui.notifications.warn(`${actor.name} não possui ${finalPrice} T$ suficientes.`);
      return;
    }

    const doc = await fromUuid(entry.uuid).catch(() => null);
    if (!doc) return;
    const itemData = doc.toObject();
    if (itemData.system?.qtd != null) itemData.system.qtd = 1;
    await actor.createEmbeddedDocuments("Item", [itemData]);

    if (entry.qty > 1) entry.qty -= 1;
    else state.merchantStock.splice(idx, 1);

    await saveState(state);
    await ChatMessage.create({
      content: `<div class="t20pf2e-chat-card"><b>${foundry.utils.escapeHTML(actor.name)}</b> comprou <b>${foundry.utils.escapeHTML(entry.name)}</b> por <b>${finalPrice} T$</b>.</div>`
    });
  }

  static async _onRemoveMerchantItem(_event, target) {
    if (!game.user.isGM) return;
    const entryId = target.dataset.entryId;
    const state = getState();
    state.merchantStock = state.merchantStock.filter((i) => i.id !== entryId);
    await saveState(state);
  }
}

