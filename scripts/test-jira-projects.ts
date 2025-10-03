#!/usr/bin/env bun

/**
 * Local testing script to see which JIRA projects would be synced
 *
 * Usage:
 *   JIRA_URL=https://your-company.atlassian.net \
 *   JIRA_USERNAME=your-email@example.com \
 *   JIRA_API_TOKEN=your-api-token \
 *   bun run scripts/test-jira-projects.ts
 *
 * Optional filters:
 *   FILTER_CATEGORY_IDS=10000,10001 \
 *   FILTER_TYPE=software,business \
 *   FILTER_QUERY=platform \
 *   bun run scripts/test-jira-projects.ts
 */

import { jiraClientFactory } from '../src';

const jiraUrl = process.env.JIRA_URL;
const jiraUsername = process.env.JIRA_USERNAME;
const jiraApiToken = process.env.JIRA_API_TOKEN;

if (!jiraUrl || !jiraUsername || !jiraApiToken) {
  console.error('Error: Missing required environment variables');
  console.error('Required:');
  console.error('  JIRA_URL - Your JIRA instance URL (e.g., https://company.atlassian.net)');
  console.error('  JIRA_USERNAME - Your JIRA username/email');
  console.error('  JIRA_API_TOKEN - Your JIRA API token');
  console.error('\nOptional filters:');
  console.error('  FILTER_CATEGORY_IDS - Comma-separated category IDs (e.g., 10000,10001)');
  console.error('  FILTER_TYPE - Comma-separated types (business, service_desk, software)');
  console.error('  FILTER_QUERY - Filter by project key or name');
  process.exit(1);
}

const categoryFilter = process.env.FILTER_CATEGORY_IDS?.split(',').map(id => id.trim());
const typeFilter = process.env.FILTER_TYPE?.split(',').map(t => t.trim() as any);
const queryFilter = process.env.FILTER_QUERY;

console.log('Fetching JIRA projects...');
console.log(`JIRA URL: ${jiraUrl}`);
if (categoryFilter) console.log(`Category filter: ${categoryFilter.join(', ')}`);
if (typeFilter) console.log(`Type filter: ${typeFilter.join(', ')}`);
if (queryFilter) console.log(`Query filter: "${queryFilter}"`);
console.log('');

try {
  const client = jiraClientFactory(jiraUrl, jiraUsername, jiraApiToken);

  // First, list available categories
  console.log('=== Available Categories ===');
  const categories = await client.getProjectCategories();
  if (categories.length === 0) {
    console.log('No categories found');
  } else {
    for (const category of categories) {
      const description = category.description ? ` - ${category.description}` : '';
      console.log(`  ID: ${category.id}, Name: ${category.name}${description}`);
    }
  }
  console.log('');

  // Then, fetch projects
  console.log('=== Projects ===');
  const projects = await client.getProjects(categoryFilter, typeFilter, queryFilter);

  console.log(`Found ${projects.length} projects:\n`);

  if (projects.length === 0) {
    console.log('No projects match the filters');
  } else {
    for (const project of projects) {
      const type = project.projectTypeKey ? `[${project.projectTypeKey}]`.padEnd(17) : ''.padEnd(17);
      const category = project.projectCategory ? `(${project.projectCategory.name})` : '';
      console.log(`  ${project.key.padEnd(15)} ${type} ${project.name} ${category}`);
    }
  }

  console.log('');
  if (projects.length > 500) {
    console.warn(`⚠️  WARNING: GitHub only supports 500 autolinks per repository.`);
    console.warn(`   You have ${projects.length} projects. Please use filters to reduce the count.`);
  } else {
    console.log(`✅ ${projects.length} projects (within GitHub's 500 autolink limit)`);
  }
} catch (error: any) {
  console.error('Error fetching projects:', error.message);
  process.exit(1);
}
