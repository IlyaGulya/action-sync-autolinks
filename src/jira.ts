import * as core from '@actions/core';
import { JiraProject, JiraApiError } from './types';

export function mapJiraError(error: any): string {
  if (error.response) {
    const status = error.response.status;
    const errorData = error.response.data;

    switch (status) {
      case 401:
        let authMessage = 'JIRA authentication failed. Please check your username and API token.';
        if (errorData?.errorMessages?.length > 0) {
          authMessage += ` Details: ${errorData.errorMessages.join(', ')}`;
        }
        return authMessage;
      case 403:
        let accessMessage = 'Access denied to JIRA projects. Please check your permissions.';
        if (errorData?.errorMessages?.length > 0) {
          accessMessage += ` Details: ${errorData.errorMessages.join(', ')}`;
        }
        return accessMessage;
      case 404:
        return 'JIRA instance not found. Please check your JIRA URL.';
      case 429:
        const retryAfter = error.response.headers['retry-after'] || 'unknown';
        return `JIRA API rate limit exceeded. Retry after: ${retryAfter} seconds.`;
      case 500:
      case 502:
      case 503:
      case 504:
        return `JIRA server error (${status}). Please try again later or contact your JIRA administrator.`;
      default:
        return `JIRA API error (${status}): ${error.message}`;
    }
  } else if (error.name === 'AbortError') {
    return 'JIRA API request timed out. Please check your network connection or try again later.';
  } else if (error.code) {
    switch (error.code) {
      case 'ENOTFOUND':
        return 'Cannot resolve JIRA URL. Please check that the JIRA URL is correct and accessible.';
      case 'ECONNREFUSED':
        return 'Connection to JIRA refused. Please check your JIRA URL and network connectivity.';
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        return 'SSL certificate verification failed for JIRA instance. Please check the certificate or contact your administrator.';
      default:
        return `Network error connecting to JIRA: ${error.message}`;
    }
  } else {
    return `Network error connecting to JIRA: ${error.message}`;
  }
}

export async function getJiraQueues(
  jiraUrl: string,
  username: string,
  apiToken: string,
  http: typeof fetch = fetch
): Promise<JiraProject[]> {
  try {
    const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

    // Get all projects (which contain queues/issues)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await http(`${jiraUrl}/rest/api/3/project`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as JiraApiError;
      error.response = {
        status: response.status,
        data: errorData,
        headers: Object.fromEntries(response.headers.entries())
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
      id: project.id
    })).filter((project: JiraProject) => project.key); // Filter out projects without keys
  } catch (error: any) {
    const errorMessage = mapJiraError(error);
    core.error(errorMessage);
    throw new Error(errorMessage);
  }
}