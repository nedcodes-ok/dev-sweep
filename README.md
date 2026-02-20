# dev-sweep

Find and clean IDE caches, `node_modules`, build artifacts, and other dev cruft eating your disk.

Like `ncdu` but it knows what `.next/`, `node_modules/`, `__pycache__/`, and IDE caches are — and which ones are safe to delete.

## Install

```bash
npm install -g dev-sweep
```

Or run directly:

```bash
npx dev-sweep
```

## Usage

```bash
# Scan current directory
dev-sweep

# Scan a specific path
dev-sweep ~/projects

# Also check IDE caches (~/.cursor, ~/.vscode, etc)
dev-sweep --ide

# Interactive cleanup — asks before deleting each item
dev-sweep --clean

# See what would be deleted without deleting
dev-sweep --dry-run

# Only show items larger than 50MB
dev-sweep --min-size 50

# Scan deeper (default is 5 levels)
dev-sweep --max-depth 8
```

## What it finds

| Pattern | Description |
|---------|-------------|
| `node_modules` | npm/yarn/pnpm dependencies |
| `.next` | Next.js build cache |
| `.nuxt` | Nuxt build cache |
| `.turbo` | Turborepo cache |
| `dist`, `build` | Build output |
| `.cache` | Generic cache dirs |
| `.parcel-cache` | Parcel bundler cache |
| `.vite` | Vite dev server cache |
| `coverage` | Test coverage reports |
| `__pycache__` | Python bytecode |
| `.pytest_cache` | Pytest cache |
| `venv`, `.venv` | Python virtual environments |
| `target` | Rust/Java build output |
| `.eslintcache` | ESLint cache file |
| `.tsbuildinfo` | TypeScript incremental build |

With `--ide`, also scans:
- `~/.cursor` — Cursor IDE data
- `~/.vscode` — VS Code extensions
- `~/.config/Code` — VS Code cache
- `~/.config/Cursor` — Cursor cache

## Zero dependencies

Just Node.js. No packages to install.

## License

MIT
