# Autolinks Sync Action

Tired of manually managing autolinks for your project management tool issues in your GitHub repo? I have a solution for you!

This GitHub Action automatically synchronizes project management tool projects with GitHub repository autolinks. 
This ensures that issue references (e.g., `PROJECT-123`) in issues, pull requests, and commits automatically link to the corresponding tickets.

**Currently supported tools:**
- ✅ JIRA
- 🔄 Other tools (planned for future releases)

## Features (JIRA)

- Fetches all JIRA projects from your instance
- Creates autolinks for each project key (e.g., `PROJECT-` → `https://your-jira.com/browse/PROJECT-123`)
- Updates existing autolinks if JIRA URL changes
- Removes obsolete JIRA autolinks when projects are deleted (delete operations are prioritized for faster cleanup)
- Preserves non-JIRA autolinks
- **Parallel execution** of GitHub API requests with configurable concurrency for faster syncing
- Filter projects by category, type, or name (supports GitHub's 500 autolinks limit)
- Discover available project categories

## Usage

### Basic Example

```yaml
name: Sync JIRA Autolinks
on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM
  workflow_dispatch:  # Allow manual trigger

jobs:
  sync-autolinks:
    runs-on: ubuntu-latest
    steps:
      - uses: IlyaGulya/action-sync-autolinks@master
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          jira-url: ${{ vars.JIRA_URL }}
          jira-username: ${{ vars.JIRA_USERNAME }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

### Advanced Example

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ vars.JIRA_USERNAME }}
    jira-api-token: ${{ vars.JIRA_API_TOKEN }}
    repository: 'owner/repo'  # Optional: specify different repo
    dry-run: 'true'  # Optional: test changes without applying them
    max-parallel-requests-github: '10'  # Optional: control GitHub API concurrency (default: 5)
```

### Filtering Projects

GitHub has a limit of 500 autolinks per repository. If your JIRA instance has more than 500 projects, you must use filters to reduce the number of synced projects.

#### Filter by Category

**Step 1: Discover Available Categories**

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    action: 'list-categories'  # Discovery mode - lists categories and exits
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ vars.JIRA_USERNAME }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

This will output available categories:
```
Found 3 project categories:

  ID: 10000, Name: ENGINEERING - Engineering Projects
  ID: 10001, Name: MARKETING - Marketing Campaigns
  ID: 10002, Name: SUPPORT - Customer Support

To filter projects by category, use the filter-project-category-ids input:
  filter-project-category-ids: '10000,10001'
```

**Step 2: Filter Projects by Category**

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ vars.JIRA_USERNAME }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    filter-project-category-ids: '10000,10001'  # Only sync Engineering and Marketing projects
```

#### Filter by Project Type

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ vars.JIRA_USERNAME }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    filter-project-type: 'software,business'  # Only sync software and business projects
```

Valid types: `business`, `service_desk`, `software`

#### Filter by Project Key or Name

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ vars.JIRA_USERNAME }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    filter-project-query: 'platform'  # Only sync projects with 'platform' in key or name (case insensitive)
```

#### Combine Multiple Filters

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ vars.JIRA_USERNAME }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    filter-project-category-ids: '10000'  # Engineering category
    filter-project-type: 'software'        # Software projects only
    filter-project-query: 'api'            # With 'api' in name or key
```

## Inputs

| Input                          | Description                                                                       | Required | Default                    |
|--------------------------------|-----------------------------------------------------------------------------------|----------|----------------------------|
| `action`                       | Action to perform: `sync` (default) or `list-categories`                          | No       | `sync`                     |
| `github-token`                 | GitHub token for API access (required for sync action)                            | No*      | `${{ github.token }}`      |
| `jira-url`                     | JIRA instance URL (e.g., `https://company.atlassian.net`)                         | Yes      | -                          |
| `jira-username`                | JIRA username/email                                                               | Yes      | -                          |
| `jira-api-token`               | JIRA API token                                                                    | Yes      | -                          |
| `repository`                   | Repository in format `owner/repo` (used for sync action)                          | No       | `${{ github.repository }}` |
| `dry-run`                      | Run in dry-run mode (plan only, no changes) (used for sync action)                | No       | `false`                    |
| `filter-project-category-ids`  | Filter JIRA projects by category ID (comma-separated for multiple)                | No       | -                          |
| `filter-project-type`          | Filter JIRA projects by type (comma-separated: business, service_desk, software)  | No       | -                          |
| `filter-project-query`         | Filter JIRA projects by literal string matching project key or name               | No       | -                          |
| `max-parallel-requests-github` | Maximum number of parallel GitHub API requests (used for sync action)             | No       | `5`                        |

*Required for `sync` action only

## Outputs

| Output                | Description                                                    |
|-----------------------|----------------------------------------------------------------|
| `projects-synced`     | Number of JIRA projects processed                              |
| `autolinks-processed` | Number of autolink operations performed (create/update/delete) |

## Setup

### 1. Create JIRA API Token

1. Go to your JIRA instance
2. Navigate to Account Settings → Security → API tokens
3. Create a new API token
4. Save the token securely

### 2. Configure Repository Secrets

Add these secrets to your repository:

- `JIRA_URL`: Your JIRA instance URL (e.g., `https://company.atlassian.net`)
- `JIRA_USERNAME`: Your JIRA username or email
- `JIRA_API_TOKEN`: The API token created above

### 3. Required Permissions

The action requires:
- Repository administration permissions (to manage autolinks)
- JIRA project browse permissions (to list projects)

## How It Works

1. **Fetch JIRA Projects**: Uses JIRA REST API to get all accessible projects
2. **Get Existing Autolinks**: Retrieves current repository autolinks via GitHub API
3. **Build Plan**: Compares JIRA projects with existing autolinks to determine operations needed
4. **Execute Sync** (with parallel execution):
   - Delete operations are prioritized and executed first for faster cleanup
   - Creates new autolinks for JIRA projects that don't have them
   - Updates existing autolinks if the JIRA URL changed
   - Operations run in parallel (configurable via `max-parallel-requests-github`) for faster syncing
   - Preserves non-JIRA autolinks
5. **Result**: JIRA references like `PROJ-123` automatically link to `https://your-jira.com/browse/PROJ-123`

## Example Output

After running, references in issues and PRs will automatically link:

- `MYPROJ-123` → Links to `https://company.atlassian.net/browse/MYPROJ-123`
- `TASK-456` → Links to `https://company.atlassian.net/browse/TASK-456`

## Troubleshooting

### Permission Errors
- Ensure the GitHub token has repository admin permissions
- Verify JIRA credentials have project browse access

### No Projects Found
- Check JIRA URL format (should include protocol: `https://`)
- Verify API token and username are correct
- Ensure user has access to JIRA projects

### Too Many Projects (>500)
- **Error**: "Found XXX JIRA projects, but GitHub only supports up to 500 autolinks per repository"
- **Solution**: Use filtering inputs to reduce the number of projects
- **Available Filters**:
  - `filter-project-category-ids`: Filter by category (run with `list-categories: true` to see available categories)
  - `filter-project-type`: Filter by type (`business`, `service_desk`, `software`)
  - `filter-project-query`: Filter by project key or name (case insensitive)
- **Tip**: Combine multiple filters for more precise results

### Autolink Creation Fails
- Repository admin permissions required for autolink management
- Check if autolink limits are reached (GitHub has a 500 autolinks limit per repository)

### Performance Tuning
- **Default**: The action runs 5 parallel GitHub API requests by default
- **Increase concurrency**: For faster syncing with many projects, increase `max-parallel-requests-github` (e.g., `10` or `20`)
- **Decrease concurrency**: If hitting rate limits, lower `max-parallel-requests-github` to `1` or `2`
- **Note**: Higher concurrency may trigger GitHub API rate limits on large operations

## License

MIT
