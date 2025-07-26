const core = require('@actions/core');
const github = require('@actions/github');

async function getJiraQueues(jiraUrl, username, apiToken, http = fetch) {
  try {
    const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

    // Get all projects (which contain queues/issues)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await http(`${jiraUrl}/rest/api/3/project`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.response = {
        status: response.status,
        data: errorData,
        headers: Object.fromEntries(response.headers.entries())
      };
      throw error;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid response format from JIRA API');
    }

    return data.map(project => ({
      key: project.key,
      name: project.name,
      id: project.id
    })).filter(project => project.key); // Filter out projects without keys
  } catch (error) {
    let errorMessage = `Failed to fetch JIRA projects: ${error.message}`;
    
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      switch (status) {
        case 401:
          errorMessage = 'JIRA authentication failed. Please check your username and API token.';
          if (errorData?.errorMessages?.length > 0) {
            errorMessage += ` Details: ${errorData.errorMessages.join(', ')}`;
          }
          break;
        case 403:
          errorMessage = 'Access denied to JIRA projects. Please check your permissions.';
          if (errorData?.errorMessages?.length > 0) {
            errorMessage += ` Details: ${errorData.errorMessages.join(', ')}`;
          }
          break;
        case 404:
          errorMessage = 'JIRA instance not found. Please check your JIRA URL.';
          break;
        case 429:
          const retryAfter = error.response.headers['retry-after'] || 'unknown';
          errorMessage = `JIRA API rate limit exceeded. Retry after: ${retryAfter} seconds.`;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          errorMessage = `JIRA server error (${status}). Please try again later or contact your JIRA administrator.`;
          break;
        default:
          errorMessage = `JIRA API error (${status}): ${error.message}`;
      }
    } else if (error.name === 'AbortError') {
      errorMessage = 'JIRA API request timed out. Please check your network connection or try again later.';
    } else if (error.code) {
      switch (error.code) {
        case 'ENOTFOUND':
          errorMessage = 'Cannot resolve JIRA URL. Please check that the JIRA URL is correct and accessible.';
          break;
        case 'ECONNREFUSED':
          errorMessage = 'Connection to JIRA refused. Please check your JIRA URL and network connectivity.';
          break;
        case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
          errorMessage = 'SSL certificate verification failed for JIRA instance. Please check the certificate or contact your administrator.';
          break;
        default:
          errorMessage = `Network error connecting to JIRA: ${error.message}`;
      }
    } else {
      errorMessage = `Network error connecting to JIRA: ${error.message}`;
    }
    
    core.error(errorMessage);
    throw new Error(errorMessage);
  }
}

async function getExistingAutolinks(octokit, owner, repo) {
  try {
    const response = await octokit.rest.repos.listAutolinks({
      owner,
      repo
    });
    return response.data;
  } catch (error) {
    core.error(`Failed to fetch existing autolinks: ${error.message}`);
    throw error;
  }
}

async function createAutolink(octokit, owner, repo, keyPrefix, urlTemplate) {
  try {
    const response = await octokit.rest.repos.createAutolink({
      owner,
      repo,
      key_prefix: keyPrefix,
      url_template: urlTemplate,
      is_alphanumeric: true
    });
    core.info(`Created autolink for ${keyPrefix}: ${urlTemplate}`);
    return response.data;
  } catch (error) {
    core.error(`Failed to create autolink for ${keyPrefix}: ${error.message}`);
    throw error;
  }
}

async function deleteAutolink(octokit, owner, repo, autolinkId) {
  try {
    await octokit.rest.repos.deleteAutolink({
      owner,
      repo,
      autolink_id: autolinkId
    });
    core.info(`Deleted autolink with ID: ${autolinkId}`);
  } catch (error) {
    core.error(`Failed to delete autolink ${autolinkId}: ${error.message}`);
    throw error;
  }
}

async function syncAutolinks(deps = {}) {
  try {
    const {
      core: coreLib = core,
      githubLib = github,
      http = fetch
    } = deps;

    // Get inputs
    const githubToken = coreLib.getInput('github-token', { required: true });
    const jiraUrl = coreLib.getInput('jira-url', { required: true });
    const jiraUsername = coreLib.getInput('jira-username', { required: true });
    const jiraApiToken = coreLib.getInput('jira-api-token', { required: true });
    let currentRepo = githubLib.context.repo.owner + '/' + githubLib.context.repo.repo;
    const repository = coreLib.getInput('repository') || currentRepo;

    const [owner, repo] = repository.split('/');
    const octokit = githubLib.getOctokit(githubToken);

    coreLib.info(`Syncing autolinks for ${repository}`);
    coreLib.info(`JIRA URL: ${jiraUrl}`);

    // Fetch JIRA queues/projects
    coreLib.info('Fetching JIRA projects...');
    const jiraProjects = await getJiraQueues(jiraUrl, jiraUsername, jiraApiToken, http);
    coreLib.info(`Found ${jiraProjects.length} JIRA projects`);

    // Fetch existing autolinks
    coreLib.info('Fetching existing autolinks...');
    const existingAutolinks = await getExistingAutolinks(octokit, owner, repo);
    coreLib.info(`Found ${existingAutolinks.length} existing autolinks`);

    // Create a map of existing autolinks by key prefix
    const existingAutolinkMap = new Map();
    existingAutolinks.forEach(autolink => {
      existingAutolinkMap.set(autolink.key_prefix, autolink);
    });

    // Track which autolinks should exist
    const desiredPrefixes = new Set();

    // Create autolinks for each JIRA project
    for (const project of jiraProjects) {
      const keyPrefix = `${project.key}-`;
      const urlTemplate = `${jiraUrl}/browse/${project.key}-<num>`;

      desiredPrefixes.add(keyPrefix);

      if (existingAutolinkMap.has(keyPrefix)) {
        const existing = existingAutolinkMap.get(keyPrefix);
        if (existing.url_template === urlTemplate) {
          coreLib.info(`Autolink for ${keyPrefix} already exists and is up to date`);
        } else {
          coreLib.info(`Updating autolink for ${keyPrefix}`);
          await deleteAutolink(octokit, owner, repo, existing.id);
          await createAutolink(octokit, owner, repo, keyPrefix, urlTemplate);
        }
      } else {
        coreLib.info(`Creating new autolink for ${keyPrefix}`);
        await createAutolink(octokit, owner, repo, keyPrefix, urlTemplate);
      }
    }

    // Remove autolinks that are no longer needed (only JIRA-related ones)
    for (const [keyPrefix, autolink] of existingAutolinkMap) {
      if (!desiredPrefixes.has(keyPrefix)) {
        // Only delete if it looks like a JIRA autolink (ends with -)
        if (keyPrefix.endsWith('-') && autolink.url_template.includes(jiraUrl)) {
          coreLib.info(`Removing obsolete autolink: ${keyPrefix}`);
          await deleteAutolink(octokit, owner, repo, autolink.id);
        }
      }
    }

    coreLib.info('Autolink sync completed successfully');

    // Set outputs
    coreLib.setOutput('projects-synced', jiraProjects.length);
    coreLib.setOutput('autolinks-processed', existingAutolinks.length);

  } catch (error) {
    const { core: coreLib = core } = deps;
    coreLib.setFailed(`Action failed: ${error.message}`);
  }
}

// Run the action
if (require.main === module) {
  syncAutolinks();
}

module.exports = { syncAutolinks, getJiraQueues, getExistingAutolinks, createAutolink, deleteAutolink };
