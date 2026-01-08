import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestRunner } from './testRunner';

/**
 * Manages test discovery and execution using VS Code's Test Controller API
 */
export class TestController {
  private controller: vscode.TestController;
  private testRunner: TestRunner;
  private workspaceRoot: string;
  private fileWatcher: vscode.FileSystemWatcher;

  constructor(workspaceRoot: string, testRunner: TestRunner) {
    this.workspaceRoot = workspaceRoot;
    this.testRunner = testRunner;
    this.controller = vscode.tests.createTestController('webTestRunner', 'Web Test Runner');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{test,spec}.{ts,js}');

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
    const runHandler = async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
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
  async discoverTests(): Promise<void> {
    const patterns = ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return;
    }

    // Clear existing tests
    this.controller.items.replace([]);

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        '**/node_modules/**'
      );

      for (const file of files) {
        this.createTestItem(file);
      }
    }
  }

  /**
   * Create a test item for a file
   */
  private createTestItem(file: vscode.Uri): void {
    const relPath = path.relative(this.workspaceRoot, file.fsPath);
    const testId = `test:${file.fsPath}`;
    const label = path.basename(file.fsPath);

    const testItem = this.controller.createTestItem(testId, label, file);
    testItem.range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

    this.controller.items.add(testItem);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.controller.dispose();
    this.fileWatcher.dispose();
  }
}
