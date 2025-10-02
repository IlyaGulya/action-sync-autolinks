import { describe, test, expect } from 'bun:test';
import { mockFetch } from '@aryzing/bun-mock-fetch';
import { executeListCategoriesAction } from './list-categories';
import { useTestEnv } from '../test-support';
import { mockFetchJson } from '../test-support';
import { urls, fixtures } from '../test-support';

describe('executeListCategoriesAction', () => {
  const env = useTestEnv({
    inputs: fixtures.inputs.listCategories
  });

  test('lists categories and exits without syncing', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'FIRST', description: 'First Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10000' },
      { id: '10001', name: 'SECOND', description: 'Second Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10001' }
    ]);

    await executeListCategoriesAction({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith('Running in list-categories mode');
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Found 2 project categories'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('ID: 10000, Name: FIRST'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('ID: 10001, Name: SECOND'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('filter-project-category-ids'));

    // Should not perform any sync operations
    expect(env.githubMocks.octokit.paginate).not.toHaveBeenCalled();
    expect(env.mockCore.setOutput).not.toHaveBeenCalled();
  });

  test('handles list-categories error and calls setFailed', async () => {
    mockFetch(`${urls.jira}/rest/api/3/projectCategory`, () => {
      throw { code: 'ENOTFOUND', message: 'bad host' };
    });

    await executeListCategoriesAction({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve JIRA URL'));
  });

  test('lists categories with descriptions', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'Category A', description: 'Description A' },
      { id: '10001', name: 'Category B', description: 'Description B' }
    ]);

    await executeListCategoriesAction({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Description A'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Description B'));
  });

  test('lists categories without descriptions', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'Category A' },
      { id: '10001', name: 'Category B' }
    ]);

    await executeListCategoriesAction({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('ID: 10000, Name: Category A'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('ID: 10001, Name: Category B'));
  });
});
