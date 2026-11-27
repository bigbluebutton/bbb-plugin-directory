// Static showcase for GitHub Pages, generated at build time from catalog.json:
// no CORS needed, it stays up when the object storage is down, and every
// plugin gets its own indexable page. Search runs over data embedded in the
// page, never over a request to the object storage.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const STATUS_LABEL = { production: 'Official', discontinued: 'Discontinued (no security fixes)', archived: 'Archived' };

const STYLE = `
:root { color-scheme: light dark; --accent: #1b6ec2; --muted: #6b7280; --border: #d0d7de; --warn: #b42318; }
* { box-sizing: border-box; }
body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; }
header, main, footer { max-width: 1040px; margin: 0 auto; padding: 1rem 1.25rem; }
header { border-bottom: 1px solid var(--border); }
header a { color: inherit; text-decoration: none; }
h1 { margin: .2rem 0; font-size: 1.6rem; }
.muted { color: var(--muted); }
input[type=search] { width: 100%; padding: .6rem .8rem; font-size: 1rem; border: 1px solid var(--border); border-radius: 6px; margin: 1rem 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; list-style: none; padding: 0; }
.card { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
.card h2 { margin: 0 0 .3rem; font-size: 1.15rem; }
.badge { display: inline-block; font-size: .75rem; padding: .05rem .5rem; border-radius: 999px; border: 1px solid var(--border); margin-right: .3rem; }
.badge.warn { color: var(--warn); border-color: var(--warn); }
table { border-collapse: collapse; width: 100%; font-size: .9rem; }
th, td { border-bottom: 1px solid var(--border); text-align: left; padding: .4rem; vertical-align: top; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85rem; }
pre { background: rgba(127,127,127,.12); padding: .7rem; border-radius: 6px; overflow-x: auto; }
.hash { word-break: break-all; }
a { color: var(--accent); }
`;

function page({ title, body, rootPath }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${rootPath}style.css">
</head>
<body>
<header><a href="${rootPath}index.html"><h1>BigBlueButton Plugin Directory</h1></a>
<div class="muted">Official plugins, built and published by the directory CI, with the sha256 of every file.</div></header>
<main>
${body}
</main>
<footer class="muted">Generated from <a href="${rootPath}catalog.json">catalog.json</a>.</footer>
</body>
</html>
`;
}

function card(plugin) {
  const latest = plugin.versions[0];
  const badges = [`<span class="badge">${escapeHtml(STATUS_LABEL[plugin.status] ?? plugin.status)}</span>`];
  if (latest) badges.push(`<span class="badge">v${escapeHtml(latest.version)}</span>`);
  for (const route of plugin.perBbbVersion) badges.push(`<span class="badge">BBB ${escapeHtml(route.bbb)}</span>`);
  return `<li class="card" data-search="${escapeHtml(`${plugin.id} ${plugin.name} ${plugin.description}`.toLowerCase())}">
<h2><a href="plugins/${escapeHtml(plugin.id)}.html">${escapeHtml(plugin.id)}</a></h2>
<div>${badges.join('')}</div>
<p>${escapeHtml(plugin.description)}</p>
</li>`;
}

function indexPage(catalog) {
  const listed = catalog.plugins.filter((p) => p.status !== 'archived');
  const body = `<input type="search" id="search" placeholder="Search plugins" aria-label="Search plugins">
<p class="muted" id="count">${listed.length} plugin(s)</p>
<ul class="cards" id="plugins">
${listed.map(card).join('\n')}
</ul>
<script>
const input = document.getElementById('search');
const cards = [...document.querySelectorAll('#plugins .card')];
const count = document.getElementById('count');
input.addEventListener('input', () => {
  const terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
  let shown = 0;
  for (const card of cards) {
    const match = terms.every((t) => card.dataset.search.includes(t));
    card.hidden = !match;
    if (match) shown++;
  }
  count.textContent = shown + ' plugin(s)';
});
</script>`;
  return page({ title: 'BigBlueButton Plugin Directory', body, rootPath: '' });
}

const configSnippet = (entries) => `pluginManifests=${JSON.stringify(entries)}`;

function pluginPage(plugin, catalog) {
  const latest = plugin.versions[0];
  const vulnerable = plugin.versions.filter((v) => v.security.vulnerable);
  const stableRows = [
    ...plugin.perBbbVersion.map((r) => ({ label: `BigBlueButton ${r.bbb}`, ...r })),
    ...plugin.perSdkLine.map((r) => ({ label: `Plugin SDK line ${r.sdk}`, ...r })),
  ];
  const sections = [
    `<h2>${escapeHtml(plugin.id)} <span class="badge">${escapeHtml(STATUS_LABEL[plugin.status] ?? plugin.status)}</span></h2>`,
    `<p>${escapeHtml(plugin.description)}</p>`,
    `<p>Manifest name <code>${escapeHtml(plugin.name)}</code> · Source <a href="${escapeHtml(plugin.repository)}">${escapeHtml(plugin.repository)}</a> · Maintainers ${plugin.maintainers.map((m) => `<a href="https://github.com/${escapeHtml(m)}">@${escapeHtml(m)}</a>`).join(', ')}</p>`,
  ];
  if (vulnerable.length) {
    sections.push(`<p class="badge warn">Vulnerable versions: ${vulnerable.map((v) => `${escapeHtml(v.version)}${v.security.fixedIn ? ` (fixed in ${escapeHtml(v.security.fixedIn)})` : ''}`).join(', ')}</p>`);
  }
  if (plugin.status === 'production' && stableRows.length) {
    const preferred = plugin.perBbbVersion.length
      ? `${catalog.baseUrl.replace(/\/+$/, '')}/bbb/%%BBB_MAIN_VERSION%%/${plugin.id}/manifest.json`
      : `${catalog.baseUrl.replace(/\/+$/, '')}/sdk/%%HTML5_PLUGIN_SDK_MAIN_VERSION%%/${plugin.id}/manifest.json`;
    sections.push(`<h3>Install: follow your BigBlueButton version</h3>
<p>In <code>/etc/bigbluebutton/bbb-web.properties</code> (or the <code>pluginManifests</code> parameter of <code>/create</code>). The server fills in the placeholder; the URL keeps serving the newest version compatible with your server.</p>
<pre>${escapeHtml(configSnippet([{ url: preferred }]))}</pre>`);
  }
  if (latest && plugin.status !== 'archived') {
    sections.push(`<h3>Install: pin the reviewed version</h3>
<p>The server refuses the manifest if its sha256 differs from <code>checksum</code>.</p>
<pre>${escapeHtml(configSnippet([{ url: latest.manifestUrl, checksum: latest.manifestSha256 }]))}</pre>`);
  }
  if (stableRows.length) {
    sections.push(`<h3>Stable URLs</h3>
<table><thead><tr><th>Follows</th><th>Serves</th><th>Manifest URL</th></tr></thead><tbody>
${stableRows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.version)}</td><td><code>${escapeHtml(r.manifestUrl)}</code></td></tr>`).join('\n')}
</tbody></table>`);
  }
  sections.push(`<h3>Versions</h3>
<table><thead><tr><th>Version</th><th>Requires SDK</th><th>Source</th><th>sha256</th><th>Status</th></tr></thead><tbody>
${plugin.versions.map((v) => `<tr>
<td><a href="${escapeHtml(v.manifestUrl)}">${escapeHtml(v.version)}</a></td>
<td><code>${escapeHtml(v.requiredSdkVersion)}</code></td>
<td><a href="${escapeHtml(plugin.repository)}/tree/${escapeHtml(v.commit)}">${escapeHtml(v.tag)}</a> <code>${escapeHtml(v.commit.slice(0, 12))}</code><br><a href="${escapeHtml(v.contractUrl)}">contract</a></td>
<td class="hash">manifest <code>${escapeHtml(v.manifestSha256)}</code><br>bundle <code>${escapeHtml(v.bundleSha256)}</code></td>
<td>${v.security.vulnerable ? `<span class="badge warn">vulnerable</span>${v.security.fixedIn ? ` fixed in ${escapeHtml(v.security.fixedIn)}` : ''}` : 'ok'}</td>
</tr>`).join('\n') || '<tr><td colspan="5">No version published yet.</td></tr>'}
</tbody></table>`);
  return page({ title: `${plugin.id} - BigBlueButton Plugin Directory`, body: sections.join('\n'), rootPath: '../' });
}

/** Writes the site into `outDir`. */
export function buildShowcase(catalog, outDir) {
  mkdirSync(join(outDir, 'plugins'), { recursive: true });
  writeFileSync(join(outDir, 'style.css'), STYLE.trimStart());
  writeFileSync(join(outDir, 'index.html'), indexPage(catalog));
  writeFileSync(join(outDir, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(join(outDir, '.nojekyll'), '');
  for (const plugin of catalog.plugins) writeFileSync(join(outDir, 'plugins', `${plugin.id}.html`), pluginPage(plugin, catalog));
}

export { escapeHtml };
