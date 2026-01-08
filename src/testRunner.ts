import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

/**
 * Test run result
 */
export interface TestRunResult {
  passed: boolean;
  testCount: number;
  passedCount: number;
  failedCount: number;
  output: string;
  errors: string[];
}

/**
 * Manages running web-test-runner tests
 */
export class TestRunner {
  private outputChannel: vscode.OutputChannel;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = vscode.window.createOutputChannel('Web Test Runner');
  }

  /**
   * Show output channel
   */
  showOutput(): void {
    this.outputChannel.show(true);
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<TestRunResult> {
    this.outputChannel.clear();
    this.outputChannel.appendLine('Running all tests...\n');

    return this.executeWtr(undefined);
  }

  /**
   * Run a specific test file
   */
  async runTestFile(filePath: string): Promise<TestRunResult> {
    this.outputChannel.clear();
    this.outputChannel.appendLine(`Running test: ${path.basename(filePath)}\n`);

    return this.executeWtr(filePath);
  }

  /**
   * Run a specific test
   */
  async runSingleTest(filePath: string, testName: string): Promise<TestRunResult> {
    this.outputChannel.clear();
    this.outputChannel.appendLine(`Running test: ${testName}\n`);

    return this.executeWtr(filePath, testName);
  }

  /**
   * Execute web-test-runner command
   */
  private executeWtr(
    filePath?: string,
    testName?: string
  ): Promise<TestRunResult> {
    return new Promise((resolve) => {
      try {
        const args = ['web-test-runner'];

        if (filePath) {
          args.push(filePath);
        }

        if (testName) {
          args.push('--grep', testName);
        }

        args.push('--node-resolve', '--coverage');

        const process = cp.spawn('npx', args, {
          cwd: this.workspaceRoot,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        process.stdout?.on('data', (data) => {
          const text = data.toString();
          output += text;
          this.outputChannel.append(text);
        });

        process.stderr?.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          this.outputChannel.append(text);
        });

        process.on('close', (code) => {
          const result = this.parseOutput(output, errorOutput, code === 0);
          resolve(result);
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`\nError running tests: ${errorMsg}`);
        resolve({
          passed: false,
          testCount: 0,
          passedCount: 0,
          failedCount: 0,
          output: '',
          errors: [errorMsg]
        });
      }
    });
  }

  /**
   * Parse web-test-runner output
   */
  private parseOutput(
    output: string,
    errorOutput: string,
    success: boolean
  ): TestRunResult {
    const errors: string[] = [];

    // Basic parsing of output
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);

    const passedCount = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failedCount = failMatch ? parseInt(failMatch[1], 10) : 0;
    const testCount = passedCount + failedCount;

    if (errorOutput) {
      errors.push(errorOutput);
    }

    if (failedCount > 0) {
      errors.push(`${failedCount} test(s) failed`);
    }

    return {
      passed: success && failedCount === 0,
      testCount,
      passedCount,
      failedCount,
      output,
      errors
    };
  }
}
