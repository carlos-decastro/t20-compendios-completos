/**
 * ApplicationV2 Guided Level-1 Character Creation Wizard for Tormenta20 JdA.
 */

import { T20CompendiumIndex } from "../browser/compendium-index.js";
import { SKILL_LABELS_PT, normalizeText } from "../automation/skill-parser.js";
import { evaluatePowerStatus } from "../automation/power-prereq-evaluator.js";
import {
  ALL_SKILL_KEYS,
  ATTR_ABBR_PT,
  ATTR_LABELS_PT,
  ATTR_ORDER,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  WIZARD_STEPS,
  buildDraftActorSnapshot,
  collectTrainedSkills,
  computeWizardPreview,
  createInitialWizardDraft,
  getClassDevoteePolicy,
  isDeityCompatibleWith,
  reconcileDraftAfterMutation,
  rollAbilitySet4d6,
  rollStartingGold4d6,
  validateWizardStep
} from "./wizard-state.js";
import {
  commitCharacterWizard,
  loadClassDetails,
  loadDeityDetails,
  loadOriginDetails,
  loadRaceDetails,
  resolveStarterKitFromCatalog
} from "./wizard-builder.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PROF_ARMOR_LABELS = {
  lev: "Armaduras Leves",
  pes: "Armaduras Pesadas",
  esc: "Escudos"
};

const PROF_WEAPON_LABELS = {
  simples: "Armas Simples",
  marcial: "Armas Marciais",
  exotica: "Armas Exóticas",
  fogo: "Armas de Fogo"
};

function fmtSigned(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

function skillLabel(key) {
  const cfg = globalThis.CONFIG?.T20?.pericias?.[key];
  if (cfg?.label && globalThis.game?.i18n) return game.i18n.localize(cfg.label);
  return SKILL_LABELS_PT[key] || key.toUpperCase();
}

function getSchoolLabel(escolaKey) {
  const cfg = globalThis.CONFIG?.T20?.magiaEscolas?.[escolaKey] || globalThis.CONFIG?.T20?.escolas?.[escolaKey];
  if (cfg) return game.i18n.localize(cfg);
  return escolaKey ? escolaKey.toUpperCase() : "Universal";
}

function getPowerTypeLabel(tipoKey) {
  const cfg = globalThis.CONFIG?.T20?.powerType?.[tipoKey];
  if (cfg) return game.i18n.localize(cfg);
  return tipoKey || "Poder";
}

export class CharacterWizardT20 extends HandlebarsApplicationMixin(ApplicationV2) {
  static _instance = null;

  constructor(options = {}) {
    super(options);
    this.existingActor = options.actor || null;
    this.draft = createInitialWizardDraft(this.existingActor);
    this._catalog = null;
    this._descCache = new Map();
    this._searchQueries = {
      race: "",
      origin: "",
      class: "",
      deity: "",
      power: "",
      spell: "",
      shop: ""
    };
    this._powerTypeFilter = "";
    this._spellSchoolFilter = "";
    this._shopCategoryFilter = "";
    this._activeRollSlotIdx = null;
    this._isCommitting = false;
    this._scrollCache = {};
  }

  _preRender(_context, _options) {
    const root = this.element;
    if (!root) return;
    this._scrollCache = {};
    root.querySelectorAll("[data-wiz-scroll]").forEach((el) => {
      this._scrollCache[el.dataset.wizScroll] = el.scrollTop;
    });
  }

  _onClose(options) {
    super._onClose(options);
    if (CharacterWizardT20._instance === this) {
      CharacterWizardT20._instance = null;
    }
  }

  static DEFAULT_OPTIONS = {
    id: "t20-character-wizard",
    classes: ["t20pf2e-arton-window", "t20-char-wizard"],
    window: {
      title: "Assistente de Criação de Personagem — Arton",
      icon: "fa-solid fa-scroll",
      resizable: true
    },
    position: {
      width: 1080,
      height: 750
    },
    actions: {
      goStep: CharacterWizardT20._onGoStep,
      prevStep: CharacterWizardT20._onPrevStep,
      nextStep: CharacterWizardT20._onNextStep,
      pickPortrait: CharacterWizardT20._onPickPortrait,
      setAttrMode: CharacterWizardT20._onSetAttrMode,
      adjAttr: CharacterWizardT20._onAdjAttr,
      resetPointBuy: CharacterWizardT20._onResetPointBuy,
      rollAbilities: CharacterWizardT20._onRollAbilities,
      selectRollChip: CharacterWizardT20._onSelectRollChip,
      assignRollToAttr: CharacterWizardT20._onAssignRollToAttr,
      autoAssignRolls: CharacterWizardT20._onAutoAssignRolls,
      selectRace: CharacterWizardT20._onSelectRace,
      pickRaceGrantChoice: CharacterWizardT20._onPickRaceGrantChoice,
      toggleDynamicAttr: CharacterWizardT20._onToggleDynamicAttr,
      setRaceSpecialMode: CharacterWizardT20._onSetRaceSpecialMode,
      pickRaceExtraSkill: CharacterWizardT20._onPickRaceExtraSkill,
      selectOrigin: CharacterWizardT20._onSelectOrigin,
      toggleOriginSkill: CharacterWizardT20._onToggleOriginSkill,
      toggleOriginPower: CharacterWizardT20._onToggleOriginPower,
      toggleOriginItems: CharacterWizardT20._onToggleOriginItems,
      toggleOriginSingleItem: CharacterWizardT20._onToggleOriginSingleItem,
      selectClass: CharacterWizardT20._onSelectClass,
      setArcanistaPath: CharacterWizardT20._onSetArcanistaPath,
      pickOrSkill: CharacterWizardT20._onPickOrSkill,
      toggleClassPoolSkill: CharacterWizardT20._onToggleClassPoolSkill,
      toggleIntSkill: CharacterWizardT20._onToggleIntSkill,
      selectDeity: CharacterWizardT20._onSelectDeity,
      clearDeity: CharacterWizardT20._onClearDeity,
      toggleDeityPower: CharacterWizardT20._onToggleDeityPower,
      selectAllDeityPowers: CharacterWizardT20._onSelectAllDeityPowers,
      pickFreePower: CharacterWizardT20._onPickFreePower,
      removeFreePower: CharacterWizardT20._onRemoveFreePower,
      toggleSpell: CharacterWizardT20._onToggleSpell,
      setEquipmentMode: CharacterWizardT20._onSetEquipmentMode,
      rerollGold: CharacterWizardT20._onRerollGold,
      addShopItem: CharacterWizardT20._onAddShopItem,
      removeShopItem: CharacterWizardT20._onRemoveShopItem,
      finishWizard: CharacterWizardT20._onFinishWizard
    }
  };

  static PARTS = {
    main: {
      template: "modules/t20-compendios-completos/templates/apps/character-wizard.hbs"
    }
  };

  static open(actor = null) {
    if (!this._instance) {
      this._instance = new this({ actor });
    } else if (actor && this._instance.existingActor?.id !== actor.id) {
      this._instance.existingActor = actor;
      this._instance.draft = createInitialWizardDraft(actor);
    }
    this._instance.render({ force: true });
    return this._instance;
  }

  async _enrichDesc(uuid, rawHtml) {
    if (!uuid || !rawHtml) return "";
    if (this._descCache.has(uuid)) return this._descCache.get(uuid);
    const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawHtml, { async: true });
    this._descCache.set(uuid, enriched);
    return enriched;
  }

  async _prepareContext(_options) {
    if (!this._catalog) {
      this._catalog = await T20CompendiumIndex.getCategories();
    }

    reconcileDraftAfterMutation(this.draft);
    const preview = computeWizardPreview(this.draft);
    const currentStepNum = this.draft.step;
    const currentValidation = preview.validationByStep[currentStepNum];
    const highestAllowed = this._computeHighestAccessibleStep(preview);

    const steps = WIZARD_STEPS.map((st) => {
      const v = preview.validationByStep[st.num];
      return {
        ...st,
        isCurrent: st.num === currentStepNum,
        isValid: v.valid,
        isAccessible: st.num <= highestAllowed,
        isDone: st.num < currentStepNum && v.valid
      };
    });

    const summaryAttrs = ATTR_ORDER.map((k) => ({
      key: k,
      abbr: ATTR_ABBR_PT[k],
      base: preview.baseAttrs[k],
      baseText: fmtSigned(preview.baseAttrs[k]),
      racial: preview.racialAttrs[k],
      racialText: preview.racialAttrs[k] ? fmtSigned(preview.racialAttrs[k]) : "",
      finalText: fmtSigned(preview.finalAttrs[k])
    }));

    const context = {
      steps,
      currentStepNum,
      stepMeta: WIZARD_STEPS[currentStepNum - 1],
      isFirstStep: currentStepNum === 1,
      isLastStep: currentStepNum === 8,
      canProceed: currentValidation.valid,
      canFinish: preview.allStepsValid && !this._isCommitting,
      currentErrors: currentValidation.errors,
      isEditingExisting: Boolean(this.existingActor),
      draft: this.draft,
      preview,
      summaryAttrs,
      trainedSkillsList: preview.trainedSkills,
      trainedCount: preview.trainedSkills.length
    };

    if (currentStepNum === 2) context.step2 = this._buildStep2Context(preview);
    else if (currentStepNum === 3) context.step3 = await this._buildStep3Context(preview);
    else if (currentStepNum === 4) context.step4 = this._buildStep4Context(preview);
    else if (currentStepNum === 5) context.step5 = await this._buildStep5Context(preview);
    else if (currentStepNum === 6) context.step6 = this._buildStep6Context(preview);
    else if (currentStepNum === 7) context.step7 = this._buildStep7Context(preview);
    else if (currentStepNum === 8) context.step8 = this._buildStep8Context(preview);

    return context;
  }

  _computeHighestAccessibleStep(preview) {
    let maxStep = 1;
    for (let s = 1; s < 8; s += 1) {
      if (preview.validationByStep[s].valid) maxStep = s + 1;
      else break;
    }
    return maxStep;
  }

  _buildStep2Context(preview) {
    const mode = this.draft.attributes.mode;
    const assignedIndices = new Set(
      Object.values(this.draft.attributes.rollAssignments || {}).filter((v) => v !== null && v !== undefined)
    );

    const rollChips = (this.draft.attributes.rolledSet?.rolls || []).map((r, idx) => ({
      idx,
      modText: fmtSigned(r.mod),
      sum: r.sum,
      diceText: r.dice.join(", "),
      dropped: r.dropped,
      isAssigned: assignedIndices.has(idx),
      isActive: this._activeRollSlotIdx === idx
    }));

    const attrCards = ATTR_ORDER.map((k) => {
      const baseVal = preview.baseAttrs[k];
      const racialVal = preview.racialAttrs[k];
      const finalVal = preview.finalAttrs[k];
      const assignedIdx = this.draft.attributes.rollAssignments?.[k];
      return {
        key: k,
        abbr: ATTR_ABBR_PT[k],
        label: ATTR_LABELS_PT[k],
        baseVal,
        baseText: fmtSigned(baseVal),
        racialVal,
        racialText: racialVal ? fmtSigned(racialVal) : "",
        finalText: fmtSigned(finalVal),
        canDec: mode === "pointbuy" && baseVal > POINT_BUY_MIN,
        canInc:
          mode === "pointbuy" &&
          baseVal < POINT_BUY_MAX &&
          preview.pointBuy.remaining >= (POINT_BUY_COSTS[String(baseVal + 1)] - POINT_BUY_COSTS[String(baseVal)]),
        costText: mode === "pointbuy" ? `${POINT_BUY_COSTS[String(baseVal)] ?? "?"} pt(s)` : "",
        hasAssignedRoll: assignedIdx !== null && assignedIdx !== undefined,
        assignedRollIdx: assignedIdx
      };
    });

    return {
      isPointBuy: mode === "pointbuy",
      isRoll: mode === "roll",
      isManual: mode === "manual",
      pointBuy: preview.pointBuy,
      rollChips,
      rolledTotalMod: this.draft.attributes.rolledSet?.totalMod ?? null,
      belowRecommended: Boolean(this.draft.attributes.rolledSet?.belowRecommended),
      activeRollSelected: this._activeRollSlotIdx !== null,
      attrCards
    };
  }

  async _buildStep3Context(preview) {
    const query = this._searchQueries.race;
    const list = (this._catalog.racas || []).map((r) => ({
      uuid: r.uuid,
      name: r.name,
      nameNorm: normalizeText(r.name),
      img: r.img,
      subtitle: r.subtitle,
      selected: r.uuid === this.draft.race.uuid
    }));

    const selectedRace = this.draft.race.uuid ? this.draft.race : null;
    let raceDescHtml = "";
    let dynamicOptions = [];
    let grantBlocks = [];
    let extraSkillOptions = [];

    if (selectedRace) {
      raceDescHtml = await this._enrichDesc(selectedRace.uuid, selectedRace.description);
      if (selectedRace.dynamicCount > 0) {
        dynamicOptions = selectedRace.dynamicEligible.map((k) => {
          const picked = selectedRace.dynamicPicked.includes(k);
          const atLimit = selectedRace.dynamicPicked.length >= selectedRace.dynamicCount;
          return {
            key: k,
            abbr: ATTR_ABBR_PT[k],
            label: ATTR_LABELS_PT[k],
            picked,
            disabled: !picked && atLimit
          };
        });
      }

      grantBlocks = selectedRace.grants.map((g, idx) => ({
        idx,
        title: g.title,
        desc: g.desc,
        isSingleChoice: g.type === "single" && g.choices.length > 1,
        choices: g.choices.map((ch) => ({
          ...ch,
          selected: selectedRace.grantChoices?.[idx]?.chosenUuid === ch.uuid
        }))
      }));

      if (preview.raceExtraSkillCount > 0) {
        const pickedSet = new Set(selectedRace.extraSkillChoices || []);
        const atLimit = pickedSet.size >= preview.raceExtraSkillCount;
        extraSkillOptions = ALL_SKILL_KEYS.map((sk) => ({
          key: sk,
          label: skillLabel(sk),
          picked: pickedSet.has(sk),
          disabled: !pickedSet.has(sk) && atLimit
        }));
      }
    }

    return {
      query,
      races: list,
      selectedRace,
      raceDescHtml,
      dynamicOptions,
      hasDynamic: Boolean(selectedRace && selectedRace.dynamicCount > 0),
      dynamicPickedCount: selectedRace?.dynamicPicked?.length || 0,
      grantBlocks,
      raceChoiceGrant: preview.raceChoiceGrant,
      isVersatil: preview.raceChoiceGrant?.kind === "versatil",
      isMemoria: preview.raceChoiceGrant?.kind === "memoria",
      raceExtraSkillCount: preview.raceExtraSkillCount,
      extraSkillPickedCount: selectedRace?.extraSkillChoices?.length || 0,
      extraSkillOptions
    };
  }

  _buildStep4Context() {
    const query = this._searchQueries.origin;
    const list = (this._catalog.origens || []).map((o) => ({
      uuid: o.uuid,
      name: o.name,
      nameNorm: normalizeText(o.name),
      img: o.img,
      subtitle: o.subtitle,
      selected: o.uuid === this.draft.origin.uuid
    }));

    const orig = this.draft.origin.uuid ? this.draft.origin : null;
    let skillOptions = [];
    let poderOptions = [];
    let requiredCount = 2;
    let pickedCount = 0;

    if (orig) {
      const totalAvail = orig.skillOptions.length + orig.poderChoices.length;
      requiredCount = Math.min(2, totalAvail);
      pickedCount = orig.pickedSkills.length + orig.pickedPowerIndices.length;
      const atLimit = pickedCount >= requiredCount;

      const preRaceTrained = collectTrainedSkills(this.draft, { upToStep: 3 });

      skillOptions = orig.skillOptions.map((s) => {
        const picked = orig.pickedSkills.includes(s.key);
        const alreadyRace = preRaceTrained.has(s.key);
        return {
          key: s.key,
          label: s.label,
          picked,
          alreadyRace,
          disabled: alreadyRace || (!picked && atLimit)
        };
      });

      poderOptions = orig.poderChoices.map((p, idx) => {
        const picked = orig.pickedPowerIndices.includes(idx);
        return {
          idx,
          name: p.name,
          isWildcard: Boolean(p.wildcard && !p.uuid),
          picked,
          disabled: !picked && atLimit
        };
      });
    }

    const originSelectedSet = Array.isArray(orig?.selectedOriginItemUuids)
      ? new Set(orig.selectedOriginItemUuids)
      : null;
    const originItemOptions = (orig?.itemMatches || []).map((it) => ({
      uuid: it.uuid,
      name: it.name,
      picked: originSelectedSet ? originSelectedSet.has(it.uuid) : true
    }));

    return {
      query,
      origins: list,
      selectedOrigin: orig,
      skillOptions,
      poderOptions,
      requiredCount,
      pickedCount,
      originItemOptions,
      hasOriginItemChoiceHint: /\bou\b/i.test(orig?.itensIniciaisTexto || "")
    };
  }

  async _buildStep5Context(preview) {
    const query = this._searchQueries.class;
    const list = (this._catalog.classes || []).map((c) => ({
      uuid: c.uuid,
      name: c.name,
      nameNorm: normalizeText(c.name),
      img: c.img,
      subtitle: c.subtitle,
      selected: c.uuid === this.draft.class.uuid
    }));

    const cls = this.draft.class.uuid ? this.draft.class : null;
    let fixedSkills = [];
    let orGroups = [];
    let poolSkills = [];
    let intSkills = [];
    let reqPool = 0;
    let reqInt = 0;
    let arcanistaPaths = [];
    let profLabels = [];
    let isArcanista = false;

    if (cls) {
      const parsed = cls.parsedSkills || {};
      const preTrainedBeforePool = collectTrainedSkills(
        { ...this.draft, class: { ...cls, selectedPoolSkills: [], selectedIntSkills: [] } },
        { upToStep: 5 }
      );

      fixedSkills = (parsed.fixedSkills || []).map((k) => ({ key: k, label: skillLabel(k) }));
      orGroups = (parsed.orChoices || []).map((group, idx) => ({
        idx,
        options: group.map((k) => ({
          key: k,
          label: skillLabel(k),
          selected: cls.orSelections?.[idx] === k
        }))
      }));

      const poolFiltered = (parsed.poolSkills || []).filter((k) => !(parsed.fixedSkills || []).includes(k));
      const availablePoolCount = poolFiltered.filter((k) => !preTrainedBeforePool.has(k)).length;
      reqPool = Math.min(Number(parsed.choiceCount || 0), availablePoolCount);
      const pickedPoolSet = new Set(cls.selectedPoolSkills || []);
      const atPoolLimit = pickedPoolSet.size >= reqPool;

      poolSkills = poolFiltered.map((k) => {
        const picked = pickedPoolSet.has(k);
        const already = !picked && preTrainedBeforePool.has(k);
        return {
          key: k,
          label: skillLabel(k),
          picked,
          already,
          alreadySource: already ? preTrainedBeforePool.get(k)?.source : "",
          disabled: already || (!picked && atPoolLimit)
        };
      });

      const intBonus = Math.max(0, Number(preview.finalAttrs.int || 0));
      const trainedBeforeInt = collectTrainedSkills(
        { ...this.draft, class: { ...cls, selectedIntSkills: [] } },
        { upToStep: 5 }
      );
      const availableIntKeys = ALL_SKILL_KEYS.filter((k) => !trainedBeforeInt.has(k));
      reqInt = Math.min(intBonus, availableIntKeys.length);
      const pickedIntSet = new Set(cls.selectedIntSkills || []);
      const atIntLimit = pickedIntSet.size >= reqInt;

      if (intBonus > 0) {
        intSkills = ALL_SKILL_KEYS.map((k) => {
          const picked = pickedIntSet.has(k);
          const already = !picked && trainedBeforeInt.has(k);
          return {
            key: k,
            label: skillLabel(k),
            picked,
            already,
            alreadySource: already ? trainedBeforeInt.get(k)?.source : "",
            disabled: already || (!picked && atIntLimit)
          };
        });
      }

      isArcanista = Boolean(cls.caster?.hasPaths);
      if (isArcanista && cls.caster?.paths) {
        arcanistaPaths = Object.entries(cls.caster.paths).map(([key, p]) => ({
          key,
          label: p.label,
          attr: ATTR_ABBR_PT[p.attr] || p.attr.toUpperCase(),
          baseSpells: p.base,
          selected: cls.arcanistaPath === key
        }));
      }

      profLabels = [
        ...(cls.profArmas || []).map((w) => PROF_WEAPON_LABELS[w] || w),
        ...(cls.profArmaduras || []).map((a) => PROF_ARMOR_LABELS[a] || a)
      ];
    }

    return {
      query,
      classes: list,
      selectedClass: cls,
      fixedSkills,
      orGroups,
      poolSkills,
      reqPool,
      pickedPoolCount: cls?.selectedPoolSkills?.length || 0,
      intBonus: Math.max(0, Number(preview.finalAttrs.int || 0)),
      reqInt,
      pickedIntCount: cls?.selectedIntSkills?.length || 0,
      intSkills,
      isArcanista,
      arcanistaPaths,
      profLabels
    };
  }

  _buildStep6Context(preview) {
    const policy = preview.devoteePolicy;
    const query = this._searchQueries.deity;
    const raceName = this.draft.race.name || "";
    const className = this.draft.class.name || "";

    const deities = (this._catalog.divindades || []).map((d) => {
      const devotosTxt = d.meta?.devotos || "";
      const compat = isDeityCompatibleWith(devotosTxt, { raceName, className });
      return {
        uuid: d.uuid,
        name: d.name,
        nameNorm: normalizeText(d.name),
        img: d.img,
        subtitle: d.subtitle,
        compatible: compat.compatible,
        compatNote: compat.reason,
        selected: d.uuid === this.draft.deity.uuid
      };
    });

    // Sort compatible deities first cleanly
    deities.sort((a, b) => Number(b.compatible) - Number(a.compatible) || a.name.localeCompare(b.name, "pt-BR"));

    const selectedDeity = this.draft.deity.uuid ? this.draft.deity : null;
    let grantedPowers = [];
    if (selectedDeity) {
      const pickedSet = new Set(selectedDeity.selectedPowerUuids || []);
      const atMax = policy.maxPowersIfDevoted !== null && pickedSet.size >= policy.maxPowersIfDevoted;
      grantedPowers = selectedDeity.poderesConcedidos.map((gp) => {
        const picked = pickedSet.has(gp.uuid);
        return {
          ...gp,
          picked,
          disabled: !picked && atMax
        };
      });
    }

    return {
      query,
      policy,
      isAtheist: !selectedDeity,
      deities,
      selectedDeity,
      grantedPowers,
      pickedCount: selectedDeity?.selectedPowerUuids?.length || 0
    };
  }

  _buildStep7Context(preview) {
    const freePowerSlots = preview.freePowerSlots || [];
    const selectedFreePowers = this.draft.magicAndPowers.selectedFreePowers || [];
    const pickedPowerUuids = new Set(selectedFreePowers.map((p) => p.uuid));
    const snap = buildDraftActorSnapshot(this.draft);

    let powerEntries = [];
    if (freePowerSlots.length > 0) {
      const allowedTipos = new Set(freePowerSlots.flatMap((s) => s.allowedTipos || []));
      powerEntries = (this._catalog.poderes || [])
        .filter((p) => {
          const tipoNorm = normalizeText(p.system?.tipo || "");
          // Tormenta20 compendiums tag general powers under "geral" OR combat/destiny/magic/tormenta subtypes
          if (this._powerTypeFilter && tipoNorm !== this._powerTypeFilter) return false;
          return allowedTipos.has("geral")
            ? ["geral", "combate", "destino", "magia", "tormenta", "concedido"].includes(tipoNorm) || normalizeText(p.system?.subtipo || "").includes("geral")
            : allowedTipos.has(tipoNorm) || normalizeText(p.system?.subtipo || "").includes([...allowedTipos][0] || "");
        })
        .map((p) => {
          const evalRes = evaluatePowerStatus({ name: p.name, system: p.system }, null, snap);
          const picked = pickedPowerUuids.has(p.uuid);
          const atLimit = selectedFreePowers.length >= freePowerSlots.length;
          return {
            uuid: p.uuid,
            name: p.name,
            nameNorm: normalizeText(p.name),
            img: p.img,
            tipo: normalizeText(p.system?.tipo || ""),
            tipoLabel: getPowerTypeLabel(p.system?.tipo),
            subtipo: p.system?.subtipo || "",
            prereqState: evalRes.prereqState,
            prereqLabel: evalRes.prereqLabel,
            prereqTooltip: evalRes.prereqTooltip,
            picked,
            disabled: picked || atLimit || evalRes.prereqState === "locked"
          };
        });
    }

    const caster = preview.caster;
    let spellEntries = [];
    const selectedSpells = this.draft.magicAndPowers.selectedSpells || [];
    const pickedSpellUuids = new Set(selectedSpells.map((s) => s.uuid));
    const usedSchools = new Set(selectedSpells.map((s) => normalizeText(s.escola)).filter(Boolean));
    const schoolOptions = new Set();

    if (caster && caster.totalQuota > 0) {
      const allowedTipos = new Set([caster.tradicao, "uni"]);
      const atSpellLimit = selectedSpells.length >= caster.totalQuota;
      const atSchoolLimit = caster.schoolRestrictedCount > 0 && usedSchools.size >= caster.schoolRestrictedCount;

      spellEntries = (this._catalog.magias || [])
        .filter((m) => Number(m.system?.circulo || 1) === 1 && allowedTipos.has(normalizeText(m.system?.tipo || "uni")))
        .map((m) => {
          const escKey = normalizeText(m.system?.escola || "");
          if (escKey) schoolOptions.add(escKey);
          const picked = pickedSpellUuids.has(m.uuid);
          const blockedBySchool = !picked && atSchoolLimit && escKey && !usedSchools.has(escKey);
          return {
            uuid: m.uuid,
            name: m.name,
            nameNorm: normalizeText(m.name),
            img: m.img,
            escola: escKey,
            escolaLabel: getSchoolLabel(escKey),
            tipo: normalizeText(m.system?.tipo || "uni"),
            picked,
            blockedBySchool,
            disabled: !picked && (atSpellLimit || blockedBySchool)
          };
        });
    }

    return {
      hasFreePowers: freePowerSlots.length > 0,
      freePowerSlots,
      selectedFreePowers,
      powerQuery: this._searchQueries.power,
      powerTypeFilter: this._powerTypeFilter,
      powerEntries,
      hasSpells: Boolean(caster && caster.totalQuota > 0),
      caster,
      selectedSpells,
      spellQuery: this._searchQueries.spell,
      spellSchoolFilter: this._spellSchoolFilter,
      schoolOptions: [...schoolOptions].sort().map((k) => ({ key: k, label: getSchoolLabel(k) })),
      usedSchoolsCount: usedSchools.size,
      spellEntries,
      nothingRequired: freePowerSlots.length === 0 && !(caster && caster.totalQuota > 0)
    };
  }

  _buildStep8Context(preview) {
    const eq = this.draft.equipment;
    const mode = eq.mode || "gold";
    if (mode === "kit" && !eq.kitItems?.length && this.draft.class.name) {
      eq.kitItems = resolveStarterKitFromCatalog(this.draft.class.name, this._catalog.equipamentos || []);
    }

    const shopCatalog = (this._catalog.equipamentos || [])
      .filter((it) => Number(it.system?.preco || 0) >= 0 && Number(it.system?.preco || 0) <= Math.max(50, preview.budget.startingGold * 2))
      .map((it) => {
        const price = Number(it.system?.preco || 0);
        return {
          uuid: it.uuid,
          name: it.name,
          nameNorm: normalizeText(it.name),
          img: it.img,
          itemType: it.itemType,
          priceTp: price,
          canAfford: price <= preview.budget.remainingGold
        };
      });

    const orig = this.draft.origin;
    const originSelectedSet = Array.isArray(orig?.selectedOriginItemUuids)
      ? new Set(orig.selectedOriginItemUuids)
      : null;
    const originItemOptions = (orig?.itemMatches || []).map((it) => ({
      uuid: it.uuid,
      name: it.name,
      picked: originSelectedSet ? originSelectedSet.has(it.uuid) : true
    }));

    return {
      isGoldMode: mode === "gold",
      isKitMode: mode === "kit",
      isShopMode: mode === "shop",
      goldDiceText: eq.goldRolled?.dice?.join(" + ") || "—",
      budget: preview.budget,
      kitItems: eq.kitItems || [],
      shopItems: eq.shopItems || [],
      shopCatalog,
      shopQuery: this._searchQueries.shop,
      shopCategoryFilter: this._shopCategoryFilter,
      originItems: orig?.includeOriginItems
        ? originItemOptions.filter((it) => it.picked)
        : [],
      originItemOptions,
      hasOriginItemChoiceHint: /\bou\b/i.test(orig?.itensIniciaisTexto || "")
    };
  }

  _onRender(_context, _options) {
    const root = this.element;
    if (!root) return;

    // Restore scrollable list & detail panel positions across step updates
    const restoreScroll = () => {
      for (const [k, pos] of Object.entries(this._scrollCache || {})) {
        const target = root.querySelector(`[data-wiz-scroll="${k}"]`);
        if (target && pos > 0) target.scrollTop = pos;
      }
    };
    restoreScroll();
    requestAnimationFrame(restoreScroll);

    // Step 1 live inputs without re-render
    const nameInput = root.querySelector('[data-wiz-input="identityName"]');
    if (nameInput) {
      nameInput.addEventListener("input", (ev) => {
        this.draft.identity.name = ev.currentTarget.value;
        const summaryName = root.querySelector(".t20wiz-sum-name");
        if (summaryName) summaryName.textContent = this.draft.identity.name.trim() || "Sem Nome";
        const isValid = validateWizardStep(this.draft, 1).valid;
        const nextBtn = root.querySelector('[data-action="nextStep"]');
        if (nextBtn) nextBtn.disabled = !isValid;
        const valBox = root.querySelector(".t20wiz-validation-box");
        if (valBox) valBox.style.display = isValid ? "none" : "";
      });
    }

    const notesInput = root.querySelector('[data-wiz-input="identityNotes"]');
    if (notesInput) {
      notesInput.addEventListener("input", (ev) => {
        this.draft.identity.notes = ev.currentTarget.value;
      });
    }

    // Step 2 manual attribute inputs
    root.querySelectorAll("[data-wiz-manual-attr]").forEach((inp) => {
      inp.addEventListener("change", (ev) => {
        const key = ev.currentTarget.dataset.wizManualAttr;
        const val = Math.clamp(Number(ev.currentTarget.value || 0), -5, 15);
        this.draft.attributes.base[key] = Number.isFinite(val) ? Math.trunc(val) : 0;
        reconcileDraftAfterMutation(this.draft);
        this.render();
      });
    });

    // Step 8 manual gold input
    const manualGoldInput = root.querySelector('[data-wiz-input="manualGold"]');
    if (manualGoldInput) {
      manualGoldInput.addEventListener("change", (ev) => {
        const val = Math.max(0, Number(ev.currentTarget.value || 0));
        this.draft.equipment.goldRolled = { dice: [], total: Math.floor(val) };
        this.render();
      });
    }

    // Live DOM filtering for searchable catalogs
    root.querySelectorAll("[data-wiz-search]").forEach((inputEl) => {
      const targetKey = inputEl.dataset.wizSearch;
      inputEl.value = this._searchQueries[targetKey] || "";
      inputEl.addEventListener("input", (ev) => {
        this._searchQueries[targetKey] = ev.currentTarget.value;
        this._applyListFilter(targetKey);
      });
      this._applyListFilter(targetKey);
    });

    root.querySelectorAll("[data-wiz-filter]").forEach((sel) => {
      sel.addEventListener("change", (ev) => {
        const fKey = ev.currentTarget.dataset.wizFilter;
        if (fKey === "powerType") this._powerTypeFilter = ev.currentTarget.value;
        if (fKey === "spellSchool") this._spellSchoolFilter = ev.currentTarget.value;
        if (fKey === "shopCategory") this._shopCategoryFilter = ev.currentTarget.value;
        if (fKey === "powerType") this.render();
        else if (fKey === "spellSchool") this._applyListFilter("spell");
        else if (fKey === "shopCategory") this._applyListFilter("shop");
      });
    });
  }

  _applyListFilter(targetKey) {
    const root = this.element;
    if (!root) return;
    const container = root.querySelector(`[data-wiz-list="${targetKey}"]`);
    if (!container) return;
    const q = normalizeText(this._searchQueries[targetKey] || "");

    container.querySelectorAll("[data-name-norm]").forEach((row) => {
      let show = !q || (row.dataset.nameNorm || "").includes(q);
      if (show && targetKey === "spell" && this._spellSchoolFilter) {
        show = row.dataset.escola === this._spellSchoolFilter;
      }
      if (show && targetKey === "shop" && this._shopCategoryFilter) {
        show = row.dataset.itemType === this._shopCategoryFilter;
      }
      row.style.display = show ? "" : "none";
    });
  }

  /* ----------------------------- Action Handlers ---------------------------- */

  static _onGoStep(_ev, target) {
    const stepNum = Number(target.dataset.step);
    const preview = computeWizardPreview(this.draft);
    const highest = this._computeHighestAccessibleStep(preview);
    if (stepNum >= 1 && stepNum <= highest) {
      this.draft.step = stepNum;
      this.render();
    }
  }

  static _onPrevStep() {
    if (this.draft.step > 1) {
      this.draft.step -= 1;
      this.render();
    }
  }

  static _onNextStep() {
    const v = validateWizardStep(this.draft, this.draft.step);
    if (!v.valid) {
      ui.notifications.warn(v.errors[0]);
      return;
    }
    if (this.draft.step < 8) {
      this.draft.step += 1;
      this.render();
    }
  }

  static _onPickPortrait() {
    const Picker = foundry.applications.apps.FilePicker?.implementation || globalThis.FilePicker;
    new Picker({
      type: "image",
      current: this.draft.identity.img,
      callback: (path) => {
        this.draft.identity.img = path;
        this.render();
      }
    }).browse();
  }

  static _onSetAttrMode(_ev, target) {
    const mode = target.dataset.mode;
    if (!["pointbuy", "roll", "manual"].includes(mode)) return;
    this.draft.attributes.mode = mode;
    if (mode === "roll" && !this.draft.attributes.rolledSet) {
      this.draft.attributes.rolledSet = rollAbilitySet4d6();
    }
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onAdjAttr(_ev, target) {
    const key = target.dataset.attr;
    const delta = Number(target.dataset.delta || 0);
    const cur = Number(this.draft.attributes.base[key] || 0);
    const next = Math.clamp(cur + delta, POINT_BUY_MIN, POINT_BUY_MAX);
    this.draft.attributes.base[key] = next;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onResetPointBuy() {
    for (const k of ATTR_ORDER) this.draft.attributes.base[k] = 0;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onRollAbilities() {
    this.draft.attributes.rolledSet = rollAbilitySet4d6();
    this.draft.attributes.rollAssignments = { for: null, des: null, con: null, int: null, sab: null, car: null };
    this._activeRollSlotIdx = 0;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onSelectRollChip(_ev, target) {
    const idx = Number(target.dataset.rollIdx);
    this._activeRollSlotIdx = this._activeRollSlotIdx === idx ? null : idx;
    this.render();
  }

  static _onAssignRollToAttr(_ev, target) {
    const attrKey = target.dataset.attr;
    if (this._activeRollSlotIdx === null) {
      // Clicking an already assigned attribute clears it
      if (this.draft.attributes.rollAssignments[attrKey] !== null) {
        this.draft.attributes.rollAssignments[attrKey] = null;
        reconcileDraftAfterMutation(this.draft);
        this.render();
      }
      return;
    }

    // Unbind previous attribute holding this chip index cleanly
    for (const k of ATTR_ORDER) {
      if (this.draft.attributes.rollAssignments[k] === this._activeRollSlotIdx) {
        this.draft.attributes.rollAssignments[k] = null;
      }
    }
    this.draft.attributes.rollAssignments[attrKey] = this._activeRollSlotIdx;

    // Auto-select next unassigned roll chip for quick sequential clicking
    const used = new Set(Object.values(this.draft.attributes.rollAssignments).filter((v) => v !== null));
    let nextUnassigned = null;
    for (let i = 0; i < 6; i += 1) {
      if (!used.has(i)) {
        nextUnassigned = i;
        break;
      }
    }
    this._activeRollSlotIdx = nextUnassigned;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onAutoAssignRolls() {
    if (!this.draft.attributes.rolledSet) {
      this.draft.attributes.rolledSet = rollAbilitySet4d6();
    }
    ATTR_ORDER.forEach((k, idx) => {
      this.draft.attributes.rollAssignments[k] = idx;
    });
    this._activeRollSlotIdx = null;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static async _onSelectRace(_ev, target) {
    const uuid = target.dataset.uuid;
    const details = await loadRaceDetails(uuid);
    if (!details) return;
    this.draft.race = {
      uuid: details.uuid,
      name: details.name,
      img: details.img,
      description: details.description,
      fixedAttrs: details.fixedAttrs,
      dynamicEligible: details.dynamic.eligible,
      dynamicCount: details.dynamic.count,
      dynamicBonus: details.dynamic.bonus,
      dynamicPicked: [],
      grants: details.grants,
      grantChoices: {},
      extraSkillChoices: [],
      specialMode: null
    };
    // Auto-select single option when grant only has 1 item
    details.grants.forEach((g, idx) => {
      if (g.choices.length === 1) {
        this.draft.race.grantChoices[idx] = {
          chosenUuid: g.choices[0].uuid,
          chosenName: g.choices[0].name,
          chosenDesc: g.choices[0].desc,
          versatilMode: normalizeText(g.choices[0].name).includes("versatil") ? "two_skills" : "one_skill"
        };
      }
    });
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleDynamicAttr(_ev, target) {
    const key = target.dataset.attr;
    const list = this.draft.race.dynamicPicked || [];
    const idx = list.indexOf(key);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else if (list.length < this.draft.race.dynamicCount) {
      list.push(key);
    }
    this.draft.race.dynamicPicked = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onPickRaceGrantChoice(_ev, target) {
    const grantIdx = Number(target.dataset.grantIdx);
    const choiceUuid = target.dataset.uuid;
    const grant = this.draft.race.grants?.[grantIdx];
    const ch = grant?.choices?.find((c) => c.uuid === choiceUuid);
    if (!ch) return;
    this.draft.race.grantChoices[grantIdx] = {
      chosenUuid: ch.uuid,
      chosenName: ch.name,
      chosenDesc: ch.desc,
      versatilMode: normalizeText(ch.name).includes("versatil") ? "two_skills" : "one_skill"
    };
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onSetRaceSpecialMode(_ev, target) {
    const grantIdx = Number(target.dataset.grantIdx);
    const mode = target.dataset.mode;
    if (grantIdx >= 0 && this.draft.race.grantChoices[grantIdx]) {
      this.draft.race.grantChoices[grantIdx].versatilMode = mode;
    } else {
      this.draft.race.specialMode = mode;
    }
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onPickRaceExtraSkill(_ev, target) {
    const sk = target.dataset.skill;
    const list = this.draft.race.extraSkillChoices || [];
    const idx = list.indexOf(sk);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(sk);
    this.draft.race.extraSkillChoices = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static async _onSelectOrigin(_ev, target) {
    const uuid = target.dataset.uuid;
    const details = await loadOriginDetails(uuid);
    if (!details) return;
    this.draft.origin = {
      ...details,
      pickedSkills: [],
      pickedPowerIndices: [],
      includeOriginItems: true,
      selectedOriginItemUuids: (details.itemMatches || []).map((it) => it.uuid)
    };
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleOriginSkill(_ev, target) {
    const sk = target.dataset.skill;
    const list = this.draft.origin.pickedSkills || [];
    const idx = list.indexOf(sk);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(sk);
    this.draft.origin.pickedSkills = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleOriginPower(_ev, target) {
    const pIdx = Number(target.dataset.powerIdx);
    const list = this.draft.origin.pickedPowerIndices || [];
    const pos = list.indexOf(pIdx);
    if (pos >= 0) list.splice(pos, 1);
    else list.push(pIdx);
    this.draft.origin.pickedPowerIndices = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleOriginItems() {
    this.draft.origin.includeOriginItems = !this.draft.origin.includeOriginItems;
    this.render();
  }

  static _onToggleOriginSingleItem(_ev, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const matches = this.draft.origin?.itemMatches || [];
    if (!Array.isArray(this.draft.origin.selectedOriginItemUuids)) {
      this.draft.origin.selectedOriginItemUuids = matches.map((it) => it.uuid);
    }
    const list = this.draft.origin.selectedOriginItemUuids;
    const idx = list.indexOf(uuid);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(uuid);
    this.render();
  }

  static async _onSelectClass(_ev, target) {
    const uuid = target.dataset.uuid;
    const details = await loadClassDetails(uuid);
    if (!details) return;
    const orSelections = {};
    (details.parsedSkills.orChoices || []).forEach((grp, idx) => {
      if (grp.length) orSelections[idx] = grp[0];
    });

    this.draft.class = {
      uuid: details.uuid,
      name: details.name,
      img: details.img,
      pvPorNivel: details.pvPorNivel,
      pmPorNivel: details.pmPorNivel,
      profArmas: details.profArmas,
      profArmaduras: details.profArmaduras,
      parsedSkills: details.parsedSkills,
      caster: details.caster,
      orSelections,
      selectedPoolSkills: [],
      selectedIntSkills: [],
      arcanistaPath: details.caster?.hasPaths ? "mago" : null,
      pmAttr: details.caster?.keyAttr || null
    };
    this.draft.equipment.kitItems = [];
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onSetArcanistaPath(_ev, target) {
    this.draft.class.arcanistaPath = target.dataset.path;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onPickOrSkill(_ev, target) {
    const grpIdx = Number(target.dataset.groupIdx);
    const sk = target.dataset.skill;
    this.draft.class.orSelections[grpIdx] = sk;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleClassPoolSkill(_ev, target) {
    const sk = target.dataset.skill;
    const list = this.draft.class.selectedPoolSkills || [];
    const idx = list.indexOf(sk);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(sk);
    this.draft.class.selectedPoolSkills = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleIntSkill(_ev, target) {
    const sk = target.dataset.skill;
    const list = this.draft.class.selectedIntSkills || [];
    const idx = list.indexOf(sk);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(sk);
    this.draft.class.selectedIntSkills = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static async _onSelectDeity(_ev, target) {
    const uuid = target.dataset.uuid;
    const details = await loadDeityDetails(uuid);
    if (!details) return;
    this.draft.deity = {
      ...details,
      selectedPowerUuids: []
    };
    this.render();
  }

  static _onClearDeity() {
    const policy = getClassDevoteePolicy(this.draft.class.name);
    if (policy.isMandatory) {
      ui.notifications.warn(`${this.draft.class.name} precisa escolher uma Divindade.`);
      return;
    }
    this.draft.deity = {
      uuid: null,
      name: "",
      img: "",
      devotos: "",
      armaPreferida: "",
      canalizar: "",
      obrigacoes: "",
      poderesConcedidos: [],
      selectedPowerUuids: []
    };
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onToggleDeityPower(_ev, target) {
    const uuid = target.dataset.uuid;
    const policy = getClassDevoteePolicy(this.draft.class.name);
    const list = this.draft.deity.selectedPowerUuids || [];
    const idx = list.indexOf(uuid);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else if (policy.maxPowersIfDevoted === 1) {
      this.draft.deity.selectedPowerUuids = [uuid];
      reconcileDraftAfterMutation(this.draft);
      this.render();
      return;
    } else {
      list.push(uuid);
    }
    this.draft.deity.selectedPowerUuids = list;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onSelectAllDeityPowers() {
    const all = (this.draft.deity.poderesConcedidos || []).map((p) => p.uuid);
    const cur = this.draft.deity.selectedPowerUuids || [];
    this.draft.deity.selectedPowerUuids = cur.length === all.length ? [] : all;
    reconcileDraftAfterMutation(this.draft);
    this.render();
  }

  static _onPickFreePower(_ev, target) {
    const uuid = target.dataset.uuid;
    const entry = (this._catalog.poderes || []).find((p) => p.uuid === uuid);
    if (!entry) return;
    const list = this.draft.magicAndPowers.selectedFreePowers || [];
    if (!list.some((p) => p.uuid === uuid)) {
      list.push({
        uuid: entry.uuid,
        name: entry.name,
        img: entry.img,
        subtipo: entry.system?.subtipo || ""
      });
    }
    this.draft.magicAndPowers.selectedFreePowers = list;
    this.render();
  }

  static _onRemoveFreePower(_ev, target) {
    const uuid = target.dataset.uuid;
    this.draft.magicAndPowers.selectedFreePowers = (this.draft.magicAndPowers.selectedFreePowers || [])
      .filter((p) => p.uuid !== uuid);
    this.render();
  }

  static _onToggleSpell(_ev, target) {
    const uuid = target.dataset.uuid;
    const list = this.draft.magicAndPowers.selectedSpells || [];
    const idx = list.findIndex((s) => s.uuid === uuid);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      const entry = (this._catalog.magias || []).find((m) => m.uuid === uuid);
      if (entry) {
        list.push({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img,
          circulo: Number(entry.system?.circulo || 1),
          escola: normalizeText(entry.system?.escola || ""),
          tipo: normalizeText(entry.system?.tipo || "uni")
        });
      }
    }
    this.draft.magicAndPowers.selectedSpells = list;
    this.render();
  }

  static _onSetEquipmentMode(_ev, target) {
    const mode = target.dataset.mode;
    if (!["gold", "kit", "shop"].includes(mode)) return;
    this.draft.equipment.mode = mode;
    if (mode === "kit" && this.draft.class.name) {
      this.draft.equipment.kitItems = resolveStarterKitFromCatalog(this.draft.class.name, this._catalog.equipamentos || []);
    }
    this.render();
  }

  static _onRerollGold() {
    this.draft.equipment.goldRolled = rollStartingGold4d6();
    this.render();
  }

  static _onAddShopItem(_ev, target) {
    const uuid = target.dataset.uuid;
    const entry = (this._catalog.equipamentos || []).find((e) => e.uuid === uuid);
    if (!entry) return;
    const cart = this.draft.equipment.shopItems || [];
    const existing = cart.find((c) => c.uuid === uuid);
    if (existing) existing.qty += 1;
    else {
      cart.push({
        uuid: entry.uuid,
        name: entry.name,
        img: entry.img,
        type: entry.itemType,
        priceTp: Number(entry.system?.preco || 0),
        qty: 1
      });
    }
    this.draft.equipment.shopItems = cart;
    this.render();
  }

  static _onRemoveShopItem(_ev, target) {
    const uuid = target.dataset.uuid;
    const cart = this.draft.equipment.shopItems || [];
    const idx = cart.findIndex((c) => c.uuid === uuid);
    if (idx >= 0) {
      if (cart[idx].qty > 1) cart[idx].qty -= 1;
      else cart.splice(idx, 1);
    }
    this.draft.equipment.shopItems = cart;
    this.render();
  }

  static async _onFinishWizard() {
    if (this._isCommitting) return;
    const v = validateWizardStep(this.draft, 8);
    if (!v.valid) {
      ui.notifications.warn(v.errors[0]);
      return;
    }

    this._isCommitting = true;
    this.render();
    try {
      await commitCharacterWizard(this.draft, { existingActor: this.existingActor });
      this.close();
    } catch (err) {
      console.error("t20-compendios-completos | Wizard commit failed:", err);
      ui.notifications.error(err.message || "Erro ao criar personagem no Assistente.");
      this._isCommitting = false;
      this.render();
    }
  }
}
