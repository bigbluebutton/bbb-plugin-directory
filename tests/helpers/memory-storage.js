// In-memory stand-in for src/lib/storage.js, same interface.
export class MemoryStorage {
  constructor() {
    this.objects = new Map();
    this.log = [];
  }

  async exists(path) { return this.objects.has(path); }

  async getText(path) {
    const object = this.objects.get(path);
    return object ? object.body.toString('utf8') : null;
  }

  async getJson(path) {
    const text = await this.getText(path);
    return text === null ? null : JSON.parse(text);
  }

  async put(path, body, meta) {
    this.objects.set(path, { body: Buffer.from(body), ...meta });
    this.log.push(`put ${path}`);
  }

  async list(path) { return [...this.objects.keys()].filter((k) => k.startsWith(path)).sort(); }

  async listFolders(path) {
    const names = new Set();
    for (const key of this.objects.keys()) {
      if (!key.startsWith(path)) continue;
      const rest = key.slice(path.length);
      if (rest.includes('/')) names.add(rest.slice(0, rest.indexOf('/')));
    }
    return [...names].sort();
  }

  async delete(paths) {
    for (const path of paths) {
      this.objects.delete(path);
      this.log.push(`delete ${path}`);
    }
  }
}
