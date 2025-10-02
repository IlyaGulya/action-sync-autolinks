import * as core from '@actions/core';

export interface ValidatedInputs {
  githubToken: string;
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  projectCategoryFilter?: string[];
  projectTypeFilter?: string[];
  projectQuery?: string;
}

export function validateInputs(coreLib: typeof core): ValidatedInputs {
  const validationErrors: string[] = [];

  const githubToken = coreLib.getInput('github-token');
  if (!githubToken) validationErrors.push('github-token is required');

  const jiraUrl = coreLib.getInput('jira-url');
  if (!jiraUrl) validationErrors.push('jira-url is required');

  const jiraUsername = coreLib.getInput('jira-username');
  if (!jiraUsername) validationErrors.push('jira-username is required');

  const jiraApiToken = coreLib.getInput('jira-api-token');
  if (!jiraApiToken) validationErrors.push('jira-api-token is required');

  if (validationErrors.length > 0) {
    coreLib.error('Missing required inputs:');
    for (const error of validationErrors) {
      coreLib.error(`  - ${error}`);
    }
    coreLib.setFailed('Input validation failed');
    process.exit(1);
  }

  // Parse optional category IDs (comma-separated)
  const categoryIdsInput = coreLib.getInput('filter-project-category-ids');
  const projectCategoryFilter = categoryIdsInput
    ? categoryIdsInput.split(',').map(s => s.trim()).filter(s => s.length > 0)
    : undefined;

  // Parse optional project types (comma-separated)
  const VALID_PROJECT_TYPES = ['business', 'service_desk', 'software'];
  const projectTypeInput = coreLib.getInput('filter-project-type');
  let projectTypeFilter: string[] | undefined = undefined;

  if (projectTypeInput) {
    const types = projectTypeInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const invalidTypes = types.filter(t => !VALID_PROJECT_TYPES.includes(t));

    if (invalidTypes.length > 0) {
      coreLib.error(`Invalid project types: ${invalidTypes.join(', ')}`);
      coreLib.error(`Valid types are: ${VALID_PROJECT_TYPES.join(', ')}`);
      coreLib.setFailed('Input validation failed');
      process.exit(1);
    }

    projectTypeFilter = types.length > 0 ? types : undefined;
  }

  // Parse optional project query (single string)
  const projectQuery = coreLib.getInput('filter-project-query') || undefined;

  return {
    githubToken,
    jiraUrl,
    jiraUsername,
    jiraApiToken,
    projectCategoryFilter,
    projectTypeFilter,
    projectQuery
  };
}
