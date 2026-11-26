import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Relative paths ("/"-separated) of every file under `dir`, sorted. */
export function listFiles(dir) {
  const result = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) result.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return result.sort();
}

export function hashFiles(dir) {
  return Object.fromEntries(listFiles(dir).map((path) => [path, sha256(readFileSync(join(dir, path)))]));
}

export function contentType(path) {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return {
    json: 'application/json',
    js: 'text/javascript',
    mjs: 'text/javascript',
    css: 'text/css',
    map: 'application/json',
    html: 'text/html; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    txt: 'text/plain; charset=utf-8',
  }[ext] ?? 'application/octet-stream';
}
