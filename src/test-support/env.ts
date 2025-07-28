import type * as core from '@actions/core';
import { createMockCore } from './core';
import { createGitHubMocks, GitHubMocks } from './octokit';
import { clearFetchMocks } from './fetch';
import type { DeepMock } from './mock-utils';

export interface TestEnv {
  mockCore: DeepMock<typeof core>;
  githubMocks: GitHubMocks;
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

  return {
    mockCore,
    githubMocks,
    owner,
    repo,
    restore: () => {
      // bun:test automatically restores mocks after each test.
      clearFetchMocks();
    },
  };
}