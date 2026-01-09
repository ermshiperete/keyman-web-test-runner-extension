import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export function discoverTestsWithMocha(workspace: string, file: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const args = ['mocha'];

      args.push('--dry-run');
      args.push('--reporter', path.join(__dirname, '../out/mocha-reporter/hierarchical.js'));
      args.push('--require', path.join(__dirname, '../node_modules/jsdom-global/register.js'));
      args.push(file);

      const process = cp.spawn('npx', args, {
        cwd: workspace,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      process.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
      });

      process.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
      });

      process.on('close', (code) => {
        // const result = this.parseOutput(output, errorOutput, code === 0);
        // resolve(result);
        console.log(output);
        console.log(errorOutput);
        resolve('');
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error running tests: ${errorMsg}`);
      resolve('');
    }
  });
}
