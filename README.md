# droid-super

Personal Droid plugin marketplace by songloimr.

## Plugins

- **[droid-shunt](./droid-shunt)**: Shunts I/O-heavy work (bulk file reads, boilerplate generation) to cheap subagent models to save tokens on the frontier model.
- **[droid-plan](./droid-plan)**: Evidence-based planning workflow for non-trivial code changes. Plans before editing, then validates with a mandatory conformance review.

## Structure

```
droid-super/
├── .factory-plugin/
│   └── marketplace.json    # Marketplace manifest
├── README.md
├── droid-shunt/            # Plugin package
└── droid-plan/             # Plugin package
```

## Installation

### Local testing

Register the marketplace locally and install the desired plugin:

```bash
# Register local marketplace
droid plugin marketplace add ./droid-super

# Install a plugin (user scope)
droid plugin install droid-shunt@droid-super --scope user
droid plugin install droid-plan@droid-super --scope user
```

### GitHub publishing (Future)

To publish this marketplace to GitHub:

1. Initialize git and commit:
   ```bash
   cd droid-super
   git init
   git add .
   git commit -m "feat: initial droid-super marketplace"
   ```
2. Create repository `droid-super` on GitHub under your account (e.g. `songloimr/droid-super`).
3. Push to GitHub:
   ```bash
   git remote add origin https://github.com/songloimr/droid-super.git
   git branch -M main
   git push -u origin main
   ```
4. Register the marketplace using GitHub repo shorthand:
   ```bash
   droid plugin marketplace add songloimr/droid-super
   droid plugin install droid-plan@droid-super --scope user
   ```
