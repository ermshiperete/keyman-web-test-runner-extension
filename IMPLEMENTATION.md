# Web Test Runner Extension Implementation

## Overview

This VS Code extension provides an integrated test explorer for `web-test-runner`. It allows you to discover, view, and run unit tests directly from the VS Code Testing sidebar.

## Features

### Test Discovery
- Automatically discovers test files matching patterns:
  - `*.test.ts` / `*.test.js`
  - `*.spec.ts` / `*.spec.js`
- Real-time synchronization with file system changes
- Configurable activation based on workspace structure

### Test Explorer View
- Visual tree view in the Testing sidebar
- Individual test file display with icons
- Context menu support for running tests
- Quick access to test file locations

### Test Execution
- Run all tests via the "Run All Tests" button
- Run individual test files via context menu
- Real-time output streaming to dedicated output channel
- Test result summaries with pass/fail counts
- Error reporting and diagnostics

## Architecture

### Core Modules

#### `extension.ts`
Main entry point that:
- Initializes the test runner and explorer
- Registers VS Code commands
- Sets up file watchers for test file changes
- Manages extension lifecycle

#### `testExplorer.ts` (TestExplorerProvider)
Implements the tree data provider:
- Discovers test files in workspace
- Builds the tree structure for display
- Handles tree item rendering and icons
- Provides refresh capabilities

**Key Methods:**
- `refresh()` - Rediscover and refresh test tree
- `discoverTests()` - Scan workspace for test files
- `getTreeItem(element)` - Format items for display
- `getChildren(element)` - Return child items in tree

#### `testRunner.ts` (TestRunner)
Manages test execution:
- Spawns web-test-runner processes
- Captures and streams output
- Parses test results
- Provides error handling

**Key Methods:**
- `runAllTests()` - Execute all discovered tests
- `runTestFile(filePath)` - Execute specific test file
- `runSingleTest(filePath, testName)` - Execute single test

## Commands

### Registered Commands

| Command ID | Title | Shortcut | Description |
|---|---|---|---|
| `web-test-runner-extension.runAll` | Run All Tests | - | Execute all discovered tests |
| `web-test-runner-extension.refreshTests` | Refresh Tests | - | Rescan workspace for test files |
| `web-test-runner-extension.runTest` | Run Test | - | Execute selected test file |

## Activation Events

The extension activates when:
1. Workspace contains `web-test-runner.config.*`
2. Workspace contains test files matching patterns
3. Opening a workspace folder

## Usage

### Basic Workflow

1. **Open workspace** with test files
2. **Switch to Testing sidebar** (VS Code left sidebar)
3. **View Web Test Runner** panel
4. **Run tests** using:
   - "Run All Tests" button (top of panel)
   - Right-click on test file → "Run Test"
5. **View output** in "Web Test Runner" output channel

### Configuration

No additional configuration required. The extension works with standard `web-test-runner` setups.

Optional: Create `web-test-runner.config.mjs` in workspace root for runner configuration.

## Development

### Build
```bash
npm run compile
```

### Watch Mode
```bash
npm run watch
```

### Lint
```bash
npm run lint
```

### Test
```bash
npm test
```

## Dependencies

### Runtime
- `web-test-runner` - Test runner execution

### Development
- `vscode` - Extension API
- `typescript` - Language
- `webpack` - Bundling
- `eslint` - Linting

## Future Enhancements

- [ ] Test filtering and search
- [ ] Breakpoint debugging support
- [ ] Coverage report visualization
- [ ] Test watch mode
- [ ] Individual test result tracking
- [ ] Performance metrics
- [ ] Custom test reporter integration
