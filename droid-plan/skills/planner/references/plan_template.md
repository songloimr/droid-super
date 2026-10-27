# Plan template and authoring rules

A stranger engineer with repo access but no conversation history must be able
to execute the plan end-to-end. State everything inline. Keep the shortest
template that communicates the work safely; omit a section only when it has
no material content. Never invent decisions or assumptions to fill a section.

## Authoring rules

- **Self-contained:** define every domain or project term where it is used.
  Never write "as said above" or point to an external blog or doc. When a
  fact comes from an outside source, copy the relevant part into the plan.
- **Paths and commands:** use repo-relative paths (for example
  `src/auth/session.ts`). Every command states its working directory
  (for example `cwd: <repo root>, npm test -- auth`).
- **Task fields (defined only here):** goal (one sentence), files,
  constraints, depends on, est. diff, and verify (working directory and
  expected result). Add a style sample (at most ~10 lines) only when the
  expected code shape is not obvious from the constraints. Never paste a
  full implementation, and never write a vague label such as "refactor auth"
  or "update tests".
- **Task size:** one bug per task; each task fits one context window. Split
  further when the expected diff exceeds ~30 lines, except for mechanical
  changes such as renames. If a change cannot be described in one precise
  sentence, the task is still too large.
- **Acceptance as behavior:** state expected observable results (for example
  "`GET /health` returns 200"), not internal attributes (for example
  "add struct X"). Every task names its verification command and expected
  result.

## Decision table (only for real unresolved choices)

| Decision | Context | Options | Recommendation | Dependency | Status |
| --- | --- | --- | --- | --- | --- |
| <choice> | <verified evidence> | <meaningful alternatives> | <recommended option + why> | <none or prerequisite> | approved |

Resolve choices in dependency order. A recommendation is not approval: mark
`approved` only after an explicit user answer. No pending decision or
unresolved blocker may remain at submission. A non-material detail belongs in
a task, not in this table.

## Template

```markdown
# Plan: <title>

## Context
**What:** <requested change>
**Why:** <goal or impact>
**Classification:** <Feature | Bug | Refactor | Refactor/Removal | Architecture>
**Track:** <Focused | Full>
**Primary language:** <primary language>

## In scope / Out of scope
- In: <behavior, path, or consumer covered>
- Out: <explicit exclusion and why>

## Non-goals
- <work deliberately not attempted>

## Constraints and evidence
- ✓ <verified constraint — path/symbol/command>
- ✗ <refuted assumption — adjustment>
- Implementation condition: <check during work, fallback or stop condition>

## Decisions
<Decision table above; who decided and when. Omit if evidence leaves one path.>
**Rejected:** <real alternative> because <reason>

## Impact and cleanup
- <artifact>: <retain | update | migrate | remove> — <evidence>
- [ ] <stale artifact to clean>

## Tasks
1. <one-sentence change> — files: <repo-relative paths>; goal: <behavior>;
   constraints: <pattern/symbol to reuse, contract, failure behavior>;
   depends on: <none or task N>; est. diff: <lines>.
   Style sample (only when the shape is not obvious from the constraints):
   `<≤10-line snippet showing shape, not implementation>`.
   Verify (cwd: <dir>): `<command>` → <expected observable result>.
2. <next task in execution order> ...

## Stop conditions
- <event that forces a stop and a question back to the user>

## Rollback
<Required for breaking change, migration, data, or security work. Otherwise
state "Not applicable — <reason>".>
- <how to revert, restore data, or disable; exact command or steps>

## Verification
- [ ] <behavior check or focused test with expected result>
- [ ] <typecheck / lint / test command or unavailable + reason>
- [ ] <impact/cleanup search proving no stale references>
- [ ] conformance review — mandatory via the conformance-reviewer droid
```

## Required sections by track

| Section | Focused | Full |
| --- | --- | --- |
| Context (What, Why, Classification, Track, Primary language) | required | required |
| In scope / Out of scope | required | required |
| Non-goals | omit when empty | required |
| Constraints and evidence | required | required |
| Decisions and rejected alternatives | only for real unresolved choices | required for real unresolved choices |
| Impact and cleanup | required | required |
| Tasks | required | required |
| Stop conditions | required | required |
| Rollback | "Not applicable — <reason>" allowed | required for breaking, migration, data, or security work |
| Verification, including the conformance review | required | required |

A Focused plan covers every row at its depth. A Full plan adds the depth the
Full column demands. Before submitting, remove template instructions and
unfilled placeholders.
