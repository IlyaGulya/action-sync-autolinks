export const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');
export const normalizeUrl = (s: string) => stripTrailingSlash(s).toLowerCase();
export const urlsEqual = (a: string, b: string) => normalizeUrl(a) === normalizeUrl(b);

export const jiraBrowseUrl = (jiraUrl: string, key: string) =>
  `${stripTrailingSlash(jiraUrl)}/browse/${key}-<num>`;

export const jiraApiUrl = (jiraUrl: string, pathAndQuery: string) =>
  `${stripTrailingSlash(jiraUrl)}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
