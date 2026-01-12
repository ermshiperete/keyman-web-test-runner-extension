import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Logger } from './logger';

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
  private workspaceRoot: string;
  private testItemToConfigMap: Map<string, string> = new Map();

  public constructor(workspaceRoot: string, private logger: Logger) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Run all tests
   */
  public async runAllTests(test: vscode.TestItem): Promise<TestRunResult> {
    this.logger.clear();
    this.logger.log('Running all tests...\n');

    return this.executeWebTestRunner(test);
  }

  /**
   * Run a specific test file
   */
  public async runTestFile(test: vscode.TestItem, filePath: string): Promise<TestRunResult> {
    this.logger.clear();
    this.logger.log(`Running test: ${path.basename(filePath)}\n`);

    return this.executeWebTestRunner(test, filePath);
  }

  /**
   * Run a specific test
   */
  public async runSingleTest(test: vscode.TestItem, testName: string): Promise<TestRunResult> {
    this.logger.clear();
    this.logger.log(`Running test: ${testName}\n`);

    return this.executeWebTestRunner(test, undefined, testName);
  }

  public addTest(test: vscode.TestItem, configPath: string): void {
    this.testItemToConfigMap.set(test.id, configPath);
  }

  private getGroup(test: vscode.TestItem | undefined): string {
    if (!test) {
      return '';
    }
    if (test.id.startsWith('group:')) {
      return test.id.substring(6);
    }
    return this.getGroup(test.parent);
  }
  /**
   * Execute web-test-runner command
   */
  private executeWebTestRunner(
    test: vscode.TestItem,
    filePath?: string,
    testName?: string
  ): Promise<TestRunResult> {
    return new Promise((resolve) => {
      try {
        const args = ['web-test-runner'];

        if (this.testItemToConfigMap.has(test.id)) {
          args.push('--config', this.testItemToConfigMap.get(test.id)!);
        }

        const group = this.getGroup(test);
        if (group) {
          args.push('--group', group);
        }

        // if (filePath) {
        //   args.push('--files', filePath);
        // }

        // if (testName) {
        //   args.push('--grep', testName);
        // }

        // args.push('--node-resolve', '--coverage');

        const process = cp.spawn('npx', args, {
          cwd: this.workspaceRoot,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        process.stdout?.on('data', (data) => {
          const text = data.toString();
          output += text;
          this.logger.log(text);
        });

        process.stderr?.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          this.logger.log(text);
        });

        process.on('close', (code) => {
          const result = this.parseOutput(output, errorOutput, code === 0);
          resolve(result);
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.log(`\nError running tests: ${errorMsg}`);
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

    // Find the test run
    const runningTestsSplits = output.split(/Running tests.../g);
    if (!runningTestsSplits) {
      return {
        passed: false,
        testCount: 0,
        passedCount: 0,
        failedCount: 0,
        output,
        errors: ['Test run not found']
      };
    }

    const lastOutput = runningTestsSplits.at(-1);
    if (!lastOutput) {
      return {
        passed: false,
        testCount: 0,
        passedCount: 0,
        failedCount: 0,
        output,
        errors: ['Test run not found']
      };
    }

    // Basic parsing of output
    const passMatch = lastOutput.match(/(\d+) passed/);
    const failMatch = lastOutput.match(/(\d+) failed/);

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
