/**
 * Preset Combat Actions, Maneuvers (Tabela 5-3) & Classic Arton Buff Effects
 * Ready for 1-click toggle onto Tokens/Actors or rollable maneuver checks.
 */

export const COMBAT_EFFECTS_CATALOG = [
  // ---- SITUAÇÕES ESPECIAIS & MODIFICADORES (TABELA 5-3) ----
  {
    id: "t20-fx-flanquear",
    name: "Flanquear (+2 Ataque)",
    group: "situacao",
    img: "icons/skills/melee/weapons-crossed-swords-white-blue.webp",
    subtitle: "Posição · Corpo a Corpo · +2 em testes de ataque",
    summary:
      "<p><strong>Regra (Tabela 5-3):</strong> Quando você e um aliado estão em lados opostos de um inimigo, ambos o flanqueiam e recebem <strong>+2 em testes de ataque corpo a corpo</strong> contra ele.</p>",
    effectData: {
      name: "Flanqueando (+2 Ataque)",
      img: "icons/skills/melee/weapons-crossed-swords-white-blue.webp",
      duration: { rounds: 1 },
      changes: [
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "2" }
      ],
      description: "<p>Você recebe +2 em testes de ataque contra o alvo flanqueado.</p>"
    }
  },
  {
    id: "t20-fx-investida",
    name: "Investida (+2 Atq / −2 Def)",
    group: "situacao",
    img: "icons/skills/movement/feet-winged-boots-brown.webp",
    subtitle: "Ação Completa · +2 Ataque e −2 na Defesa até o próximo turno",
    summary:
      "<p><strong>Investida (Ação Completa):</strong> Você avança até o dobro do deslocamento em linha reta e faz um ataque corpo a corpo com <strong>+2 no teste de ataque</strong>, mas sofre <strong>−2 na Defesa</strong> até o início de seu próximo turno.</p>",
    effectData: {
      name: "Investida (+2 Atq / −2 Def)",
      img: "icons/skills/movement/feet-winged-boots-brown.webp",
      duration: { rounds: 1 },
      changes: [
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "2" },
        { key: "system.attributes.defesa.bonus", mode: 2, value: "-2" }
      ],
      description: "<p>+2 em testes de ataque e −2 na Defesa até o seu próximo turno.</p>"
    }
  },
  {
    id: "t20-fx-cobertura-leve",
    name: "Cobertura Leve (+5 Defesa)",
    group: "situacao",
    img: "icons/environment/settlement/wall-stone-brown.webp",
    subtitle: "Posição · +5 na Defesa contra ataques",
    summary:
      "<p><strong>Cobertura Leve:</strong> Um obstáculo protege parte do corpo (mureta, árvore, outro combatente), concedendo <strong>+5 na Defesa</strong>.</p>",
    effectData: {
      name: "Cobertura Leve (+5 Defesa)",
      img: "icons/environment/settlement/wall-stone-brown.webp",
      changes: [
        { key: "system.attributes.defesa.bonus", mode: 2, value: "5" }
      ],
      description: "<p>+5 na Defesa graças a cobertura parcial.</p>"
    }
  },
  {
    id: "t20-fx-cobertura-total",
    name: "Cobertura Total (+10 Defesa / Protegido)",
    group: "situacao",
    img: "icons/equipment/shield/heater-steel-worn.webp",
    subtitle: "Posição · Alvo protegido ou +10 Def em casos especiais",
    summary:
      "<p><strong>Cobertura Total:</strong> O alvo não pode ser atacado diretamente por estar completamente atrás de um obstáculo sólido (aplica +10 de Defesa para referência caso algum efeito tente atravessar).</p>",
    effectData: {
      name: "Cobertura Total (+10 Defesa)",
      img: "icons/equipment/shield/heater-steel-worn.webp",
      changes: [
        { key: "system.attributes.defesa.bonus", mode: 2, value: "10" }
      ],
      description: "<p>Cobertura total impede linha de efeito direta.</p>"
    }
  },
  {
    id: "t20-fx-posicao-elevada",
    name: "Posição Elevada (+2 Ataque)",
    group: "situacao",
    img: "icons/environment/wilderness/cliff-rocky.webp",
    subtitle: "Terreno · +2 em ataques corpo a corpo acima do alvo",
    summary:
      "<p><strong>Posição Elevada (Tabela 5-3):</strong> Atacando de um terreno mais alto (escada, mesa, barranco), você recebe <strong>+2 no teste de ataque corpo a corpo</strong>.</p>",
    effectData: {
      name: "Posição Elevada (+2 Ataque)",
      img: "icons/environment/wilderness/cliff-rocky.webp",
      changes: [
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "2" }
      ],
      description: "<p>+2 em ataques corpo a corpo contra inimigos abaixo.</p>"
    }
  },
  {
    id: "t20-fx-defesa-total",
    name: "Lutar na Defensiva (+5 Def / −2 Atq)",
    group: "situacao",
    img: "icons/skills/melee/shield-block-fire-orange.webp",
    subtitle: "Ação de Combate · +5 na Defesa e −2 em ataques por 1 rodada",
    summary:
      "<p><strong>Lutar na Defensiva / Ação Defensiva:</strong> Você foca em proteção, recebendo <strong>+5 na Defesa</strong>, mas sofre <strong>−2 nos testes de ataque</strong> até o próximo turno.</p>",
    effectData: {
      name: "Postura Defensiva (+5 Def / −2 Atq)",
      img: "icons/skills/melee/shield-block-fire-orange.webp",
      duration: { rounds: 1 },
      changes: [
        { key: "system.attributes.defesa.bonus", mode: 2, value: "5" },
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "-2" }
      ],
      description: "<p>+5 na Defesa e −2 nos testes de ataque até o próximo turno.</p>"
    }
  },

  // ---- MANOBRAS DE COMBATE (ROLAGEM + CHAT CARD) ----
  {
    id: "t20-manobra-agarrar",
    name: "Manobra: Agarrar",
    group: "manobra",
    img: "icons/magic/control/debuff-chains-ropes-red.webp",
    subtitle: "Manobra de Combate · Teste oposto de Luta (corpo a corpo)",
    summary:
      "<p><strong>Agarrar (Manobra de Combate):</strong> Você faz um <strong>teste de ataque corpo a corpo (Luta)</strong> oposto ao teste de Luta (ou Acrobacia) do alvo. Se vencer, o alvo fica <em>Agarrado</em> (imóvel, −2 em ataque, só ataca com arma leve; 50% de chance de atingir o agarrador em ataques à distância).</p>",
    skillRoll: { skill: "luta", label: "Manobra: Agarrar" }
  },
  {
    id: "t20-manobra-derrubar",
    name: "Manobra: Derrubar",
    group: "manobra",
    img: "icons/skills/melee/strike-hammer-destructive-blue.webp",
    subtitle: "Manobra de Combate · Teste oposto de Luta; alvo fica Caído",
    summary:
      "<p><strong>Derrubar (Manobra de Combate):</strong> Teste de ataque oposto contra o alvo. Se vencer, o alvo vai ao chão e fica <em>Caído</em> (−5 em Defesa contra ataques corpo a corpo e −5 nos ataques corpo a corpo; levantar exige Ação de Movimento).</p>",
    skillRoll: { skill: "luta", label: "Manobra: Derrubar" }
  },
  {
    id: "t20-manobra-desarmar",
    name: "Manobra: Desarmar",
    group: "manobra",
    img: "icons/skills/melee/sword-damaged-broken-white.webp",
    subtitle: "Manobra de Combate · Teste oposto de Luta; derruba arma/item",
    summary:
      "<p><strong>Desarmar (Manobra de Combate):</strong> Teste de ataque oposto (−5 se o alvo segurar com duas mãos). Se vencer, o item empunhado cai no chão no mesmo espaço. Se você vencer por 5 ou mais, derruba o item a 1d6 quadrados de distância.</p>",
    skillRoll: { skill: "luta", label: "Manobra: Desarmar" }
  },
  {
    id: "t20-manobra-empurrar",
    name: "Manobra: Empurrar",
    group: "manobra",
    img: "icons/skills/melee/shield-bash-blue.webp",
    subtitle: "Manobra de Combate · Afasta o alvo 1,5m (+1,5m a cada 5 pts)",
    summary:
      "<p><strong>Empurrar (Manobra de Combate):</strong> Teste de ataque oposto. Se vencer, empurra o alvo 1,5m para trás (+1,5m adicional para cada 5 pontos de diferença). Você pode acompanhar o movimento se tiver deslocamento restante.</p>",
    skillRoll: { skill: "luta", label: "Manobra: Empurrar" }
  },
  {
    id: "t20-manobra-quebrar",
    name: "Manobra: Quebrar",
    group: "manobra",
    img: "icons/skills/melee/strike-axe-red.webp",
    subtitle: "Manobra de Combate · Dano em arma, escudo ou objeto segurado",
    summary:
      "<p><strong>Quebrar (Manobra de Combate):</strong> Teste de ataque oposto contra um objeto empunhado pelo alvo. Se vencer, causa o dano da sua arma no item (subtraindo a RD do material).</p>",
    skillRoll: { skill: "luta", label: "Manobra: Quebrar" }
  },
  {
    id: "t20-manobra-fintar",
    name: "Ação Padrão: Fintar",
    group: "manobra",
    img: "icons/skills/social/theft-pickpocket-bribery-brown.webp",
    subtitle: "Ação Padrão · Enganação vs Reflexos (alvo Desprevenido −5 Def)",
    summary:
      "<p><strong>Fintar (Ação Padrão):</strong> Faça um teste de <strong>Enganação</strong> oposto ao teste de <strong>Reflexos</strong> de um alvo em alcance curto. Se vencer, ele fica <em>Desprevenido</em> (−5 na Defesa e Reflexos) contra o seu próximo ataque antes do fim do seu próximo turno.</p>",
    skillRoll: { skill: "enga", label: "Ação: Fintar" }
  },

  // ---- BUFFS & EFEITOS CLÁSSICOS ----
  {
    id: "t20-fx-bencao",
    name: "Bênção (+1 Ataque e Dano)",
    group: "buff",
    img: "icons/magic/holy/blessing-hands-prayer-gold.webp",
    subtitle: "Magia 1º Círculo · +1 em testes de ataque e rolagens de dano",
    summary:
      "<p><strong>Bênção:</strong> Concede <strong>+1 em testes de ataque e rolagens de dano</strong> (aumenta +1 a cada +2 PM de aprimoramento).</p>",
    effectData: {
      name: "Bênção (+1 Atq/Dano)",
      img: "icons/magic/holy/blessing-hands-prayer-gold.webp",
      changes: [
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "1" },
        { key: "system.modificadores.dano.geral", mode: 2, value: "1" }
      ],
      description: "<p>+1 em testes de ataque e rolagens de dano.</p>"
    }
  },
  {
    id: "t20-fx-perdicao",
    name: "Perdição (−1 Ataque e Dano)",
    group: "buff",
    img: "icons/magic/unholy/hand-claw-glow-red.webp",
    subtitle: "Magia 1º Círculo · −1 em testes de ataque e rolagens de dano",
    summary:
      "<p><strong>Perdição:</strong> Impõe <strong>−1 em testes de ataque e rolagens de dano</strong> nos inimigos afetados.</p>",
    effectData: {
      name: "Perdição (−1 Atq/Dano)",
      img: "icons/magic/unholy/hand-claw-glow-red.webp",
      changes: [
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "-1" },
        { key: "system.modificadores.dano.geral", mode: 2, value: "-1" }
      ],
      description: "<p>−1 em testes de ataque e rolagens de dano.</p>"
    }
  },
  {
    id: "t20-fx-oracao",
    name: "Oração (+2 Testes e Dano)",
    group: "buff",
    img: "icons/magic/holy/angel-wings-gray.webp",
    subtitle: "Magia 2º Círculo · +2 em perícias (inclui ataques) e dano",
    summary:
      "<p><strong>Oração:</strong> Você e aliados em alcance curto recebem <strong>+2 em testes de perícia e rolagens de dano</strong>.</p>",
    effectData: {
      name: "Oração (+2 Testes/Dano)",
      img: "icons/magic/holy/angel-wings-gray.webp",
      changes: [
        { key: "system.modificadores.pericias.geral", mode: 2, value: "2" },
        { key: "system.modificadores.dano.geral", mode: 2, value: "2" }
      ],
      description: "<p>+2 em testes de perícia e rolagens de dano.</p>"
    }
  },
  {
    id: "t20-fx-armadura-arcana",
    name: "Armadura Arcana (+5 Defesa)",
    group: "buff",
    img: "icons/magic/defensive/shield-barrier-blue.webp",
    subtitle: "Magia 1º Círculo · +5 na Defesa",
    summary:
      "<p><strong>Armadura Arcana:</strong> Cria uma película protetora invisível concedendo <strong>+5 na Defesa</strong> (cumulativo com outras magias apenas se especificado).</p>",
    effectData: {
      name: "Armadura Arcana (+5 Defesa)",
      img: "icons/magic/defensive/shield-barrier-blue.webp",
      changes: [
        { key: "system.attributes.defesa.bonus", mode: 2, value: "5" }
      ],
      description: "<p>+5 na Defesa.</p>"
    }
  },
  {
    id: "t20-fx-escudo-da-fe",
    name: "Escudo da Fé (+2 Defesa)",
    group: "buff",
    img: "icons/magic/defensive/shield-barrier-glowing-triangle-gold.webp",
    subtitle: "Magia 1º Círculo · +2 na Defesa por 1 turno ou cena",
    summary:
      "<p><strong>Escudo da Fé:</strong> Um escudo místico cintilante concede <strong>+2 na Defesa</strong>.</p>",
    effectData: {
      name: "Escudo da Fé (+2 Defesa)",
      img: "icons/magic/defensive/shield-barrier-glowing-triangle-gold.webp",
      duration: { rounds: 1 },
      changes: [
        { key: "system.attributes.defesa.bonus", mode: 2, value: "2" }
      ],
      description: "<p>+2 na Defesa.</p>"
    }
  },
  {
    id: "t20-fx-furia",
    name: "Fúria (+2 Atq/Dano CaC)",
    group: "buff",
    img: "icons/skills/melee/berserker-rage-red.webp",
    subtitle: "Habilidade de Bárbaro · +2 em ataques e dano corpo a corpo",
    summary:
      "<p><strong>Fúria:</strong> Concede <strong>+2 em testes de ataque e rolagens de dano corpo a corpo</strong> (não pode executar ações que exijam calma e concentração).</p>",
    effectData: {
      name: "Fúria (+2 Atq/Dano)",
      img: "icons/skills/melee/berserker-rage-red.webp",
      changes: [
        { key: "system.modificadores.pericias.ataque", mode: 2, value: "2" },
        { key: "system.modificadores.dano.cac", mode: 2, value: "2" }
      ],
      description: "<p>+2 em ataques e dano corpo a corpo durante a Fúria.</p>"
    }
  },
  {
    id: "t20-fx-inspiracao",
    name: "Inspiração (+2 Perícias)",
    group: "buff",
    img: "icons/skills/trades/music-notes-sound-blue.webp",
    subtitle: "Habilidade de Bardo/Nobre · +2 em testes de perícia",
    summary:
      "<p><strong>Inspiração / Inspirar Confiança:</strong> Concede bônus em testes de perícia (padrão +1 no nível 1, +2 no nível 5+).</p>",
    effectData: {
      name: "Inspiração (+2 Perícias)",
      img: "icons/skills/trades/music-notes-sound-blue.webp",
      changes: [
        { key: "system.modificadores.pericias.geral", mode: 2, value: "2" }
      ],
      description: "<p>+2 em testes de perícia (ajuste conforme o nível do Bardo).</p>"
    }
  },
  {
    id: "t20-fx-velocidade",
    name: "Velocidade (Ação Padrão Extra)",
    group: "buff",
    img: "icons/magic/air/wind-swirl-purple-blue.webp",
    subtitle: "Magia 2º Círculo · +1 ação padrão ou de movimento por turno",
    summary:
      "<p><strong>Velocidade:</strong> Você ganha uma ação padrão ou de movimento adicional por turno (com limitações de magias conforme a regra).</p>",
    effectData: {
      name: "Velocidade (Ação Extra)",
      img: "icons/magic/air/wind-swirl-purple-blue.webp",
      changes: [],
      description: "<p>Você recebe 1 ação padrão ou de movimento adicional por turno.</p>"
    }
  }
];

