import {JiraApiError, JiraProject} from './types';
import {withRetry} from './retry';

export async function getJiraProjects(
  jiraUrl: string,
  username: string,
  apiToken: string,
): Promise<JiraProject[]> {
  const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

  // Get all projects from JIRA
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  const response = await withRetry(() =>
    fetch(`${jiraUrl}/rest/api/3/project`, {
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

  if (!data || !Array.isArray(data)) {
    throw new Error('Invalid response format from JIRA API');
  }

  return data.map((project: any) => ({
    key: project.key,
    name: project.name,
    id: project.id,
  })).filter((project: JiraProject) => project.key); // Filter out projects without keys
}
