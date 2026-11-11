import { CompendiumBrowserT20 } from "./browser/compendium-browser.js";
import { T20CompendiumIndex } from "./browser/compendium-index.js";
import { buildPF2eSheetClass } from "./sheet/pf2e-actor-sheet.js";
import { EffectsPanelT20 } from "./features/effects-panel.js";
import { openCheckPromptDialog, registerCheckPromptAndEnricher } from "./features/check-prompt.js";
import { PartySheetT20 } from "./features/party-sheet.js";
import { initChatEnhancer } from "./features/chat-enhancer.js";
import { initNpcScaler } from "./features/npc-scaler.js";
import { initCombatEnhancer } from "./features/combat-enhancer.js";
import { ForgeModalT20 } from "./features/forge-modal.js";
import { LootMerchantAppT20 } from "./features/loot-merchant.js";
import { registerTokenVitalsSettings, TokenVitalsHudT20 } from "./features/token-vitals.js";
import { registerTokenQuickActionsSettings, TokenQuickActionsT20 } from "./features/token-quick-actions.js";
import { registerTokenVisionSettings, TokenVisionT20 } from "./features/token-vision.js";
import { initSheetUxEnhancers } from "./features/sheet-ux-enhancers.js";
import { initArtonUiTheme } from "./features/arton-ui-theme.js";
import { computeActorProgression, syncClassLevelProgression } from "./automation/progression-slots.js";
import { levelUpClassOnActor } from "./automation/character-builders.js";

const MODULE_ID = "t20-compendios-completos";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "makeDefaultSheet", {
    name: "T20COMP.Settings.MakeDefaultName",
    hint: "T20COMP.Settings.MakeDefaultHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  registerTokenVitalsSettings();
  registerTokenQuickActionsSettings();
  registerTokenVisionSettings();
  registerCheckPromptAndEnricher();

  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/sheet/character-pf2e-sheet.hbs`,
    `modules/${MODULE_ID}/templates/browser/compendium-browser.hbs`,
    `modules/${MODULE_ID}/templates/hud/effects-panel.hbs`,
    `modules/${MODULE_ID}/templates/hud/token-vitals-hud.hbs`,
    `modules/${MODULE_ID}/templates/hud/token-quick-actions.hbs`,
    `modules/${MODULE_ID}/templates/apps/party-sheet.hbs`,
    `modules/${MODULE_ID}/templates/apps/forge-modal.hbs`,
    `modules/${MODULE_ID}/templates/apps/loot-merchant.hbs`
  ]);
});

Hooks.once("setup", () => {
  if (!globalThis.tormenta20?.applications?.ActorSheetT20CharacterTabbed) {
    console.warn(`${MODULE_ID} | ActorSheetT20CharacterTabbed not found; skipping modern sheet registration.`);
    return;
  }

  const ActorSheetT20PF2e = buildPF2eSheetClass();
  const makeDefault = game.settings.get(MODULE_ID, "makeDefaultSheet");

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, ActorSheetT20PF2e, {
    types: ["character"],
    makeDefault,
    label: "T20COMP.SheetLabel"
  });

  EffectsPanelT20.init();
  PartySheetT20.init();
  initChatEnhancer();
  initNpcScaler();
  initCombatEnhancer();
  ForgeModalT20.init();
  LootMerchantAppT20.init();
  TokenVitalsHudT20.init();
  TokenQuickActionsT20.init();
  TokenVisionT20.init();
  initSheetUxEnhancers();
  initArtonUiTheme();

  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      CompendiumBrowserT20,
      T20CompendiumIndex,
      ActorSheetT20PF2e,
      PartySheetT20,
      EffectsPanelT20,
      ForgeModalT20,
      LootMerchantAppT20,
      TokenVitalsHudT20,
      TokenQuickActionsT20,
      TokenVisionT20,
      openBrowser: (opts = {}, actor = null) => CompendiumBrowserT20.open(opts, actor),
      openPartySheet: (opts = {}) => PartySheetT20.open(opts),
      openCheckPrompt: () => openCheckPromptDialog(),
      openForge: (actor = null, itemId = null) => ForgeModalT20.open(actor || game.user.character, itemId),
      openLoot: (opts = {}) => LootMerchantAppT20.open(opts),
      syncTokenBars: () => TokenVitalsHudT20.syncAllTokenBars({ notify: true }),
      syncTokenVision: () => TokenVisionT20.syncAll({ notify: true }),
      computeProgression: (actor) => computeActorProgression(actor),
      syncClassProgression: (actor, cls, fromLvl, toLvl, opts) =>
        syncClassLevelProgression(actor, cls, fromLvl, toLvl, opts),
      levelUpClass: (actor, cls, nextLvl, opts) => levelUpClassOnActor(actor, cls, nextLvl, opts)
    };
  }

  console.log(`${MODULE_ID} | Ficha Moderna, Navegador e Recursos Tier 1-3 carregados (padrão=${makeDefault}).`);
});

Hooks.on("renderCompendiumDirectory", (_app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".t20pf2e-directory-btn")) return;

  const headerActions = root.querySelector(".header-actions") || root.querySelector(".directory-header");
  if (!headerActions) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "t20pf2e-directory-btn";
  btn.innerHTML = `<i class="fa-solid fa-book-atlas"></i> Navegador T20`;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    CompendiumBrowserT20.open({ category: "magias" });
  });
  headerActions.appendChild(btn);
});

