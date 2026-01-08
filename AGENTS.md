# Agent Instructions

This document defines the style, structure, and commands for agent work in this project.

## Project Overview

**web-test-runner-extension** - A VS Code extension for web-test-runner.

## Code Style

- Use TypeScript with strict mode enabled
- Follow ESLint and Prettier configurations
- Use camelCase for variables and functions
- Use PascalCase for classes and types
- Add JSDoc comments for public APIs

## File Structure

- Source code: `src/`
- Tests: `test/` or `*.test.ts`
- Configuration files: Root directory

## Development Commands

- `npm install` - Install dependencies
- `npm run build` - Build the project
- `npm test` - Run tests
- `npm run lint` - Run linter

## Git Workflow

- Use meaningful commit messages
- Reference issues with `#issue-number`
- Keep commits atomic and focused

## Testing

- Use TDD
- Write tests alongside features
- Aim for >80% code coverage
- Use mocha for unit tests
