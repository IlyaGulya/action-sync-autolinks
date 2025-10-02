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
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: [
        { key: 'AAA', name: 'Proj A', id: '1' },
        { name: 'No Key', id: '2' },
        { key: 'BBB', name: 'Proj B', id: '3' }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1', projectCategory: undefined },
      { key: 'BBB', name: 'Proj B', id: '3', projectCategory: undefined }
    ]);
  });

  test('invalid response format throws', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100`, { foo: 'bar' });
    expect(getJiraProjects(jiraUrl, username, token))
      .rejects.toThrow('Invalid response format');
  });

  test('mapJiraError when response.json throws', async () => {
    mockFetch(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100`, new Response('invalid json', {
      status: 500,
      statusText: 'Server Error',
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(getJiraProjects(jiraUrl, username, token))
      .rejects.toThrow('HTTP 500: Server Error');
  });

  test('filters projects by category when filter is provided', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100&categoryId=10001`, {
      isLast: true,
      values: [
        { key: 'AAA', name: 'Proj A', id: '1', projectCategory: { id: '10001', name: 'Category 1' } },
        { key: 'CCC', name: 'Proj C', id: '3', projectCategory: { id: '10001', name: 'Category 1' } }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token, ['10001']);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1', projectCategory: { id: '10001', key: 'Category 1', name: 'Category 1' } },
      { key: 'CCC', name: 'Proj C', id: '3', projectCategory: { id: '10001', key: 'Category 1', name: 'Category 1' } }
    ]);
  });

  test('filters projects by multiple categories', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100&categoryId=10001&categoryId=10003`, {
      isLast: true,
      values: [
        { key: 'AAA', name: 'Proj A', id: '1', projectCategory: { id: '10001', name: 'Category 1' } },
        { key: 'CCC', name: 'Proj C', id: '3', projectCategory: { id: '10003', name: 'Category 3' } }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token, ['10001', '10003']);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1', projectCategory: { id: '10001', key: 'Category 1', name: 'Category 1' } },
      { key: 'CCC', name: 'Proj C', id: '3', projectCategory: { id: '10003', key: 'Category 3', name: 'Category 3' } }
    ]);
  });

  test('returns empty array when no projects match category filter', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100&categoryId=10003`, {
      isLast: true,
      values: []
    });

    const res = await getJiraProjects(jiraUrl, username, token, ['10003']);
    expect(res).toEqual([]);
  });

  test('returns all projects when empty category filter is provided', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: true,
      values: [
        { key: 'AAA', name: 'Proj A', id: '1', projectCategory: { id: '10001', name: 'Category 1' } },
        { key: 'BBB', name: 'Proj B', id: '2' }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token, []);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1', projectCategory: { id: '10001', key: 'Category 1', name: 'Category 1' } },
      { key: 'BBB', name: 'Proj B', id: '2', projectCategory: undefined }
    ]);
  });

  test('handles pagination across multiple pages', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100`, {
      isLast: false,
      values: [
        { key: 'AAA', name: 'Proj A', id: '1' },
        { key: 'BBB', name: 'Proj B', id: '2' }
      ]
    });

    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=100&maxResults=100`, {
      isLast: true,
      values: [
        { key: 'CCC', name: 'Proj C', id: '3' }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token);
    expect(res).toEqual([
      { key: 'AAA', name: 'Proj A', id: '1', projectCategory: undefined },
      { key: 'BBB', name: 'Proj B', id: '2', projectCategory: undefined },
      { key: 'CCC', name: 'Proj C', id: '3', projectCategory: undefined }
    ]);
  });

  test('filters projects by type when typeFilter is provided', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100&typeKey=business%2Csoftware`, {
      isLast: true,
      values: [
        { key: 'BUS', name: 'Business Project', id: '1' },
        { key: 'SW', name: 'Software Project', id: '2' }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token, undefined, ['business', 'software']);
    expect(res).toEqual([
      { key: 'BUS', name: 'Business Project', id: '1', projectCategory: undefined },
      { key: 'SW', name: 'Software Project', id: '2', projectCategory: undefined }
    ]);
  });

  test('filters projects by query when query is provided', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100&query=test`, {
      isLast: true,
      values: [
        { key: 'TEST', name: 'Test Project', id: '1' }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token, undefined, undefined, 'test');
    expect(res).toEqual([
      { key: 'TEST', name: 'Test Project', id: '1', projectCategory: undefined }
    ]);
  });

  test('combines category, type, and query filters', async () => {
    mockFetchJson(`${jiraUrl}/rest/api/3/project/search?startAt=0&maxResults=100&categoryId=10000&typeKey=software&query=api`, {
      isLast: true,
      values: [
        { key: 'API', name: 'API Project', id: '1', projectCategory: { id: '10000', name: 'Engineering' } }
      ]
    });

    const res = await getJiraProjects(jiraUrl, username, token, ['10000'], ['software'], 'api');
    expect(res).toEqual([
      { key: 'API', name: 'API Project', id: '1', projectCategory: { id: '10000', key: 'Engineering', name: 'Engineering' } }
    ]);
  });
});
