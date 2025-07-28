import { describe, test, expect } from 'bun:test';
import { buildAutolinkPlan } from './plan';
import { jira, github, urls } from './test-support/fixtures';

describe('buildAutolinkPlan', () => {
  test('creates new autolinks for new projects', () => {
    const jiraProjects = jira.projects(['NEW', 'ANOTHER']);
    const existingAutolinks: import('./types').GithubAutolink[] = [];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[0]).toEqual({
      kind: 'create',
      keyPrefix: 'NEW-',
      urlTemplate: urls.jiraBrowse('NEW')
    });
    expect(plan.operations[1]).toEqual({
      kind: 'create',
      keyPrefix: 'ANOTHER-',
      urlTemplate: urls.jiraBrowse('ANOTHER')
    });
    expect(plan.metrics.projectsSynced).toBe(2);
    expect(plan.metrics.operationsPlanned).toBe(2);
  });

  test('skips up-to-date autolinks', () => {
    const jiraProjects = [jira.project('SAME')];
    const existingAutolinks = [
      github.autolink(10, 'SAME', urls.jiraBrowse('SAME'))
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

    expect(plan.operations).toHaveLength(0);
    expect(plan.metrics.projectsSynced).toBe(1);
    expect(plan.metrics.operationsPlanned).toBe(0);
  });

  test('updates autolinks with different URL templates', () => {
    const jiraProjects = [jira.project('UPDATE')];
    const existingAutolinks = [
      github.autolink(10, 'UPDATE', 'https://old.atlassian.net/browse/UPDATE-<num>')
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toEqual({
      kind: 'update',
      autolinkId: 10,
      keyPrefix: 'UPDATE-',
      urlTemplate: urls.jiraBrowse('UPDATE')
    });
  });

  test('deletes obsolete JIRA autolinks', () => {
    const jiraProjects: import('./types').JiraProject[] = [];
    const existingAutolinks = github.autolinks([
      { id: 10, key: 'OLD', url: urls.jiraBrowse('OLD') },
      { id: 11, key: 'LEGACY', url: urls.jiraBrowse('LEGACY') }
    ]);

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

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
    const jiraProjects: import('./types').JiraProject[] = [];
    const existingAutolinks = github.autolinks([
      { id: 10, key: 'GITHUB', url: 'https://github.com/owner/repo/issues/<num>' },
      { id: 11, key: 'ZENDESK', url: 'https://company.zendesk.com/tickets/<num>' },
      { id: 12, key: 'OTHER', url: 'https://different.example.com/browse/OTHER-<num>' }
    ]);

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

    expect(plan.operations).toHaveLength(0);
    expect(plan.metrics.operationsPlanned).toBe(0);
  });

  test('handles URL normalization correctly', () => {
    const jiraProjects = [jira.project('NORM')];
    const existingAutolinks = [
      github.autolink(10, 'NORM', `${urls.jiraBrowse('NORM')}/`)
    ];

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

    expect(plan.operations).toHaveLength(0);
  });

  test('mixed scenario: create, update, delete, preserve', () => {
    const jiraProjects = jira.projects(['KEEP', 'UPDATE', 'NEW']);
    const existingAutolinks = github.autolinks([
      { id: 10, key: 'KEEP', url: urls.jiraBrowse('KEEP') },
      { id: 11, key: 'UPDATE', url: 'https://old.atlassian.net/browse/UPDATE-<num>' },
      { id: 12, key: 'OLD', url: urls.jiraBrowse('OLD') },
      { id: 13, key: 'GITHUB', url: 'https://github.com/owner/repo/issues/<num>' }
    ]);

    const plan = buildAutolinkPlan(jiraProjects, existingAutolinks, urls.jira);

    expect(plan.operations).toHaveLength(3);
    expect(plan.operations).toContainEqual({
      kind: 'create',
      keyPrefix: 'NEW-',
      urlTemplate: urls.jiraBrowse('NEW')
    });
    expect(plan.operations).toContainEqual({
      kind: 'update',
      autolinkId: 11,
      keyPrefix: 'UPDATE-',
      urlTemplate: urls.jiraBrowse('UPDATE')
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