import * as vscode from 'vscode';
import { TestRunner } from './testRunner';
import { TestDiscovery } from './testDiscovery';

/**
 * Manages test discovery and execution using VS Code's Test Controller API
 */
export class TestController implements vscode.Disposable {
  private controller: vscode.TestController;
  private testRunner: TestRunner;
  private fileWatcher: vscode.FileSystemWatcher;
  private testDiscovery: TestDiscovery;

  public constructor(private workspaceRoot: string, testRunner: TestRunner) {
    this.testRunner = testRunner;
    this.controller = vscode.tests.createTestController('webTestRunner', 'Web Test Runner');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{test,tests,spec}.{ts,js}'
    );

    this.setupFileWatcher();
    this.setupTestController();

    this.testDiscovery = new TestDiscovery(this.workspaceRoot, this.controller, this.testRunner);
  }

  public async discoverTests(): Promise<void> {
    await this.testDiscovery.discoverTests();
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

            const tests = test.id.split('::');
            let file = tests[0].startsWith('file:') ? tests[0].substring(5) : tests[0];
            file = file.substring(this.workspaceRoot.length + 1);
            const fileRegex = /([a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+:\n/;
            const sections = result.output.match(fileRegex);
            if (sections) {
              let i = -1;
              for (const section of sections) {
                i++;
                if (section.includes(file)) {
                  console.log('Found file', i);
                  const parts = result.output.split(fileRegex);
                  const part = parts[i];
                  console.log('Part', part);
                }
              }
            }

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
   * Dispose resources
   */
  public dispose(): void {
    this.controller.dispose();
    this.fileWatcher.dispose();
  }
}
