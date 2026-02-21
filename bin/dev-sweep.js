#!/usr/bin/env node

import { readdir, stat, rm, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseArgs } from 'node:util';

const VERSION = '0.3.1';

// Profiles: safe = always-regenerable stuff, aggressive = everything
const SAFE_CATS = new Set(['deps', 'cache']);
const AGGRESSIVE_CATS = new Set(['deps', 'cache', 'build', 'test', 'logs']);

const TARGETS = [
  // JS/TS ecosystem
  { name: 'node_modules', type: 'dir', cat: 'deps', desc: 'npm/yarn dependencies' },
  { name: '.pnpm-store', type: 'dir', cat: 'deps', desc: 'pnpm global store' },
  { name: '.yarn', type: 'dir', cat: 'deps', desc: 'Yarn cache/releases' },
  { name: 'bower_components', type: 'dir', cat: 'deps', desc: 'Bower dependencies' },

  // Build output
  { name: '.next', type: 'dir', cat: 'build', desc: 'Next.js build cache' },
  { name: '.nuxt', type: 'dir', cat: 'build', desc: 'Nuxt build cache' },
  { name: '.angular', type: 'dir', cat: 'build', desc: 'Angular cache' },
  { name: '.expo', type: 'dir', cat: 'build', desc: 'Expo cache' },
  { name: '.svelte-kit', type: 'dir', cat: 'build', desc: 'SvelteKit build' },
  { name: '.output', type: 'dir', cat: 'build', desc: 'Nitro/Nuxt output' },
  { name: 'dist', type: 'dir', cat: 'build', desc: 'Build output' },
  { name: 'build', type: 'dir', cat: 'build', desc: 'Build output' },
  { name: 'out', type: 'dir', cat: 'build', desc: 'Build output' },
  { name: '.vercel', type: 'dir', cat: 'build', desc: 'Vercel build cache' },

  // Caches
  { name: '.turbo', type: 'dir', cat: 'cache', desc: 'Turborepo cache' },
  { name: '.cache', type: 'dir', cat: 'cache', desc: 'Generic cache' },
  { name: '.parcel-cache', type: 'dir', cat: 'cache', desc: 'Parcel cache' },
  { name: '.vite', type: 'dir', cat: 'cache', desc: 'Vite cache' },
  { name: '.eslintcache', type: 'file', cat: 'cache', desc: 'ESLint cache' },
  { name: '.tsbuildinfo', type: 'file', cat: 'cache', desc: 'TS incremental build' },
  { name: '.stylelintcache', type: 'file', cat: 'cache', desc: 'Stylelint cache' },
  { name: '.prettiercache', type: 'file', cat: 'cache', desc: 'Prettier cache' },
  { name: 'tsconfig.tsbuildinfo', type: 'file', cat: 'cache', desc: 'TS build info' },

  // Test/coverage
  { name: 'coverage', type: 'dir', cat: 'test', desc: 'Test coverage reports' },
  { name: '.nyc_output', type: 'dir', cat: 'test', desc: 'NYC coverage data' },
  { name: 'storybook-static', type: 'dir', cat: 'test', desc: 'Storybook build' },

  // Python
  { name: '__pycache__', type: 'dir', cat: 'cache', desc: 'Python bytecode cache' },
  { name: '.pytest_cache', type: 'dir', cat: 'cache', desc: 'Pytest cache' },
  { name: '.mypy_cache', type: 'dir', cat: 'cache', desc: 'Mypy cache' },
  { name: '.ruff_cache', type: 'dir', cat: 'cache', desc: 'Ruff linter cache' },
  { name: 'venv', type: 'dir', cat: 'deps', desc: 'Python virtualenv' },
  { name: '.venv', type: 'dir', cat: 'deps', desc: 'Python virtualenv' },
  { name: '*.egg-info', type: 'pattern', cat: 'build', desc: 'Python egg info' },

  // Other languages
  { name: 'target', type: 'dir', cat: 'build', desc: 'Rust/Java build output' },
  { name: 'vendor', type: 'dir', cat: 'deps', desc: 'Go/PHP vendor deps' },
  { name: '.gradle', type: 'dir', cat: 'cache', desc: 'Gradle cache' },

  // Logs
  { name: 'npm-debug.log', type: 'file', cat: 'logs', desc: 'npm debug log' },
  { name: 'yarn-error.log', type: 'file', cat: 'logs', desc: 'Yarn error log' },
  { name: 'yarn-debug.log', type: 'file', cat: 'logs', desc: 'Yarn debug log' },
];

const IDE_CACHES = [
  { path: '.cursor', desc: 'Cursor IDE cache/data' },
  { path: '.vscode', desc: 'VS Code extensions/data' },
  { path: '.config/Code', desc: 'VS Code config/cache' },
  { path: '.config/Cursor', desc: 'Cursor config/cache' },
];

const { values: opts, positionals } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    clean: { type: 'boolean', short: 'c' },
    'max-depth': { type: 'string', short: 'd', default: '5' },
    'min-size': { type: 'string', short: 's', default: '1' },
    ide: { type: 'boolean', short: 'i' },
    'dry-run': { type: 'boolean', short: 'n' },
    sort: { type: 'string', default: 'size' },
    json: { type: 'boolean', short: 'j' },
    category: { type: 'string' },
    profile: { type: 'string', short: 'p' },
    yes: { type: 'boolean', short: 'y' },
  },
  allowPositionals: true,
  strict: false,
});

if (opts.version) {
  console.log(`dev-sweep v${VERSION}`);
  process.exit(0);
}

if (opts.help) {
  console.log(`
dev-sweep v${VERSION} - Find and clean dev artifacts eating your disk

Usage: dev-sweep [path] [options]

Options:
  -c, --clean        Delete found artifacts (interactive)
  -n, --dry-run      Show what would be deleted without deleting
  -d, --max-depth N  Max directory depth to scan (default: 5)
  -s, --min-size N   Min size in MB to report (default: 1)
  -i, --ide          Also scan IDE caches in home directory
  --sort TYPE        Sort by: size (default), name, type
  -j, --json         Output results as JSON
  --category CAT     Filter by category: deps, build, cache, test, logs
  -p, --profile MODE Profile: safe (deps+cache only) or aggressive (everything)
  -y, --yes          Skip confirmation prompts (use with --clean for automation)
  -v, --version      Show version
  -h, --help         Show this help

Profiles:
  safe         Only targets that are always regenerable: node_modules,
               .cache, __pycache__, venv, .turbo, etc. (deps + cache)
  aggressive   Everything: deps, caches, build output, coverage, logs.
               Use when you want to reclaim maximum space.

  Default (no profile): scans everything but doesn't filter by risk level.

Examples:
  dev-sweep                      Scan current directory
  dev-sweep ~/projects           Scan specific path
  dev-sweep --clean              Scan and offer to delete
  dev-sweep -p safe --clean      Only clean safe-to-delete artifacts
  dev-sweep -p safe -cy          Automated cleanup (no prompts, great for cron)
  dev-sweep -p aggressive        Show everything including build output
  dev-sweep --ide                Also check IDE caches
  dev-sweep --sort name          Sort alphabetically
  dev-sweep --json               Machine-readable output
  dev-sweep --category deps      Only show dependencies
  dev-sweep -s 0                 Show everything (no size filter)
`);
  process.exit(0);
}

const scanRoot = positionals[0] || process.cwd();
const maxDepth = parseInt(opts['max-depth'] || '5');
const minSizeMB = parseFloat(opts['min-size'] || '1');
const sortBy = opts.sort || 'size';
const filterCat = opts.category || null;
const profileName = opts.profile || null;
const profileCats = profileName === 'safe' ? SAFE_CATS : profileName === 'aggressive' ? AGGRESSIVE_CATS : null;
const isJSON = opts.json || false;

if (profileName && !['safe', 'aggressive'].includes(profileName)) {
  console.error(`Unknown profile: ${profileName}. Use "safe" or "aggressive".`);
  process.exit(1);
}

const targetNames = new Set(TARGETS.filter(t => t.type !== 'pattern').map(t => t.name));
const targetMap = Object.fromEntries(TARGETS.filter(t => t.type !== 'pattern').map(t => [t.name, t]));
const patternTargets = TARGETS.filter(t => t.type === 'pattern');

function matchesPattern(name) {
  for (const p of patternTargets) {
    const regex = new RegExp('^' + p.name.replace('*', '.*') + '$');
    if (regex.test(name)) return p;
  }
  return null;
}

async function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += await getDirSize(fullPath);
        } else {
          const s = await stat(fullPath);
          total += s.size;
        }
      } catch { /* permission denied */ }
    }
  } catch { /* permission denied */ }
  return total;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const found = [];
let dirsScanned = 0;

async function scan(dir, depth) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  dirsScanned++;

  for (const entry of entries) {
    const name = entry.name;

    // Check exact matches
    if (targetNames.has(name)) {
      const fullPath = join(dir, name);
      if (!isJSON) process.stderr.write(`\r\x1b[2mScanning: ${fullPath.substring(0, 80).padEnd(80)}\x1b[0m`);
      const size = entry.isDirectory() ? await getDirSize(fullPath) : (await stat(fullPath).catch(() => ({ size: 0 }))).size;
      const sizeMB = size / (1024 * 1024);
      const target = targetMap[name];
      const catMatch = (!filterCat || target.cat === filterCat) && (!profileCats || profileCats.has(target.cat));
      if (sizeMB >= minSizeMB && catMatch) {
        found.push({
          path: fullPath,
          size,
          sizeMB: Math.round(sizeMB * 10) / 10,
          desc: target.desc,
          name,
          category: target.cat,
        });
      }
      continue;
    }

    // Check pattern matches
    const patternMatch = matchesPattern(name);
    if (patternMatch && entry.isDirectory()) {
      const fullPath = join(dir, name);
      const size = await getDirSize(fullPath);
      const sizeMB = size / (1024 * 1024);
      const catMatch2 = (!filterCat || patternMatch.cat === filterCat) && (!profileCats || profileCats.has(patternMatch.cat));
      if (sizeMB >= minSizeMB && catMatch2) {
        found.push({
          path: fullPath,
          size,
          sizeMB: Math.round(sizeMB * 10) / 10,
          desc: patternMatch.desc,
          name,
          category: patternMatch.cat,
        });
      }
      continue;
    }

    // Skip hidden dirs unless they're targets
    if (name.startsWith('.') && !targetNames.has(name)) continue;

    if (entry.isDirectory()) {
      await scan(join(dir, name), depth + 1);
    }
  }
}

async function scanIDECaches() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return;

  for (const cache of IDE_CACHES) {
    const fullPath = join(home, cache.path);
    try {
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        if (!isJSON) process.stderr.write(`\r\x1b[2mScanning IDE: ${cache.desc.padEnd(60)}\x1b[0m`);
        const size = await getDirSize(fullPath);
        const sizeMB = size / (1024 * 1024);
        if (sizeMB >= minSizeMB) {
          found.push({
            path: fullPath,
            size,
            sizeMB: Math.round(sizeMB * 10) / 10,
            desc: cache.desc,
            name: basename(fullPath),
            category: 'ide',
            isIDE: true,
          });
        }
      }
    } catch { /* doesn't exist */ }
  }
}

function sortResults(results) {
  switch (sortBy) {
    case 'name':
      return results.sort((a, b) => a.path.localeCompare(b.path));
    case 'type':
      return results.sort((a, b) => a.category.localeCompare(b.category) || b.size - a.size);
    case 'size':
    default:
      return results.sort((a, b) => b.size - a.size);
  }
}

async function main() {
  if (!isJSON) {
    console.log(`\n\x1b[1mdev-sweep\x1b[0m v${VERSION}`);
    const profileLabel = profileName ? `, profile: ${profileName}` : '';
    console.log(`Scanning: ${scanRoot} (depth: ${maxDepth}${filterCat ? `, category: ${filterCat}` : ''}${profileLabel})\n`);
  }

  await scan(scanRoot, 0);
  if (opts.ide) await scanIDECaches();

  if (!isJSON) process.stderr.write('\r' + ' '.repeat(90) + '\r');

  sortResults(found);

  // JSON output
  if (isJSON) {
    const output = {
      version: VERSION,
      scanRoot,
      maxDepth,
      minSizeMB,
      dirsScanned,
      results: found.map(f => ({
        path: f.path,
        name: f.name,
        size: f.size,
        sizeMB: f.sizeMB,
        category: f.category,
        description: f.desc,
      })),
      total: {
        count: found.length,
        bytes: found.reduce((s, f) => s + f.size, 0),
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (found.length === 0) {
    console.log('\x1b[32m✓ Nothing found above the size threshold. Your disk is clean!\x1b[0m');
    return;
  }

  const totalSize = found.reduce((sum, f) => sum + f.size, 0);

  console.log(`Found \x1b[1m${found.length}\x1b[0m artifacts totaling \x1b[1;33m${formatSize(totalSize)}\x1b[0m:\n`);

  // Category colors
  const catColors = { deps: '36', build: '35', cache: '33', test: '34', logs: '31', ide: '37' };

  console.log('  SIZE        CAT     TYPE                     PATH');
  console.log('  ' + '\x1b[2m' + '-'.repeat(78) + '\x1b[0m');

  for (const f of found) {
    const sizeStr = formatSize(f.size).padStart(10);
    const catStr = `\x1b[${catColors[f.category] || '37'}m${(f.category || '').padEnd(7)}\x1b[0m`;
    const descStr = f.desc.padEnd(24);
    console.log(`  ${sizeStr}  ${catStr} ${descStr} ${f.path}`);
  }

  console.log(`\n  \x1b[1mTotal: ${formatSize(totalSize)} across ${found.length} items\x1b[0m`);
  console.log(`  \x1b[2m${dirsScanned} directories scanned\x1b[0m`);

  if (opts.clean || opts['dry-run']) {
    console.log('');
    if (opts['dry-run']) {
      console.log('\x1b[33mDry run — nothing will be deleted:\x1b[0m\n');
      for (const f of found) {
        console.log(`  Would delete: ${f.path} (${formatSize(f.size)})`);
      }
    } else {
      let cleaned = 0;
      let cleanedBytes = 0;

      if (opts.yes) {
        // Non-interactive: delete everything that matches
        for (const f of found) {
          if (f.isIDE) {
            console.log(`  \x1b[2mSKIP (IDE): ${f.path} — delete IDE caches manually\x1b[0m`);
            continue;
          }
          try {
            await rm(f.path, { recursive: true, force: true });
            console.log(`  \x1b[32m✓\x1b[0m ${f.path} (${formatSize(f.size)})`);
            cleaned++;
            cleanedBytes += f.size;
          } catch (e) {
            console.log(`  \x1b[31m✗\x1b[0m ${f.path}: ${e.message}`);
          }
        }
      } else {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q) => new Promise(r => rl.question(q, r));

        for (const f of found) {
          if (f.isIDE) {
            console.log(`  \x1b[2mSKIP (IDE): ${f.path} — delete IDE caches manually\x1b[0m`);
            continue;
          }
          const answer = await ask(`  Delete ${f.path} (${formatSize(f.size)})? [y/N] `);
          if (answer.toLowerCase() === 'y') {
            try {
              await rm(f.path, { recursive: true, force: true });
              console.log(`    \x1b[32m✓ Deleted\x1b[0m`);
              cleaned++;
              cleanedBytes += f.size;
            } catch (e) {
              console.log(`    \x1b[31m✗ Failed: ${e.message}\x1b[0m`);
            }
          } else {
            console.log(`    Skipped`);
          }
        }
        rl.close();
      }

      if (cleaned > 0) {
        console.log(`\n  \x1b[32m✓ Cleaned ${cleaned} items, freed ${formatSize(cleanedBytes)}\x1b[0m`);
      }
    }
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
