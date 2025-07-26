import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { getJiraQueues, mapJiraError } from './jira';

const jiraUrl = 'https://example.atlassian.net';
const username = 'u';
const token = 't';

describe('mapJiraError', () => {
  test.each([
    // HTTP response errors
    [
      { response: { status: 401, data: { errorMessages: ['Bad token'] }, headers: {} }, message: 'HTTP 401' },
      'JIRA authentication failed. Please check your username and API token. Details: Bad token'
    ],
    [
      { response: { status: 401, data: {}, headers: {} }, message: 'HTTP 401' },
      'JIRA authentication failed. Please check your username and API token.'
    ],
    [
      { response: { status: 403, data: { errorMessages: ['Forbidden'] }, headers: {} }, message: 'HTTP 403' },
      'Access denied to JIRA projects. Please check your permissions. Details: Forbidden'
    ],
    [
      { response: { status: 404, data: {}, headers: {} }, message: 'HTTP 404' },
      'JIRA instance not found. Please check your JIRA URL.'
    ],
    [
      { response: { status: 429, data: {}, headers: { 'retry-after': '42' } }, message: 'HTTP 429' },
      'JIRA API rate limit exceeded. Retry after: 42 seconds.'
    ],
    [
      { response: { status: 429, data: {}, headers: {} }, message: 'HTTP 429' },
      'JIRA API rate limit exceeded. Retry after: unknown seconds.'
    ],
    [
      { response: { status: 500, data: {}, headers: {} }, message: 'HTTP 500' },
      'JIRA server error (500). Please try again later or contact your JIRA administrator.'
    ],
    [
      { response: { status: 502, data: {}, headers: {} }, message: 'HTTP 502' },
      'JIRA server error (502). Please try again later or contact your JIRA administrator.'
    ],
    [
      { response: { status: 503, data: {}, headers: {} }, message: 'HTTP 503' },
      'JIRA server error (503). Please try again later or contact your JIRA administrator.'
    ],
    [
      { response: { status: 504, data: {}, headers: {} }, message: 'HTTP 504' },
      'JIRA server error (504). Please try again later or contact your JIRA administrator.'
    ],
    [
      { response: { status: 418, data: {}, headers: {} }, message: 'HTTP 418: Teapot' },
      'JIRA API error (418): HTTP 418: Teapot'
    ],
    // Network errors
    [
      { name: 'AbortError', message: 'timeout' },
      'JIRA API request timed out. Please check your network connection or try again later.'
    ],
    [
      { code: 'ENOTFOUND', message: 'host not found' },
      'Cannot resolve JIRA URL. Please check that the JIRA URL is correct and accessible.'
    ],
    [
      { code: 'ECONNREFUSED', message: 'connection refused' },
      'Connection to JIRA refused. Please check your JIRA URL and network connectivity.'
    ],
    [
      { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'ssl error' },
      'SSL certificate verification failed for JIRA instance. Please check the certificate or contact your administrator.'
    ],
    [
      { code: 'UNKNOWN_CODE', message: 'weird failure' },
      'Network error connecting to JIRA: weird failure'
    ],
    // Generic errors
    [
      { message: 'weird failure' },
      'Network error connecting to JIRA: weird failure'
    ]
  ])('maps error correctly: %s', (error, expected) => {
    expect(mapJiraError(error)).toBe(expected);
  });
});

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

});
