#!/usr/bin/env node

import { runE2E } from './test-runner.js';

runE2E()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
