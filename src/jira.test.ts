import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { getJiraQueues } from './jira';

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
    expect(getJiraQueues(jiraUrl, username, token, http))
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
    expect(getJiraQueues(jiraUrl, username, token, http))
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
    expect(getJiraQueues(jiraUrl, username, token, http))
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
    expect(getJiraQueues(jiraUrl, username, token, http))
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
    expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow(`JIRA server error (${status})`);
  });

  test('Network error mapping (AbortError)', async () => {
    http.mockRejectedValueOnce({ name: 'AbortError', message: 'timeout' });
    expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('request timed out');
  });

  test('Network error mapping (ENOTFOUND)', async () => {
    http.mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'host not found' });
    expect(getJiraQueues(jiraUrl, username, token, http))
      .rejects.toThrow('Cannot resolve JIRA URL');
  });

  test('Network error mapping (ECONNREFUSED)', async () => {
    http.mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'connection refused' });
    expect(getJiraQueues(jiraUrl, username, token, http))
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
