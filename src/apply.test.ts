import { describe, test, expect } from 'bun:test';
import { applyAutolinkPlan, applyAutolinkOp, applyAutolinkPlanDryRun } from './apply';
import { useTestEnv } from './test-support';
import { op } from './test-support';
import { expectInfoLogged, expectErrorLogged } from './test-support';

describe('applyAutolinkOp', () => {
  const env = useTestEnv();

  test('applies create operation', async () => {
    const operation = op.create('TEST');

    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 123, key_prefix: 'TEST-', url_template: operation.urlTemplate, is_alphanumeric: true },
      status: 201,
      url: 'https://api.github.com/repos/test/test/autolinks',
      headers: {}
    });

    await applyAutolinkOp(env.githubMocks.octokit, env.owner, env.repo, operation, env.mockCore);

    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      key_prefix: 'TEST-',
      url_template: 'https://example.atlassian.net/browse/TEST-<num>',
      is_alphanumeric: true
    });
    expectInfoLogged(env.coreSpies, 'Creating autolink for TEST-');
  });

  test('applies update operation', async () => {
    const operation = op.update(456, 'UPDATE', 'https://new.atlassian.net/browse/UPDATE-<num>');

    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue({
      status: 204,
      url: 'https://api.github.com/repos/test/test/autolinks/456',
      headers: {}
    } as any);
    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 789, key_prefix: 'UPDATE-', url_template: operation.urlTemplate, is_alphanumeric: true },
      status: 201,
      url: 'https://api.github.com/repos/test/test/autolinks',
      headers: {}
    });

    await applyAutolinkOp(env.githubMocks.octokit, env.owner, env.repo, operation, env.mockCore);

    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      autolink_id: 456
    });
    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      key_prefix: 'UPDATE-',
      url_template: 'https://new.atlassian.net/browse/UPDATE-<num>',
      is_alphanumeric: true
    });
    expectInfoLogged(env.coreSpies, 'Updating autolink for UPDATE-');
  });

  test('applies delete operation', async () => {
    const operation = op.delete(789, 'OLD');

    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue({
      status: 204,
      url: 'https://api.github.com/repos/test/test/autolinks/789',
      headers: {}
    } as any);

    await applyAutolinkOp(env.githubMocks.octokit, env.owner, env.repo, operation, env.mockCore);

    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      autolink_id: 789
    });
    expectInfoLogged(env.coreSpies, 'Deleting obsolete autolink: OLD-');
  });
});

describe('applyAutolinkPlan', () => {
  const env = useTestEnv();

  test('applies multiple operations successfully', async () => {
    const operations = [
      op.create('NEW'),
      op.delete(123, 'OLD')
    ];

    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 1, key_prefix: 'NEW-', url_template: 'https://example.atlassian.net/browse/NEW-<num>', is_alphanumeric: true },
      status: 201,
      url: 'https://api.github.com/repos/test/test/autolinks',
      headers: {}
    });
    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue({
      status: 204,
      url: 'https://api.github.com/repos/test/test/autolinks/123',
      headers: {}
    } as any);

    const result = await applyAutolinkPlan(env.githubMocks.octokit, env.owner, env.repo, operations, env.mockCore);

    expect(result).toBe(2);
    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledTimes(1);
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledTimes(1);
  });

  test('stops on error and rethrows', async () => {
    const operations = [
      op.create('NEW'),
      op.delete(123, 'OLD')
    ];

    env.githubMocks.octokit.rest.repos.createAutolink.mockRejectedValue(new Error('GitHub API error'));

    expect(applyAutolinkPlan(env.githubMocks.octokit, env.owner, env.repo, operations, env.mockCore))
      .rejects.toThrow('GitHub API error');

    expectErrorLogged(env.coreSpies, expect.stringContaining('Failed to apply create operation for NEW-'));
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
  });
});

describe('applyAutolinkPlanDryRun', () => {
  const env = useTestEnv();

  test('logs dry-run operations correctly', () => {
    const operations = [
      op.create('NEW'),
      op.update(456, 'UPDATE', 'https://new.com/UPDATE-<num>'),
      op.delete(123, 'OLD')
    ];

    const result = applyAutolinkPlanDryRun(operations, env.mockCore);

    expect(result).toBe(3);
    expectInfoLogged(env.coreSpies, '=== DRY RUN MODE ===');
    expectInfoLogged(env.coreSpies, '[DRY RUN] Would create autolink for NEW- -> https://example.atlassian.net/browse/NEW-<num>');
    expectInfoLogged(env.coreSpies, '[DRY RUN] Would update autolink 456 for UPDATE- -> https://new.com/UPDATE-<num>');
    expectInfoLogged(env.coreSpies, '[DRY RUN] Would delete autolink 123 for OLD-');
  });

  test('handles empty operations', () => {
    const operations: any[] = [];

    const result = applyAutolinkPlanDryRun(operations, env.mockCore);

    expect(result).toBe(0);
    expectInfoLogged(env.coreSpies, '=== DRY RUN MODE ===');
    expect(env.coreSpies.info).toHaveBeenCalledTimes(1);
  });
});
