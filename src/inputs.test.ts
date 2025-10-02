import { describe, test, expect, spyOn } from 'bun:test';
import { validateInputs } from './inputs';
import { createMockCore } from './test-support';

describe('validateInputs', () => {
  test('returns validated inputs when all required inputs are provided', () => {
    const mockCore = createMockCore({
      'github-token': 'ghp_token',
      'jira-url': 'https://example.atlassian.net',
      'jira-username': 'user@example.com',
      'jira-api-token': 'api-token',
    });

    const result = validateInputs(mockCore);

    expect(result).toEqual({
      githubToken: 'ghp_token',
      jiraUrl: 'https://example.atlassian.net',
      jiraUsername: 'user@example.com',
      jiraApiToken: 'api-token',
      projectCategoryFilter: undefined,
    });
  });

  test('exits with error when all inputs are missing', () => {
    const mockCore = createMockCore({});
    const mockExit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);

    try {
      validateInputs(mockCore);
    } catch (error: any) {
      // Expected to throw due to mocked process.exit
    }

    // Should print the header
    expect(mockCore.error).toHaveBeenCalledWith('Missing required inputs:');

    // Should print each error
    expect(mockCore.error).toHaveBeenCalledWith('  - github-token is required');
    expect(mockCore.error).toHaveBeenCalledWith('  - jira-url is required');
    expect(mockCore.error).toHaveBeenCalledWith('  - jira-username is required');
    expect(mockCore.error).toHaveBeenCalledWith('  - jira-api-token is required');

    // Should fail with simple message
    expect(mockCore.setFailed).toHaveBeenCalledWith('Input validation failed');

    // Should call process.exit(1)
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  test('exits with error when some inputs are missing', () => {
    const mockCore = createMockCore({
      'github-token': 'ghp_token',
      'jira-url': 'https://example.atlassian.net',
      // Missing jira-username and jira-api-token
    });
    const mockExit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);

    try {
      validateInputs(mockCore);
    } catch (error: any) {
      // Expected to throw due to mocked process.exit
    }

    // Should print the header
    expect(mockCore.error).toHaveBeenCalledWith('Missing required inputs:');

    // Should print missing inputs
    expect(mockCore.error).toHaveBeenCalledWith('  - jira-username is required');
    expect(mockCore.error).toHaveBeenCalledWith('  - jira-api-token is required');

    // Should not print provided inputs
    expect(mockCore.error).not.toHaveBeenCalledWith('  - github-token is required');
    expect(mockCore.error).not.toHaveBeenCalledWith('  - jira-url is required');

    // Should fail with simple message
    expect(mockCore.setFailed).toHaveBeenCalledWith('Input validation failed');

    // Should call process.exit(1)
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  test('parses project-category-ids from comma-separated string', () => {
    const mockCore = createMockCore({
      'github-token': 'ghp_token',
      'jira-url': 'https://example.atlassian.net',
      'jira-username': 'user@example.com',
      'jira-api-token': 'api-token',
      'project-category-ids': 'cat1,cat2,cat3',
    });

    const result = validateInputs(mockCore);

    expect(result.projectCategoryFilter).toEqual(['cat1', 'cat2', 'cat3']);
  });

  test('trims whitespace from category ID values', () => {
    const mockCore = createMockCore({
      'github-token': 'ghp_token',
      'jira-url': 'https://example.atlassian.net',
      'jira-username': 'user@example.com',
      'jira-api-token': 'api-token',
      'project-category-ids': ' cat1 , cat2 ,  cat3  ',
    });

    const result = validateInputs(mockCore);

    expect(result.projectCategoryFilter).toEqual(['cat1', 'cat2', 'cat3']);
  });

  test('filters out empty strings from category IDs', () => {
    const mockCore = createMockCore({
      'github-token': 'ghp_token',
      'jira-url': 'https://example.atlassian.net',
      'jira-username': 'user@example.com',
      'jira-api-token': 'api-token',
      'project-category-ids': 'cat1,,cat2,  ,cat3',
    });

    const result = validateInputs(mockCore);

    expect(result.projectCategoryFilter).toEqual(['cat1', 'cat2', 'cat3']);
  });

  test('returns undefined when project-category-ids is empty string', () => {
    const mockCore = createMockCore({
      'github-token': 'ghp_token',
      'jira-url': 'https://example.atlassian.net',
      'jira-username': 'user@example.com',
      'jira-api-token': 'api-token',
      'project-category-ids': '',
    });

    const result = validateInputs(mockCore);

    expect(result.projectCategoryFilter).toBeUndefined();
  });
});
