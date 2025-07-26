import { describe, test, expect, mock } from 'bun:test';
import { getExistingAutolinks, createAutolink, deleteAutolink } from './github';

describe('GitHub helper functions', () => {
  test('getExistingAutolinks returns data and handles errors', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          listAutolinks: mock().mockResolvedValue({ data: [{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }] })
        }
      }
    };

    const result = await getExistingAutolinks(mockOctokit as any, 'owner', 'repo');
    expect(result).toEqual([{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }]);

    // Test error handling
    mockOctokit.rest.repos.listAutolinks.mockRejectedValueOnce(new Error('API Error'));
    expect(getExistingAutolinks(mockOctokit as any, 'owner', 'repo'))
      .rejects.toThrow('API Error');
  });

  test('createAutolink calls API and handles errors', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          createAutolink: mock().mockResolvedValue({ data: { id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true } })
        }
      }
    };

    const result = await createAutolink(mockOctokit as any, 'owner', 'repo', 'TEST-', 'https://test.com/<num>');
    expect(result).toEqual({ id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true });

    expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      key_prefix: 'TEST-',
      url_template: 'https://test.com/<num>',
      is_alphanumeric: true
    });

    // Test error handling
    mockOctokit.rest.repos.createAutolink.mockRejectedValueOnce(new Error('Create Error'));
    expect(createAutolink(mockOctokit as any, 'owner', 'repo', 'TEST-', 'https://test.com/<num>'))
      .rejects.toThrow('Create Error');
  });

  test('deleteAutolink calls API and handles errors', async () => {
    const mockOctokit = {
      rest: {
        repos: {
          deleteAutolink: mock().mockResolvedValue({})
        }
      }
    };

    await deleteAutolink(mockOctokit as any, 'owner', 'repo', 123);

    expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      autolink_id: 123
    });

    // Test error handling
    mockOctokit.rest.repos.deleteAutolink.mockRejectedValueOnce(new Error('Delete Error'));
    expect(deleteAutolink(mockOctokit as any, 'owner', 'repo', 123))
      .rejects.toThrow('Delete Error');
  });
});
