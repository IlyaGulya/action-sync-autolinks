import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { getExistingAutolinks, createAutolink, deleteAutolink } from './github';

describe('GitHub helper functions', () => {
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        repos: {
          listAutolinks: mock(),
          createAutolink: mock(),
          deleteAutolink: mock()
        }
      }
    };
  });

  describe('getExistingAutolinks', () => {
    test('returns data on success', async () => {
      mockOctokit.rest.repos.listAutolinks.mockResolvedValue({
        data: [{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }]
      });

      const result = await getExistingAutolinks(mockOctokit, 'owner', 'repo');
      expect(result).toEqual([{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }]);
    });
  });

  describe('createAutolink', () => {
    test('calls API with correct parameters', async () => {
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({
        data: { id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true }
      });

      const result = await createAutolink(mockOctokit, 'owner', 'repo', 'TEST-', 'https://test.com/<num>');
      expect(result).toEqual({ id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true });

      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        key_prefix: 'TEST-',
        url_template: 'https://test.com/<num>',
        is_alphanumeric: true
      });
    });
  });

  describe('deleteAutolink', () => {
    test('calls API with correct parameters', async () => {
      mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});

      await deleteAutolink(mockOctokit, 'owner', 'repo', 123);

      expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        autolink_id: 123
      });
    });
  });
});
