import * as core from '@actions/core';

export interface ValidatedInputs {
  githubToken: string;
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
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

  return { githubToken, jiraUrl, jiraUsername, jiraApiToken };
}
