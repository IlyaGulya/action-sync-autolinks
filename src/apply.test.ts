import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { applyAutolinkPlan, applyAutolinkOp, applyAutolinkPlanDryRun } from './apply';
import { AutolinkOpCreate, AutolinkOpUpdate, AutolinkOpDelete } from './plan';

describe('applyAutolinkOp', () => {
  let mockOctokit: any, mockCore: any;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        repos: {
          createAutolink: mock(),
          deleteAutolink: mock()
        }
      }
    };

    mockCore = {
      info: mock(),
      error: mock()
    };
  });

  test('applies create operation', async () => {
    const operation: AutolinkOpCreate = {
      kind: 'create',
      keyPrefix: 'TEST-',
      urlTemplate: 'https://example.atlassian.net/browse/TEST-<num>'
    };

    mockOctokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 123, key_prefix: 'TEST-', url_template: operation.urlTemplate }
    });

    await applyAutolinkOp(mockOctokit, 'owner', 'repo', operation, mockCore);

    expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      key_prefix: 'TEST-',
      url_template: 'https://example.atlassian.net/browse/TEST-<num>',
      is_alphanumeric: true
    });
    expect(mockCore.info).toHaveBeenCalledWith('Creating autolink for TEST-');
  });

  test('applies update operation', async () => {
    const operation: AutolinkOpUpdate = {
      kind: 'update',
      autolinkId: 456,
      keyPrefix: 'UPDATE-',
      urlTemplate: 'https://new.atlassian.net/browse/UPDATE-<num>'
    };

    mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});
    mockOctokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 789, key_prefix: 'UPDATE-', url_template: operation.urlTemplate }
    });

    await applyAutolinkOp(mockOctokit, 'owner', 'repo', operation, mockCore);

    expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      autolink_id: 456
    });
    expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      key_prefix: 'UPDATE-',
      url_template: 'https://new.atlassian.net/browse/UPDATE-<num>',
      is_alphanumeric: true
    });
    expect(mockCore.info).toHaveBeenCalledWith('Updating autolink for UPDATE-');
  });

  test('applies delete operation', async () => {
    const operation: AutolinkOpDelete = {
      kind: 'delete',
      autolinkId: 789,
      keyPrefix: 'OLD-'
    };

    mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});

    await applyAutolinkOp(mockOctokit, 'owner', 'repo', operation, mockCore);

    expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      autolink_id: 789
    });
    expect(mockCore.info).toHaveBeenCalledWith('Deleting obsolete autolink: OLD-');
  });
});

describe('applyAutolinkPlan', () => {
  let mockOctokit: any, mockCore: any;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        repos: {
          createAutolink: mock(),
          deleteAutolink: mock()
        }
      }
    };

    mockCore = {
      info: mock(),
      error: mock()
    };
  });

  test('applies multiple operations successfully', async () => {
    const operations = [
      { kind: 'create' as const, keyPrefix: 'NEW-', urlTemplate: 'https://example.com/NEW-<num>' },
      { kind: 'delete' as const, autolinkId: 123, keyPrefix: 'OLD-' }
    ];

    mockOctokit.rest.repos.createAutolink.mockResolvedValue({ data: {} });
    mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});

    const result = await applyAutolinkPlan(mockOctokit, 'owner', 'repo', operations, mockCore);

    expect(result).toBe(2);
    expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledTimes(1);
    expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledTimes(1);
  });


  test('stops on error and rethrows', async () => {
    const operations = [
      { kind: 'create' as const, keyPrefix: 'NEW-', urlTemplate: 'https://example.com/NEW-<num>' },
      { kind: 'delete' as const, autolinkId: 123, keyPrefix: 'OLD-' }
    ];

    mockOctokit.rest.repos.createAutolink.mockRejectedValue(new Error('GitHub API error'));

    await expect(applyAutolinkPlan(mockOctokit, 'owner', 'repo', operations, mockCore))
      .rejects.toThrow('GitHub API error');

    expect(mockCore.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply create operation for NEW-')
    );
    expect(mockOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
  });
});

describe('applyAutolinkPlanDryRun', () => {
  let mockCore: any;

  beforeEach(() => {
    mockCore = {
      info: mock()
    };
  });

  test('logs dry-run operations correctly', () => {
    const operations = [
      { kind: 'create' as const, keyPrefix: 'NEW-', urlTemplate: 'https://example.com/NEW-<num>' },
      { kind: 'update' as const, autolinkId: 456, keyPrefix: 'UPDATE-', urlTemplate: 'https://new.com/UPDATE-<num>' },
      { kind: 'delete' as const, autolinkId: 123, keyPrefix: 'OLD-' }
    ];

    const result = applyAutolinkPlanDryRun(operations, mockCore);

    expect(result).toBe(3);
    expect(mockCore.info).toHaveBeenCalledWith('=== DRY RUN MODE ===');
    expect(mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would create autolink for NEW- -> https://example.com/NEW-<num>');
    expect(mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would update autolink 456 for UPDATE- -> https://new.com/UPDATE-<num>');
    expect(mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would delete autolink 123 for OLD-');
  });

  test('handles empty operations', () => {
    const operations: any[] = [];

    const result = applyAutolinkPlanDryRun(operations, mockCore);

    expect(result).toBe(0);
    expect(mockCore.info).toHaveBeenCalledWith('=== DRY RUN MODE ===');
    expect(mockCore.info).toHaveBeenCalledTimes(1);
  });
});
