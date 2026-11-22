#!/usr/bin/env node
/**
 * install-local-sdk.mjs
 *
 * Installs the NavCore 2.0.0 local tarballs into a target project.
 * Used during development before the packages are published to npm.
 *
 * Usage:
 *   node scripts/install-local-sdk.mjs [--target <project-dir>]
 *
 * Default target: apps/navigation-poc
 *
 * What it does:
 *   1. Locates the navcore-sdk workspace (sibling of this repo).
 *   2. Runs `npm pack` on each of the 9 packages to produce tarballs.
 *   3. Installs the 3 mobile-relevant packages into the target project.
 *   4. Verifies that the installed versions are 2.0.0.
 *
 * IMPORTANT:
 *   - This script uses local tarballs only. It does not publish to npm.
 *   - The target's package.json is NOT modified. Use this for local testing only.
 *   - Revert by running `npm install` in the target project to restore from lockfile.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Locate SDK workspace — expected to be a sibling directory
const SDK_CANDIDATES = [
  path.resolve(REPO_ROOT, '..', 'navcore-sdk'),
  path.resolve(REPO_ROOT, '..', '..', 'navcore-sdk'),
];

const SDK_ROOT = SDK_CANDIDATES.find(p => fs.existsSync(path.join(p, 'package.json')));
if (!SDK_ROOT) {
  console.error('❌ Could not locate navcore-sdk directory. Expected it at:', SDK_CANDIDATES.join(' or '));
  process.exit(1);
}

const SDK_VERSION = '2.0.0';

// The 3 packages needed by the mobile POC
const MOBILE_PACKAGES = [
  '@ingissa/navcore-core',
  '@ingissa/navcore-react-native',
  '@ingissa/navcore-simulator',
];

// All 9 SDK packages (for verification)
const ALL_PACKAGES = [
  '@ingissa/navcore-core',
  '@ingissa/navcore-types',
  '@ingissa/navcore-react-native',
  '@ingissa/navcore-simulator',
  '@ingissa/navcore-headless',
  '@ingissa/navcore-maplibre',
  '@ingissa/navcore-mapbox',
  '@ingissa/navcore-leaflet',
  '@ingissa/navcore-google-maps',
];

// Parse --target argument
const targetArg = process.argv.indexOf('--target');
const TARGET_DIR = targetArg !== -1
  ? path.resolve(process.argv[targetArg + 1])
  : path.join(REPO_ROOT, 'apps', 'navigation-poc');

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`❌ Target directory does not exist: ${TARGET_DIR}`);
  process.exit(1);
}

console.log('='.repeat(70));
console.log('NavCore Local SDK Installer — v2.0.0 tarballs');
console.log('='.repeat(70));
console.log(`SDK root  : ${SDK_ROOT}`);
console.log(`Target    : ${TARGET_DIR}`);
console.log('');

// Step 1: Pack tarballs
console.log('📦 Step 1: Packing tarballs from SDK workspace...');
const tarballs = [];

for (const pkg of ALL_PACKAGES) {
  const shortName = pkg.replace('@ingissa/', '');
  const pkgDir = path.join(SDK_ROOT, 'packages', shortName.replace('navcore-', ''));

  // Fallback: search for the package by name
  const realDir = (() => {
    for (const dir of fs.readdirSync(path.join(SDK_ROOT, 'packages'))) {
      const pkgJson = path.join(SDK_ROOT, 'packages', dir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        const json = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        if (json.name === pkg) return path.join(SDK_ROOT, 'packages', dir);
      }
    }
    return null;
  })();

  if (!realDir) {
    console.warn(`  ⚠️  Package directory not found for ${pkg} — skipping`);
    continue;
  }

  const pkgJson = JSON.parse(fs.readFileSync(path.join(realDir, 'package.json'), 'utf8'));
  if (pkgJson.version !== SDK_VERSION) {
    console.error(`  ❌ ${pkg} version is ${pkgJson.version}, expected ${SDK_VERSION}`);
    process.exit(1);
  }

  try {
    const output = execSync(`npm pack --pack-destination "${REPO_ROOT}/scripts/.tarballs"`, {
      cwd: realDir,
      encoding: 'utf8',
    }).trim();
    const tarball = path.join(REPO_ROOT, 'scripts', '.tarballs', output.split('\n').pop().trim());
    tarballs.push({ pkg, tarball });
    console.log(`  ✅ ${pkg}@${SDK_VERSION}`);
  } catch (err) {
    console.error(`  ❌ Failed to pack ${pkg}:`, err.message);
    process.exit(1);
  }
}

// Step 2: Install mobile packages
console.log('');
console.log('📲 Step 2: Installing mobile packages into target...');
const mobileTarballs = tarballs.filter(t => MOBILE_PACKAGES.includes(t.pkg)).map(t => `"${t.tarball}"`);

if (mobileTarballs.length !== MOBILE_PACKAGES.length) {
  console.error('❌ Could not find all required mobile tarballs');
  process.exit(1);
}

try {
  execSync(`npm install --no-save ${mobileTarballs.join(' ')}`, {
    cwd: TARGET_DIR,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('❌ Installation failed:', err.message);
  process.exit(1);
}

// Step 3: Verify
console.log('');
console.log('🔍 Step 3: Verifying installed versions...');
let allOk = true;
for (const pkg of MOBILE_PACKAGES) {
  const nmPkgJson = path.join(TARGET_DIR, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!fs.existsSync(nmPkgJson)) {
    console.error(`  ❌ ${pkg} not found in node_modules`);
    allOk = false;
    continue;
  }
  const installed = JSON.parse(fs.readFileSync(nmPkgJson, 'utf8')).version;
  if (installed !== SDK_VERSION) {
    console.error(`  ❌ ${pkg} installed as ${installed}, expected ${SDK_VERSION}`);
    allOk = false;
  } else {
    console.log(`  ✅ ${pkg}@${installed}`);
  }
}

if (!allOk) process.exit(1);

console.log('');
console.log('='.repeat(70));
console.log(`✅ NavCore ${SDK_VERSION} local tarballs installed in: ${TARGET_DIR}`);
console.log('');
console.log('⚠️  REMINDER: The target package.json has NOT been modified.');
console.log('   These are local overrides for development only.');
console.log('   Restore with: cd <target> && npm install');
console.log('='.repeat(70));
