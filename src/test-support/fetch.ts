import { mockFetch } from '@aryzing/bun-mock-fetch';

export function mockFetchJson(url: string, data: any, status = 200) {
  return mockFetch(url, new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  }));
}

export { clearFetchMocks } from '@aryzing/bun-mock-fetch';