import { describe, test, expect } from 'bun:test';
import { buildAutolinkPlan } from './plan';
import { JiraProject, GithubAutolink } from './types';

const jiraUrl = 'https://example.atlassian.net';

describe('buildAutolinkPlan', () => {
  test('creates new autolinks for new projects', () => {
    const jiraProjects: JiraProject[] = [
      { key: 'NEW', name: 'New Project', id: '1' },
      { key: 'ANOTHER', name: 'Another Project', id: '2' }
    ];
    const existingAutolinks: GithubAutolink[] = [];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[0]).toEqual({
      kind: 'create',
      keyPrefix: 'NEW-',
      urlTemplate: `${jiraUrl}/browse/NEW-<num>`
    });
    expect(plan.operations[1]).toEqual({
      kind: 'create',
      keyPrefix: 'ANOTHER-',
      urlTemplate: `${jiraUrl}/browse/ANOTHER-<num>`
    });
    expect(plan.metrics.projectsSynced).toBe(2);
    expect(plan.metrics.operationsPlanned).toBe(2);
  });

  test('skips up-to-date autolinks', () => {
    const jiraProjects: JiraProject[] = [
      { key: 'SAME', name: 'Same Project', id: '1' }
    ];
    const existingAutolinks: GithubAutolink[] = [
      {
        id: 10,
        key_prefix: 'SAME-',
        url_template: `${jiraUrl}/browse/SAME-<num>`,
        is_alphanumeric: true
      }
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(0);
    expect(plan.metrics.projectsSynced).toBe(1);
    expect(plan.metrics.operationsPlanned).toBe(0);
  });

  test('updates autolinks with different URL templates', () => {
    const jiraProjects: JiraProject[] = [
      { key: 'UPDATE', name: 'Update Project', id: '1' }
    ];
    const existingAutolinks: GithubAutolink[] = [
      {
        id: 10,
        key_prefix: 'UPDATE-',
        url_template: 'https://old.atlassian.net/browse/UPDATE-<num>',
        is_alphanumeric: true
      }
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toEqual({
      kind: 'update',
      autolinkId: 10,
      keyPrefix: 'UPDATE-',
      urlTemplate: `${jiraUrl}/browse/UPDATE-<num>`
    });
  });

  test('deletes obsolete JIRA autolinks', () => {
    const jiraProjects: JiraProject[] = [];
    const existingAutolinks: GithubAutolink[] = [
      {
        id: 10,
        key_prefix: 'OLD-',
        url_template: `${jiraUrl}/browse/OLD-<num>`,
        is_alphanumeric: true
      },
      {
        id: 11,
        key_prefix: 'LEGACY-',
        url_template: `${jiraUrl}/browse/LEGACY-<num>`,
        is_alphanumeric: true
      }
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations).toContainEqual({
      kind: 'delete',
      autolinkId: 10,
      keyPrefix: 'OLD-'
    });
    expect(plan.operations).toContainEqual({
      kind: 'delete',
      autolinkId: 11,
      keyPrefix: 'LEGACY-'
    });
  });

  test('preserves non-JIRA autolinks', () => {
    const jiraProjects: JiraProject[] = [];
    const existingAutolinks: GithubAutolink[] = [
      {
        id: 10,
        key_prefix: 'GITHUB-',
        url_template: 'https://github.com/owner/repo/issues/<num>',
        is_alphanumeric: true
      },
      {
        id: 11,
        key_prefix: 'ZENDESK',
        url_template: 'https://company.zendesk.com/tickets/<num>',
        is_alphanumeric: true
      },
      {
        id: 12,
        key_prefix: 'OTHER-',
        url_template: 'https://different.example.com/browse/OTHER-<num>',
        is_alphanumeric: true
      }
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(0);
    expect(plan.metrics.operationsPlanned).toBe(0);
  });

  test('handles URL normalization correctly', () => {
    const jiraProjects: JiraProject[] = [
      { key: 'NORM', name: 'Normalize Test', id: '1' }
    ];
    
    // Test trailing slash normalization
    const existingAutolinks: GithubAutolink[] = [
      {
        id: 10,
        key_prefix: 'NORM-',
        url_template: `${jiraUrl}/browse/NORM-<num>/`,
        is_alphanumeric: true
      }
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(0);
  });


  test('mixed scenario: create, update, delete, preserve', () => {
    const jiraProjects: JiraProject[] = [
      { key: 'KEEP', name: 'Keep Project', id: '1' },
      { key: 'UPDATE', name: 'Update Project', id: '2' },
      { key: 'NEW', name: 'New Project', id: '3' }
    ];
    const existingAutolinks: GithubAutolink[] = [
      // Keep this one (up to date)
      {
        id: 10,
        key_prefix: 'KEEP-',
        url_template: `${jiraUrl}/browse/KEEP-<num>`,
        is_alphanumeric: true
      },
      // Update this one (different URL)
      {
        id: 11,
        key_prefix: 'UPDATE-',
        url_template: 'https://old.atlassian.net/browse/UPDATE-<num>',
        is_alphanumeric: true
      },
      // Delete this one (obsolete JIRA)
      {
        id: 12,
        key_prefix: 'OLD-',
        url_template: `${jiraUrl}/browse/OLD-<num>`,
        is_alphanumeric: true
      },
      // Preserve this one (non-JIRA)
      {
        id: 13,
        key_prefix: 'GITHUB-',
        url_template: 'https://github.com/owner/repo/issues/<num>',
        is_alphanumeric: true
      }
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, jiraUrl);

    expect(plan.operations).toHaveLength(3);
    expect(plan.operations).toContainEqual({
      kind: 'create',
      keyPrefix: 'NEW-',
      urlTemplate: `${jiraUrl}/browse/NEW-<num>`
    });
    expect(plan.operations).toContainEqual({
      kind: 'update',
      autolinkId: 11,
      keyPrefix: 'UPDATE-',
      urlTemplate: `${jiraUrl}/browse/UPDATE-<num>`
    });
    expect(plan.operations).toContainEqual({
      kind: 'delete',
      autolinkId: 12,
      keyPrefix: 'OLD-'
    });

    expect(plan.metrics.projectsSynced).toBe(3);
    expect(plan.metrics.operationsPlanned).toBe(3);
  });
});