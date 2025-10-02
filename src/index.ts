import * as core from '@actions/core';
import {SyncDependencies} from './types';
import {executeSyncAction} from './actions/sync';
import {executeListCategoriesAction} from './actions/list-categories';

/**
 * Main entry point - delegates to the appropriate action based on the 'action' input
 */
export async function run(deps: SyncDependencies = {}): Promise<void> {
  try {
    const {core: coreLib = core} = deps;

    const actionInput = coreLib.getInput('action') || 'sync';

    switch (actionInput) {
      case 'sync':
        await executeSyncAction(deps);
        break;

      case 'list-categories':
        await executeListCategoriesAction(deps);
        break;

      default:
        coreLib.setFailed(`Invalid action: ${actionInput}. Valid actions are: sync, list-categories`);
    }
  } catch (error: any) {
    const {core: coreLib = core} = deps;
    coreLib.setFailed(error.message || 'An unexpected error occurred');
  }
}

// Run the action
if (require.main === module || (process.env.NODE_ENV !== 'test' && process.env.GITHUB_ACTIONS)) {
  run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {getJiraProjects} from './jira';
export {getExistingAutolinks, createAutolink, deleteAutolink} from './github';
export {buildAutolinkPlan} from './plan';
export type {AutolinkOp} from './plan';
export {applyAutolinkPlan, applyAutolinkPlanDryRun} from './apply';
