#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_APPS_DIR = path.join(__dirname, '..', 'test-apps');

interface CleanStats {
  app: string;
  cleaned: string[];
}

function log(message: string, color?: (str: string) => string) {
  console.log(color ? color(message) : message);
}

async function discoverTestApps(): Promise<string[]> {
  const apps: string[] = [];
  const entries = fs.readdirSync(TEST_APPS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(TEST_APPS_DIR, entry.name, 'app.config.json');
      if (fs.existsSync(configPath)) {
        apps.push(entry.name);
      }
    }
  }

  return apps;
}

function cleanApp(appName: string): CleanStats {
  const appPath = path.join(TEST_APPS_DIR, appName);
  const cleaned: string[] = [];

  // Paths to clean
  const pathsToClean = [
    { path: 'node_modules', name: 'dependencies' },
    { path: '.next', name: 'Next.js build' },
    { path: 'dist', name: 'dist build' },
    { path: '18ways.bundle.js', name: 'bundle' },
    { path: '18ways.bundle.js.map', name: 'bundle sourcemap' },
    { path: '.turbo', name: 'Turbo cache' },
  ];

  for (const { path: relativePath, name } of pathsToClean) {
    const fullPath = path.join(appPath, relativePath);
    if (fs.existsSync(fullPath)) {
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        cleaned.push(name);
      } catch (error: any) {
        log(`  Warning: Could not clean ${name}: ${error.message}`, chalk.yellow);
      }
    }
  }

  return { app: appName, cleaned };
}

async function cleanCache(): Promise<void> {
  log('🧹 Cleaning E2E Test Cache', chalk.bold.cyan);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const apps = await discoverTestApps();

  if (apps.length === 0) {
    log('No test apps found.', chalk.yellow);
    return;
  }

  log(`Found ${apps.length} test app(s):\n`, chalk.gray);

  const results: CleanStats[] = [];
  for (const app of apps) {
    log(`  Cleaning ${app}...`, chalk.gray);
    const result = cleanApp(app);
    results.push(result);

    if (result.cleaned.length > 0) {
      log(`    ✓ Removed: ${result.cleaned.join(', ')}`, chalk.green);
    } else {
      log(`    ↻ Already clean`, chalk.cyan);
    }
  }

  // Clean global test results
  const testResultsDir = path.join(__dirname, '..', 'test-results');
  if (fs.existsSync(testResultsDir)) {
    try {
      fs.rmSync(testResultsDir, { recursive: true, force: true });
      log(`\n  ✓ Removed test results`, chalk.green);
    } catch (error: any) {
      log(`\n  Warning: Could not clean test results: ${error.message}`, chalk.yellow);
    }
  }

  const playwrightReport = path.join(__dirname, '..', 'playwright-report');
  if (fs.existsSync(playwrightReport)) {
    try {
      fs.rmSync(playwrightReport, { recursive: true, force: true });
      log(`  ✓ Removed Playwright report`, chalk.green);
    } catch (error: any) {
      log(`  Warning: Could not clean Playwright report: ${error.message}`, chalk.yellow);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  log('✅ Cache cleaned successfully!\n', chalk.green.bold);
}

cleanCache().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
