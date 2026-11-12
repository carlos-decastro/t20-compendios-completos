import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createInitialWizardDraft } from "../scripts/wizard/wizard-state.js";
import { commitCharacterWizard, resolveStarterKitFromCatalog } from "../scripts/wizard/wizard-builder.js";

test("resolveStarterKitFromCatalog matches known class equipment cleanly", () => {
  const catalog = [
    { uuid: "eq-espadalonga", name: "Espada Longa", itemType: "arma", img: "sword.png", system: { preco: 15 } },
    { uuid: "eq-brunea", name: "Brunea", itemType: "equipamento", img: "armor.png", system: { preco: 50 } },
    { uuid: "eq-escudo", name: "Escudo Leve", itemType: "equipamento", img: "shield.png", system: { preco: 15 } },
    { uuid: "eq-mochila", name: "Mochila", itemType: "equipamento", img: "pack.png", system: { preco: 2 } }
  ];

  const kit = resolveStarterKitFromCatalog("Guerreiro", catalog);
  assert.deepEqual(kit.map((k) => k.name), ["Espada Longa", "Brunea", "Escudo Leve", "Mochila"]);
});

test("commitCharacterWizard creates actor atomically and neutralizes Race popup/grants duplication", async () => {
  const createdActors = [];
  const docMap = new Map([
    [
      "Compendium.race.humano",
      {
        uuid: "Compendium.race.humano",
        name: "Humano",
        toObject: () => ({
          name: "Humano",
          type: "race",
          system: {
            atributos: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 },
            atributosDinamicos: { value: ["for", "des", "con", "int", "sab", "car"], description: "+1 em Três Atributos" },
            grants: [{ title: "Versátil", type: "auto", choices: [{ uuid: "Compendium.poder.versatil" }] }]
          }
        })
      }
    ],
    [
      "Compendium.poder.versatil",
      { uuid: "Compendium.poder.versatil", name: "Versátil", toObject: () => ({ name: "Versátil", type: "poder", system: {} }) }
    ],
    [
      "Compendium.classe.guerreiro",
      {
        uuid: "Compendium.classe.guerreiro",
        name: "Guerreiro",
        toObject: () => ({ name: "Guerreiro", type: "classe", system: { pvPorNivel: 5, pmPorNivel: 3, niveis: 1 } })
      }
    ],
    [
      "Compendium.poder.ataque-especial",
      { uuid: "Compendium.poder.ataque-especial", name: "Ataque Especial", toObject: () => ({ name: "Ataque Especial", type: "poder", system: {} }) }
    ],
    [
      "Compendium.equip.espada",
      { uuid: "Compendium.equip.espada", name: "Espada Longa", toObject: () => ({ name: "Espada Longa", type: "arma", system: { preco: 15, qtd: 1 } }) }
    ]
  ]);

  globalThis.game = { packs: { get: () => null } };
  globalThis.fromUuid = async (uuid) => docMap.get(uuid) || null;
  globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
  globalThis.Actor = {
    create: async (payload) => {
      const state = {
        id: "actor-1",
        name: payload.name,
        img: payload.img,
        items: [],
        itemTypes: { race: [], classe: [] },
        system: {
          attributes: { pv: { value: 0, max: 23 }, pm: { value: 0, max: 3 }, conjuracao: "" },
          pericias: {
            luta: { treinado: false },
            fort: { treinado: false },
            inic: { treinado: false },
            perc: { treinado: false },
            atle: { treinado: false },
            refl: { treinado: false }
          }
        },
        flags: {},
        async update(patch) {
          this.updates.push(patch);
        },
        updates: [],
        async setFlag(scope, k, v) {
          this.flags[scope] = this.flags[scope] || {};
          this.flags[scope][k] = v;
        },
        async createEmbeddedDocuments(_docType, list) {
          for (const it of list) {
            const created = { ...it, id: `it-${this.items.length + 1}` };
            this.items.push(created);
            if (created.type === "race") this.itemTypes.race.push(created);
            if (created.type === "classe") this.itemTypes.classe.push(created);
          }
          return list;
        },
        async updateEmbeddedDocuments(_docType, patches) {
          for (const patch of patches) {
            const target = this.items.find((i) => i.id === patch._id);
            if (target) Object.assign(target, patch);
          }
          return patches;
        },
        async deleteEmbeddedDocuments(_docType, ids) {
          const idSet = new Set(ids);
          this.items = this.items.filter((i) => !idSet.has(i.id));
          return ids;
        },
        prepareData() {},
        sheet: { renderCalled: false, render() { this.renderCalled = true; } }
      };
      createdActors.push(state);
      return state;
    }
  };

  const draft = createInitialWizardDraft();
  draft.identity.name = "Ronan";
  draft.attributes.base = { for: 4, des: 2, con: 2, int: 0, sab: 0, car: -1 };
  draft.race = {
    uuid: "Compendium.race.humano",
    name: "Humano",
    fixedAttrs: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 },
    dynamicEligible: ["for", "des", "con", "int", "sab", "car"],
    dynamicCount: 3,
    dynamicBonus: 1,
    dynamicPicked: ["for", "des", "con"],
    grants: [{ title: "Versátil", type: "auto", choices: [{ uuid: "Compendium.poder.versatil", name: "Versátil", desc: "Duas perícias" }] }],
    grantChoices: { 0: { chosenUuid: "Compendium.poder.versatil", chosenName: "Versátil", versatilMode: "two_skills" } },
    extraSkillChoices: ["perc", "atle"]
  };
  draft.origin = {
    uuid: "Compendium.origem.soldado",
    name: "Soldado",
    skillOptions: [{ key: "luta", label: "Luta" }, { key: "fort", label: "Fortitude" }],
    poderChoices: [],
    itemMatches: [],
    pickedSkills: ["luta", "fort"],
    pickedPowerIndices: [],
    includeOriginItems: false
  };
  draft.class = {
    uuid: "Compendium.classe.guerreiro",
    name: "Guerreiro",
    pvPorNivel: 5,
    pmPorNivel: 3,
    profArmas: ["simples", "marcial"],
    profArmaduras: ["lev", "pes", "esc"],
    parsedSkills: { fixedSkills: ["luta", "fort"], orChoices: [], choiceCount: 2, poolSkills: ["inic", "refl"] },
    orSelections: {},
    selectedPoolSkills: ["inic", "refl"],
    selectedIntSkills: []
  };
  draft.equipment = {
    mode: "shop",
    goldRolled: { dice: [5, 5, 5, 5], total: 20 },
    kitItems: [],
    shopItems: [{ uuid: "Compendium.equip.espada", name: "Espada Longa", priceTp: 15, qty: 1 }]
  };

  const res = await commitCharacterWizard(draft);
  assert.equal(createdActors.length, 1);
  const actor = res.actor;
  assert.equal(actor.name, "Ronan");
  assert.equal(actor.sheet.renderCalled, true);

  // Verify embedded Race had dynamic attrs & grants cleared so T20 `_preCreate` won't pop dialogs
  const raceItem = actor.itemTypes.race[0];
  assert.deepEqual(raceItem.system.grants, []);
  assert.deepEqual(raceItem.system.atributosDinamicos.value, []);

  // Verify post-race attribute update preserved base + racial properly & gold balance = 5 T$
  const firstUpdate = actor.updates[0];
  assert.equal(firstUpdate["system.dinheiro.tp"], 5);
  assert.equal(firstUpdate["system.atributos.for.base"], 4);
  assert.equal(firstUpdate["system.atributos.for.racial"], 1);
  assert.equal(firstUpdate["system.pericias.perc.treinado"], true);
  assert.ok(actor.items.some((i) => i.name === "Ataque Especial"));
  assert.ok(actor.items.some((i) => i.name === "Espada Longa"));
});

test("HBS templates, JSON configs, CSS braces, and wizard actions are structurally valid", () => {
  const modDir = path.resolve(import.meta.dirname, "..");
  const hbs = fs.readFileSync(path.join(modDir, "templates/apps/character-wizard.hbs"), "utf8");
  const sheetHbs = fs.readFileSync(path.join(modDir, "templates/sheet/character-pf2e-sheet.hbs"), "utf8");
  const wizJs = fs.readFileSync(path.join(modDir, "scripts/wizard/character-wizard.js"), "utf8");
  const css = fs.readFileSync(path.join(modDir, "styles/t20-wizard.css"), "utf8");

  const actionsInHbs = [...new Set([...hbs.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]))];
  const missingActions = actionsInHbs.filter((a) => !new RegExp(`\\b${a}:`).test(wizJs));
  assert.deepEqual(missingActions, []);

  for (const tpl of [hbs, sheetHbs]) {
    const opens = (tpl.match(/\{\{#(if|unless|each)\b/g) || []).length;
    const closes = (tpl.match(/\{\{\/(if|unless|each)\}\}/g) || []).length;
    assert.equal(opens, closes);
  }

  const cssOpens = (css.match(/\{/g) || []).length;
  const cssCloses = (css.match(/\}/g) || []).length;
  assert.equal(cssOpens, cssCloses);

  const modJson = JSON.parse(fs.readFileSync(path.join(modDir, "module.json"), "utf8"));
  assert.ok(modJson.styles.includes("styles/t20-wizard.css"));
  JSON.parse(fs.readFileSync(path.join(modDir, "lang/pt-br.json"), "utf8"));

  // Regression checks: scroll markers on detail columns & no split Handlebars quotes
  for (const marker of ["detail-3", "detail-4", "detail-5", "detail-6"]) {
    assert.ok(hbs.includes(`data-wiz-scroll="${marker}"`), `missing ${marker}`);
  }
  assert.equal(/\{\{#if \(eq [^}]*"\s*[\r\n]/.test(hbs), false);
});

test("commitCharacterWizard filters origin starting items by selectedOriginItemUuids", async () => {
  const createdActors = [];
  const docMap = new Map(
    Object.entries({
      "Compendium.race.elfo": { _id: "r1", name: "Elfo", type: "race", system: { atributos: { des: 1, con: -1, int: 2 }, grants: [] } },
      "Compendium.classe.guerreiro": { _id: "c1", name: "Guerreiro", type: "classe", system: { pvPorNivel: 5, pmPorNivel: 3, pericias: { inatas: ["luta", "fort"], numero: 2 } } },
      "Compendium.equip.cavalo": { _id: "eq1", name: "Cavalo", type: "equipamento", system: { preco: 75 } },
      "Compendium.equip.ponei": { _id: "eq2", name: "Pônei", type: "equipamento", system: { preco: 5 } }
    }).map(([uuid, obj]) => [uuid, { uuid, name: obj.name, toObject: () => structuredClone(obj) }])
  );

  globalThis.fromUuid = async (uuid) => docMap.get(uuid) || null;
  globalThis.Actor = {
    async create(data) {
      const state = {
        ...data,
        items: [],
        itemTypes: { race: [], classe: [] },
        system: { pericias: { ades: {}, cava: {}, mist: {}, vont: {}, conh: {}, perc: {} } },
        flags: {},
        async update() {},
        async setFlag() {},
        async createEmbeddedDocuments(_docType, list) {
          for (const it of list) {
            const created = { ...it, id: `it-${this.items.length + 1}` };
            this.items.push(created);
            if (created.type === "race") this.itemTypes.race.push(created);
            if (created.type === "classe") this.itemTypes.classe.push(created);
          }
          return list;
        },
        async updateEmbeddedDocuments() { return []; },
        async deleteEmbeddedDocuments() { return []; },
        prepareData() {},
        sheet: { render() {} }
      };
      createdActors.push(state);
      return state;
    }
  };

  const draft = createInitialWizardDraft();
  draft.identity.name = "Lyra";
  draft.attributes.base = { for: 4, des: 2, con: 2, int: 0, sab: 0, car: -1 };
  draft.race = {
    uuid: "Compendium.race.elfo",
    name: "Elfo",
    fixedAttrs: { for: 0, des: 1, con: -1, int: 2, sab: 0, car: 0 },
    dynamicEligible: [],
    dynamicCount: 0,
    dynamicBonus: 0,
    dynamicPicked: [],
    grants: [],
    grantChoices: {},
    extraSkillChoices: []
  };
  draft.origin = {
    uuid: "Compendium.origem.amigo",
    name: "Amigo dos Animais",
    skillOptions: [{ key: "ades", label: "Adestramento" }, { key: "cava", label: "Cavalgar" }],
    poderChoices: [],
    itemMatches: [
      { uuid: "Compendium.equip.cavalo", name: "Cavalo" },
      { uuid: "Compendium.equip.ponei", name: "Pônei" }
    ],
    pickedSkills: ["ades", "cava"],
    pickedPowerIndices: [],
    includeOriginItems: true,
    selectedOriginItemUuids: ["Compendium.equip.cavalo"]
  };
  draft.class = {
    uuid: "Compendium.classe.guerreiro",
    name: "Guerreiro",
    pvPorNivel: 5,
    pmPorNivel: 3,
    profArmas: ["simples", "marcial"],
    profArmaduras: ["lev", "pes", "esc"],
    parsedSkills: { fixedSkills: ["luta", "fort"], orChoices: [], choiceCount: 2, poolSkills: ["conh", "perc"] },
    orSelections: {},
    selectedPoolSkills: ["conh", "perc"],
    selectedIntSkills: ["inic", "atle"]
  };
  draft.equipment = { mode: "kit", goldRolled: { dice: [4, 4, 4, 4], total: 16 }, kitItems: [], shopItems: [] };

  await commitCharacterWizard(draft);
  const actor = createdActors[0];
  assert.ok(actor.items.some((i) => i.name === "Cavalo"));
  assert.ok(!actor.items.some((i) => i.name === "Pônei"));
});

