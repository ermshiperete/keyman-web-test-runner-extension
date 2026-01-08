# Web Test Runner Extension Implementation

## Overview

This VS Code extension provides an integrated test explorer for `web-test-runner`. It allows you to discover, view, and run unit tests directly from the VS Code Testing sidebar.

## Features

### Test Discovery
- Reads test files and groups from `web-test-runner.config.mjs` if present
- Falls back to automatic file discovery matching patterns if no config:
  - `*.test.ts` / `*.test.js`
  - `*.spec.ts` / `*.spec.js`
- Organizes tests by configuration groups for logical grouping
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
- Initializes the test controller and runner
- Manages extension lifecycle and subscriptions
- Handles activation and deactivation

#### `testController.ts` (TestController)
Implements VS Code's Test Controller API:
- Loads test configuration from `web-test-runner.config.mjs`
- Organizes tests into groups from configuration
- Falls back to file globbing if no config present
- Manages test item creation and population
- Registers test run and resolve handlers
- Watches for file system changes and auto-refreshes tests

**Key Methods:**
- `discoverTests()` - Load tests from config or glob filesystem
- `discoverFromConfig()` - Parse and organize tests from config file
- `discoverFromGlob()` - Auto-discover tests by file patterns
- `createTestItem(file)` - Create test item for file
- `dispose()` - Clean up resources

#### `configLoader.ts` (ConfigLoader)
Parses web-test-runner configuration files:
- Finds `web-test-runner.config.mjs/js/ts` in workspace root
- Extracts test groups and file lists using regex parsing
- Provides fallback to filesystem globbing

**Key Methods:**
- `findConfigFile(workspaceRoot)` - Locate config file
- `loadConfig(configPath)` - Load and parse configuration
- `parseGroups()` - Extract test groups from config
- `parseArray()` - Parse string arrays from config content

#### `testRunner.ts` (TestRunner)
Manages test execution:
- Spawns web-test-runner processes via npx
- Captures and streams output to output channel
- Parses test results (pass/fail counts)
- Provides error handling

**Key Methods:**
- `runAllTests()` - Execute all discovered tests
- `runTestFile(filePath)` - Execute specific test file
- `runSingleTest(filePath, testName)` - Execute single test by name

## Test Execution

VS Code's native Test Explorer UI provides built-in commands:
- **Run** - Execute selected test file
- **Run All** - Execute all discovered tests
- **Refresh** - Rescan workspace for test files
- **Stop** - Cancel running tests

No custom commands required; uses standard VS Code testing interface.

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
