import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestRunner } from './testRunner';
import { ConfigLoader } from './configLoader';

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
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{test,tests,spec}.{ts,js}');

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
  public async discoverTests(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return;
    }

    // Clear existing tests
    this.controller.items.replace([]);

    // Try to load from config file
    const configFiles = await ConfigLoader.findConfigFiles();
    configFiles.forEach(async configPath => {
      await this.discoverFromConfig(configPath, workspaceFolder);
    });
  }

  /**
   * Discover tests from web-test-runner.config.mjs
   */
  private async discoverFromConfig(configPath: string, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
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
          const files = await vscode.workspace.findFiles(
              filePattern,
              '**/node_modules/**'
          );
          for (const fileUri of files) {
            const testItem = this.controller.createTestItem(
              `test:${fileUri.path}`,
              path.basename(fileUri.path),
              fileUri
            );
            testItem.range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
            groupItem.children.add(testItem);
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
   * Discover tests by globbing filesystem
   */
  private async discoverFromGlob(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const patterns = ['**/*.test.ts', '**/*.test.js', '**/*.tests.ts', '**/*.tests.js', '**/*.spec.ts', '**/*.spec.js'];

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
