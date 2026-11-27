import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers/fixtures.js';

const run = promisify(execFile);

test('generate-catalog creates the output folder when it does not exist', async () => {
  // An empty root has no plugins, so the storage is never contacted and the
  // dummy S3 settings are enough; --no-upload skips the upload.
  const root = tempDir('pd-catalog-root-');
  const out = join(tempDir('pd-catalog-out-'), 'missing', 'dir', 'catalog.json');
  await run(process.execPath, ['src/cli/generate-catalog.js', '--root', root, '--out', out, '--no-upload'], {
    env: {
      ...process.env,
      S3_ENDPOINT: 'http://127.0.0.1:9',
      S3_BUCKET: 'bucket',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      PUBLIC_BASE_URL: 'https://plugins.example.org',
    },
  });
  assert.ok(existsSync(out));
  const catalog = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.plugins, []);
});
