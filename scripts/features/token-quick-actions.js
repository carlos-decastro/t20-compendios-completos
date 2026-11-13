import { getWeaponGripVariants, rollWeaponWithGrip } from "./sheet-ux-enhancers.js";

const MODULE_ID = "t20-compendios-completos";
const QA_ROOT_ID = "t20pf2e-token-actions-root";
const QA_TEMPLATE = `modules/${MODULE_ID}/templates/hud/token-quick-actions.hbs`;
const STORAGE_POS_KEY = "t20pf2e.tokenActionsPos";
const STORAGE_COLLAPSE_KEY = "t20pf2e.tokenActionsCollapsed";
const STORAGE_SKILLS_OPEN_KEY = "t20pf2e.tokenActionsExtraSkills";
const STORAGE_POWER_FILTER_KEY = "t20pf2e.tokenActionsPowerFilter";
const STORAGE_PASSIVE_OPEN_KEY = "t20pf2e.tokenActionsPassivesOpen";
const SECTION_TOGGLES = {
  skills: { prop: "_showExtraSkills", storageKey: STORAGE_SKILLS_OPEN_KEY, defaultOpen: false },
  passives: { prop: "_showPassives", storageKey: STORAGE_PASSIVE_OPEN_KEY, defaultOpen: false },
  attacks: { prop: "_showAttacks", storageKey: "t20pf2e.tokenActionsAttacksOpen", defaultOpen: true },
  spells: { prop: "_showSpells", storageKey: "t20pf2e.tokenActionsSpellsOpen", defaultOpen: true },
  powers: { prop: "_showPowers", storageKey: "t20pf2e.tokenActionsPowersOpen", defaultOpen: true },
};
const FLAG_FAVORITES_KEY = "quickActionFavorites";

const ACTION_TYPE_DEFS = {
  action: { key: "action", label: "Padrão", icon: "fa-circle-dot", color: "#7d1b1b" },
  move: { key: "move", label: "Movimento", icon: "fa-person-walking", color: "#166534" },
  reaction: { key: "reaction", label: "Reação", icon: "fa-bolt-lightning", color: "#d97706" },
  free: { key: "free", label: "Livre", icon: "fa-feather", color: "#1d4ed8" },
  full: { key: "full", label: "Completa", icon: "fa-hourglass", color: "#6b21a8" },
  passive: { key: "passive", label: "Passiva", icon: "fa-shield", color: "#594c42" }
};

function normalizeActionExecution(item) {
  const raw = String(item.system?.ativacao?.execucao ?? "").toLowerCase().trim();
  const cost = Number(item.system?.ativacao?.custo ?? 0);
  const hasRolls = Boolean(item.system?.rolls?.some((r) => r?.parts?.[0]?.[0]));
  const desc = String(item.system?.description?.value || "").toLowerCase();

  if (raw === "action" || raw === "padrao") return "action";
  if (raw === "move" || raw === "movimento") return "move";
  if (raw === "reaction" || raw === "reacao") return "reaction";
  if (raw === "free" || raw === "livre") return "free";
  if (raw === "full" || raw === "completa") return "full";
  if (raw === "passive" || raw === "passiva") return "passive";

  // If execution action wasn't set, infer from PM cost, rolls, and description:
  if (cost > 0 || hasRolls) {
    if (desc.includes("ação livre") || desc.includes("acao livre")) return "free";
    if (desc.includes("reação") || desc.includes("reacao")) return "reaction";
    if (desc.includes("ação de movimento") || desc.includes("acao de movimento")) return "move";
    if (desc.includes("ação completa") || desc.includes("acao completa")) return "full";
    return "action"; // In Tormenta20, active abilities with PM cost default to Ação Padrão!
  }

  return "passive";
}

const CORE_SKILL_DEFS = [
  { key: "inic", abbr: "Inic", label: "Iniciativa" },
  { key: "perc", abbr: "Perc", label: "Percepção" },
  { key: "fort", abbr: "Fort", label: "Fortitude" },
  { key: "refl", abbr: "Refl", label: "Reflexos" },
  { key: "vont", abbr: "Vont", label: "Vontade" }
];
const CORE_SKILL_KEYS = new Set(["luta", "pont", "inic", "perc", "fort", "refl", "vont"]);

function formatSigned(val) {
  const num = Number(val ?? 0);
  return num >= 0 ? `+${num}` : String(num);
}

function stripHtml(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractActorDefenses(actor) {
  const defense = Number(actor?.system?.attributes?.defesa?.value ?? 10);
  const resEntries = Object.entries(actor?.system?.tracos?.resistencias || {});
  const imuList = [];
  const rdList = [];
  const vulList = [];

  for (const [key, data] of resEntries) {
    if (!data) continue;
    const label = CONFIG?.T20?.damageTypes?.[key] || CONFIG?.T20?.conditionTypes?.[key] || key;
    if (data.imunidade) imuList.push(label);
    else if (data.vulnerabilidade) vulList.push(label);
    else if (Number(data.value) > 0) rdList.push(`${key === "dano" ? "RD" : label} ${data.value}`);
  }

  const ic = actor?.system?.tracos?.ic;
  if (Array.isArray(ic?.value)) {
    for (const cond of ic.value) {
      imuList.push(CONFIG?.T20?.conditionTypes?.[cond] || cond);
    }
  }
  if (ic?.custom) imuList.push(ic.custom);

  const rawDetailsRes = String(actor?.system?.detalhes?.resistencias || "").trim();
  const tooltipParts = [`Defesa: ${defense}`];
  if (rdList.length) tooltipParts.push(`Resistências: ${rdList.join(", ")}`);
  if (imuList.length) tooltipParts.push(`Imunidades: ${imuList.join(", ")}`);
  if (vulList.length) tooltipParts.push(`Vulnerabilidades: ${vulList.join(", ")}`);
  if (rawDetailsRes) tooltipParts.push(`Obs: ${rawDetailsRes}`);

  let rdSummary = "";
  if (rdList.length) rdSummary = rdList.slice(0, 2).join(", ");
  else if (imuList.length) rdSummary = `Imun. (${imuList.length})`;

  const moveData = actor?.system?.attributes?.movement || {};
  const walk = Number(moveData.walk ?? 0);
  const fly = Number(moveData.fly ?? 0);
  const swim = Number(moveData.swim ?? 0);
  const moveParts = [];
  if (walk > 0) moveParts.push(`${walk}m`);
  if (fly > 0) moveParts.push(`Voo ${fly}m`);
  if (swim > 0) moveParts.push(`Nat ${swim}m`);

  return {
    defense,
    rdSummary,
    moveSummary: moveParts.join(" · "),
    defenseTooltip: tooltipParts.join("\n")
  };
}

function groupSpellsByCircle(spells) {
  const groups = new Map();
  for (const sp of spells) {
    if (!groups.has(sp.circle)) groups.set(sp.circle, []);
    groups.get(sp.circle).push(sp);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([circle, list]) => ({ circle, label: `${circle}º Círculo`, spells: list }));
}

function extractActorCombatItems(actor) {
  const isCharacter = actor?.type === "character";
  const attacks = [];
  const spells = [];
  const powers = [];
  const inventoryItems = [];

  let totalWeaponsCount = 0;
  let totalSpellsCount = 0;
  let totalPowersCount = 0;

  for (const item of actor?.items || []) {
    const isFav = Boolean(item.flags?.tormenta20?.favorito);

    if (item.type === "arma") {
      totalWeaponsCount++;
      if (isCharacter && !isFav) continue;

      const toHit = item.labels?.toHit || "";
      const dano = item.labels?.dano || "";
      const crit = item.labels?.critico || "";
      const isRanged = item.ranged || item.system?.proposito === "disparo" || item.system?.proposito === "arremesso";
      const multi = Number(item.system?.ataques) > 1 ? Number(item.system.ataques) : 0;
      const icon = isRanged ? "fa-bullseye" : "fa-dice-d20";
      const variants = getWeaponGripVariants(item);

      if (variants.length) {
        for (const v of variants) {
          const dmgText = crit ? `${v.damageHint}, ${crit}` : v.damageHint;
          attacks.push({
            id: item.id,
            grip: v.grip,
            name: `${item.name} (${v.label})`,
            multi,
            toHit,
            damage: dmgText,
            icon,
            tooltip: `${item.name} — ${v.label}${toHit ? ` ${toHit}` : ""} (${dmgText})\nClique para rolar`
          });
        }
      } else {
        const damageLabel = dano ? (crit ? `${dano}, ${crit}` : dano) : "";
        attacks.push({
          id: item.id,
          grip: 0,
          name: item.name,
          multi,
          toHit,
          damage: damageLabel,
          icon,
          tooltip: `${item.name}${toHit ? ` ${toHit}` : ""}${damageLabel ? ` (${damageLabel})` : ""}\nClique para rolar (Shift+clique para opções)`
        });
      }
    } else if (item.type === "magia") {
      totalSpellsCount++;
      if (isCharacter && !isFav) continue;

      const pmCost = Number(item.system?.ativacao?.custo ?? 0);
      const circle = Number(item.system?.circulo ?? 1);
      const desc = stripHtml(item.system?.description?.value || "").slice(0, 180);
      spells.push({
        id: item.id,
        circle,
        name: item.name,
        cost: pmCost > 0 ? `${pmCost} PM` : "",
        tooltip: `${item.name} (${circle}º Círculo)${pmCost > 0 ? ` • ${pmCost} PM` : ""}${desc ? `\n${desc}` : ""}`
      });
    } else if (item.type === "poder") {
      totalPowersCount++;
      if (isCharacter && !isFav) continue;

      const pmCost = Number(item.system?.ativacao?.custo ?? 0);
      const desc = stripHtml(item.system?.description?.value || "").slice(0, 180);
      const exec = normalizeActionExecution(item);
      const actionDef = ACTION_TYPE_DEFS[exec] || { key: "other", label: "Outro", icon: "fa-bolt", color: "#594c42" };
      const isPassive = exec === "passive";
      powers.push({
        id: item.id,
        name: item.name,
        cost: pmCost > 0 ? `${pmCost} PM` : "",
        actionKey: exec,
        actionLabel: actionDef.label,
        actionIcon: actionDef.icon,
        isPassive,
        isFavorite: isFav,
        tooltip: `${item.name} (${actionDef.label})${pmCost > 0 ? ` • ${pmCost} PM` : ""}${desc ? `\n${desc}` : ""}\nClique: rolar/usar • Clique na estrela: favoritar`
      });
    } else if (item.type === "consumivel" || item.type === "equipamento" || item.type === "tesouro") {
      if (!isFav) continue;
      const qtd = Number(item.system?.qtd ?? 1);
      const desc = stripHtml(item.system?.description?.value || "").slice(0, 160);
      const isConsumable = item.type === "consumivel";
      const icon = isConsumable ? "fa-flask" : (item.type === "equipamento" ? "fa-shield-halved" : "fa-gem");
      inventoryItems.push({
        id: item.id,
        name: item.name,
        type: item.type,
        qtd: qtd > 1 ? `${qtd}x` : "",
        icon,
        tooltip: `${item.name}${qtd > 1 ? ` (${qtd})` : ""}${desc ? `\n${desc}` : ""}\nClique para usar/rolar`
      });
    }
  }

  // Sort powers: active before passive, then alphabetical
  powers.sort((a, b) => {
    if (a.isPassive !== b.isPassive) return a.isPassive ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  spells.sort((a, b) => (a.circle - b.circle) || a.name.localeCompare(b.name, "pt-BR"));
  inventoryItems.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return {
    attacks,
    spells,
    powers,
    inventoryItems,
    totalWeaponsCount,
    totalSpellsCount,
    totalPowersCount
  };
}

function extractActorSkills(actor) {
  const pericias = actor?.system?.pericias || {};
  const coreSkills = CORE_SKILL_DEFS.map((def) => {
    const val = Number(pericias[def.key]?.value ?? 0);
    return {
      key: def.key,
      abbr: def.abbr,
      label: def.label,
      signed: formatSigned(val)
    };
  });

  const allSkills = [];
  for (const [key, sk] of Object.entries(pericias)) {
    if (!sk) continue;
    allSkills.push({
      key,
      label: sk.label || CONFIG?.T20?.pericias?.[key] || key,
      signed: formatSigned(sk.value ?? 0),
      isTrained: Boolean(sk.treinado)
    });
  }
  allSkills.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return { coreSkills, allSkills };
}

async function triggerItemQuickAction(actor, itemId, event, grip = 0) {
  const item = actor?.items?.get(itemId);
  if (!item) return;

  if (grip === 1 || grip === 2) {
    return rollWeaponWithGrip(item, grip, event);
  }

  const hasRollsOrCost = Boolean(
    item.system?.rolls?.some((r) => r?.parts?.[0]?.[0])
    || Number(item.system?.ativacao?.custo ?? 0) > 0
    || item.type === "arma"
    || item.type === "magia"
  );

  if (hasRollsOrCost) {
    return item.roll({ event });
  }

  // Fallback for passive/descriptive abilities: post card safely to chat
  try {
    return await item.displayCard({
      options: {
        itemId: item.id,
        onUseEffects: [],
        effects: [],
        template: item.hasAreaTarget ? { area: item.system?.area, alcance: item.system?.alcance } : undefined
      }
    });
  } catch {
    const desc = item.system?.description?.value || "";
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="tormenta20 chat-card item-card">
          <header class="card-header flexrow">
            ${item.img ? `<img src="${escapeHtml(item.img)}" width="36" height="36" style="flex:0" />` : ""}
            <h3 class="item-name"><div>${escapeHtml(item.name)}</div></h3>
          </header>
          <div class="card-content">${desc || "<em>Sem descrição.</em>"}</div>
        </div>`
    });
  }
}

export function registerTokenQuickActionsSettings() {
  game.settings.register(MODULE_ID, "tokenQuickActionsScope", {
    name: "T20COMP.Settings.TokenQuickActionsScopeName",
    hint: "T20COMP.Settings.TokenQuickActionsScopeHint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      all: "Todos os Tokens (NPCs e Jogadores)",
      npc: "Somente NPCs / Ameaças",
      off: "Desativado"
    },
    default: "all",
    onChange: () => TokenQuickActionsT20.render()
  });

  game.settings.register(MODULE_ID, "enhanceNpcSheet", {
    name: "T20COMP.Settings.EnhanceNpcSheetName",
    hint: "T20COMP.Settings.EnhanceNpcSheetHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}

export class TokenQuickActionsT20 {
  static _collapsed = localStorage.getItem(STORAGE_COLLAPSE_KEY) === "1";
  static _showExtraSkills = localStorage.getItem(STORAGE_SKILLS_OPEN_KEY) === "1";
  static _powerFilter = localStorage.getItem(STORAGE_POWER_FILTER_KEY) || "all";
  static _showPassives = localStorage.getItem(STORAGE_PASSIVE_OPEN_KEY) === "1";
  static _showAttacks = localStorage.getItem(SECTION_TOGGLES.attacks.storageKey) !== "0";
  static _showSpells = localStorage.getItem(SECTION_TOGGLES.spells.storageKey) !== "0";
  static _showPowers = localStorage.getItem(SECTION_TOGGLES.powers.storageKey) !== "0";

  static init() {
    this._registerHooks();
    this._registerNpcSheetEnhancer();
  }

  static _registerHooks() {
    const refresh = () => this.render();
    Hooks.on("canvasReady", refresh);
    Hooks.on("controlToken", refresh);
    Hooks.on("updateToken", refresh);
    Hooks.on("updateActor", (actor) => {
      const selected = canvas?.tokens?.controlled?.[0]?.actor;
      if (selected && actor?.id === selected.id) this.render();
    });
    for (const hookName of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(hookName, (item) => {
        const selected = canvas?.tokens?.controlled?.[0]?.actor;
        if (selected && item?.parent?.id === selected.id) this.render();
      });
    }
  }

  static _registerNpcSheetEnhancer() {
    const applyEnhancements = (app, html) => {
      const actor = app?.actor;
      if (!actor || actor.type !== "npc") return;
      if (!game.settings.get(MODULE_ID, "enhanceNpcSheet")) return;

      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root) return;

      const form = root.matches("form") ? root : (root.querySelector("form.tormenta20.npc") || root.querySelector("form"));
      form?.classList.add("t20pf2e-enhanced-npc");

      // Clarify rollable labels with helpful tooltips
      root.querySelectorAll(".arma-rollable").forEach((el) => {
        el.setAttribute("title", "Clique para rolar Ataque e Dano (Shift+clique para opções)");
      });
      root.querySelectorAll(".pericia-rollable, .atributo-rollable").forEach((el) => {
        el.setAttribute("title", "Clique para rolar teste (Shift+clique para opções)");
      });
      root.querySelectorAll(".magia-rollable, .poder-rollable").forEach((el) => {
        el.setAttribute("title", "Clique para lançar / enviar ao chat");
      });

      const statblock = root.querySelector(".tab.statblock");
      if (!statblock || statblock.querySelector(".t20pf2e-npc-combat-dock")) return;

      const defenses = extractActorDefenses(actor);
      const { attacks, spells } = extractActorCombatItems(actor);
      const { coreSkills } = extractActorSkills(actor);

      const dock = document.createElement("section");
      dock.className = "t20pf2e-npc-combat-dock";
      dock.innerHTML = `
        <div class="t20pf2e-npc-dock-head">
          <span class="t20pf2e-npc-dock-title"><i class="fa-solid fa-dice-d20"></i> Ações Rápidas do Encontro</span>
          <div class="t20pf2e-npc-dock-meta">
            <span class="t20pf2e-qa-def-pill" title="${escapeHtml(defenses.defenseTooltip)}">
              <i class="fa-solid fa-shield-halved"></i> Def <strong>${defenses.defense}</strong>
            </span>
            ${defenses.rdSummary ? `<span class="t20pf2e-qa-rd-pill" title="${escapeHtml(defenses.defenseTooltip)}">${escapeHtml(defenses.rdSummary)}</span>` : ""}
          </div>
        </div>
        <div class="t20pf2e-npc-dock-saves">
          ${coreSkills.map((sk) => `
            <button type="button" class="t20pf2e-qa-chip is-skill" data-dock-skill="${sk.key}" title="Rolar ${sk.label}">
              <span>${sk.abbr}</span><strong>${sk.signed}</strong>
            </button>
          `).join("")}
        </div>
        ${attacks.length ? `
          <div class="t20pf2e-npc-dock-attacks">
            ${attacks.map((atk) => `
              <button type="button" class="t20pf2e-qa-attack-btn" data-dock-item="${atk.id}" data-dock-grip="${atk.grip || 0}" title="${escapeHtml(atk.tooltip)}">
                <span class="t20pf2e-qa-atk-main">
                  <i class="fa-solid ${atk.icon}"></i>
                  <span class="t20pf2e-qa-atk-name">${escapeHtml(atk.name)}</span>
                  ${atk.multi ? `<em class="t20pf2e-qa-multi">${atk.multi}x</em>` : ""}
                </span>
                <span class="t20pf2e-qa-atk-meta">
                  ${atk.toHit ? `<strong class="t20pf2e-qa-hit">${escapeHtml(atk.toHit)}</strong>` : ""}
                  ${atk.damage ? `<span class="t20pf2e-qa-dmg">${escapeHtml(atk.damage)}</span>` : ""}
                </span>
              </button>
            `).join("")}
          </div>
        ` : ""}
        ${spells.length ? `
          <div class="t20pf2e-npc-dock-spells">
            <span class="t20pf2e-npc-dock-label"><i class="fa-solid fa-wand-sparkles"></i> Magias (CD ${Number(actor.system?.attributes?.cd ?? 10)}):</span>
            <div class="t20pf2e-qa-chips-wrap">
              ${spells.map((sp) => `
                <button type="button" class="t20pf2e-qa-chip is-spell" data-dock-item="${sp.id}" title="${escapeHtml(sp.tooltip)}">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                  <span>${escapeHtml(sp.name)}</span>
                  ${sp.cost ? `<em class="t20pf2e-qa-pm">${escapeHtml(sp.cost)}</em>` : ""}
                </button>
              `).join("")}
            </div>
          </div>
        ` : ""}
      `;

      dock.querySelectorAll("[data-dock-skill]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          actor.rollPericia(btn.dataset.dockSkill, { event: ev });
        });
      });
      dock.querySelectorAll("[data-dock-item]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          triggerItemQuickAction(actor, btn.dataset.dockItem, ev, Number(btn.dataset.dockGrip || 0));
        });
      });

      const subtitle = statblock.querySelector(".title-row")?.nextElementSibling;
      if (subtitle && subtitle.tagName === "I") subtitle.after(dock);
      else statblock.prepend(dock);
    };

    Hooks.on("renderActorSheetT20NPC", applyEnhancements);
    Hooks.on("renderActorSheet", applyEnhancements);
  }

  static _ensureRoot() {
    let root = document.getElementById(QA_ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = QA_ROOT_ID;
      document.body.appendChild(root);
    }
    this._applySavedPosition(root);
    return root;
  }

  static _applySavedPosition(root) {
    try {
      const raw = localStorage.getItem(STORAGE_POS_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (Number.isFinite(pos?.left) && Number.isFinite(pos?.top)) {
        const maxLeft = Math.max(12, window.innerWidth - 300);
        const maxTop = Math.max(12, window.innerHeight - 100);
        root.style.left = `${Math.clamp(pos.left, 8, maxLeft)}px`;
        root.style.top = `${Math.clamp(pos.top, 8, maxTop)}px`;
      }
    } catch {
      // Ignore invalid position cache
    }
  }

  static _getSelectedTokenForMenu() {
    const scope = game.settings.get(MODULE_ID, "tokenQuickActionsScope");
    if (scope === "off") return null;

    const controlled = (canvas?.tokens?.controlled || []).filter((t) => {
      const actor = t.actor;
      if (!actor || !actor.isOwner) return false;
      if (scope === "npc" && actor.type !== "npc") return false;
      return ["npc", "character"].includes(actor.type);
    });

    return controlled[0] || null;
  }

  static async render() {
    if (!game?.ready && !canvas?.ready) return;
    const root = this._ensureRoot();
    const token = this._getSelectedTokenForMenu();
    if (!token) {
      root.innerHTML = "";
      return;
    }

    const actor = token.actor;
    const defenses = extractActorDefenses(actor);
    const { attacks, spells, powers, inventoryItems, totalWeaponsCount, totalSpellsCount, totalPowersCount } = extractActorCombatItems(actor);
    const { coreSkills, allSkills } = extractActorSkills(actor);

    const badgeText = actor.type === "npc"
      ? `ND ${actor.system?.attributes?.nd ?? "?"}`
      : `Nível ${actor.system?.attributes?.nivel?.value ?? 1}`;

    const activePowers = powers.filter((p) => !p.isPassive);
    const passivePowers = powers.filter((p) => p.isPassive);

    // Filter powers according to selected action type
    const currentFilter = this._powerFilter;
    const filterPowers = (list) => {
      if (currentFilter === "all") return list;
      if (currentFilter === "action") return list.filter((p) => p.actionKey === "action");
      if (currentFilter === "move") return list.filter((p) => p.actionKey === "move");
      if (currentFilter === "free_react") return list.filter((p) => p.actionKey === "free" || p.actionKey === "reaction");
      return list;
    };

    const visibleActivePowers = filterPowers(activePowers);
    const visiblePassivePowers = filterPowers(passivePowers);

    const powerFilters = [
      { key: "all", label: "Todos", count: powers.length },
      { key: "action", label: "Padrão", count: powers.filter((p) => p.actionKey === "action").length },
      { key: "move", label: "Mov.", count: powers.filter((p) => p.actionKey === "move").length },
      { key: "free_react", label: "Livre/Reação", count: powers.filter((p) => p.actionKey === "free" || p.actionKey === "reaction").length }
    ].filter((f) => f.key === "all" || f.count > 0);

    for (const f of powerFilters) {
      f.isActive = f.key === currentFilter;
    }

    const html = await foundry.applications.handlebars.renderTemplate(QA_TEMPLATE, {
      visible: true,
      collapsed: this._collapsed,
      showExtraSkills: this._showExtraSkills,
      showPassives: this._showPassives,
      showAttacks: this._showAttacks,
      showSpells: this._showSpells,
      showPowers: this._showPowers,
      powerFilter: currentFilter,
      powerFilters,
      name: token.name || actor.name,
      img: token.document?.texture?.src || actor.img,
      badgeText,
      defense: defenses.defense,
      rdSummary: defenses.rdSummary,
      moveSummary: defenses.moveSummary,
      defenseTooltip: defenses.defenseTooltip,
      spellDC: Number(actor.system?.attributes?.cd ?? 0) || null,
      coreSkills,
      allSkills,
      attacks,
      spells,
      spellCircles: groupSpellsByCircle(spells),
      powers,
      inventoryItems,
      hasWeaponsTotal: totalWeaponsCount > 0,
      hasSpellsTotal: totalSpellsCount > 0,
      hasPowersTotal: totalPowersCount > 0,
      activePowers: visibleActivePowers,
      passivePowers: visiblePassivePowers,
      totalActiveCount: activePowers.length,
      totalPassiveCount: passivePowers.length,
      hasPassives: passivePowers.length > 0
    });

    root.innerHTML = html;
    this._bindEvents(root, actor);
  }

  static _bindEvents(root, actor) {
    root.querySelectorAll("[data-qa-action]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const action = btn.dataset.qaAction;
        if (action === "open-sheet") {
          actor.sheet?.render(true);
        } else if (action === "toggle-collapse") {
          this._collapsed = !this._collapsed;
          localStorage.setItem(STORAGE_COLLAPSE_KEY, this._collapsed ? "1" : "0");
          this.render();
        } else if (action === "toggle-skills" || action === "toggle-passives" || action === "toggle-section") {
          const sectionKey =
            action === "toggle-skills" ? "skills" : action === "toggle-passives" ? "passives" : btn.dataset.qaSection;
          const toggle = SECTION_TOGGLES[sectionKey];
          if (toggle) {
            this[toggle.prop] = !this[toggle.prop];
            localStorage.setItem(toggle.storageKey, this[toggle.prop] ? "1" : "0");
            this.render();
          }
        } else if (action === "set-power-filter") {
          const filter = btn.dataset.qaFilter || "all";
          this._powerFilter = filter;
          localStorage.setItem(STORAGE_POWER_FILTER_KEY, filter);
          this.render();
        }
      });
    });

    root.querySelectorAll("[data-qa-fav-toggle]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemId = btn.dataset.qaFavToggle;
        if (!itemId || !actor?.isOwner) return;
        const item = actor.items?.get(itemId);
        if (!item) return;

        const current = Boolean(item.flags?.tormenta20?.favorito);
        await item.setFlag("tormenta20", "favorito", !current);
        this.render();
      });
    });

    const skillSearchInput = root.querySelector(".t20pf2e-qa-skill-search-input");
    const skillSearchClear = root.querySelector(".t20pf2e-qa-search-clear");
    const skillChips = root.querySelectorAll(".t20pf2e-qa-skills-list .is-extra-skill");

    if (skillSearchInput) {
      skillSearchInput.addEventListener("input", () => {
        const query = skillSearchInput.value.toLowerCase().trim();
        if (skillSearchClear) skillSearchClear.style.display = query ? "inline-flex" : "none";
        skillChips.forEach((chip) => {
          const name = (chip.dataset.skillName || chip.textContent || "").toLowerCase();
          chip.style.display = name.includes(query) ? "" : "none";
        });
      });

      if (skillSearchClear) {
        skillSearchClear.addEventListener("click", () => {
          skillSearchInput.value = "";
          skillSearchClear.style.display = "none";
          skillChips.forEach((chip) => {
            chip.style.display = "";
          });
          skillSearchInput.focus();
        });
      }
    }

    root.querySelectorAll("[data-qa-skill]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        actor.rollPericia(btn.dataset.qaSkill, { event: ev });
      });
    });

    root.querySelectorAll("[data-qa-item]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        triggerItemQuickAction(actor, btn.dataset.qaItem, ev, Number(btn.dataset.qaGrip || 0));
      });
    });

    const dragHandle = root.querySelector("[data-qa-drag]");
    if (dragHandle) {
      dragHandle.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("button")) return;
        ev.preventDefault();
        const rect = root.getBoundingClientRect();
        const offsetX = ev.clientX - rect.left;
        const offsetY = ev.clientY - rect.top;

        const onMove = (moveEv) => {
          const left = Math.clamp(moveEv.clientX - offsetX, 8, window.innerWidth - rect.width - 8);
          const top = Math.clamp(moveEv.clientY - offsetY, 8, window.innerHeight - rect.height - 8);
          root.style.left = `${left}px`;
          root.style.top = `${top}px`;
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          const finalRect = root.getBoundingClientRect();
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify({
            left: Math.round(finalRect.left),
            top: Math.round(finalRect.top)
          }));
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }
  }
}
