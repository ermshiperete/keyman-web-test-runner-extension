import { TestResultParser } from "../testResultParser";
import * as assert from "assert";

describe("TestResultParser", () => {
  let parser: TestResultParser;

  beforeEach(() => {
    parser = new TestResultParser();
  });

  describe("parseTestResults", () => {
    it("should parse passed tests", () => {
      const output = `
   ✓ test one
   ✓ test two
      `;

      const results = parser.parseTestResults(output);

      assert.strictEqual(results.size, 2);
      assert.strictEqual(results.get("test one")?.passed, true);
      assert.strictEqual(results.get("test two")?.passed, true);
    });

    it("should parse failed tests", () => {
      const output = `
   𐄂 test one
   𐄂 test two
      `;

      const results = parser.parseTestResults(output);

      assert.strictEqual(results.size, 2);
      assert.strictEqual(results.get("test one")?.passed, false);
      assert.strictEqual(results.get("test two")?.passed, false);
    });

    it("should strip ANSI control codes", () => {
      const output = `
   \x1b[32m✓\x1b[89m\x1b[0m\x1b[0m test with ANSI
      `;

      const results = parser.parseTestResults(output);

      assert.strictEqual(results.size, 1);
      assert.strictEqual(results.get("test with ANSI")?.passed, true);
    });

    it("should parse failure details", () => {
      const output = `
   𐄂 finds all matching cookies
      
❌ CookieSerializer > loadAllMatching > finds all matching cookies
      AssertionError: expected [] to deeply equal [...]
      
Chromium: |██████████████████████████████| 1/1 test files | 4 passed, 1 failed
      `;

      const results = parser.parseTestResults(output);

      const result = results.get("finds all matching cookies");
      assert.ok(result);
      assert.strictEqual(result.passed, false);
      assert.ok(result.message);
      assert.ok(result.message.includes("AssertionError"));
    });

    it("should handle mixed passed and failed tests", () => {
      const output = `
   ✓ serializes & reloads when all values are strings
   ✓ serializes all values to strings
   𐄂 finds all matching cookies
      `;

      const results = parser.parseTestResults(output);

      assert.strictEqual(results.size, 3);
      assert.strictEqual(
        results.get("serializes & reloads when all values are strings")?.passed,
        true
      );
      assert.strictEqual(
        results.get("finds all matching cookies")?.passed,
        false
      );
    });

    it("should ignore error message indentation", () => {
      const output = `
   ✓ test one
      Very indented error message
      that spans multiple lines
   ✓ test two
      `;

      const results = parser.parseTestResults(output);

      assert.strictEqual(results.size, 2);
      assert.ok(!results.has("Very indented error message"));
    });

    it("should parse results in full example", () => {
      const output = `
CookieSerializer [Chromium]
  SimpleTestCookie [Chromium]
    ✓ serializes & reloads when all values are strings
    ✓ serializes all values to strings
    ✓ accepts custom deserialization
    ✓ works with encodeURIComponent + decodeURIComponent
  loadAllMatching [Chromium]
    𐄂 finds all matching cookies
      `;

      const results = parser.parseTestResults(output);

      assert.strictEqual(results.size, 5);
      assert.strictEqual(
        results.get("serializes & reloads when all values are strings")?.passed,
        true
      );
      assert.strictEqual(
        results.get("finds all matching cookies")?.passed,
        false
      );
    });
  });
});
