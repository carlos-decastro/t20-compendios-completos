const MODULE_ID = "t20-compendios-completos";

const ATTR_NAMES_PT = {
  for: "Força",
  des: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  sab: "Sabedoria",
  car: "Carisma"
};

const ESPECIALISTA_TIER_VALUES = new Set([2, 4, 6]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getEspecialistaExpectedBonus(actor) {
  const nivel = Math.max(1, Number(actor?.system?.attributes?.nivel?.value ?? actor?.nivel ?? 1));
  const rawTreino = Number(actor?.system?.attributes?.treino);
  if (ESPECIALISTA_TIER_VALUES.has(rawTreino)) return rawTreino;
  if (nivel >= 15) return 6;
  if (nivel >= 7) return 4;
  return 2;
}

export function extractEspecialistaRollBonus(effect) {
  const efName = normalizeText(effect?.name);
  const parentName = normalizeText(effect?.parent?.name);
  if (efName !== "especialista" && parentName !== "especialista") return null;

  const changes = effect?.system?.changes ?? effect?.changes ?? [];
  for (const ch of changes) {
    if (!ch || (ch.key !== "roll" && ch.key !== "system.roll")) continue;
    const val = Number(ch.value);
    if (ESPECIALISTA_TIER_VALUES.has(val)) return val;
  }
  return null;
}

export function filterApplicableOnUseEffects(effects, actor) {
  if (!Array.isArray(effects) || !effects.length || !actor) return effects;
  const expectedBonus = getEspecialistaExpectedBonus(actor);
  return effects.filter((ef) => {
    const bonus = extractEspecialistaRollBonus(ef);
    if (bonus === null) return true;
    return bonus === expectedBonus;
  });
}

function getEspecialistaTierLabel(bonus) {
  if (bonus === 6) return "Nível 15–20";
  if (bonus === 4) return "Nível 7–14";
  return "Nível 1–6";
}

function ensureArtonThemeStylesheet() {
  if (typeof document === "undefined" || !document.head) return;
  if (document.querySelector('link[href*="t20-arton-theme.css"]')) return;
  const link = document.createElement("link");
  link.id = "t20-arton-theme-css";
  link.rel = "stylesheet";
  link.href = `modules/${MODULE_ID}/styles/t20-arton-theme.css`;
  document.head.appendChild(link);
}

function patchActorRollAtributo() {
  const ActorCls = CONFIG?.Actor?.documentClass;
  const proto = ActorCls?.prototype;
  if (!proto || typeof proto.rollAtributo !== "function" || proto.rollAtributo._t20NamePatched) return;

  const origRollAtributo = proto.rollAtributo;
  proto.rollAtributo = function patchedRollAtributo(key, options = {}) {
    const abl = this.system?.atributos?.[key];
    if (abl && !abl.name) {
      abl.name = CONFIG?.T20?.atributos?.[key] || abl.label || ATTR_NAMES_PT[key] || String(key || "").toUpperCase();
    }
    return origRollAtributo.call(this, key, options);
  };
  proto.rollAtributo._t20NamePatched = true;
}

function patchAbilityUseDialogEffectsFilter() {
  const AbilityUseDialog = game.tormenta20?.applications?.AbilityUseDialog;
  if (!AbilityUseDialog || AbilityUseDialog._t20EspecialistaPatched || typeof AbilityUseDialog.create !== "function") {
    return;
  }
  AbilityUseDialog._t20EspecialistaPatched = true;
  const origCreate = AbilityUseDialog.create;

  AbilityUseDialog.create = async function patchedEspecialistaFilter(item, ...args) {
    if (item && Array.isArray(item.applicableOnUseEffects) && item.actor) {
      item.applicableOnUseEffects = filterApplicableOnUseEffects(item.applicableOnUseEffects, item.actor);
    }
    return origCreate.call(this, item, ...args);
  };
}

function polishUpgradeRowPrefix(row, effectById = null) {
  const nameCol = row.querySelector(".item-name");
  if (!nameCol || nameCol.dataset.t20Polished === "1") return;
  nameCol.dataset.t20Polished = "1";

  const label = nameCol.querySelector("label:first-child, p:first-child > label:first-child");
  if (!label) return;

  label.classList.add("t20pf2e-apr-prefix");
  const cleanName = label.textContent.replace(/:\s*$/, "").trim();
  if (cleanName) {
    label.textContent = cleanName;
  }

  // Ensure a clean whitespace separator if Foundry concatenated label + text directly
  const next = label.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE && next.textContent && !/^\s/.test(next.textContent)) {
    next.textContent = ` ${next.textContent}`;
  }

  // Add informative tier hint when Especialista has an empty system description
  if (effectById && cleanName.toLowerCase() === "especialista") {
    const input = row.querySelector('input[name^="aprs."]');
    const efId = input?.name?.match(/^aprs\.([^.]+)\./)?.[1];
    const ef = efId ? effectById.get(efId) : null;
    const bonus = ef ? extractEspecialistaRollBonus(ef) : null;
    const textAfterLabel = (nameCol.textContent || "").replace(cleanName, "").trim();
    if (bonus && !textAfterLabel) {
      const hint = document.createElement("span");
      hint.className = "t20pf2e-apr-hint";
      hint.textContent = `Dobra o bônus de treinamento (+${bonus} no teste · ${getEspecialistaTierLabel(bonus)})`;
      label.after(hint);
    }
  }
}

function syncUpgradeRowHighlight(row) {
  const checkbox = row.querySelector('input[type="checkbox"]');
  const numberInput = row.querySelector('input.numInp[type="number"]');
  const isActive = checkbox
    ? Boolean(checkbox.checked)
    : Number(numberInput?.value || 0) > 0;
  row.classList.toggle("is-active", isActive);
}

function enhanceAbilityUseDialog(app, html) {
  const contentRoot = html instanceof HTMLElement ? html : html?.[0];
  if (!contentRoot) return;

  const windowEl =
    app?.element?.[0] ||
    (app?.element instanceof HTMLElement ? app.element : null) ||
    contentRoot.closest(".window-app, .application");

  if (windowEl) {
    windowEl.classList.add("t20pf2e-ability-dialog", "t20pf2e-arton-window");
  }

  const form = contentRoot.querySelector("form#ability-use-form") || contentRoot;
  form.classList.add("t20pf2e-ability-form");

  // Give dialog a subtle item header banner once
  const item = app?.item;
  if (item && !form.querySelector(".t20pf2e-ability-hero")) {
    const hero = document.createElement("div");
    hero.className = "t20pf2e-ability-hero";
    const imgHtml = item.img
      ? `<img class="t20pf2e-ability-hero-img" src="${item.img}" alt="" />`
      : `<div class="t20pf2e-ability-hero-img is-fallback"><i class="fa-solid fa-dice-d20"></i></div>`;

    const subtitleParts = [];
    if (item.type === "magia") {
      if (item.system?.circulo) subtitleParts.push(`${item.system.circulo}º Círculo`);
      if (item.labels?.escola) subtitleParts.push(item.labels.escola);
      if (item.labels?.ativacao) subtitleParts.push(item.labels.ativacao);
    } else if (item.type === "arma") {
      if (item.labels?.toHit) subtitleParts.push(`Ataque ${item.labels.toHit}`);
      if (item.labels?.dano) subtitleParts.push(`Dano ${item.labels.dano}`);
      if (item.labels?.critico) subtitleParts.push(`Crítico ${item.labels.critico}`);
    } else if (item.type === "poder") {
      subtitleParts.push(item.labels?.subtipo || item.labels?.tipo || "Poder / Habilidade");
    } else if (item.type === "pericia") {
      subtitleParts.push("Teste de Perícia");
    } else if (item.type === "atributo") {
      subtitleParts.push("Teste de Atributo");
    }

    const actorName = item.actor?.name ? `<span><i class="fa-solid fa-user"></i> ${item.actor.name}</span>` : "";
    const metaLine = subtitleParts.length ? `<span>${subtitleParts.join(" · ")}</span>` : "";

    hero.innerHTML = `
      ${imgHtml}
      <div class="t20pf2e-ability-hero-info">
        <div class="t20pf2e-ability-hero-title">${item.name || "Configuração de Uso"}</div>
        <div class="t20pf2e-ability-hero-sub">${metaLine}${actorName}</div>
      </div>
    `;
    form.prepend(hero);
  }

  const effectById = new Map(
    (Array.isArray(app?.item?.applicableOnUseEffects) ? app.item.applicableOnUseEffects : [])
      .filter((ef) => ef?.id)
      .map((ef) => [ef.id, ef])
  );
  const rows = [...form.querySelectorAll(".aprimoramentos-list li.item:not(.items-header)")];
  for (const row of rows) {
    polishUpgradeRowPrefix(row, effectById);
    syncUpgradeRowHighlight(row);
  }

  if (form.dataset.t20RowListeners !== "1") {
    form.dataset.t20RowListeners = "1";
    const updateAll = () => {
      for (const r of form.querySelectorAll(".aprimoramentos-list li.item:not(.items-header)")) {
        syncUpgradeRowHighlight(r);
      }
    };
    form.addEventListener("change", updateAll);
    form.addEventListener("input", updateAll);
    form.querySelectorAll(".numCtrl").forEach((btn) => {
      btn.addEventListener("click", () => setTimeout(updateAll, 0));
    });
  }

  // Ensure dialog centers nicely with enough width and never clips bottom buttons
  if (typeof app?.setPosition === "function" && windowEl?.dataset.t20Sized !== "1") {
    windowEl.dataset.t20Sized = "1";
    requestAnimationFrame(() => {
      try {
        const targetWidth = Math.min(680, Math.max(540, window.innerWidth - 48));
        app.setPosition({ width: targetWidth, height: "auto" });
      } catch (_err) {
        // ignore closed window race
      }
    });
  }
}

function tagArtonWindows(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const win =
    app?.element?.[0] ||
    (app?.element instanceof HTMLElement ? app.element : null) ||
    root?.closest?.(".window-app, .application");
  if (!win) return;

  const isDialog = win.classList.contains("dialog");
  const isT20 = win.classList.contains("tormenta20");
  if (isDialog || isT20) {
    win.classList.add("t20pf2e-arton-window");
  }
}

export function initArtonUiTheme() {
  ensureArtonThemeStylesheet();
  patchActorRollAtributo();

  if (Hooks._t20ArtonUiThemeRegistered) return;
  Hooks._t20ArtonUiThemeRegistered = true;

  Hooks.once("ready", () => {
    ensureArtonThemeStylesheet();
    patchActorRollAtributo();
    patchAbilityUseDialogEffectsFilter();
  });

  Hooks.on("renderAbilityUseDialog", enhanceAbilityUseDialog);
  Hooks.on("renderDialog", tagArtonWindows);
  Hooks.on("renderDialogV2", tagArtonWindows);
  Hooks.on("renderItemSheet", tagArtonWindows);
  Hooks.on("renderActorSheet", tagArtonWindows);
  Hooks.on("renderActiveEffectConfig", tagArtonWindows);
}

