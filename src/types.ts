import type * as core from '@actions/core';
import type * as github from '@actions/github';
import type { Endpoints } from '@octokit/types';

export interface JiraProject {
  key: string;
  name: string;
  id: string;
  projectCategory?: {
    id: string;
    key: string;
    name: string;
  };
}

export interface PageBeanProject {
  isLast?: boolean;
  maxResults?: number;
  nextPage?: string;
  self?: string;
  startAt?: number;
  total?: number;
  values: any[];
}

export interface ProjectCategory {
  id: string;
  name: string;
  description?: string;
  self?: string;
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

export interface AutolinkOpCreate {
  kind: 'create';
  keyPrefix: string;
  urlTemplate: string;
}

export interface AutolinkOpUpdate {
  kind: 'update';
  autolinkId: number;
  keyPrefix: string;
  urlTemplate: string;
}

export interface AutolinkOpDelete {
  kind: 'delete';
  autolinkId: number;
  keyPrefix: string;
}

export type AutolinkOp = AutolinkOpCreate | AutolinkOpUpdate | AutolinkOpDelete;
