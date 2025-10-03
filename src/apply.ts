import * as core from '@actions/core';
import {AutolinkOp} from './types';
import {describeOp} from './apply-messages';
import {assertNever} from './utils/exhaustive';
import {GitHubClient} from './github-client';

export async function applyAutolinkOp(
  client: GitHubClient,
  operation: AutolinkOp,
  coreLib: typeof core = core,
): Promise<void> {
  switch (operation.kind) {
    case 'create':
      coreLib.info(`Creating ${describeOp(operation)}`);
      await client.createAutolink(operation.keyPrefix, operation.urlTemplate, coreLib);
      break;

    case 'update':
      coreLib.info(`Updating ${describeOp(operation)}`);
      await client.deleteAutolink(operation.autolinkId, coreLib);
      await client.createAutolink(operation.keyPrefix, operation.urlTemplate, coreLib);
      break;

    case 'delete':
      coreLib.info(`Deleting obsolete ${describeOp(operation)}`);
      await client.deleteAutolink(operation.autolinkId, coreLib);
      break;

    default:
      assertNever(operation);
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
  client: GitHubClient,
  operations: AutolinkOp[],
  coreLib: typeof core = core,
): Promise<number> {
  let operationsApplied = 0;
  for (const operation of operations) {
    try {
      await applyAutolinkOp(client, operation, coreLib);
      operationsApplied++;
    } catch (error: any) {
      coreLib.error(`Failed to apply ${operation.kind} operation for ${operation.keyPrefix}: ${error.message}`);
      throw error;
    }
  }

  return operationsApplied;
}
