# COMPAT.md — Droid Harness Compatibility Audit Report

**Plugin:** `droid-shunt` (`droid-shunt@droid-super`)  
**Audited Harness:** Factory Droid CLI `0.233.0` – `0.249.0` (spec docs: `docs.factory.com`)  
**Audit Date:** 2026-10-25  
**Auditor:** Factory Droid Agent  

---

## 1. Executive Summary

This document presents the complete compatibility audit of the `droid-shunt` plugin against the Factory Droid Harness.
The plugin's architectural components — PreToolUse hooks, custom droids, skills, slash commands, and marketplace registration — were audited via official documentation inspection, schema validation, and empirical runtime verification.

**Verdict:** **FULLY COMPATIBLE** (with documented harness constraints regarding headless tool gating).

---

## 2. Compatibility Matrix

| Surface / Component | Spec Reference | Status | Evidence & Runtime Verification |
|---|---|---|---|
| **Plugin Manifest** (`.factory-plugin/plugin.json`) | `harness/plugins.md` | **PASS** | Valid JSON schema (`name`, `description`, `version: 0.3.0`, `author`, `license`, `keywords`). Validated with `jq empty`. |
| **Marketplace Manifest** (`marketplace.json`) | `harness/plugins.md` | **PASS** | `droid plugin marketplace add ./droid-super` and `droid plugin install droid-shunt@droid-super --scope user` succeed cleanly. |
| **Hooks Manifest** (`hooks/hooks.json`) | `harness/hooks.md` | **PASS** | Valid schema: `PreToolUse` events, matchers (`Read`, `Execute`), `commandRegex`, `${DROID_PLUGIN_ROOT}` interpolation, `timeout: 30`. |
| **Hook Dispatch Protocol** (`check-file-size`, `check-bash-read`) | `harness/hooks.md` | **PASS** | Exit code 2 cleanly blocks tool call; stderr is returned as error feedback to LLM. Tested 28/28 offline test corpus. |
| **Custom Droids Frontmatter** (`droids/*.md`) | `harness/subagents.md` | **PASS** | `name` matches regex `^[a-zA-Z0-9_-]+$`; `tools: read-only` and `tools: ["Read", ...]` array format supported. Loaded into system subagents catalog. |
| **Model Resolution & Validation** (`model: custom:...`) | `harness/subagents.md` | **PASS** | Frontmatter pin `custom:gemini-3.7-flash-high-0` maps directly to BYOK model `id` in `settings.json`. Empirical smoke test confirmed subagent runs with `modelId: "custom:gemini-3.7-flash-high-0"`. |
| **Skills Schema** (`skills/*/SKILL.md`) | `harness/skills.md` | **PASS** | Frontmatter contains `name`, `description`. Body loaded into system prompt prompt context cleanly. |
| **Slash Command** (`commands/set-droid-model.md`, `commands/toggle-code-writer`) | `harness/commands.md` | **PASS** | Markdown command frontmatter and executable command script both supported and validated. |
| **Autonomy & Task Tool Gating** (`Task`) | `harness/security.md` | **CONDITIONAL** | In headless mode (`droid exec`), `Task` is blocked at default and `--auto medium`. Only allowed under `--auto high`. |
| **Subagent Autonomy Inheritance** (`subagentAutonomyLevel`) | `harness/subagents.md` | **PASS** | Configured as `medium` in `settings.json`. Subagent with `tools: read-only` is clamped to read-only tool operations. |

---

## 3. Detailed Audit Findings (F1 – F6)

### F1: Headless Task Tool Gating Requires `--auto high`
- **Specification:** The Droid Harness classifies `Task` as an Execution Tool capable of orchestrating multi-step autonomous processes.
- **Observed Behavior:**
  - `droid exec --list-tools` (default / read-only): `Task - status: blocked`
  - `droid exec --auto medium --list-tools`: `Task - status: blocked` (even if `--add-tools Task` is passed)
  - `droid exec --auto high --list-tools`: `Task - status: allowed`
- **Impact:** Benchmark scripts or headless CLI invocations expecting `Task` delegation must run with `--auto high`. Interactive desktop / web chat sessions grant subagent delegation permissions according to user confirmation policies.

### F2: PreToolUse Hooks Execution Inside Subagents
- **Observed Behavior:**
  - Runtime verification of subagent session (`9014137e-cfcc-4fc1-8bd4-1e1e9c140910`) revealed that PreToolUse hooks (including `check-file-size`) are registered and executed on subagent tool calls (`PreToolUse Read` with exit code 0 on targeted reads).
  - Hook input receives `session_id`, `cwd`, and `tool_input` without an explicit `is_subagent` flag.
- **Resolution:**
  - `bulk-reader` naturally issues targeted reads (`offset`/`limit`) or `Grep`, which pass through the hook unhindered (`exit 0`).
  - To prevent deadlock in any edge case where a subagent attempts a full read, the hook block message was enhanced with a chunked read fallback: *"If Task is unavailable (subagent or low autonomy), read chunked using offset/limit or use Grep."*

### F3: BYOK Model Pinning and Resolution
- **Specification:** Custom models registered in `~/.factory/settings.json` carry a distinct `id` attribute (e.g. `custom:gemini-3.7-flash-high-0`).
- **Audit Result:**
  - Deriving IDs via `custom:<display_name>-<index>` caused discrepancies when display names differed from registration identifiers.
  - Resolution order was formalized in `commands/set-droid-model.md`: first read explicit `id`, only falling back to slug derivation if `id` is missing.
  - Direct execution of `bulk-reader` verified that `custom:gemini-3.7-flash-high-0` is recognized by `DroidValidator` and dispatched properly without fallback.

### F4: Spec Mode Behavioral Boundary
- **Specification:** When the parent session is in Spec Mode (spec planning phase), all modification tools are blocked and the agent is restricted to read-only research.
- **Subagent Constraint:** While `bulk-reader` functions normally during Spec Mode, `code-writer` will fail if invoked during Spec Mode because its `Create` and `Edit` tools are disallowed by the harness. This restriction is documented in `README.md` and `DECISION.md`.

### F5: Hook Shell Filtering via `commandRegex`
- **Specification:** The `commandRegex` field in `hooks.json` allows early filtering of `Execute` commands prior to hook script invocation.
- **Audit Result:** Regex `(^|[;&|])\\s*(cat|head|tail|less|more)\\s` accurately filters commands in CLI dispatcher `Za(tool_input.command)`. Non-matching commands bypass execution of `check-bash-read`, ensuring zero latency overhead on normal terminal commands.

### F6: Plugin User-Scope Cache Synchronization
- **Specification:** User-scoped plugins installed from local marketplaces cache files in `~/.factory/plugins/cache/<marketplace>/<plugin>/<version-hash>/`.
- **Audit Result:** Edits in the source directory (`droid-super/droid-shunt`) do not take effect immediately in the runtime environment until `droid plugin update droid-shunt@droid-super` is executed. Cache refresh was confirmed; updated hooks and droids propagate cleanly to the active harness.

### F7: Executable Slash Command Support (`commands/toggle-code-writer`)
- **Specification:** Droid Harness plugin specification (`harness/plugins.md`, `harness/custom-slash-commands.md`) supports slash commands as markdown files (`commands/<name>.md`) or executable scripts (`commands/<name>`). Executable commands receive user arguments positionally and their stdout/stderr stream directly to the conversation.
- **Audit Result:** `commands/toggle-code-writer` is implemented as an executable Bash script (`chmod +x`). It parses `$1` (`on`, `off`, `status`, or empty for flip), validates arguments, resolves the installed plugin cache path via script path or `~/.factory/plugins/installed_plugins/*.json`, and performs atomic renames of `droids/code-writer.md` and `skills/code-writer/SKILL.md` (toggling `.disabled`).
- **Runtime Verification:** Verified that `status`, `on`, `off`, flip, and invalid argument handling run with zero errors, and exit 1 upon invalid input.

---

## 4. Verification Artifacts & Test Logs

1. **Layer 1 Hook Self-Check:**
   ```bash
   node evals/hooks/run.mjs --self-check
   # Output: Total: 28 | Passed: 28 | Failed: 0 | Accuracy: 100.0%
   ```

2. **Empirical Headless Task Verification:**
   - Parent: `droid exec --auto high -m custom:Mimo-V2.6-Pro-0`
   - Child Subagent: `bulk-reader` on `custom:gemini-3.7-flash-high-0`
   - Result: Successful extraction of `TARGET_OMEGA` on line 400 of 400-line test fixture in isolated session `9014137e-cfcc-4fc1-8bd4-1e1e9c140910`.
