import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestRunner } from './testRunner';

/**
 * Represents a test file or test suite
 */
export interface TestItem {
  id: string;
  label: string;
  description?: string;
  type: 'file' | 'suite' | 'test';
  children?: TestItem[];
  filePath?: string;
  line?: number;
}

/**
 * Test Explorer provider for displaying and managing tests
 */
export class TestExplorerProvider implements vscode.TreeDataProvider<TestItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TestItem | undefined | null | void> =
    new vscode.EventEmitter<TestItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TestItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private testRunner: TestRunner;
  private workspaceRoot: string;
  private testFiles: Map<string, TestItem> = new Map();

  constructor(workspaceRoot: string, testRunner: TestRunner) {
    this.workspaceRoot = workspaceRoot;
    this.testRunner = testRunner;
  }

  /**
   * Refresh the test tree
   */
  async refresh(): Promise<void> {
    await this.discoverTests();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Discover test files in the workspace
   */
  private async discoverTests(): Promise<void> {
    this.testFiles.clear();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return;
    }

    const patterns = ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'];

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

      for (const file of files) {
        const relPath = path.relative(workspaceFolder.uri.fsPath, file.fsPath);
        const testItem: TestItem = {
          id: relPath,
          label: path.basename(file.fsPath),
          type: 'file',
          filePath: file.fsPath,
          children: []
        };

        this.testFiles.set(relPath, testItem);
      }
    }
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: TestItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.children && element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = element.description;
    treeItem.contextValue = element.type;
    treeItem.iconPath = this.getIconPath(element.type);

    if (element.type === 'test' && element.filePath) {
      treeItem.command = {
        command: 'vscode.open',
        title: 'Open Test',
        arguments: [
          vscode.Uri.file(element.filePath),
          {
            selection: element.line ? new vscode.Range(element.line, 0, element.line, 0) : undefined
          }
        ]
      };
    }

    return treeItem;
  }

  /**
   * Get children for tree item
   */
  async getChildren(element?: TestItem): Promise<TestItem[]> {
    if (!element) {
      // Return root items (test files)
      await this.discoverTests();
      return Array.from(this.testFiles.values());
    }

    // Return children of expanded item
    return element.children || [];
  }

  /**
   * Get icon path based on test type
   */
  private getIconPath(type: 'file' | 'suite' | 'test'): vscode.ThemeIcon | undefined {
    switch (type) {
      case 'file':
        return new vscode.ThemeIcon('symbol-file');
      case 'suite':
        return new vscode.ThemeIcon('symbol-namespace');
      case 'test':
        return new vscode.ThemeIcon('debug-dot');
      default:
        return undefined;
    }
  }

  /**
   * Get test item by ID
   */
  getTestItem(id: string): TestItem | undefined {
    return this.testFiles.get(id);
  }

  /**
   * Get all test files
   */
  getTestFiles(): TestItem[] {
    return Array.from(this.testFiles.values());
  }
}
