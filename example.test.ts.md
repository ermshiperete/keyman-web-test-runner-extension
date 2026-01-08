/**
 * Example test file for web-test-runner
 * 
 * This file demonstrates the test structure that the extension discovers.
 * Create similar files in your project with names ending in:
 * - .test.ts / .test.js
 * - .spec.ts / .spec.js
 */

import { assert } from '@esm-bundle/chai';

describe('Example Test Suite', () => {
  it('should pass a basic assertion', () => {
    assert.strictEqual(2 + 2, 4);
  });

  it('should work with string comparisons', () => {
    const message = 'Hello, World!';
    assert.include(message, 'World');
  });

  it('should handle array operations', () => {
    const arr = [1, 2, 3, 4, 5];
    assert.lengthOf(arr, 5);
    assert.include(arr, 3);
  });

  it('should support async tests', async () => {
    const result = await Promise.resolve(42);
    assert.strictEqual(result, 42);
  });
});
