/**
 * Pure parsers for Tormenta20 Portuguese skill descriptions and class proficiencies.
 * Designed with zero Foundry runtime globals so logic can be unit-tested in Node.
 */

export const SKILL_NAME_TO_KEY = {
  acrobacia: "acro",
  adestramento: "ades",
  atletismo: "atle",
  atuacao: "atua",
  cavalgar: "cava",
  conhecimento: "conh",
  cura: "cura",
  diplomacia: "dipl",
  enganacao: "enga",
  fortitude: "fort",
  furtividade: "furt",
  guerra: "guer",
  iniciativa: "inic",
  intimidacao: "inti",
  intuicao: "intu",
  investigacao: "inve",
  jogatina: "joga",
  ladinagem: "ladi",
  luta: "luta",
  misticismo: "mist",
  nobreza: "nobr",
  percepcao: "perc",
  pilotagem: "pilo",
  pontaria: "pont",
  reflexos: "refl",
  religiao: "reli",
  sobrevivencia: "sobr",
  vontade: "vont"
};

export const CRAFT_KEYS = ["alfa", "alqu", "arme", "arte", "cozi", "enge"];

export const CRAFT_LABELS = {
  alfa: "Ofício (Alfaiataria)",
  alqu: "Ofício (Alquimia)",
  arme: "Ofício (Armeiro)",
  arte: "Ofício (Artesanato)",
  cozi: "Ofício (Cozinha)",
  enge: "Ofício (Engenharia)"
};

export const SKILL_LABELS_PT = {
  acro: "Acrobacia",
  ades: "Adestramento",
  atle: "Atletismo",
  atua: "Atuação",
  cava: "Cavalgar",
  conh: "Conhecimento",
  cura: "Cura",
  dipl: "Diplomacia",
  enga: "Enganação",
  fort: "Fortitude",
  furt: "Furtividade",
  guer: "Guerra",
  inic: "Iniciativa",
  inti: "Intimidação",
  intu: "Intuição",
  inve: "Investigação",
  joga: "Jogatina",
  ladi: "Ladinagem",
  luta: "Luta",
  mist: "Misticismo",
  nobr: "Nobreza",
  perc: "Percepção",
  pilo: "Pilotagem",
  pont: "Pontaria",
  refl: "Reflexos",
  reli: "Religião",
  sobr: "Sobrevivência",
  vont: "Vontade",
  ...CRAFT_LABELS
};

export function normalizeText(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-\s+/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Resolves a raw skill label (e.g. "Luta (For)", "Sobre- vivência (Sab)", "Ofício") to a skill key or "oficio".
 */
export function resolveSkillToken(rawToken) {
  const cleaned = normalizeText(rawToken)
    .replace(/\([^)]*\)/g, "")
    .replace(/[.;:]/g, "")
    .trim();
  if (!cleaned) return null;
  if (cleaned === "oficio" || cleaned.startsWith("oficio ")) {
    for (const k of CRAFT_KEYS) {
      if (cleaned.includes(normalizeText(CRAFT_LABELS[k]))) return k;
    }
    return "oficio";
  }
  if (SKILL_NAME_TO_KEY[cleaned]) return SKILL_NAME_TO_KEY[cleaned];
  for (const [name, key] of Object.entries(SKILL_NAME_TO_KEY)) {
    if (cleaned === name || cleaned.startsWith(`${name} `)) return key;
  }
  return null;
}

/**
 * Expands a list of tokens where "oficio" becomes all specific craft keys if requested.
 */
function expandSkillKeys(tokens, expandOficio = true) {
  const result = [];
  const seen = new Set();
  for (const tok of tokens) {
    const resolved = resolveSkillToken(tok);
    if (!resolved) continue;
    if (resolved === "oficio") {
      if (expandOficio) {
        for (const ck of CRAFT_KEYS) {
          if (!seen.has(ck)) {
            seen.add(ck);
            result.push(ck);
          }
        }
      } else if (!seen.has("oficio")) {
        seen.add("oficio");
        result.push("oficio");
      }
    } else if (!seen.has(resolved)) {
      seen.add(resolved);
      result.push(resolved);
    }
  }
  return result;
}

/**
 * Parses `class.system.pericias.inatas` and `class.system.pericias.numero`.
 * Example input:
 *   "Luta (For) ou Pontaria (Des), Fortitude (Con), mais 2 a sua escolha entre Adestramento (Car), ..."
 */
export function parseClassSkills(inatasText, numero = 0) {
  const raw = String(inatasText || "").replace(/-\s+/g, "").trim();
  const splitMatch = raw.match(/^(.*?)(?:,?\s*mais\s+(\d+)\s+a\s+sua\s+escolha\s+entre\s+)(.*)$/i);

  const innatePart = splitMatch ? splitMatch[1] : raw;
  const choiceCount = splitMatch ? Number(splitMatch[2]) || Number(numero) || 0 : Number(numero) || 0;
  const poolPart = splitMatch ? splitMatch[3] : "";

  const fixedSkills = [];
  const orChoices = [];

  // Split innate part by commas or standalone " e "
  const innateSegments = innatePart
    .split(/,|\s+e\s+(?![^()]*\))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of innateSegments) {
    if (/\s+ou\s+/i.test(seg)) {
      const options = expandSkillKeys(seg.split(/\s+ou\s+/i), false);
      if (options.length > 1) orChoices.push(options);
      else if (options.length === 1) fixedSkills.push(...options);
    } else {
      const resolved = resolveSkillToken(seg);
      if (resolved === "oficio") {
        orChoices.push([...CRAFT_KEYS]);
      } else if (resolved) {
        fixedSkills.push(resolved);
      }
    }
  }

  // Parse selectable pool skills
  const poolTokens = poolPart
    .replace(/\.$/, "")
    .split(/,|\s+e\s+(?![^()]*\))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  let poolSkills = expandSkillKeys(poolTokens, true);

  // Fallback to all core skills if custom class text did not enumerate a pool
  if (!poolSkills.length && choiceCount > 0) {
    poolSkills = [...Object.values(SKILL_NAME_TO_KEY), ...CRAFT_KEYS];
  }

  return {
    fixedSkills: [...new Set(fixedSkills)],
    orChoices,
    choiceCount,
    poolSkills
  };
}

/**
 * Fallback parser for class proficiencies from free-text descriptions.
 */
export function parseProficienciesText(text) {
  const norm = normalizeText(text);
  const profArmas = ["simples"];
  const profArmaduras = ["lev"];
  if (norm.includes("marcia")) profArmas.push("marcial");
  if (norm.includes("fogo")) profArmas.push("fogo");
  if (norm.includes("exotic")) profArmas.push("exotica");
  if (norm.includes("pesad")) profArmaduras.push("pes");
  if (norm.includes("escudo")) profArmaduras.push("esc");
  return { profArmas, profArmaduras };
}

