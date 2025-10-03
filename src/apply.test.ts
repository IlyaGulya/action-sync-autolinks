import {describe, expect, test} from 'bun:test';
import {applyAutolinkOp, applyAutolinkPlan, applyAutolinkPlanDryRun} from './apply';
import {op, okCreate, okDelete, useTestEnv} from './test-support';

describe('applyAutolinkOp', () => {
  const env = useTestEnv();

  test('applies create operation', async () => {
    const operation = op.create('TEST');

    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue(
      okCreate('TEST', operation.urlTemplate, 123)
    );

    await applyAutolinkOp(env.githubClient, operation, env.mockCore);

    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      key_prefix: 'TEST-',
      url_template: 'https://example.atlassian.net/browse/TEST-<num>',
      is_alphanumeric: true,
    });
    expect(env.mockCore.info).toHaveBeenCalledWith('Creating autolink for TEST- -> https://example.atlassian.net/browse/TEST-<num>');
  });

  test('applies update operation', async () => {
    const operation = op.update(456, 'UPDATE', 'https://new.atlassian.net/browse/UPDATE-<num>');

    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue(okDelete(456));
    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue(
      okCreate('UPDATE', operation.urlTemplate, 789)
    );

    await applyAutolinkOp(env.githubClient, operation, env.mockCore);

    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      autolink_id: 456,
    });
    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      key_prefix: 'UPDATE-',
      url_template: 'https://new.atlassian.net/browse/UPDATE-<num>',
      is_alphanumeric: true,
    });
    expect(env.mockCore.info).toHaveBeenCalledWith('Updating autolink 456 for UPDATE- -> https://new.atlassian.net/browse/UPDATE-<num>');
  });

  test('applies delete operation', async () => {
    const operation = op.delete(789, 'OLD');

    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue(okDelete(789));

    await applyAutolinkOp(env.githubClient, operation, env.mockCore);

    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      autolink_id: 789,
    });
    expect(env.mockCore.info).toHaveBeenCalledWith('Deleting obsolete autolink 789 for OLD-');
  });
});

describe('applyAutolinkPlan', () => {
  const env = useTestEnv();

  test('applies multiple operations successfully', async () => {
    const operations = [
      op.create('NEW'),
      op.delete(123, 'OLD'),
    ];

    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue(
      okCreate('NEW', 'https://example.atlassian.net/browse/NEW-<num>')
    );
    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue(okDelete(123));

    const result = await applyAutolinkPlan(env.githubClient, operations, 5, env.mockCore);

    expect(result).toBe(2);
    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledTimes(1);
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledTimes(1);
  });

  test('stops on error and rethrows', async () => {
    const operations = [
      op.create('NEW'),
      op.delete(123, 'OLD'),
    ];

    env.githubMocks.octokit.rest.repos.createAutolink.mockRejectedValue(new Error('GitHub API error'));
    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue(okDelete(123));

    await expect(applyAutolinkPlan(env.githubClient, operations, 5, env.mockCore))
      .rejects.toThrow('GitHub API error');

    expect(env.mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to apply create operation for NEW-'));
    // With parallel execution, the delete operation may still be called
  });

  test('runs operations in parallel', async () => {
    const operations = [
      op.create('PROJ1'),
      op.create('PROJ2'),
      op.create('PROJ3'),
    ];

    const executionOrder: string[] = [];
    let concurrentCount = 0;
    let maxConcurrent = 0;

    env.githubMocks.octokit.rest.repos.createAutolink.mockImplementation(async (params: any) => {
      const key = params.key_prefix;
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      executionOrder.push(`start-${key}`);

      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10));

      executionOrder.push(`end-${key}`);
      concurrentCount--;

      return okCreate(key.replace('-', ''), params.url_template, 123);
    });

    await applyAutolinkPlan(env.githubClient, operations, 5, env.mockCore);

    // All operations should have started and ended
    expect(executionOrder).toHaveLength(6);

    // With concurrency limit of 5 and 3 operations, all should run in parallel
    expect(maxConcurrent).toBe(3);

    // If running in parallel, all operations start before any end
    // (i.e., first end should come after last start)
    const firstEndIndex = executionOrder.findIndex(s => s.startsWith('end-'));
    const lastStartIndex = executionOrder.map((s, i) => s.startsWith('start-') ? i : -1)
      .filter(i => i !== -1)
      .pop()!;
    expect(firstEndIndex).toBeGreaterThan(lastStartIndex);
  });

  test('respects concurrency limit', async () => {
    const operations = [
      op.create('PROJ1'),
      op.create('PROJ2'),
      op.create('PROJ3'),
      op.create('PROJ4'),
      op.create('PROJ5'),
    ];

    let concurrentCount = 0;
    let maxConcurrent = 0;

    env.githubMocks.octokit.rest.repos.createAutolink.mockImplementation(async (params: any) => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);

      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 20));

      concurrentCount--;

      return okCreate(params.key_prefix.replace('-', ''), params.url_template, 123);
    });

    await applyAutolinkPlan(env.githubClient, operations, 2, env.mockCore);

    // With concurrency limit of 2, max concurrent should never exceed 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(maxConcurrent).toBe(2); // Should actually hit the limit
  });

  test('continues executing remaining operations when some fail', async () => {
    const operations = [
      op.create('PROJ1'),
      op.create('PROJ2-FAIL'),
      op.create('PROJ3'),
    ];

    const completedOperations: string[] = [];

    env.githubMocks.octokit.rest.repos.createAutolink.mockImplementation(async (params: any) => {
      const key = params.key_prefix;

      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10));

      if (key === 'PROJ2-FAIL-') {
        throw new Error('PROJ2 API error');
      }

      completedOperations.push(key);
      return okCreate(key.replace('-', ''), params.url_template, 123);
    });

    await expect(applyAutolinkPlan(env.githubClient, operations, 5, env.mockCore))
      .rejects.toThrow('PROJ2 API error');

    // PROJ1 and PROJ3 should still complete despite PROJ2 failing
    expect(completedOperations).toContain('PROJ1-');
    expect(completedOperations).toContain('PROJ3-');
    expect(completedOperations).toHaveLength(2);

    expect(env.mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to apply create operation for PROJ2-FAIL-'));
  });
});

describe('applyAutolinkPlanDryRun', () => {
  const env = useTestEnv();

  test('logs dry-run operations correctly', () => {
    const operations = [
      op.create('NEW'),
      op.update(456, 'UPDATE', 'https://new.com/UPDATE-<num>'),
      op.delete(123, 'OLD'),
    ];

    const result = applyAutolinkPlanDryRun(operations, env.mockCore);

    expect(result).toBe(3);
    expect(env.mockCore.info).toHaveBeenCalledWith('=== DRY RUN MODE ===');
    expect(env.mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would create autolink for NEW- -> https://example.atlassian.net/browse/NEW-<num>');
    expect(env.mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would update autolink 456 for UPDATE- -> https://new.com/UPDATE-<num>');
    expect(env.mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would delete autolink 123 for OLD-');
  });

  test('handles empty operations', () => {
    const operations: any[] = [];

    const result = applyAutolinkPlanDryRun(operations, env.mockCore);

    expect(result).toBe(0);
    expect(env.mockCore.info).toHaveBeenCalledWith('=== DRY RUN MODE ===');
    expect(env.mockCore.info).toHaveBeenCalledTimes(1);
  });
});
