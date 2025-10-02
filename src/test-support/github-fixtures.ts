/**
 * GitHub API response builders for test mocking
 */

export const okCreate = (key: string, url: string, id = 1) => ({
  data: {id, key_prefix: `${key}-`, url_template: url, is_alphanumeric: true},
  status: 201 as const,
  url: 'https://api.github.com/repos/test/test/autolinks',
  headers: {},
});

export const okDelete = (id: number) => ({
  status: 204,
  url: `https://api.github.com/repos/test/test/autolinks/${id}`,
  headers: {},
} as any);
