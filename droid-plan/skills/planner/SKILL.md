---
name: planner
description: "Use when planning a non-trivial code or architecture change, especially when scope, alternatives, dependencies, deletion, compatibility, or cleanup impact must be resolved before editing. Do not use automatically for read-only exploration, reviews, docs-only work, or a truly unambiguous one-line edit. If the user explicitly invokes planner, choose the track from repository evidence, defaulting to Focused."
allowed-tools:
  - Read
  - Grep
  - Glob
  - LS
  - Execute
  - Task
  - TodoWrite
  - AskUser
  - ExitSpecMode
  - Edit
  - Create
  - ApplyPatch
  - ToolSearch
  - WebSearch
  - FetchUrl
compatibility: droid
version: 2.2.0
---

# Planner

Turn a non-trivial change into a safe, approved, evidence-based path. Make material choices and blast radius visible; skip ceremony with no effect.

System, developer, and repository instructions always take precedence. Use `Task` only for read-only research delegation (steps 3 and 6) and the conformance-reviewer droid (step 7); do all other work directly.

## Trigger, language, classification

Trigger for a feature, bug, refactor, removal, migration, contract change, architecture change, or vague cleanup when planning reduces risk. Skip for read-only work, reviews, docs-only work, or an unambiguous one-line edit. If the user explicitly invokes planner, choose the track from repository evidence, defaulting to Focused.

Use one primary language throughout. Infer it from an explicit instruction or the most recent natural-language request; use English for code-only requests. Preserve identifiers, commands, paths, and terms.

Classify as **Feature**, **Bug**, **Refactor**, **Refactor/Removal**, or **Architecture** (cross-system). State classification and primary language first.

## Core contracts

1. No implementation edits before the user approves the current plan.
2. A verified repository convention is a constraint, not a decision.
3. Ask only about material trade-offs evidence cannot resolve.
4. Resolve every load-bearing uncertainty before approval; a fact learnable only during implementation becomes a planned implementation condition.
5. Handle artifacts the change makes stale; do not clean unrelated code.
6. On deviation, stop, update the plan with the reason, and get renewed approval. Never drift silently.
7. Keep the plan in the conversation or the Spec submission; never write it to a repo file.
8. Preserve existing and untracked user work; never overwrite it for a clean diff.

## Approval gate

In Spec mode, research and planning are read-only; submit with `ExitSpecMode`. Outside Spec mode, present the plan and wait for approval. Submission is not approval. Approval covers the submitted version only: a material scope, decision, contract, or risk change — including edits the user makes while approving — needs a revised plan and renewed approval.

## Workflow

### 1. Size the work

Track sets depth, not quality. Choose a track after classification:

| Track | Use when | Output |
| --- | --- | --- |
| **Focused** | Direct, bounded change, one likely path. | The Focused sections in the required-sections table of [plan_template.md](./references/plan_template.md). |
| **Full** | Multiple systems, consumers, contracts, deletion, migration, trade-offs. | Every Focused section at full depth, plus Non-goals, Decisions with rejected alternatives, and a complete Rollback. |

### 2. Clarify only what code cannot answer

Limit questions to scope, behavior, compatibility, placement, deletion, or genuine trade-offs. Bundle only independent choices in one `AskUser` call; ask dependent choices in order. Do not design past an unanswered material choice.

### 3. Gather evidence to the needed depth

Read the execution path, callers, tests, config, docs, conventions. Prefer graph tools when available; otherwise Grep/Glob. Check coverage before negative claims. For broad read-only research in this step or step 6, delegate to a read-only subagent from the session's list (for example `explorer`); never invent a type, and give a self-contained handoff that ends with: "If blocked, ambiguous, or out of scope, report the blocker and stop. Do not guess and do not ask questions." Stop when approach, impact, and verification are supported; state evidence limits.

### 4. Separate constraints, decisions, conditions

Record **✓ verified** (cite source), **✗ refuted** (adjust), **? unresolved** (ask first), or **implementation condition** (check during work, with fallback or stop). A decision table is only for real unresolved choices; see [plan_template.md](./references/plan_template.md).

### 5. Design the smallest agent-ready change

Prefer existing code, stdlib, and installed dependencies. Strategy (order, architecture, UX choices) is fixed with the user in the plan; tactics — code details inside the named files, such as local names and control flow — belong to the implementing agent, while the plan still fixes files, contracts, and symbols to reuse. Write each task with the fields defined in [plan_template.md](./references/plan_template.md). No full implementation, no vague label.

### 6. Map impact and cleanup

Trace direct and transitive effects across code, callers, APIs/routes/events, tests, config, and docs. Each artifact gets retain/update/migrate/remove; stale items become a cleanup checklist. Run [checkpoint.md](./references/checkpoint.md).

### 7. Implement, validate, review

Only after approval:

1. Load the approved tasks into `TodoWrite` and update task status as work progresses. Make the approved changes; complete the cleanup checklist.
2. Report evidence per task: command with working directory, exit code or output excerpt, files changed. A bare "done" is not evidence.
3. Re-run impact searches; run the narrowest behavior checks, then relevant typecheck/lint/test/unused-code checks. Record gaps and why. When a focused test fails only because its assertion expects pre-change behavior, correct that test to match the approved behavior and revalidate; if the failure reveals a material behavior change, return to planning.
4. Run the mandatory conformance review via the `conformance-reviewer` custom droid: call `Task` with `subagent_type: conformance-reviewer`, passing the approved plan version, the diff, per-task evidence (command, working directory, exit code or output excerpt, files changed), the cleanup checklist, and completed verification inline in the handoff, and end the handoff with: "If blocked, ambiguous, or out of scope, report the blocker and stop. Do not guess and do not ask questions." If the droid is not available in the session, self-review against the checklist in `../../droids/conformance-reviewer.md` and disclose that limitation in the final response.
5. On **FAIL**, report each gap with file:line, stop, request direction. Never auto-fix.

## Done means

Approved scope is implemented with evidence and cleanup, decisions resolved, behavior validated, and the final response reports the review verdict plus unavailable checks. A conformance FAIL means **blocked**, not complete.
