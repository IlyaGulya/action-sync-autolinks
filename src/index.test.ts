import { describe, test, expect } from 'bun:test';
import { mockFetch } from '@aryzing/bun-mock-fetch';
import { syncAutolinks } from './index';
import { useTestEnv } from './test-support/use-test-env';
import { mockFetchJson } from './test-support/fetch';
import { expectSetOutput, expectSetFailed, expectInfoLogged } from './test-support/expect';
import { jira, github, urls, fixtures } from './test-support/fixtures';

describe('syncAutolinks', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.basic });

  test('creates, updates, deletes, sets outputs', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project`, [
      { key: 'AAA', name: 'A', id: '1' },
      { key: 'BBB', name: 'B', id: '2' }
    ]);

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

    expect(env.coreSpies.setOutput).toHaveBeenCalledWith('projects-synced', 2);
    expect(env.coreSpies.setOutput).toHaveBeenCalledWith('autolinks-processed', expect.any(Number));
  });

  test('creates new autolinks for new projects', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project`, [
      jira.project('NEW', 'New Project', '1')
    ]);

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

    expectSetOutput(env.coreSpies, 'projects-synced', 1);
    expectSetOutput(env.coreSpies, 'autolinks-processed', 1);
  });

  test('skips when autolink is up to date', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project`, [
      jira.project('SAME', 'Same', '1')
    ]);

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([
      github.autolink(10, 'SAME', urls.jiraBrowse('SAME'))
    ]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
  });

  test('handles failure and calls setFailed', async () => {
    mockFetch(`${urls.jira}/rest/api/3/project`, () => {
      throw { code: 'ENOTFOUND', message: 'bad host' };
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expectSetFailed(env.coreSpies, expect.stringContaining('Cannot resolve JIRA URL'));
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

    mockFetch(`${urls.jira}/rest/api/3/project`, () => {
      throw jiraError;
    });

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expectSetFailed(env.coreSpies, 'JIRA API error (418): teapot error');
  });

  test('withRetry integration with JIRA API', async () => {
    let callCount = 0;
    mockFetch(`${urls.jira}/rest/api/3/project`, () => {
      callCount++;
      if (callCount === 1) {
        throw { response: { status: 429, headers: { 'retry-after': '1' } } };
      }
      return new Response(JSON.stringify([jira.project('RETRY', 'Retry Project', '1')]), {
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
    mockFetchJson(`${urls.jira}/rest/api/3/project`, []);
    env.githubMocks.octokit.paginate.mockResolvedValueOnce([]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.paginate)
      .toHaveBeenCalledWith(env.githubMocks.octokit.rest.repos.listAutolinks, { owner: 'altOwner', repo: 'altRepo', per_page: 100 });
  });
});

describe('syncAutolinks with dry-run', () => {
  const env = useTestEnv({ inputs: fixtures.inputs.dryRun });

  test('dry-run mode skips API calls and reports planned operations', async () => {
    mockFetchJson(`${urls.jira}/rest/api/3/project`, jira.projects(['PLAN1', 'PLAN2']));

    env.githubMocks.octokit.paginate.mockResolvedValueOnce([
      github.autolink(10, 'OLD', urls.jiraBrowse('OLD'))
    ]);

    await syncAutolinks({ core: env.mockCore, githubLib: env.githubMocks.githubLib });

    expect(env.githubMocks.octokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(env.githubMocks.octokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();

    expectSetOutput(env.coreSpies, 'projects-synced', 2);
    expectSetOutput(env.coreSpies, 'autolinks-processed', 3);

    expectInfoLogged(env.coreSpies, '=== DRY RUN MODE ===');
    expectInfoLogged(env.coreSpies, `[DRY RUN] Would create autolink for PLAN1- -> ${urls.jiraBrowse('PLAN1')}`);
  });
});