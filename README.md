# Relationship Graph

**English** · [Русский](README.ru.md)

A [Foundry VTT](https://foundryvtt.com/) 13 module: a graph of relationships between the characters
of your campaign — who is whose friend, enemy or employer, which faction they belong to, and what
the players know about them.

The interface is available in English and Russian; each player sees it in the language chosen in
their Foundry settings.

## Features

- **Nodes** of three kinds: linked to an actor (name and image come from the actor), without an
  actor, and "image only". The name and role are shown under the node.
- **Node size** — for one node or a group of selected nodes, keeping proportions. Nodes never
  overlap: after dragging or resizing, neighbours move apart.
- **Factions** — background areas in the faction's colour. A node can belong to several factions:
  the primary one is shown as an area, the others as small diamonds on the node.
- **Conditions** (deceased, captured, missing, quest giver, and your own) — icons on the node.
- **Relationships** with a label, direction and type; the type sets the line colour and style.
- **Hidden from players**: a node marked "Hidden from players" is shown to players as "unknown",
  a "GM-only editing" node is visible to players but they can't change it, and a "GM-only"
  relationship is not shown to players at all.
- **Collaboration**: the graph opens in view mode, one person edits at a time, and their changes
  appear for everyone immediately.
- **Undo and redo** — up to 30 steps (`Ctrl` + `Z` / `Ctrl` + `Y`).
- **Import from FANG**, plus lossless export/import in the module's own format.
- **Two interface languages.** Everything the module itself displays (panels, menus, built-in
  conditions and relationship types, default names) follows each client's language; everything
  you type stays exactly as you typed it.

## Installation

In Foundry: **Add-on Modules → Install Module**, paste into **Manifest URL**:

```
https://github.com/JanStin/fvtt-relationship-graph/releases/latest/download/module.json
```

Then enable the module in your world (**Manage Modules**).

## Quick start

1. Open the **Actors** tab in the sidebar — a **Relationship Graph** button appears at the bottom.
2. Click **Edit** on the top bar of the graph window.
3. Right-click an empty spot → **Add node**. To link nodes, right-click a node →
   **Create relationship**, then click the second node (or `S` + click).
4. Factions, relationship types and conditions are managed with the buttons on the top bar.

Full mouse and keyboard reference: [docs/controls.md](docs/controls.md) (in Russian).

## Player permissions

With regular nodes and relationships, players can do everything the GM can — move, resize,
create, edit and delete — while they are in edit mode. GM only:

- "GM-only editing" and "Hidden from players" nodes;
- GM notes, visibility flags, linking a node to an actor;
- creating and deleting factions, relationship types and conditions (players can edit a faction's
  description);
- import and export.

To let players save their edits, the journal holding the graph data ("Relationship Graph Data") is
opened to them for writing — the module does this automatically when the GM opens the graph.

## Migrating from FANG

Export your graph from FANG to a JSON file and click **Import graph** on the top bar (GM only, in
edit mode). Nodes, relationships, factions, relationship types, conditions and positions are
transferred; zones are not, and faction-to-faction links are replaced by background areas. Import
replaces the current graph entirely and can be undone with `Ctrl` + `Z`.

Format details (in Russian): [FANG](docs/fang-json-format.md), [own format](docs/graph-json-format.md).

## Known limitations

- **Hidden data is not protected from reading.** The graph is stored in a journal that players can
  write to. Hidden nodes, GM notes and GM-only relationships are hidden only when rendering — a
  player can read the full graph from the browser console. Player permissions and the edit lock
  are likewise enforced only by the module's interface. Don't keep anything in the graph that
  players must never see.
- One graph per world.

## Development

Requires Node.js 20+.

```bash
npm install          # installs dependencies and the Cytoscape patch (patches/)
npm run build        # build into scripts/
npm run dev          # build in watch mode
npm run test         # unit tests (Vitest)
npm run typecheck    # type checking
npm run i18n:check   # no UI strings left in code, lang/*.json match ru.json
```

For local testing, link the project folder into Foundry:
`Data/modules/fvtt-relationship-graph` → the repository folder (after `npm run build`).

**Localization.** UI strings live in `lang/ru.json` and `lang/en.json`; code uses
`t("RELGRAPH.…")`, and `tn()` for counts (`src/core/i18n.ts`). To add a language, create
`lang/<code>.json` with the same keys and add it to `languages` in `module.json`;
`npm run i18n:check` lists missing keys. `npm run i18n:extract` prints any Russian strings still
left in the code.

**Cytoscape patch.** Foundry freezes `Array.prototype.equals`, which makes Cytoscape crash on load.
`patches/cytoscape+3.34.3.patch` (applied by `patch-package` on `npm install`) fixes this; see
[docs/architecture.md](docs/architecture.md), risk R7.

Architecture — [docs/architecture.md](docs/architecture.md), plans — [docs/tasks.md](docs/tasks.md),
changelog — [CHANGELOG.md](CHANGELOG.md) (all in Russian).

**Release.** A `vX.Y.Z` tag triggers GitHub Actions: checks, build, and a GitHub Release with
`module.zip` and `module.json` carrying the tag's version.

## Credits and license

The idea and the import format come from
[FANG (Foundry Actor Nexus Graph)](https://github.com/Niclasp1501/Foundry-Actor-Nexus-Graph--FANG-).
Relationship Graph is written from scratch and contains no FANG code or assets; only importing its
export files is supported.

License — [MIT](LICENSE). Third-party libraries — [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
