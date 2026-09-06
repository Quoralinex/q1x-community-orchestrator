import { RuntimeError } from './errors.js';

export type LifecycleKind = 'mission' | 'programme' | 'work-node';

const allowed: Record<LifecycleKind, Record<string, readonly string[]>> = {
  mission: {
    proposed: ['active', 'cancelled'],
    active: ['paused', 'completed', 'cancelled'],
    paused: ['active', 'cancelled'],
    completed: [], cancelled: []
  },
  programme: {
    planned: ['active', 'cancelled'],
    active: ['paused', 'completed', 'cancelled'],
    paused: ['active', 'cancelled'],
    completed: [], cancelled: []
  },
  'work-node': {
    pending: ['ready', 'cancelled'],
    ready: ['running', 'blocked', 'cancelled'],
    running: ['completed', 'failed', 'blocked', 'cancelled'],
    blocked: ['ready', 'cancelled'],
    failed: ['ready', 'cancelled'],
    completed: [], cancelled: []
  }
};

export function assertTransition(kind: LifecycleKind, from: string, to: string): void {
  if (from === to) return;
  const next = allowed[kind][from];
  if (!next?.includes(to)) {
    throw new RuntimeError('INVALID_TRANSITION', `Invalid ${kind} transition: ${from} -> ${to}`, { kind, from, to });
  }
}

export function assertNextContractRevision(previous: number | undefined, next: number): void {
  const expected = previous === undefined ? 1 : previous + 1;
  if (next !== expected) {
    throw new RuntimeError('INVALID_REVISION', `Expected revision ${expected}, received ${next}`, { previous, next });
  }
}
