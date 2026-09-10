export const CURRENT_STATE_SCHEMA_VERSION = 1;

export type StateSchemaClassification = 'current' | 'upgradeable' | 'future';

export function classifyStateSchema(version: number): StateSchemaClassification {
  if (version === CURRENT_STATE_SCHEMA_VERSION) return 'current';
  if (Number.isInteger(version) && version >= 0 && version < CURRENT_STATE_SCHEMA_VERSION) return 'upgradeable';
  return 'future';
}
