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
- Removes obsolete JIRA autolinks when projects are deleted
- Preserves non-JIRA autolinks

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
          jira-url: ${{ secrets.JIRA_URL }}
          jira-username: ${{ secrets.JIRA_USERNAME }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

### Advanced Example

```yaml
- uses: IlyaGulya/action-sync-autolinks@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-url: ${{ secrets.JIRA_URL }}
    jira-username: ${{ secrets.JIRA_USERNAME }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    repository: 'owner/repo'  # Optional: specify different repo
```

## Inputs

| Input            | Description                                               | Required | Default                    |
|------------------|-----------------------------------------------------------|----------|----------------------------|
| `github-token`   | GitHub token for API access                               | Yes      | `${{ github.token }}`      |
| `jira-url`       | JIRA instance URL (e.g., `https://company.atlassian.net`) | Yes      | -                          |
| `jira-username`  | JIRA username/email                                       | Yes      | -                          |
| `jira-api-token` | JIRA API token                                            | Yes      | -                          |
| `repository`     | Repository in format `owner/repo`                         | No       | `${{ github.repository }}` |

## Outputs

| Output                | Description                        |
|-----------------------|------------------------------------|
| `projects-synced`     | Number of JIRA projects processed  |
| `autolinks-processed` | Number of existing autolinks found |

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
3. **Sync Process**:
   - Creates new autolinks for JIRA projects that don't have them
   - Updates existing autolinks if the JIRA URL changed
   - Removes obsolete JIRA autolinks (preserves non-JIRA ones)
4. **Result**: JIRA references like `PROJ-123` automatically link to `https://your-jira.com/browse/PROJ-123`

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

### Autolink Creation Fails
- Repository admin permissions required for autolink management
- Check if autolink limits are reached (GitHub has limits per repository)

## License

MIT
