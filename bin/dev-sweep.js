#!/usr/bin/env node

import { readdir, stat, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseArgs } from 'node:util';

const TARGETS = [
  { name: 'node_modules', type: 'dir', desc: 'npm/yarn dependencies' },
  { name: '.next', type: 'dir', desc: 'Next.js build cache' },
  { name: '.nuxt', type: 'dir', desc: 'Nuxt build cache' },
  { name: '.turbo', type: 'dir', desc: 'Turborepo cache' },
  { name: 'dist', type: 'dir', desc: 'Build output' },
  { name: 'build', type: 'dir', desc: 'Build output' },
  { name: '.cache', type: 'dir', desc: 'Generic cache' },
  { name: '.parcel-cache', type: 'dir', desc: 'Parcel cache' },
  { name: '.vite', type: 'dir', desc: 'Vite cache' },
  { name: 'coverage', type: 'dir', desc: 'Test coverage reports' },
  { name: '.eslintcache', type: 'file', desc: 'ESLint cache' },
  { name: '.tsbuildinfo', type: 'file', desc: 'TypeScript incremental build' },
  { name: '__pycache__', type: 'dir', desc: 'Python bytecode cache' },
  { name: '.pytest_cache', type: 'dir', desc: 'Pytest cache' },
  { name: 'venv', type: 'dir', desc: 'Python virtual environment' },
  { name: '.venv', type: 'dir', desc: 'Python virtual environment' },
  { name: 'target', type: 'dir', desc: 'Rust/Java build output' },
];

// IDE-specific paths (check from home dir)
const IDE_CACHES = [
  { path: '.cursor', desc: 'Cursor IDE cache/data' },
  { path: '.vscode', desc: 'VS Code extensions/data' },
  { path: '.config/Code', desc: 'VS Code config/cache' },
  { path: '.config/Cursor', desc: 'Cursor config/cache' },
];

const { values: opts, positionals } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
    clean: { type: 'boolean', short: 'c' },
    'max-depth': { type: 'string', short: 'd', default: '5' },
    'min-size': { type: 'string', short: 's', default: '1' },
    'ide': { type: 'boolean', short: 'i' },
    'dry-run': { type: 'boolean', short: 'n' },
  },
  allowPositionals: true,
  strict: false,
});

if (opts.help) {
  console.log(`
dev-sweep - Find and clean dev artifacts eating your disk

Usage: dev-sweep [path] [options]

Options:
  -c, --clean      Delete found artifacts (interactive)
  -n, --dry-run    Show what would be deleted without deleting
  -d, --max-depth  Max directory depth to scan (default: 5)
  -s, --min-size   Min size in MB to report (default: 1)
  -i, --ide        Also scan IDE caches in home directory
  -h, --help       Show this help

Examples:
  dev-sweep                  Scan current directory
  dev-sweep ~/projects       Scan specific path
  dev-sweep --clean          Scan and offer to delete
  dev-sweep --ide            Also check IDE caches
`);
  process.exit(0);
}

const scanRoot = positionals[0] || process.cwd();
const maxDepth = parseInt(opts['max-depth'] || '5');
const minSizeMB = parseFloat(opts['min-size'] || '1');
const targetNames = new Set(TARGETS.map(t => t.name));
const targetMap = Object.fromEntries(TARGETS.map(t => [t.name, t]));

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
      } catch { /* permission denied, etc */ }
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

async function scan(dir, depth) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.') && !targetNames.has(name)) continue;

    if (targetNames.has(name)) {
      const fullPath = join(dir, name);
      process.stderr.write(`\rScanning: ${fullPath.substring(0, 80).padEnd(80)}`);
      const size = entry.isDirectory() ? await getDirSize(fullPath) : (await stat(fullPath).catch(() => ({ size: 0 }))).size;
      const sizeMB = size / (1024 * 1024);
      if (sizeMB >= minSizeMB) {
        found.push({
          path: fullPath,
          size,
          sizeMB,
          desc: targetMap[name]?.desc || name,
          name,
        });
      }
      continue; // don't recurse into matched dirs
    }

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
        process.stderr.write(`\rScanning IDE: ${cache.desc.padEnd(60)}`);
        const size = await getDirSize(fullPath);
        const sizeMB = size / (1024 * 1024);
        if (sizeMB >= minSizeMB) {
          found.push({
            path: fullPath,
            size,
            sizeMB,
            desc: cache.desc,
            name: basename(fullPath),
            isIDE: true,
          });
        }
      }
    } catch { /* doesn't exist */ }
  }
}

async function main() {
  console.log(`\ndev-sweep v0.1.0`);
  console.log(`Scanning: ${scanRoot} (max depth: ${maxDepth})\n`);

  await scan(scanRoot, 0);

  if (opts.ide) {
    await scanIDECaches();
  }

  process.stderr.write('\r' + ' '.repeat(90) + '\r');

  if (found.length === 0) {
    console.log('Nothing found above the size threshold. Your disk is clean!');
    return;
  }

  // Sort by size descending
  found.sort((a, b) => b.size - a.size);

  const totalSize = found.reduce((sum, f) => sum + f.size, 0);

  console.log(`Found ${found.length} artifacts totaling ${formatSize(totalSize)}:\n`);
  console.log('  SIZE       TYPE                    PATH');
  console.log('  ' + '-'.repeat(76));

  for (const f of found) {
    const sizeStr = formatSize(f.size).padStart(10);
    const descStr = f.desc.padEnd(23);
    console.log(`  ${sizeStr}  ${descStr} ${f.path}`);
  }

  console.log(`\n  Total: ${formatSize(totalSize)} across ${found.length} items`);

  if (opts.clean || opts['dry-run']) {
    console.log('');
    if (opts['dry-run']) {
      console.log('Dry run — nothing will be deleted.');
      for (const f of found) {
        console.log(`  Would delete: ${f.path} (${formatSize(f.size)})`);
      }
    } else {
      // Interactive cleanup
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q) => new Promise(r => rl.question(q, r));

      for (const f of found) {
        if (f.isIDE) {
          console.log(`  SKIP (IDE): ${f.path} — delete IDE caches manually`);
          continue;
        }
        const answer = await ask(`  Delete ${f.path} (${formatSize(f.size)})? [y/N] `);
        if (answer.toLowerCase() === 'y') {
          try {
            await rm(f.path, { recursive: true, force: true });
            console.log(`    ✓ Deleted`);
          } catch (e) {
            console.log(`    ✗ Failed: ${e.message}`);
          }
        } else {
          console.log(`    Skipped`);
        }
      }
      rl.close();
    }
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
