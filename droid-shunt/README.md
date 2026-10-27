# droid-shunt

Shunts I/O-heavy agent work — bulk file reads and boilerplate generation — to
cheap subagent models, saving tokens on the work that does not need the
frontier model. A port of the shunt idea (Spotify's
[`portal-ai-plugins`](https://github.com/spotify/portal-ai-plugins), Apache-2.0)
to the Factory Droid Harness, using native Custom Droids instead of AiKA modes.

## How it works

Three layers, from hard gate to soft suggestion:

1. **Hooks** block the agent from reading large files and redirect to the
   bulk-reader subagent.
2. **Droids** do the work in a fresh context window on a cheap model — file
   content never enters the parent session.
3. **Skills** tell the agent when and how to delegate via the Task tool.

The parent agent never pastes file content anywhere. It passes file paths and
a question; the subagent reads and answers (or writes the generated file
straight to disk).

Design choices and their rejected alternatives are recorded in
[DECISION.md](DECISION.md).

## Contents

```
droid-shunt/
├── .factory-plugin/plugin.json
├── DECISION.md             # Fixed design decisions — why it is built this way
├── hooks/
│   ├── hooks.json          # PreToolUse: Read + Execute (commandRegex)
│   ├── check-file-size     # Blocks full-file Read on files > 350 lines
│   └── check-bash-read     # Blocks cat/head/tail/less/more on large files
├── commands/
│   ├── set-droid-model.md  # /set-droid-model — set or fix the model of custom droids
│   └── toggle-code-writer  # /toggle-code-writer — toggle code-writer droid on/off
├── droids/
│   ├── bulk-reader.md      # Read-only analyst, cheap model
│   └── code-writer.md.disabled # Boilerplate generator (shipped disabled by default)
└── skills/
    ├── bulk-reader/SKILL.md
    └── code-writer/SKILL.md.disabled
```

## Prerequisites

- `jq` on the PATH (hooks use it to parse hook input).
- A model you consider cheap, available on your Factory instance. The droids
  pin `custom:gemini-3.7-flash-high-0`; run `/set-droid-model` to change it — the
  command lists available and BYOK models and lets you pick one. If an invalid or
  unknown model ID is specified, `DroidValidator` will reject or the harness may
  fall back silently to the parent model.

## Install (local test)

This plugin is part of the `droid-super` marketplace:

```
droid-super/
├── .factory-plugin/
│   └── marketplace.json    # { "name": "droid-super", "plugins": [ { "name": "droid-shunt", "source": "./droid-shunt" } ] }
└── droid-shunt/            # this plugin
```

```bash
droid plugin marketplace add ./droid-super
droid plugin install droid-shunt@droid-super --scope user
```

Then start a new session and ask a question that spans multiple large files.

## Configuration

All settings are environment variables (hooks inherit your shell environment).

| Variable | Default | Purpose |
|----------|---------|---------|
| `SHUNT_MIN_LINES` | `350` | Line count above which the hooks block and redirect |

### Toggling code-writer

The `code-writer` custom droid and skill are shipped **disabled by default** (`droids/code-writer.md.disabled`, `skills/code-writer/SKILL.md.disabled`) to minimize catalog surface area. `bulk-reader` is always enabled.

Use `/toggle-code-writer` to manage its state:

```bash
/toggle-code-writer status   # Check whether code-writer is ON or OFF
/toggle-code-writer on       # Enable code-writer
/toggle-code-writer off      # Disable code-writer
/toggle-code-writer          # Toggle/flip current state
```

- When enabled, files are renamed to `droids/code-writer.md` and `skills/code-writer/SKILL.md`.
- Droid definitions reload dynamically at the next `Task` call or via `/droids` (Reload).
- Skill registration may require starting a new session to fully refresh.
- **Important**: Running `droid plugin update` pulls the default repository state and resets `code-writer` back to **OFF**. If you need `code-writer` enabled after an update, run `/toggle-code-writer on`.

## What does not get delegated

- **Debugging** — needs the parent model's reasoning, not a summary.
- **Editing** — exact content must be in context; hooks allow targeted reads
  (offset/limit) for exactly this reason.
- **Small files** — delegation overhead exceeds the savings below the
  threshold.
- **Architectural decisions** — judgment calls stay with the parent model.

## Evals & Benchmark

A complete 3-layer reproducible evals suite is located in `evals/`:

- **Layer 1 (Hooks Offline)**: Validates PreToolUse hooks (`check-file-size`, `check-bash-read`) across edge cases and buckets. Run via `node evals/hooks/run.mjs --self-check`.
- **Layer 2 (Delegation Quality)**: Evaluates `bulk-reader` and `code-writer` accuracy and code validity against codebase ground truth. Run via `node evals/delegation/run.mjs && node evals/delegation/grade.mjs`.
- **Layer 3 (End-to-End A/B)**: Compares 120 sessions (20 tasks × 3 runs × 2 configs) with and without shunt. Run via `bash evals/e2e/run.sh --all && node evals/e2e/grade.mjs`.

See `evals/README.md` for running instructions, and `evals/results/BENCHMARK-9router-next.md` for the comprehensive evaluation report on the `9router-next` codebase.

## Known limitations

- A file literally named like a number (e.g. `5`) passes the Bash hook
  unblocked — flag-value disambiguation wins over that edge case.
- The Bash hook allows any command containing `|` or `>`; a bulk read smuggled
  into a quoted string with those characters passes through. The net is
  deliberately loose: blocking legitimate commands costs more than the reads
  that slip by.
- `code-writer` has no hook enforcement — the agent must recognize the
  delegation opportunity from the skill description.
- **Toggle state reset on update**: Running `droid plugin update` resets `code-writer` to its default disabled state (OFF). Run `/toggle-code-writer on` if you want it re-enabled.
- **Spec Mode restriction**: When the parent session is in Spec Mode (planning/spec gathering), subagents are constrained by read-only rules. `code-writer` cannot create or modify files until Spec Mode has exited.
- **Headless Task gating**: In headless CLI (`droid exec`), the `Task` tool is blocked by default and remains blocked under `--auto medium` (verified via `droid exec --list-tools`). It is **only allowed under `--auto high`**.
- **Subagent Autonomy**: Subagents inherit autonomy boundaries from `subagentAutonomyLevel` in `~/.factory/settings.json` (recommended: `medium`). Custom droids with `tools: read-only` (like `bulk-reader`) are additionally clamped to read-only operations.
- **Safety warning for `--auto high`**: Running e2e tests or batch scripts with `--auto high` grants full tool autonomy without interactive confirmation. Always ensure targets are isolated and uncommitted changes are protected.
- Both droids pin one model (`custom:gemini-3.7-flash-high-0`). Adjust per your instance and cost policy with
  `/set-droid-model`. If an invalid model ID is specified, `DroidValidator` rejects it or falls back silently to the parent model.

## Credit

Routing pattern, hook design, and the 350-line threshold follow Spotify's
shunt plugin (`spotify/portal-ai-plugins`, Apache-2.0). Differences in this
port: native Droid hooks protocol (exit 2 instead of JSON `decision`), Custom
Droids instead of AiKA modes, Task-tool delegation instead of CLI scripts,
path resolution against the session `cwd`, and zero-offset reads no longer
bypass the threshold.
