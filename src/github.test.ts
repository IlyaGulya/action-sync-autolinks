import { describe, test, expect } from 'bun:test';
import { okCreate, okDelete, useTestEnv } from './test-support';

describe('GitHub client', () => {
  const env = useTestEnv();

  describe('getExistingAutolinks', () => {
    test('returns data on success', async () => {
      env.githubMocks.octokit.paginate.mockResolvedValue([
        { id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }
      ]);

      const result = await env.githubClient.getExistingAutolinks(env.mockCore);
      expect(result).toEqual([{ id: 1, key_prefix: 'test-', url_template: 'https://test.com/<num>', is_alphanumeric: true }]);
    });
  });

  describe('createAutolink', () => {
    test('calls API with correct parameters', async () => {
      env.githubMocks.octokit.rest.repos.createAutolink.mockResolvedValue(
        okCreate('TEST', 'https://test.com/<num>')
      );

      const result = await env.githubClient.createAutolink('TEST-', 'https://test.com/<num>', env.mockCore);
      expect(result).toEqual({ id: 1, key_prefix: 'TEST-', url_template: 'https://test.com/<num>', is_alphanumeric: true });

      expect(env.githubMocks.octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
        owner: env.owner,
        repo: env.repo,
        key_prefix: 'TEST-',
        url_template: 'https://test.com/<num>',
        is_alphanumeric: true
      });
    });

    test('logs & rethrows on error', async () => {
      env.githubMocks.octokit.rest.repos.createAutolink.mockRejectedValue(new Error('fail'));
      expect(env.githubClient.createAutolink('K-', 'url', env.mockCore)).rejects.toThrow('fail');
      expect(env.mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create autolink for K-'));
    });
  });

  describe('deleteAutolink', () => {
    test('calls API with correct parameters', async () => {
      env.githubMocks.octokit.rest.repos.deleteAutolink.mockResolvedValue(okDelete(123));

      await env.githubClient.deleteAutolink(123, env.mockCore);

      expect(env.githubMocks.octokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
        owner: env.owner,
        repo: env.repo,
        autolink_id: 123
      });
    });

    test('logs & rethrows on error', async () => {
      env.githubMocks.octokit.rest.repos.deleteAutolink.mockRejectedValue(new Error('delete failed'));
      expect(env.githubClient.deleteAutolink(123, env.mockCore)).rejects.toThrow('delete failed');
      expect(env.mockCore.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete autolink 123'));
    });
  });
});
