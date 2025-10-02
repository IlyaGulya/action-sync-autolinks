import type * as core from '@actions/core';
import { createMockCore } from './core';
import { createGitHubMocks, GitHubMocks } from './octokit';
import { clearFetchMocks } from './fetch';
import type { DeepMock } from './mock-utils';
import type { JiraClient } from '../jira-client';
import { jiraClientFactory } from '../jira-client';
import type { Dependencies } from '../types';

export interface TestEnv {
  mockCore: DeepMock<typeof core>;
  githubMocks: GitHubMocks;
  jiraClient: JiraClient;
  deps: Dependencies;
  owner: string;
  repo: string;
  restore: () => void;
}

export interface TestEnvOptions {
  inputs?: Record<string, string>;
  owner?: string;
  repo?: string;
}

export function createTestEnv(options: TestEnvOptions = {}): TestEnv {
  const owner = options?.owner ?? 'org';
  const repo = options?.repo ?? 'repo';

  const mockCore = createMockCore(options?.inputs ?? {});
  const githubMocks = createGitHubMocks(owner, repo);

  // Create a real jiraClient that will use mocked fetch responses
  const jiraClient = jiraClientFactory(
    'https://example.atlassian.net',
    'test-user',
    'test-token'
  );

  const deps: Dependencies = {
    core: mockCore,
    githubLib: githubMocks.githubLib,
    jiraClient,
  };

  return {
    mockCore,
    githubMocks,
    jiraClient,
    deps,
    owner,
    repo,
    restore: () => {
      // bun:test automatically restores mocks after each test.
      clearFetchMocks();
    },
  };
}