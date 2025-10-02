import * as core from '@actions/core';
import {AutolinkOp, Octokit} from './types';
import {createAutolink, deleteAutolink} from './github';
import {describeOp} from './apply-messages';

export async function applyAutolinkOp(
  octokit: Octokit,
  owner: string,
  repo: string,
  operation: AutolinkOp,
  coreLib: typeof core = core,
): Promise<void> {
  switch (operation.kind) {
    case 'create':
      coreLib.info(`Creating ${describeOp(operation)}`);
      await createAutolink(octokit, owner, repo, operation.keyPrefix, operation.urlTemplate, coreLib);
      break;

    case 'update':
      coreLib.info(`Updating ${describeOp(operation)}`);
      await deleteAutolink(octokit, owner, repo, operation.autolinkId, coreLib);
      await createAutolink(octokit, owner, repo, operation.keyPrefix, operation.urlTemplate, coreLib);
      break;

    case 'delete':
      coreLib.info(`Deleting obsolete ${describeOp(operation)}`);
      await deleteAutolink(octokit, owner, repo, operation.autolinkId, coreLib);
      break;
  }
}

export function applyAutolinkPlanDryRun(
  operations: AutolinkOp[],
  coreLib: typeof core = core,
): number {
  coreLib.info('=== DRY RUN MODE ===');
  for (const op of operations) {
    coreLib.info(`[DRY RUN] Would ${op.kind} ${describeOp(op)}`);
  }
  return operations.length;
}

export async function applyAutolinkPlan(
  octokit: Octokit,
  owner: string,
  repo: string,
  operations: AutolinkOp[],
  coreLib: typeof core = core,
): Promise<number> {
  let operationsApplied = 0;
  for (const operation of operations) {
    try {
      await applyAutolinkOp(octokit, owner, repo, operation, coreLib);
      operationsApplied++;
    } catch (error: any) {
      coreLib.error(`Failed to apply ${operation.kind} operation for ${operation.keyPrefix}: ${error.message}`);
      throw error;
    }
  }

  return operationsApplied;
}
