# Pre-approval checkpoint (stranger test)

Run the applicable checks before submitting. An unchecked applicable item is
a blocker. Do not require Full-track evidence for a Focused plan. Check
section coverage against the required-sections table in
[plan_template.md](./plan_template.md).

## All tracks

- [ ] Classification and primary language are stated.
- [ ] Track is identified and the plan matches its depth.
- [ ] Behavior, scope boundary, and In/Out scope are clear.
- [ ] Every section required for the selected track is present.
- [ ] Verified constraints cite evidence; material evidence limits are stated.
- [ ] No material decision, interpretation, or load-bearing uncertainty remains.
- [ ] Each affected artifact has a retain, update, migrate, or remove decision.
- [ ] Stale artifacts caused by the change have cleanup owners.
- [ ] A stranger engineer could execute the plan with repo access alone.
- [ ] Every term is defined where it is used; no "as above" and no external
  link carries load.
- [ ] Paths are repo-relative; every command states its working directory.
- [ ] Tasks satisfy every task-field and authoring rule in plan_template.md.
- [ ] Acceptance is stated as observable behavior, not internal attributes.
- [ ] Stop conditions name the event that forces a stop and a question back.
- [ ] Rollback is present for breaking change, migration, data, or security
  work, or explicitly marked not applicable with a reason.
- [ ] Existing/untracked user changes are preserved and excluded from scope.
- [ ] Edits the user made while approving were re-checked; material changes
  went back through the approval gate.
- [ ] Post-approval checks are listed, not represented as already complete.

## Full track only

- [ ] Direct and material transitive consumers, contracts, tests, config, and
  docs were investigated, or a limitation is recorded.
- [ ] Non-goals are stated.
- [ ] Decision dependencies were resolved in order; no table row is pending.
- [ ] Rejected alternatives record what was dropped and why (only when real
  alternatives existed).
- [ ] Migration, rollout, compatibility, permissions, and telemetry were
  considered where applicable.
