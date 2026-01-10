/**
 * Parses web-test-runner output to extract individual test results
 */
export class TestResultParser {
  /**
   * Parse individual test results from web-test-runner output
   */
  parseTestResults(
    output: string
  ): Map<string, { passed: boolean; message?: string }> {
    const results = new Map<string, { passed: boolean; message?: string }>();

    // Strip ANSI control codes
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, "");

    // Parse test result lines: ✓ test name (passed) or 𐄂 test name (failed)
    // Match lines with leading spaces and test result pattern
    const lines = cleanOutput.split("\n");
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Check if line starts with spaces followed by a symbol and space
      // Using /u flag for proper Unicode support
      const match = line.match(/^\s+([\s\S]?)\s+(.+)$/u);
      if (match && match[1]) {
        const testName = match[2].trim();
        // Check if symbol is ✓ (passed) - anything else is failed
        const passed = match[1].includes("✓");
        results.set(testName, { passed });
      }
    }

    // Parse failure details
    const failureRegex =
      /❌\s+(.+?)\n([\s\S]+?)(?=\n\s*(?:Chromium|Firefox|Webkit|Finished|$))/g;
    let failureMatch;

    while ((failureMatch = failureRegex.exec(cleanOutput)) !== null) {
      const failedTestFullName = failureMatch[1].trim();
      const errorMessage = failureMatch[2].trim();
      // Extract test name (last part after >)
      const testName = failedTestFullName.split(">").pop()?.trim() || failedTestFullName;
      if (results.has(testName)) {
        results.get(testName)!.message = errorMessage;
      }
    }

    return results;
  }
}
