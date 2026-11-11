// Auto-generated from compedios_vindos_do_ocr/itens_magicos_tormenta20.json
export const FORGE_IMPROVEMENT_COSTS = { 0: 0, 1: 300, 2: 3000, 3: 9000, 4: 18000 };
export const FORGE_ENCHANT_COSTS = { 0: 0, 1: 18000, 2: 36000, 3: 72000 };
export const FORGE_MELHORIAS = [
  {
    "id": "ajustada",
    "nome": "Ajustada",
    "descricao": "Feito com peças medidas com precisão, o item tem a sua penalidade de armadura diminuída em 1.",
    "appliesTo": [
      "armadura",
      "escudo"
    ],
    "penDelta": 1,
    "tag": "−1 penalidade de armadura"
  },
  {
    "id": "aprimorado",
    "nome": "Aprimorado",
    "descricao": "O item é construído de forma cuidadosa e com os melhores materiais. Esta melhoria só pode ser aplicada a uma ferramenta ou vestuário que modifique uma perícia (reduza uma penalidade ou forneça um bônus) e fornece um bônus de +1 nessa perícia (ou aumenta o bônus fornecido em +1). Por exemplo, uma maleta de medicamentos aprimorada fornece +1 em Cura e uma luva de pelica aprimorada fornece +2 em Ladinagem.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "atroz",
    "nome": "Atroz",
    "descricao": "A arma é um amontoado de pontas, ganchos e protuberâncias. É difícil empunhá-la sem se machucar, mas ela fornece +2 nas rolagens de dano. Pré-requisito: Cruel.",
    "appliesTo": [
      "arma"
    ],
    "dmgDelta": 1,
    "prereq": "Cruel",
    "tag": "+1 dano (+2 com Cruel)"
  },
  {
    "id": "banhado-a-ouro",
    "nome": "Banhado a Ouro",
    "descricao": "Uma melhoria favorita de nobres pomposos ou de aventureiros que acabaram de enriquecer. Fornece +2 em Diplomacia. O mestre pode mudar o bônus para uma penalidade de -2 contra pessoas que desprezam ostentação. Além disso, pode atrair a cobiça de ladrões.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "canalizador",
    "nome": "Canalizador",
    "descricao": "O esotérico possui uma gema mística que permite que você canalize mais mana do que normalmente seria capaz. O máximo de PM que você pode gastar em magias aumenta em +1.",
    "appliesTo": [
      "esoterico",
      "equipamento"
    ],
    "tag": "+1 limite de PM por magia"
  },
  {
    "id": "certeira",
    "nome": "Certeira",
    "descricao": "Fabricada para ser mais precisa e balanceada, a arma fornece +1 nos testes de ataque.",
    "appliesTo": [
      "arma"
    ],
    "atkDelta": 1,
    "tag": "+1 em testes de ataque"
  },
  {
    "id": "cravejado-de-gemas",
    "nome": "Cravejado de Gemas",
    "descricao": "É fácil ser persuadido por alguém opulento o bastante para ostentar um item cravejado de gemas. Fornece +2 em Enganação. Assim como um item banhado a ouro, um item cravejado de gemas pode atrair a cobiça de ladrões.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "cruel",
    "nome": "Cruel",
    "descricao": "Rebarbas, espinhos e até mesmo lâminas adicionais compõem uma arma cruel. Ela fornece +1 nas rolagens de dano.",
    "appliesTo": [
      "arma"
    ],
    "dmgDelta": 1,
    "tag": "+1 nas rolagens de dano"
  },
  {
    "id": "delicada",
    "nome": "Delicada",
    "descricao": "Apenas os materiais mais leves foram usados nesta armadura. As placas têm a espessura mínima necessária para oferecer a proteção que devem. Esta melhoria só pode ser aplicada a armaduras pesadas e permite que o personagem aplique 1 ponto de sua Destreza na Defesa (ou de outro atributo, caso o utilize em vez de Des). Uma armadura não pode ser delicada e reforçada.",
    "appliesTo": [
      "armadura"
    ],
    "maxAtrDelta": 1,
    "tag": "+1 Destreza máxima na Defesa"
  },
  {
    "id": "discreto",
    "nome": "Discreto",
    "descricao": "O item é disfarçado como outro item inócuo (como um florete escondido em uma bengala) ou modificado para ser telescópico (podendo se dobrar em si mesmo para ocupar menos espaço). O item ocupa -1 espaço (mínimo 1) e fornece +5 em testes de Ladinagem para ser ocultado.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "energetico",
    "nome": "Energético",
    "descricao": "Catalisadores alquímicos inseridos no item fazem com que ele potencialize energias mágicas. Suas magias que causam dano causam +1d6 pontos de dano do mesmo de tipo.",
    "appliesTo": [
      "esoterico",
      "equipamento"
    ],
    "tag": "+1d6 dano elemental em magias"
  },
  {
    "id": "equilibrada",
    "nome": "Equilibrada",
    "descricao": "Uma arma equilibrada é forjada com o balanço perfeito, o que facilita movimentos complexos. Ela fornece +2 em testes de manobras (desarmar, quebrar etc.).",
    "appliesTo": [
      "arma"
    ],
    "tag": "+2 em testes de manobra"
  },
  {
    "id": "espinhosa-armadura",
    "nome": "Espinhosa (Armadura)",
    "descricao": "Uma armadura coberta de espinhos é uma visão impressionante - principalmente se os espinhos estiverem banhados com o sangue dos inimigos! Se o usuário agarrar ou for agarrado por uma criatura, causa dano de perfuração nesta criatura igual a sua Força. O dano é causado quando a manobra é feita e no início de cada turno do personagem, enquanto ela for mantida.",
    "appliesTo": [
      "armadura"
    ],
    "tag": "Causa 1d4 perfuração em agarrão"
  },
  {
    "id": "espinhoso-escudo",
    "nome": "Espinhoso (Escudo)",
    "descricao": "Aumenta o dano de um ataque com escudo em um passo.",
    "appliesTo": [
      "escudo",
      "equipamento"
    ],
    "tag": "+1d4 dano ao atacar com escudo"
  },
  {
    "id": "harmonizada-arma",
    "nome": "Harmonizada (Arma)",
    "descricao": "A arma foi banhada em óleos alquímicos que a deixaram sintonizada com a aura de seu usuário. Escolha uma habilidade ativada ao se fazer um ataque ou usar a ação agredir e que custe pontos de mana. Esta habilidade tem seu custo em PM reduzido em -1 se utilizada com esta arma. Pré-requisito: outra melhoria qualquer.",
    "appliesTo": [
      "arma"
    ],
    "tag": "−1 PM em uma habilidade de ataque"
  },
  {
    "id": "harmonizado-esoterico",
    "nome": "Harmonizado (Esotérico)",
    "descricao": "Escolha uma magia. Seu custo diminui em -1 PM. Você pode mudar a magia afetada pelo item com um ritual que exige um dia e T$ 100 em ingredientes.",
    "appliesTo": [
      "esoterico",
      "equipamento"
    ],
    "tag": "−1 PM ao lançar magia"
  },
  {
    "id": "injecao-alquimica",
    "nome": "Injeção Alquímica",
    "descricao": "Um minúsculo frasco de cerâmica ou vidro é inserido ao longo da arma, junto com um mecanismo injetor ativado por impacto. Um ataque que acerte causa seu dano normal e libera uma carga de um preparado (como ácido ou fogo alquímico) ou de água benta, que atinge o alvo automaticamente. A melhoria tem espaço para 2 doses. Carregá-la exige uma ação completa e o gasto dos itens com os quais você quiser carregá-la.",
    "appliesTo": [
      "arma"
    ],
    "tag": "Acopla preparado alquímico/água benta"
  },
  {
    "id": "macabro",
    "nome": "Macabro",
    "descricao": "O macabro é pintado com sangue seco, esculpido na forma de uma caveira ou decorado com pedaços de orelhas, dedos e olhos. Essa aparência assustadora fornece +2 em Intimidação, mas impõe uma penalidade de -2 em Diplomacia.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "macica",
    "nome": "Maciça",
    "descricao": "A arma é feita com material denso, fazendo com que seus golpes tenham impacto terrível. O multiplicador de crítico da arma aumenta em 1 ponto. Uma arma não pode ser maciça e precisa.",
    "appliesTo": [
      "arma"
    ],
    "critXDelta": 1,
    "tag": "+1 no multiplicador de crítico"
  },
  {
    "id": "mira-telescopica",
    "nome": "Mira Telescópica",
    "descricao": "Aumenta o alcance da arma em uma categoria (de curto para médio, de médio para longo) e o alcance da habilidade Ataque Furtivo para médio. Esta melhoria só pode ser aplicada em armas de disparo (exceto fundas).",
    "appliesTo": [
      "arma"
    ],
    "tag": "Aumenta alcance em uma categoria"
  },
  {
    "id": "poderoso",
    "nome": "Poderoso",
    "descricao": "A CD para resistir a suas magias aumenta em +1.",
    "appliesTo": [
      "esoterico",
      "equipamento"
    ],
    "tag": "+1 na CD de magias"
  },
  {
    "id": "polida",
    "nome": "Polida",
    "descricao": "A armadura ou escudo foi feito com metais reluzentes. Além de bonita, a luz refletida ofusca inimigos. Em ambientes iluminados, o bônus de Defesa do item aumenta em +5, mas apenas na primeira rodada de combate - após isso, os inimigos se acostumam ao reflexo.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "precisa",
    "nome": "Precisa",
    "descricao": "Cuidado especial foi tomado ao temperar o aço desta arma, para que seu fio se mantenha sempre como uma navalha. A margem de ameaça aumenta em 1 ponto. Uma arma não pode ser precisa e maciça.",
    "appliesTo": [
      "arma"
    ],
    "critMDelta": -1,
    "tag": "+1 na margem de ameaça"
  },
  {
    "id": "pungente",
    "nome": "Pungente",
    "descricao": "Temperada diversas vezes para adquirir o fio ou o equilíbrio perfeito, a arma fornece +2 nos testes de ataque. Pré-requisito: Certeira.",
    "appliesTo": [
      "arma"
    ],
    "atkDelta": 1,
    "prereq": "Certeira",
    "tag": "+1 ataque (+2 com Certeira)"
  },
  {
    "id": "reforcada",
    "nome": "Reforçada",
    "descricao": "Se for uma armadura, o item possui uma camada adicional de tecido, malha mais densa ou placas mais grossas. Se for um escudo, possui uma chapa mais espessa. O bônus na Defesa e a penalidade de armadura do item aumentam em 1. Um item não pode ser reforçado e delicado.",
    "appliesTo": [
      "armadura",
      "escudo"
    ],
    "defDelta": 1,
    "espDelta": 1,
    "tag": "+1 Defesa, +1 espaço"
  },
  {
    "id": "selada",
    "nome": "Selada",
    "descricao": "A armadura foi forjada de forma a proteger todo o corpo do usuário, sem deixar espaço para nem mesmo um alfinete! Esta melhoria fornece um bônus de +1 em testes de resistência, mas só pode ser aplicado em armaduras pesadas.",
    "appliesTo": [
      "all"
    ],
    "tag": "Melhoria especial / social"
  },
  {
    "id": "sob-medida",
    "nome": "Sob Medida",
    "descricao": "Embora muitas armaduras sejam feitas especificamente para um usuário, esta passou por um período extenso de ajustes e refinamento, adequando-se com perfeição ao seu corpo. Reduz a penalidade de armadura em 2, mas apenas para o usuário específico (para outros, comporta-se como um item ajustado). Pré-requisito: Ajustada.",
    "appliesTo": [
      "armadura"
    ],
    "penDelta": 2,
    "tag": "−2 penalidade de armadura"
  },
  {
    "id": "vigilante",
    "nome": "Vigilante",
    "descricao": "O item usa parte de sua mana pessoal para gerar um campo que desvia ataques. Você recebe +2 na Defesa.",
    "appliesTo": [
      "esoterico",
      "equipamento"
    ],
    "tag": "+2 na Defesa ou Percepção"
  }
];
export const FORGE_MATERIAIS = [
  {
    "id": "aco-rubi",
    "nome": "Aço-Rubi",
    "descricao": "Este metal tem a aparência de vidro avermelhado, mas é duro como aço. Aço-rubi é caríssimo e comercializado apenas por uma guilda de ferreiros de Doherimm. Os anões mantém a origem deste material em segredo, mas suspeita-se de que ele seja minerado das profundezas de uma área de Tormenta.  Arma. A arma ignora 10 pontos de redução de dano, além de ignorar a imunidade a crítico de lefeu.  Armadura e Escudo. Fornece uma chance de ignorar o dano extra de acertos críticos e ataques furtivos: armaduras leves e escudos, 25% (1 em 1d4); armaduras pesadas, 50% (qualquer valor par em qualquer dado), cumulativas entre si.  Esotérico. Quando lança uma magia que causa dano, ela ignora 10 pontos de redução de dano, além de ignorar as imunidades a dano de lefeu.",
    "armaCost": 6000,
    "armLeveCost": 3000,
    "armPesadaCost": 6000,
    "escudoCost": 3000,
    "esotCost": 3000,
    "tag": "Ignora 10 RD (arma) / ignora crítico (armadura)"
  },
  {
    "id": "adamante",
    "nome": "Adamante",
    "descricao": "Encontrado apenas em meteoritos (e por isso também chamado de \"ferro-meteórico\"), o adamante é um metal escuro, fosco e mais denso que o aço.  Arma. Aumenta o dano em um passo.  Armadura e Escudo. Fornece redução de dano: armaduras leves e escudos, RD 2; armaduras pesadas, RD 5.  Esotérico. Quando lança uma magia que causa dano, você pode pagar +1 PM para rolar novamente qualquer resultado 1 na rolagem de dano dela.",
    "armaCost": 3000,
    "armLeveCost": 1500,
    "armPesadaCost": 3000,
    "escudoCost": 1500,
    "esotCost": 1500,
    "penDelta": 0,
    "tag": "+1 passo dano (arma) / RD (armadura)"
  },
  {
    "id": "gelo-eterno",
    "nome": "Gelo eterno",
    "descricao": "As gélidas Montanhas Uivantes produzem gelo que nunca derrete. Expedições de aventureiros exploram essa região glacial perigosa à caça deste material fantástico.  Arma. Causa +2 pontos de dano por frio.  Armadura e Escudo. Fornece redução de fogo: armaduras leves e escudos, redução 5; armaduras pesadas, redução 10.  Esotérico. Quando lança uma magia de frio que causa dano, você pode rolar novamente qualquer resultado 1 na rolagem de dano dela.",
    "armaCost": 600,
    "armLeveCost": 1500,
    "armPesadaCost": 3000,
    "escudoCost": 1500,
    "esotCost": 1500,
    "tag": "+2 dano frio / RD fogo"
  },
  {
    "id": "madeira-tollon",
    "nome": "Madeira Tollon",
    "descricao": "A Floresta de Tollon produz um tipo de madeira negra, dura como aço e dotada de propriedades mágicas. Apenas armas de madeira - arcos, bordões, clavas, lanças, piques e tacapes -, escudos leves e esotéricos podem ser feitos com madeira Tollon.  Arma. Conta como mágica para vencer redução de dano. Além disso, habilidades ativadas ao se fazer um ataque ou usar a ação agredir têm seu custo em PM reduzido em -1.  Escudo e Esotérico. Fornece resistência a magia +2.",
    "armaCost": 300,
    "armLeveCost": 1500,
    "armPesadaCost": 3000,
    "escudoCost": 1500,
    "esotCost": 1500,
    "tag": "−1 PM habilidades / mágica"
  },
  {
    "id": "materia-vermelha",
    "nome": "Matéria Vermelha",
    "descricao": "Qualquer material de origem lefeu - desde suas garras e carapaças, até minérios e partes de estruturas encontradas em áreas de Tormenta - apresenta propriedades parecidas, sendo conhecido como \"matéria vermelha\". Estes itens assustadores impõem ao usuário penalidade de -2 em perícias baseadas em Carisma (exceto Intimidação).  Arma. Causa +1d6 de dano extra. Porém, sempre que você acerta um ataque com a arma, perde 1 ponto de vida. Lefou e lefeu são imunes tanto ao dano extra de matéria vermelha quanto à perda de vida por usar armas desse material.  Armadura e Escudo. Por sua aparência \"borrada\", fornecem chance de falha para cada ataque: 10% para escudos e armaduras leves, 25% para armaduras pesadas (cumulativas entre si). Lefeu ignoram este efeito.  Esotérico. Você e todos os seus inimigos em alcance curto sofrem -2 em testes de resistência contra efeitos mágicos.",
    "armaCost": 1500,
    "armLeveCost": 1500,
    "armPesadaCost": 3000,
    "escudoCost": 1500,
    "esotCost": 1500,
    "tag": "+1d6 dano extra (Tormenta) / camuflagem"
  },
  {
    "id": "mitral",
    "nome": "Mitral",
    "descricao": "Metal raro e valioso, o mitral é prateado, brilhante e mais leve que aço. Itens de mitral ocupam -1 espaço (mínimo 1).",
    "armaCost": 1500,
    "armLeveCost": 1500,
    "armPesadaCost": 3000,
    "escudoCost": 1500,
    "esotCost": 1500,
    "critMDelta": -1,
    "penDelta": 2,
    "espDelta": -1,
    "tag": "Arma +1 margem; Armadura −2 pen e −1 esp."
  }
];
export const FORGE_ENCANTOS_ARMAS = [
  {
    "id": "ameacadora",
    "nome": "Ameaçadora",
    "resumo": "Duplica margem de ameaça",
    "descricao": "A margem de ameaça da arma duplica. Por exemplo, uma espada longa ameaçadora tem margem de ameaça 17. Efeitos que duplicam a margem de ameaça são aplicados antes de quaisquer efeitos que a aumentem."
  },
  {
    "id": "anticriatura",
    "nome": "Anticriatura",
    "resumo": "Bônus contra tipo de criatura",
    "descricao": "A arma é letal contra um tipo de criatura (ou uma raça de humanoides). Uma vez por rodada, quando ataca uma criatura desse tipo, você pode gastar 2 PM. Se fizer isso e acertar o ataque, causa +4d8 de dano. Para determinar o tipo de criatura aleatoriamente, role 1d6: 1) animal; 2) construto; 3) espírito; 4) monstro; 5) morto-vivo; 6) uma raça de humanoides."
  },
  {
    "id": "arremesso",
    "nome": "Arremesso",
    "resumo": "Pode ser arremessada",
    "descricao": "A arma pode ser arremessada em alcance curto. Caso já pudesse ser arremessada, seu alcance aumenta em uma categoria. Após o ataque, se estiver livre, a arma volta voando para você. Pegá-la é uma reação."
  },
  {
    "id": "assassina",
    "nome": "Assassina",
    "resumo": "Aumenta ataque furtivo",
    "descricao": "A arma aumenta os dados de dano extra de um ataque furtivo para d8. Além disso, quando faz um Ataque Furtivo, você pode gastar 2 PM. Se fizer isso, pode rolar novamente quaisquer resultados 1 nesses dados de dano extra."
  },
  {
    "id": "cacadora",
    "nome": "Caçadora",
    "resumo": "Ignora camuflagem leve e total e cobertura leve",
    "descricao": "A arma persegue o alvo, anulando penalidades por camuflagem leve e total e por cobertura leve. Caso a arma seja de ataque à distância, seu alcance também aumenta em uma categoria."
  },
  {
    "id": "congelante",
    "nome": "Congelante",
    "resumo": "+1d6 de dano de frio",
    "descricao": "A arma causa +1d6 de dano de frio. Uma vez por rodada, quando ataca, você pode gastar 2 PM. Se fizer isso e acertar o ataque, a vítima fica enredada por uma rodada. Uma arma congelante é coberta por uma camada de gelo e névoa."
  },
  {
    "id": "conjuradora",
    "nome": "Conjuradora",
    "resumo": "Pode guardar e lançar magias",
    "descricao": "Um conjurador pode lançar na arma uma magia que tenha como alvo uma criatura ou que afete uma área. A magia não gera efeito na hora; em vez disso, fica guardada no item. Quando acerta um ataque com a arma, você pode descarregar a magia guardada como uma ação livre e sem pagar seu custo. Ela tem como alvo (ou como ponto de origem de sua área) a criatura ou ponto atingido pelo ataque. Uma vez que a magia seja descarregada, outra pode ser armazenada."
  },
  {
    "id": "corrosiva",
    "nome": "Corrosiva",
    "resumo": "+1d6 de dano de ácido",
    "descricao": "A arma causa +1d6 de dano de ácido. Uma vez por rodada, quando ataca, você pode gastar 2 PM. Se fizer isso e acertar o ataque, a vítima sofre 4d4 pontos de dano de ácido na próxima rodada. Uma arma corrosiva exala vapores e goteja líquido tóxico."
  },
  {
    "id": "dancarina",
    "nome": "Dançarina",
    "resumo": "Ataca sozinha",
    "descricao": "Você pode gastar uma ação de movimento e 1 PM para fazer a arma flutuar e atacar uma criatura em alcance curto a sua escolha, com as mesmas estatísticas que teria se você a estivesse empunhando. Este efeito tem duração sustentada; se parar de sustentá-lo, a arma cai no chão."
  },
  {
    "id": "defensora",
    "nome": "Defensora",
    "resumo": "Defesa +2",
    "descricao": "A arma se movimenta para aparar ataques contra você. Você recebe +2 na Defesa."
  },
  {
    "id": "destruidora",
    "nome": "Destruidora",
    "resumo": "Bônus contra construtos",
    "descricao": "Se usada contra construtos e objetos (com a manobra quebrar), a arma fornece +2 no teste de ataque e causa +2d8 de dano."
  },
  {
    "id": "dilacerante",
    "nome": "Dilacerante",
    "resumo": "+10 de dano em acertos críticos",
    "descricao": "A arma inflige ferimentos profundos. Quando faz um acerto crítico com a arma, você causa +10 pontos de dano."
  },
  {
    "id": "drenante",
    "nome": "Drenante",
    "resumo": "Crítico drena vítima",
    "descricao": "Quando você faz um acerto crítico em uma criatura viva, a criatura fica fraca e você ganha 2d10 pontos de vida temporários. Uma arma drenante emite um brilho púrpura."
  },
  {
    "id": "eletrica",
    "nome": "Elétrica",
    "resumo": "+1d6 de dano de eletricidade",
    "descricao": "A arma causa +1d6 de dano de eletricidade. Uma vez por rodada, quando ataca, você pode gastar 2 PM. Se fizer isso e acertar o ataque, um raio atinge outra criatura em alcance curto, causando 3d8 pontos de dano de eletricidade. Uma arma elétrica emite faíscas e é coberta de arcos voltaicos."
  },
  {
    "id": "energetica",
    "nome": "Energética*",
    "resumo": "Bônus em ataque",
    "descricao": "A arma tem sua parte perigosa (a lâmina de uma espada, a ponta de uma lança...) transformada em magia pura. Ela fornece +4 em testes de ataque, ignora 20 pontos de redução de dano, converte todo o dano causado para essência e emana luz como uma tocha. Pré-requisito: formidável."
  },
  {
    "id": "excruciante",
    "nome": "Excruciante",
    "resumo": "Causa fraqueza",
    "descricao": "A arma inflige dor terrível. Uma criatura viva atingida fica fraca. Se já estiver fraca, mesmo por este efeito, fica debilitada (a condição máxima que esta arma pode causar)."
  },
  {
    "id": "flamejante",
    "nome": "Flamejante",
    "resumo": "+1d6 de dano de fogo",
    "descricao": "A arma causa +1d6 de dano de fogo. Uma vez por rodada, quando ataca, você pode gastar 2 PM. Se fizer isso, em vez do ataque normal você dispara uma bola de fogo contra um alvo em alcance médio. O alvo sofre 6d6 pontos de dano. Um teste de Reflexos (CD For ou Des, à sua escolha) reduz à metade. Uma arma flamejante emana chamas como uma tocha."
  },
  {
    "id": "formidavel",
    "nome": "Formidável",
    "resumo": "Ataque e dano +2",
    "descricao": "A arma é encantada para desferir golpes precisos. Ela fornece +2 em testes de ataque e rolagens de dano."
  },
  {
    "id": "lancinante",
    "nome": "Lancinante*",
    "resumo": "Causa crítico terrível",
    "descricao": "A arma inflige ferimentos mortais. Quando faz um acerto crítico com a arma, você causa +10 pontos de dano ou, além de multiplicar os dados de dano, multiplica também quaisquer bônus numéricos, a sua escolha. Este efeito substitui o efeito de dilacerante. Pré-requisito: dilacerante."
  },
  {
    "id": "magnifica",
    "nome": "Magnífica*",
    "resumo": "Ataque e dano +4",
    "descricao": "A arma é encantada para desferir golpes perfeitos. Ela fornece +4 em testes de ataque e rolagens de dano. Pré-requisito: formidável."
  },
  {
    "id": "piedosa",
    "nome": "Piedosa",
    "resumo": "Dano não letal",
    "descricao": "A arma causa +1d8 de dano, mas todo o dano causado é não letal. Você pode gastar 1 PM para desativar e ativar este encanto."
  },
  {
    "id": "profana",
    "nome": "Profana",
    "resumo": "Bônus contra devotos do Bem",
    "descricao": "A arma causa +2d8 de dano contra devotos de deuses que canalizam apenas energia positiva e criaturas bondosas (a critério do mestre). Uma arma profana emite luz rubra pulsante."
  },
  {
    "id": "sagrada",
    "nome": "Sagrada",
    "resumo": "Bônus contra devotos do Mal",
    "descricao": "A arma causa +2d8 de dano contra devotos de deuses que canalizam apenas energia negativa e criaturas malignas (a critério do mestre). Uma arma sagrada emite uma sutil luz pura."
  },
  {
    "id": "sanguinaria",
    "nome": "Sanguinária",
    "resumo": "Causa sangramento",
    "descricao": "Uma criatura viva atingida fica sangrando. A perda de PV por sangramento causada pela arma é cumulativa - uma criatura atingida duas vezes perde 2d6 PV por sangramento por rodada."
  },
  {
    "id": "trovejante",
    "nome": "Trovejante",
    "resumo": "Causa atordoamento",
    "descricao": "A arma emite um trovão ribombante a cada golpe. Quando você faz um acerto crítico, a vítima fica atordoada por uma rodada (apenas uma vez por cena; Fort CD For ou Des, a sua escolha, evita)."
  },
  {
    "id": "tumular",
    "nome": "Tumular",
    "resumo": "+1d8 de dano de trevas",
    "descricao": "A arma causa +1d8 de dano de trevas. Uma vez por rodada, quando ataca, você pode gastar 2 PM. Se fizer isso, o bônus de dano aumenta para +2d8, mas você perde 1d8 pontos de vida. Uma arma tumular drena o calor ao redor."
  },
  {
    "id": "veloz",
    "nome": "Veloz",
    "resumo": "Fornece ataque extra",
    "descricao": "Você recebe a habilidade Ataque Extra, do guerreiro, mas só pode usá-la com esta arma. Se já a possui, em vez disso, o custo para usá-la com esta arma diminui em -1 PM."
  },
  {
    "id": "venenosa",
    "nome": "Venenosa",
    "resumo": "Causa envenenamento",
    "descricao": "Uma vez por rodada, quando ataca, você pode gastar 2 PM. Se fizer isso e acertar o ataque, a vítima fica envenenada, perdendo 1d12 pontos de vida por rodada durante 3 rodadas. Uma arma venenosa verte um líquido verde e viscoso."
  }
];
export const FORGE_ENCANTOS_ARMADURAS = [
  {
    "id": "abascanto",
    "nome": "Abascanto",
    "resumo": "Resistência contra magia",
    "descricao": "Você recebe resistência a magia +5."
  },
  {
    "id": "abencoado",
    "nome": "Abençoado",
    "resumo": "Resistência contra trevas",
    "descricao": "Você recebe redução de trevas 10 e +5 em testes de resistência contra efeitos de necromancia. Um item abençoado é decorado com gravuras de símbolos sagrados de deuses do Bem."
  },
  {
    "id": "acrobatico",
    "nome": "Acrobático",
    "resumo": "Bônus em Acrobacia",
    "descricao": "Você recebe +5 em Acrobacia e ignora a penalidade de armadura do item para testes dessa perícia."
  },
  {
    "id": "alado",
    "nome": "Alado",
    "resumo": "Deslocamento de voo 12m",
    "descricao": "Você pode gastar 2 PM para fazer asas emergirem de suas costas e receber deslocamento de voo 12m com duração sustentada."
  },
  {
    "id": "animado",
    "nome": "Animado",
    "resumo": "Escudo defende sozinho",
    "descricao": "Você pode gastar uma ação de movimento e 1 PM para fazer o escudo flutuar ao seu redor até o fim da cena. Você recebe o mesmo bônus na Defesa que receberia se estivesse empunhando o escudo, mas fica com as duas mãos livres. Você só pode ser protegido por um escudo ao mesmo tempo."
  },
  {
    "id": "assustador",
    "nome": "Assustador",
    "resumo": "Causa efeito de medo",
    "descricao": "Você pode gastar uma ação de movimento e 2 PM para gerar uma onda de medo. Inimigos em alcance curto devem passar num teste de Vontade (CD Car) ou ficarão abalados até o fim da cena. Um item assustador possui manchas de sangue, ossos pendurados e outras decorações horripilantes."
  },
  {
    "id": "caustica",
    "nome": "Cáustica",
    "resumo": "Resistência contra ácido",
    "descricao": "Você recebe redução de ácido 10 e pode gastar uma ação de movimento e 2 PM para fazer o item gotejar ácido. Se fizer isso, seus ataques causam +1d4 de dano de ácido até o fim da cena."
  },
  {
    "id": "defensor",
    "nome": "Defensor",
    "resumo": "Defesa +2",
    "descricao": "O item é encantado para desviar golpes. O bônus na Defesa do item aumenta em +2."
  },
  {
    "id": "escorregadio",
    "nome": "Escorregadio",
    "resumo": "Bônus para escapar",
    "descricao": "Você recebe +10 em testes de Acrobacia para escapar e em testes de manobra contra agarrar. Um item escorregadio parece estar sempre coberto de óleo levemente gorduroso."
  },
  {
    "id": "esmagador",
    "nome": "Esmagador",
    "resumo": "Escudo causa mais dano",
    "descricao": "Este escudo fornece +2 em ataques e dano e tem seu dano aumentado em um passo."
  },
  {
    "id": "fantasmagorico",
    "nome": "Fantasmagórico",
    "resumo": "Lança Manto de Sombras",
    "descricao": "Você pode lançar a magia Manto de Sombras. Um item fantasmagórico é cinzento e esfumaçado."
  },
  {
    "id": "fortificado",
    "nome": "Fortificado",
    "resumo": "Chance de ignorar crítico",
    "descricao": "Você recebe 25% de chance (para escudos) e 50% de chance (para armaduras) de ignorar o dano extra de acertos críticos e ataques furtivos."
  },
  {
    "id": "gelido",
    "nome": "Gélido",
    "resumo": "Resistência contra frio",
    "descricao": "Você recebe redução de frio 10 e pode gastar uma ação de movimento e 2 PM para se cobrir de gelo até o fim da cena. Se fizer isso, recebe 10 PV temporários. Um item gélido é azulado e frio ao toque."
  },
  {
    "id": "guardiao",
    "nome": "Guardião",
    "resumo": "Defesa +4",
    "descricao": "O item emite um campo de força que desvia ataques. O bônus na Defesa do item aumenta em +4. Pré-requisito: defensor."
  },
  {
    "id": "hipnotico",
    "nome": "Hipnótico",
    "resumo": "Fascina inimigos",
    "descricao": "Você pode gastar uma ação padrão e 3 PM para emitir luzes coloridas. Inimigos em alcance curto devem passar num teste de Vontade (CD Car) ou ficarão fascinados por 1d6 rodadas. O efeito termina se qualquer criatura afetada for atacada. Um item hipnótico é espalhafatoso e colorido."
  },
  {
    "id": "ilusorio",
    "nome": "Ilusório",
    "resumo": "Camufla-se como item comum",
    "descricao": "Você pode gastar uma ação de movimento e 1 PM para fazer o item adquirir a aparência de uma roupa comum, mas mantendo suas propriedades (bônus na Defesa, penalidade de armadura...). A magia Visão da Verdade revela o item disfarçado."
  },
  {
    "id": "incandescente",
    "nome": "Incandescente",
    "resumo": "Resistência contra fogo",
    "descricao": "Você recebe redução de fogo 10 e pode gastar uma ação de movimento e 2 PM para fazer o item emitir labaredas até o fim da cena. Se fizer isso, no início de cada um de seus turnos você causa 1d6 pontos de dano de fogo em todas as criaturas adjacentes. Um item incandescente é avermelhado e quente ao toque."
  },
  {
    "id": "invulneravel",
    "nome": "Invulnerável",
    "resumo": "Redução de dano",
    "descricao": "Você recebe redução de dano 2 (para escudos) ou 5 (para armaduras)."
  },
  {
    "id": "opaco",
    "nome": "Opaco",
    "resumo": "Redução de energia",
    "descricao": "Você recebe redução de ácido, eletricidade, fogo e frio 10. Um item opaco parece sem cor, totalmente comum e desinteressante."
  },
  {
    "id": "protetor",
    "nome": "Protetor",
    "resumo": "Resistência +2",
    "descricao": "Você recebe +2 em testes de resistência."
  },
  {
    "id": "refletor",
    "nome": "Refletor",
    "resumo": "Reflete magia",
    "descricao": "Uma vez por rodada, quando você é alvo de uma magia, pode gastar PM igual ao custo dela para refleti-la de volta ao conjurador. As características da magia (efeitos, CD...) se mantêm, mas você toma qualquer decisão exigida por ela. Um item refletor parece espelhado."
  },
  {
    "id": "relampejante",
    "nome": "Relampejante",
    "resumo": "Resistência contra eletricidade",
    "descricao": "Você recebe redução de eletricidade 10 e pode gastar uma ação de movimento e 2 PM para gerar arcos voltaicos até o fim da cena. Se fizer isso, qualquer criatura que o ataque em corpo a corpo sofre 2d6 pontos de dano de eletricidade. Um item relampejante é decorado com ouro, prata e cobre."
  },
  {
    "id": "reluzente",
    "nome": "Reluzente",
    "resumo": "Causa efeito de cegueira",
    "descricao": "Você pode gastar uma ação de movimento e 2 PM para emitir um clarão de luz. Todos os inimigos em alcance curto devem passar num teste de Reflexos (CD Car) ou ficarão cegos por uma rodada. Um item reluzente é polido e brilhante."
  },
  {
    "id": "sombrio",
    "nome": "Sombrio",
    "resumo": "Bônus em Furtividade",
    "descricao": "Você recebe +5 em Furtividade e ignora a penalidade de armadura do item para testes dessa perícia. Um item sombrio é escuro, fosco e bem lubrificado, para não fazer barulho."
  },
  {
    "id": "zeloso",
    "nome": "Zeloso",
    "resumo": "Atrai ataques em aliados",
    "descricao": "Uma vez por rodada, se um aliado adjacente for alvo de um ataque, você pode gastar 1 PM para se tornar o alvo do ataque, que então é resolvido normalmente."
  }
];
