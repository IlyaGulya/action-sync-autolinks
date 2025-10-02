import { describe, test, expect } from 'bun:test';
import { mockFetch } from '@aryzing/bun-mock-fetch';
import { run } from './index';
import { useTestEnv } from './test-support';
import { mockFetchJson } from './test-support';
import { urls, fixtures } from './test-support';

describe('run (main entry point) - action delegation - sync', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.basic });

  test('delegates to sync action when action input is "sync"', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: []
    });
    env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);

    await run({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Syncing autolinks'));
  });
});

describe('run (main entry point) - action delegation - list-categories', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.listCategories });

  test('delegates to list-categories action when action input is "list-categories"', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'FIRST', description: 'First Category' }
    ]);

    await run({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith('Running in list-categories mode');
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Found 1 project categories'));
  });
});

describe('run (main entry point) - action delegation - defaults', () => {
  const env = useTestEnv({
    inputs: {
      ...fixtures.inputs.basic,
      'action': '' // Empty action
    }
  });

  test('defaults to sync action when no action input is provided', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: []
    });
    env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);

    await run({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Syncing autolinks'));
  });
});

describe('run (main entry point) - action delegation - invalid action', () => {
  const env = useTestEnv({
    inputs: {
      ...fixtures.inputs.basic,
      'action': 'invalid-action'
    }
  });

  test('handles invalid action input', async () => {
    await run({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).toHaveBeenCalledWith('Invalid action: invalid-action. Valid actions are: sync, list-categories');
  });
});

describe('run (main entry point) - error handling', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.basic });

  test('catches and reports unexpected errors', async () => {
    // Mock fetch to throw an unexpected error (not JIRA-related)
    mockFetch(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, () => {
      throw new Error('Network failure');
    });

    await run({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    // The error should be caught in the action's own error handling
    expect(env.mockCore.setFailed).toHaveBeenCalled();
  });
});

