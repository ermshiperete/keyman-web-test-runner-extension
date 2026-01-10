import * as vscode from 'vscode';
import { TestController } from './testController';
import { TestRunner } from './testRunner';

// see also https://github.com/microsoft/vscode-extension-samples/blob/main/test-provider-sample
// and https://github.com/microsoft/vscode/tree/main/.vscode/extensions/vscode-selfhost-test-provider
// Documentation: https://code.visualstudio.com/api/extension-guides/testing
/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  // Public function - exported
  console.log('keyman-web-test-runner-extension is now active');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceRoot) {
    console.warn('No workspace folder found');
    return;
  }

  // Initialize test runner and controller
  const testRunner = new TestRunner(workspaceRoot);
  const testController = new TestController(workspaceRoot, testRunner);

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
}
