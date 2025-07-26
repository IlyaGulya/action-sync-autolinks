import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { getJiraQueues, syncAutolinks, getExistingAutolinks, createAutolink, deleteAutolink } from './index';

const jiraUrl = 'https://example.atlassian.net';
const username = 'u';
const token = 't';

describe('getJiraQueues', () => {
  let http: any;

  beforeEach(() => {
    http = mock();
  });

  test('happy path maps and filters projects', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { key: 'AAA', name: 'Proj A', id: '1' },
        { name: 'No Key', id: '2' },
        { key: 'BBB', name: 'Proj B', id: '3' }
      ]),
      headers: new Map()
    });

    const res = await getJiraQueues(jiraUrl, username, token, http);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1' },
      { key: 'BBB', name: 'Proj B', id: '3' }
    ]);

    expect(http).toHaveBeenCalledWith(
      `${jiraUrl}/rest/api/3/project`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic ')
        }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  test('invalid response format throws', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ foo: 'bar' }),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Invalid response format');
  });

  test('HTTP status mapping (401)', async () => {
    http.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ errorMessages: ['Invalid credentials'] }),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('JIRA authentication failed');
  });

  test('401 appends errorMessages details', async () => {
    http.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ errorMessages: ['Bad token', 'Another msg'] }),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Bad token, Another msg');
  });

  test('HTTP status mapping (403)', async () => {
    http.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ errorMessages: ['Forbidden'] }),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Access denied to JIRA projects');
  });

  test('HTTP status mapping (404)', async () => {
    http.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({}),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('JIRA instance not found');
  });

  test('HTTP status mapping (429 w/ retry header)', async () => {
    const headers = new Map();
    headers.set('retry-after', '42');
    http.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () => Promise.resolve({}),
      headers
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('rate limit exceeded. Retry after: 42 seconds');
  });

  test('HTTP 429 without retry-after uses "unknown"', async () => {
    http.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () => Promise.resolve({}),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Retry after: unknown seconds');
  });

  test('HTTP status mapping (500)', async () => {
    http.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('JIRA server error (500)');
  });

  test.each([502, 503, 504])('HTTP status mapping (%i)', async (status: number) => {
    http.mockResolvedValueOnce({
      ok: false,
      status,
      statusText: `Server Error ${status}`,
      json: () => Promise.resolve({}),
      headers: new Map()
    });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow(`JIRA server error (${status})`);
  });

  test('Network error mapping (AbortError)', async () => {
    http.mockRejectedValueOnce({ name: 'AbortError', message: 'timeout' });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('request timed out');
  });

  test('Network error mapping (ENOTFOUND)', async () => {
    http.mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'host not found' });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Cannot resolve JIRA URL');
  });

  test('Network error mapping (ECONNREFUSED)', async () => {
    http.mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'connection refused' });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Connection to JIRA refused');
  });

  test('Network error mapping (SSL)', async () => {
    http.mockRejectedValueOnce({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'ssl error' });
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('SSL certificate verification failed');
  });

  test('Unknown error shape falls back to generic message', async () => {
    http.mockRejectedValueOnce({ message: 'weird failure' }); // no response/code
    await expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Network error connecting to JIRA');
  });
});

describe('syncAutolinks', () => {
  let mockCore: any, githubLib: any, http: any, fakeOctokit: any;

  beforeEach(() => {
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
      }
    };

    githubLib = {
      context: { repo: { owner: 'org', repo: 'repo' } },
      getOctokit: mock().mockReturnValue(fakeOctokit)
    };

    http = mock();
  });

  test('creates, updates, deletes, sets outputs', async () => {
    // JIRA returns 2 projects
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { key: 'AAA', name: 'A', id: '1' },
        { key: 'BBB', name: 'B', id: '2' }
      ]),
      headers: new Map()
    });

    // Existing: one up-to-date, one wrong template, one obsolete non-JIRA, one obsolete JIRA
    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({
      data: [
        { id: 10, key_prefix: 'AAA-', url_template: 'https://example.atlassian.net/browse/AAA-<num>' },
        { id: 11, key_prefix: 'BBB-', url_template: 'https://old.example/browse/BBB-<num>' },
        { id: 12, key_prefix: 'NOTJIRA-', url_template: 'https://foo' },
        { id: 13, key_prefix: 'OLD-', url_template: 'https://example.atlassian.net/browse/OLD-<num>' }
      ]
    });

    fakeOctokit.rest.repos.deleteAutolink.mockResolvedValue({});
    fakeOctokit.rest.repos.createAutolink.mockResolvedValue({ data: {} });

    await syncAutolinks({ core: mockCore, githubLib, http });

    // Check that deleteAutolink was called (exact calls may vary)
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalled();
    expect(fakeOctokit.rest.repos.createAutolink).toHaveBeenCalled();

    // Should delete obsolete JIRA autolinks but preserve non-JIRA ones
    const deleteCalls = fakeOctokit.rest.repos.deleteAutolink.mock.calls;
    const deletedIds = deleteCalls.map((call: any) => call[0].autolink_id);

    // Should NOT delete NOTJIRA- (id 12)
    expect(deletedIds).not.toContain(12);

    // Outputs
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 2);
    expect(mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 4);
  });

  test('creates new autolinks for new projects', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ key: 'NEW', name: 'New Project', id: '1' }]),
      headers: new Map()
    });

    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({ data: [] });
    fakeOctokit.rest.repos.createAutolink.mockResolvedValue({ data: {} });

    await syncAutolinks({ core: mockCore, githubLib, http });

    expect(fakeOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'repo',
      key_prefix: 'NEW-',
      url_template: 'https://example.atlassian.net/browse/NEW-<num>',
      is_alphanumeric: true
    });

    // Outputs
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 1);
    expect(mockCore.setOutput).toHaveBeenCalledWith('autolinks-processed', 0);
  });

  test('skips when autolink is up to date', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ key: 'SAME', name: 'Same', id: '1' }]),
      headers: new Map()
    });

    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({
      data: [
        { id: 10, key_prefix: 'SAME-', url_template: 'https://example.atlassian.net/browse/SAME-<num>' }
      ]
    });

    await syncAutolinks({ core: mockCore, githubLib, http });

    // Should not create or delete anything
    expect(fakeOctokit.rest.repos.createAutolink).not.toHaveBeenCalled();
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalled();
  });

  test('handles failure and calls setFailed', async () => {
    http.mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'bad host' });

    await syncAutolinks({ core: mockCore, githubLib, http });

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Cannot resolve JIRA URL')
    );
  });

  test('deletes only obsolete JIRA-looking autolinks', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Map()
    }); // No JIRA projects

    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({
      data: [
        { id: 1, key_prefix: 'JIRA-', url_template: 'https://example.atlassian.net/browse/JIRA-<num>' },
        { id: 2, key_prefix: 'TICKET-', url_template: 'https://example.atlassian.net/browse/TICKET-<num>' },
        { id: 3, key_prefix: 'NONJ-', url_template: 'https://other.com/browse/NONJ-<num>' },
        { id: 4, key_prefix: 'OTHER', url_template: 'https://example.atlassian.net/browse/OTHER-<num>' }
      ]
    });

    fakeOctokit.rest.repos.deleteAutolink.mockResolvedValue({});

    await syncAutolinks({ core: mockCore, githubLib, http });

    // Should delete JIRA- and TICKET- (ends with - and contains jiraUrl)
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 1
    });
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 2
    });

    // Should NOT delete NONJ- (different URL) or OTHER (doesn't end with -)
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 3
    });
    expect(fakeOctokit.rest.repos.deleteAutolink).not.toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 4
    });
  });

  test('no projects still prunes obsolete JIRA autolinks and outputs 0', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Map()
    });
    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({
      data: [{ id: 1, key_prefix: 'AAA-', url_template: `${jiraUrl}/browse/AAA-<num>` }]
    });
    await syncAutolinks({ core: mockCore, githubLib, http });
    expect(fakeOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'org', repo: 'repo', autolink_id: 1
    });
    expect(mockCore.setOutput).toHaveBeenCalledWith('projects-synced', 0);
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
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Map()
    });
    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({ data: [] });

    await syncAutolinks({ core: mockCore, githubLib, http });

    // Ensure octokit calls carry altOwner/altRepo
    expect(fakeOctokit.rest.repos.listAutolinks)
      .toHaveBeenCalledWith({ owner: 'altOwner', repo: 'altRepo' });
  });
});

describe('helper functions', () => {
  test('getExistingAutolinks returns data and handles errors', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          listAutolinks: mock().mockResolvedValue({ data: [{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }] })
        }
      }
    };

    const result = await getExistingAutolinks(mockOctokit as any, 'owner', 'repo');
    expect(result).toEqual([{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }]);

    // Test error handling
    mockOctokit.rest.repos.listAutolinks.mockRejectedValueOnce(new Error('API Error'));
    await expect(getExistingAutolinks(mockOctokit as any, 'owner', 'repo'))
      .rejects.toThrow('API Error');
  });

  test('createAutolink calls API and handles errors', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          createAutolink: mock().mockResolvedValue({ data: { id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true } })
        }
      }
    };

    const result = await createAutolink(mockOctokit as any, 'owner', 'repo', 'TEST-', 'https://test.com/<num>');
    expect(result).toEqual({ id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true });

    expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      key_prefix: 'TEST-',
      url_template: 'https://test.com/<num>',
      is_alphanumeric: true
    });

    // Test error handling
    mockOctokit.rest.repos.createAutolink.mockRejectedValueOnce(new Error('Create Error'));
    await expect(createAutolink(mockOctokit as any, 'owner', 'repo', 'TEST-', 'https://test.com/<num>'))
      .rejects.toThrow('Create Error');
  });

  test('deleteAutolink calls API and handles errors', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          deleteAutolink: mock().mockResolvedValue({})
        }
      }
    };

    await deleteAutolink(mockOctokit as any, 'owner', 'repo', 123);

    expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      autolink_id: 123
    });

    // Test error handling
    mockOctokit.rest.repos.deleteAutolink.mockRejectedValueOnce(new Error('Delete Error'));
    await expect(deleteAutolink(mockOctokit as any, 'owner', 'repo', 123))
      .rejects.toThrow('Delete Error');
  });
});
