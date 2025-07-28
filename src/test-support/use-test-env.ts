import { beforeEach, afterEach } from 'bun:test';
import { createTestEnv } from './env';

export function useTestEnv(opts?: Parameters<typeof createTestEnv>[0]) {
  let current: ReturnType<typeof createTestEnv> | undefined;
  
  beforeEach(() => { 
    current = createTestEnv(opts); 
  });
  
  afterEach(() => { 
    current?.restore(); 
  });

  // Give tests a stable reference that always forwards to current
  return new Proxy({} as ReturnType<typeof createTestEnv>, {
    get(_target, prop) {
      if (!current) {
        throw new Error(`Test environment accessed before initialization. Property: ${String(prop)}`);
      }
      return (current as any)[prop];
    }
  });
}