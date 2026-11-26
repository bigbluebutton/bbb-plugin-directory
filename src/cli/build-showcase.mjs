#!/usr/bin/env node
// Usage: node src/cli/build-showcase.mjs --catalog <catalog.json> --out <site dir>
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { assertSchema } from '../lib/schemas.mjs';
import { buildShowcase } from '../lib/showcase.mjs';

const { values } = parseArgs({ options: { catalog: { type: 'string' }, out: { type: 'string' } } });
if (!values.catalog || !values.out) {
  console.error('--catalog and --out are required');
  process.exit(2);
}
const catalog = assertSchema('catalog', JSON.parse(readFileSync(values.catalog, 'utf8')), values.catalog);
buildShowcase(catalog, values.out);
console.log(`Showcase written to ${values.out} (${catalog.plugins.length} plugin page(s))`);
