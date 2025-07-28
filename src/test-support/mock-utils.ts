import {mock} from 'bun:test';

type AnyFn = (...a: any[]) => any;
type MockedFn<F extends AnyFn> = ReturnType<typeof mock<F>>;

// Keys whose deep generics we don't want to recurse into
type ProblemRoots = "request" | "graphql" | "hook";

// ---- DeepPartial / DeepMock ------------------------------------------------

export type DeepPartial<T> =
  T extends AnyFn
    ? ((...a: Parameters<T>) => ReturnType<T>) & {
    [K in Exclude<keyof T, keyof AnyFn>]?: DeepPartial<T[K]>;
  }
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

// This is the core of the solution. By intersecting the generated mock shape
// with the original type `T`, we create a hybrid type that is both a deep
// mock (for test-writing ergonomics) AND assignable to the original type
// (for satisfying function signatures).
export type DeepMock<T> = (
  T extends AnyFn
    // For functions, we create a mock of the function itself, but also intersect
    // it with the original type `T`. This preserves properties on the function
    // (like `paginate.iterator`) with their original, correct types.
    ? MockedFn<T> & T
    : T extends object
      ? {
        [K in keyof T]:
        K extends ProblemRoots ? T[K] :
          DeepMock<T[K]>;
      }
      : T
  ) & T;

export function createDeepMock<T>(shape: DeepPartial<T> = {} as any): DeepMock<T> {
  const visit = (node: any, key?: string): any => {
    if (typeof node === "function") {
      const m = mock(node as AnyFn);
      // This is the key to handling `paginate` automatically. We recursively
      // visit and mock any properties that exist on the function object itself.
      for (const k of Object.keys(node)) {
        (m as any)[k] = visit((node as any)[k], k);
      }
      return m;
    }
    if (Array.isArray(node)) return node.map((v) => visit(v));
    if (node && typeof node === "object") {
      const out: Record<string, any> = {};
      for (const k of Object.keys(node)) {
        out[k] = visit(node[k], k);
      }
      return out;
    }
    return node;
  };
  // The created object is cast to DeepMock<T>. Because DeepMock<T> now includes `& T`,
  // this object is now assignable to T where needed.
  return visit(shape) as DeepMock<T>;
}