#!/usr/bin/env bun

/**
 * Local dry-run test script
 *
 * Usage:
 *   JIRA_URL=https://your-company.atlassian.net \
 *   JIRA_USERNAME=your-email@example.com \
 *   JIRA_API_TOKEN=your-api-token \
 *   REPO=owner/repo \
 *   bun run scripts/test-dry-run.ts
 *
 * Optional filters:
 *   FILTER_CATEGORY_IDS=10000,10001 \
 *   FILTER_TYPE=software,business \
 *   FILTER_QUERY=platform \
 *   bun run scripts/test-dry-run.ts
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { executeSyncAction } from '../src/actions/sync';
import { jiraClientFactory } from '../src/jira-client';

// Get GitHub token from gh CLI
let githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  try {
    const result = Bun.spawnSync(['gh', 'auth', 'token']);
    if (result.exitCode === 0) {
      githubToken = result.stdout.toString().trim();
    }
  } catch (error) {
    // gh command not available
  }
}

const jiraUrl = process.env.JIRA_URL;
const jiraUsername = process.env.JIRA_USERNAME;
const jiraApiToken = process.env.JIRA_API_TOKEN;
const repo = process.env.REPO;

if (!githubToken || !jiraUrl || !jiraUsername || !jiraApiToken || !repo) {
  console.error('Error: Missing required environment variables');
  console.error('Required:');
  console.error('  JIRA_URL - Your JIRA instance URL (e.g., https://company.atlassian.net)');
  console.error('  JIRA_USERNAME - Your JIRA username/email');
  console.error('  JIRA_API_TOKEN - Your JIRA API token');
  console.error('  REPO - Repository in format owner/repo');
  console.error('\nNote: GitHub token will be automatically retrieved from `gh auth token`');
  console.error('      or you can set GITHUB_TOKEN environment variable');
  console.error('\nOptional filters:');
  console.error('  FILTER_CATEGORY_IDS - Comma-separated category IDs (e.g., 10000,10001)');
  console.error('  FILTER_TYPE - Comma-separated types (business, service_desk, software)');
  console.error('  FILTER_QUERY - Filter by project key or name');
  process.exit(1);
}

// Mock core module
const mockCore = {
  ...core,
  getInput: (name: string) => {
    const inputs: Record<string, string> = {
      'action': 'sync',
      'github-token': githubToken,
      'jira-url': jiraUrl,
      'jira-username': jiraUsername,
      'jira-api-token': jiraApiToken,
      'repository': repo,
      'dry-run': 'true', // Always dry-run
      'filter-project-category-ids': process.env.FILTER_CATEGORY_IDS || '',
      'filter-project-type': process.env.FILTER_TYPE || '',
      'filter-project-query': process.env.FILTER_QUERY || '',
    };
    return inputs[name] || '';
  },
  info: (message: string) => console.log(message),
  error: (message: string) => console.error(`ERROR: ${message}`),
  setFailed: (message: string) => {
    console.error(`FAILED: ${message}`);
    process.exit(1);
  },
  setOutput: (name: string, value: any) => {
    console.log(`Output: ${name} = ${value}`);
  },
};

const jiraClient = jiraClientFactory(jiraUrl, jiraUsername, jiraApiToken);

// Set GITHUB_REPOSITORY for github context
process.env.GITHUB_REPOSITORY = repo;

try {
  await executeSyncAction({
    core: mockCore as any,
    githubLib: github,
    jiraClient,
  });
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(1);
}
