import * as core from '@actions/core';
import * as github from '@actions/github';
import { SyncDependencies } from './types';
import { getJiraQueues } from './jira';
import { getExistingAutolinks } from './github';
import { buildAutolinkPlan } from './plan';
import { applyAutolinkPlan, applyAutolinkPlanDryRun } from './apply';

export async function syncAutolinks(deps: SyncDependencies = {}): Promise<void> {
  try {
    const {
      core: coreLib = core,
      githubLib = github
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
    const jiraProjects = await getJiraQueues(jiraUrl, jiraUsername, jiraApiToken);
    coreLib.info(`Found ${jiraProjects.length} JIRA projects`);

    // Fetch existing autolinks
    coreLib.info('Fetching existing autolinks...');
    const existingAutolinks = await getExistingAutolinks(octokit, owner, repo, coreLib);
    coreLib.info(`Found ${existingAutolinks.length} existing autolinks`);

    // Build execution plan
    coreLib.info('Planning autolink operations...');
    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);
    coreLib.info(`Planned ${plan.operations.length} operations for ${plan.metrics.projectsSynced} projects`);

    // Check for dry-run mode and apply the plan
    const dryRun = coreLib.getInput('dry-run')?.toLowerCase() === 'true';
    const operationsApplied = dryRun
      ? applyAutolinkPlanDryRun(plan.operations, coreLib)
      : await applyAutolinkPlan(octokit, owner, repo, plan.operations, coreLib);

    coreLib.info('Autolink sync completed successfully');

    // Set outputs
    coreLib.setOutput('projects-synced', plan.metrics.projectsSynced);
    coreLib.setOutput('autolinks-processed', operationsApplied);

  } catch (error: any) {
    const { core: coreLib = core } = deps;
    // Import mapJiraError here to handle JIRA-specific errors
    const { mapJiraError } = await import('./jira');
    const errorMessage = mapJiraError(error);
    coreLib.setFailed(errorMessage);
  }
}

// Run the action
if (require.main === module || (process.env.NODE_ENV !== 'test' && process.env.GITHUB_ACTIONS)) {
  syncAutolinks();
}

export { getJiraQueues } from './jira';
export { getExistingAutolinks, createAutolink, deleteAutolink } from './github';
export { buildAutolinkPlan } from './plan';
export type { AutolinkOp } from './plan';
export { applyAutolinkPlan, applyAutolinkPlanDryRun } from './apply';
