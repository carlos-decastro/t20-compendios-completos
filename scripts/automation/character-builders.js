import {
  CRAFT_KEYS,
  SKILL_LABELS_PT,
  normalizeText,
  parseClassSkills,
  parseProficienciesText,
  resolveSkillToken
} from "./skill-parser.js";
import {
  getAttributeIncreaseStatus,
  getClassProgressionRule,
  getTierForLevel,
  normalizeProgressKey
} from "../data/class-progression-rules.js";
import {
  applyArcanistaPathToActor,
  applyAttributeIncreaseToItem,
  syncClassLevelProgression
} from "./progression-slots.js";

const MODULE_ID = "t20-compendios-completos";

const ATTR_LABELS_PT = {
  for: "Força",
  des: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  sab: "Sabedoria",
  car: "Carisma"
};

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSkillLabel(key) {
  const cfg = CONFIG.T20?.pericias?.[key];
  if (cfg?.label) return game.i18n.localize(cfg.label);
  return SKILL_LABELS_PT[key] || key.toUpperCase();
}

/**
 * Resolves a single-choice `grants` prompt for races (e.g. Humano Versátil / Osteon)
 * and strips unselected options before creating the embedded Race so T20 imports cleanly.
 */
export async function applyRaceToActor(actor, raceDoc) {
  const raceData = raceDoc.toObject();
  const grants = foundry.utils.deepClone(raceData.system?.grants || []);

  for (const grant of grants) {
    if (grant.type === "single" && Array.isArray(grant.choices) && grant.choices.length > 1) {
      const choiceDocs = await Promise.all(grant.choices.map((c) => fromUuid(c.uuid).catch(() => null)));
      const validChoices = grant.choices
        .map((c, idx) => ({ raw: c, doc: choiceDocs[idx] }))
        .filter((x) => x.doc);

      if (validChoices.length > 1) {
        const optionsHtml = validChoices
          .map(
            (entry, i) => `
              <label class="t20pf2e-choice-row">
                <input type="radio" name="raceGrantChoice" value="${i}" ${i === 0 ? "checked" : ""}/>
                <span><strong>${escapeHtml(entry.doc.name)}</strong></span>
              </label>`
          )
          .join("");

        const chosenIndex = await foundry.applications.api.DialogV2.wait({
          classes: ["t20pf2e-dialog-window"],
          window: { title: `${raceData.name} — ${grant.title || "Escolha Racial"}` },
          position: { width: 440 },
          content: `
            <div class="t20pf2e-dialog">
              ${grant.desc ? `<p class="t20pf2e-dialog-lead">${grant.desc}</p>` : ""}
              <div class="t20pf2e-choice-list">${optionsHtml}</div>
            </div>`,
          buttons: [
            {
              action: "confirm",
              label: "Confirmar",
              default: true,
              callback: (_ev, btn) => {
                const checked = btn.form.querySelector('input[name="raceGrantChoice"]:checked');
                return checked ? Number(checked.value) : 0;
              }
            }
          ],
          rejectClose: false
        });

        if (chosenIndex === null || chosenIndex === undefined) return null;
        grant.choices = [validChoices[chosenIndex].raw];
      }
    }
  }

  raceData.system.grants = grants;

  // Replace existing race item if present
  const existingRaces = actor.itemTypes.race || [];
  if (existingRaces.length) {
    await actor.deleteEmbeddedDocuments(
      "Item",
      existingRaces.map((r) => r.id)
    );
  }

  const created = await actor.createEmbeddedDocuments("Item", [raceData]);
  ui.notifications.info(`Raça aplicada: ${raceData.name}`);
  return created[0] || null;
}

/**
 * Prompts trained skill choices for a newly added initial class, applies proficiencies,
 * creates/levels the Class item, and imports level abilities automatically.
 */
export async function applyClassToActor(actor, classDoc, { onOpenBrowser } = {}) {
  const existing = actor.itemTypes.classe.find((c) => normalizeText(c.name) === normalizeText(classDoc.name));
  const totalLevel = actor.system.attributes?.nivel?.value || 0;

  if (existing) {
    if (totalLevel >= 20) {
      ui.notifications.warn("Personagem já atingiu o nível máximo (20).");
      return existing;
    }
    const prior = existing.system.niveis ?? 1;
    const nextLevel = Math.min(prior + 1, 20 + prior - totalLevel);
    await levelUpClassOnActor(actor, existing, nextLevel, { onOpenBrowser });
    return existing;
  }

  const isInitial = actor.itemTypes.classe.length === 0;
  const classData = classDoc.toObject();
  classData.system.inicial = isInitial;
  classData.system.niveis = 1;

  if (!actor.getFlag("tormenta20", "lvlconfig")) {
    await actor.setFlag("tormenta20", "lvlconfig", { manual: false });
  }

  const modClassData = classDoc.flags?.[MODULE_ID]?.classData || {};
  const { profArmas, profArmaduras } = modClassData.profArmas
    ? modClassData
    : parseProficienciesText(modClassData.proficienciasTexto || classData.system?.description?.value || "");

  // Skill selection modal only on initial class (Tormenta20 JdA multiclassing rules)
  if (isInitial) {
    const parsedSkills = parseClassSkills(
      classData.system?.pericias?.inatas,
      classData.system?.pericias?.numero
    );

    const skillSelection = await _promptClassSkillsDialog(classData.name, parsedSkills, actor);
    if (skillSelection === null) return null;

    const updates = {};
    for (const sk of skillSelection) {
      if (actor.system.pericias?.[sk]) {
        updates[`system.pericias.${sk}.treinado`] = true;
      }
    }

    const currentWeapons = new Set(actor.system.tracos?.profArmas?.value || []);
    for (const w of profArmas || []) currentWeapons.add(w);
    const currentArmors = new Set(actor.system.tracos?.profArmaduras?.value || []);
    for (const a of profArmaduras || []) currentArmors.add(a);

    updates["system.tracos.profArmas.value"] = [...currentWeapons];
    updates["system.tracos.profArmaduras.value"] = [...currentArmors];

    if (Object.keys(updates).length) {
      await actor.update(updates);
    }
  }

  const created = await actor.createEmbeddedDocuments("Item", [classData]);
  const createdClass = created[0] || null;
  if (createdClass) {
    const rule = getClassProgressionRule(createdClass.name);
    await syncClassLevelProgression(actor, createdClass, 0, 1);

    if (rule?.caster) {
      if (rule.caster.hasPaths) {
        await promptArcanistaPathDialog(actor);
      } else if (rule.caster.keyAttr && (isInitial || !actor.system?.attributes?.conjuracao)) {
        await actor.update({ "system.attributes.conjuracao": rule.caster.keyAttr });
      }
    }
  }
  ui.notifications.info(`Classe adicionada: ${classData.name} (Nível 1)`);
  return createdClass;
}

async function _promptClassSkillsDialog(className, parsedSkills, actor) {
  const { fixedSkills, orChoices, choiceCount, poolSkills } = parsedSkills;

  const fixedHtml = fixedSkills
    .map((k) => `<span class="t20pf2e-pill active">${escapeHtml(getSkillLabel(k))}</span>`)
    .join("");

  const orHtml = orChoices
    .map((group, idx) => {
      const radios = group
        .map(
          (k, j) => `
          <label class="t20pf2e-inline-radio">
            <input type="radio" name="orGroup_${idx}" value="${escapeHtml(k)}" ${j === 0 ? "checked" : ""}/>
            <span>${escapeHtml(getSkillLabel(k))}</span>
          </label>`
        )
        .join("");
      return `<div class="t20pf2e-or-group"><strong>Escolha obrigatória:</strong> ${radios}</div>`;
    })
    .join("");

  const poolFiltered = poolSkills.filter((k) => !fixedSkills.includes(k));
  const poolHtml = poolFiltered
    .map((k) => {
      const already = Boolean(actor.system.pericias?.[k]?.treinado);
      return `
        <label class="t20pf2e-check-item ${already ? "is-trained" : ""}">
          <input type="checkbox" name="extraSkill" value="${escapeHtml(k)}" ${already ? "disabled" : ""}/>
          <span>${escapeHtml(getSkillLabel(k))}${already ? " <em>(já treinada)</em>" : ""}</span>
        </label>`;
    })
    .join("");

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: `${className} — Perícias de Classe` },
    position: { width: 540 },
    content: `
      <div class="t20pf2e-dialog">
        ${fixedSkills.length ? `<div class="t20pf2e-section"><strong>Perícias automáticas:</strong><div class="t20pf2e-pill-row">${fixedHtml}</div></div>` : ""}
        ${orHtml ? `<div class="t20pf2e-section">${orHtml}</div>` : ""}
        ${
          choiceCount > 0
            ? `<div class="t20pf2e-section">
                 <div class="t20pf2e-counter-header">
                   <strong>Escolha mais ${choiceCount} perícia(s) de classe:</strong>
                   <span class="t20pf2e-counter" data-max="${choiceCount}">0 / ${choiceCount}</span>
                 </div>
                 <div class="t20pf2e-check-grid">${poolHtml}</div>
               </div>`
            : ""
        }
      </div>`,
    render: (_ev, dialog) => {
      const el = dialog.element;
      const boxes = [...el.querySelectorAll('input[name="extraSkill"]')];
      const counter = el.querySelector(".t20pf2e-counter");
      const updateState = () => {
        const checked = boxes.filter((b) => b.checked);
        if (counter) counter.textContent = `${checked.length} / ${choiceCount}`;
        const atLimit = checked.length >= choiceCount;
        for (const b of boxes) {
          if (!b.checked && !b.hasAttribute("data-orig-disabled")) {
            b.disabled = atLimit;
          }
        }
      };
      for (const b of boxes) {
        if (b.disabled) b.setAttribute("data-orig-disabled", "1");
        b.addEventListener("change", updateState);
      }
      updateState();
    },
    buttons: [
      {
        action: "apply",
        label: "Aplicar Classe e Perícias",
        default: true,
        callback: (_ev, btn) => {
          const chosen = new Set(fixedSkills);
          orChoices.forEach((_, idx) => {
            const picked = btn.form.querySelector(`input[name="orGroup_${idx}"]:checked`);
            if (picked?.value) chosen.add(picked.value);
          });
          btn.form.querySelectorAll('input[name="extraSkill"]:checked').forEach((el) => chosen.add(el.value));
          return [...chosen];
        }
      },
      {
        action: "cancel",
        label: "Cancelar",
        callback: () => null
      }
    ],
    rejectClose: false
  });

  return Array.isArray(result) ? result : null;
}

/**
 * Prompts the player to select `Caminho do Arcanista` (Bruxo, Mago, or Feiticeiro).
 */
export async function promptArcanistaPathDialog(actor) {
  const current = actor.flags?.[MODULE_ID]?.arcanistaPath || "bruxo";
  const pathChoice = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: `Caminho do Arcanista — ${actor.name}` },
    position: { width: 520 },
    content: `
      <div class="t20pf2e-dialog">
        <p>Escolha a origem da magia arcana para <strong>${escapeHtml(actor.name)}</strong> (esta escolha não pode ser mudada depois):</p>
        <div class="t20pf2e-radio-cards">
          <label class="t20pf2e-radio-card">
            <input type="radio" name="arcanistaPath" value="bruxo" ${current === "bruxo" ? "checked" : ""} />
            <div>
              <strong>Bruxo (Inteligência)</strong>
              <div class="t20pf2e-muted">Usa um foco arcano. Começa com 3 magias + 1 por nível.</div>
            </div>
          </label>
          <label class="t20pf2e-radio-card">
            <input type="radio" name="arcanistaPath" value="mago" ${current === "mago" ? "checked" : ""} />
            <div>
              <strong>Mago (Inteligência)</strong>
              <div class="t20pf2e-muted">Estuda grimório e memoriza metade das magias. Começa com 4 magias + 1/nível + 1 por novo círculo.</div>
            </div>
          </label>
          <label class="t20pf2e-radio-card">
            <input type="radio" name="arcanistaPath" value="feiticeiro" ${current === "feiticeiro" ? "checked" : ""} />
            <div>
              <strong>Feiticeiro (Carisma)</strong>
              <div class="t20pf2e-muted">Magia inata por linhagem (Carisma). Começa com 3 magias + 1 nos níveis ímpares (3º, 5º...).</div>
            </div>
          </label>
        </div>
      </div>`,
    buttons: [
      {
        action: "confirm",
        label: "Confirmar Caminho",
        default: true,
        callback: (_ev, btn) => btn.form.querySelector('input[name="arcanistaPath"]:checked')?.value || "bruxo"
      }
    ],
    rejectClose: false
  });

  const chosen = ["bruxo", "mago", "feiticeiro"].includes(pathChoice) ? pathChoice : null;
  if (chosen) {
    const applied = await applyArcanistaPathToActor(actor, chosen);
    if (applied) {
      ui.notifications.info(`Caminho do Arcanista definido: ${applied.label} (${applied.attr.toUpperCase()}).`);
    }
    return applied;
  }
  return null;
}

/**
 * Prompts the player to select +1 attribute for `Aumento de Atributo`,
 * enforcing the T20 JdA limit of 1x per attribute per Patamar.
 */
export async function promptAttributeIncreaseDialog(actor, slotLevel = 1) {
  const status = getAttributeIncreaseStatus(actor.items, slotLevel);
  const blocked = new Set(status.blockedAttrsInTier);
  const availableKeys = Object.keys(ATTR_LABELS_PT).filter((k) => !blocked.has(k));

  if (!availableKeys.length) {
    ui.notifications.warn(`Todos os atributos já receberam Aumento de Atributo no patamar ${status.currentTier.label}.`);
    return null;
  }

  const optionsHtml = Object.entries(ATTR_LABELS_PT)
    .map(([key, label]) => {
      const currentVal = Number(actor.system?.atributos?.[key]?.value ?? 0);
      const isBlocked = blocked.has(key);
      const checkedAttr = key === availableKeys[0] ? "checked" : "";
      return `
        <label class="t20pf2e-check-item ${isBlocked ? "is-disabled" : ""}" title="${isBlocked ? `Já aumentado no patamar ${status.currentTier.label}` : `+1 em ${label}`}">
          <input type="radio" name="attrChoice" value="${key}" ${isBlocked ? "disabled" : checkedAttr} />
          <span><strong>${label}</strong> (${currentVal >= 0 ? `+${currentVal}` : currentVal} → ${(currentVal + 1) >= 0 ? `+${currentVal + 1}` : currentVal + 1})${isBlocked ? " <em>(já usado no patamar)</em>" : ""}</span>
        </label>`;
    })
    .join("");

  const chosen = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: `Aumento de Atributo — Patamar ${status.currentTier.label}` },
    position: { width: 460 },
    content: `
      <div class="t20pf2e-dialog">
        <p>Escolha <strong>1 atributo</strong> para receber <strong>+1 permanente</strong> (regra: máximo 1× por patamar para o mesmo atributo):</p>
        <div class="t20pf2e-check-grid">${optionsHtml}</div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Aplicar +1",
        default: true,
        callback: (_ev, btn) => btn.form.querySelector('input[name="attrChoice"]:checked')?.value || null
      },
      {
        action: "cancel",
        label: "Cancelar",
        callback: () => null
      }
    ],
    rejectClose: false
  });

  return ATTR_LABELS_PT[chosen] ? chosen : null;
}

function detectAttrFromPowerName(name) {
  const norm = normalizeProgressKey(name);
  const map = { forca: "for", destreza: "des", constituicao: "con", inteligencia: "int", sabedoria: "sab", carisma: "car" };
  for (const [word, key] of Object.entries(map)) {
    if (norm.includes(`aumento de atributo ${word}`)) return key;
  }
  return null;
}

/**
 * Displays a PF2e-inspired Level-Up Summary Modal with gained PV/PM, passive features,
 * scaling ranks, spell circles, and immediate 1-click button to pick newly opened slots.
 */
async function promptLevelUpSummaryDialog(actor, report, pvDelta, pmDelta, { onOpenBrowser } = {}) {
  const firstSlot = report.openedSlots?.[0] || null;
  const fixedList = report.addedAbilities
    .map((a) => `<li><i class="fa-solid fa-check"></i> <strong>${escapeHtml(a.name)}</strong>${a.display ? ` <em>(${escapeHtml(a.display)})</em>` : ""}</li>`)
    .join("");
  const scaledList = report.scaledAbilities
    .map((s) => `<li><i class="fa-solid fa-arrow-trend-up"></i> <strong>${escapeHtml(s.name)}</strong> escalou para <strong>${escapeHtml(s.display)}</strong></li>`)
    .join("");
  const slotsList = report.openedSlots
    .map((s) => `<li><i class="fa-solid fa-star"></i> <strong>${escapeHtml(s.label)}</strong> <em>(Espaço Nível ${s.level})</em></li>`)
    .join("");

  const spellBlock = report.casterSummary
    ? `<div class="t20pf2e-meta-box">
        ${report.casterSummary.circleJustUnlocked ? `<div><i class="fa-solid fa-wand-sparkles"></i> <strong>Novo Círculo Liberado:</strong> ${report.casterSummary.circleJustUnlocked}º Círculo (${report.casterSummary.tradicaoLabel})</div>` : ""}
        <div><strong>Círculo Máximo:</strong> ${report.casterSummary.unlockedCircle}º · <strong>Cota de Magias Conhecidas:</strong> ${report.casterSummary.totalQuota}</div>
      </div>`
    : "";

  const buttons = [];
  if (firstSlot && typeof onOpenBrowser === "function") {
    buttons.push({
      action: "pickPower",
      label: `Escolher Poder (Nível ${firstSlot.level})`,
      default: true
    });
  }
  buttons.push({
    action: "close",
    label: "Concluir",
    default: !firstSlot
  });

  const action = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: `Subida de Nível — ${report.className} ${report.toLevel}` },
    position: { width: 520 },
    content: `
      <div class="t20pf2e-dialog t20pf2e-levelup-summary">
        <div class="t20pf2e-lvlup-banner">
          <strong>${escapeHtml(actor.name)}</strong> alcançou <strong>${escapeHtml(report.className)} Nível ${report.toLevel}</strong>!
        </div>
        <div class="t20pf2e-lvlup-deltas">
          <span class="t20pf2e-pill active"><i class="fa-solid fa-heart"></i> ${pvDelta >= 0 ? `+${pvDelta}` : pvDelta} PV Máx</span>
          <span class="t20pf2e-pill active"><i class="fa-solid fa-droplet"></i> ${pmDelta >= 0 ? `+${pmDelta}` : pmDelta} PM Máx</span>
        </div>
        ${fixedList ? `<div class="t20pf2e-section"><strong>Habilidades Adicionadas Automaticamente</strong><ul class="t20pf2e-summary-list">${fixedList}</ul></div>` : ""}
        ${scaledList ? `<div class="t20pf2e-section"><strong>Habilidades Escalonadas</strong><ul class="t20pf2e-summary-list">${scaledList}</ul></div>` : ""}
        ${spellBlock}
        ${slotsList ? `<div class="t20pf2e-section"><strong>Espaços de Escolha Liberados</strong><ul class="t20pf2e-summary-list">${slotsList}</ul></div>` : ""}
      </div>`,
    buttons,
    rejectClose: false
  });

  if (action === "pickPower" && firstSlot && typeof onOpenBrowser === "function") {
    onOpenBrowser({
      category: "poderes",
      slotContext: {
        slotId: firstSlot.slotId,
        slotLevel: firstSlot.level,
        classKey: report.classKey,
        className: report.className,
        powerSubtype: firstSlot.powerSubtype,
        allowGeneralPowers: true
      }
    });
  }
}

/**
 * Changes an existing class's level cleanly (up or down), syncing passive abilities,
 * scaling formulas, opened slots, and downgrade cleanup.
 */
export async function levelUpClassOnActor(actor, classItem, targetLevel, { onOpenBrowser, showSummary = true } = {}) {
  if (!actor || !classItem) return null;
  const maxLvl = game.settings.get("tormenta20", "gameSystem") === "Skyfall" ? 10 : 20;
  const prevLvl = Math.max(1, Number(classItem.system?.niveis ?? 1));
  const nextLvl = Math.max(1, Math.min(maxLvl, Number(targetLevel) || 1));
  if (nextLvl === prevLvl) return null;

  const prevPvMax = Number(actor.system?.attributes?.pv?.max ?? 0);
  const prevPmMax = Number(actor.system?.attributes?.pm?.max ?? 0);

  await classItem.update({ "system.niveis": nextLvl });
  const report = await syncClassLevelProgression(actor, classItem, prevLvl, nextLvl);

  const nextPvMax = Number(actor.system?.attributes?.pv?.max ?? 0);
  const nextPmMax = Number(actor.system?.attributes?.pm?.max ?? 0);
  const pvDelta = nextPvMax - prevPvMax;
  const pmDelta = nextPmMax - prevPmMax;

  if (!report) return null;

  if (nextLvl < prevLvl) {
    ui.notifications.info(
      `${actor.name}: ${classItem.name} reduzido para Nível ${nextLvl}. ${report.removedItems.length} habilidade(s)/poder(es) acima do nível removidos.`
    );
    return report;
  }

  ui.notifications.info(`${actor.name} subiu para ${classItem.name} ${nextLvl}! (+${pvDelta} PV, +${pmDelta} PM)`);
  if (showSummary) {
    await promptLevelUpSummaryDialog(actor, report, pvDelta, pmDelta, { onOpenBrowser });
  }
  return report;
}

/**
 * Applies a Deity JournalEntry to the actor, updates `system.detalhes.divindade`,
 * displays Obligations & Restrictions, and offers 1-click import of Poderes Concedidos.
 */
export async function applyDeityToActor(actor, journalDoc) {
  const data = journalDoc.flags?.[MODULE_ID]?.divindadeData || {};
  const powers = await Promise.all(
    (data.poderesConcedidos || []).map(async (gp) => ({
      ...gp,
      doc: gp.uuid ? await fromUuid(gp.uuid).catch(() => null) : null
    }))
  );
  const validPowers = powers.filter((p) => p.doc);

  const powersHtml = validPowers.length
    ? validPowers
        .map(
          (gp) => `
          <label class="t20pf2e-check-item">
            <input type="checkbox" name="grantedPower" value="${escapeHtml(gp.uuid)}" />
            <span><strong>${escapeHtml(gp.name)}</strong></span>
          </label>`
        )
        .join("")
    : `<p class="t20pf2e-muted">Nenhum poder concedido indexado automaticamente. Veja os detalhes no Diário da divindade.</p>`;

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: `Devoção — ${journalDoc.name}` },
    position: { width: 540 },
    content: `
      <div class="t20pf2e-dialog">
        <div class="t20pf2e-meta-box">
          ${data.devotos ? `<div><strong>Devotos:</strong> ${escapeHtml(data.devotos)}</div>` : ""}
          ${data.armaPreferida ? `<div><strong>Arma Preferida:</strong> ${escapeHtml(data.armaPreferida)}</div>` : ""}
          ${data.canalizar ? `<div><strong>Canalizar:</strong> ${escapeHtml(data.canalizar)}</div>` : ""}
        </div>
        ${
          data.obrigacoes
            ? `<div class="t20pf2e-section">
                 <strong>Obrigações & Restrições</strong>
                 <p class="t20pf2e-scroll-note">${escapeHtml(data.obrigacoes)}</p>
               </div>`
            : ""
        }
        <div class="t20pf2e-section">
          <div class="t20pf2e-counter-header">
            <strong>Poderes Concedidos (selecione 1 para devotos comuns, ou todos para Clérigo/Druida/Paladino):</strong>
            <button type="button" class="t20pf2e-mini-btn" data-select-all="grantedPower">Marcar Todos</button>
          </div>
          <div class="t20pf2e-check-grid">${powersHtml}</div>
        </div>
      </div>`,
    render: (_ev, dialog) => {
      const btnAll = dialog.element.querySelector('[data-select-all="grantedPower"]');
      if (btnAll) {
        btnAll.addEventListener("click", () => {
          const boxes = [...dialog.element.querySelectorAll('input[name="grantedPower"]')];
          const allChecked = boxes.every((b) => b.checked);
          for (const b of boxes) b.checked = !allChecked;
          btnAll.textContent = allChecked ? "Marcar Todos" : "Desmarcar Todos";
        });
      }
    },
    buttons: [
      {
        action: "apply",
        label: "Confirmar Devoção",
        default: true,
        callback: (_ev, btn) =>
          [...btn.form.querySelectorAll('input[name="grantedPower"]:checked')].map((el) => el.value)
      },
      {
        action: "cancel",
        label: "Cancelar",
        callback: () => null
      }
    ],
    rejectClose: false
  });

  if (!Array.isArray(choice)) return false;

  await actor.update({
    "system.detalhes.divindade": journalDoc.name,
    [`flags.${MODULE_ID}.divindadeUuid`]: journalDoc.uuid
  });

  const existingNames = new Set(actor.items.map((i) => normalizeText(i.name)));
  const toCreate = [];
  for (const uuid of choice) {
    const doc = await fromUuid(uuid).catch(() => null);
    if (doc && !existingNames.has(normalizeText(doc.name))) {
      toCreate.push(doc.toObject());
      existingNames.add(normalizeText(doc.name));
    }
  }
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);

  ui.notifications.info(`Divindade aplicada: ${journalDoc.name}`);
  return true;
}

/**
 * Applies an Origin JournalEntry to the actor: sets `system.detalhes.origem`,
 * lets the player pick 2 benefits (perícias/poderes), and optionally adds initial items.
 */
export async function applyOriginToActor(actor, journalDoc, { onOpenBrowser } = {}) {
  const data = journalDoc.flags?.[MODULE_ID]?.origemData || {};
  const pericias = data.pericias || [];
  const poderChoices = data.poderChoices || [];
  const itemMatches = data.itemMatches || [];

  const skillOptions = [];
  for (const sName of pericias) {
    const key = resolveSkillToken(sName);
    if (key === "oficio") {
      for (const ck of CRAFT_KEYS) {
        skillOptions.push({ key: ck, label: getSkillLabel(ck) });
      }
    } else if (key) {
      skillOptions.push({ key, label: getSkillLabel(key) });
    }
  }

  const skillsHtml = skillOptions
    .map(
      (s) => `
      <label class="t20pf2e-check-item">
        <input type="checkbox" name="originSkill" value="${escapeHtml(s.key)}" />
        <span><strong>Perícia:</strong> ${escapeHtml(s.label)}</span>
      </label>`
    )
    .join("");

  const powersHtml = poderChoices
    .map(
      (p, idx) => `
      <label class="t20pf2e-check-item">
        <input type="checkbox" name="originPower" value="${idx}" />
        <span><strong>Poder:</strong> ${escapeHtml(p.name)}</span>
      </label>`
    )
    .join("");

  const itemsHtml = itemMatches.length
    ? itemMatches
        .map(
          (it) => `
          <label class="t20pf2e-check-item">
            <input type="checkbox" name="originItem" value="${escapeHtml(it.uuid)}" checked />
            <span>${escapeHtml(it.name)}</span>
          </label>`
        )
        .join("")
    : "";

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-dialog-window"],
    window: { title: `Origem — ${journalDoc.name}` },
    position: { width: 540 },
    content: `
      <div class="t20pf2e-dialog">
        ${data.beneficiosTexto && !skillOptions.length ? `<div class="t20pf2e-meta-box">${escapeHtml(data.beneficiosTexto)}</div>` : ""}
        <div class="t20pf2e-section">
          <div class="t20pf2e-counter-header">
            <strong>Escolha 2 benefícios (perícias ou poderes da origem):</strong>
            <span class="t20pf2e-counter">0 / 2 selecionados</span>
          </div>
          <div class="t20pf2e-check-grid">
            ${skillsHtml}
            ${powersHtml}
          </div>
        </div>
        <div class="t20pf2e-section">
          <strong>Itens Iniciais (${escapeHtml(data.itensIniciais || "—")}):</strong>
          ${itemsHtml ? `<div class="t20pf2e-check-grid">${itemsHtml}</div>` : ""}
        </div>
      </div>`,
    render: (_ev, dialog) => {
      const counter = dialog.element.querySelector(".t20pf2e-counter");
      const allBenefitBoxes = [
        ...dialog.element.querySelectorAll('input[name="originSkill"], input[name="originPower"]')
      ];
      const refreshCounter = () => {
        const count = allBenefitBoxes.filter((b) => b.checked).length;
        if (counter) counter.textContent = `${count} / 2 selecionados`;
      };
      for (const b of allBenefitBoxes) b.addEventListener("change", refreshCounter);
    },
    buttons: [
      {
        action: "apply",
        label: "Aplicar Origem",
        default: true,
        callback: (_ev, btn) => ({
          skills: [...btn.form.querySelectorAll('input[name="originSkill"]:checked')].map((el) => el.value),
          powerIndices: [...btn.form.querySelectorAll('input[name="originPower"]:checked')].map((el) =>
            Number(el.value)
          ),
          itemUuids: [...btn.form.querySelectorAll('input[name="originItem"]:checked')].map((el) => el.value)
        })
      },
      {
        action: "cancel",
        label: "Cancelar",
        callback: () => null
      }
    ],
    rejectClose: false
  });

  if (!result || typeof result !== "object") return false;

  const updates = {
    "system.detalhes.origem": journalDoc.name,
    [`flags.${MODULE_ID}.origemUuid`]: journalDoc.uuid
  };
  for (const sk of result.skills) {
    if (actor.system.pericias?.[sk]) {
      updates[`system.pericias.${sk}.treinado`] = true;
    }
  }
  await actor.update(updates);

  const existingNames = new Set(actor.items.map((i) => normalizeText(i.name)));
  const toCreate = [];
  let pendingWildcard = null;

  for (const idx of result.powerIndices) {
    const choice = poderChoices[idx];
    if (!choice) continue;
    if (choice.wildcard && !choice.uuid) {
      pendingWildcard = choice.wildcard;
      continue;
    }
    if (choice.uuid) {
      const doc = await fromUuid(choice.uuid).catch(() => null);
      if (doc && !existingNames.has(normalizeText(doc.name))) {
        toCreate.push(doc.toObject());
        existingNames.add(normalizeText(doc.name));
      }
    }
  }

  for (const uuid of result.itemUuids) {
    const doc = await fromUuid(uuid).catch(() => null);
    if (doc) toCreate.push(doc.toObject());
  }

  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);

  ui.notifications.info(`Origem aplicada: ${journalDoc.name}`);
  if (pendingWildcard && typeof onOpenBrowser === "function") {
    onOpenBrowser({ category: "poderes", tipo: pendingWildcard });
  }
  return true;
}

/**
 * Adds a standard Item (Magia, Poder, Equipamento) from the Compendium Browser cleanly.
 * Supports linking to a class progression `slotContext` and interactive `Aumento de Atributo` choices.
 */
export async function addStandardItemToActor(actor, itemDoc, { slotContext = null } = {}) {
  const itemData = itemDoc.toObject();
  const effectiveLevel = Number(slotContext?.slotLevel || actor.system?.attributes?.nivel?.value || 1);

  if (itemData.type === "magia") {
    const already = actor.itemTypes.magia.find((m) => normalizeText(m.name) === normalizeText(itemData.name));
    if (already) {
      ui.notifications.warn(`${itemData.name} já está no grimório de ${actor.name}.`);
      return already;
    }
    if (itemData.system?.resistencia) {
      itemData.system.resistencia.atributo = actor.system.attributes?.conjuracao || "int";
    }
  } else if (itemData.type === "consumivel") {
    const existing = actor.itemTypes.consumivel.find((c) => normalizeText(c.name) === normalizeText(itemData.name));
    if (existing) {
      await existing.update({ "system.qtd": (existing.system.qtd || 1) + 1 });
      ui.notifications.info(`${itemData.name}: quantidade incrementada.`);
      return existing;
    }
  } else if (itemData.type === "poder") {
    const tags = itemData.system?.automationtags ?? [];
    if (tags.includes("pericia") && actor.sheet?.promptPericiaSelection) {
      const pericias = await actor.sheet.promptPericiaSelection();
      if (!pericias || !pericias.length) return null;
      actor.sheet._applyTreinado(itemData, pericias);
    }

    const isAttrIncrease = normalizeProgressKey(itemData.name).startsWith("aumento de atributo");
    let chosenAttrOverride = null;
    if (isAttrIncrease) {
      const preAttr = detectAttrFromPowerName(itemData.name);
      const attrStatus = getAttributeIncreaseStatus(actor.items, effectiveLevel);
      if (preAttr && attrStatus.blockedAttrsInTier.includes(preAttr)) {
        ui.notifications.warn(
          `Aumento de Atributo (${ATTR_LABELS_PT[preAttr]}) já foi escolhido no patamar ${attrStatus.currentTier.label}. Selecione outro atributo.`
        );
        chosenAttrOverride = await promptAttributeIncreaseDialog(actor, effectiveLevel);
        if (!chosenAttrOverride) return null;
      } else if (!preAttr) {
        chosenAttrOverride = await promptAttributeIncreaseDialog(actor, effectiveLevel);
        if (!chosenAttrOverride) return null;
      } else {
        chosenAttrOverride = preAttr;
      }
    }

    if (slotContext?.slotId) {
      // Clear previous item if user is refilling/replacing the same slot
      const prevInSlot = actor.items.filter((it) => it.flags?.[MODULE_ID]?.slotId === slotContext.slotId);
      if (prevInSlot.length) {
        await actor.deleteEmbeddedDocuments("Item", prevInSlot.map((it) => it.id));
      }
      itemData.flags = itemData.flags || {};
      itemData.flags[MODULE_ID] = {
        ...(itemData.flags[MODULE_ID] || {}),
        slotId: slotContext.slotId,
        slotLevel: effectiveLevel,
        classKey: slotContext.classKey || null,
        classItemId: slotContext.classItemId || null
      };
    }

    const created = await actor.createEmbeddedDocuments("Item", [itemData]);
    const createdItem = created[0] || null;
    if (createdItem && chosenAttrOverride) {
      await applyAttributeIncreaseToItem(createdItem, chosenAttrOverride, effectiveLevel);
    }
    if (createdItem) {
      const suffix = slotContext?.slotLevel ? ` (Espaço Nv ${slotContext.slotLevel})` : "";
      ui.notifications.info(`${createdItem.name} adicionado à ficha de ${actor.name}${suffix}.`);
    }
    return createdItem;
  }

  const created = await actor.createEmbeddedDocuments("Item", [itemData]);
  ui.notifications.info(`${itemData.name} adicionado à ficha de ${actor.name}.`);
  return created[0] || null;
}
