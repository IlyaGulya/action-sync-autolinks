import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { syncAutolinks } from './index';

const jiraUrl = 'https://example.atlassian.net';

describe('syncAutolinks', () => {
  let mockCore: any, githubLib: any, fetchSpy: any, fakeOctokit: any;

  beforeEach(() => {
    fetchSpy = spyOn(global, 'fetch');
    mockCore = {
      getInput: mock(),
      setOutput: mock(),
      setFailed: mock(),
      info: mock(),
      error: mock()
    };

    mockCore.getInput.mockImplementation((name: string) => {
      const map: Record<string, string> = {
        'github-token': 'ghs123',
        'jira-url': 'https://example.atlassian.net',
        'jira-username': 'u',
        'jira-api-token': 't',
        'repository': '' // simulate default
      };
      return map[name];
    });

    fakeOctokit = {
      rest: {
        repos: {
          listAutolinks: mock(),
          createAutolink: mock(),
          deleteAutolink: mock()
        }
      },
      paginate: mock()
    };

    githubLib = {
      context: { repo: { owner: 'org', repo: 'repo' } },
      getOctokit: mock().mockReturnValue(fakeOctokit)
    };

  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('creates, updates, deletes, sets outputs', async () => {
    // JIRA returns 2 projects
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { key: 'AAA', name: 'A', id: '1' },
        { key: 'BBB', name: 'B', id: '2' }
      ]),
      headers: new Map()
    });

    // Existing: one up-to-date, one wrong template, one obsolete non-JIRA, one obsolete JIRA
    fakeOctokit.paginate.mockResolvedValueOnce([
      { id: 10, key_prefix: 'AAA-', url_template: 'https://example.atlassian.net/browse/AAA-<num>' },
      { id: 11, key_prefix: 'BBB-', url_template: 'https://old.example/browse/BBB-<num>' },
      { id: 12, key_prefix: 'NOTJIRA-', url_template: 'https://foo' },
      { id: 13, key_prefix: 'OLD-', url_template: 'https://example.atlassian.net/browse/OLD-<num>' }
    ]);

    fakeOctokit.rest.repos.deleteAutolink.mockResolvedValue({});
    fakeOctokit.rest.repos.createAutolink.mockResolvedValue({ data: {} });

    await syncAutolinks({ core: mockCore, githubLib });

    // Check that deleteAutolink was called (exact calls may vary)
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalled();
    expect(fakeOctokit.rest.repos.createAutolink).toHaveBeenCalled();

    // Should delete obsolete JIRA autolinks but preserve non-JIRA ones
    const deleteCalls = fakeOctokit.rest.repos.deleteAutolink.mock.calls;
    const deletedIds = deleteCalls.map((call: any) => call[0].autolink_id);

    // Should NOT delete NOTJIRA- (id 12)
    expect(deletedIds).not.toContain(12);

    // Outputs - should be operations applied, not existing autolinks count
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 2);
    expect(mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', expect.any(Number));
  });

  test('creates new autolinks for new projects', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ key: 'NEW', name: 'New Project', id: '1' }]),
      headers: new Map()
    });

    fakeOctokit.paginate.mockResolvedValueOnce([]);
    fakeOctokit.rest.repos.createAutolink.mockResolvedValue({ data: {} });

    await syncAutolinks({ core: mockCore, githubLib });

    expect(fakeOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'repo',
      key_prefix: 'NEW-',
      url_template: 'https://example.atlassian.net/browse/NEW-<num>',
      is_alphanumeric: true
    });

    // Outputs
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 1);
    expect(mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 1);
  });

  test('skips when autolink is up to date', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ key: 'SAME', name: 'Same', id: '1' }]),
      headers: new Map()
    });

    fakeOctokit.paginate.mockResolvedValueOnce([
      { id: 10, key_prefix: 'SAME-', url_template: 'https://example.atlassian.net/browse/SAME-<num>' }
    ]);

    await syncAutolinks({ core: mockCore, githubLib });

    // Should not create or delete anything
    expect(fakeOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
  });

  test('handles failure and calls setFailed', async () => {
    fetchSpy.mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'bad host' });

    await syncAutolinks({ core: mockCore, githubLib });

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Cannot resolve JIRA URL')
    );
  });

  test('no projects still prunes obsolete JIRA autolinks and outputs 0', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Map()
    });
    fakeOctokit.paginate.mockResolvedValueOnce([
      { id: 1, key_prefix: 'JIRA-', url_template: 'https://example.atlassian.net/browse/JIRA-<num>' },
      { id: 2, key_prefix: 'TICKET-', url_template: 'https://example.atlassian.net/browse/TICKET-<num>' },
      { id: 3, key_prefix: 'NONJ-', url_template: 'https://other.com/browse/NONJ-<num>' },
      { id: 4, key_prefix: 'OTHER', url_template: 'https://example.atlassian.net/browse/OTHER-<num>' },
      { id: 5, key_prefix: 'AAA-', url_template: `${jiraUrl}/browse/AAA-<num>` }
    ]);
    fakeOctokit.rest.repos.deleteAutolink.mockResolvedValue({});
    
    await syncAutolinks({ core: mockCore, githubLib });
    
    // Should delete JIRA- and TICKET- (ends with - and contains jiraUrl)
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 1
    });
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 2
    });
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 5
    });

    // Should NOT delete NONJ- (different URL) or OTHER (doesn't end with -)
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 3
    });
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 4
    });
    
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 0);
    expect(mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 3);
  });

  test('uses repository input when provided', async () => {
    mockCore.getInput.mockImplementation((name: string) => {
      const map: Record<string, string> = {
        'github-token': 'gh',
        'jira-url': jiraUrl,
        'jira-username': 'u',
        'jira-api-token': 't',
        'repository': 'altOwner/altRepo'
      };
      return map[name];
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Map()
    });
    fakeOctokit.paginate.mockResolvedValueOnce([]);

    await syncAutolinks({ core: mockCore, githubLib });

    // Ensure octokit calls carry altOwner/altRepo
    expect(fakeOctokit.paginate)
      .toHaveBeenCalledWith(fakeOctokit.rest.repos.listAutolinks, { owner: 'altOwner', repo: 'altRepo', per_page: 100 });
  });

  test('dry-run mode skips API calls and reports planned operations', async () => {
    mockCore.getInput.mockImplementation((name: string) => {
      const map: Record<string, string> = {
        'github-token': 'ghs123',
        'jira-url': jiraUrl,
        'jira-username': 'u',
        'jira-api-token': 't',
        'repository': '',
        'dry-run': 'true'
      };
      return map[name];
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { key: 'PLAN1', name: 'Project 1', id: '1' },
        { key: 'PLAN2', name: 'Project 2', id: '2' }
      ]),
      headers: new Map()
    });

    fakeOctokit.paginate.mockResolvedValueOnce([
      { id: 10, key_prefix: 'OLD-', url_template: `${jiraUrl}/browse/OLD-<num>` }
    ]);

    await syncAutolinks({ core: mockCore, githubLib });

    // Should not make any mutations
    expect(fakeOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();

    // Should report planned operations (2 creates + 1 delete = 3)
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 2);
    expect(mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 3);

    // Should log dry-run messages
    expect(mockCore.info).toHaveBeenCalledWith('=== DRY RUN MODE ===');
    expect(mockCore.info).toHaveBeenCalledWith('[DRY RUN] Would create autolink for PLAN1- -> https://example.atlassian.net/browse/PLAN1-<num>');
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

    fetchSpy.mockRejectedValueOnce(jiraError);

    await syncAutolinks({ core: mockCore, githubLib });

    expect(mockCore.setFailed).toHaveBeenCalledWith('JIRA API error (418): teapot error');
  });

  test('error handling maps JIRA timeout/AbortError', async () => {
    const abortError = Object.assign(new Error('timeout'), { name: 'AbortError' });
    fetchSpy.mockRejectedValueOnce(abortError);

    await syncAutolinks({ core: mockCore, githubLib });

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'JIRA API request timed out. Please check your network connection or try again later.'
    );
  });

  test('error handling maps network errors', async () => {
    const networkError = Object.assign(new Error('Connection failed'), { code: 'ENOTFOUND' });
    fetchSpy.mockRejectedValueOnce(networkError);

    await syncAutolinks({ core: mockCore, githubLib });

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'Cannot resolve JIRA URL. Please check that the JIRA URL is correct and accessible.'
    );
  });

  test('withRetry integration with JIRA API', async () => {
    // First call returns 429, second call succeeds
    fetchSpy
      .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '1' } } })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ key: 'RETRY', name: 'Retry Project', id: '1' }]),
        headers: new Map()
      });

    fakeOctokit.paginate.mockResolvedValueOnce([]);
    fakeOctokit.rest.repos.createAutolink.mockResolvedValue({ data: {} });

    await syncAutolinks({ core: mockCore, githubLib });

    // Should have retried and succeeded
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fakeOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'repo',
      key_prefix: 'RETRY-',
      url_template: 'https://example.atlassian.net/browse/RETRY-<num>',
      is_alphanumeric: true
    });
  });

  test('maps unknown error without message', async () => {
    fetchSpy.mockRejectedValueOnce({});
    await syncAutolinks({ core: mockCore, githubLib });
    expect(mockCore.setFailed).toHaveBeenCalledWith('Network error connecting to JIRA: undefined');
  });
});

