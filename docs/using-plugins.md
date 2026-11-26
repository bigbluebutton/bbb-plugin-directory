# Using official plugins

Every version of an official plugin is built by the directory from a public
commit and published at a fixed address. BigBlueButton loads a plugin from the
URL of its `manifest.json`, set in `pluginManifests` (globally in
`/etc/bigbluebutton/bbb-web.properties`, or per meeting in the `/create`
call). The showcase lists the URLs of every plugin, ready to copy.

## Three ways to point to a plugin

| URL | What you get | Use it when |
|---|---|---|
| `<directory>/<plugin>/<version>/manifest.json` | Exactly that version, forever. | You review versions before using them. Add the `checksum`. |
| `<directory>/bbb/%%BBB_MAIN_VERSION%%/<plugin>/manifest.json` | The newest version compatible with your BigBlueButton version (`4.0`, `3.0`...). | You want updates without editing the configuration. **Preferred.** |
| `<directory>/sdk/%%HTML5_PLUGIN_SDK_MAIN_VERSION%%/<plugin>/manifest.json` | The newest version compatible with your plugin SDK line (`1`, `0.0`...). | Same, keyed on the SDK. |

`bbb-web` replaces the `%%...%%` placeholders for each meeting, so the same
line works across upgrades.

### Pinning a version with its sha256

```properties
pluginManifests=[{"url":"<directory>/pick-random-user/0.1.4/manifest.json","checksum":"<manifestSha256 from the catalog>"}]
```

`bbb-web` downloads the manifest, compares its sha256 with `checksum` and
refuses the plugin when they differ (the reason is recorded and the plugin does
not load). The manifest names the bundle with a relative path, so a pinned
manifest always loads the bundle published next to it.

Stable URLs (`bbb/...` and `sdk/...`) carry no checksum: by choosing one you
accept that the version behind it changes.

### What "compatible" means for a stable URL

A stable URL only moves to a new version when that version loads on **every**
release of the line still supported by the directory, from the line's
`minSupported` release on (`data/bbb-sdk-versions.json`). A server that has not
upgraded inside its line keeps a working plugin behind the same URL. Stable URLs
only move forward: an older version published later (a backport) never replaces
a newer one. Pre-release versions (`1.0.0-beta.1`) are only published at their
own fixed URL.

When the version behind a stable URL changes, `bbb-web` sees it on its next
manifest refresh (`pluginManifestCacheRefreshIntervalMinutes`, 60 by default).

## Checking what you run

Next to each version's files the directory publishes:

- `contract.json`: the repository and the exact commit it was built from, the
  tag, the sha256 of the manifest, of the bundle and of every other file, and
  the build that produced them.
- `SHA256SUMS`: the same hashes in the `sha256sum -c` format.

```bash
base=<directory>/pick-random-user/0.1.4
curl -s "$base/contract.json"
curl -s "$base/manifest.json" | sha256sum      # equals manifestSha256
```

## The catalog

`<directory>/catalog.json` lists every plugin, every published version with its
sha256 and security status, and what each stable URL serves. Its format is in
[`schemas/catalog.schema.json`](../schemas/catalog.schema.json). Integrations
that offer plugins per meeting (an LMS, for instance) can read it.

## Vulnerable versions

A version found vulnerable stays at its address (like a package registry); the
catalog and the showcase mark it as vulnerable and say which version fixes it.
Upgrade by moving your configuration to the fixed version, or use a stable URL.

## Loading the bundle from the directory

The manifest is fetched by `bbb-web` on the server. The browser loads the
bundle and the translations straight from the directory's storage, which serves
them with CORS (`Access-Control-Allow-Origin` for `GET`). The directory does
not set `javascriptEntrypointIntegrity` yet: the client loader does not set
`crossorigin` on the script tag, so the browser would block a bundle from
another origin that carries an integrity value. Until that changes, the
manifest `checksum`, HTTPS and immutable version folders are what protect the
bundle. If you need the browser to verify the bundle today, serve a copy of the
version from your BigBlueButton server's own origin.
