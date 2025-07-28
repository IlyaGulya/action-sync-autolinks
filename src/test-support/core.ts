import { spyOn } from 'bun:test';
import * as core from '@actions/core';

export interface CoreSpies {
  getInput: ReturnType<typeof spyOn>;
  setOutput: ReturnType<typeof spyOn>;
  setFailed: ReturnType<typeof spyOn>;
  info: ReturnType<typeof spyOn>;
  error: ReturnType<typeof spyOn>;
  warning: ReturnType<typeof spyOn>;
  debug: ReturnType<typeof spyOn>;
}

export function createCoreSpies(inputs: Record<string, string> = {}): CoreSpies {
  return {
    getInput: spyOn(core, 'getInput').mockImplementation((name: string) => inputs[name] ?? ''),
    setOutput: spyOn(core, 'setOutput').mockImplementation(() => {}),
    setFailed: spyOn(core, 'setFailed').mockImplementation(() => {}),
    info: spyOn(core, 'info').mockImplementation(() => {}),
    error: spyOn(core, 'error').mockImplementation(() => {}),
    warning: spyOn(core, 'warning').mockImplementation(() => {}),
    debug: spyOn(core, 'debug').mockImplementation(() => {}),
  };
}

export function restoreCoreSpies(spies: CoreSpies) {
  Object.values(spies).forEach(spy => spy.mockRestore());
}

export function createMockCore(spies: CoreSpies): typeof core {
  return {
    getInput: spies.getInput,
    setOutput: spies.setOutput,
    setFailed: spies.setFailed,
    info: spies.info,
    error: spies.error,
    warning: spies.warning,
    debug: spies.debug,
  } as typeof core;
}