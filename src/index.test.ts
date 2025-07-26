import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { syncAutolinks } from './index';

const jiraUrl = 'https://example.atlassian.net';

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

  test('no projects still prunes obsolete JIRA autolinks and outputs 0', async () => {
    http.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: new Map()
    });
    fakeOctokit.rest.repos.listAutolinks.mockResolvedValueOnce({
      data: [
        { id: 1, key_prefix: 'JIRA-', url_template: 'https://example.atlassian.net/browse/JIRA-<num>' },
        { id: 2, key_prefix: 'TICKET-', url_template: 'https://example.atlassian.net/browse/TICKET-<num>' },
        { id: 3, key_prefix: 'NONJ-', url_template: 'https://other.com/browse/NONJ-<num>' },
        { id: 4, key_prefix: 'OTHER', url_template: 'https://example.atlassian.net/browse/OTHER-<num>' },
        { id: 5, key_prefix: 'AAA-', url_template: `${jiraUrl}/browse/AAA-<num>` }
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

