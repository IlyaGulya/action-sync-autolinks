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

    await applyAutolinkOp(env.githubMocks.octokit, env.owner, env.repo, operation, env.mockCore);

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

    await applyAutolinkOp(env.githubMocks.octokit, env.owner, env.repo, operation, env.mockCore);

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

    await applyAutolinkOp(env.githubMocks.octokit, env.owner, env.repo, operation, env.mockCore);

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

    const result = await applyAutolinkPlan(env.githubMocks.octokit, env.owner, env.repo, operations, env.mockCore);

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

    expect(applyAutolinkPlan(env.githubMocks.octokit, env.owner, env.repo, operations, env.mockCore))
      .rejects.toThrow('GitHub API error');

    expect(env.mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to apply create operation for NEW-'));
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
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
