# DECISION.md — droid-shunt

Decisions fixed during design (2026-10-25). This plugin is a port of Spotify's
shunt (`spotify/portal-ai-plugins`, Apache-2.0) to the Factory Droid Harness.

## D1. Delegation backend: native Custom Droids via the Task tool

**Decided.** Bulk reads and code generation are delegated to the `bulk-reader`
and `code-writer` Custom Droids through the Task tool. The subagent runs in a
fresh context window on a pinned cheap model, so file content never enters the
parent session.

**Rejected.**
- *Scripts wrapping `droid exec`* (1:1 shunt architecture): deterministic
  transport, but every delegation spawns a nested headless run.
- *Hybrid* (both): more surface area than this plugin needs; can be added
  later without breaking anything.

**Consequence.** No `scripts/` layer. The "agent never assembles pipelines"
discipline is enforced by hooks + skills, and the one-shot semantics shunt
implements manually come free (each Task invocation is a fresh window).

## D2. Initial scope: hooks + droids + skills + one command (Evals suite delivered in v0.1.1)

**Decided.** Ship `hooks/`, `droids/`, `skills/`, `commands/set-droid-model.md`,
manifest, README. Nothing else in v0.1.0.

**Delivered (2026-10-25):** 3-layer evals suite in `evals/` (`hooks/`, `delegation/`, `e2e/`, `results/`) tested against `9router-next` corpus, with comprehensive benchmark report in `evals/results/BENCHMARK-9router-next.md`.

**Deferred** (not rejected): scripts transport, marketplace wrapper (README documents the wrapper layout for local installs instead of shipping it).

## D3. Hook protocol: Droid native (exit 2 + stderr)

**Decided.** Block with exit code 2 and put the redirect guidance in stderr,
per the Droid hook contract. shunt's `{"decision": "block", "reason": ...}`
JSON output is not portable to Droid.

## D4. Enforcement improvements over shunt

**Decided.** Port the hooks with fixes for shunt's known defects:

- Resolve paths against the session `cwd` from the hook input (shunt issue
  #21: relative paths, `~`, and hook-vs-shell cwd mismatches).
- Zero values do not count as targeted reads: `offset: 0` / `limit: 0` no
  longer bypass the threshold (shunt documents this as a known bypass).
- Flag-value disambiguation in the Bash hook: `head -n 5 file` treats `5` as
  a flag value, not a path (shunt's parser reads it as the file).
- Compound commands are caught (`cd x && cat big`), and Droid's `commandRegex`
  narrows when the hook fires at all.

**Accepted tradeoffs.** A file literally named like a number passes the Bash
hook unblocked; any command containing `|` or `>` is allowed (blocking
legitimate commands costs more than the reads that slip by). Documented in
README "Known limitations".

## D5. Threshold: 350 lines, configurable via `SHUNT_MIN_LINES`

**Decided.** Same default as shunt (delegation overhead exceeds savings below
it). Non-numeric values fall back to 350.

## D6. Model pinning is a command, not a manual edit

**Decided.** The droids pin `custom:gemini-3.7-flash-high-0` (cheap model available on the target instance). Changing the model is the job of `/set-droid-model` (`commands/set-droid-model.md`), which:

- lists Factory-managed models (`droid exec --help`) and BYOK models
  (`~/.factory/settings.json` `customModels` — reading exact `id` field first, falling back to derived `custom:<Name>-<index>` if `id` is omitted);
- presents the choices with the AskUser tool — the user picks, never the
  agent silently;
- edits only the `model:` frontmatter (`inherit`, model ID, or `custom:…`),
  with `reasoningEffort` rules (never combined with `inherit`).

**Rejected.** Hardcoding a static model table or editing frontmatter by hand without verifying model ID existence in DroidValidator.

## D7. Non-delegation boundaries are design, not suggestions

**Decided.** Keep shunt's exclusions, restated in both skills: debugging,
edits needing exact content, small files, and architectural decisions stay
with the parent model. Subagent summaries are not line-accurate, so any line
number must be re-verified with a targeted read (offset/limit) before an edit.

## D8. Name and license

**Decided.** `droid-shunt`, Apache-2.0, with explicit credit to Spotify's
shunt as the origin of the routing pattern, the hook design, and the 350-line
threshold. The port is attributed in README and `plugin.json`.

## D9. Headless Task gating and Subagent Autonomy

**Decided.**
- In headless mode (`droid exec`), the `Task` tool is strictly gated by Droid CLI: it is blocked by default and under `--auto medium`. It requires `--auto high` to be permitted.
- In interactive sessions and for child tasks, autonomy is configured via `subagentAutonomyLevel: "medium"` in `~/.factory/settings.json`. Subagents marked `tools: read-only` (such as `bulk-reader`) are further restricted to read-only tool operations regardless of parent autonomy.
- In Spec Mode, `code-writer` cannot perform file creation or modifications because subagent actions are strictly read-only while formulating a plan.

**Rejected.** Claiming `--auto medium` unblocks `Task` in headless mode (empirically falsified on Droid CLI 0.233.0+ via `droid exec --list-tools`).

## D10. Compatibility Audit and Benchmark Erratum

**Decided.**
- Audit against Droid Harness v0.233.0+ verified that hook schemas, JSON configs, frontmatter, and exit code 2 protocol match the harness specification.
- Erratum recorded for `BENCHMARK-9router-next.md` Finding 1 / Recommendation #2: `Task` delegation was zero in the initial benchmark because `--auto high` is required to allow `Task` in `droid exec`.

## D11. Toggle code-writer on/off (disabled by default)

**Decided.** Custom droid `code-writer` and its companion skill `skills/code-writer/` are shipped disabled by default with `.disabled` extension (`droids/code-writer.md.disabled`, `skills/code-writer/SKILL.md.disabled`). A dedicated executable slash command `/toggle-code-writer` (`commands/toggle-code-writer`) toggles between enabled and disabled states via atomic, idempotent file renames. `bulk-reader` remains always enabled without a toggle.

**Why file renaming.** The Droid Harness CLI scans `droids/*.md` at the top level of each `droids/` directory to populate the subagents catalog, and looks for `SKILL.md` in each `skills/*/` directory for skills. Renaming to `.disabled` removes them completely from the runtime catalog without modifying the harness core. It is atomic (`mv`), uniform across droid and skill, does not mutate YAML frontmatter, and evals can still resolve definitions via fallback.

**Rejected alternatives.**
- *External state file (`~/.factory/droid-shunt.json`) with `SessionStart` hook:* Adds state management complexity and unnecessary lifecycle hook overhead for a simple feature.
- *`enabled: false` frontmatter attribute:* Not supported by Droid loader for subagent droids; requires parsing and rewriting YAML in markdown; creates inconsistency between droids and skills.
- *Renaming files in the source tree during toggle:* Would mutate git working tree and shipped repository defaults.
- *Toggling bulk-reader:* Bulk reading with shunt hooks is core behavior; disabling bulk-reader while hooks remain active would break the redirection contract.

**Consequence.** Source repository ships with `code-writer` disabled. Running `droid plugin update` fetches upstream defaults and resets `code-writer` back to OFF. Documented in README, DECISION.md, and command output.

