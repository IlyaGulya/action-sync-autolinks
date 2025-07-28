import * as core from '@actions/core';
import { createDeepMock, DeepMock } from './mock-utils';

/**
 * Creates a deep mock of the @actions/core module with console output suppressed.
 *
 * All functions from `@actions/core` are replaced with `bun:test` mocks that
 * wrap empty functions, preventing any output from being logged during tests.
 * The `getInput` function is overridden to return values from the provided
 * `inputs` map, allowing for easy simulation of action inputs.
 *
 * @param inputs - A record of input names to their string values.
 * @returns A `DeepMock` of the `@actions/core` module.
 */
export function createMockCore(inputs: Record<string, string> = {}): DeepMock<typeof core> {
  // Create a base shape where every function in the `core` module is a no-op.
  // This is the key to suppressing console output during tests.
  const baseShapeWithNoOps = Object.fromEntries(
    Object.keys(core).map(key => [key, () => {}])
  );

  // Create the final shape for our mock, using the no-op base
  // and overriding `getInput` with our custom implementation.
  const shape = {
    ...baseShapeWithNoOps,
    getInput: (name: string) => inputs[name] ?? '',
  };

  // createDeepMock will now wrap our no-op functions, not the real ones.
  // The `as any` is a safe cast because we've built a shape that is
  // structurally compatible for mocking purposes.
  return createDeepMock<typeof core>(shape as any);
}