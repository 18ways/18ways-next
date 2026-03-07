#!/usr/bin/env node

import { spawn, execSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import http from 'http';
import { startMockApiServer, stopMockApiServer, MOCK_API_PORT } from '../utils/mock-api-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_APPS_DIR = path.join(__dirname, '..', 'test-apps');

// Track all running apps for cleanup on exit
const runningApps: TestApp[] = [];

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

function updateProgress(
  appName: string,
  step: 'install' | 'build' | 'start' | 'test',
  status: 'pending' | 'running' | 'done' | 'cached'
): void {
  const progress = appProgress.get(appName);
  if (!progress) return;

  progress[step] = status;

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

    // Build status string
    const steps = [
      { name: 'install', status: progress.install },
      { name: 'build', status: progress.build },
      { name: 'start', status: progress.start },
      { name: 'test', status: progress.test },
    ];

    const statusStr = steps
      .map(({ name, status }) => {
        if (name === 'test' && (status === 'running' || status === 'done')) {
          // Show test squares for the test step
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

    process.stdout.write(`  ${chalk.bold(progress.name)}: ${statusStr}`);

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
  const nodeModulesPath = path.join(app.path, 'node_modules');

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  updateProgress(app.name, 'install', 'running');

  // Skip if node_modules exists and is current (optimization for rapid iteration)
  if (fs.existsSync(nodeModulesPath)) {
    const nodeModulesTime = fs.statSync(nodeModulesPath).mtime.getTime();
    const packageJsonTime = fs.statSync(packageJsonPath).mtime.getTime();

    // Skip if node_modules is newer than package.json, or within 1s older (timing tolerance)
    // Only reinstall if package.json has been modified AFTER node_modules
    if (nodeModulesTime >= packageJsonTime - 1000) {
      updateProgress(app.name, 'install', 'cached');
      return;
    }
  }

  return new Promise((resolve, reject) => {
    const bunProcess = spawn(
      'sh',
      ['-c', 'bun install --frozen-lockfile --silent || bun install --silent'],
      {
        cwd: app.path,
        stdio: 'pipe',
      }
    );

    let errorOutput = '';
    bunProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    bunProcess.on('close', (code) => {
      if (code === 0) {
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
    // Skip build if already built and fresh (optimization for rapid test iterations)
    const packageJsonPath = path.join(app.path, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
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

      const hasAllArtifacts = buildArtifacts.every((artifactPath) => fs.existsSync(artifactPath));
      if (hasAllArtifacts) {
        const buildTime = Math.min(
          ...buildArtifacts.map((artifactPath) => fs.statSync(artifactPath).mtime.getTime())
        );
        const packageTime = fs.statSync(packageJsonPath).mtime.getTime();

        // If build is current (within 1s tolerance), skip rebuild
        if (buildTime >= packageTime - 1000) {
          updateProgress(app.name, 'build', 'cached');
          return;
        }
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

      let output = '';
      let errorOutput = '';

      buildProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      buildProcess.on('close', (code) => {
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
        log(`\n  ✗ ${app.name}: ${error.message}`, chalk.red);
        reject(error);
      });
    });
  } catch (error: any) {
    log(`\n  ✗ ${app.name}: Build setup failed`, chalk.red);
    throw error;
  }
}

async function waitForServer(port: number, maxAttempts = 200): Promise<boolean> {
  // Poll HTTP endpoint to check if server is ready (much faster than waiting for log output)
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
          // Any response (even 404) means server is up
          resolve();
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
        NEXT_PUBLIC_18WAYS_API_URL: `http://localhost:${MOCK_API_PORT}`,
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
        const ready = await waitForServer(app.port);
        if (ready && !resolved) {
          resolved = true;
          updateProgress(app.name, 'start', 'done');
          resolve();
        } else if (!resolved) {
          serverProcess.kill();
          log(`\n  ✗ ${app.name}: Server start timeout`, chalk.red);
          reject(new Error('Server start timeout'));
        }
      } catch (error: any) {
        if (!resolved) {
          serverProcess.kill();
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

  return new Promise((resolve) => {
    const startTime = Date.now();
    const testUrl = `http://localhost:${app.port}`;
    const resultFile = path.join(__dirname, '..', 'test-results', `${app.name}-results.json`);
    const progressFile = path.join(__dirname, '..', 'test-results', `${app.name}-progress.json`);

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

    const playwright = spawn('bunx', playwrightArgs, {
      cwd: path.join(__dirname, '..'),
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

    // Poll progress file for real-time updates
    const progressInterval = setInterval(() => {
      try {
        if (fs.existsSync(progressFile)) {
          const progressData = JSON.parse(
            fs.readFileSync(progressFile, 'utf-8')
          ) as TestProgressState;
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
      clearInterval(progressInterval);
      const duration = (Date.now() - startTime) / 1000;

      // Parse JSON output from file
      let passed = 0;
      let failed = 0;
      let output = '';
      let failures: Array<{ title: string; error: string; file?: string; line?: number }> = [];

      try {
        if (fs.existsSync(resultFile)) {
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
        }

        // Get failures from progress file and do final display update
        if (fs.existsSync(progressFile)) {
          const progressData = JSON.parse(
            fs.readFileSync(progressFile, 'utf-8')
          ) as TestProgressState;
          failures = progressData.failures || [];

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
        // If JSON parsing fails, just use exit code
        if (code === 0) {
          passed = 1; // At least one test passed
        } else {
          failed = 1;
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
        success: code === 0,
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
    log(`  ✓ Mock API server started on port ${MOCK_API_PORT}`, chalk.green);
  } catch (error: any) {
    log(`  ✗ Failed to start mock API server: ${error.message}`, chalk.red);
    return false;
  }

  try {
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
      console.log(`  ${chalk.bold(app.name)}: ${chalk.gray('install → build → start → test')}`);
    });

    // Track current cursor position as start
    progressStartLine = apps.length;

    // Run each app through its full pipeline in parallel
    // Each app: install → build → start → test
    // This is much faster than waiting for all apps to finish before starting tests!
    const testResults = await Promise.all(apps.map((app) => setupApp(app, options.suite)));

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
