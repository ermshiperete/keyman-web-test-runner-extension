import * as vscode from "vscode";
import { TestRunner } from "./testRunner";
import { TestDiscovery } from "./testDiscovery";
import { TestResultParser } from "./testResultParser";

/**
 * Manages test discovery and execution using VS Code's Test Controller API
 */
export class TestController implements vscode.Disposable {
  private controller: vscode.TestController;
  private testRunner: TestRunner;
  private fileWatcher: vscode.FileSystemWatcher;
  private testDiscovery: TestDiscovery;
  private testResultParser: TestResultParser;

  public constructor(private workspaceRoot: string, testRunner: TestRunner) {
    this.testRunner = testRunner;
    this.controller = vscode.tests.createTestController(
      "webTestRunner",
      "Web Test Runner"
    );
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.{test,tests,spec}.{ts,js}"
    );

    this.setupFileWatcher();
    this.setupTestController();

    this.testDiscovery = new TestDiscovery(
      this.workspaceRoot,
      this.controller,
      this.testRunner
    );
    this.testResultParser = new TestResultParser();
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

  private runFuncOnTest(
    test: vscode.TestItem,
    func: (test: vscode.TestItem, ...args: any[]) => void,
    args: any[] = []
  ): void {
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
    this.controller.resolveHandler = async (
      item: vscode.TestItem | undefined
    ) => {
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

          const filePath =
            test.id.startsWith("test:") || test.id.startsWith("file:")
              ? test.id.substring(5)
              : test.id;
          this.runFuncOnTest(test, run.started);

          try {
            const result = await this.testRunner.runTestFile(test, filePath);

            // Parse individual test results
            const parsedResults = this.testResultParser.parseTestResults(
              result.output
            );

            // If we found individual test results, update them
            if (parsedResults.size > 0) {
              this.updateTestItemResults(test, run, parsedResults);
              // Also mark parent test item
              if (result.passed) {
                run.passed(test);
              } else {
                run.failed(test, [
                  new vscode.TestMessage(
                    `Test failed: ${result.failedCount} failure(s)`
                  ),
                ]);
              }
            } else if (result.passed) {
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
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            run.errored(test, new vscode.TestMessage(errorMsg));
          }
        }
      } finally {
        run.end();
      }
    };

    this.controller.createRunProfile(
      "Web Test Runner",
      vscode.TestRunProfileKind.Run,
      runHandler,
      true
    );

    const debugHandler = async (
      request: vscode.TestRunRequest,
      cancellation: vscode.CancellationToken
    ) => {
      // Start web-test-runner in debug mode
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return;
      }

      // Execute the background task to start web-test-runner
      const tasks = await vscode.tasks.fetchTasks({ type: "shell" });
      const backgroundTask = tasks.find(
        (t) => t.name === "web: start dom-utils tests (background)"
      );

      if (backgroundTask) {
        await vscode.tasks.executeTask(backgroundTask);
        // Wait for server to start
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Launch Chrome debugger for web-test-runner
      await vscode.debug.startDebugging(workspaceFolder, {
        name: "Web Test Runner (Debug)",
        type: "pwa-chrome",
        request: "launch",
        url: "http://localhost:8000/",
        webRoot: workspaceFolder.uri.fsPath,
        runtimeArgs: [
          "--remote-debugging-port=9222",
          "--no-first-run",
          "--user-data-dir=${workspaceFolder}/.vscode/chrome-user-data",
        ],
      });

      // Run tests
      await runHandler(request, cancellation);
    };

    this.controller.createRunProfile(
      "Web Test Runner (Debug)",
      vscode.TestRunProfileKind.Debug,
      debugHandler,
      true
    );
  }

  /**
   * Update test item results based on parsed results
   */
  private updateTestItemResults(
    testItem: vscode.TestItem,
    run: vscode.TestRun,
    results: Map<string, { passed: boolean; message?: string }>
  ): void {
    // Check direct children
    for (const [, child] of testItem.children) {
      const testTitle = child.label;
      const result = results.get(testTitle);

      if (result) {
        if (result.passed) {
          run.passed(child);
        } else {
          const message = new vscode.TestMessage(
            result.message || "Test failed"
          );
          run.failed(child, [message]);
        }
      } else {
        // Recursively check nested items
        this.updateTestItemResults(child, run, results);
      }
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.controller.dispose();
    this.fileWatcher.dispose();
  }
}
