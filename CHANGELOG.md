# Changelog

Todas as alterações notáveis deste módulo serão documentadas neste arquivo.

## [0.3.0] — 2026-11-11

### Adicionado
- **11 compêndios integrados** organizados na pasta **Tormenta20 Completo** (*Criação de Personagem*, *Magias & Equipamentos*, *Bestiário & Guias*): Classes, Raças, Poderes & Habilidades, Magias, Equipamentos & Serviços, Itens Mágicos, Parceiros & Montarias, Ameaças, Divindades, Origens e Guias & Regras.
- **Ficha de Personagem Estilo PF2e (`CharacterSheetPF2eT20`)**: barra lateral persistente com PV/PM, Defesa, Salvaguardas & Sentidos, Atributos e grade de slots **Raça / Origem / Classe / Divindade** + abas dedicadas (`Personagem`, `Combate`, `Perícias`, `Poderes`, `Magias`, `Inventário`, `Efeitos`, `Diário`).
- **Automação de Criação & Subida de Nível (`ABC+D` + Espaços de Progressão)**:
  - Seleção automática e modal interativa de Perícias de Classe e Perícias de Origem/Inteligência.
  - Painel de progressão por nível com slots de Poderes de Classe e cota de Magias por círculo (`Conjurador`).
  - Limpeza segura de itens derivados em casos de downgrade de nível.
- **Navegador de Compêndios — Arton (`CompendiumBrowserT20`)**: busca em tempo real, filtros por fonte/tipo/subtipo/círculo/custo/alcance, pré-visualização completa e adição direta para a ficha alvo.
- **Tema Pergaminho de Arton Unificado (`t20-arton-theme.css` + `arton-ui-theme.js`)**:
  - Identidade visual consistente em Pergaminho Claro (`#F4ECE0` / `#EDE3D2`), Carmesim Real (`#7A1818`), Dourado Envelhecido (`#C59B38`) e Azul Arcano (`#1D4E89`).
  - Estilização das modais `AbilityUseDialog`, cards de chat, barra de envio de mensagens e janelas do sistema `tormenta20`.
- **Rolagens Estilo PF2e & Transparência no Chat (`roll-metadata.js` + `chat-enhancer.js`)**:
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
