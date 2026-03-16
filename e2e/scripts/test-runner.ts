#!/usr/bin/env node

import { spawn, execSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import http from 'http';
import { startMockApiServer, stopMockApiServer, getMockApiPort } from '../utils/mock-api-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const E2E_ROOT = path.join(__dirname, '..');
const TEST_APPS_DIR = path.join(E2E_ROOT, 'test-apps');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ROOT_LOCKFILE_CANDIDATES = ['bun.lock', 'bun.lockb'];
const INPUT_MTIME_TOLERANCE_MS = 1000;
const IGNORED_INPUT_DIRECTORIES = new Set([
  '.e2e-trash',
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const latestMtimeCache = new Map<string, number>();
const USE_DYNAMIC_PROGRESS = process.stdout.isTTY && process.env.E2E_DYNAMIC_PROGRESS === '1';
const scheduledTrashCleanupPaths = new Set<string>();

// Track all running apps for cleanup on exit
const runningApps: TestApp[] = [];

// Track in-flight child processes so failed runs don't wait for sibling tasks to finish.
const activeChildProcesses = new Set<ChildProcess>();

// Track mock API server for cleanup
let mockApiServer: http.Server | null = null;

// Progress tracking for live updates
interface AppProgress {
  name: string;
  install: 'pending' | 'running' | 'done' | 'cached';
  build: 'pending' | 'running' | 'done' | 'cached';
  start: 'pending' | 'running' | 'done';
  test: 'pending' | 'running' | 'done';
  lineNumber: number;
  testSquares?: string[];
  lastRenderedState?: string;
}

interface TestProgressState {
  tests: Array<{
    title: string;
    status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
    error?: string;
  }>;
  failures: Array<{
    title: string;
    error: string;
    file?: string;
    line?: number;
  }>;
}

const appProgress = new Map<string, AppProgress>();
let progressStartLine = 0;

interface LocalDependencyEntry {
  name: string;
  protocol: 'file' | 'link';
  sourcePath: string;
}

const APP_TRASH_DIRNAME = '.e2e-trash';
const LOCAL_DEPENDENCY_PACKAGE_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'overrides',
] as const;

function formatProgressLine(progress: AppProgress): string {
  const steps = [
    { name: 'install', status: progress.install },
    { name: 'build', status: progress.build },
    { name: 'start', status: progress.start },
    { name: 'test', status: progress.test },
  ];

  const statusStr = steps
    .map(({ name, status }) => {
      if (name === 'test' && (status === 'running' || status === 'done')) {
        const squares = progress.testSquares || [];
        if (squares.length > 0) {
          return `${status === 'done' ? chalk.green('✓') : chalk.yellow('⋯')} test ${squares.join('')}`;
        }
      }
      if (status === 'done') return chalk.green(`✓ ${name}`);
      if (status === 'cached') return chalk.cyan(`↻ ${name}`);
      if (status === 'running') return chalk.yellow(`⋯ ${name}`);
      return chalk.gray(name);
    })
    .join(' → ');

  return `  ${chalk.bold(progress.name)}: ${statusStr}`;
}

function updateProgress(
  appName: string,
  step: 'install' | 'build' | 'start' | 'test',
  status: 'pending' | 'running' | 'done' | 'cached'
): void {
  const progress = appProgress.get(appName);
  if (!progress) return;

  progress[step] = status;
  const renderedState = formatProgressLine(progress);
  if (progress.lastRenderedState === renderedState) {
    return;
  }
  progress.lastRenderedState = renderedState;

  if (!USE_DYNAMIC_PROGRESS) {
    console.log(renderedState);
    return;
  }

  // Calculate how many lines to move up from current position
  const currentLine = progressStartLine; // Where cursor currently is (after all progress lines)
  const targetLine = progress.lineNumber; // Which app line to update
  const linesToMove = currentLine - targetLine;

  if (linesToMove > 0) {
    // Save cursor position
    process.stdout.write('\x1b7');

    // Move cursor up to the target line
    process.stdout.write(`\x1b[${linesToMove}A`);

    // Clear the entire line
    process.stdout.write('\x1b[2K\r');
    process.stdout.write(renderedState);

    // Restore cursor position
    process.stdout.write('\x1b8');
  }
}

interface TestApp {
  name: string;
  path: string;
  port: number;
  type: string;
  version?: string;
  buildCommand?: string;
  serveCommand?: string;
  devCommand?: string;
  process?: ChildProcess;
}

interface TestResult {
  app: string;
  success: boolean;
  duration: number;
  passed: number;
  failed: number;
  output?: string;
  failures?: Array<{
    title: string;
    error: string;
    file?: string;
    line?: number;
  }>;
}

function log(message: string, color?: (str: string) => string) {
  console.log(color ? color(message) : message);
}

function logPhase(phase: string) {
  console.log(`\n${chalk.bold.cyan(phase)}`);
}

function getRootLockfilePath(): string | null {
  for (const candidate of ROOT_LOCKFILE_CANDIDATES) {
    const lockfilePath = path.join(REPO_ROOT, candidate);
    if (fs.existsSync(lockfilePath)) {
      return lockfilePath;
    }
  }

  return null;
}

function getLocalPlaywrightExecutablePath(): string {
  return path.join(
    E2E_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
  );
}

function hasHarnessDependencies(): boolean {
  return (
    fs.existsSync(getLocalPlaywrightExecutablePath()) &&
    fs.existsSync(path.join(E2E_ROOT, 'node_modules', '@playwright', 'test', 'package.json'))
  );
}

async function ensureHarnessDependencies(): Promise<void> {
  if (hasHarnessDependencies()) {
    return;
  }

  log('  Installing E2E harness dependencies...', chalk.gray);

  return new Promise((resolve, reject) => {
    const bunProcess = spawn(
      'sh',
      ['-c', 'bun install --frozen-lockfile --silent || bun install --silent'],
      {
        cwd: E2E_ROOT,
        stdio: 'pipe',
      }
    );
    const untrack = trackChildProcess(bunProcess);

    let errorOutput = '';
    bunProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    bunProcess.on('close', (code) => {
      untrack();
      if (code === 0 && hasHarnessDependencies()) {
        resolve();
        return;
      }

      if (errorOutput) {
        console.log(errorOutput);
      }
      reject(new Error(`E2E harness bun install failed with code ${code ?? 'unknown'}`));
    });

    bunProcess.on('error', (error) => {
      untrack();
      reject(error);
    });
  });
}

function readPackageJson(packageJsonPath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as Record<string, any>;
}

function toNodeModulesPath(appPath: string, packageName: string): string {
  return path.join(appPath, 'node_modules', ...packageName.split('/'));
}

function collectLocalDependencyEntries(app: TestApp): LocalDependencyEntry[] {
  const packageJsonPath = path.join(app.path, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }

  const pkg = readPackageJson(packageJsonPath);
  const dependencyMaps = [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.optionalDependencies,
    pkg.overrides,
  ];
  const entries = new Map<string, string>();

  for (const dependencyMap of dependencyMaps) {
    if (!dependencyMap || typeof dependencyMap !== 'object') {
      continue;
    }

    for (const [name, version] of Object.entries(dependencyMap)) {
      if (typeof version !== 'string') {
        continue;
      }

      const protocol = version.startsWith('file:')
        ? 'file'
        : version.startsWith('link:')
          ? 'link'
          : null;
      if (!protocol) {
        continue;
      }

      entries.set(
        name,
        JSON.stringify({
          protocol,
          sourcePath: path.resolve(app.path, version.slice(`${protocol}:`.length)),
        })
      );
    }
  }

  return Array.from(entries, ([name, serialized]) => ({
    name,
    ...(JSON.parse(serialized) as Omit<LocalDependencyEntry, 'name'>),
  }));
}

function prepareExternalDependencyInstallManifest(app: TestApp): () => void {
  const packageJsonPath = path.join(app.path, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return () => {};
  }

  const originalContents = fs.readFileSync(packageJsonPath, 'utf-8');
  const originalStats = fs.statSync(packageJsonPath);
  const pkg = JSON.parse(originalContents) as Record<string, any>;
  let changed = false;

  for (const field of LOCAL_DEPENDENCY_PACKAGE_FIELDS) {
    const dependencyMap = pkg[field];
    if (!dependencyMap || typeof dependencyMap !== 'object') {
      continue;
    }

    const nextEntries = Object.entries(dependencyMap).filter(([, version]) => {
      return (
        typeof version !== 'string' ||
        (!version.startsWith('file:') && !version.startsWith('link:'))
      );
    });

    if (nextEntries.length === Object.keys(dependencyMap).length) {
      continue;
    }

    changed = true;
    if (nextEntries.length === 0) {
      delete pkg[field];
      continue;
    }

    pkg[field] = Object.fromEntries(nextEntries);
  }

  if (!changed) {
    return () => {};
  }

  // Bun can fail to install nested apps when linked packages contain workspace-local deps.
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;

    fs.writeFileSync(packageJsonPath, originalContents);
    fs.utimesSync(packageJsonPath, originalStats.atime, originalStats.mtime);
  };
}

function getLatestMtime(targetPath: string): number {
  const cached = latestMtimeCache.get(targetPath);
  if (cached !== undefined) {
    return cached;
  }

  if (!fs.existsSync(targetPath)) {
    latestMtimeCache.set(targetPath, 0);
    return 0;
  }

  const stats = fs.statSync(targetPath);
  let latestMtime = stats.mtimeMs;

  if (stats.isDirectory()) {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_INPUT_DIRECTORIES.has(entry.name)) {
        continue;
      }
      latestMtime = Math.max(latestMtime, getLatestMtime(path.join(targetPath, entry.name)));
    }
  }

  latestMtimeCache.set(targetPath, latestMtime);
  return latestMtime;
}

function getLatestMtimeForPaths(paths: string[]): number {
  return paths.reduce((latest, currentPath) => Math.max(latest, getLatestMtime(currentPath)), 0);
}

function getOldestDirectMtimeForPaths(paths: string[]): number | null {
  const existingPaths = paths.filter((currentPath) => fs.existsSync(currentPath));
  if (existingPaths.length !== paths.length) {
    return null;
  }

  return existingPaths.reduce((oldest, currentPath) => {
    const currentMtime = fs.statSync(currentPath).mtimeMs;
    return Math.min(oldest, currentMtime);
  }, Number.POSITIVE_INFINITY);
}

function getBuildInputPaths(app: TestApp): string[] {
  const localDependencyPaths = collectLocalDependencyEntries(app).map(
    ({ sourcePath }) => sourcePath
  );
  return [app.path, ...localDependencyPaths];
}

function getExpectedReadyMarker(app: TestApp): string {
  return `data-e2e-app="${app.name}"`;
}

function trackChildProcess(child: ChildProcess): () => void {
  activeChildProcesses.add(child);

  const untrack = () => {
    activeChildProcesses.delete(child);
  };

  child.once('close', untrack);
  child.once('exit', untrack);
  child.once('error', untrack);

  return untrack;
}

function stopChildProcess(child: ChildProcess): void {
  if (child.killed) {
    activeChildProcesses.delete(child);
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    activeChildProcesses.delete(child);
    return;
  }

  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore failures during forced shutdown.
      }
    }
  }, 1000);
}

function getExternalDependencyNames(app: TestApp): string[] {
  return getExternalDependencySpecs(app).map(([name]) => name);
}

function getExternalDependencySpecs(app: TestApp): Array<[string, string]> {
  const packageJsonPath = path.join(app.path, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }

  const pkg = readPackageJson(packageJsonPath);
  const dependencyMaps = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies];
  const names = new Set<string>();

  for (const dependencyMap of dependencyMaps) {
    if (!dependencyMap || typeof dependencyMap !== 'object') {
      continue;
    }

    for (const [name, version] of Object.entries(dependencyMap)) {
      if (typeof version !== 'string') {
        continue;
      }
      if (version.startsWith('file:') || version.startsWith('link:')) {
        continue;
      }
      names.add(JSON.stringify([name, version]));
    }
  }

  return Array.from(names, (entry) => JSON.parse(entry) as [string, string]);
}

function removePathIfExists(targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, {
    force: true,
    recursive: true,
  });
}

function movePathToTrash(app: TestApp, targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const trashRoot = path.join(app.path, APP_TRASH_DIRNAME);
  fs.mkdirSync(trashRoot, { recursive: true });

  const destinationPath = path.join(
    trashRoot,
    `${path.basename(targetPath)}-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
  );

  try {
    fs.renameSync(targetPath, destinationPath);
    scheduleTrashCleanup(destinationPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return;
    }

    // Fall back to recursive removal only if rename fails unexpectedly.
    removePathIfExists(targetPath);
  }
}

function scheduleTrashCleanup(targetPath: string): void {
  if (scheduledTrashCleanupPaths.has(targetPath)) {
    return;
  }

  scheduledTrashCleanupPaths.add(targetPath);
  try {
    const cleanupProcess = spawn('rm', ['-rf', targetPath], {
      detached: true,
      stdio: 'ignore',
    });
    cleanupProcess.unref();
  } catch {
    fs.rm(targetPath, { force: true, recursive: true }, () => {
      scheduledTrashCleanupPaths.delete(targetPath);
    });
    return;
  }
}

function scheduleExistingTrashCleanup(app: TestApp): void {
  const trashRoot = path.join(app.path, APP_TRASH_DIRNAME);
  if (!fs.existsSync(trashRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(trashRoot)) {
    scheduleTrashCleanup(path.join(trashRoot, entry));
  }
}

function discardInstalledDependency(app: TestApp, targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stats = fs.lstatSync(targetPath);
  if (stats.isSymbolicLink()) {
    fs.unlinkSync(targetPath);
    return;
  }

  movePathToTrash(app, targetPath);
}

function pruneLegacyNodeModules(app: TestApp): void {
  const nodeModulesPath = path.join(app.path, 'node_modules');
  scheduleExistingTrashCleanup(app);
  if (!fs.existsSync(nodeModulesPath)) {
    return;
  }

  const nodeModulesEntries = fs.readdirSync(nodeModulesPath);
  for (const entry of nodeModulesEntries) {
    if (!entry.startsWith('.old-')) {
      continue;
    }
    movePathToTrash(app, path.join(nodeModulesPath, entry));
  }

  for (const { name, protocol } of collectLocalDependencyEntries(app)) {
    if (protocol !== 'link') {
      continue;
    }

    const installedPath = toNodeModulesPath(app.path, name);
    if (!fs.existsSync(installedPath)) {
      continue;
    }

    const stats = fs.lstatSync(installedPath);
    if (!stats.isSymbolicLink()) {
      movePathToTrash(app, installedPath);
    }
  }
}

function ensureLinkedLocalDependencies(app: TestApp): void {
  for (const { name, protocol, sourcePath } of collectLocalDependencyEntries(app)) {
    if (protocol !== 'link') {
      continue;
    }

    const installedPath = toNodeModulesPath(app.path, name);
    const installedParentPath = path.dirname(installedPath);
    if (!fs.existsSync(installedParentPath)) {
      fs.mkdirSync(installedParentPath, { recursive: true });
    }

    if (fs.existsSync(installedPath)) {
      const stats = fs.lstatSync(installedPath);
      if (stats.isSymbolicLink()) {
        const currentTarget = fs.readlinkSync(installedPath);
        const resolvedTarget = path.resolve(path.dirname(installedPath), currentTarget);
        if (resolvedTarget === sourcePath) {
          continue;
        }
      }

      discardInstalledDependency(app, installedPath);
    }

    fs.symlinkSync(sourcePath, installedPath, 'dir');
  }
}

function hasSatisfiedExternalDependencies(app: TestApp): boolean {
  const dependencySpecs = getExternalDependencySpecs(app);
  if (dependencySpecs.length === 0) {
    return fs.existsSync(path.join(app.path, 'node_modules'));
  }

  return dependencySpecs.every(([name, versionSpec]) => {
    const installedPath = toNodeModulesPath(app.path, name);
    const installedPackageJsonPath = path.join(installedPath, 'package.json');
    if (!fs.existsSync(installedPackageJsonPath)) {
      return false;
    }

    if (!/^\d+\.\d+\.\d+(-.+)?$/.test(versionSpec)) {
      return true;
    }

    try {
      const installedPackageJson = readPackageJson(installedPackageJsonPath);
      return installedPackageJson.version === versionSpec;
    } catch {
      return false;
    }
  });
}

async function discoverTestApps(): Promise<TestApp[]> {
  const apps: TestApp[] = [];
  const entries = fs.readdirSync(TEST_APPS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(TEST_APPS_DIR, entry.name, 'app.config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        apps.push({
          ...config,
          name: entry.name,
          path: path.join(TEST_APPS_DIR, entry.name),
        });
      }
    }
  }

  return apps;
}

async function installDependencies(app: TestApp): Promise<void> {
  const packageJsonPath = path.join(app.path, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  updateProgress(app.name, 'install', 'running');
  pruneLegacyNodeModules(app);
  ensureLinkedLocalDependencies(app);

  if (hasSatisfiedExternalDependencies(app)) {
    updateProgress(app.name, 'install', 'cached');
    return;
  }

  const restoreInstallManifest = prepareExternalDependencyInstallManifest(app);

  return new Promise((resolve, reject) => {
    const bunProcess = spawn(
      'sh',
      ['-c', 'bun install --frozen-lockfile --silent || bun install --silent'],
      {
        cwd: app.path,
        stdio: 'pipe',
      }
    );
    const untrack = trackChildProcess(bunProcess);

    let errorOutput = '';
    bunProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    bunProcess.on('close', (code) => {
      untrack();
      restoreInstallManifest();
      if (code === 0) {
        ensureLinkedLocalDependencies(app);
        updateProgress(app.name, 'install', 'done');
        resolve();
      } else {
        log(`\n  ✗ ${app.name}: Install failed`, chalk.red);
        if (errorOutput) {
          console.log(errorOutput);
        }
        reject(new Error(`bun install failed with code ${code}`));
      }
    });

    bunProcess.on('error', (error) => {
      untrack();
      restoreInstallManifest();
      log(`\n  ✗ ${app.name}: ${error.message}`, chalk.red);
      reject(error);
    });
  });
}

async function buildApp(app: TestApp): Promise<void> {
  if (!app.buildCommand) {
    return;
  }

  updateProgress(app.name, 'build', 'running');

  try {
    let buildArtifacts: string[];
    if (app.type === 'nextjs') {
      // Next.js start requires more than BUILD_ID. Ensure required manifests exist.
      buildArtifacts = [
        path.join(app.path, '.next', 'BUILD_ID'),
        path.join(app.path, '.next', 'prerender-manifest.json'),
        path.join(app.path, '.next', 'routes-manifest.json'),
      ];
    } else if (app.type === 'react-vanilla') {
      buildArtifacts = [path.join(app.path, '18ways.bundle.js')];
    } else {
      buildArtifacts = [path.join(app.path, 'dist')];
    }

    const oldestBuildArtifactMtime = getOldestDirectMtimeForPaths(buildArtifacts);
    if (oldestBuildArtifactMtime !== null) {
      const latestBuildInputMtime = getLatestMtimeForPaths(getBuildInputPaths(app));
      if (oldestBuildArtifactMtime >= latestBuildInputMtime - INPUT_MTIME_TOLERANCE_MS) {
        updateProgress(app.name, 'build', 'cached');
        return;
      }
    }

    return new Promise((resolve, reject) => {
      const buildProcess = spawn('sh', ['-c', app.buildCommand!], {
        cwd: app.path,
        stdio: 'pipe',
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
          // Enable faster Next.js builds
          NEXT_PRIVATE_SKIP_VALIDATION: '1',
        },
      });
      const untrack = trackChildProcess(buildProcess);

      let output = '';
      let errorOutput = '';

      buildProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      buildProcess.on('close', (code) => {
        untrack();
        if (code === 0) {
          updateProgress(app.name, 'build', 'done');
          resolve();
        } else {
          log(`\n  ✗ ${app.name}: Build failed`, chalk.red);
          if (errorOutput) {
            log(`  Error output:`, chalk.gray);
            console.log(errorOutput);
          } else if (output) {
            log(`  Output:`, chalk.gray);
            console.log(output);
          }
          reject(new Error(`Build failed with code ${code}`));
        }
      });

      buildProcess.on('error', (error) => {
        untrack();
        log(`\n  ✗ ${app.name}: ${error.message}`, chalk.red);
        reject(error);
      });
    });
  } catch (error: any) {
    log(`\n  ✗ ${app.name}: Build setup failed`, chalk.red);
    throw error;
  }
}

async function waitForServer(app: TestApp, maxAttempts = 200): Promise<boolean> {
  const expectedReadyMarker = getExpectedReadyMarker(app);

  // Poll the app root and verify the expected marker is present.
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${app.port}`, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Unexpected status code ${res.statusCode}`));
              return;
            }

            if (!body.includes(expectedReadyMarker)) {
              reject(new Error('Expected app readiness marker not found'));
              return;
            }

            resolve();
          });
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return true;
    } catch {
      // Server not ready yet, wait a bit
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
}

async function startServer(app: TestApp): Promise<void> {
  if (!app.serveCommand) {
    return;
  }

  updateProgress(app.name, 'start', 'running');

  return new Promise((resolve, reject) => {
    const serverProcess = spawn(app.serveCommand!, {
      cwd: app.path,
      shell: true,
      stdio: 'pipe',
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: String(app.port),
        // Ensure SSR (server-side) translation requests hit the local mock API server.
        NEXT_PUBLIC_18WAYS_API_URL: `http://localhost:${getMockApiPort()}`,
      },
      // Ensure the spawned command runs in its own process group so we can reliably
      // terminate the whole tree (shell + node + any grandchildren) on cleanup.
      detached: true,
    });

    app.process = serverProcess;

    let output = '';
    let resolved = false;

    // Collect output for debugging
    serverProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });
    serverProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('error', (error) => {
      if (!resolved) {
        log(`  ✗ ${app.name}: ${error.message}`, chalk.red);
        reject(error);
      }
    });

    serverProcess.on('exit', (code) => {
      if (!resolved && code !== 0 && code !== null) {
        log(`  ✗ ${app.name}: Server exited with code ${code}`, chalk.red);
        if (output) {
          log(`  Server output:`, chalk.gray);
          console.log(output);
        }
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Use HTTP polling to detect when server is ready (much faster!)
    setTimeout(async () => {
      try {
        const ready = await waitForServer(app);
        if (ready && !resolved) {
          resolved = true;
          updateProgress(app.name, 'start', 'done');
          resolve();
        } else if (!resolved) {
          stopServer(app);
          log(`\n  ✗ ${app.name}: Server start timeout`, chalk.red);
          reject(new Error('Server start timeout'));
        }
      } catch (error: any) {
        if (!resolved) {
          stopServer(app);
          log(`\n  ✗ ${app.name}: ${error.message}`, chalk.red);
          reject(error);
        }
      }
    }, 1500); // Give server time to boot before polling
  });
}

function stopServer(app: TestApp): void {
  if (app.process) {
    try {
      // Kill the whole process group first (works on Linux/macOS).
      // This prevents orphaned servers keeping ports bound between runs.
      if (app.process.pid) {
        try {
          process.kill(-app.process.pid, 'SIGTERM');
        } catch {
          // Fallback to killing just the direct child
          app.process.kill('SIGTERM');
        }
      } else {
        app.process.kill('SIGTERM');
      }
      // Give it a moment to shut down gracefully
      setTimeout(() => {
        if (app.process && !app.process.killed) {
          if (app.process.pid) {
            try {
              process.kill(-app.process.pid, 'SIGKILL');
              return;
            } catch {
              // Fall through
            }
          }
          app.process.kill('SIGKILL');
        }
      }, 1000);
    } catch (error) {
      // Process might already be dead, that's fine
    }
    app.process = undefined;
  }
}

async function runPlaywrightTests(app: TestApp, suite?: string): Promise<TestResult> {
  updateProgress(app.name, 'test', 'running');
  const appProgressData = appProgress.get(app.name);
  if (appProgressData) {
    appProgressData.testSquares = undefined;
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    const testUrl = `http://localhost:${app.port}`;
    const resultFile = path.join(__dirname, '..', 'test-results', `${app.name}-results.json`);
    const progressFile = path.join(__dirname, '..', 'test-results', `${app.name}-progress.json`);
    let latestProgressData: TestProgressState | null = null;

    // Ensure test-results directory exists
    const resultsDir = path.join(__dirname, '..', 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Remove old result and progress files if they exist
    if (fs.existsSync(resultFile)) {
      fs.unlinkSync(resultFile);
    }
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
    }

    // Build playwright command args
    const playwrightArgs = ['playwright', 'test'];
    if (suite) {
      // Add the test file to run specific suite
      playwrightArgs.push(`tests/${suite}.test.ts`);
    }

    const playwright = spawn(getLocalPlaywrightExecutablePath(), playwrightArgs.slice(1), {
      cwd: E2E_ROOT,
      env: {
        ...process.env,
        TEST_APP_URL: testUrl,
        TEST_APP_NAME: app.name,
        TEST_APP_TYPE: app.type,
        PLAYWRIGHT_JSON_OUTPUT_FILE: resultFile,
        PLAYWRIGHT_PROGRESS_FILE: progressFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const untrack = trackChildProcess(playwright);

    // Poll progress file for real-time updates
    const progressInterval = setInterval(() => {
      try {
        if (fs.existsSync(progressFile)) {
          const progressData = JSON.parse(
            fs.readFileSync(progressFile, 'utf-8')
          ) as TestProgressState;
          latestProgressData = progressData;
          const squares = progressData.tests
            .filter((test) => test.status !== 'skipped') // Don't show skipped tests
            .map((test) => {
              if (test.status === 'passed') return chalk.green('■');
              if (test.status === 'failed') return chalk.red('■');
              if (test.status === 'running') return chalk.yellow('■');
              return chalk.gray('◻'); // pending
            });

          const appProgressData = appProgress.get(app.name);
          if (appProgressData) {
            appProgressData.testSquares = squares;
            updateProgress(app.name, 'test', 'running');
          }
        }
      } catch (e) {
        // Ignore parse errors during writing
      }
    }, 200); // Poll every 200ms

    let testOutput = '';
    playwright.stdout?.on('data', (data) => {
      testOutput += data.toString();
    });
    playwright.stderr?.on('data', (data) => {
      testOutput += data.toString();
    });

    playwright.on('close', (code) => {
      untrack();
      clearInterval(progressInterval);
      const duration = (Date.now() - startTime) / 1000;

      // Parse JSON output from file
      let passed = 0;
      let failed = 0;
      let output = '';
      let failures: Array<{ title: string; error: string; file?: string; line?: number }> = [];
      let success = code === 0;
      let reporterError: string | null = null;

      try {
        if (!fs.existsSync(resultFile)) {
          throw new Error(`Playwright JSON reporter did not write ${path.basename(resultFile)}`);
        }
        output = fs.readFileSync(resultFile, 'utf-8');
        const jsonOutput = JSON.parse(output);
        const suites = jsonOutput.suites || [];

        const countTests = (suite: any): void => {
          if (suite.specs) {
            suite.specs.forEach((spec: any) => {
              spec.tests?.forEach((test: any) => {
                const status = test.results?.[0]?.status;
                if (status === 'passed') {
                  passed++;
                } else if (
                  status === 'failed' ||
                  status === 'timedOut' ||
                  status === 'interrupted'
                ) {
                  failed++;
                }
                // Skip 'skipped' tests - don't count them
              });
            });
          }
          if (suite.suites) {
            suite.suites.forEach(countTests);
          }
        };

        suites.forEach(countTests);
      } catch (error: any) {
        reporterError = error?.message || 'Unknown Playwright reporter error';
        failed = Math.max(failed, 1);
        success = false;
        failures.push({
          title: 'Playwright runner output unavailable',
          error: reporterError,
        });
      }

      try {
        // Get failures from progress file and do final display update
        if (fs.existsSync(progressFile)) {
          const progressData = JSON.parse(
            fs.readFileSync(progressFile, 'utf-8')
          ) as TestProgressState;
          latestProgressData = progressData;
          const reporterFailures = progressData.failures || [];
          if (reporterFailures.length > 0) {
            failures = reporterFailures;
          }

          // Final update to show all test squares with correct colors
          const squares = progressData.tests
            .filter((test) => test.status !== 'skipped') // Don't show skipped tests
            .map((test) => {
              if (test.status === 'passed') return chalk.green('■');
              if (test.status === 'failed') return chalk.red('■');
              if (test.status === 'running') return chalk.yellow('■');
              return chalk.gray('◻'); // pending
            });

          const appProgressData = appProgress.get(app.name);
          if (appProgressData) {
            appProgressData.testSquares = squares;
          }
        }
      } catch (e) {
        if (reporterError === null) {
          failed = Math.max(failed, 1);
          success = false;
          failures.push({
            title: 'Playwright progress output unavailable',
            error: e instanceof Error ? e.message : 'Unknown Playwright progress error',
          });
        }
      }

      if (reporterError !== null) {
        if (latestProgressData) {
          passed = latestProgressData.tests.filter((test) => test.status === 'passed').length;
          failed = latestProgressData.tests.filter((test) => test.status === 'failed').length;
          failures = latestProgressData.failures || [];
          success = code === 0 && failed === 0;
          reporterError = null;
        } else if (code === 0) {
          passed = Math.max(appProgress.get(app.name)?.testSquares?.length || 0, 1);
          failed = 0;
          failures = [];
          success = true;
          reporterError = null;
        }
      }

      // Log test output if there were failures and DEBUG is set
      if (failed > 0 && process.env.DEBUG) {
        console.log(`\nTest output for ${app.name}:`);
        console.log(testOutput);
      }

      updateProgress(app.name, 'test', 'done');

      resolve({
        app: app.name,
        success,
        duration,
        passed,
        failed,
        output: testOutput,
        failures,
      });
    });
  });
}

function formatTestReport(results: TestResult[], totalDuration: number): boolean {
  console.log(`\n${chalk.bold.cyan('📊 E2E Test Report')}`);
  console.log('═══════════════════════════════════════════════════════════════');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    console.log(`\n${chalk.bold(result.app)}`);

    totalPassed += result.passed;
    totalFailed += result.failed;

    if (result.success) {
      log(`  ✓ ${result.passed} test(s) passed`, chalk.green);
    } else {
      log(`  ✗ ${result.failed} test(s) failed`, chalk.red);
      if (result.passed > 0) {
        log(`  ✓ ${result.passed} test(s) passed`, chalk.green);
      }

      // Display failure details
      if (result.failures && result.failures.length > 0) {
        console.log(chalk.red('\n  Failures:'));
        result.failures.forEach((failure, index) => {
          console.log(chalk.red(`\n  ${index + 1}. ${failure.title}`));
          if (failure.file && failure.line) {
            console.log(chalk.gray(`     ${failure.file}:${failure.line}`));
          }
          // Display first few lines of error message
          const errorLines = failure.error.split('\n').slice(0, 5);
          errorLines.forEach((line) => {
            console.log(chalk.gray(`     ${line}`));
          });
          if (failure.error.split('\n').length > 5) {
            console.log(chalk.gray(`     ... (truncated)`));
          }
        });
      }
    }

    log(`  Duration: ${result.duration.toFixed(2)}s`, chalk.gray);
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(chalk.bold('Summary:'));
  console.log(`  Total Apps:    ${results.length}`);
  console.log(`  Total Tests:   ${totalPassed + totalFailed}`);
  console.log(`  ${chalk.green(`Passed:        ${totalPassed}`)}`);
  if (totalFailed > 0) {
    console.log(`  ${chalk.red(`Failed:        ${totalFailed}`)}`);
  }
  console.log(`  Duration:      ${totalDuration.toFixed(2)}s`);

  console.log('═══════════════════════════════════════════════════════════════');

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log(`\n${chalk.green.bold('✅ All E2E Tests Passed!')}\n`);
  } else {
    console.log(`\n${chalk.red.bold('❌ Some E2E Tests Failed')}\n`);
  }

  return allPassed;
}

async function setupApp(app: TestApp, suite?: string): Promise<TestResult> {
  // Pipeline: install → build → start → test for this specific app
  await installDependencies(app);
  await buildApp(app);

  // For SSR hydration tests, use dev mode to see React hydration warnings
  // Use dev mode if:
  // 1. Running ssr-hydration suite specifically, OR
  // 2. Running all tests (suite is undefined) and this app has SSR hydration tests
  const needsDevMode =
    app.devCommand &&
    (suite === 'ssr-hydration' ||
      (suite === undefined &&
        fs.existsSync(path.join(__dirname, '../tests/ssr-hydration.test.ts'))));

  if (needsDevMode) {
    const originalServeCommand = app.serveCommand;
    app.serveCommand = app.devCommand;
    await startServer(app);
    app.serveCommand = originalServeCommand;
  } else {
    await startServer(app);
  }

  // Track this app for cleanup
  if (app.process) {
    runningApps.push(app);
  }

  // Run tests for this app
  return await runPlaywrightTests(app, suite);
}

// Cleanup function that can be called from anywhere
function cleanupAllServers(): void {
  if (runningApps.length > 0) {
    runningApps.forEach(stopServer);
    runningApps.length = 0; // Clear the array
  }
  if (activeChildProcesses.size > 0) {
    Array.from(activeChildProcesses).forEach(stopChildProcess);
    activeChildProcesses.clear();
  }
  if (mockApiServer) {
    mockApiServer.close();
    mockApiServer = null;
  }
}

// Set up signal handlers for graceful shutdown
let signalHandlersInstalled = false;
function installSignalHandlers(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;

  const cleanup = (signal: string) => {
    log(`\n\nReceived ${signal}, cleaning up...`, chalk.yellow);
    cleanupAllServers();
    process.exit(signal === 'SIGINT' ? 130 : 1);
  };

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  process.on('exit', () => {
    // Final cleanup on exit
    cleanupAllServers();
  });
}

interface TestOptions {
  app?: string;
  suite?: string;
  help?: boolean;
}

function showHelp() {
  console.log('\n📖 E2E Test Runner Usage\n');
  console.log('Usage:');
  console.log('  bun test                                    Run all tests on all apps');
  console.log('  bun test -- --app <app-name>                Run all tests on specific app');
  console.log('  bun test -- --suite <suite-name>            Run specific test suite on all apps');
  console.log('  bun test -- --app <app> --suite <suite>     Run specific suite on specific app');
  console.log('  bun test -- --help                          Show this help message\n');
  console.log('Options:');
  console.log('  --app, -a <name>      Filter to specific test app');
  console.log('  --suite, -s <name>    Filter to specific test suite');
  console.log('  --help, -h            Show this help message\n');
  console.log('Available test suites:');
  console.log('  - core');
  console.log('  - error-handling');
  console.log('  - loading-states');
  console.log('  - ssr-disabled');
  console.log('  - ssr-hydration\n');
  console.log('Examples:');
  console.log('  bun test -- --app nextjs-ssr-disabled');
  console.log('  bun test -- --suite core');
  console.log('  bun test -- --app nextjs-ssr-disabled --suite error-handling\n');
}

function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  const options: TestOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--app' || arg === '-a') {
      options.app = args[++i];
    } else if (arg === '--suite' || arg === '-s') {
      options.suite = args[++i];
    }
  }

  return options;
}

export async function runE2E(): Promise<boolean> {
  const startTime = Date.now();
  let apps: TestApp[] = [];
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return true;
  }

  installSignalHandlers();
  log('🚀 Starting E2E Test Suite', chalk.bold);

  // Start mock API server for all tests (handles both SSR and browser requests)
  try {
    mockApiServer = await startMockApiServer('success');
    log(`  ✓ Mock API server ready on port ${getMockApiPort()}`, chalk.green);
  } catch (error: any) {
    log(`  ✗ Failed to start mock API server: ${error.message}`, chalk.red);
    return false;
  }

  try {
    await ensureHarnessDependencies();

    logPhase('📦 Discovering test apps...');
    apps = await discoverTestApps();

    // Filter apps if --app flag is provided
    if (options.app) {
      const filteredApps = apps.filter((a) => a.name === options.app);
      if (filteredApps.length === 0) {
        log(`  ✗ Test app "${options.app}" not found!`, chalk.red);
        log('  Available apps:', chalk.gray);
        apps.forEach((app) => log(`    - ${app.name}`, chalk.gray));
        return false;
      }
      apps = filteredApps;
      log(`  Running tests for app: ${chalk.bold(options.app)}`, chalk.green);
    }

    if (apps.length === 0) {
      log('  No test apps found!', chalk.yellow);
      log('  Please create test apps in e2e/test-apps/', chalk.gray);
      return true; // Not a failure
    }

    if (!options.app) {
      log(`  Found ${apps.length} test app(s)`, chalk.green);
      apps.forEach((app) => {
        log(`    - ${app.name}${app.version ? ` (v${app.version})` : ''}`, chalk.gray);
      });
    }

    if (options.suite) {
      log(`  Running test suite: ${chalk.bold(options.suite)}`, chalk.cyan);
    }

    logPhase('⚡ Setting up test apps and running tests (pipelined in parallel)...');

    // Initialize progress tracking
    progressStartLine = 0;
    apps.forEach((app, index) => {
      appProgress.set(app.name, {
        name: app.name,
        install: 'pending',
        build: 'pending',
        start: 'pending',
        test: 'pending',
        lineNumber: index,
      });
      // Print initial state
      const progress = appProgress.get(app.name)!;
      progress.lastRenderedState = formatProgressLine(progress);
      console.log(progress.lastRenderedState);
    });

    // Track current cursor position as start
    progressStartLine = USE_DYNAMIC_PROGRESS ? apps.length : 0;

    // Run each app through its full pipeline in parallel
    // Each app: install → build → start → test
    // This is much faster than waiting for all apps to finish before starting tests!
    let testResults: TestResult[];
    try {
      testResults = await Promise.all(apps.map((app) => setupApp(app, options.suite)));
    } catch (error) {
      cleanupAllServers();
      throw error;
    }

    // Move cursor past all the progress lines
    console.log(); // Add a blank line after progress

    const duration = (Date.now() - startTime) / 1000;
    const allPassed = formatTestReport(testResults, duration);

    return allPassed;
  } catch (error: any) {
    log(`\n✗ E2E test run failed: ${error.message}`, chalk.red);
    return false;
  } finally {
    // ALWAYS clean up servers, even on error
    process.stdout.write(`\n${chalk.bold.cyan('Stopping servers...')}`);
    cleanupAllServers();

    // Give processes time to clean up gracefully
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log(chalk.green(' ✔️'));
  }
}
