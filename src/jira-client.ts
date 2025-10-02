import {JiraApiError, JiraProject, PageBeanProject, ProjectCategory} from './types';
import {withRetry} from './retry';

export interface JiraClient {
  get<T>(pathAndQuery: string, timeoutMs?: number): Promise<T>;
  getProjects(categoryFilter?: string[], typeFilter?: string[], query?: string): Promise<JiraProject[]>;
  getProjectCategories(): Promise<ProjectCategory[]>;
}

export function jiraClientFactory(
  jiraUrl: string,
  username: string,
  apiToken: string,
): JiraClient {
  const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

  const get = async <T>(pathAndQuery: string, timeoutMs = 30000): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await withRetry(() =>
        fetch(`${jiraUrl}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }),
      );

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

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const getProjects = async (
    categoryFilter?: string[],
    typeFilter?: string[],
    query?: string,
  ): Promise<JiraProject[]> => {
    const allProjects: JiraProject[] = [];
    let startAt = 0;
    const maxResults = 100;
    let isLast = false;

    // Fetch all pages of projects from JIRA using paginated API
    while (!isLast) {
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

      const data = await get<PageBeanProject>(
        `/rest/api/3/project/search?${queryParams.toString()}`,
      );

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
  };

  const getProjectCategories = async (): Promise<ProjectCategory[]> => {
    const data = await get<any[]>('/rest/api/3/projectCategory');

    if (!Array.isArray(data)) {
      throw new Error('Invalid response format from JIRA API');
    }

    return data.map((category: any) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      self: category.self,
    }));
  };

  return {
    get,
    getProjects,
    getProjectCategories,
  };
}
