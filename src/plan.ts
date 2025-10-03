import {AutolinkOp, GithubAutolink, JiraProject} from './types';
import {normalizeUrl, urlsEqual} from './utils/url';

export interface PlanResult {
  operations: AutolinkOp[];
  metrics: {
    projectsSynced: number;
    operationsPlanned: number;
  };
}

function isJiraAutolink(autolink: GithubAutolink, jiraUrl: string): boolean {
  return autolink.key_prefix.endsWith('-') &&
    normalizeUrl(autolink.url_template).startsWith(`${normalizeUrl(jiraUrl)}/browse/`);
}

export function buildAutolinkPlan(
  jiraProjects: JiraProject[],
  existingAutolinks: GithubAutolink[],
  jiraUrl: string,
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
        keyPrefix: keyPrefix,
        urlTemplate: urlTemplate,
      });
    } else if (!urlsEqual(existing.url_template, urlTemplate)) {
      operations.push({
        kind: 'update',
        autolinkId: existing.id,
        keyPrefix: keyPrefix,
        urlTemplate: urlTemplate,
      });
    }
  }

  // Plan deletions for obsolete JIRA autolinks
  for (const [keyPrefix, autolink] of existingMap) {
    if (!desiredPrefixes.has(keyPrefix) && isJiraAutolink(autolink, jiraUrl)) {
      operations.push({
        kind: 'delete',
        autolinkId: autolink.id,
        keyPrefix: keyPrefix,
      });
    }
  }

  // Sort operations: deletes first to free up space, then creates/updates
  operations.sort((a, b) => {
    const order = {delete: 0, update: 1, create: 2};
    return order[a.kind] - order[b.kind];
  });

  return {
    operations,
    metrics: {
      projectsSynced: jiraProjects.length,
      operationsPlanned: operations.length,
    },
  };
}
