import * as github from '@actions/github';
import type {Octokit} from '../types';
import {createDeepMock, type DeepMock, type DeepPartial} from './mock-utils';

export interface GitHubMocks {
  octokit: DeepMock<Octokit>;
  githubLib: typeof github;
}

export function createGitHubMocks(owner = 'test-owner', repo = 'test-repo'): GitHubMocks {
  const octokit = createDeepMock<Octokit>({
    rest: {
      repos: {
        listAutolinks: async () => ({data: [], status: 200} as any),
        createAutolink: async () => ({data: {}, status: 201} as any),
        deleteAutolink: async () => ({status: 204} as any),
      },
    },
    paginate: async () => [] as any[],
  } satisfies DeepPartial<Octokit>);

  const githubLib = {
    context: {repo: {owner, repo}},
    // The cast to Octokit is still needed because getOctokit's signature demands it.
    getOctokit: (token: string) => octokit as unknown as Octokit,
  } as unknown as typeof github;

  return {octokit, githubLib};
}
