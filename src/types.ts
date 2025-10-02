import type * as core from '@actions/core';
import type * as github from '@actions/github';
import type { Endpoints } from '@octokit/types';

export interface JiraProject {
  key: string;
  name: string;
  id: string;
}

export interface JiraApiError extends Error {
  response?: {
    status: number;
    data: any;
    headers: Record<string, string>;
  };
  code?: string;
}

export type GithubAutolink = Endpoints['GET /repos/{owner}/{repo}/autolinks']['response']['data'][number];

export type Octokit = ReturnType<typeof github.getOctokit>;

export interface SyncDependencies {
  core?: typeof core;
  githubLib?: typeof github;
}
