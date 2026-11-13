# Changelog

Todas as alterações notáveis deste módulo serão documentadas neste arquivo.

## [0.4.1] — 2026-11-13

### Adicionado
- **HUD de Ações Rápidas (`TokenQuickActionsT20`)**:
  - **Magias agrupadas por círculo** (1º ao 5º círculo) em grade alinhada de 2 colunas com contagem por círculo.
  - **Seções minimizáveis**: cabeçalhos de **Ataques**, **Magias** e **Habilidades** agora recolhem e expandem com persistência no `localStorage`, assim como **Perícias**.
  - Filtro de ativação (*Todos* / *Livre/Reação*) e painel recolhível dedicado para **Habilidades Passivas** e **Favoritos**.

### Corrigido
- **Ficha Moderna (`CharacterSheetT20`)**:
  - Corrigido layout dos **Espaços de Progressão (Poderes)** para evitar sobreposição do botão *Escolher Poder* e melhorar o espaçamento interno.
  - Removido painel redundante na aba **Combate** para que a tabela de *Armas & Ataques* ocupe toda a largura.
  - Adicionado espaçamento entre itens nas listas de **Poderes**, **Habilidades de Classe**, **Magias** e **Inventário** (incluindo barra de moedas e carga), além de espaçamento no ícone de **Defesa**.

## [0.4.0] — 2026-11-12

### Adicionado
- **Assistente de Criação de Personagem em 8 Passos (`CharacterWizardT20`)**:
  - Fluxo guiado passo a passo para personagens de **1º nível** com validação estrita das regras de *Tormenta20 (JdA)*, barra de resumo lateral ao vivo (PV, PM, Defesa, Atributos, Perícias e Saldo T$) e criação atômica da ficha sem popups extras.
  - **Passo 1 — Identidade:** nome, conceito/história e seletor de retrato.
  - **Passo 2 — Atributos:** suporte a **Compra por Pontos (10 pts)**, **Rolagem `4d6` (descarta menor)** e **Entrada Manual**.
  - **Passo 3 — Raça:** atributos dinâmicos (ex.: Humano/Osteon/Sereia), habilidades concedidas e escolhas especiais como *Versátil* e *Memória Póstuma*.
  - **Passo 4 — Origem:** seleção dos 2 benefícios (perícias/poderes) e escolha individual de itens gratuitos iniciais (permitindo selecionar apenas a opção desejada em origens com *"ou"*).
  - **Passo 5 — Classe:** perícias fixas, opções *"ou"*, escolha livre, bônus por Inteligência e seleção do Caminho do Arcanista (*Bruxo*, *Mago* ou *Feiticeiro*).
  - **Passo 6 — Divindade:** regra estrita para classes devotas (*Clérigo*, *Druida*, *Paladino*), validação de compatibilidade e poderes concedidos.
  - **Passo 7 — Poderes & Magias:** poderes extras livres com avaliação de pré-requisitos em tempo real e cota inicial de magias de 1º círculo com filtro por escola.
  - **Passo 8 — Equipamento & Revisão:** escolha entre **Dinheiro Inicial (`4d6` T$)**, **Kit Sugerido da Classe** ou **Compra Rápida com Tibares**, sempre exibindo os itens gratuitos da Origem.
  - Pontos de entrada no **Diretório de Atores** (*"Assistente de Criação (Nível 1)"*) e no banner de fichas recém-criadas.
- **Condições & Efeitos integrados ao Painel de PV/PM (`TokenVitalsHudT20`)**:
  - Unificação do painel de condições rápidas diretamente no HUD de PV/PM, com filtro em tempo real, suporte a múltiplos tokens selecionados e ícones em alto contraste.
  - **Modal de Detalhes de Condição em Texto Humano (Tema Pergaminho de Arton)**: ao clicar em uma condição ativa, exibe a regra completa de jogo em PT-BR e traduz os modificadores técnicos da ficha (atributos, perícias, deslocamento, Defesa, ataques, dano e PM) para leitura amigável, com botões rápidos para remover ou abrir edição avançada.

### Corrigido
- **Deduplicação de magias:** eliminada a duplicata entre *Seta Infalível* (sistema base) e *Seta Infalível de Talude* (compêndio enriquecido) no indexador.
- **UI & Scroll do Assistente:** corrigido alinhamento/altura das listas de Raças, Origens, Classes e Divindades no Foundry v14, preservação de scroll ao selecionar perícias por Inteligência, largura fixa dos botões de ação e destaque visual em *Versátil*/*Memória Póstuma*.

## [0.3.1] — 2026-11-11

### Corrigido
- **Contraste e leitura em clientes no Modo Escuro do Foundry v14**:
  - Proteção de escopo de variáveis CSS (`--color-text-*`, `--content-link-*`, `--input-*`) e cabeçalhos (`h1`–`h6`) para impedir que o tema escuro global deixe títulos, links `@UUID`, tabelas e rótulos brancos sobre o pergaminho claro no **Navegador de Compêndios**, diálogos e fichas.
  - Refatoração visual do seletor de **Atributos Dinâmicos** (ex.: Humano/Osteon) com botões e rótulos em alto contraste sobre fundo Pergaminho Claro.
  - Garantida cor de texto escura explícita em controles de Defesa e edição de atributos na ficha moderna.

## [0.3.0] — 2026-11-11

### Adicionado
- **11 compêndios integrados** organizados na pasta **Tormenta20 Completo** (*Criação de Personagem*, *Magias & Equipamentos*, *Bestiário & Guias*): Classes, Raças, Poderes & Habilidades, Magias, Equipamentos & Serviços, Itens Mágicos, Parceiros & Montarias, Ameaças, Divindades, Origens e Guias & Regras.
- **Ficha Moderna de Personagem (Tema Pergaminho de Arton)**: barra lateral persistente com PV/PM, Defesa, Salvaguardas & Sentidos, Atributos e grade de slots **Raça / Origem / Classe / Divindade** + abas dedicadas (`Personagem`, `Combate`, `Perícias`, `Poderes`, `Magias`, `Inventário`, `Efeitos`, `Diário`).
- **Automação de Criação & Subida de Nível (Raça / Origem / Classe / Divindade + Espaços de Progressão)**:
  - Seleção automática e modal interativa de Perícias de Classe e Perícias de Origem/Inteligência.
  - Painel de progressão por nível com slots de Poderes de Classe e cota de Magias por círculo (`Conjurador`).
  - Limpeza segura de itens derivados em casos de downgrade de nível.
- **Navegador de Compêndios — Arton (`CompendiumBrowserT20`)**: busca em tempo real, filtros por fonte/tipo/subtipo/círculo/custo/alcance, pré-visualização completa e adição direta para a ficha alvo.
- **Tema Pergaminho de Arton Unificado (`t20-arton-theme.css` + `arton-ui-theme.js`)**:
  - Identidade visual consistente em Pergaminho Claro (`#F4ECE0` / `#EDE3D2`), Carmesim Real (`#7A1818`), Dourado Envelhecido (`#C59B38`) e Azul Arcano (`#1D4E89`).
  - Estilização das modais `AbilityUseDialog`, cards de chat, barra de envio de mensagens e janelas do sistema `tormenta20`.
- **Rolagens Estruturadas & Transparência no Chat (`roll-metadata.js` + `chat-enhancer.js`)**:
  - Badges de características (*traits*) e pílulas de detalhamento de modificadores totalmente localizadas em PT-BR para Ataques, Dano, Perícias, Atributos e Magias/Poderes.
  - Filtro por patamar/nível para opções como **Especialista** na modal de uso de habilidade.
  - Bloqueio/aviso de PM insuficiente e desconto automático de PM com botão de desfazer.
- **HUDs Flutuantes e Visão Automática v14**:
  - **HUD de Ações Rápidas**: acesso de 1 clique a Ataques, Salvaguardas, Magias, Habilidades e Perícias do token selecionado.
  - **HUD de Vitais**: ajuste rápido de PV/PM, PV Temporário, Dano com/sem RD e Cura.
  - **Visão Automática de Token (v14)**: sincronização automática de `Visão no Escuro`, `Visão na Penumbra`, `Percepção às Cegas`, `Visão nas Trevas`, `Visão Mística`, `Ver o Invisível` e `Visão da Verdade`.
- **Ferramentas de Mesa (Tier 1–3)**:
  - Painel flutuante de Efeitos Ativos e Condições Rápidas (`EffectsPanelT20`).
  - Solicitação interativa de Testes em Chat para o Mestre (`openCheckPromptDialog`).
  - Ficha de Grupo (`PartySheetT20`) com matriz de perícias, PV/PM e riquezas.
  - Forja de Armas/Armaduras/Esotéricos (`ForgeModalT20`) com materiais especiais, melhorias e encantos.
  - Gerador de Tesouro & Mercador com suporte a compras via socket (`LootMerchantAppT20`).
  - Escalonador rápido de Ameaças (`Fraco`, `Padrão`, `Elite`, `Chefe`) e alertas de condições no Rastreador de Combate (`combat-enhancer.js`).

