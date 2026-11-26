// S3-compatible object storage, configured only through the environment, so
// switching providers means switching the CI's target and nothing else.
//
//   S3_ENDPOINT       https://nyc3.digitaloceanspaces.com (any S3-compatible endpoint)
//   S3_REGION         us-east-1 by default (most S3-compatible providers ignore it)
//   S3_BUCKET         bucket name
//   S3_PREFIX         optional folder inside the bucket, e.g. "plugins" (no slashes at the ends)
//   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
//   S3_FORCE_PATH_STYLE  "true" for providers that need it (MinIO, SeaweedFS)
//   S3_OBJECT_ACL     e.g. "public-read" when the bucket is not public by policy; empty for none

import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';

export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
export const CACHE_SHORT = 'public, max-age=300';

export function storageConfigFromEnv(env = process.env) {
  const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing storage configuration: ${missing.join(', ')}`);
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || 'us-east-1',
    bucket: env.S3_BUCKET,
    prefix: (env.S3_PREFIX || '').replace(/^\/+|\/+$/g, ''),
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    acl: env.S3_OBJECT_ACL || undefined,
  };
}

const isNotFound = (error) => error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey';

export class Storage {
  constructor(config) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ? `${config.prefix}/` : '';
    this.acl = config.acl;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Some S3-compatible providers reject the newer default checksum headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  key(path) {
    return `${this.prefix}${path}`;
  }

  async exists(path) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(path) }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async getText(path) {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(path) }));
      return await response.Body.transformToString();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getJson(path) {
    const text = await this.getText(path);
    return text === null ? null : JSON.parse(text);
  }

  async put(path, body, { contentType, cacheControl }) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(path),
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      ...(this.acl ? { ACL: this.acl } : {}),
    }));
  }

  /** Every key under `path` (relative to the configured prefix). */
  async list(path) {
    const keys = [];
    let token;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: this.key(path), ContinuationToken: token,
      }));
      for (const item of page.Contents ?? []) keys.push(item.Key.slice(this.prefix.length));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  /** Immediate sub-folder names under `path` ("pick-random-user/" -> ["0.1.4", ...]). */
  async listFolders(path) {
    const names = [];
    let token;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: this.key(path), Delimiter: '/', ContinuationToken: token,
      }));
      for (const item of page.CommonPrefixes ?? []) names.push(item.Prefix.slice(this.key(path).length).replace(/\/$/, ''));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return names;
  }

  async delete(paths) {
    for (let i = 0; i < paths.length; i += 1000) {
      const chunk = paths.slice(i, i + 1000);
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: chunk.map((path) => ({ Key: this.key(path) })), Quiet: true },
      }));
    }
  }
}
