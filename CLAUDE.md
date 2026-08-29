# CLAUDE.md

Working agreement for agents in `gssk-dia`. This file is the canonical standard for
the repository — if a rule changes, change it here rather than restating it in a
second file, because two copies of a standard drift apart and then neither can be
trusted.

## What this is

A browser diagram editor for GSSK (Odum energy-systems) models. `<gssk-editor>` is a
shadow-DOM web component in [src/gssk-editor.js](src/gssk-editor.js); the symbol
vocabulary lives in [src/symbols.js](src/symbols.js) and schema validation in
[src/validator.js](src/validator.js). [index.html](index.html) is the host page and
carries the whole application shell — simulation controls, charting, settings, the
Gemini article generator — as one large inline module.

Simulation is **not** JavaScript: the `gssk` dependency is a WASM kernel pulled from
`github:sholtomaud/GSSK#dist`. Bugs in integration behaviour usually belong upstream
in GSSK, not here. This repo owns the diagram, the model JSON, and the wiring.

Vite is the only reason the app resolves at all — [index.html](index.html) imports
bare specifiers (`gssk`, `zod`, `jspdf`, `@google/genai`) and `?url` / `?inline`
asset queries that no browser understands unaided. **Never open `index.html` from
the filesystem or serve the repo root and conclude anything from it.** Only the
built `dist/` runs.

## Verify in the container, not on the host

Every npm command runs inside the Apple `container` image described by
[Containerfile](Containerfile). The host needs only the `container` CLI.

```
make dev        # Vite dev server on :5173
make build      # production bundle into dist/
make preview    # serve dist/ on :4173
make test       # Playwright, CI mode, against the preview server
```

`container system start` (or `make start`) is needed once per macOS session. Use
`container`, never `docker` — `docker-compose` is fine for infrastructure services,
but the build and test path here is Apple's CLI.

`make test` runs with `CI=true`, which points Playwright at the **preview** server
(`dist/` on :4173) rather than the dev server. That distinction matters: a bug that
only appears in a real build is invisible to `npx playwright test` run bare.

## Deployment is a separate fact from the build

CI ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) builds, tests, and
uploads `dist/` as a Pages artefact. Whether that artefact is what visitors actually
get is a **repository setting**, not something the workflow can assert. Check it:

```sh
gh api repos/sholtomaud/gssk-dia/pages
```

`"build_type": "workflow"` means the artefact is live. `"build_type": "legacy"` with
`source.branch = main, path = /` means GitHub is publishing the raw repo root —
untransformed `index.html`, bare specifiers and all — and every green CI run is
telling you about a bundle nobody is being served. This has already happened once;
see issue #52. A green pipeline is not evidence the site works.

The app is served from the `/gssk-dia/` subpath, so **no asset URL may start with
`/`**. [vite.config.js](vite.config.js) sets `base: './'` and relative URLs survive
any deploy prefix; a root-absolute one silently resolves against the domain root.

## Git workflow: always a worktree, never bare `main`

**Never commit to `main` directly, and never work in the primary checkout.** Each
task gets its own worktree and branch, and lands through a pull request.

```sh
crux task worktree <slug>          # creates ../gssk-dia-<slug> on branch feat/<slug>
cd ../gssk-dia-<slug>
# ... red -> green -> refactor, in here ...
make build && make test
git push -u origin feat/<slug>
gh pr create --fill
```

Why a worktree rather than `git checkout -b`: the container mounts the checkout
directory, and each worktree gets its own `node_modules/` and `dist/`. Switching
branches inside one checkout invalidates that state, and a long Playwright run in
one branch will happily test a `dist/` built from another. Separate directories keep
concurrent tasks genuinely independent.

If work is already sitting uncommitted in the primary checkout, move it rather than
committing it where it is — `git stash` is shared across worktrees:

```sh
git stash push -u -m "<slug>"      # in the primary checkout
crux task worktree <slug>
git -C ../gssk-dia-<slug> stash pop
```

Work that is not a crux task — a workflow fix, a docs correction — uses
`git worktree add` directly with a `chore/` branch, so the crux board keeps tracking
deliverables rather than incidental edits:

```sh
git worktree add -b chore/<what> ../gssk-dia-<what> main
```

### Cleaning up after a merge

**Merging is not the end of the task; the worktree outlives the PR and has to be
removed deliberately.** A stale worktree keeps a branch checked out and holds its own
`dist/`, which the next test run will quietly serve. Once the PR is merged:

```sh
# From the primary checkout, which is always on main because nothing is worked on there.
git fetch origin --prune
git pull --ff-only origin main                         # so origin/main below includes the merge

git -C <worktree> status --short                       # must be empty
git -C <worktree> log --oneline origin/main..<branch>  # must be empty

git worktree remove ../gssk-dia-<slug>
git worktree prune
git branch -d <branch>                                 # refuses if unmerged, which is the point
git push origin --delete <branch>                      # GitHub does not always do this on merge
```

Run the two checks first and read them: `git worktree remove` refuses a dirty
worktree, but a branch whose commits never reached `origin/main` is exactly the case
worth catching before anything is deleted. Use `git branch -d`, never `-D` — the
refusal *is* the safety check, so a `-D` that "just works" means something was about
to be lost.

**`git branch -d` compares against local `main`, not `origin/main`.** That is why the
`git pull --ff-only` comes first: skip it and `-d` refuses a perfectly merged branch.
Pull, then retry, before concluding anything is wrong. The other non-obvious refusal
is a branch that was rebased before merging: its SHAs differ from what landed, so it
is not an ancestor of `main` even though its patch is. `git cherry origin/main <branch>`
distinguishes them — `-` means already applied upstream, `+` means genuinely unique.
Only `+` is a reason to stop.

`git worktree list` should show only the primary checkout when no task is in flight.

## The three that get broken most

1. **Push *and* open a PR.** CI runs on `pull_request`. A pushed branch with no PR
   has been tested by nothing. Do not stop at the push.
2. **Do not merge your own PR.** Hand over a green PR and let the maintainer decide.
3. **A task is done when it is merged**, not when it is written — and for anything
   user-facing, not until the deployed page is checked. Status rows and shipped code
   are separate facts.

## Project management: crux

This repo is tracked in crux (project `gssk-dia`, scoped by
[.crux/project.json](.crux/project.json)). One global binary at `~/bin/crux` and one
shared SQLite database at `~/.crux/crux.db` spanning several projects — there is no
project-local executable.

Check `crux status` before starting work: it lists the next unblocked tasks and
anything blocked. `crux ready` is a different thing despite the name — it is release
go/no-go, not a queue. Claim a task with `crux task start <slug>`.

### Go through crux, never through its database

**Never read or write `~/.crux/crux.db` directly** — no `sqlite3`, no Python
`sqlite3`, no SQL of any kind, not even a `SELECT` to "just check something". Use one
of the two supported entry points:

- **The `mcp__crux__*` MCP tools**, preferred for writes in an agent session — they
  resolve the active project without needing the cwd, and are the only route to
  `crux_adr_add`. They may be deferred rather than listed up front; fetch a schema
  with `ToolSearch("select:mcp__crux__crux_task_add")` before calling.
- **The `crux` CLI**, better for reads you want to filter (`crux cpm | head -30` is
  not expressible as an MCP call). Run `crux --help` for the current surface rather
  than guessing at flags.

The reason is not tidiness. A task row is not the whole of a task: adding or closing
one also writes an activity log entry, recomputes the critical path, and feeds
estimate calibration from `actual_days`. A direct `INSERT` or `UPDATE` produces a row
that looks right and a board that is quietly wrong, and `crux sync` will then
reconcile that wrongness against GitHub. The database is shared across every project
on this machine, so a malformed write is not contained here.

The two surfaces are close but not identical, and the CLI fails quietly rather than
loudly. There is an MCP `crux_task_update`, but no `crux task update` in the CLI —
closing a task there is `crux task done <slug> [--note "" --actual-days N]`. Invoking
the MCP name against the CLI (`crux task update <slug> --status done`) does not
error: it reports `→ todo` and sets the status to the opposite of what was asked.
Read the line the command prints back and check it says what you intended.

### Known gap: linking a task to an existing issue

`crux sync --apply` creates a GitHub issue for any task with no linked one. There is
no supported way to point a task at an **already-open** issue — neither the CLI nor
`crux_task_update` exposes `gh_issue_number`. So either let `crux sync` create the
issue, or accept that a hand-written issue and its task stay linked only by
convention (mention the issue number in the task description). Do not close the gap
by writing the database.

If something you need is genuinely not exposed by either entry point, say so and
stop, rather than reaching past them. That gap is worth reporting.

## Before pushing

`make build` and `make test` must both pass **in the worktree**, so what the PR
claims is what was actually tested. For any change to [index.html](index.html), the
build config, or module imports, check the built output too — `grep script dist/index.html`
should show a hashed `./assets/...` bundle and nothing root-absolute.

## Reference

- [README.md](README.md) — what the project is, how to run it, the model format.
  Written for a human arriving cold; this file is the working agreement on top
  of it, so prefer adding orientation there and rules here.
- [GSSK_UI_SPECIFICATION.md](GSSK_UI_SPECIFICATION.md) — intended UI behaviour
- [ADVANCED_FEATURES_ROADMAP.md](ADVANCED_FEATURES_ROADMAP.md) — planned work
- [tests/](tests/) — Playwright specs; `repro_bug.spec.js` is the pattern for a
  regression test that pins a fixed defect
