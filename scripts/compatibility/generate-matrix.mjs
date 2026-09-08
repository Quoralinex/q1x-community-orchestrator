import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { normalizeCompatibilityMatrix, renderCompatibilityMarkdown } from './matrix-lib.mjs';

const root = process.cwd();
const sourcePath = resolve(root, 'compatibility/matrix.json');
const outputPath = resolve(root, 'docs/compatibility-matrix.md');
const check = process.argv.includes('--check');

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const rendered = renderCompatibilityMarkdown(normalizeCompatibilityMatrix(source));

if (check) {
  let current = '';
  try {
    current = await readFile(outputPath, 'utf8');
  } catch {
    console.error('Compatibility matrix documentation is missing.');
    process.exitCode = 1;
  }
  if (current && current !== rendered) {
    console.error('Compatibility matrix documentation is stale. Run node scripts/compatibility/generate-matrix.mjs.');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, rendered, 'utf8');
  process.stdout.write(`${outputPath}\n`);
}
