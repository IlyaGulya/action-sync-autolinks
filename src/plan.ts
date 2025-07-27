import { JiraProject, GithubAutolink } from './types';

export interface AutolinkOpCreate {
  kind: 'create';
  keyPrefix: string;
  urlTemplate: string;
}

export interface AutolinkOpUpdate {
  kind: 'update';
  autolinkId: number;
  keyPrefix: string;
  urlTemplate: string;
}

export interface AutolinkOpDelete {
  kind: 'delete';
  autolinkId: number;
  keyPrefix: string;
}

export type AutolinkOp = AutolinkOpCreate | AutolinkOpUpdate | AutolinkOpDelete;

export interface PlanResult {
  operations: AutolinkOp[];
  metrics: {
    projectsSynced: number;
    operationsPlanned: number;
  };
}

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, '');
}

function urlsEqual(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

function isJiraAutolink(autolink: GithubAutolink, jiraUrl: string): boolean {
  return autolink.key_prefix.endsWith('-') && 
         normalizeUrl(autolink.url_template).startsWith(normalizeUrl(jiraUrl) + '/browse/');
}

export function buildAutolinkPlan(
  jiraProjects: JiraProject[],
  existingAutolinks: GithubAutolink[],
  jiraUrl: string
): PlanResult {
  const existingMap = new Map<string, GithubAutolink>();
  for (const autolink of existingAutolinks) {
    existingMap.set(autolink.key_prefix, autolink);
  }

  const operations: AutolinkOp[] = [];
  const desiredPrefixes = new Set<string>();

  // Plan operations for each JIRA project
  for (const project of jiraProjects) {
    const keyPrefix = `${project.key}-`;
    const urlTemplate = `${jiraUrl}/browse/${project.key}-<num>`;
    desiredPrefixes.add(keyPrefix);

    const existing = existingMap.get(keyPrefix);
    if (!existing) {
      operations.push({
        kind: 'create',
        keyPrefix,
        urlTemplate,
      });
    } else if (!urlsEqual(existing.url_template, urlTemplate)) {
      operations.push({
        kind: 'update',
        autolinkId: existing.id,
        keyPrefix,
        urlTemplate,
      });
    }
  }

  // Plan deletions for obsolete JIRA autolinks
  for (const [keyPrefix, autolink] of existingMap) {
    if (!desiredPrefixes.has(keyPrefix) && isJiraAutolink(autolink, jiraUrl)) {
      operations.push({
        kind: 'delete',
        autolinkId: autolink.id,
        keyPrefix,
      });
    }
  }

  return {
    operations,
    metrics: {
      projectsSynced: jiraProjects.length,
      operationsPlanned: operations.length,
    },
  };
}