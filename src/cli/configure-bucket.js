#!/usr/bin/env node
// One-time bucket setup: creates the bucket when it does not exist (local
// tests) and sets the CORS rule the browser needs to load bundles and
// translations from another origin: GET/HEAD from any origin, since every
// BigBlueButton server has its own.
//
// Usage: node src/cli/configure-bucket.js [--create]
// Environment: the S3_* variables of src/lib/storage.js.

import { parseArgs } from 'node:util';
import { CreateBucketCommand, GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { Storage, storageConfigFromEnv } from '../lib/storage.js';

export const CORS_RULES = [{ AllowedOrigins: ['*'], AllowedMethods: ['GET', 'HEAD'], AllowedHeaders: ['*'], MaxAgeSeconds: 3600 }];

const { values } = parseArgs({ options: { create: { type: 'boolean', default: false } } });
const storage = new Storage(storageConfigFromEnv());
if (values.create) {
  try {
    await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
    console.log(`Created bucket ${storage.bucket}`);
  } catch (error) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)) throw error;
  }
}
await storage.client.send(new PutBucketCorsCommand({ Bucket: storage.bucket, CORSConfiguration: { CORSRules: CORS_RULES } }));
const { CORSRules } = await storage.client.send(new GetBucketCorsCommand({ Bucket: storage.bucket }));
console.log(`CORS of ${storage.bucket}: ${JSON.stringify(CORSRules)}`);
