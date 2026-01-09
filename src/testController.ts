import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';
import { TestRunner } from './testRunner';
import { ConfigLoader } from './configLoader';
import { SuiteResult } from './mocha-reporter/hierarchical';
import { discoverTestsWithMocha } from './testDiscovery';

/**
 * Manages test discovery and execution using VS Code's Test Controller API
 */
export class TestController implements vscode.Disposable {
  private controller: vscode.TestController;
  private testRunner: TestRunner;
  private workspaceRoot: string;
  private fileWatcher: vscode.FileSystemWatcher;
  private mocha: Mocha;

  public constructor(workspaceRoot: string, testRunner: TestRunner) {
    this.workspaceRoot = workspaceRoot;
    this.testRunner = testRunner;
    this.controller = vscode.tests.createTestController('webTestRunner', 'Web Test Runner');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{test,tests,spec}.{ts,js}'
    );

    this.setupFileWatcher();
    this.setupTestController();

    this.mocha = new Mocha({ reporterOptions: { dryRun: true } });
  }

  /**
   * Setup file watcher to refresh tests on changes
   */
  private setupFileWatcher(): void {
    this.fileWatcher.onDidCreate(() => this.discoverTests());
    this.fileWatcher.onDidDelete(() => this.discoverTests());
    this.fileWatcher.onDidChange(() => this.discoverTests());
  }

  private runFuncOnTest(test: vscode.TestItem, func: (test: vscode.TestItem, ...args: any[]) => void, args: any[] = []): void {
    func(test, ...args);
    test.children.forEach((child) => this.runFuncOnTest(child, func, args));
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
        let allTests: vscode.TestItem[];
        if (request.include && request.include.length > 0) {
          allTests = Array.from(request.include);
        } else {
          allTests = Array.from(this.controller.items).map(([, test]) => test);
          for (const test of allTests) {
            this.runFuncOnTest(test, run.started);
          }
        }

        for (const test of allTests) {
          if (cancellation.isCancellationRequested) {
            break;
          }

          const filePath = (test.id.startsWith('test:') || test.id.startsWith('file:')) ? test.id.substring(5) : test.id;
          this.runFuncOnTest(test, run.started);

          try {
            const result = await this.testRunner.runTestFile(test, filePath);

            if (result.passed) {
              this.runFuncOnTest(test, run.passed);
            } else {
              const message = new vscode.TestMessage(
                `Test failed: ${result.failedCount} failure(s)`
              );
              message.actualOutput = result.output;
              if (test.children.size === 1) {
                this.runFuncOnTest(test, run.failed, [message]);
              } else {
                run.failed(test, [message]);
              }
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

    this.controller.createRunProfile(
      'Web Test Runner (Debug)',
      vscode.TestRunProfileKind.Debug,
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
      const report = await this.runMochaForFile(fileUri.fsPath);
      if (report) {
        // this.populateTestItemsFromReport(fileTestItem, report.root, configPath);
      }
    } catch (error) {
      console.error(`Failed to discover tests from ${fileUri.fsPath}:`, error);
    }
  }

  /**
   * Run mocha on a test file and get the hierarchical report
   */
  private async runMochaForFile(filePath: string): Promise<string> {
    if (!filePath.endsWith('js')) {
      return '';
    }

    return await discoverTestsWithMocha(this.workspaceRoot, filePath);
    // console.log(`*** Running mocha for ${filePath}`);
    // return new Promise((resolve) => {
    //   this.mocha.reporter(HierarchicalReporter, {
    //     setResult: (r: HierarchicalReport) => {
    //       console.log(`*** Mocha result for ${filePath}:`, JSON.stringify(r, null, 2));
    //       resolve(r);
    //     }
    //   });
    //   // this.mocha.unloadFiles();
    //   this.mocha.addFile(filePath);
    //   this.mocha.run(() => {
    //     console.log(`*** Mocha run complete without result for ${filePath}`);
    //     resolve(null);
    //   });
    // });
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
    if (!reportItem.tests) {
      return;
    }

    const sourceFileUri = this.getSourceFileUri(parentItem.uri!);

    for (const test of reportItem.tests) {
      const childId = `${parentItem.id}::${test.fullTitle}`;
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

    const sourceFileUri = this.getSourceFileUri(file);
    const testItem = this.controller.createTestItem(testId, label, sourceFileUri);
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
