# droid-plan

Evidence-based planning workflow for non-trivial code or architecture changes. Turns scope, alternatives, dependencies, and blast radius into an approved plan before any edit, then validates the implementation with a mandatory conformance review.

## Contents

```
droid-plan/
├── .factory-plugin/plugin.json
├── README.md
├── droids/
│   └── conformance-reviewer.md   # Read-only reviewer (model: inherit)
└── skills/
    └── planner/
        ├── SKILL.md              # Planning workflow (v2.2.0)
        ├── references/
        │   ├── plan_template.md  # Plan template and authoring rules
        │   └── checkpoint.md     # Pre-approval stranger test
        └── evals/
            ├── evals.json          # Behavior evals
            └── trigger-evals.json  # Trigger-classification evals
```

## Install (local test)

This plugin is part of the `droid-super` marketplace:

```bash
droid plugin marketplace add ./droid-super
droid plugin install droid-plan@droid-super --scope user
```

## Usage

Invoke the `planner` skill when planning a non-trivial change (feature, bug, refactor, removal, migration, contract or architecture change). After approval and implementation, step 7 of the skill runs the mandatory conformance review via the `conformance-reviewer` custom droid. If the droid is unavailable in the session, self-review against its checklist and disclose that limitation.
