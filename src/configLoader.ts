import * as fs from 'fs';
import * as vscode from 'vscode';

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
  public static async findConfigFiles(): Promise<string[]> {
    // const files = await vscode.workspace.findFiles(
    //   '**/web-test-runner.config.mjs',
    //   '**/node_modules/**'
    // );
    const files = await vscode.workspace.findFiles(
      'web/src/test/auto/dom/web-test-runner.config.mjs',
      '**/node_modules/**'
    );

    return files.map(file => file.fsPath);
  }

  /**
   * Load configuration from file
   */
  public static async loadConfig(configPath: string): Promise<WebTestRunnerConfig> {
    try {
      const config = await import(configPath);
      return config.default;
    } catch (error) {
      console.error('Error loading config:', error);
      return {};
    }
  }
}
