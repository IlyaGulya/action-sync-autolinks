# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that automatically synchronizes JIRA projects with GitHub repository autolinks. It fetches JIRA projects and creates/updates/removes GitHub autolinks so that references like `PROJECT-123` automatically link to the corresponding JIRA ticket.

## Development Commands

- **Test**: `bun test` - Run all tests
- **Build**: `bun build src/index.ts --outdir dist --target node --minify` - Build the distribution bundle
- **Type Check**: `bun typecheck` - Run TypeScript type checking

## Architecture

The action follows a pipeline architecture with clear separation of concerns:

1. **Main Entry Point** (`src/index.ts`): Orchestrates the sync process
   - Reads GitHub Action inputs
   - Coordinates all sync steps
   - Handles error mapping and outputs

2. **Data Fetching Layer**:
   - `src/jira.ts`: Fetches JIRA projects via REST API
   - `src/github.ts`: Manages GitHub autolinks via Octokit

3. **Planning Layer** (`src/plan.ts`): 
   - Compares JIRA projects with existing autolinks
   - Generates operations (create/update/delete) needed for sync
   - Returns structured plan with metrics

4. **Execution Layer** (`src/apply.ts`):
   - Applies the planned operations
   - Supports dry-run mode for testing
   - Handles individual operation execution

5. **Testing Infrastructure** (`src/test-support/`):
   - Mock builders for JIRA projects and GitHub autolinks
   - Test environment setup utilities
   - Fixture data for consistent testing

## Key Types

- `JiraProject`: Represents a JIRA project with key, name, and id
- `GithubAutolink`: GitHub autolink structure from REST API
- `AutolinkOp`: Union type for create/update/delete operations
- `SyncDependencies`: Dependency injection interface for testing

## Testing Patterns

Tests use Bun's testing framework with extensive mocking:
- Mock GitHub API responses using builders in `test-support/`
- Mock JIRA API using `@aryzing/bun-mock-fetch`
- Test both success and error scenarios
- Separate unit tests for each module

## Build Output

The action builds to `dist/index.js` for GitHub Actions execution. The TypeScript source is in `src/` and the build is configured for Node.js runtime.