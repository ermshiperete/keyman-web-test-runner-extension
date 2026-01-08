import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a test group from the config
 */
export interface TestGroup {
  name: string;
  files: string[];
  tests?: string[];
}

/**
 * Represents the loaded web-test-runner configuration
 */
export interface WebTestRunnerConfig {
  groups?: TestGroup[];
  files?: string[];
  rootDir?: string;
}

/**
 * Loads and parses web-test-runner.config.mjs
 */
export class ConfigLoader {
  /**
   * Find config file in workspace
   */
  static findConfigFile(workspaceRoot: string): string | null {
    const configNames = [
      'web-test-runner.config.mjs',
      'web-test-runner.config.js',
      'web-test-runner.config.ts'
    ];

    for (const name of configNames) {
      const configPath = path.join(workspaceRoot, name);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return null;
  }

  /**
   * Load configuration from file
   * Note: This does a simple regex-based parse since we can't execute the config file directly
   */
  static loadConfig(configPath: string): WebTestRunnerConfig {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return this.parseConfig(content);
    } catch (error) {
      console.error('Error loading config:', error);
      return {};
    }
  }

  /**
   * Parse config content (regex-based extraction)
   */
  private static parseConfig(content: string): WebTestRunnerConfig {
    const config: WebTestRunnerConfig = {};

    // Extract groups array
    const groupsMatch = content.match(/groups\s*:\s*\[([\s\S]*?)\]/);
    if (groupsMatch) {
      config.groups = this.parseGroups(groupsMatch[1]);
    }

    // Extract files array (top-level)
    const filesMatch = content.match(/files\s*:\s*\[([\s\S]*?)\]/);
    if (filesMatch && !groupsMatch) {
      // Only use top-level files if no groups are defined
      config.files = this.parseArray(filesMatch[1]);
    }

    // Extract rootDir
    const rootDirMatch = content.match(/rootDir\s*:\s*['"`](.*?)['"`]/);
    if (rootDirMatch) {
      config.rootDir = rootDirMatch[1];
    }

    return config;
  }

  /**
   * Parse groups from config
   */
  private static parseGroups(groupsContent: string): TestGroup[] {
    const groups: TestGroup[] = [];

    // Match each group object
    const groupRegex = /\{\s*name\s*:\s*['"`](.*?)['"`],\s*files\s*:\s*\[([\s\S]*?)\]/g;
    let match;

    while ((match = groupRegex.exec(groupsContent)) !== null) {
      const name = match[1];
      const files = this.parseArray(match[2]);

      groups.push({
        name,
        files
      });
    }

    return groups;
  }

  /**
   * Parse array from config content
   */
  private static parseArray(content: string): string[] {
    const items: string[] = [];
    const itemRegex = /['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = itemRegex.exec(content)) !== null) {
      items.push(match[1]);
    }

    return items;
  }
}
