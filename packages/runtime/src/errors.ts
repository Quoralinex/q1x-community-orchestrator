export type RuntimeErrorCode =
  | 'SCHEMA_INVALID'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_REVISION'
  | 'INVALID_TRANSITION'
  | 'GRAPH_CYCLE'
  | 'EXECUTION_CONFLICT'
  | 'CHECKPOINT_NOT_FOUND'
  | 'STORAGE_ERROR'
  | 'INSECURE_ENDPOINT'
  | 'MISSING_CREDENTIAL'
  | 'TRANSPORT_NOT_FOUND'
  | 'MODEL_TRANSPORT_ERROR';

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly details?: unknown;

  constructor(code: RuntimeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.details = details;
  }
}
