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
      },
      paginate: mock()
    };
  });

  describe('getExistingAutolinks', () => {
    test('returns data on success', async () => {
      mockOctokit.paginate.mockResolvedValue([
        { id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }
      ]);

      const mockCore = { error: mock() } as any;
      const result = await getExistingAutolinks(mockOctokit, 'owner', 'repo', mockCore);
      expect(result).toEqual([{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }]);
    });
  });

  describe('createAutolink', () => {
    test('calls API with correct parameters', async () => {
      mockOctokit.rest.repos.createAutolink.mockResolvedValue({
        data: { id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true }
      });

      const mockCore = { info: mock(), error: mock() } as any;
      const result = await createAutolink(mockOctokit, 'owner', 'repo', 'TEST-', 'https://test.com/<num>', mockCore);
      expect(result).toEqual({ id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true });

      expect(mockOctokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        key_prefix: 'TEST-',
        url_template: 'https://test.com/<num>',
        is_alphanumeric: true
      });
    });

    test('logs & rethrows on error', async () => {
      const mockCore = { info: mock(), error: mock() } as any;
      mockOctokit.rest.repos.createAutolink.mockRejectedValue(new Error('fail'));
      expect(createAutolink(mockOctokit, 'o', 'r', 'K-', 'url', mockCore)).rejects.toThrow('fail');
      expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create autolink for K-'));
    });
  });

  describe('deleteAutolink', () => {
    test('calls API with correct parameters', async () => {
      mockOctokit.rest.repos.deleteAutolink.mockResolvedValue({});

      const mockCore = { info: mock(), error: mock() } as any;
      await deleteAutolink(mockOctokit, 'owner', 'repo', 123, mockCore);

      expect(mockOctokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        autolink_id: 123
      });
    });

    test('logs & rethrows on error', async () => {
      const mockCore = { info: mock(), error: mock() } as any;
      mockOctokit.rest.repos.deleteAutolink.mockRejectedValue(new Error('delete failed'));
      expect(deleteAutolink(mockOctokit, 'o', 'r', 123, mockCore)).rejects.toThrow('delete failed');
      expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete autolink 123'));
    });
  });
});
