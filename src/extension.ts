import * as vscode from 'vscode';
import * as path from 'path';
import { TestExplorerProvider } from './testExplorer';
import { TestRunner } from './testRunner';

let testExplorer: TestExplorerProvider;
let testRunner: TestRunner;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('web-test-runner-extension is now active');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceRoot) {
    console.warn('No workspace folder found');
    return;
  }

  // Initialize test runner and explorer
  testRunner = new TestRunner(workspaceRoot);
  testExplorer = new TestExplorerProvider(workspaceRoot, testRunner);

  // Register tree data provider
  const treeDataProvider = vscode.window.registerTreeDataProvider(
    'webTestRunnerExplorer',
    testExplorer
  );
  context.subscriptions.push(treeDataProvider);

  // Register commands
  const runAllCmd = vscode.commands.registerCommand(
    'web-test-runner-extension.runAll',
    () => runAllTests()
  );
  context.subscriptions.push(runAllCmd);

  const refreshCmd = vscode.commands.registerCommand(
    'web-test-runner-extension.refreshTests',
    () => refreshTests()
  );
  context.subscriptions.push(refreshCmd);

  const runTestCmd = vscode.commands.registerCommand(
    'web-test-runner-extension.runTest',
    (item) => runTest(item)
  );
  context.subscriptions.push(runTestCmd);

  // Watch for file changes to refresh tests
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{test,spec}.{ts,js}');
  fileWatcher.onDidCreate(() => refreshTests());
  fileWatcher.onDidDelete(() => refreshTests());
  context.subscriptions.push(fileWatcher);

  // Initial load
  testExplorer.refresh();
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
  try {
    testRunner.showOutput();
    const result = await testRunner.runAllTests();

    if (result.passed) {
      vscode.window.showInformationMessage(`✓ All tests passed (${result.passedCount})`);
    } else if (result.failedCount > 0) {
      vscode.window.showErrorMessage(
        `✗ ${result.failedCount} test(s) failed, ${result.passedCount} passed`
      );
    } else {
      vscode.window.showWarningMessage('No tests found or execution error');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error running tests: ${errorMsg}`);
  }
}

/**
 * Run a specific test
 */
async function runTest(item: any): Promise<void> {
  try {
    if (!item || !item.filePath) {
      vscode.window.showErrorMessage('Invalid test item');
      return;
    }

    testRunner.showOutput();
    const result = await testRunner.runTestFile(item.filePath);

    if (result.passed) {
      vscode.window.showInformationMessage(`✓ Test passed`);
    } else if (result.failedCount > 0) {
      vscode.window.showErrorMessage(`✗ Test failed`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error running test: ${errorMsg}`);
  }
}

/**
 * Refresh test explorer
 */
async function refreshTests(): Promise<void> {
  try {
    await testExplorer.refresh();
    vscode.window.showInformationMessage('Tests refreshed');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error refreshing tests: ${errorMsg}`);
  }
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {}
