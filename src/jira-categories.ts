import {JiraApiError, ProjectCategory} from './types';
import {withRetry} from './retry';
import {jiraApiUrl, stripTrailingSlash} from './utils/url';

export async function getJiraProjectCategories(
  jiraUrl: string,
  username: string,
  apiToken: string,
): Promise<ProjectCategory[]> {
  const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  const base = stripTrailingSlash(jiraUrl);
  const url = jiraApiUrl(base, '/rest/api/3/projectCategory');

  const response = await withRetry(() =>
    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    }),
  );

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as JiraApiError;
    error.response = {
      status: response.status,
      data: errorData,
      headers: Object.fromEntries(response.headers.entries()),
    };
    throw error;
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('Invalid response format from JIRA API');
  }

  return data.map((category: any) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    self: category.self,
  }));
}
