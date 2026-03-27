import type { WaysConfig } from './ways-config';

export declare const WAYS_CONFIG_FILENAMES: readonly string[];
export declare const findWaysConfigFile: (projectRoot: string) => string | null;
export declare const loadWaysConfigFromProjectRoot: (projectRoot: string) => {
  config: WaysConfig;
  configFile: string;
  projectRoot: string;
};
export declare const resolveRealpath: (targetPath: string) => string;
