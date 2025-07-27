import { mockFetch } from '@aryzing/bun-mock-fetch';

/**
 * Helper function to mock JSON responses more easily
 * @param url - The URL to mock
 * @param data - The JSON data to return
 * @param status - HTTP status code (defaults to 200)
 */
export function mockFetchJson(url: string, data: any, status: number = 200) {
  return mockFetch(url, new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  }));
}