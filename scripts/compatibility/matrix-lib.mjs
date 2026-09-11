export const MATRIX_VERSION = '1.0.0';
export const COMPATIBILITY_STATUSES = Object.freeze(['tested', 'experimental', 'unsupported']);
export const ENVIRONMENT_TIERS = Object.freeze(['fixture', 'hosted-runner', 'physical-host']);
export const COMPATIBILITY_CATEGORIES = Object.freeze([
  'os',
  'deployment',
  'package-consumer',
  'model-transport',
  'adapter',
  'browser',
  'desktop',
  'protocol',
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function tupleKey(entry) {
  return [entry.category, entry.target, entry.implementation ?? '', entry.version ?? ''].join('\u0000');
}

function compareEntries(a, b) {
  for (const key of ['category', 'target', 'implementation', 'version', 'id']) {
    const left = a[key] ?? '';
    const right = b[key] ?? '';
    const comparison = left.localeCompare(right);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function validateEvidence(evidence, entryId, index) {
  assertObject(evidence, `evidence ${index} for ${entryId}`);
  if (!['ci', 'manual'].includes(evidence.kind)) {
    throw new TypeError(`Evidence kind for ${entryId} must be ci or manual`);
  }
  assertNonEmptyString(evidence.source, `Evidence source for ${entryId}`);
  if (!ENVIRONMENT_TIERS.includes(evidence.environmentTier)) {
    throw new TypeError(`Evidence environment tier for ${entryId} must be fixture, hosted-runner or physical-host`);
  }
  if (!SHA_PATTERN.test(evidence.commitSha ?? '')) {
    throw new TypeError(`Evidence commit SHA for ${entryId} must be exactly 40 lowercase hexadecimal characters`);
  }
  if (evidence.kind === 'ci' && !/^\.(?:github\/workflows\/)|^tests\//.test(evidence.source)) {
    throw new TypeError(`CI evidence source for ${entryId} must identify a repository workflow or test file`);
  }
}

export function validateCompatibilityMatrix(value) {
  assertObject(value, 'Compatibility matrix');
  if (value.matrixVersion !== MATRIX_VERSION) {
    throw new TypeError(`matrixVersion must be exactly ${MATRIX_VERSION}`);
  }
  assertNonEmptyString(value.projectVersion, 'projectVersion');
  if (!SHA_PATTERN.test(value.generatedFrom ?? '')) {
    throw new TypeError('generatedFrom must be exactly 40 lowercase hexadecimal characters');
  }
  if (!Array.isArray(value.entries)) throw new TypeError('entries must be an array');

  const ids = new Set();
  const tuples = new Set();

  for (const entry of value.entries) {
    assertObject(entry, 'Compatibility entry');
    assertNonEmptyString(entry.id, 'Compatibility entry id');
    assertNonEmptyString(entry.target, `Compatibility target for ${entry.id}`);

    if (ids.has(entry.id)) throw new TypeError(`Duplicate entry id: ${entry.id}`);
    ids.add(entry.id);

    if (!COMPATIBILITY_CATEGORIES.includes(entry.category)) {
      throw new TypeError(`Unsupported compatibility category for ${entry.id}: ${entry.category}`);
    }
    if (!COMPATIBILITY_STATUSES.includes(entry.status)) {
      throw new TypeError(`Unsupported compatibility status for ${entry.id}: ${entry.status}`);
    }

    if (entry.implementation !== undefined) assertNonEmptyString(entry.implementation, `implementation for ${entry.id}`);
    if (entry.version !== undefined) assertNonEmptyString(entry.version, `version for ${entry.id}`);
    if (entry.notes !== undefined) assertNonEmptyString(entry.notes, `notes for ${entry.id}`);
    if (entry.constraints !== undefined) {
      if (!Array.isArray(entry.constraints) || entry.constraints.length === 0) {
        throw new TypeError(`constraints for ${entry.id} must be a non-empty array when supplied`);
      }
      for (const constraint of entry.constraints) assertNonEmptyString(constraint, `constraint for ${entry.id}`);
    }

    const key = tupleKey(entry);
    if (tuples.has(key)) throw new TypeError(`Duplicate compatibility tuple for ${entry.id}`);
    tuples.add(key);

    if (entry.evidence !== undefined) {
      if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
        throw new TypeError(`evidence for ${entry.id} must be a non-empty array when supplied`);
      }
      entry.evidence.forEach((evidence, index) => validateEvidence(evidence, entry.id, index));
    }

    if (entry.status === 'tested' && (!Array.isArray(entry.evidence) || entry.evidence.length === 0)) {
      throw new TypeError(`Tested entry ${entry.id} requires evidence`);
    }
    if (entry.status === 'experimental' && !entry.notes && (!entry.constraints || entry.constraints.length === 0)) {
      throw new TypeError(`Experimental entry ${entry.id} requires a caveat in notes or constraints`);
    }
    if (entry.status === 'unsupported' && Array.isArray(entry.evidence) && entry.evidence.length > 0) {
      throw new TypeError(`Unsupported entry ${entry.id} cannot contain successful verification evidence`);
    }
  }

  return true;
}

export function normalizeCompatibilityMatrix(value) {
  validateCompatibilityMatrix(value);
  const copy = structuredClone(value);
  copy.entries.sort(compareEntries);
  for (const entry of copy.entries) {
    if (entry.evidence) {
      entry.evidence.sort((a, b) =>
        a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source) || a.commitSha.localeCompare(b.commitSha));
    }
    if (entry.constraints) entry.constraints.sort((a, b) => a.localeCompare(b));
  }
  return copy;
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function evidenceText(entry) {
  if (!entry.evidence?.length) return '—';
  return entry.evidence
    .map(item => `${item.environmentTier} / ${item.kind}: \`${escapeCell(item.source)}\` @ \`${item.commitSha}\``)
    .join('<br>');
}

function caveatText(entry) {
  const parts = [];
  if (entry.constraints?.length) parts.push(...entry.constraints);
  if (entry.notes) parts.push(entry.notes);
  return parts.length ? parts.map(escapeCell).join('<br>') : '—';
}

export function renderCompatibilityMarkdown(matrix) {
  const normalized = normalizeCompatibilityMatrix(matrix);
  const lines = [
    '# Compatibility Matrix',
    '',
    `**Matrix version:** ${normalized.matrixVersion}`,
    `**Project version:** ${normalized.projectVersion}`,
    `**Evidence baseline:** \`${normalized.generatedFrom}\``,
    '',
    '## Status legend',
    '',
    '- **tested** — verified by the evidence recorded in this matrix.',
    '- **experimental** — available or plausible only under the stated caveats; not a tested compatibility guarantee.',
    '- **unsupported** — explicitly outside the supported/tested surface.',
    '',
    '> Absence from this matrix is not a compatibility claim.',
    '',
  ];

  for (const category of COMPATIBILITY_CATEGORIES) {
    const entries = normalized.entries.filter(entry => entry.category === category);
    if (entries.length === 0) continue;
    lines.push(`## ${category}`, '');
    lines.push('| Target | Status | Implementation | Version | Evidence | Constraints / notes |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const entry of entries) {
      lines.push(`| ${escapeCell(entry.target)} | ${entry.status} | ${escapeCell(entry.implementation ?? '—')} | ${escapeCell(entry.version ?? '—')} | ${evidenceText(entry)} | ${caveatText(entry)} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const HOST_EVIDENCE_KEYS = new Set([
  'schema', 'environmentTier', 'os', 'osVersion', 'architecture', 'sourceSha', 'releaseSha',
  'bridgeVersion', 'browserVersion', 'scenarioIds', 'state', 'remediationNotes',
]);
const PRIVATE_HOST_VALUE = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\|token\s*[=:]|api[-_]?key|password|secret|credential)/i;

function collectHostStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectHostStrings(item, output);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectHostStrings(item, output);
  return output;
}

export function validateHostEvidence(value) {
  const findings = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, findings: ['host evidence must be an object'] };
  }
  for (const key of Object.keys(value)) if (!HOST_EVIDENCE_KEYS.has(key)) findings.push(`unsupported field: ${key}`);
  if (value.schema !== 'q1x.phase13-host-evidence.v1') findings.push('unsupported host evidence schema');
  if (value.environmentTier !== 'physical-host') findings.push('environmentTier must be physical-host');
  if (!['macos', 'windows', 'linux'].includes(value.os)) findings.push('unsupported operating system');
  if (typeof value.osVersion !== 'string' || !value.osVersion.trim()) findings.push('osVersion is required');
  if (typeof value.architecture !== 'string' || !value.architecture.trim()) findings.push('architecture is required');
  if (!SHA_PATTERN.test(value.sourceSha ?? '')) findings.push('sourceSha must be an exact lowercase 40-character SHA');
  if (value.releaseSha !== undefined && !SHA_PATTERN.test(value.releaseSha)) findings.push('releaseSha must be an exact lowercase 40-character SHA');
  if (!Array.isArray(value.scenarioIds) || value.scenarioIds.length === 0 || value.scenarioIds.some(id => typeof id !== 'string' || !id.trim())) {
    findings.push('scenarioIds must be a non-empty string array');
  }
  if (!['pass', 'fail', 'blocked'].includes(value.state)) findings.push('state must be pass, fail or blocked');
  if (value.remediationNotes !== undefined && (!Array.isArray(value.remediationNotes) || value.remediationNotes.some(note => typeof note !== 'string'))) {
    findings.push('remediationNotes must be a string array');
  }
  for (const string of collectHostStrings(value)) {
    if (PRIVATE_HOST_VALUE.test(string)) {
      findings.push('host evidence contains a private path or secret-bearing value');
      break;
    }
  }
  return { valid: findings.length === 0, findings };
}
