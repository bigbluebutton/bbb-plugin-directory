#!/usr/bin/env node
// Usage: node src/cli/generate-sdk-table.js --bbb-repo <path to a bigbluebutton clone with tags> [--out data/bbb-sdk-versions.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generateSdkTable } from '../lib/sdk-table.js';

const { values } = parseArgs({
  options: {
    'bbb-repo': { type: 'string' },
    out: { type: 'string', default: 'data/bbb-sdk-versions.json' },
  },
});
if (!values['bbb-repo']) {
  console.error('--bbb-repo is required');
  process.exit(2);
}
const previous = existsSync(values.out) ? JSON.parse(readFileSync(values.out, 'utf8')) : { lines: {} };
const table = generateSdkTable(values['bbb-repo'], previous);
writeFileSync(values.out, `${JSON.stringify(table, null, 2)}\n`);
for (const [line, data] of Object.entries(table.lines)) {
  console.log(`${line}: ${Object.keys(data.releases).length} releases, minSupported ${data.minSupported}`);
}
