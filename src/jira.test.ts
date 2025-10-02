import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getJiraProjects } from './jira';
import { mockFetchJson, clearFetchMocks } from './test-support';
import {mockFetch} from "@aryzing/bun-mock-fetch";

const jiraUrl = 'https://example.atlassian.net';
const username = 'u';
const token = 't';

describe('getJiraProjects', () => {
  beforeEach(() => {
  });

  afterEach(() => {
    clearFetchMocks();
  });

  test('happy path maps and filters projects', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project`, [
      { key: 'AAA', name: 'Proj A', id: '1' },
      { name: 'No Key', id: '2' },
      { key: 'BBB', name: 'Proj B', id: '3' }
    ]);

    const res = await getJiraProjects(jiraUrl, username, token);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1' },
      { key: 'BBB', name: 'Proj B', id: '3' }
    ]);
  });

  test('invalid response format throws', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project`, { foo: 'bar' });
    expect(getJiraProjects(jiraUrl, username, token))
      .rejects.toThrow('Invalid response format');
  });

  test('mapJiraError when response.json throws', async () => {
    mockFetch(`${jiraUrl}/rest/api/3/project`, new Response('invalid json', {
      status: 500,
      statusText: 'Server Error',
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(getJiraProjects(jiraUrl, username, token))
      .rejects.toThrow('HTTP 500: Server Error');
  });
});
