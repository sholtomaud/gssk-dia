# gssk-dia

A browser diagram editor for **GSSK** models — energy-systems diagrams in the
visual language of [Howard T. Odum](https://en.wikipedia.org/wiki/Howard_T._Odum),
drawn on a canvas and then simulated.

Live: **https://energese-project.github.io/gssk-dia/**

Draw a system as sources, storages, producers, consumers and the flows between
them; the diagram *is* the model. Press run and a WebAssembly kernel integrates
it, streaming node states back onto the diagram and into a time-series chart.

## What's in the box

| Path | Role |
|---|---|
| [`src/gssk-editor.js`](src/gssk-editor.js) | `<gssk-editor>`, a shadow-DOM web component — palette, canvas, node/edge editing, property panel |
| [`src/symbols.js`](src/symbols.js) | The Odum symbol vocabulary as SVG geometry, translated from `tikz-odum.sty` |
| [`src/validator.js`](src/validator.js) | JSON Schema (Ajv) for the model document |
| [`src/styles.css`](src/styles.css) | Editor styles, injected into the shadow root |
| [`index.html`](index.html) | The application shell — simulation controls, charting, settings, article generation — as one large inline module |
| [`tests/`](tests/) | Playwright specs |

Simulation is **not** JavaScript. The `gssk` dependency is a WASM kernel pulled
from `github:sholtomaud/GSSK#dist`; this repository owns the diagram, the model
JSON and the wiring between them. Integration behaviour belongs upstream.

## Running it

Every npm command runs inside the [Apple `container`](Containerfile) image, so
the host needs only the `container` CLI — no local Node.

```sh
container system start   # or: make start — once per macOS session

make dev                 # Vite dev server on :5173
make build               # production bundle into dist/
make preview             # serve dist/ on :4173
make test                # Playwright, CI mode, against the preview server
```

`make test` runs with `CI=true`, which points Playwright at the **preview**
server rather than the dev server — a bug that only appears in a real build is
invisible otherwise.

Vite is not optional. [`index.html`](index.html) imports bare specifiers
(`gssk`, `zod`, `jspdf`, `@google/genai`) and `?url` / `?inline` asset queries
that no browser resolves unaided. Opening `index.html` from the filesystem, or
serving the repository root, shows you a broken page that tells you nothing.

## The model

A model is one JSON document with `nodes`, `edges`, `config`, and optional
`boundaries`.

```json
{
  "config": { "dt": 0.1, "t_start": 0, "t_end": 100, "method": "euler" },
  "nodes": [
    { "id": "sun",  "type": "source",  "value": 100,
      "visual": { "x": 100, "y": 200, "label": "Sunlight" } },
    { "id": "tree", "type": "storage", "value": 10,
      "visual": { "x": 300, "y": 200, "label": "Biomass", "capacity": 500 } }
  ],
  "edges": [
    { "id": "e1", "origin": "sun", "target": "tree",
      "logic": "linear", "params": { "k": 0.1 } }
  ],
  "boundaries": [
    { "id": "b1", "x": 50, "y": 100, "w": 400, "h": 250, "label": "Forest" }
  ]
}
```

### Node types

Twelve symbols, after Odum (1983):

| | | |
|---|---|---|
| `source` | `storage` | `sink` |
| `constant` | `producer` | `consumer` |
| `interaction` | `transaction` | `switch` |
| `receiver` | `amplifier` | `box` |

The kernel understands only four primitives, so `KERNEL_TYPE_MAP` in
[`index.html`](index.html) folds the visual types onto `storage`, `source`,
`sink` and `constant` before serialising. `STATE_TYPES` names the types that
actually hold state and therefore get charted.

**Boundaries are not nodes.** A boundary is a diagram region — a labelled dashed
enclosure — held in a separate `boundaries[]` array, drawn beneath the nodes and
never sent to the kernel. Dropping the Boundary tool from the palette adds to
that array, not to `nodes[]`.

## Deployment

CI ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) builds,
tests, and uploads `dist/` as a Pages artefact on every push to `main`.

Whether that artefact is what visitors receive is a **repository setting**, not
something the workflow can assert:

```sh
gh api repos/sholtomaud/gssk-dia/pages
```

`"build_type": "workflow"` means the artefact is live. `"build_type": "legacy"`
means GitHub is publishing the raw repository root — untransformed `index.html`,
bare specifiers and all — and every green CI run is reporting on a bundle nobody
is served. That has happened once (issue #52). A green pipeline is not evidence
the site works.

The app is served from the `/gssk-dia/` subpath, so **no asset URL may begin with
`/`**. [`vite.config.js`](vite.config.js) sets `base: './'`; relative URLs
survive any deploy prefix, while a root-absolute one silently resolves against
the domain root. [`tests/pages_subpath.spec.js`](tests/pages_subpath.spec.js)
serves the build under a non-root prefix and fails if one reappears.

## Dependencies

Dependabot owns dependency updates end to end. Patch, minor and transitive
bumps auto-merge once `build-and-test` is green
([`.github/workflows/dependabot-auto-merge.yml`](.github/workflows/dependabot-auto-merge.yml));
major upgrades wait for review. Security advisories are grouped into a single
PR rather than one per package.

That gate depends on `build-and-test` being a **required** status check —
[`.github/RULESET.md`](.github/RULESET.md) explains why, and
[`.github/ruleset-main.json`](.github/ruleset-main.json) is the ruleset to
restore it from.

Note that an empty PR queue is not the same fact as an empty advisory list:

```sh
gh api "repos/sholtomaud/gssk-dia/dependabot/alerts?state=open" -q length
```

## Contributing

Work happens in a git worktree on a branch, and lands through a pull request —
never a direct commit to `main`, which the branch ruleset now enforces.
`make build` and `make test` must both pass in the worktree before you push, and
a pushed branch with no PR has been tested by nothing.

[CLAUDE.md](CLAUDE.md) is the full working agreement, including the crux task
board and the worktree lifecycle. It is the canonical standard for this
repository.

## Reference

- [CLAUDE.md](CLAUDE.md) — working agreement, git workflow, project management
- [GSSK_UI_SPECIFICATION.md](GSSK_UI_SPECIFICATION.md) — intended UI behaviour
- [ADVANCED_FEATURES_ROADMAP.md](ADVANCED_FEATURES_ROADMAP.md) — planned work
