import * as core from '@actions/core';
import { Octokit } from './types';
import { AutolinkOp } from './plan';
import { createAutolink, deleteAutolink } from './github';

export async function applyAutolinkOp(
  octokit: Octokit,
  owner: string,
  repo: string,
  operation: AutolinkOp,
  coreLib: typeof core = core
): Promise<void> {
  switch (operation.kind) {
    case 'create':
      coreLib.info(`Creating autolink for ${operation.keyPrefix}`);
      await createAutolink(octokit, owner, repo, operation.keyPrefix, operation.urlTemplate, coreLib);
      break;

    case 'update':
      coreLib.info(`Updating autolink for ${operation.keyPrefix}`);
      await deleteAutolink(octokit, owner, repo, operation.autolinkId, coreLib);
      await createAutolink(octokit, owner, repo, operation.keyPrefix, operation.urlTemplate, coreLib);
      break;

    case 'delete':
      coreLib.info(`Deleting obsolete autolink: ${operation.keyPrefix}`);
      await deleteAutolink(octokit, owner, repo, operation.autolinkId, coreLib);
      break;
  }
}

export function applyAutolinkPlanDryRun(
  operations: AutolinkOp[],
  coreLib: typeof core = core
): number {
  coreLib.info('=== DRY RUN MODE ===');
  for (const op of operations) {
    switch (op.kind) {
      case 'create':
        coreLib.info(`[DRY RUN] Would create autolink for ${op.keyPrefix} -> ${op.urlTemplate}`);
        break;
      case 'update':
        coreLib.info(`[DRY RUN] Would update autolink ${op.autolinkId} for ${op.keyPrefix} -> ${op.urlTemplate}`);
        break;
      case 'delete':
        coreLib.info(`[DRY RUN] Would delete autolink ${op.autolinkId} for ${op.keyPrefix}`);
        break;
    }
  }
  return operations.length;
}

export async function applyAutolinkPlan(
  octokit: Octokit,
  owner: string,
  repo: string,
  operations: AutolinkOp[],
  coreLib: typeof core = core
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
