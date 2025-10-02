import { describe, test, expect } from 'bun:test';
import { mockFetchJson, useTestEnv } from './test-support';
import { mockFetch } from "@aryzing/bun-mock-fetch";

const jiraUrl = 'https://example.atlassian.net';

describe('JiraClient.getProjectCategories', () => {
  const env = useTestEnv();

  test('happy path returns categories', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'FIRST', description: 'First Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10000' },
      { id: '10001', name: 'SECOND', description: 'Second Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10001' }
    ]);

    const res = await env.jiraClient.getProjectCategories();
    expect(res).toEqual([
      { id: '10000', name: 'FIRST', description: 'First Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10000' },
      { id: '10001', name: 'SECOND', description: 'Second Project Category', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10001' }
    ]);
  });

  test('handles categories without description', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/projectCategory`, [
      { id: '10000', name: 'FIRST', self: 'https://example.atlassian.net/rest/api/3/projectCategory/10000' }
    ]);

    const res = await env.jiraClient.getProjectCategories();
    expect(res).toEqual([
      { id: '10000', name: 'FIRST', description: undefined, self: 'https://example.atlassian.net/rest/api/3/projectCategory/10000' }
    ]);
  });

  test('returns empty array when no categories exist', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/projectCategory`, []);

    const res = await env.jiraClient.getProjectCategories();
    expect(res).toEqual([]);
  });

  test('invalid response format throws', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/projectCategory`, { foo: 'bar' });
    expect(env.jiraClient.getProjectCategories())
      .rejects.toThrow('Invalid response format');
  });

  test('HTTP error throws with proper error format', async () => {
    mockFetch(`${jiraUrl}/rest/api/3/projectCategory`, new Response('invalid json', {
      status: 500,
      statusText: 'Server Error',
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(env.jiraClient.getProjectCategories())
      .rejects.toThrow('HTTP 500: Server Error');
  });

  test('handles 401 unauthorized error', async () => {
    mockFetch(`${jiraUrl}/rest/api/3/projectCategory`, new Response(JSON.stringify({ errorMessages: ['Unauthorized'] }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(env.jiraClient.getProjectCategories())
      .rejects.toThrow('HTTP 401: Unauthorized');
  });
});
