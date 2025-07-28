import { expect } from 'bun:test';

// The helper functions for core (expectInfoLogged, expectErrorLogged, etc.)
// are no longer needed and have been removed. The others remain.

export function expectCreateCalled(octokit: any, owner: string, repo: string, key: string, url: string) {
  expect(octokit.rest.repos.createAutolink).toHaveBeenCalledWith({
    owner,
    repo,
    key_prefix: `${key}-`,
    url_template: url,
    is_alphanumeric: true
  });
}

export function expectDeleteCalled(octokit: any, owner: string, repo: string, autolinkId: number) {
  expect(octokit.rest.repos.deleteAutolink).toHaveBeenCalledWith({
    owner,
    repo,
    autolink_id: autolinkId
  });
}

export function expectListAutolinksCalled(octokit: any, owner: string, repo: string) {
  expect(octokit.rest.repos.listAutolinks).toHaveBeenCalledWith({
    owner,
    repo
  });
}

export function expectNotCalled(mockFn: any) {
  expect(mockFn).not.toHaveBeenCalled();
}