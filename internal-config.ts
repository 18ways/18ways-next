import type { WaysConfig } from './ways-config';

// This file is a typed fallback so TypeScript can resolve the subpath.
// Apps using withWays(...) alias this module to their local 18ways.config.ts at build time.
export const config = undefined as unknown as WaysConfig;

export default config;
