import * as core from '@actions/core';
import {Dependencies} from './types';
import {executeSyncAction} from './actions/sync';
import {executeListCategoriesAction} from './actions/list-categories';
import {jiraClientFactory} from './jira-client';
import {validateJiraAuthInputs} from './inputs';

/**
 * Main entry point - delegates to the appropriate action based on the 'action' input
 */
export async function run(deps: Dependencies = {}): Promise<void> {
  try {
    const {core: coreLib = core, jiraClient: injectedJiraClient} = deps;

    const actionInput = coreLib.getInput('action') || 'sync';

    // Create JIRA client if not injected (for testing)
    const jiraClient = injectedJiraClient ?? (() => {
      const jiraAuth = validateJiraAuthInputs(coreLib);
      return jiraClientFactory(
        jiraAuth.jiraUrl,
        jiraAuth.jiraUsername,
        jiraAuth.jiraApiToken,
      );
    })();

    const depsWithClient: Dependencies = {
      ...deps,
      jiraClient,
    };

    switch (actionInput) {
      case 'sync':
        await executeSyncAction(depsWithClient);
        break;

      case 'list-categories':
        await executeListCategoriesAction(depsWithClient);
        break;

      default:
        coreLib.setFailed(`Invalid action: ${actionInput}. Valid actions are: sync, list-categories`);
    }
  } catch (error: any) {
    const {core: coreLib = core} = deps;
    coreLib.setFailed(error.message || 'An unexpected error occurred');
  }
}

// Run the action when inside GitHub Actions (but not during tests)
if (process.env.GITHUB_ACTIONS && process.env.NODE_ENV !== 'test') {
  run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {jiraClientFactory} from './jira-client';
export type {JiraClient} from './jira-client';
export {githubClientFactory} from './github-client';
export type {GitHubClient} from './github-client';
export {buildAutolinkPlan} from './plan';
export type {AutolinkOp} from './types';
export {applyAutolinkPlan, applyAutolinkPlanDryRun} from './apply';
