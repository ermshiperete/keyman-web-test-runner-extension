import * as vscode from 'vscode';
import { TestController } from './testController';
import { TestRunner } from './testRunner';

let testController: TestController;
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

  // Initialize test runner and controller
  testRunner = new TestRunner(workspaceRoot);
  testController = new TestController(workspaceRoot, testRunner);

  // Add to subscriptions for cleanup
  context.subscriptions.push(testController);
  context.subscriptions.push(testRunner);

  // Initial test discovery
  testController.discoverTests();
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  if (testController) {
    testController.dispose();
  }

  if (testRunner) {
    testRunner.dispose();
  }
}
