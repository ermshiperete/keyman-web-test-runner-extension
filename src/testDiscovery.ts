import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { HierarchicalReport, SuiteResult } from './mocha-reporter/hierarchical';
import { TestRunner } from './testRunner';
import { ConfigLoader } from './configLoader';
import { Logger } from './logger';

export class TestDiscovery {
  public constructor(
    private workspaceRoot: string,
    private controller: vscode.TestController,
    private testRunner: TestRunner,
    private logger: Logger
  ) {
    this.logger.log('Test discovery started');
  }

  /**
   * Discover test files and populate test tree
   */
  public async discoverTests(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      this.logger.log('Error: No workspace folder found');
      return;
    }

    // Clear existing tests
    this.controller.items.replace([]);

    // Try to load from config file
    const configFiles = await ConfigLoader.findConfigFiles();
    configFiles.forEach(async (configPath) => {
      await this.discoverFromConfig(configPath, workspaceFolder);
    });
  }

  /**
   * Discover tests from web-test-runner.config.mjs
   */
  private async discoverFromConfig(
    configPath: string,
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<void> {
    this.logger.log(`Discovering tests from config: ${configPath}`);
    const config = await ConfigLoader.loadConfig(configPath);

    // Process groups if they exist
    if (config.groups && config.groups.length > 0) {
      for (const group of config.groups) {
        const sourceFileUri = this.getSourceFileUri(workspaceFolder.uri);
        const groupItem = this.controller.createTestItem(
          `group:${group.name}`,
          group.name,
          sourceFileUri
        );
        groupItem.canResolveChildren = false;
        this.testRunner.addTest(groupItem, configPath);
        this.controller.items.add(groupItem);

        // Add test files to group
        await this.discoverTestsFromGroup(groupItem, configPath, group.files);
      }
    }

    if (config.files && config.files.length > 0) {
      // Process top-level files
      const sourceFileUri = this.getSourceFileUri(workspaceFolder.uri);
      const defaultGroup = this.controller.createTestItem(
        `group:default`,
        'Default',
        sourceFileUri
      );
      defaultGroup.canResolveChildren = false;
      this.testRunner.addTest(defaultGroup, configPath);
      this.controller.items.add(defaultGroup);

      await this.discoverTestsFromGroup(defaultGroup, configPath, config.files);
    }
  }

  private async discoverTestsFromGroup(
    groupItem: vscode.TestItem,
    configPath: string,
    files: string[]
  ): Promise<void> {
    for (const filePattern of files) {
      const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**');
      for (const fileUri of files) {
        const sourceFileUri = this.getSourceFileUri(fileUri);
        const testItem = this.controller.createTestItem(
          `file:${fileUri.path}`,
          path.basename(fileUri.path),
          sourceFileUri
        );
        testItem.range = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, 0)
        );
        groupItem.children.add(testItem);
        this.testRunner.addTest(testItem, configPath);

        // Discover tests from file using mocha with JsonHierarchicalReporter
        await this.discoverTestsFromFile(fileUri, testItem, configPath);
      }
    }
  }

  /**
   * Discover tests from a test file using mocha with JsonHierarchicalReporter
   */
  private async discoverTestsFromFile(
    fileUri: vscode.Uri,
    fileTestItem: vscode.TestItem,
    configPath: string
  ): Promise<void> {
    try {
      this.logger.log(`Discovering tests from ${fileUri.fsPath}`);
      const report = await this.runMochaForFile(fileUri.fsPath);
      if (report) {
        this.populateTestItemsFromReport(fileTestItem, report.root, configPath);
      } else {
        this.logger.log(`No tests found in ${fileUri.fsPath}`);
      }
    } catch (error) {
      this.logger.log(`Error: Failed to discover tests from ${fileUri.fsPath}: ${error}`);
    }
  }

  /**
   * Run mocha on a test file and get the hierarchical report
   */
  private async runMochaForFile(filePath: string): Promise<HierarchicalReport | null> {
    if (!filePath.endsWith('js')) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const args = ['mocha'];

        args.push('--dry-run');
        args.push('--reporter', path.join(__dirname, '../dist/mocha-reporter/hierarchical.js'));
        args.push('--require', path.join(__dirname, '../dist/node_modules/jsdom-global/register.js'));
        args.push(filePath);

        const process = cp.spawn('npx', args, {
          cwd: this.workspaceRoot,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        process.stdout?.on('data', (data) => {
          const text = data.toString();
          output += text;
        });

        process.stderr?.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
        });

        process.on('close', () => {
          // Extract JSON from output (mocha may print other text)
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const report = JSON.parse(jsonMatch[0]) as HierarchicalReport;
            resolve(report);
          } else {
            this.logger.log(`Running mocha ${args} exited with ${process.exitCode}`);
            this.logger.log(`Output: ${output}`);
            this.logger.log(`Error output: ${errorOutput}`);
            resolve(null);
          }
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.log(`Error running tests: ${errorMsg}`);
        resolve(null);
      }
    });
  }

  /**
   * Convert test file path to source file path
   * Replaces /build/ with /src/ and changes .mjs extension to .ts
   */
  private getSourceFileUri(testFileUri: vscode.Uri): vscode.Uri {
    // web/build/test/dom/cases/dom-utils/cookieSerializer.tests.mjs
    // web/src/test/auto/dom/cases/dom-utils/cookieSerializer.tests.ts
    let sourcePath = testFileUri.fsPath.replace('/build/test/', '/src/test/auto/');
    sourcePath = sourcePath.replace(/\.mjs$/, '.ts');
    return vscode.Uri.file(sourcePath);
  }

  /**
   * Populate test items from mocha hierarchical report
   */
  private populateTestItemsFromReport(
    parentItem: vscode.TestItem,
    reportItem: SuiteResult,
    configPath: string
  ): void {
    const sourceFileUri = this.getSourceFileUri(parentItem.uri!);

    if (reportItem.suites) {
      for (const suite of reportItem.suites) {
        const suiteItem = this.controller.createTestItem(
          `${parentItem.id}::${suite.title}`,
          suite.title,
          sourceFileUri
        );
        parentItem.children.add(suiteItem);
        this.testRunner.addTest(suiteItem, configPath);
        this.populateTestItemsFromReport(suiteItem, suite, configPath);
      }
    }

    if (!reportItem.tests) {
      return;
    }

    for (const test of reportItem.tests) {
      const childId = `${parentItem.id}::${test.title}`;
      const childTestItem = this.controller.createTestItem(
        childId,
        test.title,
        sourceFileUri
      );
      childTestItem.range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
      );
      parentItem.children.add(childTestItem);
      this.testRunner.addTest(childTestItem, configPath);
    }
  }
}
