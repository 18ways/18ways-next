import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

interface TestProgress {
  title: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  error?: string;
}

interface ProgressState {
  tests: TestProgress[];
  failures: Array<{
    title: string;
    error: string;
    file?: string;
    line?: number;
  }>;
}

class ProgressReporter implements Reporter {
  private progressFile: string;
  private state: ProgressState = {
    tests: [],
    failures: [],
  };

  constructor(options?: { progressFile?: string }) {
    this.progressFile =
      options?.progressFile || path.join(process.cwd(), 'test-results', '.progress.json');
  }

  onBegin(config: FullConfig, suite: Suite) {
    // Collect all tests and pre-populate them as pending
    const collectTests = (suite: Suite) => {
      for (const child of suite.suites) {
        collectTests(child);
      }
      for (const test of suite.tests) {
        this.state.tests.push({
          title: test.title,
          status: 'pending',
        });
      }
    };

    collectTests(suite);
    this.writeProgress();
  }

  onTestBegin(test: TestCase) {
    const testProgress = this.state.tests.find((t) => t.title === test.title);
    if (testProgress) {
      testProgress.status = 'running';
      this.writeProgress();
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const testProgress = this.state.tests.find((t) => t.title === test.title);
    if (testProgress) {
      if (result.status === 'passed') {
        testProgress.status = 'passed';
      } else if (result.status === 'skipped') {
        // Remove skipped tests from the list entirely
        const index = this.state.tests.indexOf(testProgress);
        if (index > -1) {
          this.state.tests.splice(index, 1);
        }
      } else {
        testProgress.status = 'failed';

        // Extract error information
        const error = result.error?.message || result.error?.stack || 'Unknown error';
        testProgress.error = error;

        // Add to failures list
        this.state.failures.push({
          title: test.title,
          error,
          file: test.location?.file,
          line: test.location?.line,
        });
      }
      this.writeProgress();
    }
  }

  onEnd(result: FullResult) {
    // Final write
    this.writeProgress();
  }

  private writeProgress() {
    const dir = path.dirname(this.progressFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.progressFile, JSON.stringify(this.state, null, 2));
  }
}

export default ProgressReporter;
