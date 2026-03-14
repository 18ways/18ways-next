import { chromium, Browser, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { routeHandlerDescriptions, RouteHandlerName } from '../utils/route-handlers.js';
import { startMockApiServer, stopMockApiServer, MOCK_API_PORT } from '../utils/mock-api-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_APPS_DIR = path.join(__dirname, '..', 'test-apps');

interface TestApp {
  name: string;
  path: string;
  port: number;
  type: string;
  serveCommand?: string;
  devCommand?: string;
}

interface DebugOptions {
  scenario?: RouteHandlerName;
  list?: boolean;
  app?: string;
}

function parseArgs(): DebugOptions {
  const args = process.argv.slice(2);
  const options: DebugOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--list' || arg === '-l') {
      options.list = true;
    } else if (arg === '--scenario' || arg === '-s') {
      options.scenario = args[++i] as RouteHandlerName;
    } else if (arg === '--app' || arg === '-a') {
      options.app = args[++i];
    }
  }

  return options;
}

function listScenarios() {
  console.log('\n📋 Available scenarios:\n');
  Object.entries(routeHandlerDescriptions).forEach(([name, description]) => {
    console.log(`  ${name.padEnd(20)} - ${description}`);
  });
  console.log('\nUsage:');
  console.log('  bun run debug:e2e -- --scenario <name> [--app <app-name>]');
  console.log('  bun run debug:e2e -- --scenario spanishFails');
  console.log('  bun run debug:e2e -- --scenario networkFailure --app nextjs-ssr-disabled\n');
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

async function waitForServer(port: number, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
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
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return false;
}

async function ensureDependencies(app: TestApp): Promise<void> {
  const packageJsonPath = path.join(app.path, 'package.json');
  const nodeModulesPath = path.join(app.path, 'node_modules');

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  // Check if node_modules exists and is current
  if (fs.existsSync(nodeModulesPath)) {
    const nodeModulesTime = fs.statSync(nodeModulesPath).mtime.getTime();
    const packageJsonTime = fs.statSync(packageJsonPath).mtime.getTime();

    // Skip if node_modules is current
    if (nodeModulesTime >= packageJsonTime - 1000) {
      console.log(`✓ Dependencies already installed`);
      return;
    }
  }

  console.log(`📦 Installing dependencies for ${app.name}...`);

  return new Promise((resolve, reject) => {
    const bunProcess = spawn('bun', ['install', '--silent'], {
      cwd: app.path,
      stdio: 'inherit',
    });

    bunProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✓ Dependencies installed`);
        resolve();
      } else {
        reject(new Error(`bun install failed with code ${code}`));
      }
    });

    bunProcess.on('error', (error) => {
      reject(error);
    });
  });
}

async function startTestApp(app: TestApp): Promise<ChildProcess | null> {
  if (!app.devCommand) {
    console.log(`⚠️  App ${app.name} has no dev command, assuming it's already running`);
    return null;
  }

  // Ensure dependencies are installed first
  await ensureDependencies(app);

  console.log(`🚀 Starting ${app.name} on port ${app.port} in dev mode...`);

  const serverProcess = spawn(app.devCommand, {
    cwd: app.path,
    shell: true,
    stdio: 'pipe',
    env: { ...process.env, PORT: String(app.port) },
  });

  let output = '';
  let startupFailed = false;
  let failureReason = '';

  console.log(`\n${'='.repeat(60)}`);
  console.log('📋 Server Logs:');
  console.log('='.repeat(60));

  serverProcess.stdout?.on('data', (data) => {
    const chunk = data.toString();
    output += chunk;
    process.stdout.write(chunk);
  });

  serverProcess.stderr?.on('data', (data) => {
    const chunk = data.toString();
    output += chunk;
    process.stderr.write(chunk);

    // Check for common startup failures
    if (chunk.includes('EADDRINUSE') || chunk.includes('address already in use')) {
      startupFailed = true;
      failureReason = `Port ${app.port} is already in use`;
    } else if (chunk.includes('Failed to start server')) {
      startupFailed = true;
      failureReason = 'Server failed to start';
    }
  });

  serverProcess.on('error', (error) => {
    console.error(`❌ Failed to start app: ${error.message}`);
    startupFailed = true;
    failureReason = error.message;
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      startupFailed = true;
      if (!failureReason) {
        failureReason = `Server exited with code ${code}`;
      }
    }
  });

  // Give the server a moment to fail or start outputting
  await new Promise((r) => setTimeout(r, 500));

  if (startupFailed) {
    console.error(`❌ ${failureReason}`);
    console.log('\nServer output:');
    console.log(output);
    serverProcess.kill();
    process.exit(1);
  }

  const ready = await waitForServer(app.port, 60);

  if (!ready) {
    console.error(`❌ Server failed to start within timeout`);
    console.log('Server output:', output);
    serverProcess.kill();
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`✅ ${app.name} is ready at http://localhost:${app.port}`);
  console.log('📋 Server logs will continue to appear below...\n');
  return serverProcess;
}

async function runDebugSession(app: TestApp, scenario: RouteHandlerName) {
  console.log(`🔍 Debug session`);
  console.log(`   App:      ${app.name}`);
  console.log(`   Scenario: ${scenario}`);
  console.log(`   Mode:     Development (hot reload)`);
  console.log(`   ${routeHandlerDescriptions[scenario]}\n`);

  // Start mock API server for SSR and browser requests
  const mockApiServer = await startMockApiServer(scenario as any);
  console.log(`🔧 Mock API server ready on port ${MOCK_API_PORT}`);

  const serverProcess = await startTestApp(app);

  const browser: Browser = await chromium.launch({
    headless: false,
    devtools: true,
  });

  const context = await browser.newContext();
  const page: Page = await context.newPage();

  const testUrl = `http://localhost:${app.port}`;
  console.log(`🌐 Navigating to: ${testUrl}`);
  console.log(`\n✨ Browser window opened - interact with the app to test the scenario`);
  console.log(`   Press Ctrl+C to exit\n`);

  try {
    await page.goto(testUrl, { timeout: 0 });
    console.log('📍 Page loaded. Keep the browser window open to continue debugging.');
    console.log('   Close the browser window or press Ctrl+C when done.\n');

    // Wait indefinitely for browser to close
    await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
  } finally {
    await browser.close();
    if (serverProcess) {
      console.log('\n🛑 Stopping server...');
      serverProcess.kill('SIGTERM');
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
      }, 1000);
    }
    console.log('🛑 Stopping mock API server...');
    await stopMockApiServer(mockApiServer);
  }
}

async function main() {
  const options = parseArgs();

  if (options.list) {
    listScenarios();
    return;
  }

  if (!options.scenario) {
    console.error('\n❌ Error: --scenario is required\n');
    listScenarios();
    process.exit(1);
  }

  if (!routeHandlerDescriptions[options.scenario]) {
    console.error(`\n❌ Error: Unknown scenario "${options.scenario}"\n`);
    listScenarios();
    process.exit(1);
  }

  const apps = await discoverTestApps();
  if (apps.length === 0) {
    console.error('\n❌ Error: No test apps found in test-apps/\n');
    process.exit(1);
  }

  let selectedApp: TestApp | undefined;

  if (options.app) {
    selectedApp = apps.find((a) => a.name === options.app);
    if (!selectedApp) {
      console.error(`\n❌ Error: Test app "${options.app}" not found\n`);
      console.log('Available apps:');
      apps.forEach((app) => console.log(`  - ${app.name}`));
      console.log();
      process.exit(1);
    }
  } else {
    selectedApp = apps[0];
    if (apps.length > 1) {
      console.log(`\n📱 Multiple apps available, using: ${selectedApp.name}`);
      console.log('   Use --app <name> to select a different app\n');
    }
  }

  await runDebugSession(selectedApp, options.scenario);
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
