import { describe, test, expect } from 'bun:test';
import { mockFetch } from '@aryzing/bun-mock-fetch';
import { syncAutolinks } from './index';
import { useTestEnv } from './test-support';
import { mockFetchJson } from './test-support';
import { jira, github, urls, fixtures } from './test-support';
import { mockInstantSetTimeout } from './test-support';

describe('syncAutolinks', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.basic });

  test('creates, updates, deletes, sets outputs', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: [
        { key: 'AAA', name: 'A', id: '1' },
        { key: 'BBB', name: 'B', id: '2' }
      ]
    });

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([
      github.autolink(10, 'AAA', urls.jiraBrowse('AAA')),
      github.autolink(11, 'BBB', 'https://old.example/browse/BBB-<num>'),
      github.autolink(12, 'NOTJIRA', 'https://foo'),
      github.autolink(13, 'OLD', urls.jiraBrowse('OLD'))
    ]);

    env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue({
      status: 204,
      url: 'https://api.github.com/repos/test/test/autolinks',
      headers: {}
    } as any);
    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 1, key_prefix: 'AAA-', url_template: 'https://example.atlassian.net/browse/AAA-<num>', is_alphanumeric: true },
      status: 201,
      url: 'https://api.github.com/repos/test/test/autolinks',
      headers: {}
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalled();
    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalled();

    const deleteCalls = env.githubMocks.octokit.rest.repos.deleteAutolink.mock.calls;
    const deletedIds = deleteCalls.map((call: any) => call[0].autolink_id);

    expect(deletedIds).not.toContain(12); // Should not delete non-JIRA autolinks

    expect(env.mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 2);
    expect(env.mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', expect.any(Number));
  });

  test('creates new autolinks for new projects', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: [
        jira.project('NEW', 'New Project', '1')
      ]
    });

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);
    env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue({
      data: { id: 1, key_prefix: 'NEW-', url_template: 'https://example.atlassian.net/browse/NEW-<num>', is_alphanumeric: true },
      status: 201,
      url: 'https://api.github.com/repos/test/test/autolinks',
      headers: {}
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: env.owner,
      repo: env.repo,
      key_prefix: 'NEW-',
      url_template: urls.jiraBrowse('NEW'),
      is_alphanumeric: true
    });

    expect(env.mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 1);
    expect(env.mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 1);
  });

  test('skips when autolink is up to date', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: [
        jira.project('SAME', 'Same', '1')
      ]
    });

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([
      github.autolink(10, 'SAME', urls.jiraBrowse('SAME'))
    ]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
  });

  test('handles failure and calls setFailed', async () => {
    mockFetch(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, () => {
      throw { code: 'ENOTFOUND', message: 'bad host' };
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve JIRA URL'));
  });

  test('error handling uses mapJiraError for JIRA errors', async () => {
    const jiraError = {
      response: {
        status: 418,
        data: { errorMessages: ['I am a teapot'] },
        headers: { 'retry-after': '60' }
      },
      message: 'teapot error'
    };

    mockFetch(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, () => {
      throw jiraError;
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).toHaveBeenCalledWith('JIRA API error (418): teapot error');
  });

  test('withRetry integration with JIRA API', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    mockInstantSetTimeout();

    try {
      let callCount = 0;
      mockFetch(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, () => {
        callCount++;
        if (callCount === 1) {
          throw { response: { status: 429, headers: { 'retry-after': '1' } } };
        }
        return new Response(JSON.stringify({
          isLast: true,
          values: [jira.project('RETRY', 'Retry Project', '1')]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });

      env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);
      env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue({
        data: { id: 1, key_prefix: 'RETRY-', url_template: 'https://example.atlassian.net/browse/RETRY-<num>', is_alphanumeric: true },
        status: 201,
        url: 'https://api.github.com/repos/test/test/autolinks',
        headers: {}
      });

      await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

      expect(callCount).toBe(2);
      expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: env.owner,
        repo: env.repo,
        key_prefix: 'RETRY-',
        url_template: urls.jiraBrowse('RETRY'),
        is_alphanumeric: true
      });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});

describe('syncAutolinks with custom repository', () => {
  const env = useTestEnv({
    inputs: {
      ...fixtures.inputs.basic,
      'repository': 'altOwner/altRepo'
    }
  });

  test('uses repository input when provided', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, { isLast: true, values: [] });
    env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.paginate)
      .toHaveBeenCalledWith(env.githubMocks.octokit.rest.repos.listAutolinks, { owner: 'altOwner', repo: 'altRepo', per_page: 100 });
  });
});

describe('syncAutolinks with dry-run', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.dryRun });

  test('dry-run mode skips API calls and reports planned operations', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: jira.projects(['PLAN1', 'PLAN2'])
    });

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([
      github.autolink(10, 'OLD', urls.jiraBrowse('OLD'))
    ]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();

    expect(env.mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 2);
    expect(env.mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 3);

    expect(env.mockCore.info).toHaveBeenCalledWith('=== DRY RUN MODE ===');
    expect(env.mockCore.info).toHaveBeenCalledWith(`[DRY RUN] Would create autolink for PLAN1- -> ${urls.jiraBrowse('PLAN1')}`);
  });
});

describe('syncAutolinks with 500 projects limit', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.basic });

  test('fails when more than 500 projects are returned', async () => {
    // Generate 501 projects
    const manyProjects = Array.from({ length: 501 }, (_, i) => ({
      key: `PROJ${i}`,
      name: `Project ${i}`,
      id: `${i}`
    }));

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: false,
      values: manyProjects.slice(0, 100)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=100&maxResults=100`, {
      isLast: false,
      values: manyProjects.slice(100, 200)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=200&maxResults=100`, {
      isLast: false,
      values: manyProjects.slice(200, 300)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=300&maxResults=100`, {
      isLast: false,
      values: manyProjects.slice(300, 400)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=400&maxResults=100`, {
      isLast: false,
      values: manyProjects.slice(400, 500)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=500&maxResults=100`, {
      isLast: true,
      values: manyProjects.slice(500, 501)
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Found 501 JIRA projects, but GitHub only supports up to 500 autolinks')
    );
    expect(env.mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('project-category-ids')
    );
    expect(env.mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('list-categories: true')
    );
  });

  test('succeeds when exactly 500 projects are returned', async () => {
    // Generate exactly 500 projects
    const projects = Array.from({ length: 500 }, (_, i) => ({
      key: `PROJ${i}`,
      name: `Project ${i}`,
      id: `${i}`
    }));

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: false,
      values: projects.slice(0, 100)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=100&maxResults=100`, {
      isLast: false,
      values: projects.slice(100, 200)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=200&maxResults=100`, {
      isLast: false,
      values: projects.slice(200, 300)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=300&maxResults=100`, {
      isLast: false,
      values: projects.slice(300, 400)
    });

    mockFetchJson(`${urls.jira}/rest/api/3/project/search?startAt=400&maxResults=100`, {
      isLast: true,
      values: projects.slice(400, 500)
    });

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).not.toHaveBeenCalledWith(
      expect.stringContaining('but GitHub only supports up to 500 autolinks')
    );
    expect(env.mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 500);
  });
});

describe('syncAutolinks with list-categories mode', () => {
  const env = useTestEnv({
    inputs: {
      ...fixtures.inputs.basic,
      'list-categories': 'true'
    }
  });

  test('lists categories and exits without syncing', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'FIRST', description: 'First Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10000' },
      { id: '10001', name: 'SECOND', description: 'Second Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10001' }
    ]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.info).toHaveBeenCalledWith('Running in list-categories mode');
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Found 2 project categories'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('ID: 10000, Name: FIRST'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('ID: 10001, Name: SECOND'));
    expect(env.mockCore.info).toHaveBeenCalledWith(expect.stringContaining('project-category-ids'));

    // Should not perform any sync operations
    expect(env.githubMocks.octokit.paginate).not.toHaveBeenCalled();
    expect(env.mockCore.setOutput).not.toHaveBeenCalled();
  });

  test('handles list-categories error and calls setFailed', async () => {
    mockFetch(`${urls.jira}/rest/api/3/projectCategory`, () => {
      throw { code: 'ENOTFOUND', message: 'bad host' };
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve JIRA URL'));
  });
});
