---
version: 1.0.0
name: Arton Parchment Ledger (PF2e-Inspired T20)
description: Visual identity for the Tormenta20 modern tabbed character sheet and compendium browser in warm parchment light mode.
colors:
  canvas-parchment: "#f4efe6"
  surface-card: "#fbf8f2"
  surface-sidebar: "#e7decb"
  surface-inset: "#eee6d6"
  surface-hover: "#f1e8d7"
  border-warm: "#c9b99d"
  border-strong: "#9d8561"
  ink-primary: "#1f1916"
  ink-secondary: "#594c42"
  ink-muted: "#7c6d60"
  brand-crimson: "#7a1c1c"
  brand-crimson-hover: "#942525"
  brand-crimson-soft: "#f6e7e5"
  accent-gold: "#b8860b"
  accent-gold-soft: "#f8efd4"
  hp-fill: "#9e2424"
  hp-track: "#dfcdcb"
  mp-fill: "#1f5b8f"
  mp-track: "#ccdbe8"
  success: "#26683a"
typography:
  display:
    fontFamily: "Modesto Condensed, Palatino Linotype, Book Antiqua, Georgia, serif"
    fontWeight: 700
    letterSpacing: "0.02em"
  body:
    fontFamily: "Signika, system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  mono-stat:
    fontFamily: "Signika, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 700
rounded:
  xs: 3px
  sm: 5px
  md: 8px
  lg: 10px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
components:
  sidebar:
    backgroundColor: "{colors.surface-sidebar}"
    borderColor: "{colors.border-warm}"
    padding: 12px
  card:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.border-warm}"
    rounded: "{rounded.md}"
    padding: 10px
  abc-slot:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.brand-crimson}"
    rounded: "{rounded.sm}"
---

# Arton Parchment Ledger — Design System

## Overview
A light parchment RPG ledger combining Pathfinder 2e's structural clarity (persistent vital sidebar, clickable ABC+D identity slots, single-purpose tabs, integrated Compendium Browser) with Tormenta20's Arton identity: crimson wax (`#7a1c1c`), burnished gold (`#b8860b`), and warm archival paper (`#f4efe6`).

## Colors
- **Primary Canvas (`#f4efe6`) & Elevated Cards (`#fbf8f2`)**: High readability for multi-hour Foundry sessions with comfortable contrast (`#1f1916` ink).
- **Sidebar (`#e7decb`)**: Slightly denser tone anchors PV/PM, Defesa, Salvaguardas, and 6 Atributos visually on the left.
- **Vitals**: Crimson (`#9e2424`) for PV, cobalt slate (`#1f5b8f`) for PM. No purple accents anywhere.

## Layout
- **Sheet Grid**: `240px` fixed left sidebar + `1fr` fluid right column (`header` + horizontal `nav.sheet-tabs` + scrollable `.sheet-body`).
- **Compendium Browser**: 3-pane layout (`220px` filters | `minmax(260px, 1fr)` results list | `minmax(290px, 1.15fr)` rich preview + action bar).

## Do's and Don'ts
- **Do**: Keep action buttons high-contrast, show draggable handles on browser entries, preserve native T20 `.rollable`, `.item-image`, and `data-item-id` hooks.
- **Don't**: Hide core PV/PM/Defesa behind tabs, use flat gray text inputs for Raça/Origem/Divindade, or add decorative animation clutter.

