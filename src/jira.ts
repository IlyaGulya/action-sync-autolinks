import {JiraApiError, JiraProject, PageBeanProject} from './types';
import {withRetry} from './retry';

export async function getJiraProjects(
  jiraUrl: string,
  username: string,
  apiToken: string,
  categoryFilter?: string[],
  typeFilter?: string[],
  query?: string,
): Promise<JiraProject[]> {
  const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');
  const allProjects: JiraProject[] = [];
  let startAt = 0;
  const maxResults = 100;
  let isLast = false;

  // Fetch all pages of projects from JIRA using paginated API
  while (!isLast) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Build query parameters
    const queryParams = new URLSearchParams({
      startAt: startAt.toString(),
      maxResults: maxResults.toString(),
    });

    // Add category filter if provided (server-side filtering)
    if (categoryFilter && categoryFilter.length > 0) {
      categoryFilter.forEach(categoryId => {
        queryParams.append('categoryId', categoryId);
      });
    }

    // Add type filter if provided (server-side filtering)
    if (typeFilter && typeFilter.length > 0) {
      queryParams.append('typeKey', typeFilter.join(','));
    }

    // Add query filter if provided (server-side filtering)
    if (query) {
      queryParams.append('query', query);
    }

    const url = `${jiraUrl}/rest/api/3/project/search?${queryParams.toString()}`;

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

    const data = await response.json() as PageBeanProject;

    if (!data || !data.values || !Array.isArray(data.values)) {
      throw new Error('Invalid response format from JIRA API');
    }

    // Map and add projects from this page
    const pageProjects: JiraProject[] = data.values.map((project: any) => ({
      key: project.key,
      name: project.name,
      id: project.id,
      projectCategory: project.projectCategory ? {
        id: project.projectCategory.id,
        key: project.projectCategory.name, // Use name as key for backward compatibility
        name: project.projectCategory.name,
      } : undefined,
    })).filter((project: JiraProject) => project.key); // Filter out projects without keys

    allProjects.push(...pageProjects);

    // Check if we need to fetch more pages
    isLast = data.isLast ?? true;
    startAt += maxResults;
  }

  return allProjects;
}
