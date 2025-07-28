import { expect } from 'bun:test';
import { CoreSpies } from './core';

export function expectInfoLogged(spies: CoreSpies, msg: string) {
  expect(spies.info).toHaveBeenCalledWith(msg);
}

export function expectErrorLogged(spies: CoreSpies, msg: string) {
  expect(spies.error).toHaveBeenCalledWith(msg);
}

export function expectWarningLogged(spies: CoreSpies, msg: string) {
  expect(spies.warning).toHaveBeenCalledWith(msg);
}

export function expectDebugLogged(spies: CoreSpies, msg: string) {
  expect(spies.debug).toHaveBeenCalledWith(msg);
}

export function expectSetFailed(spies: CoreSpies, msg: string) {
  expect(spies.setFailed).toHaveBeenCalledWith(msg);
}

export function expectSetOutput(spies: CoreSpies, name: string, value: string | number) {
  expect(spies.setOutput).toHaveBeenCalledWith(name, value);
}

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