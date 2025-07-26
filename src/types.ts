import * as core from '@actions/core';
import * as github from '@actions/github';
import type {
  RestEndpointMethodTypes
} from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

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

export type GithubAutolink = RestEndpointMethodTypes["repos"]["getAutolink"]["response"]["data"]

export type Octokit = ReturnType<typeof github.getOctokit>;

export interface SyncDependencies {
  core?: typeof core;
  githubLib?: typeof github;
  http?: typeof fetch;
}
