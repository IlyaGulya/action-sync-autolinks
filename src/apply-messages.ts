import { AutolinkOp } from './types';

export const describeOp = (op: AutolinkOp): string => {
  switch (op.kind) {
    case 'create':
      return `autolink for ${op.keyPrefix} -> ${op.urlTemplate}`;
    case 'update':
      return `autolink ${op.autolinkId} for ${op.keyPrefix} -> ${op.urlTemplate}`;
    case 'delete':
      return `autolink ${op.autolinkId} for ${op.keyPrefix}`;
  }
};
