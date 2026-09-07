import type { ExecutionBinding, WorkAssignment } from '@quoralinex/q1x-community-sdk';

export interface WorkExecutionContext {
  binding: ExecutionBinding;
  assignment: WorkAssignment;
  input?: unknown;
  signal?: AbortSignal;
}

export interface WorkExecutionOutcome {
  status: 'succeeded' | 'failed' | 'cancelled' | 'partial';
  resultRef?: string;
  usage?: { cost?: number; currency?: string; durationMs?: number };
  errorCode?: string;
}

export interface WorkExecutor {
  id: string;
  execute(context: WorkExecutionContext): Promise<WorkExecutionOutcome>;
}
