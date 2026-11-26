// Minimal GitHub REST client for the bots (no dependency, plain fetch).

export class GitHub {
  constructor({ token, apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com' }) {
    if (!token) throw new Error('A GitHub token is required');
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/+$/, '');
  }

  async request(method, path, body) {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text}`);
    return text ? JSON.parse(text) : {};
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  patch(path, body) { return this.request('PATCH', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }

  async paginate(path) {
    const items = [];
    for (let page = 1; ; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = await this.get(`${path}${separator}per_page=100&page=${page}`);
      if (!batch?.length) break;
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  }

  /** Decoded text of a file at a ref, or null when it does not exist. */
  async fileText(repo, path, ref) {
    const data = await this.get(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
    if (!data || data.type !== 'file') return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
}

/** Parses JSON, returning the Error instead of throwing (so it can be reported). */
export function parseJsonOrError(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return error;
  }
}
