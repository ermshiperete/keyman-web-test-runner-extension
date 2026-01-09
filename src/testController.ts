import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { TestRunner } from './testRunner';
import { ConfigLoader } from './configLoader';

interface TestItem {
  title: string;
  fullTitle: string;
  state?: 'passed' | 'failed' | 'pending';
  children?: TestItem[];
}

interface HierarchicalReport {
  stats: {
    suites: number;
    tests: number;
    passes: number;
    pending: number;
    failures: number;
    start?: string;
    end?: string;
    duration?: number;
  };
  root: TestItem;
}

/**
 * Manages test discovery and execution using VS Code's Test Controller API
 */
export class TestController implements vscode.Disposable {
  private controller: vscode.TestController;
  private testRunner: TestRunner;
  private workspaceRoot: string;
  private fileWatcher: vscode.FileSystemWatcher;

  public constructor(workspaceRoot: string, testRunner: TestRunner) {
    this.workspaceRoot = workspaceRoot;
    this.testRunner = testRunner;
    this.controller = vscode.tests.createTestController('webTestRunner', 'Web Test Runner');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{test,tests,spec}.{ts,js}'
    );

    this.setupFileWatcher();
    this.setupTestController();
  }

  /**
   * Setup file watcher to refresh tests on changes
   */
  private setupFileWatcher(): void {
    this.fileWatcher.onDidCreate(() => this.discoverTests());
    this.fileWatcher.onDidDelete(() => this.discoverTests());
    this.fileWatcher.onDidChange(() => this.discoverTests());
  }

  /**
   * Setup test controller handlers
   */
  private setupTestController(): void {
    // Refresh handler
    this.controller.refreshHandler = async () => {
      await this.discoverTests();
    };

    // Resolve handler
    this.controller.resolveHandler = async (item: vscode.TestItem | undefined) => {
      if (!item) {
        // Resolve root - discover all tests
        await this.discoverTests();
        return;
      }

      // Test item is already resolved
    };

    // Run handler
    const runHandler = async (
      request: vscode.TestRunRequest,
      cancellation: vscode.CancellationToken
    ) => {
      const run = this.controller.createTestRun(request);

      try {
        for (const test of request.include || []) {
          if (cancellation.isCancellationRequested) {
            break;
          }

          const filePath = test.id.startsWith('test:') ? test.id.substring(5) : test.id;
          run.started(test);

          try {
            const result = await this.testRunner.runTestFile(filePath);

            if (result.passed) {
              run.passed(test);
            } else {
              const message = new vscode.TestMessage(
                `Test failed: ${result.failedCount} failure(s)`
              );
              message.actualOutput = result.output;
              run.failed(test, [message]);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            run.errored(test, new vscode.TestMessage(errorMsg));
          }
        }
      } finally {
        run.end();
      }
    };

    this.controller.createRunProfile(
      'Web Test Runner',
      vscode.TestRunProfileKind.Run,
      runHandler,
      true
    );
  }

  /**
   * Discover test files and populate test tree
   */
  public async discoverTests(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
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
    console.log(`Discovering tests from config: ${configPath}`);
    const config = await ConfigLoader.loadConfig(configPath);

    // Process groups if they exist
    if (config.groups && config.groups.length > 0) {
      for (const group of config.groups) {
        const groupItem = this.controller.createTestItem(
          `group:${group.name}`,
          group.name,
          workspaceFolder.uri
        );
        groupItem.canResolveChildren = false;

        // Add test files to group
        for (const filePattern of group.files) {
          const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**');
          for (const fileUri of files) {
            const testItem = this.controller.createTestItem(
              `test:${fileUri.path}`,
              path.basename(fileUri.path),
              fileUri
            );
            testItem.range = new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, 0)
            );
            groupItem.children.add(testItem);

            // Discover tests from file using mocha with JsonHierarchicalReporter
            await this.discoverTestsFromFile(fileUri, testItem);
          }
        }

        this.controller.items.add(groupItem);
      }
    }

    if (config.files && config.files.length > 0) {
      // Process top-level files
      for (const filePath of config.files) {
        const fullPath = path.resolve(this.workspaceRoot, filePath);
        if (fs.existsSync(fullPath)) {
          const fileUri = vscode.Uri.file(fullPath);
          this.createTestItem(fileUri);
        }
      }
    }
  }

  /**
   * Discover tests from a test file using mocha with JsonHierarchicalReporter
   */
  private async discoverTestsFromFile(
    fileUri: vscode.Uri,
    fileTestItem: vscode.TestItem
  ): Promise<void> {
    try {
      const report = await this.runMochaForFile(fileUri.fsPath);
      if (report && report.root && report.root.children) {
        this.populateTestItemsFromReport(fileTestItem, report.root);
      }
    } catch (error) {
      console.error(`Failed to discover tests from ${fileUri.fsPath}:`, error);
    }
  }

  /**
   * Run mocha on a test file and get the hierarchical report
   */
  private runMochaForFile(filePath: string): Promise<HierarchicalReport | null> {
    return new Promise((resolve) => {
      try {
        const mochaPath = path.join(this.workspaceRoot, 'node_modules/.bin/mocha');
        const reporterPath = path.join(__dirname, '../out/mocha-reporter/json-hierarchical.js');

        const process = cp.spawn(
          'node',
          [mochaPath, '--dry-run', '--require', reporterPath, '--reporter', 'json-hierarchical', filePath],
          {
            cwd: this.workspaceRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );

        let output = '';
        let errorOutput = '';

        process.stdout?.on('data', (data) => {
          output += data.toString();
        });

        process.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });

        process.on('close', () => {
          try {
            // Extract JSON from output (mocha may print other text)
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const report = JSON.parse(jsonMatch[0]) as HierarchicalReport;
              resolve(report);
            } else {
              resolve(null);
            }
          } catch (parseError) {
            console.error(`Failed to parse mocha output:`, parseError);
            resolve(null);
          }
        });
      } catch (error) {
        console.error(`Failed to run mocha:`, error);
        resolve(null);
      }
    });
  }

  /**
   * Populate test items from mocha hierarchical report
   */
  private populateTestItemsFromReport(parentItem: vscode.TestItem, reportItem: TestItem): void {
    if (!reportItem.children) {
      return;
    }

    for (const child of reportItem.children) {
      const childId = `${parentItem.id}::${child.fullTitle}`;
      const childTestItem = this.controller.createTestItem(
        childId,
        child.title,
        parentItem.uri
      );
      childTestItem.range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
      );
      parentItem.children.add(childTestItem);

      // Recursively add nested suites
      if (child.children && child.children.length > 0) {
        this.populateTestItemsFromReport(childTestItem, child);
      }
    }
  }

  /**
   * Create a test item for a file
   */
  private createTestItem(file: vscode.Uri): void {
    const testId = `test:${file.fsPath}`;
    const label = path.basename(file.fsPath);
    if (label.endsWith('.js')) {
      const tsLabel = label.replace('.js', '.ts');
      for (const [id] of this.controller.items) {
        if (id.endsWith(tsLabel)) {
          // We already have a .ts file, so we don't need to add the .js file
          return;
        }
      }
    } else if (label.endsWith('.ts')) {
      const jsLabel = label.replace('.ts', '.js');
      for (const [id] of this.controller.items) {
        if (id.endsWith(jsLabel)) {
          // We prefer the .ts file
          this.controller.items.delete(id);
          break;
        }
      }
    }

    const testItem = this.controller.createTestItem(testId, label, file);
    testItem.range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

    this.controller.items.add(testItem);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.controller.dispose();
    this.fileWatcher.dispose();
  }
}
