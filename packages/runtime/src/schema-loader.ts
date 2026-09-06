import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020.js';
import * as FormatsModule from 'ajv-formats';
import { SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import { RuntimeError } from './errors.js';

const schemaFiles = [
  'common', 'mission', 'programme', 'work-graph', 'replan-event',
  'capability', 'adapter-manifest', 'execution-request', 'execution-result',
  'evidence', 'artifact', 'approval', 'checkpoint', 'deployment-profile'
] as const;

const addFormats = FormatsModule.default.default;

let validators: Map<string, ValidateFunction> | undefined;

function filename(name: string): string {
  return `${name}.schema.json`;
}

function loadSchemaFile(name: string): AnySchemaObject {
  const specifier = `@quoralinex/q1x-community-contracts/schemas/v1/${filename(name)}`;
  const path = fileURLToPath(import.meta.resolve(specifier));
  return JSON.parse(readFileSync(path, 'utf8')) as AnySchemaObject;
}

export function loadContractSchemas(): Map<string, ValidateFunction> {
  if (validators) return validators;

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of schemaFiles) ajv.addSchema(loadSchemaFile(name));

  validators = new Map();
  for (const schemaId of Object.values(SCHEMA_IDS)) {
    const validate = ajv.getSchema(schemaId);
    if (!validate) throw new RuntimeError('SCHEMA_INVALID', `Schema not loaded: ${schemaId}`);
    validators.set(schemaId, validate);
  }
  return validators;
}

export function validateContract<T>(schemaId: string, value: T): T {
  const validate = loadContractSchemas().get(schemaId);
  if (!validate) throw new RuntimeError('SCHEMA_INVALID', `Unknown schema id: ${schemaId}`);
  if (!validate(value)) {
    throw new RuntimeError('SCHEMA_INVALID', `Contract does not satisfy ${schemaId}`, validate.errors);
  }
  return value;
}
