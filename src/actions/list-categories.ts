import * as core from '@actions/core';
import {SyncDependencies} from '../types';
import {getJiraProjectCategories} from '../jira-categories';
import {mapJiraError} from '../mapJiraError';
import {validateListCategoriesInputs} from '../inputs';

export async function executeListCategoriesAction(deps: SyncDependencies = {}): Promise<void> {
  const {
    core: coreLib = core,
  } = deps;

  const inputs = validateListCategoriesInputs(coreLib);

  coreLib.info('Running in list-categories mode');
  coreLib.info(`JIRA URL: ${inputs.jiraUrl}`);

  try {
    const categories = await getJiraProjectCategories(
      inputs.jiraUrl,
      inputs.jiraUsername,
      inputs.jiraApiToken
    );

    coreLib.info(`\nFound ${categories.length} project categories:\n`);
    for (const category of categories) {
      const description = category.description ? ` - ${category.description}` : '';
      coreLib.info(`  ID: ${category.id}, Name: ${category.name}${description}`);
    }

    coreLib.info('\nTo filter projects by category, use the filter-project-category-ids input:');
    coreLib.info('  filter-project-category-ids: \'10000,10001\'');
  } catch (error: any) {
    coreLib.setFailed(mapJiraError(error));
  }
}
