import test from "node:test";
import assert from "node:assert/strict";

import {
  POINT_BUY_BUDGET,
  buildDraftActorSnapshot,
  computeEquipmentBudget,
  computePointBuySummary,
  computeWizardPreview,
  createInitialWizardDraft,
  detectDynamicRaceSpec,
  getClassDevoteePolicy,
  isDeityCompatibleWith,
  parseDynamicAttributePrompt,
  reconcileDraftAfterMutation,
  resolveBaseAttributes,
  resolveRacialAttributes,
  rollAbilitySet4d6,
  rollStartingGold4d6,
  sumToAbilityMod,
  validateWizardStep
} from "../scripts/wizard/wizard-state.js";
import { evaluatePowerStatus } from "../scripts/automation/power-prereq-evaluator.js";

test("Point-Buy JdA budget and cost table", () => {
  const zeroSummary = computePointBuySummary({ for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 });
  assert.equal(zeroSummary.spent, 0);
  assert.equal(zeroSummary.remaining, POINT_BUY_BUDGET);
  assert.equal(zeroSummary.valid, false);

  // Typical legal array: +4 (7) + +2 (2) + +2 (2) + -1 (-1) = 10 pts
  const validArray = computePointBuySummary({ for: 4, des: 2, con: 2, int: 0, sab: 0, car: -1 });
  assert.equal(validArray.spent, 10);
  assert.equal(validArray.remaining, 0);
  assert.equal(validArray.valid, true);

  // Out of bounds (+5 is illegal in JdA point-buy)
  const overMax = computePointBuySummary({ for: 5, des: 0, con: 0, int: 0, sab: 0, car: 0 });
  assert.equal(overMax.allInBounds, false);
  assert.equal(overMax.valid, false);
});

test("4d6 drop lowest conversion table and deterministic roll", () => {
  assert.equal(sumToAbilityMod(6), -2);
  assert.equal(sumToAbilityMod(8), -1);
  assert.equal(sumToAbilityMod(11), 0);
  assert.equal(sumToAbilityMod(13), 1);
  assert.equal(sumToAbilityMod(15), 2);
  assert.equal(sumToAbilityMod(17), 3);
  assert.equal(sumToAbilityMod(18), 4);

  // Deterministic RNG yielding 6s => sum=18 => mod=+4
  const highSet = rollAbilitySet4d6(() => 0.99);
  assert.equal(highSet.rolls.length, 6);
  assert.equal(highSet.totalMod, 24);
  assert.equal(highSet.belowRecommended, false);

  // Deterministic RNG yielding 1s => sum=3 => mod=-2
  const lowSet = rollAbilitySet4d6(() => 0.0);
  assert.equal(lowSet.totalMod, -12);
  assert.equal(lowSet.belowRecommended, true);

  const gold = rollStartingGold4d6(() => 0.5); // floor(0.5*6)+1 = 4 each -> 16
  assert.equal(gold.total, 16);
});

test("Dynamic race prompt parsing handles Humano and Osteon exclusions", () => {
  const parsedPt = parseDynamicAttributePrompt("+1 em Três Atributos Diferentes");
  assert.deepEqual(parsedPt, { bonus: 1, count: 3 });

  const osteonSpec = detectDynamicRaceSpec({
    system: {
      atributosDinamicos: {
        value: ["for", "des", "int", "sab", "car"],
        description: "+1 em Três Atributos Diferentes (exceto Constituição)"
      }
    }
  });
  assert.equal(osteonSpec.count, 3);
  assert.equal(osteonSpec.bonus, 1);
  assert.ok(!osteonSpec.eligible.includes("con"));
});

test("Strict validation across all 8 steps for a full legal Level-1 Arcanista character", () => {
  const draft = createInitialWizardDraft();

  // Step 1 empty fails, filled passes
  assert.equal(validateWizardStep(draft, 1).valid, false);
  draft.identity.name = "Lyra de Wynlla";
  assert.equal(validateWizardStep(draft, 1).valid, true);

  // Step 2 strict requires all 10 points spent
  assert.equal(validateWizardStep(draft, 2).valid, false);
  draft.attributes.base = { for: -1, des: 2, con: 1, int: 4, sab: 1, car: 0 }; // -1 + 2 + 1 + 7 + 1 + 0 = 10
  assert.equal(validateWizardStep(draft, 2).valid, true);

  // Step 3 Humano with +1 in 3 attrs + Versátil (1 skill + 1 free general power)
  draft.race = {
    uuid: "Compendium.race.humano",
    name: "Humano",
    fixedAttrs: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 },
    dynamicEligible: ["for", "des", "con", "int", "sab", "car"],
    dynamicCount: 3,
    dynamicBonus: 1,
    dynamicPicked: ["int", "con", "des"],
    grants: [
      {
        title: "Versátil",
        type: "auto",
        choices: [{ uuid: "Compendium.poder.versatil", name: "Versátil", desc: "Duas perícias ou uma perícia e um poder geral." }]
      }
    ],
    grantChoices: {
      0: { chosenName: "Versátil", versatilMode: "skill_and_power" }
    },
    extraSkillChoices: ["perc"]
  };
  assert.equal(validateWizardStep(draft, 3).valid, true);

  const racial = resolveRacialAttributes(draft);
  assert.deepEqual(racial, { for: 0, des: 1, con: 1, int: 1, sab: 0, car: 0 });
  assert.equal(resolveBaseAttributes(draft).int, 4);

  // Step 4 Origem (Estudioso) with 2 benefits
  draft.origin = {
    uuid: "Compendium.origem.estudioso",
    name: "Estudioso",
    skillOptions: [
      { key: "conh", label: "Conhecimento" },
      { key: "inve", label: "Investigação" }
    ],
    poderChoices: [{ name: "Aparência Inofensiva", uuid: "Compendium.poder.ai" }],
    itemMatches: [],
    pickedSkills: ["conh", "inve"],
    pickedPowerIndices: [],
    includeOriginItems: true
  };
  assert.equal(validateWizardStep(draft, 4).valid, true);

  // Step 5 Classe Arcanista (INT final = 5 => +5 extra INT skills!) + 2 class pool skills
  draft.class = {
    uuid: "Compendium.classe.arcanista",
    name: "Arcanista",
    pvPorNivel: 2,
    pmPorNivel: 6,
    profArmas: ["simples"],
    profArmaduras: [],
    parsedSkills: {
      fixedSkills: ["mist", "vont"],
      orChoices: [],
      choiceCount: 2,
      poolSkills: ["conh", "dipl", "enga", "guer", "inic", "inti", "inve", "joga", "nobr", "perc"]
    },
    orSelections: {},
    selectedPoolSkills: ["inic", "dipl"],
    selectedIntSkills: ["furt", "atle", "acro", "cura", "sobr"],
    arcanistaPath: "mago",
    pmAttr: "int"
  };
  assert.equal(validateWizardStep(draft, 5).valid, true);

  // Step 6 Arcanista can stay without a deity
  assert.equal(getClassDevoteePolicy("Arcanista").isMandatory, false);
  assert.equal(validateWizardStep(draft, 6).valid, true);

  // Step 7: Mago starts with 4 spells of 1st circle + 1 free general power from Versátil
  assert.equal(validateWizardStep(draft, 7).valid, false);
  draft.magicAndPowers.selectedFreePowers = [
    { uuid: "Compendium.poder.magia-pungente", name: "Magia Pungente", subtipo: "Magia", sourceLabel: "Versátil" }
  ];
  draft.magicAndPowers.selectedSpells = [
    { uuid: "s1", name: "Armadura Arcana", circulo: 1, escola: "abj", tipo: "arc" },
    { uuid: "s2", name: "Seta Infalível de Talude", circulo: 1, escola: "evo", tipo: "arc" },
    { uuid: "s3", name: "Amedrontar", circulo: 1, escola: "nec", tipo: "arc" },
    { uuid: "s4", name: "Imagem Espelhada", circulo: 1, escola: "ilu", tipo: "arc" }
  ];
  assert.equal(validateWizardStep(draft, 7).valid, true);

  // Step 8: gold default is valid and full preview computes exact JdA Level 1 PV/PM
  const preview = computeWizardPreview(draft);
  assert.equal(preview.finalAttrs.int, 5);
  assert.equal(preview.pvMax, 10); // 2*4 + 2(CON) = 10
  assert.equal(preview.pmMax, 11); // 6 + 5(INT) = 11
  assert.equal(preview.allStepsValid, true);
  assert.equal(validateWizardStep(draft, 8).valid, true);
});

test("Mandatory deity policy for Clerigo/Druida/Paladino & draft prerequisite evaluation", () => {
  const clerigoDraft = createInitialWizardDraft();
  clerigoDraft.class = {
    uuid: "c1",
    name: "Clérigo",
    pvPorNivel: 4,
    pmPorNivel: 5,
    profArmas: ["simples"],
    profArmaduras: ["lev", "pes", "esc"],
    parsedSkills: { fixedSkills: ["reli", "vont"], orChoices: [], choiceCount: 2, poolSkills: ["cura", "dipl"] },
    orSelections: {},
    selectedPoolSkills: ["cura", "dipl"],
    selectedIntSkills: []
  };

  // Clerigo without deity fails Step 6 strictly
  assert.equal(validateWizardStep(clerigoDraft, 6).valid, false);
  clerigoDraft.deity = {
    uuid: "d1",
    name: "Lena",
    devotos: "Mulheres",
    poderesConcedidos: [{ uuid: "gp1", name: "Cura Gentil" }],
    selectedPowerUuids: ["gp1"]
  };
  assert.equal(validateWizardStep(clerigoDraft, 6).valid, true);

  assert.equal(isDeityCompatibleWith("Elfos e Arcanistas", { raceName: "Humano", className: "Bárbaro" }).compatible, false);
  assert.equal(isDeityCompatibleWith("Todas as raças e classes", { raceName: "Anão", className: "Guerreiro" }).compatible, true);

  // Snapshot prerequisite evaluator works against in-memory draft (DES >= 1 for Esquiva)
  clerigoDraft.attributes.base.des = 2;
  const snap = buildDraftActorSnapshot(clerigoDraft);
  const esquivaStatus = evaluatePowerStatus({ name: "Esquiva", system: { subtipo: "Combate" } }, null, snap);
  assert.notEqual(esquivaStatus.prereqState, "locked");

  // Shop overspend is blocked strictly
  clerigoDraft.equipment.mode = "shop";
  clerigoDraft.equipment.goldRolled = { dice: [2, 3, 2, 3], total: 10 };
  clerigoDraft.equipment.shopItems = [{ uuid: "eq1", name: "Cota de Malha", priceTp: 150, qty: 1 }];
  assert.equal(computeEquipmentBudget(clerigoDraft).overspent, true);
  assert.equal(validateWizardStep(clerigoDraft, 8).valid, false);
});

test("reconcileDraftAfterMutation prunes overlapping & excess skills cleanly on backtrack", () => {
  const draft = createInitialWizardDraft();
  draft.attributes.base = { for: 0, des: 2, con: 0, int: 3, sab: 0, car: 2 };
  draft.class = {
    uuid: "bardo1",
    name: "Bardo",
    pvPorNivel: 3,
    pmPorNivel: 4,
    parsedSkills: { fixedSkills: ["atua", "refl"], orChoices: [], choiceCount: 2, poolSkills: ["acro", "dipl", "furt", "enga"] },
    orSelections: {},
    selectedPoolSkills: ["dipl", "acro"],
    selectedIntSkills: ["perc", "inve", "inic"]
  };
  // Now lower INT to 1 and add "dipl" via Origin: reconciliation should remove "dipl" from pool and trim INT skills to 1!
  draft.attributes.base.int = 1;
  draft.origin.pickedSkills = ["dipl"];
  reconcileDraftAfterMutation(draft);

  assert.deepEqual(draft.class.selectedPoolSkills, ["acro"]);
  assert.deepEqual(draft.class.selectedIntSkills, ["perc"]);
});

