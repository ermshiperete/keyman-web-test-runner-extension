import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Web Test Runner');
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }

  public showOutput(): void {
    this.outputChannel.show(true);
  }

  public log(message: string): void {
    this.outputChannel.appendLine(message);
  }

  public clear(): void {
    this.outputChannel.clear();
  }
}
