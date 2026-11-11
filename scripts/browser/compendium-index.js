import { COMBAT_EFFECTS_CATALOG } from "../data/combat-effects-catalog.js";

/**
 * Unified, cached Compendium Indexer for Tormenta20 PF2e-style Browser.
 * Aggregates `t20-compendios-completos` + `suplementos-de-arton` + `bestiario-de-arton` + `tormenta20`.
 */

const SOURCE_PRIORITY = [
  "t20-compendios-completos",
  "bestiario-de-arton",
  "suplementos-de-arton",
  "tormenta20"
];

const PACK_BLACKLIST_CATEGORIES = new Set([
  "bestiario-de-arton.habilidades-do-bestiario",
  "bestiario-de-arton.ameacas-livro-basico"
]);

const EQUIPMENT_TYPES = new Set(["arma", "equipamento", "consumivel", "tesouro"]);

const SOURCE_LABELS = {
  "t20-compendios-completos": "T20 Completo",
  "suplementos-de-arton": "Suplementos de Arton",
  "bestiario-de-arton": "Bestiário de Arton",
  tormenta20: "Sistema Base"
};

function computeNdBucket(ndRaw) {
  const s = String(ndRaw ?? "").trim().toUpperCase();
  if (s === "S" || s === "S+" || s === "20+") return "17+";
  if (s.includes("/")) return "0-1";
  const num = Number(s);
  if (!Number.isFinite(num) || num <= 1) return "0-1";
  if (num <= 4) return "2-4";
  if (num <= 8) return "5-8";
  if (num <= 12) return "9-12";
  if (num <= 16) return "13-16";
  return "17+";
}

export class T20CompendiumIndex {
  static _cache = null;
  static _loadingPromise = null;

  static invalidate() {
    this._cache = null;
    this._loadingPromise = null;
  }

  static async getCategories(forceRefresh = false) {
    if (this._cache && !forceRefresh) return this._cache;
    if (this._loadingPromise && !forceRefresh) return this._loadingPromise;

    this._loadingPromise = this._buildIndex().finally(() => {
      this._loadingPromise = null;
    });
    this._cache = await this._loadingPromise;
    return this._cache;
  }

  static async _buildIndex() {
    const categories = {
      classes: [],
      racas: [],
      origens: [],
      divindades: [],
      poderes: [],
      magias: [],
      equipamentos: [],
      ameacas: [],
      efeitos: COMBAT_EFFECTS_CATALOG.map((fx) => ({
        id: fx.id,
        uuid: `t20fx:${fx.id}`,
        docType: "EffectPreset",
        category: "efeitos",
        fxGroup: fx.group,
        name: fx.name,
        img: fx.img,
        pack: "t20-compendios-completos.combate",
        packLabel: "Ações, Manobras & Buffs",
        sourceGroup: "T20 Completo",
        preset: fx,
        system: {},
        subtitle: fx.subtitle
      }))
    };

    // Sort packs by module priority so enriched packs win deduplication against base `tormenta20`
    const packs = [...game.packs.values()].sort((a, b) => {
      const pa = SOURCE_PRIORITY.indexOf(a.metadata.packageName);
      const pb = SOURCE_PRIORITY.indexOf(b.metadata.packageName);
      const rankA = pa === -1 ? 99 : pa;
      const rankB = pb === -1 ? 99 : pb;
      if (rankA !== rankB) return rankA - rankB;
      return a.title.localeCompare(b.title, "pt-BR");
    });

    const seenByCat = {
      classes: new Set(),
      racas: new Set(),
      origens: new Set(),
      divindades: new Set(),
      poderes: new Set(),
      magias: new Set(),
      equipamentos: new Set(),
      ameacas: new Set()
    };

    for (const pack of packs) {
      if (PACK_BLACKLIST_CATEGORIES.has(pack.collection)) continue;
      if (!["Item", "JournalEntry", "Actor"].includes(pack.documentName)) continue;

      const pkgName = pack.metadata.packageName;
      const sourceGroup = SOURCE_LABELS[pkgName] || pack.metadata.packageName;
      const packLabel = pack.title || pack.metadata.label || pack.collection;

      if (pack.documentName === "Actor") {
        const index = await pack.getIndex({
          fields: [
            "name",
            "type",
            "img",
            "system.attributes.nd",
            "system.attributes.pv.max",
            "system.attributes.defesa.value",
            "system.detalhes.tipo",
            "system.tracos.tamanho"
          ]
        });

        for (const entry of index) {
          if (entry.type !== "npc") continue;
          const nd = entry.system?.attributes?.nd ?? "1";
          const tipo = entry.system?.detalhes?.tipo || "mon";
          const tamanho = entry.system?.tracos?.tamanho || "med";
          const dedupKey = `${this._normKey(entry.name)}::${nd}`;
          if (seenByCat.ameacas.has(dedupKey)) continue;
          seenByCat.ameacas.add(dedupKey);

          const tipoLabel = CONFIG.T20?.creatureTypes?.[tipo]
            ? game.i18n.localize(CONFIG.T20.creatureTypes[tipo])
            : tipo;
          const pvMax = entry.system?.attributes?.pv?.max;
          const defVal = entry.system?.attributes?.defesa?.value;
          const parts = [`ND ${nd}`, tipoLabel];
          if (pvMax !== undefined) parts.push(`${pvMax} PV`);
          if (defVal !== undefined) parts.push(`Def ${defVal}`);

          categories.ameacas.push({
            id: entry._id,
            uuid: entry.uuid || `Compendium.${pack.collection}.Actor.${entry._id}`,
            docType: "Actor",
            category: "ameacas",
            name: entry.name,
            img: entry.img || "icons/svg/mystery-man.svg",
            pack: pack.collection,
            packLabel,
            sourceGroup,
            nd: String(nd),
            ndBucket: computeNdBucket(nd),
            creatureType: tipo,
            size: tamanho,
            system: entry.system || {},
            subtitle: parts.join(" · ")
          });
        }
        continue;
      }

      if (pack.documentName === "JournalEntry") {
        const isOrigens = pack.metadata.name === "origens";
        const isDivindades = pack.metadata.name === "divindades";
        if (!isOrigens && !isDivindades) continue;

        const targetCat = isOrigens ? "origens" : "divindades";
        const docs = await pack.getDocuments();
        for (const doc of docs) {
          const normKey = this._normKey(doc.name);
          if (seenByCat[targetCat].has(normKey)) continue;
          seenByCat[targetCat].add(normKey);

          const modFlags = doc.flags?.["t20-compendios-completos"] || {};
          const meta = isOrigens ? modFlags.origemData : modFlags.divindadeData;
          categories[targetCat].push({
            id: doc.id,
            uuid: doc.uuid,
            docType: "JournalEntry",
            category: targetCat,
            name: doc.name,
            img: isDivindades ? "icons/magic/holy/chalice-glowing-gold.webp" : "icons/sundries/documents/document-sealed-red-tan.webp",
            pack: pack.collection,
            packLabel,
            sourceGroup,
            meta: meta || {},
            subtitle: isOrigens
              ? (meta?.beneficiosTexto || "Origem de Arton")
              : (meta?.devotos ? `Devotos: ${meta.devotos}` : "Divindade de Arton")
          });
        }
        continue;
      }

      // Item Compendium: read via fast getIndex with explicit fields
      const index = await pack.getIndex({
        fields: [
          "name",
          "type",
          "img",
          "system.circulo",
          "system.escola",
          "system.tipo",
          "system.subtipo",
          "system.execucao",
          "system.alcance",
          "system.ativacao",
          "system.preco",
          "system.espacos",
          "system.pvPorNivel",
          "system.pmPorNivel",
          "system.pericias",
          "system.atributos",
          "system.tamanho",
          "system.source"
        ]
      });

      for (const entry of index) {
        const type = entry.type;
        let cat = null;
        if (type === "classe") cat = "classes";
        else if (type === "race") cat = "racas";
        else if (type === "poder") cat = "poderes";
        else if (type === "magia") cat = "magias";
        else if (EQUIPMENT_TYPES.has(type)) cat = "equipamentos";
        else continue;

        // Deduplicate between enriched T20 Completo and Sistema Base only (preserve supplement variants)
        const dedupKey = pkgName === "suplementos-de-arton"
          ? `${this._normKey(entry.name)}::${pack.metadata.name}::${entry.system?.subtipo || ""}`
          : `${this._normKey(entry.name)}::${type}::${entry.system?.subtipo || ""}`;

        if (seenByCat[cat].has(dedupKey)) continue;
        seenByCat[cat].add(dedupKey);

        categories[cat].push({
          id: entry._id,
          uuid: entry.uuid || `Compendium.${pack.collection}.Item.${entry._id}`,
          docType: "Item",
          itemType: type,
          category: cat,
          name: entry.name,
          img: entry.img || "icons/svg/item-bag.svg",
          pack: pack.collection,
          packLabel,
          sourceGroup,
          system: entry.system || {},
          subtitle: this._buildItemSubtitle(cat, entry)
        });
      }
    }

    for (const list of Object.values(categories)) {
      list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    return categories;
  }

  static _normKey(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  static _buildItemSubtitle(cat, entry) {
    const sys = entry.system || {};
    if (cat === "classes") {
      return `${sys.pvPorNivel ?? 0} PV/nível · ${sys.pmPorNivel ?? 0} PM/nível`;
    }
    if (cat === "racas") {
      const attrs = Object.entries(sys.atributos || {})
        .filter(([, v]) => Number(v) !== 0)
        .map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? `+${v}` : v}`);
      return attrs.length ? attrs.join(", ") : "Atributos flexíveis";
    }
    if (cat === "poderes") {
      const tipo = CONFIG.T20?.powerType?.[sys.tipo] ? game.i18n.localize(CONFIG.T20.powerType[sys.tipo]) : (sys.tipo || "Poder");
      return sys.subtipo ? `${tipo} · ${sys.subtipo}` : tipo;
    }
    if (cat === "magias") {
      const tipo = CONFIG.T20?.spellType?.[sys.tipo] ? game.i18n.localize(CONFIG.T20.spellType[sys.tipo]) : (sys.tipo || "");
      const esc = CONFIG.T20?.spellSchools?.[sys.escola] ? game.i18n.localize(CONFIG.T20.spellSchools[sys.escola]) : (sys.escola || "");
      return `${sys.circulo || 1}º Círculo · ${tipo}${esc ? ` · ${esc}` : ""}`;
    }
    if (cat === "equipamentos") {
      const tipoLabel = game.i18n.localize(`TYPES.Item.${entry.type}`) || entry.type;
      const preco = sys.preco ? `T$ ${sys.preco}` : "—";
      const espacos = sys.espacos ? `${sys.espacos} esp.` : "";
      return [tipoLabel, preco, espacos].filter(Boolean).join(" · ");
    }
    return "";
  }
}

