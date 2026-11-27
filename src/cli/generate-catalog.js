#!/usr/bin/env node
// Generates catalog.json from the object storage and this repository, uploads
// it next to the plugins and writes a local copy for the showcase.
//
// Usage: node src/cli/generate-catalog.js --out <catalog.json> [--root .] [--no-upload]
// Environment: the S3_* variables of src/lib/storage.js and PUBLIC_BASE_URL.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildCatalog } from '../lib/catalog.js';
import { CACHE_SHORT, Storage, storageConfigFromEnv } from '../lib/storage.js';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    root: { type: 'string', default: '.' },
    'no-upload': { type: 'boolean', default: false },
  },
});
const baseUrl = process.env.PUBLIC_BASE_URL;
if (!values.out || !baseUrl) {
  console.error('--out and PUBLIC_BASE_URL are required');
  process.exit(2);
}
const storage = new Storage(storageConfigFromEnv());
const catalog = await buildCatalog({ storage, root: resolve(values.root), baseUrl });
const body = `${JSON.stringify(catalog, null, 2)}\n`;
writeFileSync(values.out, body);
if (!values['no-upload']) {
  await storage.put('catalog.json', body, { contentType: 'application/json', cacheControl: CACHE_SHORT });
  const readBack = await storage.getText('catalog.json');
  if (readBack !== body) throw new Error('catalog.json read back from the storage differs from what was uploaded');
}
console.log(`catalog.json: ${catalog.plugins.length} plugin(s), ${catalog.plugins.reduce((n, p) => n + p.versions.length, 0)} version(s)`);
