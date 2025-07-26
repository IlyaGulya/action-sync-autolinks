import * as core from '@actions/core';
import {GithubAutolink, Octokit} from './types';

export async function getExistingAutolinks(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<GithubAutolink[]> {
  try {
    const response = await octokit.rest.repos.listAutolinks({
      owner,
      repo,
    });
    return response.data;
  } catch (error: any) {
    core.error(`Failed to fetch existing autolinks: ${error.message}`);
    throw error;
  }
}

export async function createAutolink(
  octokit: Octokit,
  owner: string,
  repo: string,
  keyPrefix: string,
  urlTemplate: string,
): Promise<GithubAutolink> {
  try {
    const response = await octokit.rest.repos.createAutolink({
      owner,
      repo,
      key_prefix: keyPrefix,
      url_template: urlTemplate,
      is_alphanumeric: true,
    });
    core.info(`Created autolink for ${keyPrefix}: ${urlTemplate}`);
    return response.data;
  } catch (error: any) {
    core.error(`Failed to create autolink for ${keyPrefix}: ${error.message}`);
    throw error;
  }
}

export async function deleteAutolink(
  octokit: Octokit,
  owner: string,
  repo: string,
  autolinkId: number,
): Promise<void> {
  try {
    await octokit.rest.repos.deleteAutolink({
      owner,
      repo,
      autolink_id: autolinkId,
    });
    core.info(`Deleted autolink with ID: ${autolinkId}`);
  } catch (error: any) {
    core.error(`Failed to delete autolink ${autolinkId}: ${error.message}`);
    throw error;
  }
}
