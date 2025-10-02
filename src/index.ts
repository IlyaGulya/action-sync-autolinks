import * as core from '@actions/core';
import * as github from '@actions/github';
import {SyncDependencies} from './types';
import {getJiraProjects} from './jira';
import {getJiraProjectCategories} from './jira-categories';
import {getExistingAutolinks} from './github';
import {buildAutolinkPlan} from './plan';
import {applyAutolinkPlan, applyAutolinkPlanDryRun} from './apply';
import {mapJiraError} from "./mapJiraError";
import {validateInputs} from './inputs';

export async function syncAutolinks(deps: SyncDependencies = {}): Promise<void> {
  try {
    const {
      core: coreLib = core,
      githubLib = github,
    } = deps;

    const inputs = validateInputs(coreLib);

    let currentRepo = githubLib.context.repo;
    let currentRepoStr = currentRepo.owner + '/' + currentRepo.repo;
    const repository = coreLib.getInput('repository') || currentRepoStr;

    const [owner, repo] = repository.split('/');
    const octokit = githubLib.getOctokit(inputs.githubToken);

    // Check if running in list-categories mode
    const listCategories = coreLib.getInput('list-categories')?.toLowerCase() === 'true';

    if (listCategories) {
      coreLib.info('Running in list-categories mode');
      coreLib.info(`JIRA URL: ${inputs.jiraUrl}`);

      try {
        const categories = await getJiraProjectCategories(
          inputs.jiraUrl,
          inputs.jiraUsername,
          inputs.jiraApiToken
        );

        coreLib.info(`\nFound ${categories.length} project categories:\n`);
        for (const category of categories) {
          const description = category.description ? ` - ${category.description}` : '';
          coreLib.info(`  ID: ${category.id}, Name: ${category.name}${description}`);
        }

        coreLib.info('\nTo filter projects by category, use the project-category-ids input:');
        coreLib.info('  project-category-ids: \'10000,10001\'');

        return;
      } catch (error: any) {
        coreLib.setFailed(mapJiraError(error));
        return;
      }
    }

    coreLib.info(`Syncing autolinks for ${repository}`);
    coreLib.info(`JIRA URL: ${inputs.jiraUrl}`);

    // Fetch JIRA projects
    coreLib.info('Fetching JIRA projects...');
    if (inputs.projectCategoryFilter) {
      coreLib.info(`Filtering by categories: ${inputs.projectCategoryFilter.join(', ')}`);
    }

    let jiraProjects;
    try {
      jiraProjects = await getJiraProjects(
        inputs.jiraUrl,
        inputs.jiraUsername,
        inputs.jiraApiToken,
        inputs.projectCategoryFilter
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
        `Please use the 'project-category-ids' input to filter projects by category.\n` +
        `Run with 'list-categories: true' to see available categories and their IDs.`
      );
      return;
    }

    // Fetch existing autolinks
    coreLib.info('Fetching existing autolinks...');
    const existingAutolinks = await getExistingAutolinks(octokit, owner, repo, coreLib);
    coreLib.info(`Found ${existingAutolinks.length} existing autolinks`);

    // Build execution plan
    coreLib.info('Planning autolink operations...');
    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, inputs.jiraUrl);
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
    const {core: coreLib = core} = deps;
    // Handle any unexpected errors (JIRA errors are handled above)
    coreLib.setFailed(error.message || 'An unexpected error occurred');
  }
}

// Run the action
if (require.main === module || (process.env.NODE_ENV !== 'test' && process.env.GITHUB_ACTIONS)) {
  syncAutolinks().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {getJiraProjects} from './jira';
export {getExistingAutolinks, createAutolink, deleteAutolink} from './github';
export {buildAutolinkPlan} from './plan';
export type {AutolinkOp} from './plan';
export {applyAutolinkPlan, applyAutolinkPlanDryRun} from './apply';
