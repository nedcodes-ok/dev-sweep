# dev-sweep

Find and clean `node_modules`, build caches, and dev artifacts eating your disk. Zero dependencies.

```
$ npx dev-sweep ~/projects

dev-sweep v0.2.0
Scanning: /home/you/projects (depth: 5)

Found 12 artifacts totaling 4.82 GB:

  SIZE        CAT     TYPE                     PATH
  ------------------------------------------------------------------------------
     1.92 GB  deps    npm/yarn dependencies    /home/you/projects/app/node_modules
   843.2 MB  deps    npm/yarn dependencies    /home/you/projects/site/node_modules
   412.0 MB  build   Next.js build cache      /home/you/projects/app/.next
   ...

  Total: 4.82 GB across 12 items
  847 directories scanned
```

## Install

```bash
npx dev-sweep           # run without installing
npm i -g dev-sweep      # or install globally
```

## Usage

```bash
dev-sweep                        # scan current directory
dev-sweep ~/projects             # scan specific path
dev-sweep --clean                # scan and offer to delete each match
dev-sweep --dry-run              # show what would be deleted
dev-sweep --ide                  # also check IDE caches (~/.cursor, ~/.vscode, etc)
dev-sweep --sort name            # sort by: size (default), name, type
dev-sweep --json                 # machine-readable JSON output
dev-sweep --category deps        # filter: deps, build, cache, test, logs
dev-sweep -s 0                   # show everything (no size minimum)
dev-sweep -d 10                  # scan deeper (default: 5)
```

## What it finds

**Dependencies** — `node_modules`, `.pnpm-store`, `.yarn`, `venv`, `.venv`, `vendor`, `bower_components`

**Build output** — `.next`, `.nuxt`, `.angular`, `.expo`, `.svelte-kit`, `dist`, `build`, `out`, `.vercel`, `target`, `*.egg-info`

**Caches** — `.turbo`, `.cache`, `.parcel-cache`, `.vite`, `.eslintcache`, `.tsbuildinfo`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.gradle`

**Test/coverage** — `coverage`, `.nyc_output`, `storybook-static`

**Logs** — `npm-debug.log`, `yarn-error.log`, `yarn-debug.log`

**IDE** (with `--ide`) — `.cursor`, `.vscode`, `.config/Code`, `.config/Cursor`

## JSON output

```bash
dev-sweep --json | jq '.results[] | select(.sizeMB > 100)'
```

Pipe to other tools, build dashboards, or automate cleanup.

## Safety

- Never deletes anything without `--clean` flag
- Interactive per-item confirmation when cleaning
- IDE caches are always skipped during clean (delete manually)
- `--dry-run` shows what would be deleted without touching anything
- Zero dependencies, zero network calls

## License

MIT
