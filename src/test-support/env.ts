import { createCoreSpies, createMockCore, restoreCoreSpies, CoreSpies } from './core';
import { createGitHubMocks, GitHubMocks } from './octokit';
import { clearFetchMocks } from './fetch';

export interface TestEnv {
  coreSpies: CoreSpies;
  mockCore: typeof import('@actions/core');
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

  const coreSpies = createCoreSpies(options?.inputs ?? {});
  const mockCore = createMockCore(coreSpies);
  const githubMocks = createGitHubMocks(owner, repo);

  return {
    coreSpies,
    mockCore,
    githubMocks,
    owner,
    repo,
    restore: () => {
      restoreCoreSpies(coreSpies);
      clearFetchMocks();
    },
  };
}