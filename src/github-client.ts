import * as core from '@actions/core';
import {GithubAutolink, Octokit} from './types';
import {withRetry} from './retry';

/**
 * GitHub client interface for repository autolink operations
 */
export interface GitHubClient {
  getExistingAutolinks(coreLib?: typeof core): Promise<GithubAutolink[]>;
  createAutolink(keyPrefix: string, urlTemplate: string, coreLib?: typeof core): Promise<GithubAutolink>;
  deleteAutolink(autolinkId: number, coreLib?: typeof core): Promise<void>;
}

/**
 * Creates a GitHub client for a specific repository
 */
export function githubClientFactory(
  octokit: Octokit,
  owner: string,
  repo: string,
): GitHubClient {
  const getExistingAutolinks = async (
    coreLib: typeof core = core
  ): Promise<GithubAutolink[]> => {
    try {
      return await withRetry(() =>
        octokit.paginate(octokit.rest.repos.listAutolinks, {
          owner,
          repo,
          per_page: 100,
        })
      );
    } catch (error: any) {
      coreLib.error(`Failed to fetch existing autolinks: ${error.message}`);
      throw error;
    }
  };

  const createAutolink = async (
    keyPrefix: string,
    urlTemplate: string,
    coreLib: typeof core = core
  ): Promise<GithubAutolink> => {
    try {
      const response = await withRetry(() =>
        octokit.rest.repos.createAutolink({
          owner,
          repo,
          key_prefix: keyPrefix,
          url_template: urlTemplate,
          is_alphanumeric: true,
        })
      );
      coreLib.debug?.(`Created autolink for ${keyPrefix}: ${urlTemplate}`);
      return response.data;
    } catch (error: any) {
      coreLib.error(`Failed to create autolink for ${keyPrefix}: ${error.message}`);
      throw error;
    }
  };

  const deleteAutolink = async (
    autolinkId: number,
    coreLib: typeof core = core
  ): Promise<void> => {
    try {
      await withRetry(() =>
        octokit.rest.repos.deleteAutolink({
          owner,
          repo,
          autolink_id: autolinkId,
        })
      );
      coreLib.debug?.(`Deleted autolink with ID: ${autolinkId}`);
    } catch (error: any) {
      coreLib.error(`Failed to delete autolink ${autolinkId}: ${error.message}`);
      throw error;
    }
  };

  return {
    getExistingAutolinks,
    createAutolink,
    deleteAutolink,
  };
}
