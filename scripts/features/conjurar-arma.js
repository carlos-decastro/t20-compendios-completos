import { buildNormalizedWeaponRollsUpdate } from "./sheet-ux-enhancers.js";

const MODULE_ID = "t20-compendios-completos";

const PROF_LABELS = {
  simples: "Simples",
  marcial: "Marcial",
  exotica: "Exótica",
  fogo: "Fogo"
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectActorWeaponProficiencies(actor) {
  const profSet = new Set(
    Array.from(actor?.system?.tracos?.profArmas?.value || [])
      .map((v) => String(v || "").toLowerCase().trim())
      .filter(Boolean)
  );

  // Check powers/traits in case proficiencies were added via powers without syncing traits
  for (const item of actor?.items || []) {
    if (item.type !== "poder" && item.type !== "classe") continue;
    const norm = normalizeText(item.name);
    if (norm.includes("usararmasmarciais") || norm.includes("proficienciamarcial")) profSet.add("marcial");
    if (norm.includes("usararmasexoticas") || norm.includes("proficienciaexotica")) profSet.add("exotica");
    if (norm.includes("usararmasdefogo") || norm.includes("proficienciafogo")) profSet.add("fogo");
  }

  if (actor?.type === "character" && profSet.size === 0) {
    profSet.add("simples");
  }

  const customRaw = String(actor?.system?.tracos?.profArmas?.custom || "");
  const customTokens = customRaw
    .split(/[,;\n]+/)
    .map((s) => normalizeText(s))
    .filter(Boolean);

  return { profSet, customTokens };
}

function isWeaponProficient(entry, { profSet, customTokens }) {
  const prof = String(entry?.system?.proficiencia || "simples").toLowerCase();
  if (profSet.has(prof)) return true;

  const normName = normalizeText(entry?.name);
  return customTokens.some((tok) => tok && (normName === tok || normName.includes(tok) || tok.includes(normName)));
}

function formatDamageHint(entry) {
  const rolls = Array.isArray(entry?.system?.rolls) ? entry.system.rolls : [];
  const dmg = rolls.find((r) => r?.type === "dano");
  const baseDie = String(dmg?.parts?.[0]?.[0] || "1d6").trim() || "1d6";
  const critM = Number(entry?.system?.criticoM || 20);
  const critX = Number(entry?.system?.criticoX || 2);
  const critLabel = critX === 2 ? `${critM}` : `${critM}/×${critX}`;
  return `${baseDie} • Crít ${critLabel}`;
}

async function loadConjurableWeapons(actor, mode) {
  const pack = game.packs.get(`${MODULE_ID}.equipamentos`) || game.packs.get("tormenta20.equipamentos");
  if (!pack) return [];

  const index = await pack.getIndex({
    fields: [
      "type",
      "img",
      "name",
      "system.proficiencia",
      "system.proposito",
      "system.empunhadura",
      "system.rolls",
      "system.criticoM",
      "system.criticoX"
    ]
  });

  const profs = collectActorWeaponProficiencies(actor);
  const seenNames = new Set();
  const list = [];

  for (const entry of index) {
    if (entry.type !== "arma") continue;
    const prof = String(entry.system?.proficiencia || "simples").toLowerCase();
    const purpose = String(entry.system?.proposito || "corpo-a-corpo").toLowerCase();

    if (["natural", "improvisada", "fogo"].includes(prof)) continue;
    if (purpose === "disparo") continue;

    if (mode === "melee") {
      if (!["corpo-a-corpo", "corpo-a-corpo-arremesso"].includes(purpose)) continue;
    } else if (!["arremesso", "corpo-a-corpo-arremesso"].includes(purpose)) {
      continue;
    }

    const norm = normalizeText(entry.name);
    if (!norm || seenNames.has(norm)) continue;
    seenNames.add(norm);

    list.push({
      id: entry._id,
      packId: pack.collection,
      name: entry.name,
      img: entry.img || "icons/weapons/swords/sword-steel-ornate.webp",
      prof,
      profLabel: PROF_LABELS[prof] || prof,
      purpose,
      hint: formatDamageHint(entry),
      proficient: isWeaponProficient(entry, profs)
    });
  }

  list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return list;
}

function buildConjuredAmmoItem(kind, effectId) {
  const labels = {
    flechas: { name: "Flechas Conjuradas (+1)", img: "icons/weapons/ammunition/arrows-barbed-white.webp" },
    virotes: { name: "Virotes Conjurados (+1)", img: "icons/weapons/ammunition/bolts-steel-gray.webp" },
    balas: { name: "Balas Conjuradas (+1)", img: "icons/weapons/ammunition/shot-round-lead.webp" }
  };
  const spec = labels[kind] || labels.flechas;
  return {
    name: spec.name,
    type: "consumivel",
    img: spec.img,
    flags: {
      [MODULE_ID]: {
        conjuredWeapon: true,
        conjuredEffectId: effectId,
        preserveEquipped: true
      }
    },
    system: {
      tipo: "ammo",
      qtd: 20,
      espacos: 0,
      preco: 0,
      description: {
        value: "<p><em>Munição mágica conjurada (dura pela cena): fornece +1 em ataque e dano ao ser disparada.</em></p>",
        chat: "",
        unidentified: ""
      }
    }
  };
}

function applyConjuredBonusToWeaponData(weaponData, effectId) {
  const normalizedUpdate = buildNormalizedWeaponRollsUpdate({
    type: "arma",
    name: weaponData.name,
    system: weaponData.system
  });
  if (normalizedUpdate?.["system.rolls"]) {
    weaponData.system.rolls = normalizedUpdate["system.rolls"];
  }

  const rolls = Array.isArray(weaponData.system?.rolls) ? weaponData.system.rolls : [];
  const atkRoll = rolls.find((r) => r?.type === "ataque");
  if (atkRoll) {
    atkRoll.parts = Array.isArray(atkRoll.parts) ? atkRoll.parts : [];
    const hasConjureBonus = atkRoll.parts.some((p) => String(p?.[2] || "") === "Conjurar Arma");
    if (!hasConjureBonus) atkRoll.parts.push(["1", "", "Conjurar Arma"]);
  }

  const dmgRoll = rolls.find((r) => r?.type === "dano");
  if (dmgRoll) {
    dmgRoll.parts = Array.isArray(dmgRoll.parts) ? dmgRoll.parts : [];
    const hasConjureBonus = dmgRoll.parts.some((p) => String(p?.[2] || "") === "Conjurar Arma");
    if (!hasConjureBonus) dmgRoll.parts.push(["1", "dano", "Conjurar Arma"]);
  }

  weaponData.name = `${weaponData.name} (Conjurada)`;
  weaponData.system.espacos = 0;
  weaponData.system.preco = 0;
  weaponData.system.qtd = 1;

  const equipmentSlots = game.settings.get("tormenta20", "equipmentSlots");
  if (equipmentSlots) {
    weaponData.system.equipado2 = { ...(weaponData.system.equipado2 || {}), slot: 1.1 };
  } else {
    weaponData.system.equipado = 1;
  }

  const origDesc = weaponData.system?.description?.value || "";
  weaponData.system.description = {
    ...(weaponData.system.description || {}),
    value: `<p><em>Arma mágica conjurada (dura pela cena): +1 em testes de ataque e rolagens de dano aplicado somente nesta arma.</em></p>${origDesc}`
  };

  weaponData.flags = {
    ...(weaponData.flags || {}),
    [MODULE_ID]: {
      ...(weaponData.flags?.[MODULE_ID] || {}),
      conjuredWeapon: true,
      conjuredEffectId: effectId,
      preserveEquipped: true
    }
  };

  return weaponData;
}

async function openConjuredWeaponPicker(actor, effect, mode) {
  const weapons = await loadConjurableWeapons(actor, mode);
  if (!weapons.length && mode === "melee") {
    ui.notifications.warn("Nenhuma arma elegível encontrada nos compêndios.");
    return;
  }

  const modeTitle = mode === "melee" ? "Arma Corpo a Corpo" : "Arma de Arremesso ou Munições";
  const proficientCount = weapons.filter((w) => w.proficient).length;

  const ammoChoices = mode === "arremesso"
    ? [
        { id: "ammo:flechas", name: "20 Flechas Mágicas (+1)", hint: "Munição para arcos • Dura a cena", img: "icons/weapons/ammunition/arrows-barbed-white.webp" },
        { id: "ammo:virotes", name: "20 Virotes Mágicos (+1)", hint: "Munição para bestas • Dura a cena", img: "icons/weapons/ammunition/bolts-steel-gray.webp" },
        { id: "ammo:balas", name: "20 Balas Mágicas (+1)", hint: "Munição para fundas/armas de fogo • Dura a cena", img: "icons/weapons/ammunition/shot-round-lead.webp" }
      ]
    : [];

  const renderRowsHtml = () => {
    const ammoRows = ammoChoices.map((a) => `
      <label class="t20pf2e-conjure-option is-ammo" data-conjure-row data-proficient="true" data-name="${escapeHtml(a.name.toLowerCase())}">
        <input type="radio" name="conjuredWeaponId" value="${escapeHtml(a.id)}" />
        <img src="${escapeHtml(a.img)}" alt="" />
        <span class="t20pf2e-conjure-info">
          <strong>${escapeHtml(a.name)}</strong>
          <small>${escapeHtml(a.hint)}</small>
        </span>
        <span class="t20pf2e-conjure-tag">Munição</span>
      </label>
    `).join("");

    const weaponRows = weapons.map((w, idx) => {
      const hiddenAttr = (!w.proficient && proficientCount > 0) ? ' style="display:none"' : "";
      const checkedAttr = (proficientCount > 0 ? (w.proficient && idx === weapons.findIndex((x) => x.proficient)) : idx === 0) ? " checked" : "";
      return `
        <label class="t20pf2e-conjure-option ${w.proficient ? "" : "is-unproficient"}" data-conjure-row data-proficient="${w.proficient ? "true" : "false"}" data-name="${escapeHtml(w.name.toLowerCase())}"${hiddenAttr}>
          <input type="radio" name="conjuredWeaponId" value="${escapeHtml(w.packId)}::${escapeHtml(w.id)}"${checkedAttr} />
          <img src="${escapeHtml(w.img)}" alt="" />
          <span class="t20pf2e-conjure-info">
            <strong>${escapeHtml(w.name)}</strong>
            <small>${escapeHtml(w.hint)}</small>
          </span>
          <span class="t20pf2e-conjure-tag">${escapeHtml(w.profLabel)}</span>
        </label>
      `;
    }).join("");

    return ammoRows + weaponRows;
  };

  const content = `
    <div class="t20pf2e-conjure-dialog">
      <p class="t20pf2e-conjure-subtitle">
        Escolha a <strong>${escapeHtml(modeTitle)}</strong> que surgirá na mão de <strong>${escapeHtml(actor.name)}</strong> com <strong>+1 em ataque e dano</strong> apenas para ela:
      </p>
      <div class="t20pf2e-conjure-toolbar">
        <input type="search" class="t20pf2e-conjure-search" placeholder="Filtrar arma..." autocomplete="off" />
        <label class="t20pf2e-conjure-showall">
          <input type="checkbox" class="t20pf2e-conjure-toggle-prof"${proficientCount === 0 ? " checked" : ""} />
          Mostrar não proficientes
        </label>
      </div>
      <div class="t20pf2e-conjure-list">
        ${renderRowsHtml()}
      </div>
    </div>
  `;

  const selection = await foundry.applications.api.DialogV2.wait({
    classes: ["t20pf2e-conjure-window"],
    window: { title: `Conjurar Arma — ${modeTitle}`, icon: "fa-solid fa-wand-magic-sparkles" },
    position: { width: 470 },
    content,
    rejectClose: false,
    render: (_ev, dialog) => {
      const root = dialog?.element;
      const searchInput = root?.querySelector(".t20pf2e-conjure-search");
      const toggleProf = root?.querySelector(".t20pf2e-conjure-toggle-prof");
      const rows = Array.from(root?.querySelectorAll("[data-conjure-row]") || []);

      const applyFilter = () => {
        const query = String(searchInput?.value || "").trim().toLowerCase();
        const showAll = Boolean(toggleProf?.checked);
        for (const row of rows) {
          const isProf = row.dataset.proficient === "true";
          const matchesQuery = !query || String(row.dataset.name || "").includes(query);
          row.style.display = (matchesQuery && (showAll || isProf)) ? "" : "none";
        }
      };

      searchInput?.addEventListener("input", applyFilter);
      toggleProf?.addEventListener("change", applyFilter);
    },
    buttons: [
      {
        action: "create",
        label: "Conjurar Arma (+1/+1)",
        icon: "fa-solid fa-wand-magic-sparkles",
        default: true,
        callback: (_ev, btn, dialog) => {
          const root = btn?.form || dialog?.element;
          return root?.querySelector('input[name="conjuredWeaponId"]:checked')?.value || null;
        }
      },
      {
        action: "cancel",
        label: "Cancelar",
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ]
  });

  if (!selection) {
    await effect.delete().catch(() => {});
    return;
  }

  let createdItem = null;
  let chosenLabel = "";

  if (selection.startsWith("ammo:")) {
    const ammoData = buildConjuredAmmoItem(selection.split(":")[1], effect.id);
    chosenLabel = ammoData.name;
    const [created] = await actor.createEmbeddedDocuments("Item", [ammoData]);
    createdItem = created;
  } else {
    const [packId, docId] = selection.split("::");
    const pack = game.packs.get(packId);
    const sourceDoc = await pack?.getDocument(docId);
    if (!sourceDoc) {
      ui.notifications.error("Não foi possível carregar a arma selecionada do compêndio.");
      return;
    }
    const weaponData = sourceDoc.toObject();
    delete weaponData._id;
    applyConjuredBonusToWeaponData(weaponData, effect.id);
    chosenLabel = weaponData.name;
    const [created] = await actor.createEmbeddedDocuments("Item", [weaponData]);
    createdItem = created;
  }

  await effect.update({
    name: `Conjurar Arma: ${chosenLabel}`,
    description: `<p>Item conjurado na ficha: <strong>${escapeHtml(chosenLabel)}</strong> (+1 ataque e dano, mágico, duração cena). Remover este efeito remove o item.</p>`,
    changes: [],
    [`flags.${MODULE_ID}`]: {
      conjuredHandled: true,
      conjuredItemId: createdItem?.id || null
    }
  }).catch(() => {});

  ui.notifications.info(`${chosenLabel} adicionada aos ataques de ${actor.name} (+1 ataque e +1 dano).`);
}

export function initConjurarArma() {
  Hooks.on("createActiveEffect", (effect, _options, userId) => {
    if (userId !== game.user.id) return;
    const actor = effect?.parent;
    if (!actor || actor.documentName !== "Actor") return;
    if (effect.getFlag(MODULE_ID, "conjuredHandled")) return;

    const normName = normalizeText(effect.name);
    let mode = null;
    if (normName === "armacorpoacorpo") mode = "melee";
    else if (normName === "armadearremessooumunicoes" || normName.startsWith("armadearremesso")) mode = "arremesso";
    if (!mode) return;

    void openConjuredWeaponPicker(actor, effect, mode);
  });

  Hooks.on("deleteActiveEffect", async (effect, _options, userId) => {
    if (userId !== game.user.id) return;
    const conjuredItemId = effect?.getFlag(MODULE_ID, "conjuredItemId");
    const actor = effect?.parent;
    if (!conjuredItemId || !actor || actor.documentName !== "Actor") return;
    if (actor.items?.get(conjuredItemId)) {
      await actor.deleteEmbeddedDocuments("Item", [conjuredItemId]).catch(() => {});
    }
  });
}
