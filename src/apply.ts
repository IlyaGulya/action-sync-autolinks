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

/**
 * Run operations with concurrency limit
 */
async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const results: Promise<void>[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });

    results.push(p);
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
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
  maxParallelRequests: number = 5,
  coreLib: typeof core = core,
): Promise<number> {
  let operationsApplied = 0;
  const errors: Array<{operation: AutolinkOp; error: any}> = [];

  await runWithConcurrencyLimit(
    operations,
    maxParallelRequests,
    async (operation) => {
      try {
        await applyAutolinkOp(client, operation, coreLib);
        operationsApplied++;
      } catch (error: any) {
        coreLib.error(`Failed to apply ${operation.kind} operation for ${operation.keyPrefix}: ${error.message}`);
        errors.push({operation, error});
      }
    }
  );

  // If there were any errors, throw the first one
  if (errors.length > 0) {
    throw errors[0].error;
  }

  return operationsApplied;
}
