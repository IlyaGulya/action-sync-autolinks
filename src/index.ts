import * as core from '@actions/core';
import * as github from '@actions/github';
import { SyncDependencies, GithubAutolink } from './types';
import { getJiraQueues } from './jira';
import { getExistingAutolinks, createAutolink, deleteAutolink } from './github';

export async function syncAutolinks(deps: SyncDependencies = {}): Promise<void> {
  try {
    const {
      core: coreLib = core,
      githubLib = github,
      http = fetch
    } = deps;

    // Get inputs
    const githubToken = coreLib.getInput('github-token', { required: true });
    const jiraUrl = coreLib.getInput('jira-url', { required: true });
    const jiraUsername = coreLib.getInput('jira-username', { required: true });
    const jiraApiToken = coreLib.getInput('jira-api-token', { required: true });
    let currentRepo = githubLib.context.repo;
    let currentRepoStr = currentRepo.owner + '/' + currentRepo.repo;
    const repository = coreLib.getInput('repository') || currentRepoStr;

    const [owner, repo] = repository.split('/');
    const octokit = githubLib.getOctokit(githubToken);

    coreLib.info(`Syncing autolinks for ${repository}`);
    coreLib.info(`JIRA URL: ${jiraUrl}`);

    // Fetch JIRA queues/projects
    coreLib.info('Fetching JIRA projects...');
    const jiraProjects = await getJiraQueues(jiraUrl, jiraUsername, jiraApiToken, http);
    coreLib.info(`Found ${jiraProjects.length} JIRA projects`);

    // Fetch existing autolinks
    coreLib.info('Fetching existing autolinks...');
    const existingAutolinks = await getExistingAutolinks(octokit, owner, repo);
    coreLib.info(`Found ${existingAutolinks.length} existing autolinks`);

    // Create a map of existing autolinks by key prefix
    const existingAutolinkMap = new Map<string, GithubAutolink>();
    existingAutolinks.forEach(autolink => {
      existingAutolinkMap.set(autolink.key_prefix, autolink);
    });

    // Track which autolinks should exist
    const desiredPrefixes = new Set<string>();

    // Create autolinks for each JIRA project
    for (const project of jiraProjects) {
      const keyPrefix = `${project.key}-`;
      const urlTemplate = `${jiraUrl}/browse/${project.key}-<num>`;

      desiredPrefixes.add(keyPrefix);

      if (existingAutolinkMap.has(keyPrefix)) {
        const existing = existingAutolinkMap.get(keyPrefix)!;
        if (existing.url_template === urlTemplate) {
          coreLib.info(`Autolink for ${keyPrefix} already exists and is up to date`);
        } else {
          coreLib.info(`Updating autolink for ${keyPrefix}`);
          await deleteAutolink(octokit, owner, repo, existing.id);
          await createAutolink(octokit, owner, repo, keyPrefix, urlTemplate);
        }
      } else {
        coreLib.info(`Creating new autolink for ${keyPrefix}`);
        await createAutolink(octokit, owner, repo, keyPrefix, urlTemplate);
      }
    }

    // Remove autolinks that are no longer needed (only JIRA-related ones)
    for (const [keyPrefix, autolink] of existingAutolinkMap) {
      if (!desiredPrefixes.has(keyPrefix)) {
        // Only delete if it looks like a JIRA autolink (ends with -)
        if (keyPrefix.endsWith('-') && autolink.url_template.includes(jiraUrl)) {
          coreLib.info(`Removing obsolete autolink: ${keyPrefix}`);
          await deleteAutolink(octokit, owner, repo, autolink.id);
        }
      }
    }

    coreLib.info('Autolink sync completed successfully');

    // Set outputs
    coreLib.setOutput('projects-synced', jiraProjects.length);
    coreLib.setOutput('autolinks-processed', existingAutolinks.length);

  } catch (error: any) {
    const { core: coreLib = core } = deps;
    // Import mapJiraError here to handle JIRA-specific errors
    const { mapJiraError } = await import('./jira');
    const errorMessage = mapJiraError(error);
    coreLib.setFailed(errorMessage);
  }
}

// Run the action
if (require.main === module) {
  syncAutolinks();
}

export { getJiraQueues } from './jira';
export { getExistingAutolinks, createAutolink, deleteAutolink } from './github';
