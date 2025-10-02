import { AutolinkOpCreate, AutolinkOpUpdate, AutolinkOpDelete } from '../plan';
import { JiraProject, GithubAutolink } from '../types';

const JIRA_URL = 'https://example.atlassian.net';

export const op = {
  create: (key: string): AutolinkOpCreate => ({
    kind: 'create',
    keyPrefix: `${key}-`,
    urlTemplate: `${JIRA_URL}/browse/${key}-<num>`
  }),

  update: (id: number, key: string, url: string): AutolinkOpUpdate => ({
    kind: 'update',
    autolinkId: id,
    keyPrefix: `${key}-`,
    urlTemplate: url
  }),

  delete: (id: number, key: string): AutolinkOpDelete => ({
    kind: 'delete',
    autolinkId: id,
    keyPrefix: `${key}-`
  })
};

export const jira = {
  project: (key: string, name = key, id = String(Math.floor(Math.random() * 1000))): JiraProject => ({
    key,
    name,
    id
  }),

  projects: (keys: string[]): JiraProject[] => keys.map(key => jira.project(key))
};

export const github = {
  autolink: (id: number, key: string, url: string): GithubAutolink => ({
    id,
    key_prefix: `${key}-`,
    url_template: url,
    is_alphanumeric: true
  } as GithubAutolink),

  autolinks: (data: Array<{ id: number; key: string; url: string }>): GithubAutolink[] =>
    data.map(({ id, key, url }) => github.autolink(id, key, url))
};

export const urls = {
  jira: JIRA_URL,
  jiraBrowse: (key: string) => `${JIRA_URL}/browse/${key}-<num>`,
  other: 'https://other.example.com'
};

// Common test data patterns
export const fixtures = {
  inputs: {
    basic: {
      'action': 'sync',
      'github-token': 'ghs_test_token',
      'jira-url': JIRA_URL,
      'jira-username': 'test-user',
      'jira-api-token': 'test-api-token',
      'repository': '',
      'dry-run': 'false',
    },
    dryRun: {
      'action': 'sync',
      'github-token': 'ghs_test_token',
      'jira-url': JIRA_URL,
      'jira-username': 'test-user',
      'jira-api-token': 'test-api-token',
      'repository': '',
      'dry-run': 'true',
    },
    listCategories: {
      'action': 'list-categories',
      'jira-url': JIRA_URL,
      'jira-username': 'test-user',
      'jira-api-token': 'test-api-token',
    }
  }
};