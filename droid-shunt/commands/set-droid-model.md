---
description: Set or fix the model field of custom droids (droids/*.md, droids/*.md.disabled). Lists available and BYOK models, asks the user to choose, and writes valid frontmatter.
---

# Set Droid Model

Set the `model` frontmatter of one or more custom droid definitions.

Requested: $ARGUMENTS

## Critical rules

1. Never read, print, or ask for API keys. BYOK models are referenced by their `custom:` name form only.
2. Never guess a model ID. Use only IDs listed from the sources in step 2.
3. Let the user pick the model — use the AskUser tool to present the choices. Do not choose silently.
4. Change only the `model:` line (and `reasoningEffort:` if requested). Leave `name`, `description`, `tools`, and the system prompt body untouched.

## Workflow

### 1. Find the target droid files

If `$ARGUMENTS` names droids or file paths, use those. Otherwise list candidates from:

- `droids/*.md` and `droids/*.md.disabled` (this plugin, including disabled droids)
- `<project>/.factory/droids/*.md` (project droids)
- `~/.factory/droids/*.md` (personal droids)

If several files match and `$ARGUMENTS` does not disambiguate, show the list and ask the user which to change.

### 2. List the available models

- Run `droid exec --help` and collect the model IDs it lists among the examples and available models.
- For BYOK custom models, read `~/.factory/settings.json` → `customModels` array. Priority order:
  1. Use the model's `id` field directly if present (e.g. `id: "custom:gemini-3.7-flash-high-0"`).
  2. If the `id` field is missing, derive it from entry `i` (0-based) with display name `D`: `custom:<D with spaces replaced by dashes>-<i>`, e.g. display name `Kimi K2 [Groq]` at index 0 → `custom:Kimi-K2-[Groq]-0`.

### 3. Ask the user

Use the AskUser tool to present the choices, grouped:

1. `inherit` — use the parent session's model (current behavior for most droids).
2. Factory-managed models — exact IDs from `droid exec --help`.
3. BYOK custom models — `custom:` references from `~/.factory/settings.json`.

Include each target droid's current `model` value in the question.

### 4. Write the frontmatter

Edit the `model:` line in each target file:

- `model: inherit` — unquoted. `reasoningEffort` is ignored with `inherit`; remove it if present.
- `model: <model-id>` — exact ID, unquoted.
- `model: custom:...` — BYOK reference using its explicit `id` (or derived `<Name>-<index>` if missing), unquoted unless YAML requires quoting.

Only if the user asked for it and the chosen model supports it, set `reasoningEffort: low|medium|high`. Never set `reasoningEffort` with `inherit`.

### 5. Verify

Re-open the file and confirm the frontmatter still parses. `/droids` reloads definitions from disk, and `DroidValidator` reports unknown-model errors — tell the user to check there if a value looks suspicious.

## Completion report

Report per file: path, previous `model` value → new value, and the source of the chosen model (inherit / managed / BYOK).
