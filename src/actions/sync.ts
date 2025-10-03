import * as core from '@actions/core';
import * as github from '@actions/github';
import {Dependencies} from '../types';
import {githubClientFactory} from '../github-client';
import {buildAutolinkPlan} from '../plan';
import {applyAutolinkPlan, applyAutolinkPlanDryRun} from '../apply';
import {mapJiraError} from '../mapJiraError';
import {validateSyncInputs} from '../inputs';

export async function executeSyncAction({
                                          core: coreLib = core,
                                          githubLib = github,
                                          jiraClient,
                                        }: Dependencies = {}): Promise<void> {
  if (!jiraClient) {
    throw new Error('jiraClient is required');
  }
  const inputs = validateSyncInputs(coreLib);

  let currentRepo = githubLib.context.repo;
  let currentRepoStr = currentRepo.owner + '/' + currentRepo.repo;
  const repository = coreLib.getInput('repository') || currentRepoStr;

  const [owner, repo] = repository.split('/');
  const octokit = githubLib.getOctokit(inputs.githubToken);
  const githubClient = githubClientFactory(octokit, owner, repo);

  coreLib.info(`Syncing autolinks for ${repository}`);
  coreLib.info(`JIRA URL: ${inputs.jiraUrl}`);

  // Fetch JIRA projects
  coreLib.info('Fetching JIRA projects...');
  if (inputs.projectCategoryFilter) {
    coreLib.info(`Filtering by categories: ${inputs.projectCategoryFilter.join(', ')}`);
  }
  if (inputs.projectTypeFilter) {
    coreLib.info(`Filtering by types: ${inputs.projectTypeFilter.join(', ')}`);
  }
  if (inputs.projectQuery) {
    coreLib.info(`Filtering by query: "${inputs.projectQuery}"`);
  }

  let jiraProjects;
  try {
    jiraProjects = await jiraClient.getProjects(
      inputs.projectCategoryFilter,
      inputs.projectTypeFilter,
      inputs.projectQuery,
    );
  } catch (error: any) {
    coreLib.setFailed(mapJiraError(error));
    return;
  }

  coreLib.info(`Found ${jiraProjects.length} JIRA projects`);

  // Check GitHub's 500 autolinks limit
  if (jiraProjects.length > 500) {
    coreLib.setFailed(
      `Found ${jiraProjects.length} JIRA projects, but GitHub only supports up to 500 autolinks per repository.\n` +
      `Please use filtering inputs to reduce the number of projects:\n` +
      `  - 'filter-project-category-ids': Filter by category (use 'action: list-categories' to see available categories)\n` +
      `  - 'filter-project-type': Filter by type (business, service_desk, software)\n` +
      `  - 'filter-project-query': Filter by project key or name`,
    );
    return;
  }

  // Fetch existing autolinks
  coreLib.info('Fetching existing autolinks...');
  const existingAutolinks = await githubClient.getExistingAutolinks(coreLib);
  coreLib.info(`Found ${existingAutolinks.length} existing autolinks`);

  // Build execution plan
  coreLib.info('Planning autolink operations...');
  const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, inputs.jiraUrl);
  coreLib.info(`Planned ${plan.operations.length} operations for ${plan.metrics.projectsSynced} projects`);

  // Check for dry-run mode and apply the plan
  const dryRun = coreLib.getInput('dry-run')?.toLowerCase() === 'true';
  const operationsApplied = dryRun
    ? applyAutolinkPlanDryRun(plan.operations, coreLib)
    : await applyAutolinkPlan(githubClient, plan.operations, coreLib);

  coreLib.info('Autolink sync completed successfully');

  // Set outputs
  coreLib.setOutput('projects-synced', plan.metrics.projectsSynced);
  coreLib.setOutput('autolinks-processed', operationsApplied);
}
